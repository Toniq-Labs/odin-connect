import { OdinApiClient, Pagination, Sort } from "./api";
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  JsonnableDelegationChain,
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
  PendingRedirectStorage,
  RedirectClient,
} from "./redirect";

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

/** What `handleRedirectResult()` found in the URL after a redirect. */
export type OdinRedirectResult =
  | { action: "connect"; status: "connected"; user: ConnectedUser }
  | { action: "connect"; status: "rejected" }
  | { action: OdinAction; status: "success" | "failed" };

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

interface BaseConnectOptions {
  // options for window.open
  open?: WindowClientSettings;
  // whether to request an auth keys upon connection
  requires_api?: boolean;
}

interface ConnectResult {
  principal: string;
  jwt: string | null;
  delegationChain?: JsonnableDelegationChain | null;
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

  private createUrl(path: string) {
    const url = new URL(`${this.origin}/${path}`);
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
      });
    }
    return new Promise<ConnectedUser>((resolve, reject) => {
      if (open) {
        this._window.settings = open;
      }
      const sessionKey = Ed25519KeyIdentity.generate();
      const handleMessage = async (event: MessageEvent) => {
        if (
          event.origin === this.origin &&
          event.data.path === "/authorize/connect"
        ) {
          window.removeEventListener("message", handleMessage);
          if (event.data.message != "rejected") {
            // the user accepted the connection
            try {
              resolve(
                this.completeConnection(
                  event.data.message as ConnectResult,
                  sessionKey,
                  { requires_api, requires_delegation }
                )
              );
            } catch (error) {
              reject(new Error("Failed to fetch user data"));
            }
          } else {
            reject(new Error("User rejected the connection"));
          }
        }
      };
      const url = this.createConnectUrl(sessionKey, {
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
    {
      requires_api,
      requires_delegation,
      targets,
    }: Pick<ConnectOptions, "requires_api" | "requires_delegation" | "targets">
  ) {
    const url = this.createUrl("authorize/connect");
    url.searchParams.append("requires_api", requires_api ? "1" : "0");
    if (requires_delegation) {
      url.searchParams.append("requires_delegation", "1");
      const sessionString = btoa(JSON.stringify(sessionKey.toJSON()));
      url.searchParams.append("session_key", sessionString);
      url.searchParams.append("targets", targets?.join(",") || "");
    }
    return url;
  }

  private connectByRedirect(
    options: Pick<
      ConnectOptions,
      "requires_api" | "requires_delegation" | "targets"
    >
  ): Promise<ConnectedUser> {
    if (options.requires_api) {
      return Promise.reject(
        new Error("requires_api is not supported in redirect mode")
      );
    }
    const sessionKey = Ed25519KeyIdentity.generate();
    return this._redirect.start<ConnectedUser>(
      this.createConnectUrl(sessionKey, options),
      {
        path: "/authorize/connect",
        sessionKey: JSON.stringify(sessionKey.toJSON()),
        requires_delegation: Boolean(options.requires_delegation),
      }
    );
  }

  /**
   * Read the result of a redirect-mode `connect()` or action after Odin sends
   * the user back. Call once on page load. Returns null when the URL carries
   * no redirect result; throws when the result does not match the pending
   * request (stale, foreign or replayed).
   *
   * A successful connect is also persisted like a popup connect, and
   * `restoreSession()` handles connect results itself, so call this first if
   * you need to tell "rejected" from "not connected" or read action results.
   */
  handleRedirectResult(): OdinRedirectResult | null {
    const consumed = this._redirect.consume();
    if (!consumed) return null;
    const { result, pending } = consumed;
    const action = pending.path.replace(/^\/authorize\//, "");
    if (action === "connect") {
      if (result.message === "rejected" || !pending.sessionKey) {
        return { action: "connect", status: "rejected" };
      }
      const user = this.completeConnection(
        result.message as ConnectResult,
        Ed25519KeyIdentity.fromJSON(pending.sessionKey),
        {
          requires_api: false,
          requires_delegation: pending.requires_delegation,
        }
      );
      return { action: "connect", status: "connected", user };
    }
    return {
      action: action as OdinAction,
      status:
        pending.successMessage !== undefined &&
        result.message === pending.successMessage
          ? "success"
          : "failed",
    };
  }

  private completeConnection(
    { principal, jwt: jwtToken, delegationChain }: ConnectResult,
    sessionKey: Ed25519KeyIdentity,
    {
      requires_api,
      requires_delegation,
    }: { requires_api?: boolean; requires_delegation?: boolean }
  ): ConnectedUser {
    let connectedUser: ConnectedUser;
    if (requires_api) {
      // issue a api key
      // only using JWT for now, it will change in the real implementation
      this._api.apiKey = jwtToken;
    }

    if (requires_delegation) {
      if (!delegationChain) {
        throw new Error("Delegation chain is missing");
      }
      const identity = DelegationIdentity.fromDelegation(
        sessionKey,
        DelegationChain.fromJSON(delegationChain)
      );
      connectedUser = new ConnectedUser(
        principal,
        identity,
        this.api,
        this._odin
      );
    } else {
      connectedUser = new ConnectedUser(principal, null, this.api, this._odin);
    }

    if (requires_api || requires_delegation) {
      this._storage.save({
        principal,
        sessionKey: JSON.stringify(sessionKey.toJSON()),
        delegationChain: delegationChain
          ? JSON.stringify(delegationChain)
          : null,
        jwt: jwtToken || null,
      });
    }

    return connectedUser;
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

  restoreSession(): ConnectedUser | null {
    // Finish a redirect-mode connect(). Action results are left in the URL
    // for the app's own handleRedirectResult() call.
    if (this._redirect.pendingPath() === "/authorize/connect") {
      try {
        const redirected = this.handleRedirectResult();
        if (
          redirected?.action === "connect" &&
          redirected.status === "connected"
        ) {
          return redirected.user;
        }
      } catch {
        // Mismatched redirect result: fall back to the stored session.
      }
    }
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
