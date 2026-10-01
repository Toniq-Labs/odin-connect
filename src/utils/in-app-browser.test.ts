import { describe, expect, it } from "vitest";
import { isInAppBrowser } from "./in-app-browser";

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  iosWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iosOkx:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 OKApp/(OKEx/6.90.0)",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36",
  ipadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
};

const check = (userAgent: string, globals: object = {}, maxTouchPoints = 0) =>
  isInAppBrowser({ userAgent, globals, maxTouchPoints });

describe("isInAppBrowser", () => {
  it("detects OKX by user agent", () => {
    expect(check(UA.iosOkx)).toBe(true);
  });

  it("detects app webviews on iOS and Android", () => {
    expect(check(UA.iosWebView)).toBe(true);
    expect(check(UA.androidWebView)).toBe(true);
  });

  it("detects mobile browsers with an injected wallet (Xverse, Unisat, ...)", () => {
    expect(check(UA.iosSafari, { XverseProviders: {} })).toBe(true);
    expect(check(UA.androidChrome, { btc_providers: [] })).toBe(true);
    expect(check(UA.androidChrome, { unisat: {} })).toBe(true);
    expect(check(UA.iosChrome, { ethereum: {} })).toBe(true);
  });

  it("treats iPadOS (desktop UA + touch) as mobile", () => {
    expect(check(UA.ipadSafari, { XverseProviders: {} }, 5)).toBe(true);
    expect(check(UA.ipadSafari, {}, 5)).toBe(false);
  });

  it("ignores regular mobile browsers without a wallet", () => {
    expect(check(UA.iosSafari)).toBe(false);
    expect(check(UA.iosChrome)).toBe(false);
    expect(check(UA.androidChrome)).toBe(false);
  });

  it("ignores desktop browsers, even with wallet extensions", () => {
    expect(check(UA.macChrome)).toBe(false);
    expect(check(UA.macChrome, { XverseProviders: {}, okxwallet: {} })).toBe(
      false
    );
  });
});
