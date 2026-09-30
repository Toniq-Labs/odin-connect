import { describe, expect, it } from "vitest";
import { isInAppBrowser } from "./in-app-browser";

describe("isInAppBrowser", () => {
  it("detects the OKX wallet app browser", () => {
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 OKApp/(OKEx/6.90.0)"
      )
    ).toBe(true);
  });

  it("ignores regular mobile and desktop browsers", () => {
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe(false);
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
      )
    ).toBe(false);
  });
});
