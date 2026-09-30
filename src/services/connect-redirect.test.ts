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
function returnWith(returnUrl: string, result: unknown) {
  const url = new URL(returnUrl);
  url.hash = `${REDIRECT_RESULT_KEY}=${encode(result)}`;
  window.history.replaceState(null, "", url.href);
}

function startRedirect(
  connect: Connect,
  options: Parameters<Connect["connect"]>[0]
) {
  const navigate = vi
    .spyOn(connect["_window"], "navigate")
    .mockImplementation(() => {});
  void connect.connect(options);
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
    const connect = new Connect({ name: "test" });
    const url = startRedirect(connect, { mode: "redirect" });
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
    const connect = new Connect({ name: "test" });
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(OKX_UA);
    startRedirect(connect, { mode: "auto" });
    expect(open).not.toHaveBeenCalled();

    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Safari");
    void connect.connect({ mode: "auto" });
    expect(open).toHaveBeenCalledOnce();
  });

  it("rejects requires_api in redirect mode", async () => {
    const connect = new Connect({ name: "test" });
    await expect(
      connect.connect({ mode: "redirect", requires_api: true })
    ).rejects.toThrow("requires_api is not supported in redirect mode");
  });

  it("completes a delegation round trip via restoreSession", async () => {
    const connect = new Connect({ name: "test" });
    const target = "74iy7-xqaaa-aaaaf-qagra-cai";
    const url = startRedirect(connect, {
      mode: "redirect",
      requires_delegation: true,
      targets: [target],
    });

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
    returnWith(url.searchParams.get("return_url")!, {
      path: "/authorize/connect",
      state: url.searchParams.get("state"),
      message: {
        principal: user.getPrincipal().toText(),
        jwt: null,
        delegationChain: chain.toJSON(),
      },
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

  it("throws on a rejected result and consumes the pending request", () => {
    const connect = new Connect({ name: "test" });
    const url = startRedirect(connect, { mode: "redirect" });
    returnWith(url.searchParams.get("return_url")!, {
      path: "/authorize/connect",
      state: url.searchParams.get("state"),
      message: "rejected",
    });
    expect(() => connect.handleRedirectResult()).toThrow(
      "User rejected the connection"
    );
    expect(sessionStorage.length).toBe(0);
  });

  it("refuses a result whose state does not match", () => {
    const connect = new Connect({ name: "test" });
    const url = startRedirect(connect, { mode: "redirect" });
    returnWith(url.searchParams.get("return_url")!, {
      path: "/authorize/connect",
      state: "someone-elses-state-value-000000",
      message: { principal: "aaaaa-aa", jwt: null },
    });
    expect(() => connect.handleRedirectResult()).toThrow(
      "Unexpected OdinConnect redirect result"
    );
    expect(connect.restoreSession()).toBeNull();
  });

  it("returns null when the URL has no redirect result", () => {
    const connect = new Connect({ name: "test" });
    expect(connect.handleRedirectResult()).toBeNull();
  });
});
