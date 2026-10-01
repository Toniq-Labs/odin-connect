/**
 * Best-effort detection of wallet in-app browsers and app webviews, where
 * `window.open` targets load as a detached page with no `window.opener`, so a
 * popup's `postMessage` result never reaches the app.
 * `new OdinConnect({ mode: "auto" })` uses redirect mode when this is true.
 *
 * Redirect mode works in every browser, so this errs toward true: a false
 * positive costs a page reload, a miss leaves Authorize doing nothing.
 */

/** User agents known to belong to a wallet in-app browser. */
const WALLET_UA_PATTERNS: RegExp[] = [
  // OKX Wallet app DApp browser, e.g. "... OKApp/(OKEx/6.90.0) ..."
  /\bOKApp\b/i,
];

/**
 * Globals wallets inject into their in-app browsers. Desktop extensions
 * inject them too, so they only count on mobile, where browsers have no
 * extensions.
 */
const INJECTED_WALLET_GLOBALS = [
  "XverseProviders",
  "btc_providers", // WBIP004 (Xverse, Leather, ...)
  "unisat",
  "okxwallet",
  "phantom",
  "LeatherProvider",
  "magicEden",
  "wizz",
  "oyl",
  "ethereum",
  "solana",
];

export interface InAppBrowserEnv {
  userAgent?: string;
  /** Checked for injected wallet globals. */
  globals?: object;
  /** Distinguishes iPadOS (which reports a Mac user agent) from macOS. */
  maxTouchPoints?: number;
}

function isMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) {
    return true;
  }
  // iPadOS Safari reports itself as desktop macOS.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** An app's embedded webview rather than a standalone browser. */
function isWebView(userAgent: string, maxTouchPoints: number): boolean {
  // Android System WebView marks itself with "; wv)".
  if (/Android/i.test(userAgent) && /;\s*wv\)/.test(userAgent)) {
    return true;
  }
  // iOS WKWebView omits the "Safari/" token that Safari, Chrome (CriOS),
  // Firefox (FxiOS) and Edge (EdgiOS) on iOS all send.
  const iOS =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return iOS && /AppleWebKit/i.test(userAgent) && !/Safari\//.test(userAgent);
}

function hasInjectedWallet(globals: object): boolean {
  return INJECTED_WALLET_GLOBALS.some(
    (name) => (globals as Record<string, unknown>)[name] != null
  );
}

export function isInAppBrowser(env: InAppBrowserEnv = {}): boolean {
  const userAgent =
    env.userAgent ??
    (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const maxTouchPoints =
    env.maxTouchPoints ??
    (typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints || 0);
  const globals = env.globals ?? (typeof window === "undefined" ? {} : window);

  if (WALLET_UA_PATTERNS.some((pattern) => pattern.test(userAgent))) {
    return true;
  }
  if (isWebView(userAgent, maxTouchPoints)) {
    return true;
  }
  return isMobile(userAgent, maxTouchPoints) && hasInjectedWallet(globals);
}
