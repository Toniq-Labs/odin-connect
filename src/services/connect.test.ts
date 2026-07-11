import { afterEach, describe, expect, it, vi } from "vitest";
import { Connect } from "./connect";

describe("Connect env → API base URL mapping", () => {
  it("should map legacy env to the legacy API base URL", () => {
    const connect = new Connect({ env: "legacy" });
    expect(connect["_api"].BASE_URL).toBe("https://api.odin.fun/v1");
  });

  it("should map prod env to the prod API base URL", () => {
    const connect = new Connect({ env: "prod" });
    expect(connect["_api"].BASE_URL).toBe("https://api.odin.fun/v2");
  });

  it("should collapse dev/local to the dev API base URL", () => {
    expect(new Connect({ env: "dev" })["_api"].BASE_URL).toBe(
      "https://api.odin.fun/dev"
    );
    expect(new Connect({ env: "local" })["_api"].BASE_URL).toBe(
      "https://api.odin.fun/dev"
    );
  });
});

describe("Connect lang option", () => {
  const connectUrl = (connect: Connect) =>
    connect["createUrl"]("authorize/connect");
  const canisterUrl = (connect: Connect) =>
    connect["_odin"]["createUrl"]("authorize/buy");

  it("should append lang to connect and canister popup URLs", () => {
    const connect = new Connect({ name: "test", lang: "zh" });
    expect(connectUrl(connect).searchParams.get("lang")).toBe("zh");
    expect(canisterUrl(connect).searchParams.get("lang")).toBe("zh");
  });

  it("should default to en when lang is omitted", () => {
    const connect = new Connect({ name: "test" });
    expect(connect.lang).toBe("en");
    expect(connectUrl(connect).searchParams.get("lang")).toBe("en");
    expect(canisterUrl(connect).searchParams.get("lang")).toBe("en");
  });

  it("should apply a runtime lang switch to both popup URLs", () => {
    const connect = new Connect({ name: "test" });
    connect.lang = "zh";
    expect(connect.lang).toBe("zh");
    expect(connectUrl(connect).searchParams.get("lang")).toBe("zh");
    expect(canisterUrl(connect).searchParams.get("lang")).toBe("zh");
  });

  it("should fall back to en on an invalid init value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const connect = new Connect({
      name: "test",
      lang: "fr" as never,
    });
    expect(connect.lang).toBe("en");
    expect(connectUrl(connect).searchParams.get("lang")).toBe("en");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("should fall back to en on an invalid setter value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const connect = new Connect({ name: "test", lang: "zh" });
    connect.lang = "de" as never;
    expect(connect.lang).toBe("en");
    expect(canisterUrl(connect).searchParams.get("lang")).toBe("en");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("Connect lang on opened popup URLs", () => {
  const openSpy = () =>
    vi.spyOn(window, "open").mockReturnValue(null);

  const openedUrl = (spy: ReturnType<typeof openSpy>) => {
    expect(spy).toHaveBeenCalledOnce();
    return spy.mock.calls[0][0] as URL;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should open the connect popup with the configured lang", () => {
    const spy = openSpy();
    const connect = new Connect({ name: "test", lang: "zh" });
    connect.connect(); // never settles in jsdom; only the opened URL matters
    expect(openedUrl(spy).searchParams.get("lang")).toBe("zh");
  });

  it("should open canister action popups with the configured lang", async () => {
    const spy = openSpy();
    const connect = new Connect({ name: "test", lang: "zh" });
    // popup blocked (open → null) rejects the action; URL is still captured
    await expect(
      connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n })
    ).rejects.toThrow();
    const url = openedUrl(spy);
    expect(url.pathname).toBe("/authorize/buy");
    expect(url.searchParams.get("lang")).toBe("zh");
  });

  it("should apply a runtime lang switch to the next action popup", async () => {
    const spy = openSpy();
    const connect = new Connect({ name: "test" });
    connect.lang = "zh";
    await expect(
      connect.odin.sell({ principal: "p", token: "2jjj", tokenAmount: 1n })
    ).rejects.toThrow();
    expect(openedUrl(spy).searchParams.get("lang")).toBe("zh");
  });
});
