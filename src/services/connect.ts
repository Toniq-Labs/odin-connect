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
  readFragmentValue,
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
  signClientBinding,
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

/** A connect result that passed every check, before it is bound to an instance. */
interface VerifiedConnection {
  principal: string;
  chain: DelegationChain | null;
  identity: DelegationIdentity | null;
  /** Only set when `requires_api` was requested; always from odin-api. */
  jwt: string | null;
}

/** What one read of a redirect result produced, shared by every caller. */
type RedirectOutcome =
  | { connected: VerifiedConnection; returnState: unknown }
  | { result: OdinRedirectResult };

/**
 * Redirect results read on this page load, per `slug:env`. Reading one
 * consumes the URL fragment and the pending request, so a second
 * `handleRedirectResult()` (React StrictMode runs effects twice, often on a
 * new `OdinConnect`) would otherwise get null. Only the outcome is kept, never
 * the pending request, and only for `REDIRECT_RESULT_REUSE_MS` after it
 * settles (or until `disconnect()`).
 */
const redirectOutcomes = new Map<
  string,
  { fragment: string; promise: Promise<RedirectOutcome> }
>();

const REDIRECT_RESULT_REUSE_MS = 10_000;

/** Test helper: forget redirect results read so far. Not exported publicly. */
export function resetRedirectOutcomes(): void {
  redirectOutcomes.clear();
}

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36).slice(0, 3).padStart(3, "0");
}

