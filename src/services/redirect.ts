/**
 * Redirect-mode plumbing shared by `connect()` and every authorize action.
 *
 * Instead of a popup, the SDK navigates the current tab to
 * `/authorize/<type>?...&return_url=<origin + path>&state=<id>&request_id=<id>`
 * (same id twice). `return_url` never carries a query or fragment: Odin only
 * returns to the requesting origin, any path, without a query (so a
 * `/go?to=...` open redirect on the app cannot forward the result). Odin
 * navigates back to
 * `return_url#odin_connect=<base64url({ path, message, detail?, state })>`.
 * The pending request (nonce, path, the page's full URL, and for connect the
 * session key) waits in `sessionStorage`, which survives the round trip in
 * the same tab and is single-use. Consuming the result puts the page's
 * original query string back.
 */
import { isInAppBrowser } from "../utils/in-app-browser";
import { WindowClient } from "./window";

export const REDIRECT_RESULT_KEY = "odin_connect";

/**
 * How the SDK reaches the Odin authorize pages, for `connect()` and actions.
 * - `"auto"` (default): `"redirect"` inside a wallet in-app browser or app
 *   webview (see `isInAppBrowser()`), else `"popup"`.
 * - `"popup"`: always `window.open` + `postMessage`.
 * - `"redirect"`: always navigate this tab to Odin and back. For wallet
 *   in-app browsers (OKX) that open popups without `window.opener`. The
 *   returned promise never settles because the page unloads; on the next
 *   load `ready()` verifies and applies the result to `OdinConnect.state`.
 */
export type ConnectMode = "popup" | "redirect" | "auto";

export interface PendingRedirect {
  state: string;
  /** Authorize path, e.g. `/authorize/connect` or `/authorize/buy`. */
  path: string;
  /** connect only: the session key's JSON (never leaves this browser). */
  sessionKey?: string;
  /** connect only */
  requires_delegation?: boolean;
  /** connect only */
  requires_api?: boolean;
  /** connect only: canister targets the delegation may be scoped to. */
  targets?: string[];
  /** The request's `input` (no secrets; bigints kept), for `state.request`. */
  input?: unknown;
  /** App data handed back as `state.request.returnState`. */
  returnState?: unknown;
  /** `Date.now()` when the redirect started; abandoned entries expire. */
  createdAt?: number;
  /**
   * The page URL that started the request, with its query, without its
   * fragment. Its query is restored once the result is consumed. Missing in
   * entries saved by older SDK versions.
   */
  returnHref?: string;
}

/**
 * How long a pending request may wait for its result. Past this, a page load
 * without a result deletes it (it can hold a connect session secret).
 */
export const PENDING_REDIRECT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Per-call option shared by `connect()` and every action. Comes back as
 * `state.request.returnState` in both modes; in redirect mode the page
 * unloads, so anything the app needs to resume (current step, token,
 * amounts) can ride along here. Must be JSON-serializable in redirect mode;
 * bigints are preserved. Never sent to Odin.
 */
export interface RedirectCallOptions {
  returnState?: unknown;
}

const BIGINT_TAG = "$odin_bigint";

/** JSON.stringify that keeps bigints (tagged) instead of throwing. */
function stringifyPending(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? { [BIGINT_TAG]: v.toString() } : v
  );
}

function parsePending(raw: string): unknown {
  return JSON.parse(raw, (_key, v) =>
    v !== null &&
    typeof v === "object" &&
    Object.keys(v).length === 1 &&
    typeof v[BIGINT_TAG] === "string"
      ? BigInt(v[BIGINT_TAG])
      : v
  );
}

export interface RedirectResult {
  path: string;
  message: unknown;
  /** Extra result data (e.g. `{ block_index, memo }` for icrc_approve). */
  detail?: unknown;
  state: string;
}

export class PendingRedirectStorage {
  private _key: string;

  constructor(slug: string, env: string) {
    this._key = `odin_connect:${slug}:${env}:pending_redirect`;
  }

  /**
   * Save and read back; false when sessionStorage is unusable. Throws when
   * `returnState` is not serializable (e.g. circular references).
   */
  save(pending: PendingRedirect): boolean {
    const value = stringifyPending(pending);
    try {
      sessionStorage.setItem(this._key, value);
      return sessionStorage.getItem(this._key) === value;
    } catch {
      return false;
    }
  }

