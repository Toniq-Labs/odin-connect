import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelegationChain, Ed25519KeyIdentity } from "@dfinity/identity";
import { Connect } from "./connect";
import { REDIRECT_RESULT_KEY } from "./redirect";

const OKX_UA =
  "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 OKApp/(OKEx/6.90.0)";

function encode(result: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Simulate Odin navigating back to return_url with a result fragment. */
function returnWith(url: URL, message: unknown, overrides = {}) {
  const back = new URL(url.searchParams.get("return_url")!);
  back.hash = `${REDIRECT_RESULT_KEY}=${encode({
    path: url.pathname,
    state: url.searchParams.get("state"),
    message,
    ...overrides,
  })}`;
  window.history.replaceState(null, "", back.href);
}

function spyNavigate(connect: Connect) {
  return vi.spyOn(connect["_window"], "navigate").mockImplementation(() => {});
}

function navigatedUrl(navigate: ReturnType<typeof spyNavigate>) {
  expect(navigate).toHaveBeenCalledOnce();
  return navigate.mock.calls[0][0] as URL;
}

describe("Connect redirect mode", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app?x=1");
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("navigates this tab with return_url and state instead of a popup", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    const url = navigatedUrl(navigate);
    expect(open).not.toHaveBeenCalled();
    expect(url.pathname).toBe("/authorize/connect");
    expect(url.searchParams.get("return_url")).toBe(
      `${window.location.origin}/app?x=1`
    );
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(url.searchParams.get("referrer")).toBe(window.location.origin);
  });

  it("auto mode redirects inside OKX and pops up elsewhere", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const connect = new Connect({ name: "test", mode: "auto" });
    const navigate = spyNavigate(connect);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(OKX_UA);
    void connect.connect();
    expect(navigate).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();

    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Safari");
    void connect.connect();
    expect(open).toHaveBeenCalledOnce();
  });

  it("mode can be switched at runtime and defaults to popup", () => {
    const connect = new Connect({ name: "test" });
    expect(connect.mode).toBe("popup");
    connect.mode = "redirect";
    const navigate = spyNavigate(connect);
    void connect.connect();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("rejects requires_api in redirect mode", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    await expect(connect.connect({ requires_api: true })).rejects.toThrow(
      "requires_api is not supported in redirect mode"
    );
  });

  it("completes a delegation round trip via restoreSession", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect({
      requires_delegation: true,
      targets: ["74iy7-xqaaa-aaaaf-qagra-cai"],
    });
    const url = navigatedUrl(navigate);

    // What Odin does: delegate from the user's identity to the session key.
    const sessionKey = Ed25519KeyIdentity.fromJSON(
      atob(url.searchParams.get("session_key")!)
    );
    const user = Ed25519KeyIdentity.generate();
    const chain = await DelegationChain.create(
      user,
      sessionKey.getPublicKey(),
      new Date(Date.now() + 60_000)
    );
    returnWith(url, {
      principal: user.getPrincipal().toText(),
      jwt: null,
      delegationChain: chain.toJSON(),
    });

    const connected = connect.restoreSession();
    expect(connected?.principal).toBe(user.getPrincipal().toText());
    expect(connected?.getIdentity()?.getPrincipal().toText()).toBe(
      user.getPrincipal().toText()
    );
    // fragment scrubbed, pending request consumed, session persisted
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?x=1");
    expect(sessionStorage.length).toBe(0);
    expect(connect.isSessionValid()).toBe(true);
  });

  it("reports a rejected connect and consumes the pending request", () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    returnWith(navigatedUrl(navigate), "rejected");
    expect(connect.handleRedirectResult()).toEqual({
      action: "connect",
      status: "rejected",
    });
    expect(sessionStorage.length).toBe(0);
    expect(window.location.hash).toBe("");
  });

  it("refuses a result whose state does not match", () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    returnWith(
      navigatedUrl(navigate),
      { principal: "aaaaa-aa", jwt: null },
      { state: "someone-elses-state-value-000000" }
    );
    expect(() => connect.handleRedirectResult()).toThrow(
      "Unexpected OdinConnect redirect result"
    );
  });

  it("returns null when the URL has no redirect result", () => {
    const connect = new Connect({ name: "test" });
    expect(connect.handleRedirectResult()).toBeNull();
  });
});

describe("Action redirect mode", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app");
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects every action and reports success", () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 5n });
    const url = navigatedUrl(navigate);
    expect(open).not.toHaveBeenCalled();
    expect(url.pathname).toBe("/authorize/buy");
    expect(url.searchParams.get("amount")).toBe("5");
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{32}$/);

    returnWith(url, "purchased");
    expect(connect.handleRedirectResult()).toEqual({
      action: "buy",
      status: "success",
    });
  });

  it("reports a rejected action as failed", () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.icrcApprove({
      principal: "p",
      token: "2jjj",
      spender: "aaaaa-aa",
      amount: 1n,
    });
    returnWith(navigatedUrl(navigate), "rejected");
    expect(connect.handleRedirectResult()).toEqual({
      action: "icrc_approve",
      status: "failed",
    });
  });

  it("restoreSession leaves action results for handleRedirectResult", () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.sell({ principal: "p", token: "2jjj", tokenAmount: 1n });
    returnWith(navigatedUrl(navigate), "sold");

    expect(connect.restoreSession()).toBeNull();
    expect(window.location.hash).not.toBe("");
    expect(connect.handleRedirectResult()).toEqual({
      action: "sell",
      status: "success",
    });
  });
});