/** `session_pubkey` param: base64url (no padding) of the public key DER. */
function sessionPubkeyParam(sessionKey: Ed25519KeyIdentity): string {
  return toBase64Url(new Uint8Array(sessionKey.getPublicKey().toDer()));
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

interface ConnectionOptions {
  requestId: string;
  requires_api?: boolean;
  requires_delegation?: boolean;
  targets?: readonly string[];
}

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
    // Sent for every connect: Odin binds the identity proof to this key (`sk`)
    // and odin-api only redeems it with a signature from it. Only the public
    // key: the secret never leaves this SDK.
    url.searchParams.append("session_pubkey", sessionPubkeyParam(sessionKey));
    if (requires_delegation) {
      url.searchParams.append("requires_delegation", "1");
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
        // Every connect (with or without delegation): the secret waits in
        // this tab's sessionStorage; Odin only ever sees session_pubkey.
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
   * the user back. Call on page load, before `restoreSession()`.
   * Resolves null when the URL carries no redirect result; rejects when the
   * result does not match the pending request (stale, foreign or replayed).
   *
   * A connect result is verified (locally and with odin-api) before it is
   * reported as `"connected"` and persisted like a popup connect; when that
   * fails the status is `"unverified"` and nothing is stored.
   *
   * Safe to call more than once per page load (e.g. React StrictMode effects,
   * even on another `OdinConnect` with the same slug and env): every call made
   * while the result is being read, or shortly after, gets the same outcome,
   * and odin-api is asked once.
   */
  async handleRedirectResult<
    ReturnState = unknown,
  >(): Promise<OdinRedirectResult<ReturnState> | null> {
    const cacheKey = this.redirectCacheKey;
    const fragment = readFragmentValue();
    let entry = redirectOutcomes.get(cacheKey);
    if (fragment !== null && entry?.fragment !== fragment) {
      const created = { fragment, promise: this.readRedirectResult() };
      redirectOutcomes.set(cacheKey, created);
      const evict = () => {
        setTimeout(() => {
          if (redirectOutcomes.get(cacheKey) === created) {
            redirectOutcomes.delete(cacheKey);
          }
        }, REDIRECT_RESULT_REUSE_MS);
      };
      created.promise.then(evict, evict);
      entry = created;
    }
    if (!entry) {
      // no result in the URL: this only drops an abandoned pending request
      this._redirect.consume();
      return null;
    }
    const outcome = await entry.promise;
    if ("result" in outcome) {
      return outcome.result as OdinRedirectResult<ReturnState>;
    }
    // Bind the shared connection to this instance (its own API key).
    const { principal, identity, jwt } = outcome.connected;
    this._api.apiKey = jwt;
    return {
      action: "connect",
      status: "connected",
      user: new ConnectedUser(principal, identity, this._api, this._odin),
      returnState: outcome.returnState as ReturnState | undefined,
    };
  }

  private get redirectCacheKey(): string {
    return `${this.slug}:${this.currentEnv}`;
  }

  /** Consume the URL's result once and verify/persist a connect result. */
  private async readRedirectResult(): Promise<RedirectOutcome> {
    const consumed = this._redirect.consume();
    if (!consumed) {
      throw new Error("Unexpected OdinConnect redirect result");
    }
    const { result, pending } = consumed;
    const returnState = pending.returnState;
    const action = pending.path.replace(/^\/authorize\//, "");
    if (action === "connect") {
      if (result.message === "rejected") {
        return {
          result: { action: "connect", status: "rejected", returnState },
        };
      }
      if (!pending.sessionKey) {
        // every connect saves its key; without it the proof can't be redeemed
        return {
          result: {
            action: "connect",
            status: "unverified",
            error: new ConnectVerificationError(
              "the pending request has no session key"
            ).message,
            returnState,
          },
        };
      }
      const sessionKey = Ed25519KeyIdentity.fromJSON(pending.sessionKey);
      const options = {
        requestId: pending.state,
        requires_api: pending.requires_api,
        requires_delegation: pending.requires_delegation,
        targets: pending.targets,
      };
      try {
        const connected = await this.verifyConnection(
          result.message as ConnectResult,
          sessionKey,
          options
        );
        this.persistConnection(connected, sessionKey, options);
        return { connected, returnState };
      } catch (error) {
        return {
          result: {
            action: "connect",
            status: "unverified",
            error: error instanceof Error ? error.message : String(error),
            returnState,
          },
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
      result: {
        action: action as OdinAction,
        status:
          pending.successMessage !== undefined &&
          result.message === pending.successMessage
            ? "success"
            : "failed",
        ...(detail ? { detail } : {}),
        returnState,
      },
    };
  }

  /**
   * Verify a connect result and only then persist and return the user.
   * Throws a `ConnectVerificationError` (or the API's error) on any mismatch;
   * nothing is stored and no API key is set in that case.
   */
  private async completeConnection(
    message: ConnectResult,
    sessionKey: Ed25519KeyIdentity,
    options: ConnectionOptions
  ): Promise<ConnectedUser> {
    const connected = await this.verifyConnection(message, sessionKey, options);
    this.persistConnection(connected, sessionKey, options);
    this._api.apiKey = connected.jwt;
    return new ConnectedUser(
      connected.principal,
      connected.identity,
      this.api,
      this._odin
    );
  }

  /** Every local and odin-api check; no side effects. */
  private async verifyConnection(
    message: ConnectResult,
    sessionKey: Ed25519KeyIdentity,
    { requestId, requires_api, requires_delegation, targets }: ConnectionOptions
  ): Promise<VerifiedConnection> {
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
      sessionPubkey: sessionPubkeyParam(sessionKey),
    });

    let chain: DelegationChain | null = null;
    if (requires_delegation) {
      chain = checkDelegationChain(message.delegationChain, {
        principal,
        sessionPublicKey: new Uint8Array(sessionKey.getPublicKey().toDer()),
        targets: targets ?? [],
      });
    }

    // Proves to odin-api that we hold the key the proof names (`sk`), over
    // the exact payload string received (never re-stringified).
    const client_signature = await signClientBinding(
      sessionKey,
      proof!.payload
    );

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
        client_signature,
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
    let jwt: string | null = null;
    if (requires_api) {
      if (typeof verified.jwt !== "string" || !verified.jwt) {
        throw new ConnectVerificationError("odin-api issued no API key");
      }
      jwt = verified.jwt;
    }

    return {
      principal,
      chain,
      identity: chain
        ? DelegationIdentity.fromDelegation(sessionKey, chain)
        : null,
      jwt,
    };
  }

  /**
   * Replace whatever session was stored before (another user's JWT or
   * delegation must not survive a re-connect), then store this one.
   */
  private persistConnection(
    { principal, chain, jwt }: VerifiedConnection,
    sessionKey: Ed25519KeyIdentity,
    { requires_api, requires_delegation }: ConnectionOptions
  ): void {
    this._storage.clear();
    this._api.apiKey = null;
    if (requires_api || requires_delegation) {
      this._storage.save({
        principal,
        sessionKey: JSON.stringify(sessionKey.toJSON()),
        delegationChain: chain ? JSON.stringify(chain.toJSON()) : null,
        jwt,
      });
    }
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
    redirectOutcomes.delete(this.redirectCacheKey);
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
