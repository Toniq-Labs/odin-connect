import { OdinApiClient, Pagination, Sort } from "./api";
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
} from "@dfinity/identity";
import { ConnectedUser } from "./connected-user";
import { Environment, ORIGINS } from "../models/environment";
import { WindowClient, WindowClientSettings } from "./window";
import {
  ACTIONS,
  actionOutcome,
  OdinCanisterClient,
  NAVIGATED_BACK,
  POPUP_CLOSED,
  quiet,
  readRejectReason,
  watchPopupClosed,
} from "./canister";
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
import {
  INITIAL_ODIN_STATE,
  OdinAction,
  OdinRequestInput,
  OdinRequestState,
  OdinState,
  OdinStateListener,
  StateStore,
} from "./state";

export interface AppInitOptions {
  name: string;
  icon?: string;
  env?: Environment;
  slug?: string;
  lang?: OdinLang;
  /**
   * How `connect()` and every action reach Odin: `"auto"` (default:
   * redirect in wallet in-app browsers, popup elsewhere), `"popup"` or
   * `"redirect"`. See `ConnectMode`.
   */
  mode?: ConnectMode;
}

/** A connect result that passed every check, before it is bound to an instance. */
interface VerifiedConnection {
  principal: string;
  chain: DelegationChain | null;
  identity: DelegationIdentity | null;
  /** Only set when `requires_api` was requested; always from odin-api. */
  jwt: string | null;
}

/**
 * What one read of a redirect result produced, shared by every instance:
 * the settled request, plus the verified connection for a connect success.
 */
type RedirectOutcome = {
  request: OdinRequestState;
  connected?: VerifiedConnection;
};

/**
 * Redirect results read on this page load, per `slug:env`. Reading one
 * consumes the URL fragment and the pending request, so a second
 * `OdinConnect` (React StrictMode creates instances twice) would otherwise
 * find nothing. Every instance whose `ready()` starts while the result is
 * still being read (and verified) shares the same outcome, and odin-api is
 * asked once. Once it has settled, it was delivered: an instance created
 * later (e.g. one per route) gets `request: null` and the stored session.
 * The entry is kept for `REDIRECT_RESULT_REUSE_MS` after settling (or until
 * `disconnect()`) so the same fragment is never read twice; only the outcome
 * is kept, never the pending request.
 */
const redirectOutcomes = new Map<
  string,
  { fragment: string; promise: Promise<RedirectOutcome>; settled: boolean }
>();

const REDIRECT_RESULT_REUSE_MS = 10_000;

/**
 * `disconnect()` calls per `slug:env` on this page load. A redirect result
 * that was being read (verified) when `disconnect()` ran is neither stored
 * nor applied: `ready()` captures the count when it starts and checks it
 * before persisting or applying anything. Module-level because instances
 * share the session storage and the redirect outcome. (A popup connect is
 * dropped the same way because `disconnect()` clears `state.request`.)
 */
