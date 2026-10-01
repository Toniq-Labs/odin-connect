import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelegationChain, Ed25519KeyIdentity } from "@dfinity/identity";
import { OdinApiClient } from "./api";
import { AppInitOptions, Connect, resetRedirectOutcomes } from "./connect";
import { PENDING_REDIRECT_MAX_AGE_MS, REDIRECT_RESULT_KEY } from "./redirect";
import {
  apiAccepts,
  clientSignatureValid,
  odinConnectMessage,
  odinReturnTarget,
} from "../../test/odin-page";

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
function returnWith(
  url: URL,
  message: unknown,
  overrides: Record<string, unknown> = {}
) {
  const back = odinReturnTarget(url);
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

/** The app loading again after Odin sent the tab back: a new instance. */
async function reload(options: Partial<AppInitOptions> = {}) {
  const connect = new Connect({ name: "test", ...options });
  const state = await connect.ready();
  return { connect, state };
}

/** Start a redirect connect on a fresh instance and come back with `message`. */
async function returnFromConnect(
  options: Parameters<Connect["connect"]>[0] = {},
  message?: unknown
) {
  const connect = new Connect({ name: "test", mode: "redirect" });
  const navigate = spyNavigate(connect);
  void connect.connect(options);
  const url = navigatedUrl(navigate);
  const sent = message ?? (await odinConnectMessage(url));
  returnWith(url, sent);
  return {
    url,
    message: sent as Awaited<ReturnType<typeof odinConnectMessage>>,
  };
}

function spyVerify() {
  return vi.spyOn(OdinApiClient.prototype, "verifyConnect");
}

describe("Connect redirect mode", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app?x=1");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
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
      `${window.location.origin}/app`
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

  it("mode can be switched at runtime and defaults to auto", () => {
    const connect = new Connect({ name: "test" });
    expect(connect.mode).toBe("auto");
    connect.mode = "redirect";
    const navigate = spyNavigate(connect);
    void connect.connect();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("sends state and request_id as the same id, with v=2", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect({ requires_api: true });
    const url = navigatedUrl(navigate);
    expect(url.searchParams.get("v")).toBe("2");
    expect(url.searchParams.get("request_id")).toBe(
      url.searchParams.get("state")
    );
    expect(url.searchParams.get("requires_api")).toBe("1");
  });

  it("records the connect as pending before navigating", () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect({
      requires_delegation: true,
      targets: ["74iy7-xqaaa-aaaaf-qagra-cai"],
      returnState: { from: "landing" },
    });
    const url = navigatedUrl(navigate);
    expect(connect.state.request).toEqual({
      id: url.searchParams.get("request_id"),
      action: "connect",
      status: "pending",
      input: {
        requires_api: false,
        requires_delegation: true,
        targets: ["74iy7-xqaaa-aaaaf-qagra-cai"],
      },
      returnState: { from: "landing" },
    });
  });

  it("completes a delegation round trip in ready() on the next load", async () => {
    const verify = spyVerify().mockImplementation(apiAccepts());
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect({
      requires_delegation: true,
      targets: ["74iy7-xqaaa-aaaaf-qagra-cai"],
      returnState: { from: "landing" },
    });
    const url = navigatedUrl(navigate);
    expect(url.searchParams.has("session_key")).toBe(false);
    expect(url.searchParams.get("session_pubkey")).toMatch(/^[A-Za-z0-9_-]+$/);
    // the secret only sits in this tab's sessionStorage
    const pending = JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!);
    const secretHex = JSON.parse(pending.sessionKey)[1];
    expect(url.href).not.toContain(secretHex);

    const message = await odinConnectMessage(url);
    returnWith(url, message);

    const { connect: app, state } = await reload();
    expect(state.status).toBe("ready");
    expect(state.user?.principal).toBe(message.principal);
    expect(state.user?.getIdentity()?.getPrincipal().toText()).toBe(
      message.principal
    );
    expect(state.request).toEqual({
      id: url.searchParams.get("request_id"),
      action: "connect",
      status: "success",
      input: {
        requires_api: false,
        requires_delegation: true,
        targets: ["74iy7-xqaaa-aaaaf-qagra-cai"],
      },
      returnState: { from: "landing" },
    });
    expect(app.user).toBe(state.user);
    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith({
      ...message.proof,
      audience: window.location.origin,
      nonce: url.searchParams.get("request_id"),
      issue_jwt: false,
      client_signature: expect.any(String),
    });
    // fragment scrubbed, query restored, pending consumed, session persisted
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?x=1");
    expect(sessionStorage.length).toBe(0);
    expect(app.isSessionValid()).toBe(true);
    // a later load (no fragment, cache gone) restores it from storage only
    resetRedirectOutcomes();
    const later = await reload();
    expect(later.state.user?.principal).toBe(message.principal);
    expect(later.state.request).toBeNull();
    expect(verify).toHaveBeenCalledOnce();
  });

  it("binds a connect without delegation to its session key too", async () => {
    const verify = spyVerify().mockImplementation(apiAccepts());
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect({ requires_api: true });
    const url = navigatedUrl(navigate);
    expect(url.searchParams.has("requires_delegation")).toBe(false);
    const sessionPubkey = url.searchParams.get("session_pubkey");
    expect(sessionPubkey).toMatch(/^[A-Za-z0-9_-]+$/);
    // the secret waits in this tab's sessionStorage only
    const pending = JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!);
    const secretHex = JSON.parse(pending.sessionKey)[1];
    expect(url.href).not.toContain(secretHex);
    // and never in the request's input
    expect(JSON.stringify(pending.input ?? null)).not.toContain(secretHex);

    const message = await odinConnectMessage(url);
    expect(JSON.parse(message.proof.payload).sk).toBe(sessionPubkey);
    returnWith(url, message);
    const { state } = await reload();
    expect(state.request?.status).toBe("success");
    expect(JSON.stringify(state.request)).not.toContain(secretHex);
    const body = verify.mock.calls[0][0];
    expect(body.payload).toBe(message.proof.payload);
    expect(clientSignatureValid(body)).toBe(true);
    expect(JSON.stringify(body)).not.toContain(secretHex);
    // the pending entry (with the secret) is gone after the round trip
    expect(sessionStorage.length).toBe(0);
    // an instance made after delivery restores the stored session only
    const again = await reload();
    expect(again.state.request).toBeNull();
    expect(again.state.user?.principal).toBe(message.principal);
    expect(again.state.user?.getIdentity()).toBeNull();
    expect(verify).toHaveBeenCalledOnce();
  });

  it("drops the pending session key on unverified and mismatched results", async () => {
    spyVerify().mockRejectedValue(new Error("401"));
    await returnFromConnect();
    expect(sessionStorage.length).toBe(1);
    expect((await reload()).state.request?.status).toBe("unverified");
    expect(sessionStorage.length).toBe(0);

    resetRedirectOutcomes();
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    expect(sessionStorage.length).toBe(1);
    returnWith(
      navigatedUrl(navigate),
      { principal: "aaaaa-aa" },
      { state: "someone-elses-state-value-000000" }
    );
    expect((await reload()).state.request).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("reports unverified when the pending request lost its session key", async () => {
    const verify = spyVerify();
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    const url = navigatedUrl(navigate);
    const key = sessionStorage.key(0)!;
    const pending = JSON.parse(sessionStorage.getItem(key)!);
    delete pending.sessionKey;
    sessionStorage.setItem(key, JSON.stringify(pending));
    returnWith(url, await odinConnectMessage(url));
    const { state } = await reload();
    expect(state.request).toMatchObject({
      action: "connect",
      status: "unverified",
      error: expect.stringContaining("no session key"),
    });
    expect(state.user).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it("gets the JWT for requires_api from odin-api only", async () => {
    spyVerify().mockImplementation(apiAccepts());
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect({ requires_api: true });
    const url = navigatedUrl(navigate);
    const message = await odinConnectMessage(url);
    returnWith(url, { ...message, jwt: "jwt-from-the-page" });

    const { connect: app, state } = await reload();
    expect(state.request?.status).toBe("success");
    expect(app.api.apiKey).toBe("jwt-from-api");
    expect(JSON.stringify(localStorage)).not.toContain("jwt-from-the-page");
  });

  it("reports unverified when odin-api refuses the proof", async () => {
    spyVerify().mockRejectedValue(new Error("Invalid signature"));
    const { url } = await returnFromConnect({
      requires_api: true,
      requires_delegation: true,
      targets: [],
      returnState: { step: 1 },
    });

    const { connect: app, state } = await reload();
    expect(state.user).toBeNull();
    expect(state.request).toEqual({
      id: url.searchParams.get("request_id"),
      action: "connect",
      status: "unverified",
      input: { requires_api: true, requires_delegation: true, targets: [] },
      error: expect.stringContaining("Invalid signature"),
      returnState: { step: 1 },
    });
    expect(localStorage.length).toBe(0);
    expect(app.isSessionValid()).toBe(false);
    expect(app.api.apiKey).toBeNull();
  });

  it("reports unverified when odin-api verifies another principal", async () => {
    spyVerify().mockResolvedValue({
      principal: "aaaaa-aa",
      username: null,
      jwt: "jwt",
    });
    await returnFromConnect({ requires_api: true });
    const { connect: app, state } = await reload();
    expect(state.request?.status).toBe("unverified");
    expect(state.user).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(app.api.apiKey).toBeNull();
  });

  it("reports unverified for a forged principal without calling the API", async () => {
    const verify = spyVerify().mockImplementation(apiAccepts());
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    const url = navigatedUrl(navigate);
    const victim =
      "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe";
    returnWith(url, await odinConnectMessage(url, { principal: victim }));

    const { state } = await reload();
    expect(state.request?.status).toBe("unverified");
    expect(state.user).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it("reports unverified for a hand-crafted result with no proof", async () => {
    const verify = spyVerify();
    await returnFromConnect({}, { principal: "aaaaa-aa", jwt: "x" });
    const { state } = await reload();
    expect(state.request).toMatchObject({
      action: "connect",
      status: "unverified",
      error: expect.stringContaining("no identity proof"),
    });
    expect(state.user).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("reports a rejected connect and consumes the pending request", async () => {
    await returnFromConnect({}, "rejected");
    const { state } = await reload();
    expect(state.request).toMatchObject({
      action: "connect",
      status: "rejected",
    });
    expect(state.request).not.toHaveProperty("error");
    expect(state.user).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(window.location.hash).toBe("");
  });

  it("ignores a result whose state does not match, and strips it", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    returnWith(
      navigatedUrl(navigate),
      { principal: "aaaaa-aa", jwt: null },
      { state: "someone-elses-state-value-000000" }
    );
    const { state } = await reload();
    expect(state).toEqual({ status: "ready", user: null, request: null });
    expect(window.location.hash).toBe("");
  });

  it("has no request when the URL has no redirect result", async () => {
    const { state } = await reload();
    expect(state).toEqual({ status: "ready", user: null, request: null });
  });

  it("reports unverified when requires_api gets no JWT from odin-api", async () => {
    spyVerify().mockImplementation(apiAccepts(null));
    await returnFromConnect({ requires_api: true });
    const { connect: app, state } = await reload();
    expect(state.request).toMatchObject({
      action: "connect",
      status: "unverified",
      error: expect.stringContaining("issued no API key"),
    });
    expect(app.api.apiKey).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("drops a pending request abandoned for over 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const connect = new Connect({ name: "test", mode: "redirect" });
      spyNavigate(connect);
      void connect.connect({ requires_delegation: true, targets: [] });
      expect(sessionStorage.length).toBe(1);

      // back on the app without a result, still within 10 minutes: kept
      vi.setSystemTime(Date.now() + PENDING_REDIRECT_MAX_AGE_MS);
      expect((await reload()).state.request).toBeNull();
      expect(sessionStorage.length).toBe(1);

      vi.setSystemTime(Date.now() + 1);
      expect((await reload()).state.request).toBeNull();
      expect(sessionStorage.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops an undated pending request (written before createdAt existed)", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    spyNavigate(connect);
    void connect.connect();
    const key = sessionStorage.key(0)!;
    const { createdAt, ...undated } = JSON.parse(sessionStorage.getItem(key)!);
    expect(typeof createdAt).toBe("number");
    sessionStorage.setItem(key, JSON.stringify(undated));
    await reload();
    expect(sessionStorage.length).toBe(0);
  });
});

describe("ready() is shared per page load", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is idempotent and started by the constructor", async () => {
    const verify = spyVerify().mockImplementation(apiAccepts());
    const { message } = await returnFromConnect({ requires_api: true });
    const app = new Connect({ name: "test" });
    // the constructor already read the URL
    expect(window.location.hash).toBe("");
    // initializing until the result is verified
    expect(app.state.status).toBe("initializing");
    const listener = vi.fn();
    app.subscribe(listener);
    const [a, b] = await Promise.all([app.ready(), app.ready()]);
    expect(a).toBe(b);
    expect(await app.ready()).toBe(a);
    expect(a.user?.principal).toBe(message.principal);
    // one transition: initializing -> ready (with the result applied)
    expect(listener).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledOnce();
  });

  it("two instances (React StrictMode) get one verified connect", async () => {
    const verify = spyVerify().mockImplementation(apiAccepts());
    const { message } = await returnFromConnect({
      requires_api: true,
      returnState: { step: 2 },
    });
    const first = new Connect({ name: "test" });
    const second = new Connect({ name: "test" });
    const [a, b] = await Promise.all([first.ready(), second.ready()]);
    expect(verify).toHaveBeenCalledOnce();
    for (const [state, instance] of [
      [a, first],
      [b, second],
    ] as const) {
      expect(state.request).toMatchObject({
        action: "connect",
        status: "success",
        returnState: { step: 2 },
      });
      expect(state.user?.principal).toBe(message.principal);
      // each instance gets the API key, not just the one that read the URL
      expect(instance.api.apiKey).toBe("jwt-from-api");
    }
  });

  it("an instance made after the outcome was delivered gets request: null and the stored user", async () => {
    const verify = spyVerify().mockImplementation(apiAccepts());
    const { message } = await returnFromConnect({ requires_api: true });
    // both exist while the result is verified (StrictMode): both get it
    const first = new Connect({ name: "test" });
    const second = new Connect({ name: "test" });
    const a = await first.ready();
    const b = await second.ready();
    expect(a.request?.status).toBe("success");
    expect(b.request?.status).toBe("success");
    // a later instance (e.g. per route) on the same page load
    const later = await reload();
    expect(later.state.request).toBeNull();
    expect(later.state.user?.principal).toBe(message.principal);
    expect(later.connect.api.apiKey).toBe("jwt-from-api");
    expect(verify).toHaveBeenCalledOnce();
  });

  it("disconnect() while a redirect connect is verified: not stored, not applied", async () => {
    const verify = spyVerify().mockImplementation(apiAccepts());
    // a previously stored session, which disconnect() ends too
    const { message: old } = await returnFromConnect({ requires_api: true });
    expect((await reload()).state.user?.principal).toBe(old.principal);
    resetRedirectOutcomes();

    let accept!: () => void;
    const accepts = apiAccepts();
    verify.mockImplementation(
      (body) =>
        new Promise((resolve) => {
          accept = () => resolve(accepts(body));
        })
    );
    await returnFromConnect({ requires_api: true });
    // StrictMode twins, both waiting for the verification
    const first = new Connect({ name: "test" });
    const second = new Connect({ name: "test" });
    await vi.waitFor(() => expect(accept).toBeTypeOf("function"));
    expect(first.state.status).toBe("initializing");
    first.disconnect();
    accept();
    for (const instance of [first, second]) {
      const state = await instance.ready();
      expect(state).toEqual({ status: "ready", user: null, request: null });
      expect(instance.api.apiKey).toBeNull();
    }
    expect(localStorage.length).toBe(0);
    expect(new Connect({ name: "test" }).restoreSession()).toBeNull();
  });

  it("an action outcome is not re-applied to a later instance", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased");
    // StrictMode: two instances in the same render, before anything settles
    const first = new Connect({ name: "test" });
    const second = new Connect({ name: "test" });
    expect((await first.ready()).request?.status).toBe("success");
    expect((await second.ready()).request?.status).toBe("success");
    expect((await reload()).state.request).toBeNull();
  });

  it("a non-persisted connect gives a later instance no user", async () => {
    spyVerify().mockImplementation(apiAccepts());
    await returnFromConnect();
    expect((await reload()).state.user).not.toBeNull();
    const later = await reload();
    expect(later.state).toEqual({ status: "ready", user: null, request: null });
  });

  it("shares an ignored stale result too, without unhandled rejections", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const connect = new Connect({ name: "test", mode: "redirect" });
      const navigate = spyNavigate(connect);
      void connect.connect();
      returnWith(
        navigatedUrl(navigate),
        { principal: "aaaaa-aa", jwt: null },
        { state: "someone-elses-state-value-000000" }
      );
      const first = new Connect({ name: "test" });
      const second = new Connect({ name: "test" });
      expect((await first.ready()).request).toBeNull();
      expect((await second.ready()).request).toBeNull();
      expect(window.location.hash).toBe("");
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
      // logged once per read, not once per instance
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toMatch(/stale or foreign redirect/);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("never hands the result to another slug or env", async () => {
    spyVerify().mockImplementation(apiAccepts());
    await returnFromConnect();
    const pending = new Connect({ name: "test" }).ready();
    expect((await reload({ name: "other" })).state.request).toBeNull();
    expect((await reload({ env: "dev" })).state.request).toBeNull();
    expect((await pending).request?.status).toBe("success");
  });

  it("forgets the shared result on disconnect()", async () => {
    spyVerify().mockImplementation(apiAccepts());
    await returnFromConnect();
    const { connect: app, state } = await reload();
    expect(state.request?.status).toBe("success");
    const listener = vi.fn();
    app.subscribe(listener);
    app.disconnect();
    expect(app.state).toEqual({ status: "ready", user: null, request: null });
    expect(listener).toHaveBeenCalledWith(app.state);
    expect((await reload()).state.request).toBeNull();
  });
});

describe("Action redirect mode", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects every action and applies success on the next load", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 5n });
    const url = navigatedUrl(navigate);
    expect(open).not.toHaveBeenCalled();
    expect(url.pathname).toBe("/authorize/buy");
    expect(url.searchParams.get("amount")).toBe("5");
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(connect.state.request).toMatchObject({
      action: "buy",
      status: "pending",
    });

    returnWith(url, "purchased");
    const { state } = await reload();
    expect(state.request).toEqual({
      id: url.searchParams.get("request_id"),
      action: "buy",
      status: "success",
      input: { token: "2jjj", btcAmount: 5n },
    });
    expect(
      typeof (state.request?.input as { btcAmount: unknown }).btcAmount
    ).toBe("bigint");
  });

  it("reports a rejected action as rejected", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.icrcApprove({
      principal: "p",
      token: "2jjj",
      spender: "aaaaa-aa",
      amount: 1n,
    });
    returnWith(navigatedUrl(navigate), "rejected");
    const { state } = await reload();
    expect(state.request).toMatchObject({
      action: "icrc_approve",
      status: "rejected",
    });
    expect(state.request).not.toHaveProperty("error");
  });

  it("reports any other message as failed", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.sell({ principal: "p", token: "2jjj", tokenAmount: 1n });
    returnWith(navigatedUrl(navigate), "error");
    const { state } = await reload();
    expect(state.request).toMatchObject({
      action: "sell",
      status: "failed",
      error: "Sell failed or was cancelled",
    });
  });

  it("exposes the icrc_approve block index as detail", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.icrcApprove({
      principal: "p",
      token: "2jjj",
      spender: "aaaaa-aa",
      amount: 1n,
      returnState: { step: "approve" },
    });
    const url = navigatedUrl(navigate);
    expect(url.searchParams.get("v")).toBe("2");
    expect(url.searchParams.get("request_id")).toBe(
      url.searchParams.get("state")
    );
    const detail = {
      block_index: "123456789012345678901",
      memo: "ab".repeat(32),
    };
    returnWith(url, "approved", { detail });
    const { state } = await reload();
    expect(state.request).toEqual({
      id: url.searchParams.get("request_id"),
      action: "icrc_approve",
      status: "success",
      input: { token: "2jjj", spender: "aaaaa-aa", amount: 1n },
      detail,
      returnState: { step: "approve" },
    });
  });

  it("omits detail when Odin sends none or a non-object", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased", { detail: "junk" });
    const { state } = await reload();
    expect(state.request?.status).toBe("success");
    expect(state.request).not.toHaveProperty("detail");
  });

  it("keeps the stored user next to an action result", async () => {
    spyVerify().mockImplementation(apiAccepts());
    const { message } = await returnFromConnect({ requires_api: true });
    const first = await reload({ mode: "redirect" });
    expect(first.state.user?.principal).toBe(message.principal);
    resetRedirectOutcomes();

    const navigate = spyNavigate(first.connect);
    void first.state.user!.sell({ token: "2jjj", tokenAmount: 1n });
    returnWith(navigatedUrl(navigate), "sold", { detail: { x: "1" } });

    const { connect: app, state } = await reload();
    expect(state.user?.principal).toBe(message.principal);
    expect(app.api.apiKey).toBe("jwt-from-api");
    expect(state.request).toMatchObject({
      action: "sell",
      status: "success",
      input: { token: "2jjj", tokenAmount: 1n },
      detail: { x: "1" },
    });
    expect(window.location.hash).toBe("");
  });
});