  /** Load without deleting. */
  peek(): PendingRedirect | null {
    try {
      const raw = sessionStorage.getItem(this._key);
      if (!raw) return null;
      const parsed = parsePending(raw) as PendingRedirect;
      if (
        typeof parsed?.state !== "string" ||
        typeof parsed?.path !== "string"
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /** Load and delete (single-use). */
  take(): PendingRedirect | null {
    const pending = this.peek();
    try {
      sessionStorage.removeItem(this._key);
    } catch {
      // sessionStorage unavailable
    }
    return pending;
  }

  /** Delete the pending request if it is older than `maxAgeMs` (or undated). */
  dropIfOlderThan(maxAgeMs: number): void {
    const pending = this.peek();
    if (!pending) return;
    const age =
      typeof pending.createdAt === "number"
        ? Date.now() - pending.createdAt
        : Infinity;
    if (age > maxAgeMs) {
      this.take();
    }
  }
}

/** base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * 32-char url-safe nonce (24 random bytes). Used as the `request_id` of every
 * authorize request, and as `state` in redirect mode.
 */
export function createRequestId(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

/** `origin + pathname` of this page (no query, no fragment): `return_url`. */
export function currentReturnUrl(): string {
  return window.location.origin + window.location.pathname;
}

/** The current page URL with its query, without its fragment. */
export function currentPageHref(): string {
  const url = new URL(window.location.href);
  url.hash = "";
  return url.href;
}

/** The raw `odin_connect` fragment value, if the URL carries one. */
export function readFragmentValue(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  return new URLSearchParams(hash).get(REDIRECT_RESULT_KEY);
}

/**
 * Replace the address bar URL (keeping `history.state`) to drop the result
 * fragment. With `returnHref` (the page that started the request, same origin
 * and path), its query string is restored too, since `return_url` had none.
 */
export function clearRedirectFragment(returnHref?: string): void {
  const url = new URL(window.location.href);
  url.hash = "";
  if (typeof returnHref === "string") {
    try {
      const original = new URL(returnHref);
      if (
        original.origin === url.origin &&
        original.pathname === url.pathname
      ) {
        url.search = original.search;
      }
    } catch {
      // not a URL: only drop the fragment
    }
  }
  window.history.replaceState(window.history.state, "", url.href);
}

/** Decode a raw `odin_connect` fragment value; null when malformed. */
export function decodeRedirectResult(value: string): RedirectResult | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed?.path !== "string" || typeof parsed?.state !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Owns the mode and the pending request for one `OdinConnect` instance, so
 * `connect()` and the canister actions share one redirect implementation.
 */
export class RedirectClient {
  mode: ConnectMode = "auto";

  constructor(
    private _window: WindowClient,
    private _pending: PendingRedirectStorage
  ) {}

  /** Whether the next authorize request should redirect instead of popup. */
  get useRedirect(): boolean {
    return (
      this.mode === "redirect" || (this.mode === "auto" && isInAppBrowser())
    );
  }

  /**
   * Save the pending request, then navigate this tab to `url` with
   * `return_url` + `state`. `state` is the request's `request_id` (already on
   * `url`), so Odin can sign it as the nonce. The returned promise never
   * settles (the page unloads) unless sessionStorage is unusable, in which
   * case it rejects before navigating.
   */
  start<T>(
    url: URL,
    pending: Omit<PendingRedirect, "state" | "createdAt" | "returnHref">,
    state: string
  ): Promise<T> {
    let saved: boolean;
    try {
      saved = this._pending.save({
        ...pending,
        state,
        createdAt: Date.now(),
        returnHref: currentPageHref(),
      });
    } catch {
      return Promise.reject(
        new Error("returnState must be JSON-serializable (bigints are allowed)")
      );
    }
    if (!saved) {
      return Promise.reject(
        new Error("Redirect mode needs sessionStorage, which is unavailable")
      );
    }
    url.searchParams.append("return_url", currentReturnUrl());
    url.searchParams.append("state", state);
    this._window.navigate(url);
    return new Promise<T>(() => {});
  }

  /**
   * Consume the URL's redirect result and its pending request. The fragment
   * is removed from the address bar (and the history entry), and when the
   * result matches, the page's original query string is restored. Returns
   * null when the URL carries no result (and deletes a pending request
   * abandoned for more than `PENDING_REDIRECT_MAX_AGE_MS`); throws when the
   * result does not match the pending request (stale, foreign or replayed).
   */
  consume(): { result: RedirectResult; pending: PendingRedirect } | null {
    const value = readFragmentValue();
    if (value === null) {
      this._pending.dropIfOlderThan(PENDING_REDIRECT_MAX_AGE_MS);
      return null;
    }
    const result = decodeRedirectResult(value);
    const pending = this._pending.take();
    if (
      !result ||
      !pending ||
      pending.state !== result.state ||
      pending.path !== result.path
    ) {
      clearRedirectFragment();
      throw new Error("Unexpected OdinConnect redirect result");
    }
    clearRedirectFragment(pending.returnHref);
    return { result, pending };
  }
}