const disconnects = new Map<string, number>();

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
  /**
   * The state on a server and before `ready()` restored anything; the same
   * frozen object every time (`INITIAL_ODIN_STATE`).
   */
  static readonly serverState: OdinState = INITIAL_ODIN_STATE;

  private _appInfo: AppInitOptions | null = null;
  private _api: OdinApiClient;
  private _window: WindowClient;
  private _odin: OdinCanisterClient;
  private _storage: SessionStorage;
  private _redirect: RedirectClient;
  private _store = new StateStore();
  private _ready: Promise<void> | null = null;

  constructor(appInfo?: Partial<AppInitOptions>) {
    this._appInfo = {
      env: "prod",
      name: "app_name",
      ...appInfo,
    };
    this._appInfo.slug = this._appInfo.slug || slugify(this._appInfo.name);
    this._appInfo.lang = normalizeOdinLang(this._appInfo.lang);
    this._api = new OdinApiClient(this.apiEnv);
    this._window = new WindowClient();
    this._redirect = new RedirectClient(
      this._window,
      new PendingRedirectStorage(
        this._appInfo.slug!,
        this._appInfo.env || "prod"
      )
    );
    this._redirect.mode = this._appInfo.mode || "auto";
    this._odin = new OdinCanisterClient(
      this._window,
      this._api,
      this._appInfo,
      ORIGINS[this._appInfo.env || "prod"],
      this._redirect,
      this._store
    );
    this._storage = new SessionStorage(
      this._appInfo.slug!,
      this._appInfo.env || "prod"
    );
    // Restore the session and apply a redirect result now (non-blocking),
    // so `state` fills in without the app calling anything. Not on a server.
    if (typeof window !== "undefined") {
      void this.ready();
    }
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

  // ---- state ------------------------------------------------------------

  /**
   * Restore the stored session and, when this page load returned from a
   * redirect-mode `connect()` or action, consume and verify that result and
   * apply it as `state.request`. Resolves with the current state once that
   * is done. Idempotent: started by the constructor, every call shares the
   * same work (also across `OdinConnect` instances with the same slug and
   * env, e.g. React StrictMode), and it never rejects. A stale or foreign
   * result in the URL is dropped (`request: null`, fragment removed).
   *
   * Odin returns to the page path without its query string; the original
   * query is put back here, so read URL query state after `ready()`.
   *
   * On a server (no `window`) nothing is restored and the state stays
   * `"initializing"`.
   */
  ready(): Promise<OdinState> {
    if (typeof window === "undefined") {
      return Promise.resolve(this.state);
    }
    if (!this._ready) {
      this._ready = this.initialize();
    }
    return this._ready.then(() => this.state);
  }

  /** Current state snapshot; a new object after every change. */
  get state(): OdinState {
    return this._store.state;
  }

  /**
   * Same as `state`, as a bound function for
   * `useSyncExternalStore(odin.subscribe, odin.getState)`.
   */
  getState = (): OdinState => this._store.state;

  /**
   * `Connect.serverState`, as a bound function: the third argument of
   * `useSyncExternalStore(odin.subscribe, odin.getState, odin.getServerState)`
   * so hydration matches the server render ("initializing").
   */
  getServerState = (): OdinState => INITIAL_ODIN_STATE;

  /**
   * Call `listener` with the new state after every change (not on
   * subscribe: read `state` after `await ready()`). Returns the unsubscribe
   * function. Bound, so it can be passed around as is.
   */
  subscribe = (listener: OdinStateListener): (() => void) =>
    this._store.subscribe(listener);

  /** The connected user, or null (`state.user`). */
  get user(): ConnectedUser | null {
    return this._store.state.user;
  }

  /** Synchronous up to the redirect read, so the URL is read right away. */
  private initialize(): Promise<void> {
    const generation = this.disconnectGeneration;
    let outcome: Promise<RedirectOutcome> | null = null;
    try {
      outcome = this.redirectOutcome();
      if (!outcome) {
        // no result in the URL: this only drops an abandoned pending request
        this._redirect.consume();
      }
    } catch {
      // sessionStorage or history unavailable: nothing to apply
    }
    return this.finishReady(outcome, generation);
  }

  private async finishReady(
    outcome: Promise<RedirectOutcome> | null,
    generation: number
  ): Promise<void> {
    let request: OdinRequestState | null = null;
    let user: ConnectedUser | null = null;
    if (outcome) {
      try {
        const read = await outcome;
        // disconnect() while it was being read: drop it (nothing was stored)
        if (generation === this.disconnectGeneration) {
          request = read.request;
          if (read.connected) {
            user = this.bindConnection(read.connected);
          }
        }
      } catch {
        // stale or foreign result (fragment already removed): ignored
      }
    }
    // a rejected or unverified re-connect keeps the stored session
    this._store.dispatch({
      type: "ready",
      user: user ?? this.loadStoredSession(),
      request,
    });
  }

  // ---- connect ----------------------------------------------------------

  /**
   * Start a connect. `state.request` becomes a pending `"connect"` request
   * right away and settles as `"success"` (and `state.user` is set),
   * `"rejected"`, `"failed"` (popup blocked) or `"unverified"`.
   *
   * Only this request's popup is listened to (`event.source`). If a newer
   * `connect()` / action replaced it as `state.request`, or `disconnect()`
   * ran, its success leaves `state.user` and the stored session alone.
   *
   * The returned promise is kept for 1.6.0 code in popup mode: it resolves
   * with the user or rejects. In redirect mode the tab navigates away and it
   * never settles; render from `subscribe()` / `state` to support both.
   * Ignoring it never causes an unhandled rejection.
   */
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
    const sessionKey = Ed25519KeyIdentity.generate();
    const requestId = createRequestId();
    const options = { requires_api, requires_delegation, targets };
    const input: OdinRequestInput["connect"] = {
      requires_api: Boolean(requires_api),
      requires_delegation: Boolean(requires_delegation),
      targets: targets ? [...targets] : [],
    };
    this._store.dispatch({
      type: "request",
      request: {
        id: requestId,
        action: "connect",
        status: "pending",
        input,
        ...(returnState !== undefined ? { returnState } : {}),
      },
    });
    const url = this.createConnectUrl(sessionKey, requestId, options);
    if (this._redirect.useRedirect) {
      return quiet(
        this._redirect
          .start<ConnectedUser>(
            url,
            {
              path: "/authorize/connect",
              // Every connect (with or without delegation): the secret waits
              // in this tab's sessionStorage; Odin only sees session_pubkey.
              sessionKey: JSON.stringify(sessionKey.toJSON()),
              requires_delegation: input.requires_delegation,
              requires_api: input.requires_api,
              targets,
              returnState,
            },
            requestId,
            () =>
              this._store.dispatch({
                type: "settle",
                id: requestId,
                status: "rejected",
                error: NAVIGATED_BACK,
              })
          )
          .catch((error) => {
            throw this.settleError(requestId, "failed", error);
          })
      );
    }
    if (open) {
      this._window.settings = open;
    }
    return quiet(
      new Promise<ConnectedUser>((resolve, reject) => {
        let opened: Window | null = null;
        let stopWatching = () => {};
        const handleMessage = async (event: MessageEvent) => {
          if (
            event.origin === this.origin &&
            // only this request's popup: another connect's popup (or any
            // other Odin window) is not this request's answer
            event.source === opened &&
            event.data?.path === "/authorize/connect"
          ) {
            window.removeEventListener("message", handleMessage);
            // answered: the popup closing now (it does) is not a rejection,
            // also while the answer is being verified
            stopWatching();
            if (event.data.message === "rejected") {
              const reason = readRejectReason(event.data.detail);
              this._store.dispatch({
                type: "settle",
                id: requestId,
                status: "rejected",
                ...(reason ? { error: reason } : {}),
              });
              reject(new Error("User rejected the connection"));
              return;
            }
            // the user accepted the connection: verify before trusting it
            const connectionOptions = { requestId, ...options };
            let connected: VerifiedConnection;
            try {
              connected = await this.verifyConnection(
                event.data.message as ConnectResult,
                sessionKey,
                connectionOptions
              );
            } catch (error) {
              reject(this.settleError(requestId, "unverified", error));
              return;
            }
            if (this._store.state.request?.id !== requestId) {
              // superseded by a newer request, or disconnect() cleared it:
              // the promise still resolves (1.6.0), but state, storage and
              // this instance's API key stay as they are
              resolve(this.detachedUser(connected));
              return;
            }
            this.persistConnection(connected, sessionKey, connectionOptions);
            const user = this.bindConnection(connected);
            this._store.dispatch({
              type: "settle",
              id: requestId,
              status: "success",
              user,
            });
            resolve(user);
          }
        };
        opened = this._window.open(url);
        if (!opened || opened.closed || typeof opened.closed === "undefined") {
          reject(
            this.settleError(
              requestId,
              "failed",
              new Error(
                "Failed to open authorize/connect window, please always allow popups and try again"
              )
            )
          );
          return;
        }
        window.addEventListener("message", handleMessage);
        // closed without an answer (the page's own "rejected" on unload is
        // not reliable): settle it as rejected after the grace period; an
        // answer within it is handled as usual, a later one is ignored
        stopWatching = watchPopupClosed(opened, requestId, this._store, () => {
          window.removeEventListener("message", handleMessage);
          this._store.dispatch({
            type: "settle",
            id: requestId,
            status: "rejected",
            error: POPUP_CLOSED,
          });
          reject(new Error("User rejected the connection"));
        });
      })
    );
  }

  /** Settle a request as failed/unverified; returns the error to reject with. */
  private settleError(
    id: string,
    status: "failed" | "unverified",
    error: unknown
  ): Error {
    const err =
      error instanceof Error
        ? error
        : status === "unverified"
          ? new ConnectVerificationError(String(error))
          : new Error(String(error));
    this._store.dispatch({ type: "settle", id, status, error: err.message });
    return err;
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

  /**
   * This page load's redirect outcome, shared per `slug:env`: reads the URL
   * the first time a fragment is seen, else reuses the cached read. Null when
   * there is no result in the URL and none was read recently. Synchronous up
   * to the returned promise, so concurrent callers share one read.
   */
  private redirectOutcome(): Promise<RedirectOutcome> | null {
    const cacheKey = this.redirectCacheKey;
    const fragment = readFragmentValue();
    const entry = redirectOutcomes.get(cacheKey);
    if (fragment !== null && entry?.fragment !== fragment) {
      const created = {
        fragment,
        promise: this.readRedirectResult(),
        settled: false,
      };
      redirectOutcomes.set(cacheKey, created);
      const evict = () => {
        // delivered to every instance that was waiting for it
        created.settled = true;
        setTimeout(() => {
          if (redirectOutcomes.get(cacheKey) === created) {
            redirectOutcomes.delete(cacheKey);
          }
        }, REDIRECT_RESULT_REUSE_MS);
      };
      created.promise.then(evict, (error) => {
        // once per read, however many instances share it
        console.warn(
          "OdinConnect: ignored a stale or foreign redirect result",
          error
        );
        evict();
      });
      return created.promise;
    }
    // still being read: share it; already delivered: not a fresh result
    return entry && !entry.settled ? entry.promise : null;
  }

  /** Bind a shared verified connection to this instance (its API key). */
  private bindConnection({
    principal,
    identity,
    jwt,
  }: VerifiedConnection): ConnectedUser {
    this._api.apiKey = jwt;
    return new ConnectedUser(principal, identity, this._api, this._odin);
  }

  private get redirectCacheKey(): string {
    return `${this.slug}:${this.currentEnv}`;
  }

  /**
   * Consume the URL's result once and turn it into the settled request; a
   * connect result is verified and persisted first. Throws for a stale or
   * foreign result.
   */
  private async readRedirectResult(): Promise<RedirectOutcome> {
    const generation = this.disconnectGeneration;
    const consumed = this._redirect.consume();
    if (!consumed) {
      throw new Error("Unexpected OdinConnect redirect result");
    }
    const { result, pending } = consumed;
    const extra =
      pending.returnState !== undefined
        ? { returnState: pending.returnState }
        : {};
    const action = pending.path.replace(/^\/authorize\//, "");
    if (action === "connect") {
      const request = {
        id: pending.state,
        action: "connect" as const,
        input: {
          requires_api: Boolean(pending.requires_api),
          requires_delegation: Boolean(pending.requires_delegation),
          targets: pending.targets ?? [],
        },
        ...extra,
      };
      if (result.message === "rejected") {
        const reason = readRejectReason(result.detail);
        return {
          request: {
            ...request,
            status: "rejected",
            ...(reason ? { error: reason } : {}),
          },
        };
      }
      if (!pending.sessionKey) {
        // every connect saves its key; without it the proof can't be redeemed
        return {
          request: {
            ...request,
            status: "unverified",
            error: new ConnectVerificationError(
              "the pending request has no session key"
            ).message,
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
        if (generation !== this.disconnectGeneration) {
          // disconnect() while verifying: not stored; ready() drops it too
          return { request: { ...request, status: "success" } };
        }
        this.persistConnection(connected, sessionKey, options);
        return { request: { ...request, status: "success" }, connected };
      } catch (error) {
        return {
          request: {
            ...request,
            status: "unverified",
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }
    if (!(action in ACTIONS)) {
      throw new Error("Unexpected OdinConnect redirect result");
    }
    return {
      request: {
        id: pending.state,
        action: action as OdinAction,
        input: pending.input ?? {},
        ...extra,
        ...actionOutcome(action as OdinAction, result.message, result.detail),
      } as OdinRequestState,
    };
  }

  /**
   * A superseded verified connection, for the 1.6.0 promise only: its own API
   * client, so its JWT never becomes this instance's API key.
   */
  private detachedUser({
    principal,
    identity,
    jwt,
  }: VerifiedConnection): ConnectedUser {
    const api = new OdinApiClient(this.apiEnv);
    api.apiKey = jwt;
    return new ConnectedUser(principal, identity, api, this._odin);
  }

  private get apiEnv(): "prod" | "dev" | "legacy" {
    const env = this._appInfo?.env;
    return env === "prod" ? "prod" : env === "legacy" ? "legacy" : "dev";
  }

  private get disconnectGeneration(): number {
    return disconnects.get(this.redirectCacheKey) ?? 0;
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
   * @deprecated Since 2.0.0: use `(await odin.ready()).user`, or `state` /
   * `subscribe()`. Kept with its 1.6.0 behavior: synchronous, returns the
   * stored session's user (`state.user` once `ready()` finished). It does not
   * wait for or apply a redirect result; `ready()` does.
   */
  restoreSession(): ConnectedUser | null {
    if (this.state.status === "ready") {
      return this.state.user;
    }
    return this.loadStoredSession();
  }

  private loadStoredSession(): ConnectedUser | null {
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

  /** Forget the stored session; `state.user` and `state.request` become null. */
  disconnect(): void {
    const key = this.redirectCacheKey;
    disconnects.set(key, (disconnects.get(key) ?? 0) + 1);
    this._storage.clear();
    this._api.apiKey = null;
    redirectOutcomes.delete(key);
    this._store.dispatch({ type: "disconnect" });
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