describe("returnState", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/migrate?step=2");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hands action returnState back after the redirect, keeping bigints", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    const returnState = { step: "commit", token: "2jjj", amount: 12345n };
    void connect.odin.icrcApprove({
      principal: "p",
      token: "2jjj",
      spender: "aaaaa-aa",
      amount: 12345n,
      returnState,
    });
    const url = navigatedUrl(navigate);
    // never sent to Odin
    expect(url.searchParams.has("returnState")).toBe(false);
    expect(url.href).not.toContain("commit");

    returnWith(url, "approved");
    const { state } = await reload();
    expect(state.request).toMatchObject({
      action: "icrc_approve",
      status: "success",
      returnState,
    });
    expect(
      typeof (state.request?.returnState as typeof returnState).amount
    ).toBe("bigint");
  });

  it("returns returnState on a rejected action too", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.transfer({
      principal: "p",
      token: "2jjj",
      amount: 1n,
      destination: "aaaaa-aa",
      returnState: { step: "transfer" },
    });
    returnWith(navigatedUrl(navigate), "rejected");
    expect((await reload()).state.request).toMatchObject({
      action: "transfer",
      status: "rejected",
      input: { token: "2jjj", amount: 1n, destination: "aaaaa-aa" },
      returnState: { step: "transfer" },
    });
  });

  it("hands connect returnState back", async () => {
    await returnFromConnect({ returnState: { from: "landing" } }, "rejected");
    expect((await reload()).state.request).toMatchObject({
      action: "connect",
      status: "rejected",
      returnState: { from: "landing" },
    });
  });

  it("is absent when not provided", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased");
    expect((await reload()).state.request).not.toHaveProperty("returnState");
  });

  it("fails a non-serializable returnState before navigating", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(
      connect.odin.buy({
        principal: "p",
        token: "2jjj",
        btcAmount: 1n,
        returnState: circular,
      })
    ).rejects.toThrow("returnState must be JSON-serializable");
    expect(navigate).not.toHaveBeenCalled();
    expect(connect.state.request).toMatchObject({
      action: "buy",
      status: "failed",
      error: expect.stringContaining("returnState must be JSON-serializable"),
    });
  });

  it("keeps createToken returnState and the File out of the redirect", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    vi.spyOn(connect.api, "uploadImage").mockResolvedValue("https://img");
    void connect.odin.createToken({
      principal: "p",
      name: "Token",
      ticker: "TKN",
      image: new File(["png-bytes"], "a.png"),
      buy: 1000n,
      returnState: { step: "create" },
    });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    const url = navigatedUrl(navigate);
    expect(url.pathname).toBe("/authorize/create_token");
    expect(url.searchParams.has("returnState")).toBe(false);
    expect(url.href).not.toContain("create%22");
    const pending = JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!);
    expect(JSON.stringify(pending)).not.toContain("png-bytes");

    returnWith(url, "tokenCreated");
    const { state } = await reload();
    expect(state.request).toEqual({
      id: url.searchParams.get("request_id"),
      action: "create_token",
      status: "success",
      input: { name: "Token", ticker: "TKN", buy: 1000n, image: "https://img" },
      returnState: { step: "create" },
    });
  });
});

