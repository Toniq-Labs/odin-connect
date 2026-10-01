import { OdinApiClient, Pagination, Sort } from "./api";
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
} from "@dfinity/identity";
import { ConnectedUser } from "./connected-user";
import { Environment, ORIGINS } from "../models/environment";
import { WindowClient, WindowClientSettings } from "./window";
import { OdinCanisterClient } from "./canister";
import { SessionStorage } from "./storage";
import { isDelegationValid } from "../utils/session";
import { OdinLang } from "../models/lang";
import { DEFAULT_LANG, normalizeOdinLang } from "../utils/lang";
import {
  ConnectMode,
  createRequestId,
  PendingRedirectStorage,
  RedirectCallOptions,
  RedirectClient,
  toBase64Url,
} from "./redirect";
import { PROTOCOL_VERSION } from "../constants";
import {
  checkDelegationChain,
  checkProof,
  ConnectResult,
  ConnectVerificationError,
} from "./verify-connect";

export interface AppInitOptions {
  name: string;
  icon?: string;
  env?: Environment;
  slug?: string;
  lang?: OdinLang;
  /**
   * How `connect()` and every action reach Odin: `"popup"` (default),
   * `"redirect"` or `"auto"`. See `ConnectMode`.
   */
  mode?: ConnectMode;
}

/** Authorize actions that can come back through `handleRedirectResult()`. */
export type OdinAction =
  | "buy"
  | "sell"
  | "transfer"
  | "swap"
  | "add_liquidity"
  | "remove_liquidity"
  | "icrc_approve"
  | "create_token";

/**
 * Extra data Odin returns with an action result. `icrc_approve` (redirect
 * mode) carries `block_index` (decimal string) and `memo` (hex of
 * sha256(request_id)); other actions carry nothing today.
 */
export type OdinActionDetail = {
  block_index?: string;
  memo?: string;
  [key: string]: unknown;
};

/**
 * What `handleRedirectResult()` found in the URL after a redirect.
 * `returnState` is whatever was passed as `returnState` to the call that
 * redirected (undefined if none). `"unverified"` means Odin's answer could
 * not be verified (forged, tampered or the API refused it); the user is not
 * connected and nothing was stored.
 */
