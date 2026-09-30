/**
 * Redirect-mode plumbing for `connect()`.
 *
 * Instead of a popup, the SDK navigates the current tab to
 * `/authorize/connect?...&return_url=<this page>&state=<nonce>`. Odin navigates
 * back to `return_url#odin_connect=<base64url({ path, message, state })>`.
 * The pending request (nonce + session key) waits in `sessionStorage`, which
 * survives the round trip in the same tab and is single-use.
 */
export const REDIRECT_RESULT_KEY = "odin_connect";

export interface PendingRedirect {
  state: string;
  sessionKey: string;
  requires_delegation: boolean;
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

  /** Load and delete (single-use). */
  take(): PendingRedirect | null {
    try {
      const raw = sessionStorage.getItem(this._key);
      sessionStorage.removeItem(this._key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.state !== "string" ||
        typeof parsed?.sessionKey !== "string" ||
        typeof parsed?.requires_delegation !== "boolean"
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
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

/**
 * Read `#odin_connect=...` from the current URL. When present, the fragment is
 * removed from the address bar (and the history entry) before returning.
 */
export function consumeRedirectResult(): RedirectResult | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const value = new URLSearchParams(hash).get(REDIRECT_RESULT_KEY);
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
