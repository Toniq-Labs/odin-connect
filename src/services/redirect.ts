/**
 * Redirect-mode plumbing shared by `connect()` and every authorize action.
 *
 * Instead of a popup, the SDK navigates the current tab to
 * `/authorize/<type>?...&return_url=<this page>&state=<id>&request_id=<id>`
 * (same id twice). Odin navigates back to
 * `return_url#odin_connect=<base64url({ path, message, detail?, state })>`.
 * The pending request (nonce, path, and for connect the session key) waits in
 * `sessionStorage`, which survives the round trip in the same tab and is
 * single-use.
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
 *   returned promise never settles because the page unloads; a connect is
 *   finished by `await restoreSession()` (or `handleRedirectResult()`) when
 *   the app loads again, an action result is read with
 *   `handleRedirectResult()`.
 */
export type ConnectMode = "popup" | "redirect" | "auto";

export interface PendingRedirect {
  state: string;
  /** Authorize path, e.g. `/authorize/connect` or `/authorize/buy`. */
  path: string;
  /** Action message that means success (e.g. `"purchased"`). */
  successMessage?: string;
  /** connect only: the session key's JSON (never leaves this browser). */
  sessionKey?: string;
  /** connect only */
  requires_delegation?: boolean;
  /** connect only */
  requires_api?: boolean;
  /** connect only: canister targets the delegation may be scoped to. */
  targets?: string[];
  /** App data handed back by `handleRedirectResult()` (redirect mode only). */
  returnState?: unknown;
  /** `Date.now()` when the redirect started; abandoned entries expire. */
  createdAt?: number;
}

/**
 * How long a pending request may wait for its result. Past this, a page load
 * without a result deletes it (it can hold a connect session secret).
 */
export const PENDING_REDIRECT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Per-call option shared by `connect()` and every action. In redirect mode
 * the page unloads, so anything the app needs to resume (current step, token,
 * amounts) can ride along here and comes back as `result.returnState` from
 * `handleRedirectResult()`. Must be JSON-serializable; bigints are preserved.
 * Ignored in popup mode, where the awaited call simply resolves.
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

/** The current page URL without its fragment, used as `return_url`. */
export function currentReturnUrl(): string {
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

/** True when the current URL carries a redirect result. */
export function hasRedirectResult(): boolean {
  return readFragmentValue() !== null;
}

/**
 * Read `#odin_connect=...` from the current URL. When present, the fragment is
 * removed from the address bar (and the history entry) before returning.
 */
export function consumeRedirectResult(): RedirectResult | null {
  const value = readFragmentValue();
  if (!value) return null;

  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(window.history.state, "", url.href);

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
    pending: Omit<PendingRedirect, "state" | "createdAt">,
    state: string
  ): Promise<T> {
    let saved: boolean;
    try {
      saved = this._pending.save({ ...pending, state, createdAt: Date.now() });
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

  /** Authorize path of the pending request, without consuming it. */
  get pendingPath(): string | null {
    return this._pending.peek()?.path ?? null;
  }

  /**
   * Consume the URL's redirect result and its pending request. Returns null
   * when the URL carries no result (and deletes a pending request abandoned
   * for more than `PENDING_REDIRECT_MAX_AGE_MS`); throws when the result does
   * not match the pending request (stale, foreign or replayed).
   */
  consume(): { result: RedirectResult; pending: PendingRedirect } | null {
    if (!hasRedirectResult()) {
      this._pending.dropIfOlderThan(PENDING_REDIRECT_MAX_AGE_MS);
      return null;
    }
    const result = consumeRedirectResult();
    const pending = this._pending.take();
    if (
      !result ||
      !pending ||
      pending.state !== result.state ||
      pending.path !== result.path
    ) {
      throw new Error("Unexpected OdinConnect redirect result");
    }
    return { result, pending };
  }
}