export type OdinRedirectResult<ReturnState = unknown> = (
  | { action: "connect"; status: "connected"; user: ConnectedUser }
  | { action: "connect"; status: "rejected" }
  | { action: "connect"; status: "unverified"; error: string }
  | {
      action: OdinAction;
      status: "success" | "failed";
      detail?: OdinActionDetail;
    }
) & { returnState: ReturnState | undefined };

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36).slice(0, 3).padStart(3, "0");
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${hashCode(text)}`;
}

interface BaseConnectOptions extends RedirectCallOptions {
  // options for window.open
  open?: WindowClientSettings;
  // whether to request an auth keys upon connection
  requires_api?: boolean;
}

interface ConnectOptionsWithDelegation extends BaseConnectOptions {
  // whether to request an auth keys upon connection
  requires_delegation: true;
  targets: string[];
}

interface ConnectOptionsWithoutDelegation extends BaseConnectOptions {
  requires_delegation?: false;
  targets?: never;
  session_key?: never;
}

type ConnectOptions =
  ConnectOptionsWithDelegation | ConnectOptionsWithoutDelegation;

interface GetResourcesOptions {
  pagination: Pagination;
  sort?: Sort;
}

interface GetUserActivityOptions extends GetResourcesOptions {
  principal: string;
}

export class Connect {
  private _appInfo: AppInitOptions | null = null;
  private _api: OdinApiClient;
  private _window: WindowClient;
  private _odin: OdinCanisterClient;
  private _storage: SessionStorage;
  private _redirect: RedirectClient;

  constructor(appInfo?: Partial<AppInitOptions>) {
    this._appInfo = {
      env: "prod",
      name: "app_name",
      ...appInfo,
    };
    this._appInfo.slug = this._appInfo.slug || slugify(this._appInfo.name);
    this._appInfo.lang = normalizeOdinLang(this._appInfo.lang);
    this._api = new OdinApiClient(
      this._appInfo.env === "prod"
        ? "prod"
        : this._appInfo.env === "legacy"
          ? "legacy"
          : "dev"
    );
    this._window = new WindowClient();
    this._redirect = new RedirectClient(
      this._window,
      new PendingRedirectStorage(
        this._appInfo.slug!,
        this._appInfo.env || "prod"
      )
    );
    this._redirect.mode = this._appInfo.mode || "popup";
    this._odin = new OdinCanisterClient(
      this._window,
      this._api,
      this._appInfo,
      ORIGINS[this._appInfo.env || "prod"],
      this._redirect
    );
    this._storage = new SessionStorage(
      this._appInfo.slug!,
      this._appInfo.env || "prod"
    );
  }

  private createUrl(path: string, requestId: string = createRequestId()) {
    const url = new URL(`${this.origin}/${path}`);
    url.searchParams.append("v", PROTOCOL_VERSION);
    url.searchParams.append("request_id", requestId);
    if (this._appInfo?.name) {
      url.searchParams.append("app_name", this._appInfo.name);
    }
    url.searchParams.append("referrer", window.location.origin);
    url.searchParams.append("lang", this.lang);
    return url;
  }

  get origin() {
    return ORIGINS[this._appInfo?.env || "prod"];
  }

  get lang(): OdinLang {
    return this._appInfo?.lang || DEFAULT_LANG;
  }

  set lang(value: OdinLang) {
    if (this._appInfo) {
      this._appInfo.lang = normalizeOdinLang(value);
    }
  }

  /** Current mode for `connect()` and actions; can be changed at runtime. */
  get mode(): ConnectMode {
    return this._redirect.mode;
  }

  set mode(value: ConnectMode) {
    this._redirect.mode = value;
    if (this._appInfo) {
      this._appInfo.mode = value;
    }
  }

  get appInfo() {
    return this._appInfo;
  }

  get slug() {
    return this._appInfo?.slug || "";
  }

  connect(
    {
      open,
      requires_api,
      requires_delegation,
      targets,
      returnState,
    }: ConnectOptions | undefined = {
      requires_delegation: false,
      requires_api: false,
    }
  ): Promise<ConnectedUser> {
    if (this._redirect.useRedirect) {
      return this.connectByRedirect({
        requires_api,
        requires_delegation,
        targets,
        returnState,
      });
    }
    return new Promise<ConnectedUser>((resolve, reject) => {
      if (open) {
        this._window.settings = open;
      }
      const sessionKey = Ed25519KeyIdentity.generate();
      const requestId = createRequestId();
      const handleMessage = async (event: MessageEvent) => {
        if (
          event.origin === this.origin &&
          event.data?.path === "/authorize/connect"
        ) {
          window.removeEventListener("message", handleMessage);
          if (event.data.message != "rejected") {
            // the user accepted the connection: verify before trusting it
            try {
              resolve(
                await this.completeConnection(
                  event.data.message as ConnectResult,
                  sessionKey,
                  { requestId, requires_api, requires_delegation, targets }
                )
              );
            } catch (error) {
              reject(
                error instanceof Error
                  ? error
                  : new ConnectVerificationError(String(error))
              );
            }
          } else {
            reject(new Error("User rejected the connection"));
          }
        }
      };
      const url = this.createConnectUrl(sessionKey, requestId, {
        requires_api,
        requires_delegation,
        targets,
      });
      this._window.open(url);

      window.addEventListener("message", handleMessage);
    });
  }

  private createConnectUrl(
    sessionKey: Ed25519KeyIdentity,
    requestId: string,
    {
      requires_api,
      requires_delegation,
      targets,
    }: Pick<ConnectOptions, "requires_api" | "requires_delegation" | "targets">
  ) {
    const url = this.createUrl("authorize/connect", requestId);
    url.searchParams.append("requires_api", requires_api ? "1" : "0");
    if (requires_delegation) {
      url.searchParams.append("requires_delegation", "1");
      // Only the public key: the secret never leaves this SDK.
      url.searchParams.append(
        "session_pubkey",
        toBase64Url(new Uint8Array(sessionKey.getPublicKey().toDer()))
      );
      url.searchParams.append("targets", targets?.join(",") || "");
    }
    return url;
  }

  private connectByRedirect(
    options: Pick<
      ConnectOptions,
      "requires_api" | "requires_delegation" | "targets" | "returnState"
    >
  ): Promise<ConnectedUser> {
    const sessionKey = Ed25519KeyIdentity.generate();
    const requestId = createRequestId();
    return this._redirect.start<ConnectedUser>(
      this.createConnectUrl(sessionKey, requestId, options),
      {
        path: "/authorize/connect",
        // The secret waits in this tab's sessionStorage; Odin only ever
        // sees session_pubkey.
        sessionKey: JSON.stringify(sessionKey.toJSON()),
        requires_delegation: Boolean(options.requires_delegation),
        requires_api: Boolean(options.requires_api),
        targets: options.targets,
        returnState: options.returnState,
      },
      requestId
    );
  }

  /**
   * Read the result of a redirect-mode `connect()` or action after Odin sends
   * the user back. Call once on page load, before `restoreSession()`.
   * Resolves null when the URL carries no redirect result; rejects when the
   * result does not match the pending request (stale, foreign or replayed).
   *
   * A connect result is verified (locally and with odin-api) before it is
   * reported as `"connected"` and persisted like a popup connect; when that
   * fails the status is `"unverified"` and nothing is stored.
   */
  async handleRedirectResult<
    ReturnState = unknown,
  >(): Promise<OdinRedirectResult<ReturnState> | null> {
    const consumed = this._redirect.consume();
    if (!consumed) return null;
    const { result, pending } = consumed;
    const returnState = pending.returnState as ReturnState | undefined;
    const action = pending.path.replace(/^\/authorize\//, "");
    if (action === "connect") {
      if (result.message === "rejected" || !pending.sessionKey) {
        return { action: "connect", status: "rejected", returnState };
      }
      try {
        const user = await this.completeConnection(
          result.message as ConnectResult,
          Ed25519KeyIdentity.fromJSON(pending.sessionKey),
          {
            requestId: pending.state,
            requires_api: pending.requires_api,
            requires_delegation: pending.requires_delegation,
            targets: pending.targets,
          }
        );
        return { action: "connect", status: "connected", user, returnState };
      } catch (error) {
        return {
          action: "connect",
          status: "unverified",
          error: error instanceof Error ? error.message : String(error),
          returnState,
        };
      }
    }
    const detail =
      result.detail !== null &&
      typeof result.detail === "object" &&
      !Array.isArray(result.detail)
        ? (result.detail as OdinActionDetail)
        : undefined;
    return {
      action: action as OdinAction,
      status:
        pending.successMessage !== undefined &&
        result.message === pending.successMessage
          ? "success"
          : "failed",
      ...(detail ? { detail } : {}),
      returnState,
    };
  }

  /**
   * Verify a connect result and only then build, persist and return the
   * user. Throws a `ConnectVerificationError` (or the API's error) on any
   * mismatch; nothing is stored and no API key is set in that case.
   */
  private async completeConnection(
    message: ConnectResult,
    sessionKey: Ed25519KeyIdentity,
    {
      requestId,
      requires_api,
      requires_delegation,
      targets,
    }: {
      requestId: string;
      requires_api?: boolean;
      requires_delegation?: boolean;
      targets?: readonly string[];
    }
  ): Promise<ConnectedUser> {
    if (!message || typeof message.principal !== "string") {
      throw new ConnectVerificationError("the result has no principal");
    }
    const { principal, proof } = message;
    const audience = window.location.origin;
    checkProof(proof, {
      principal,
      nonce: requestId,
      audience,
      requires_api: Boolean(requires_api),
    });

    let chain: DelegationChain | null = null;
    if (requires_delegation) {
      chain = checkDelegationChain(message.delegationChain, {
        principal,
        sessionPublicKey: new Uint8Array(sessionKey.getPublicKey().toDer()),
        targets: targets ?? [],
      });
    }

    let verified;
    try {
      verified = await this._api.verifyConnect({
        payload: proof!.payload,
        signature: proof!.signature,
        delegation: proof!.delegation ?? null,
        publicKey: proof!.publicKey ?? null,
        audience,
        nonce: requestId,
        issue_jwt: Boolean(requires_api),
      });
    } catch (error) {
      throw new ConnectVerificationError(
        `odin-api refused the proof (${
          error instanceof Error ? error.message : String(error)
        })`
      );
    }
    if (verified?.principal !== principal) {
      throw new ConnectVerificationError(
        "odin-api verified a different principal"
      );
    }
    // The JWT only ever comes from odin-api, never from the Odin page.
    const jwt =
      requires_api && typeof verified.jwt === "string" ? verified.jwt : null;

    const identity = chain
      ? DelegationIdentity.fromDelegation(sessionKey, chain)
      : null;
    if (requires_api) {
      this._api.apiKey = jwt;
    }
    if (requires_api || requires_delegation) {
      this._storage.save({
        principal,
        sessionKey: JSON.stringify(sessionKey.toJSON()),
        delegationChain: chain ? JSON.stringify(chain.toJSON()) : null,
        jwt,
      });
    }
    return new ConnectedUser(principal, identity, this.api, this._odin);
  }

  get api() {
    return this._api;
  }

  get odin() {
    return this._odin;
  }

  get currentEnv() {
    return this._appInfo?.env || "prod";
  }

  /**
   * Rehydrate the stored session. Does not read redirect results: call
   * `await handleRedirectResult()` first on page load (since 2.0.0).
   */
  restoreSession(): ConnectedUser | null {
    try {
      const data = this._storage.load();
      if (!data) return null;

      if (data.delegationChain) {
        if (!isDelegationValid(data.delegationChain)) {
          this._storage.clear();
          return null;
        }
      }

      if (data.jwt) {
        this._api.apiKey = data.jwt;
      }

      let identity: DelegationIdentity | null = null;
      if (data.delegationChain && data.sessionKey) {
        const sessionKey = Ed25519KeyIdentity.fromJSON(data.sessionKey);
        const chain = DelegationChain.fromJSON(
          JSON.parse(data.delegationChain)
        );
        identity = DelegationIdentity.fromDelegation(sessionKey, chain);
      }

      return new ConnectedUser(data.principal, identity, this._api, this._odin);
    } catch {
      this._storage.clear();
      return null;
    }
  }

  disconnect(): void {
    this._storage.clear();
    this._api.apiKey = null;
  }

  isSessionValid(): boolean {
    const data = this._storage.load();
    if (!data) return false;
    if (data.delegationChain) {
      return isDelegationValid(data.delegationChain);
    }
    return true;
  }

  hello() {
    console.log("Hello from Odin Connect!");
  }
}
