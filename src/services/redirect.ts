/**
 * Redirect-mode plumbing shared by `connect()` and every authorize action.
 *
 * Instead of a popup, the SDK navigates the current tab to
 * `/authorize/<type>?...&return_url=<this page>&state=<nonce>`. Odin navigates
 * back to `return_url#odin_connect=<base64url({ path, message, state })>`.
 * The pending request (nonce, path, and for connect the session key) waits in
 * `sessionStorage`, which survives the round trip in the same tab and is
 * single-use.
 */
import { isInAppBrowser } from "../utils/in-app-browser";
import { WindowClient } from "./window";

export const REDIRECT_RESULT_KEY = "odin_connect";

/**
 * How the SDK reaches the Odin authorize pages, for `connect()` and actions.
 * - `"popup"` (default): `window.open` + `postMessage`.
 * - `"redirect"`: navigate this tab to Odin and back. For wallet in-app
 *   browsers (OKX) that open popups without `window.opener`. The returned
 *   promise never settles because the page unloads; read the result with
 *   `handleRedirectResult()` when the app loads again.
 * - `"auto"`: `"redirect"` inside a wallet in-app browser or app webview
 *   (see `isInAppBrowser()`), else `"popup"`.
 */
export type ConnectMode = "popup" | "redirect" | "auto";

export interface PendingRedirect {
  state: string;
  /** Authorize path, e.g. `/authorize/connect` or `/authorize/buy`. */
  path: string;
  /** Action message that means success (e.g. `"purchased"`). */
  successMessage?: string;
  /** connect only */
  sessionKey?: string;
  /** connect only */
  requires_delegation?: boolean;
}

export interface RedirectResult {
  path: string;
  message: unknown;
  state: string;
}

export class PendingRedirectStorage {
  private _key: string;

  constructor(slug: string, env: string) {
    this._key = `odin_connect:${slug}:${env}:pending_redirect`;
  }

  /** Save and read back; false when sessionStorage is unusable. */
  save(pending: PendingRedirect): boolean {
    try {
      const value = JSON.stringify(pending);
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
      const parsed = JSON.parse(raw);
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
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 32-char url-safe nonce (24 random bytes). */
export function createState(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

/** The current page URL without its fragment, used as `return_url`. */
export function currentReturnUrl(): string {
  const url = new URL(window.location.href);
  url.hash = "";
  return url.href;
}

/** The raw `odin_connect` fragment value, if the URL carries one. */
function readFragmentValue(): string | null {
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
  mode: ConnectMode = "popup";

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
   * `return_url` + `state`. The returned promise never settles (the page
   * unloads) unless sessionStorage is unusable, in which case it rejects
   * before navigating.
   */
  start<T>(url: URL, pending: Omit<PendingRedirect, "state">): Promise<T> {
    const state = createState();
    if (!this._pending.save({ ...pending, state })) {
      return Promise.reject(
        new Error("Redirect mode needs sessionStorage, which is unavailable")
      );
    }
    url.searchParams.append("return_url", currentReturnUrl());
    url.searchParams.append("state", state);
    this._window.navigate(url);
    return new Promise<T>(() => {});
  }

  /** Path of the pending request when the URL carries its result. */
  pendingPath(): string | null {
    return hasRedirectResult() ? (this._pending.peek()?.path ?? null) : null;
  }

  /**
   * Consume the URL's redirect result and its pending request. Returns null
   * when the URL carries no result; throws when the result does not match
   * the pending request (stale, foreign or replayed).
   */
  consume(): { result: RedirectResult; pending: PendingRedirect } | null {
    if (!hasRedirectResult()) return null;
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
