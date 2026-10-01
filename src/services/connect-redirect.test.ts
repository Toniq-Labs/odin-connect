import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OdinApiClient } from "./api";
import { Connect, resetRedirectOutcomes } from "./connect";
import { PENDING_REDIRECT_MAX_AGE_MS, REDIRECT_RESULT_KEY } from "./redirect";
import {
  apiAccepts,
  clientSignatureValid,
  odinConnectMessage,
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

  it("completes a delegation round trip, then restoreSession reads storage", async () => {
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

    // restoreSession no longer consumes redirect results
    expect(connect.restoreSession()).toBeNull();
    expect(window.location.hash).not.toBe("");

    const result = await connect.handleRedirectResult();
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
    expect(connect.restoreSession()?.principal).toBe(message.principal);
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
    expect(second.restoreSession()?.principal).toBe(message.principal);
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

    expect(connect.restoreSession()).toBeNull();
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