describe("default mode is auto", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a popup on a desktop browser without any mode option", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
    );
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const connect = new Connect({ name: "test" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    expect(open).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("redirects in OKX and an Android webview without any mode option", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    for (const ua of [
      OKX_UA,
      "Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
    ]) {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
      const connect = new Connect({ name: "test" });
      const navigate = spyNavigate(connect);
      void connect.connect();
      expect(navigate).toHaveBeenCalledOnce();
      void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
      expect(navigate).toHaveBeenCalledTimes(2);
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("an explicit popup mode still opens a popup inside OKX", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(OKX_UA);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const connect = new Connect({ name: "test", mode: "popup" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    expect(open).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("deprecated restoreSession()", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app?x=1");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is synchronous and returns the stored session's user, as in 1.6.0", async () => {
    spyVerify().mockImplementation(apiAccepts());
    const { message } = await returnFromConnect({
      requires_api: true,
      requires_delegation: true,
      targets: ["74iy7-xqaaa-aaaaf-qagra-cai"],
    });
    // a stored session (as 1.6.0 left it) plus a new redirect result
    expect((await reload()).state.user?.principal).toBe(message.principal);
    resetRedirectOutcomes();
    const next = await returnFromConnect({ requires_api: true });
    expect(next.message.principal).not.toBe(message.principal);

    const app = new Connect({ name: "test" });
    // not a promise; does not wait for or apply the redirect result
    const user = app.restoreSession();
    expect(user).not.toBeInstanceOf(Promise);
    expect(user?.principal).toBe(message.principal);
    expect(user?.getIdentity()?.getPrincipal().toText()).toBe(
      message.principal
    );
    expect(app.state.status).toBe("initializing");
    // ready() applies it; restoreSession() then returns state.user
    const state = await app.ready();
    expect(state.user?.principal).toBe(next.message.principal);
    expect(app.restoreSession()).toBe(state.user);
    expect(app.api.apiKey).toBe("jwt-from-api");
  });

  it("returns null without a stored session", async () => {
    expect(new Connect({ name: "test" }).restoreSession()).toBeNull();
    await returnFromConnect({}, "rejected");
    const app = new Connect({ name: "test" });
    expect(app.restoreSession()).toBeNull();
    await app.ready();
    expect(app.restoreSession()).toBeNull();
  });

  it("a rejected re-connect keeps the stored session's user", async () => {
    spyVerify().mockImplementation(apiAccepts());
    const { message } = await returnFromConnect({ requires_api: true });
    expect((await reload()).state.user?.principal).toBe(message.principal);
    resetRedirectOutcomes();

    await returnFromConnect({}, "rejected");
    const { connect: app, state } = await reload();
    expect(state.request?.status).toBe("rejected");
    expect(state.user?.principal).toBe(message.principal);
    expect(app.restoreSession()?.principal).toBe(message.principal);
    expect(app.isSessionValid()).toBe(true);
  });
});

describe("sessions stored by 1.6.0 / 1.7.0 restore", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  it("restores a delegation + JWT session", async () => {
    const slug = new Connect({ name: "My App", env: "prod" }).slug;
    const root = Ed25519KeyIdentity.generate();
    const sessionKey = Ed25519KeyIdentity.generate();
    const chain = await DelegationChain.create(
      root,
      sessionKey.getPublicKey(),
      new Date(Date.now() + 3_600_000)
    );
    localStorage.setItem(
      `odin_connect:${slug}:prod:session`,
      JSON.stringify({
        principal: root.getPrincipal().toText(),
        sessionKey: JSON.stringify(sessionKey.toJSON()),
        delegationChain: JSON.stringify(chain.toJSON()),
        jwt: "old-jwt",
      })
    );
    const connect = new Connect({ name: "My App", env: "prod" });
    const { user } = await connect.ready();
    expect(user?.principal).toBe(root.getPrincipal().toText());
    expect(user?.getIdentity()?.getPrincipal().toText()).toBe(
      root.getPrincipal().toText()
    );
    expect(connect.api.apiKey).toBe("old-jwt");
    expect(connect.restoreSession()).toBe(user);
  });

  it("restores a JWT-only session and clears an expired delegation", async () => {
    const slug = new Connect({ name: "My App", env: "prod" }).slug;
    const key = `odin_connect:${slug}:prod:session`;
    localStorage.setItem(
      key,
      JSON.stringify({
        principal: "aaaaa-aa",
        // 1.6.0 stored the key even without a delegation
        sessionKey: JSON.stringify(Ed25519KeyIdentity.generate().toJSON()),
        delegationChain: null,
        jwt: "old-jwt",
      })
    );
    const connect = new Connect({ name: "My App", env: "prod" });
    expect((await connect.ready()).user?.principal).toBe("aaaaa-aa");
    expect(connect.api.apiKey).toBe("old-jwt");

    const root = Ed25519KeyIdentity.generate();
    const sessionKey = Ed25519KeyIdentity.generate();
    const expired = await DelegationChain.create(
      root,
      sessionKey.getPublicKey(),
      new Date(Date.now() - 1000)
    );
    localStorage.setItem(
      key,
      JSON.stringify({
        principal: root.getPrincipal().toText(),
        sessionKey: JSON.stringify(sessionKey.toJSON()),
        delegationChain: JSON.stringify(expired.toJSON()),
        jwt: null,
      })
    );
    expect(
      (await new Connect({ name: "My App", env: "prod" }).ready()).user
    ).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });
});

describe("query-less return_url", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/migrate?step=2&x=1#top");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function pendingKey(): string {
    return sessionStorage.key(0)!;
  }

  it("sends origin + path only, and keeps the full page URL in the pending entry", () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    const url = navigatedUrl(navigate);
    expect(url.searchParams.get("return_url")).toBe(
      `${window.location.origin}/migrate`
    );
    const pending = JSON.parse(sessionStorage.getItem(pendingKey())!);
    expect(pending.returnHref).toBe(
      `${window.location.origin}/migrate?step=2&x=1`
    );
  });

  it("restores the query after a redirect connect", async () => {
    spyVerify().mockImplementation(apiAccepts());
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect({ requires_delegation: true });
    const url = navigatedUrl(navigate);
    returnWith(url, await odinConnectMessage(url));
    window.history.replaceState({ app: 1 }, "", window.location.href);
    expect(window.location.search).toBe("");

    const { state } = await reload();
    expect(state.user).not.toBeNull();
    expect(window.location.pathname).toBe("/migrate");
    expect(window.location.search).toBe("?step=2&x=1");
    expect(window.location.hash).toBe("");
    expect(window.history.state).toEqual({ app: 1 });
    // a later instance does not re-apply it and leaves the URL alone
    expect((await reload()).state.request).toBeNull();
    expect(window.location.search).toBe("?step=2&x=1");
  });

  it("restores the query after an action redirect", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased");
    expect(window.location.search).toBe("");

    expect((await reload()).state.request?.status).toBe("success");
    expect(window.location.search).toBe("?step=2&x=1");
    expect(window.location.hash).toBe("");
  });

  it("only strips the fragment for a pending entry saved without returnHref", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.sell({ principal: "p", token: "2jjj", tokenAmount: 1n });
    const old = JSON.parse(sessionStorage.getItem(pendingKey())!);
    delete old.returnHref;
    sessionStorage.setItem(pendingKey(), JSON.stringify(old));
    returnWith(navigatedUrl(navigate), "sold");

    expect((await reload()).state.request?.status).toBe("success");
    expect(window.location.pathname).toBe("/migrate");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("does not restore a query for a mismatched result", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased", { state: "other" });

    expect((await reload()).state.request).toBeNull();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("does not restore a query from another path", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased");
    const key = pendingKey();
    const pending = JSON.parse(sessionStorage.getItem(key)!);
    pending.returnHref = `${window.location.origin}/elsewhere?evil=1`;
    sessionStorage.setItem(key, JSON.stringify(pending));

    expect((await reload()).state.request?.status).toBe("success");
    expect(window.location.pathname).toBe("/migrate");
    expect(window.location.search).toBe("");
  });
});

describe("Odin page return_url rule (stand-in)", () => {
  const origin = "https://app.example";

  function authorize(returnUrl: string, referrer = origin): URL {
    const url = new URL("https://odin.fun/authorize/connect");
    url.searchParams.set("referrer", referrer);
    url.searchParams.set("return_url", returnUrl);
    return url;
  }

  it("accepts any path on the referrer origin", () => {
    expect(odinReturnTarget(authorize(`${origin}/`)).href).toBe(`${origin}/`);
    expect(odinReturnTarget(authorize(`${origin}/a/b/c`)).href).toBe(
      `${origin}/a/b/c`
    );
    expect(
      odinReturnTarget(
        authorize("http://localhost:5173/app", "http://localhost:5173")
      ).href
    ).toBe("http://localhost:5173/app");
  });

  it.each([
    [`${origin}/migrate?step=2`, "query"],
    [`${origin}/migrate?`, "query"],
    [`${origin}/go?to=https://evil.example`, "query"],
    [`${origin}/migrate#x`, "fragment"],
    [`${origin}/migrate#`, "fragment"],
    ["https://evil.example/migrate", "origin"],
    ["http://app.example/migrate", "origin"],
    ["https://user:pw@app.example/migrate", "credentials"],
    ["not a url", "not a URL"],
  ])("rejects %s", (returnUrl, reason) => {
    expect(() => odinReturnTarget(authorize(returnUrl))).toThrow(reason);
  });

  it("rejects plain http off loopback", () => {
    expect(() =>
      odinReturnTarget(authorize("http://app.example/x", "http://app.example"))
    ).toThrow("origin");
  });

  it("refuses to answer a connect with a query in return_url", async () => {
    await expect(
      odinConnectMessage(authorize(`${origin}/migrate?step=2`))
    ).rejects.toThrow("query");
  });
});
