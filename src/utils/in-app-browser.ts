/**
 * Best-effort detection of wallet in-app browsers that break the popup flow.
 *
 * These browsers load `window.open` targets as a detached page with no
 * `window.opener`, so the popup's `postMessage` result never reaches the app.
 * `connect({ mode: "auto" })` uses redirect mode when this returns true.
 *
 * Only user agents confirmed to break are listed. Do not match on injected
 * providers (e.g. `window.okxwallet`): desktop extensions inject those too.
 */
const IN_APP_BROWSER_PATTERNS: RegExp[] = [
  // OKX Wallet app DApp browser, e.g. "... OKApp/(OKEx/6.90.0) ..."
  /\bOKApp\b/i,
];

export function isInAppBrowser(
  userAgent: string = typeof navigator === "undefined"
    ? ""
    : navigator.userAgent
): boolean {
  return IN_APP_BROWSER_PATTERNS.some((pattern) => pattern.test(userAgent));
}
