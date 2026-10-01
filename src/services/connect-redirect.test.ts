import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelegationChain, Ed25519KeyIdentity } from "@dfinity/identity";
import { OdinApiClient } from "./api";
import { Connect, resetRedirectOutcomes } from "./connect";
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

  it("completes a delegation round trip through restoreSession", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
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

    // restoreSession finishes the redirect connect
    const restored = await connect.restoreSession();
    expect(restored?.principal).toBe(message.principal);
    expect(restored?.getIdentity()?.getPrincipal().toText()).toBe(
      message.principal
    );

    // handleRedirectResult still reports it, from the same read
    const result = await connect.handleRedirectResult();
    expect(verify).toHaveBeenCalledOnce();
    expect(result?.action).toBe("connect");
    expect(result?.status).toBe("connected");
    expect(result?.returnState).toEqual({ from: "landing" });
    expect(verify).toHaveBeenCalledWith({
      ...message.proof,
      audience: window.location.origin,
      nonce: url.searchParams.get("request_id"),
      issue_jwt: false,
      client_signature: expect.any(String),
    });
    if (result?.action === "connect" && result.status === "connected") {
      expect(result.user.principal).toBe(message.principal);
      expect(result.user.getIdentity()?.getPrincipal().toText()).toBe(
        message.principal
      );
    }
    // fragment scrubbed, pending request consumed, session persisted
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?x=1");
    expect(sessionStorage.length).toBe(0);
    expect(connect.isSessionValid()).toBe(true);
    expect((await connect.restoreSession())?.principal).toBe(message.principal);
  });

  it("binds a connect without delegation to its session key too", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
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

    const message = await odinConnectMessage(url);
    expect(JSON.parse(message.proof.payload).sk).toBe(sessionPubkey);
    returnWith(url, message);
    const result = await connect.handleRedirectResult();
    expect(result?.status).toBe("connected");
    const body = verify.mock.calls[0][0];
    expect(body.payload).toBe(message.proof.payload);
    expect(clientSignatureValid(body)).toBe(true);
    expect(JSON.stringify(body)).not.toContain(secretHex);
    // the pending entry (with the secret) is gone after the round trip
    expect(sessionStorage.length).toBe(0);
    // a second read comes from the outcome cache, which holds no key
    const again = await new Connect({
      name: "test",
      mode: "redirect",
    }).handleRedirectResult();
    expect(again?.status).toBe("connected");
    if (again?.action === "connect" && again.status === "connected") {
      expect(again.user.getIdentity()).toBeNull();
    }
    expect(verify).toHaveBeenCalledOnce();
  });

  it("drops the pending session key on unverified and mismatched results", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    vi.spyOn(connect.api, "verifyConnect").mockRejectedValue(new Error("401"));
    const navigate = spyNavigate(connect);
    void connect.connect();
    const url = navigatedUrl(navigate);
    expect(sessionStorage.length).toBe(1);
    returnWith(url, await odinConnectMessage(url));
    expect((await connect.handleRedirectResult())?.status).toBe("unverified");
    expect(sessionStorage.length).toBe(0);

    resetRedirectOutcomes();
    navigate.mockClear();
    void connect.connect();
    expect(sessionStorage.length).toBe(1);
    returnWith(
      navigatedUrl(navigate),
      { principal: "aaaaa-aa" },
      { state: "someone-elses-state-value-000000" }
    );
    await expect(connect.handleRedirectResult()).rejects.toThrow();
    expect(sessionStorage.length).toBe(0);
  });

  it("reports unverified when the pending request lost its session key", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const verify = vi.spyOn(connect.api, "verifyConnect");
    const navigate = spyNavigate(connect);
    void connect.connect();
    const url = navigatedUrl(navigate);
    const key = sessionStorage.key(0)!;
    const pending = JSON.parse(sessionStorage.getItem(key)!);
    delete pending.sessionKey;
    sessionStorage.setItem(key, JSON.stringify(pending));
    returnWith(url, await odinConnectMessage(url));
    expect(await connect.handleRedirectResult()).toMatchObject({
      action: "connect",
      status: "unverified",
      error: expect.stringContaining("no session key"),
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("gets the JWT for requires_api from odin-api only", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const navigate = spyNavigate(connect);
    void connect.connect({ requires_api: true });
    const url = navigatedUrl(navigate);
    const message = await odinConnectMessage(url);
    returnWith(url, { ...message, jwt: "jwt-from-the-page" });

    const result = await connect.handleRedirectResult();
    expect(result?.status).toBe("connected");
    expect(connect.api.apiKey).toBe("jwt-from-api");
    expect(JSON.stringify(localStorage)).not.toContain("jwt-from-the-page");
  });

  it("reports unverified when odin-api refuses the proof", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    vi.spyOn(connect.api, "verifyConnect").mockRejectedValue(
      new Error("Invalid signature")
    );
    const navigate = spyNavigate(connect);
    void connect.connect({
      requires_api: true,
      requires_delegation: true,
      targets: [],
      returnState: { step: 1 },
    });
    const url = navigatedUrl(navigate);
    returnWith(url, await odinConnectMessage(url));

    const result = await connect.handleRedirectResult();
    expect(result).toEqual({
      action: "connect",
      status: "unverified",
      error: expect.stringContaining("Invalid signature"),
      returnState: { step: 1 },
    });
    expect(localStorage.length).toBe(0);
    expect(connect.isSessionValid()).toBe(false);
    expect(connect.api.apiKey).toBeNull();
  });

  it("reports unverified when odin-api verifies another principal", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    vi.spyOn(connect.api, "verifyConnect").mockResolvedValue({
      principal: "aaaaa-aa",
      username: null,
      jwt: "jwt",
    });
    const navigate = spyNavigate(connect);
    void connect.connect({ requires_api: true });
    const url = navigatedUrl(navigate);
    returnWith(url, await odinConnectMessage(url));

    const result = await connect.handleRedirectResult();
    expect(result?.status).toBe("unverified");
    expect(localStorage.length).toBe(0);
    expect(connect.api.apiKey).toBeNull();
  });

  it("reports unverified for a forged principal without calling the API", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const navigate = spyNavigate(connect);
    void connect.connect();
    const url = navigatedUrl(navigate);
    const victim =
      "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe";
    returnWith(url, await odinConnectMessage(url, { principal: victim }));

    const result = await connect.handleRedirectResult();
    expect(result?.status).toBe("unverified");
    expect(verify).not.toHaveBeenCalled();
  });

  it("reports unverified for a hand-crafted result with no proof", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const verify = vi.spyOn(connect.api, "verifyConnect");
    const navigate = spyNavigate(connect);
    void connect.connect();
    returnWith(navigatedUrl(navigate), { principal: "aaaaa-aa", jwt: "x" });

    const result = await connect.handleRedirectResult();
    expect(result).toMatchObject({
      action: "connect",
      status: "unverified",
      error: expect.stringContaining("no identity proof"),
    });
    expect(verify).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("reports a rejected connect and consumes the pending request", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    returnWith(navigatedUrl(navigate), "rejected");
    expect(await connect.handleRedirectResult()).toEqual({
      action: "connect",
      status: "rejected",
    });
    expect(sessionStorage.length).toBe(0);
    expect(window.location.hash).toBe("");
  });

  it("refuses a result whose state does not match", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    returnWith(
      navigatedUrl(navigate),
      { principal: "aaaaa-aa", jwt: null },
      { state: "someone-elses-state-value-000000" }
    );
    await expect(connect.handleRedirectResult()).rejects.toThrow(
      "Unexpected OdinConnect redirect result"
    );
  });

  it("returns null when the URL has no redirect result", async () => {
    const connect = new Connect({ name: "test" });
    expect(await connect.handleRedirectResult()).toBeNull();
  });

  it("reports unverified when requires_api gets no JWT from odin-api", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts(null));
    const navigate = spyNavigate(connect);
    void connect.connect({ requires_api: true });
    const url = navigatedUrl(navigate);
    returnWith(url, await odinConnectMessage(url));

    expect(await connect.handleRedirectResult()).toMatchObject({
      action: "connect",
      status: "unverified",
      error: expect.stringContaining("issued no API key"),
    });
    expect(connect.api.apiKey).toBeNull();
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
      expect(await connect.handleRedirectResult()).toBeNull();
      expect(sessionStorage.length).toBe(1);

      vi.setSystemTime(Date.now() + 1);
      expect(await connect.handleRedirectResult()).toBeNull();
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
    expect(await connect.handleRedirectResult()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});

describe("handleRedirectResult is idempotent per page load", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Start a redirect connect on `connect` and come back with a valid result. */
  async function returnFromConnect(
    connect: Connect,
    options: Parameters<Connect["connect"]>[0] = {}
  ) {
    const navigate = spyNavigate(connect);
    void connect.connect(options);
    const url = navigatedUrl(navigate);
    const message = await odinConnectMessage(url);
    returnWith(url, message);
    navigate.mockRestore();
    return message;
  }

  it("resolves concurrent calls on two instances to one verified connect", async () => {
    // React StrictMode: the effect runs twice, each with a new OdinConnect
    const verify = vi
      .spyOn(OdinApiClient.prototype, "verifyConnect")
      .mockImplementation(apiAccepts());
    const first = new Connect({ name: "test", mode: "redirect" });
    const message = await returnFromConnect(first, {
      requires_api: true,
      returnState: { step: 2 },
    });
    const second = new Connect({ name: "test", mode: "redirect" });

    const [a, b] = await Promise.all([
      first.handleRedirectResult(),
      second.handleRedirectResult(),
    ]);
    expect(verify).toHaveBeenCalledOnce();
    for (const [result, instance] of [
      [a, first],
      [b, second],
    ] as const) {
      expect(result).toMatchObject({
        action: "connect",
        status: "connected",
        returnState: { step: 2 },
      });
      if (result?.action === "connect" && result.status === "connected") {
        expect(result.user.principal).toBe(message.principal);
      }
      // each instance gets the API key, not just the one that read the URL
      expect(instance.api.apiKey).toBe("jwt-from-api");
    }
    expect((await second.restoreSession())?.principal).toBe(message.principal);
  });

  it("returns the same outcome to a call made after the first settled", async () => {
    const verify = vi
      .spyOn(OdinApiClient.prototype, "verifyConnect")
      .mockImplementation(apiAccepts());
    const first = new Connect({ name: "test", mode: "redirect" });
    const message = await returnFromConnect(first);
    const a = await first.handleRedirectResult();
    const b = await new Connect({ name: "test" }).handleRedirectResult();
    expect(a?.status).toBe("connected");
    expect(b?.status).toBe("connected");
    if (b?.action === "connect" && b.status === "connected") {
      expect(b.user.principal).toBe(message.principal);
    }
    expect(verify).toHaveBeenCalledOnce();
  });

  it("shares a rejected redirect result too", async () => {
    const first = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(first);
    void first.connect();
    returnWith(
      navigatedUrl(navigate),
      { principal: "aaaaa-aa", jwt: null },
      { state: "someone-elses-state-value-000000" }
    );
    const second = new Connect({ name: "test" });
    await expect(first.handleRedirectResult()).rejects.toThrow(
      "Unexpected OdinConnect redirect result"
    );
    await expect(second.handleRedirectResult()).rejects.toThrow(
      "Unexpected OdinConnect redirect result"
    );
  });

  it("never hands the result to another slug or env", async () => {
    vi.spyOn(OdinApiClient.prototype, "verifyConnect").mockImplementation(
      apiAccepts()
    );
    const first = new Connect({ name: "test", mode: "redirect" });
    await returnFromConnect(first);
    const pending = first.handleRedirectResult();
    expect(
      await new Connect({
        name: "other",
        mode: "redirect",
      }).handleRedirectResult()
    ).toBeNull();
    expect(
      await new Connect({ name: "test", env: "dev" }).handleRedirectResult()
    ).toBeNull();
    expect((await pending)?.status).toBe("connected");
  });

  it("forgets the shared result on disconnect()", async () => {
    vi.spyOn(OdinApiClient.prototype, "verifyConnect").mockImplementation(
      apiAccepts()
    );
    const first = new Connect({ name: "test", mode: "redirect" });
    await returnFromConnect(first);
    expect((await first.handleRedirectResult())?.status).toBe("connected");
    first.disconnect();
    expect(
      await new Connect({ name: "test" }).handleRedirectResult()
    ).toBeNull();
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

  it("redirects every action and reports success", async () => {
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
    expect(await connect.handleRedirectResult()).toEqual({
      action: "buy",
      status: "success",
    });
  });

  it("reports a rejected action as failed", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.icrcApprove({
      principal: "p",
      token: "2jjj",
      spender: "aaaaa-aa",
      amount: 1n,
    });
    returnWith(navigatedUrl(navigate), "rejected");
    expect(await connect.handleRedirectResult()).toEqual({
      action: "icrc_approve",
      status: "failed",
    });
  });

  it("exposes the icrc_approve block index from the result detail", async () => {
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
    expect(await connect.handleRedirectResult()).toEqual({
      action: "icrc_approve",
      status: "success",
      detail,
      returnState: { step: "approve" },
    });
  });

  it("omits detail when Odin sends none or a non-object", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased", { detail: "junk" });
    const result = await connect.handleRedirectResult();
    expect(result).not.toHaveProperty("detail");
  });

  it("restoreSession leaves action results for handleRedirectResult", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.sell({ principal: "p", token: "2jjj", tokenAmount: 1n });
    returnWith(navigatedUrl(navigate), "sold");

    expect(await connect.restoreSession()).toBeNull();
    expect(window.location.hash).not.toBe("");
    expect(await connect.handleRedirectResult()).toEqual({
      action: "sell",
      status: "success",
    });
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
    const result = await connect.handleRedirectResult<typeof returnState>();
    expect(result).toEqual({
      action: "icrc_approve",
      status: "success",
      returnState,
    });
    expect(typeof result?.returnState?.amount).toBe("bigint");
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
    expect(await connect.handleRedirectResult()).toEqual({
      action: "transfer",
      status: "failed",
      returnState: { step: "transfer" },
    });
  });

  it("hands connect returnState back", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect({ returnState: { from: "landing" } });
    returnWith(navigatedUrl(navigate), "rejected");
    expect(await connect.handleRedirectResult()).toEqual({
      action: "connect",
      status: "rejected",
      returnState: { from: "landing" },
    });
  });

  it("is undefined when not provided", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased");
    expect((await connect.handleRedirectResult())?.returnState).toBeUndefined();
  });

  it("rejects a non-serializable returnState before navigating", async () => {
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
  });

  it("keeps createToken returnState out of the authorize URL", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    vi.spyOn(connect.api, "uploadImage").mockResolvedValue("https://img");
    void connect.odin.createToken({
      principal: "p",
      name: "Token",
      ticker: "TKN",
      image: new File([], "a.png"),
      returnState: { step: "create" },
    });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    const url = navigatedUrl(navigate);
    expect(url.pathname).toBe("/authorize/create_token");
    expect(url.searchParams.has("returnState")).toBe(false);
    expect(url.href).not.toContain("create%22");
  });

  it("is ignored in popup mode", async () => {
    const connect = new Connect({ name: "test" });
    vi.spyOn(window, "open").mockReturnValue(null);
    await expect(
      connect.odin.buy({
        principal: "p",
        token: "2jjj",
        btcAmount: 1n,
        returnState: { step: "x" },
      })
    ).rejects.toThrow();
    expect(sessionStorage.length).toBe(0);
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

describe("restoreSession finishes a redirect connect", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app?x=1");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Start a redirect connect and come back with `message` (default: valid). */
  async function returnFromConnect(
    connect: Connect,
    options: Parameters<Connect["connect"]>[0] = {},
    message?: unknown
  ) {
    const navigate = spyNavigate(connect);
    void connect.connect(options);
    const url = navigatedUrl(navigate);
    const sent = message ?? (await odinConnectMessage(url));
    returnWith(url, sent);
    navigate.mockRestore();
    return sent as Awaited<ReturnType<typeof odinConnectMessage>>;
  }

  it("returns the user of a requires_api + delegation connect", async () => {
    const verify = vi
      .spyOn(OdinApiClient.prototype, "verifyConnect")
      .mockImplementation(apiAccepts());
    const connect = new Connect({ name: "test", mode: "redirect" });
    const message = await returnFromConnect(connect, {
      requires_api: true,
      requires_delegation: true,
      targets: ["74iy7-xqaaa-aaaaf-qagra-cai"],
    });

    const user = await connect.restoreSession();
    expect(user?.principal).toBe(message.principal);
    expect(user?.getIdentity()?.getPrincipal().toText()).toBe(
      message.principal
    );
    expect(connect.api.apiKey).toBe("jwt-from-api");
    expect(verify).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?x=1");
    expect(sessionStorage.length).toBe(0);
    expect(connect.isSessionValid()).toBe(true);
    expect(connect.lastRedirectResult).toMatchObject({
      action: "connect",
      status: "connected",
    });

    // a later load (no fragment, cache gone) restores it from storage
    resetRedirectOutcomes();
    const later = new Connect({ name: "test" });
    expect((await later.restoreSession())?.principal).toBe(message.principal);
    expect(later.api.apiKey).toBe("jwt-from-api");
    expect(verify).toHaveBeenCalledOnce();
  });

  it("returns the user of a connect without api or delegation (nothing stored)", async () => {
    const verify = vi
      .spyOn(OdinApiClient.prototype, "verifyConnect")
      .mockImplementation(apiAccepts());
    const connect = new Connect({ name: "test", mode: "redirect" });
    const message = await returnFromConnect(connect);

    const user = await connect.restoreSession();
    expect(user?.principal).toBe(message.principal);
    expect(user?.getIdentity()).toBeNull();
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(verify).toHaveBeenCalledOnce();
  });

  it("returns null for a rejected connect", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    await returnFromConnect(connect, { returnState: { step: 1 } }, "rejected");
    expect(await connect.restoreSession()).toBeNull();
    expect(window.location.hash).toBe("");
    expect(sessionStorage.length).toBe(0);
    expect(connect.lastRedirectResult).toEqual({
      action: "connect",
      status: "rejected",
      returnState: { step: 1 },
    });
    // handleRedirectResult still reports the rejection
    expect(await connect.handleRedirectResult()).toEqual({
      action: "connect",
      status: "rejected",
      returnState: { step: 1 },
    });
  });

  it("returns null on a rejected re-connect but keeps the stored session", async () => {
    vi.spyOn(OdinApiClient.prototype, "verifyConnect").mockImplementation(
      apiAccepts()
    );
    const connect = new Connect({ name: "test", mode: "redirect" });
    const message = await returnFromConnect(connect, { requires_api: true });
    expect((await connect.restoreSession())?.principal).toBe(message.principal);
    resetRedirectOutcomes();

    await returnFromConnect(connect, {}, "rejected");
    expect(await connect.restoreSession()).toBeNull();
    expect(connect.isSessionValid()).toBe(true);
    // the next load, without the result, restores the earlier session
    resetRedirectOutcomes();
    expect((await connect.restoreSession())?.principal).toBe(message.principal);
  });

  it("returns null for an unverified connect and stores nothing", async () => {
    const verify = vi
      .spyOn(OdinApiClient.prototype, "verifyConnect")
      .mockRejectedValue(new Error("Invalid signature"));
    const connect = new Connect({ name: "test", mode: "redirect" });
    await returnFromConnect(connect, { requires_api: true });
    expect(await connect.restoreSession()).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(connect.api.apiKey).toBeNull();
    const result = await connect.handleRedirectResult();
    expect(result).toMatchObject({
      action: "connect",
      status: "unverified",
      error: expect.stringContaining("Invalid signature"),
    });
    expect(verify).toHaveBeenCalledOnce();
  });

  it("restoreSession then handleRedirectResult share one verified read", async () => {
    const verify = vi
      .spyOn(OdinApiClient.prototype, "verifyConnect")
      .mockImplementation(apiAccepts());
    const first = new Connect({ name: "test", mode: "redirect" });
    const message = await returnFromConnect(first, {
      requires_api: true,
      returnState: { step: 2 },
    });
    expect((await first.restoreSession())?.principal).toBe(message.principal);

    // StrictMode-style second instance, after the fragment is gone
    const second = new Connect({ name: "test" });
    const result = await second.handleRedirectResult();
    expect(result).toMatchObject({
      action: "connect",
      status: "connected",
      returnState: { step: 2 },
    });
    if (result?.action === "connect" && result.status === "connected") {
      expect(result.user.principal).toBe(message.principal);
    }
    expect(second.api.apiKey).toBe("jwt-from-api");
    expect(await first.handleRedirectResult()).toMatchObject({
      status: "connected",
    });
    expect(verify).toHaveBeenCalledOnce();
  });

  it("handleRedirectResult then restoreSession share one verified read", async () => {
    const verify = vi
      .spyOn(OdinApiClient.prototype, "verifyConnect")
      .mockImplementation(apiAccepts());
    const first = new Connect({ name: "test", mode: "redirect" });
    // no api / delegation: nothing is stored, only the shared read has it
    const message = await returnFromConnect(first);
    expect((await first.handleRedirectResult())?.status).toBe("connected");
    expect(window.location.hash).toBe("");
    expect(localStorage.length).toBe(0);

    expect((await first.restoreSession())?.principal).toBe(message.principal);
    const second = new Connect({ name: "test" });
    expect((await second.restoreSession())?.principal).toBe(message.principal);
    expect(verify).toHaveBeenCalledOnce();
  });

  it("concurrent restoreSession and handleRedirectResult read once", async () => {
    const verify = vi
      .spyOn(OdinApiClient.prototype, "verifyConnect")
      .mockImplementation(apiAccepts());
    const first = new Connect({ name: "test", mode: "redirect" });
    const message = await returnFromConnect(first);
    const [user, result] = await Promise.all([
      first.restoreSession(),
      new Connect({ name: "test" }).handleRedirectResult(),
    ]);
    expect(user?.principal).toBe(message.principal);
    expect(result?.status).toBe("connected");
    expect(verify).toHaveBeenCalledOnce();
  });

  it("leaves an action result in the URL and returns the stored session", async () => {
    vi.spyOn(OdinApiClient.prototype, "verifyConnect").mockImplementation(
      apiAccepts()
    );
    const connect = new Connect({ name: "test", mode: "redirect" });
    const message = await returnFromConnect(connect, { requires_api: true });
    await connect.restoreSession();
    resetRedirectOutcomes();

    const navigate = spyNavigate(connect);
    void connect.odin.sell({ principal: "p", token: "2jjj", tokenAmount: 1n });
    returnWith(navigatedUrl(navigate), "sold", { detail: { x: "1" } });

    const fresh = new Connect({ name: "test" });
    expect((await fresh.restoreSession())?.principal).toBe(message.principal);
    expect(window.location.hash).not.toBe("");
    expect(sessionStorage.length).toBe(1);
    expect(fresh.lastRedirectResult).toBeNull();
    expect(await fresh.handleRedirectResult()).toEqual({
      action: "sell",
      status: "success",
      detail: { x: "1" },
    });
    // an already-read action result is still not a connect
    expect((await fresh.restoreSession())?.principal).toBe(message.principal);
  });

  it("falls back to the stored session on a stale connect result", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect();
    returnWith(
      navigatedUrl(navigate),
      { principal: "aaaaa-aa", jwt: null },
      { state: "someone-elses-state-value-000000" }
    );
    expect(await connect.restoreSession()).toBeNull();
    await expect(connect.handleRedirectResult()).rejects.toThrow(
      "Unexpected OdinConnect redirect result"
    );
  });

  it("drops a pending request abandoned for over 10 minutes", async () => {
    vi.useFakeTimers();
    try {
      const connect = new Connect({ name: "test", mode: "redirect" });
      const navigate = spyNavigate(connect);
      void connect.connect();
      navigate.mockRestore();
      vi.advanceTimersByTime(PENDING_REDIRECT_MAX_AGE_MS + 1);
      expect(await new Connect({ name: "test" }).restoreSession()).toBeNull();
      expect(sessionStorage.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("restoreSession reads sessions stored by 1.6.0 / 1.7.0", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app");
    sessionStorage.clear();
    localStorage.clear();
    resetRedirectOutcomes();
  });

  it("restores a delegation + JWT session", async () => {
    const connect = new Connect({ name: "My App", env: "prod" });
    const root = Ed25519KeyIdentity.generate();
    const sessionKey = Ed25519KeyIdentity.generate();
    const chain = await DelegationChain.create(
      root,
      sessionKey.getPublicKey(),
      new Date(Date.now() + 3_600_000)
    );
    localStorage.setItem(
      `odin_connect:${connect.slug}:prod:session`,
      JSON.stringify({
        principal: root.getPrincipal().toText(),
        sessionKey: JSON.stringify(sessionKey.toJSON()),
        delegationChain: JSON.stringify(chain.toJSON()),
        jwt: "old-jwt",
      })
    );
    const user = await connect.restoreSession();
    expect(user?.principal).toBe(root.getPrincipal().toText());
    expect(user?.getIdentity()?.getPrincipal().toText()).toBe(
      root.getPrincipal().toText()
    );
    expect(connect.api.apiKey).toBe("old-jwt");
  });

  it("restores a JWT-only session and clears an expired delegation", async () => {
    const connect = new Connect({ name: "My App", env: "prod" });
    const key = `odin_connect:${connect.slug}:prod:session`;
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
    expect((await connect.restoreSession())?.principal).toBe("aaaaa-aa");
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
    expect(await connect.restoreSession()).toBeNull();
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
    vi.spyOn(OdinApiClient.prototype, "verifyConnect").mockImplementation(
      apiAccepts()
    );
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.connect({ requires_delegation: true });
    const url = navigatedUrl(navigate);
    returnWith(url, await odinConnectMessage(url));
    window.history.replaceState({ app: 1 }, "", window.location.href);
    expect(window.location.search).toBe("");

    const user = await connect.restoreSession();
    expect(user).not.toBeNull();
    expect(window.location.pathname).toBe("/migrate");
    expect(window.location.search).toBe("?step=2&x=1");
    expect(window.location.hash).toBe("");
    expect(window.history.state).toEqual({ app: 1 });
    // a later read comes from the outcome cache and leaves the URL alone
    expect((await connect.handleRedirectResult())?.status).toBe("connected");
    expect(window.location.search).toBe("?step=2&x=1");
  });

  it("restores the query after an action redirect", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased");
    expect(window.location.search).toBe("");

    expect(await connect.restoreSession()).toBeNull();
    // the action result waits for handleRedirectResult()
    expect(window.location.hash).not.toBe("");
    expect(await connect.handleRedirectResult()).toEqual({
      action: "buy",
      status: "success",
    });
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

    expect(await connect.handleRedirectResult()).toEqual({
      action: "sell",
      status: "success",
    });
    expect(window.location.pathname).toBe("/migrate");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("does not restore a query for a mismatched result", async () => {
    const connect = new Connect({ name: "test", mode: "redirect" });
    const navigate = spyNavigate(connect);
    void connect.odin.buy({ principal: "p", token: "2jjj", btcAmount: 1n });
    returnWith(navigatedUrl(navigate), "purchased", { state: "other" });

    await expect(connect.handleRedirectResult()).rejects.toThrow(
      "Unexpected OdinConnect redirect result"
    );
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

    expect((await connect.handleRedirectResult())?.status).toBe("success");
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
