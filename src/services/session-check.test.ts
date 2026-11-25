import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import axios from "axios";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { OdinApiClient } from "./api";
import { AppInitOptions, Connect, resetRedirectOutcomes } from "./connect";
import { HttpClient } from "./http";
import { StateStore } from "./state";
import type { ConnectedUser } from "./connected-user";
import { SESSION_CHECK_INTERVAL_MS } from "../constants";

vi.mock("axios");
const mockedAxios = axios as unknown as Mock;

const APP = { name: "test", env: "dev" } as const;
const PRINCIPAL = "aaaaa-aa";

/** What axios rejects with for an HTTP error response. */
function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    name: "AxiosError",
    response: { status, data: { message: "Invalid token" } },
  });
}

/**
 * Every instance a test creates. Each keeps listening for focus, so
 * `afterEach` disconnects them: a later test's events must not reach them.
 */
const instances: Connect[] = [];

function create(options: Partial<AppInitOptions> = {}): Connect {
  const connect = new Connect({ ...APP, ...options });
  instances.push(connect);
  return connect;
}

function disconnectAll() {
  instances.splice(0).forEach((connect) => connect.disconnect());
}

const SLUG = create().slug;
disconnectAll();

/** A JWT-shaped API key (unsigned: only its `exp` is read). */
function jwtWithExp(exp: number): string {
  const part = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${part({ alg: "HS256" })}.${part({ user: PRINCIPAL, exp })}.sig`;
}

function sessionKey(): string {
  return `odin_connect:${SLUG}:dev:session`;
}

function checkedKey(): string {
  return `odin_connect:${SLUG}:dev:session_checked_at`;
}

/** A stored session with an API key (`requires_api`), as after a connect. */
function storeSession(jwt: string | null = "jwt-1", checkedAt?: number) {
  localStorage.setItem(
    sessionKey(),
    JSON.stringify({
      principal: PRINCIPAL,
      sessionKey: JSON.stringify(Ed25519KeyIdentity.generate().toJSON()),
      delegationChain: null,
      jwt,
    })
  );
  if (checkedAt !== undefined) {
    localStorage.setItem(checkedKey(), String(checkedAt));
  }
}

async function readyConnect(options: Partial<AppInitOptions> = {}) {
  const connect = create(options);
  await connect.ready();
  return connect;
}

/** Let pending promise callbacks (a check that was not expected) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("session check (SDK-1)", () => {
  let check: Mock;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetRedirectOutcomes();
    setVisibility("visible");
    check = vi
      .spyOn(OdinApiClient.prototype, "checkConnectSession")
      .mockResolvedValue(true) as unknown as Mock;
  });

  afterEach(() => {
    disconnectAll();
    vi.restoreAllMocks();
  });

  it("checks a restored session on load and records the time", async () => {
    storeSession("jwt-1");
    const before = Date.now();
    const connect = await readyConnect();
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    expect(check).toHaveBeenCalledWith(window.location.origin);
    expect(connect.api.apiKey).toBe("jwt-1");
    await vi.waitFor(() =>
      expect(Number(localStorage.getItem(checkedKey()))).toBeGreaterThanOrEqual(
        before
      )
    );
    expect(connect.user?.principal).toBe(PRINCIPAL);
  });

  it("skips the check within the interval, on load and on focus", async () => {
    storeSession("jwt-1", Date.now() - 1000);
    await readyConnect();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(check).not.toHaveBeenCalled();
  });

  it("checks on focus and visibility once the interval has passed", async () => {
    storeSession("jwt-1", Date.now() - 1000);
    await readyConnect();
    localStorage.setItem(
      checkedKey(),
      String(Date.now() - SESSION_CHECK_INTERVAL_MS - 1)
    );
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    await settle(); // the successful check records its time

    localStorage.setItem(
      checkedKey(),
      String(Date.now() - SESSION_CHECK_INTERVAL_MS - 1)
    );
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  });

  it("does not check while the tab is hidden", async () => {
    storeSession("jwt-1", Date.now() - SESSION_CHECK_INTERVAL_MS - 1);
    setVisibility("hidden");
    await readyConnect();
    check.mockClear();
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(check).not.toHaveBeenCalled();
  });

  it("shares the last-check time between tabs", async () => {
    storeSession("jwt-1");
    await readyConnect();
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(localStorage.getItem(checkedKey())).not.toBeNull()
    );
    // another tab of the app loads, then gains focus: nothing is due
    await readyConnect();
    window.dispatchEvent(new Event("focus"));
    await settle();
    expect(check).toHaveBeenCalledOnce();
  });

  it("asks odin-api once for instances that load together", async () => {
    storeSession("jwt-1");
    let answer!: (alive: boolean) => void;
    check.mockReturnValue(new Promise<boolean>((r) => (answer = r)));
    const a = create();
    const b = create();
    await Promise.all([a.ready(), b.ready()]);
    await settle();
    expect(check).toHaveBeenCalledOnce();
    answer(false);
    await vi.waitFor(() => expect(a.user).toBeNull());
    await vi.waitFor(() => expect(b.user).toBeNull());
  });

  it("checks when the stored check time is in the future (clock moved back)", async () => {
    storeSession("jwt-1", Date.now() + 60 * 60 * 1000);
    await readyConnect();
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
  });

  it("sessionCheckIntervalMs: 0 checks on every load and focus", async () => {
    storeSession("jwt-1", Date.now());
    await readyConnect({ sessionCheckIntervalMs: 0 });
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  });

  it("sessionCheckIntervalMs overrides the default", async () => {
    storeSession("jwt-1", Date.now() - 2000);
    await readyConnect({ sessionCheckIntervalMs: 1000 });
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
  });

  it("ignores an invalid sessionCheckIntervalMs", async () => {
    storeSession("jwt-1", Date.now() - 2000);
    await readyConnect({ sessionCheckIntervalMs: -1 });
    await readyConnect({ sessionCheckIntervalMs: Number.NaN });
    await settle();
    expect(check).not.toHaveBeenCalled();
  });

  it("does not check a session without an API key", async () => {
    storeSession(null);
    const connect = await readyConnect({ sessionCheckIntervalMs: 0 });
    expect(connect.user?.principal).toBe(PRINCIPAL);
    window.dispatchEvent(new Event("focus"));
    await settle();
    expect(check).not.toHaveBeenCalled();
  });

  it("does not check when nobody is connected", async () => {
    await readyConnect({ sessionCheckIntervalMs: 0 });
    window.dispatchEvent(new Event("focus"));
    await settle();
    expect(check).not.toHaveBeenCalled();
  });
});

describe("log out on 401 (SDK-2)", () => {
  let check: Mock;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetRedirectOutcomes();
    setVisibility("visible");
    mockedAxios.mockReset();
    check = vi
      .spyOn(OdinApiClient.prototype, "checkConnectSession")
      .mockResolvedValue(true) as unknown as Mock;
  });

  afterEach(() => {
    disconnectAll();
    vi.restoreAllMocks();
  });

  function expectLoggedOut(connect: Connect, reason = "revoked") {
    expect(connect.state.logoutReason).toBe(reason);
    expect(connect.user).toBeNull();
    expect(connect.state.request).toBeNull();
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.getItem(sessionKey())).toBeNull();
    expect(localStorage.getItem(checkedKey())).toBeNull();
  }

  it("logs out when the session check answers 401", async () => {
    storeSession("jwt-1");
    check.mockResolvedValue(false);
    const connect = await readyConnect();
    await vi.waitFor(() => expect(connect.user).toBeNull());
    expectLoggedOut(connect);
    expect(
      (await create().ready()).user,
      "a reload stays logged out"
    ).toBeNull();
  });

  it("logs out when a request sent with the API key gets 401", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    mockedAxios.mockRejectedValue(httpError(401));
    await expect(
      connect.api.uploadImage(new File(["x"], "a.png", { type: "image/png" }))
    ).rejects.toThrow("Invalid token");
    expect(mockedAxios.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer jwt-1"
    );
    expectLoggedOut(connect);
  });

  it("logs out on a 401 from a communities read sent with the API key", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    mockedAxios.mockRejectedValue(httpError(401));
    await expect(connect.api.communities.getCommunities()).rejects.toThrow();
    expectLoggedOut(connect);
  });

  it("says revoked for a 401 on a key that has not expired", async () => {
    const jwt = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
    storeSession(jwt);
    check.mockResolvedValue(false);
    const connect = await readyConnect();
    await vi.waitFor(() => expect(connect.user).toBeNull());
    expectLoggedOut(connect, "revoked");
  });

  it("says expired for a 401 on a key past its exp", async () => {
    const jwt = jwtWithExp(Math.floor(Date.now() / 1000) - 60);
    storeSession(jwt, Date.now());
    const connect = await readyConnect();
    mockedAxios.mockRejectedValue(httpError(401));
    await expect(connect.api.communities.getCommunities()).rejects.toThrow();
    expectLoggedOut(connect, "expired");
  });

  it("says expired for a key within 5 minutes of its exp (slow client clock)", async () => {
    const jwt = jwtWithExp(Math.floor(Date.now() / 1000) + 120);
    storeSession(jwt);
    check.mockResolvedValue(false);
    const connect = await readyConnect();
    await vi.waitFor(() => expect(connect.user).toBeNull());
    expectLoggedOut(connect, "expired");
  });

  it("the app's own disconnect() sets no reason and clears an earlier one", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    connect.disconnect();
    expect(connect.user).toBeNull();
    expect(connect.state).not.toHaveProperty("logoutReason");

    storeSession("jwt-2");
    check.mockResolvedValue(false);
    const revoked = await readyConnect();
    await vi.waitFor(() => expect(revoked.state.logoutReason).toBe("revoked"));
    revoked.disconnect();
    expect(revoked.state).not.toHaveProperty("logoutReason");
  });

  it("keeps a request in flight: a createToken whose upload got 401 ends failed", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    mockedAxios.mockRejectedValue(httpError(401));
    await expect(
      connect.odin.createToken({
        principal: PRINCIPAL,
        name: "Token",
        ticker: "TKN",
        image: new File(["x"], "a.png", { type: "image/png" }),
      })
    ).rejects.toThrow("Invalid token");
    expect(connect.user).toBeNull();
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.getItem(sessionKey())).toBeNull();
    expect(connect.state.request).toMatchObject({
      action: "create_token",
      status: "failed",
      error: "Invalid token",
    });
  });

  it("keeps a pending request when the session check logs out", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect({ sessionCheckIntervalMs: 0 });
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    vi.spyOn(window, "open").mockReturnValue({ closed: false } as Window);
    void connect.odin
      .buy({ principal: PRINCIPAL, token: "t", btcAmount: 1n })
      .catch(() => {});
    expect(connect.state.request?.status).toBe("pending");
    check.mockResolvedValue(false);
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(connect.user).toBeNull());
    expect(connect.state.request).toMatchObject({
      action: "buy",
      status: "pending",
    });
  });

  it("leaves a newer session another tab stored", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    // another tab re-connects and stores its own session
    storeSession("jwt-2", Date.now());
    const stored = localStorage.getItem(sessionKey());
    mockedAxios.mockRejectedValue(httpError(401));
    await expect(connect.api.communities.getCommunities()).rejects.toThrow();
    expect(connect.user).toBeNull();
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.getItem(sessionKey())).toBe(stored);
    expect((await create().ready()).user?.principal).toBe(PRINCIPAL);
  });

  it("keeps the session when offline: no logout, no new check time", async () => {
    const checkedAt = Date.now() - SESSION_CHECK_INTERVAL_MS - 1;
    storeSession("jwt-1", checkedAt);
    check.mockRejectedValue(new Error("Network Error"));
    const connect = await readyConnect();
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    await settle();
    expect(connect.user?.principal).toBe(PRINCIPAL);
    expect(connect.api.apiKey).toBe("jwt-1");
    expect(localStorage.getItem(checkedKey())).toBe(String(checkedAt));
    // so the next focus tries again
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  });

  it("keeps the session on a 5xx from an API request", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    mockedAxios.mockRejectedValue(httpError(500));
    await expect(connect.api.communities.getCommunities()).rejects.toThrow();
    expect(connect.user?.principal).toBe(PRINCIPAL);
    expect(connect.api.apiKey).toBe("jwt-1");
  });

  it("keeps the session on a 403", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    mockedAxios.mockRejectedValue(httpError(403));
    await expect(connect.api.communities.getCommunities()).rejects.toThrow();
    expect(connect.user?.principal).toBe(PRINCIPAL);
  });

  it("ignores a 401 for a request sent with an older API key", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    // e.g. a request from before a re-connect answers after it
    const http = connect.api["_httpClient"] as HttpClient;
    mockedAxios.mockRejectedValue(httpError(401));
    await expect(
      http.get("https://api.odin.fun/dev/x", {
        headers: { Authorization: "Bearer jwt-0" },
      })
    ).rejects.toThrow();
    expect(connect.user?.principal).toBe(PRINCIPAL);
    expect(connect.api.apiKey).toBe("jwt-1");
  });

  it("ignores a 401 for a request without the API key", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    mockedAxios.mockRejectedValue(httpError(401));
    await expect(connect.api.getUser(PRINCIPAL)).rejects.toThrow();
    expect(connect.user?.principal).toBe(PRINCIPAL);
  });
});

describe("OdinApiClient.checkConnectSession", () => {
  beforeEach(() => {
    mockedAxios.mockReset();
  });

  it("sends the API key and the audience to GET /connect/session", async () => {
    mockedAxios.mockResolvedValue({ data: { principal: PRINCIPAL } });
    const api = new OdinApiClient("dev");
    api.apiKey = "jwt-1";
    await expect(api.checkConnectSession("https://app.example")).resolves.toBe(
      true
    );
    expect(mockedAxios).toHaveBeenCalledWith(
      "https://api.odin.fun/dev/connect/session",
      expect.objectContaining({
        method: "GET",
        params: { audience: "https://app.example" },
        headers: { Authorization: "Bearer jwt-1" },
      })
    );
  });

  it("resolves false on 401 and rejects on anything else", async () => {
    const api = new OdinApiClient("dev");
    api.apiKey = "jwt-1";
    mockedAxios.mockRejectedValueOnce(httpError(401));
    await expect(api.checkConnectSession("https://app.example")).resolves.toBe(
      false
    );
    mockedAxios.mockRejectedValueOnce(httpError(500));
    await expect(api.checkConnectSession("https://app.example")).rejects.toThrow();
    mockedAxios.mockRejectedValueOnce(new Error("Network Error"));
    await expect(api.checkConnectSession("https://app.example")).rejects.toThrow(
      "Network Error"
    );
  });

  it("rejects without an API key", async () => {
    await expect(
      new OdinApiClient("dev").checkConnectSession("https://app.example")
    ).rejects.toThrow("API key is not set");
    expect(mockedAxios).not.toHaveBeenCalled();
  });
});

describe("HttpClient.onUnauthorized", () => {
  beforeEach(() => {
    mockedAxios.mockReset();
  });

  it("is called with the Bearer token on a 401, and the request still rejects", async () => {
    const http = new HttpClient();
    const onUnauthorized = vi.fn();
    http.onUnauthorized = onUnauthorized;
    const error = httpError(401);
    mockedAxios.mockRejectedValue(error);
    await expect(
      http.get("https://x", { headers: { Authorization: "Bearer t" } })
    ).rejects.toBe(error);
    expect(onUnauthorized).toHaveBeenCalledWith("t");
  });

  it("is not called without a Bearer token or for other statuses", async () => {
    const http = new HttpClient();
    const onUnauthorized = vi.fn();
    http.onUnauthorized = onUnauthorized;
    mockedAxios.mockRejectedValueOnce(httpError(401));
    await expect(http.get("https://x")).rejects.toThrow();
    mockedAxios.mockRejectedValueOnce(httpError(500));
    await expect(
      http.get("https://x", { headers: { Authorization: "Bearer t" } })
    ).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("a throwing handler does not change how the request fails", async () => {
    const http = new HttpClient();
    http.onUnauthorized = () => {
      throw new Error("handler");
    };
    const error = httpError(401);
    mockedAxios.mockRejectedValue(error);
    await expect(
      http.get("https://x", { headers: { Authorization: "Bearer t" } })
    ).rejects.toBe(error);
  });
});

describe("state.logoutReason (SDK-3)", () => {
  const user = { principal: PRINCIPAL } as unknown as ConnectedUser;

  it("is set by an SDK logout and absent otherwise", () => {
    const store = new StateStore();
    store.dispatch({ type: "ready", user, request: null });
    expect(store.state).not.toHaveProperty("logoutReason");
    store.dispatch({ type: "logout", reason: "revoked" });
    expect(store.state).toEqual({
      status: "ready",
      user: null,
      request: null,
      logoutReason: "revoked",
    });
    expect(Object.isFrozen(store.state)).toBe(true);
  });

  it("the same logout twice is no change", () => {
    const store = new StateStore();
    store.dispatch({ type: "ready", user, request: null });
    store.dispatch({ type: "logout", reason: "expired" });
    const before = store.state;
    store.dispatch({ type: "logout", reason: "expired" });
    expect(store.state).toBe(before);
    store.dispatch({ type: "disconnect" });
    expect(store.state).not.toBe(before);
    expect(store.state).not.toHaveProperty("logoutReason");
  });

  it("survives ready() when a connect made while restoring was logged out", () => {
    const store = new StateStore();
    store.dispatch({
      type: "request",
      request: {
        id: "r1",
        action: "connect",
        status: "pending",
        input: { requires_api: true, requires_delegation: false, targets: [] },
      },
    });
    store.dispatch({ type: "settle", id: "r1", status: "success", user });
    store.dispatch({ type: "logout", reason: "revoked" });
    store.dispatch({ type: "ready", user: null, request: null });
    expect(store.state.status).toBe("ready");
    expect(store.state.logoutReason).toBe("revoked");
  });

  it("stays through a new request and clears once a user is connected", () => {
    const store = new StateStore();
    store.dispatch({ type: "ready", user: null, request: null });
    store.dispatch({ type: "logout", reason: "revoked" });
    store.dispatch({
      type: "request",
      request: {
        id: "r1",
        action: "connect",
        status: "pending",
        input: { requires_api: true, requires_delegation: false, targets: [] },
      },
    });
    expect(store.state.logoutReason).toBe("revoked");
    store.dispatch({ type: "settle", id: "r1", status: "success", user });
    expect(store.state.user).toBe(user);
    expect(store.state).not.toHaveProperty("logoutReason");
  });
});

describe("session_revoked from an action (SDK-4)", () => {
  const POPUP = { closed: false } as Window;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetRedirectOutcomes();
    setVisibility("visible");
    vi.spyOn(OdinApiClient.prototype, "checkConnectSession").mockResolvedValue(
      true
    );
  });

  afterEach(() => {
    disconnectAll();
    vi.restoreAllMocks();
  });

  /** Odin's popup answering the pending action with `message`. */
  function answer(connect: Connect, path: string, message: unknown, detail?: unknown) {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: connect.origin,
        source: POPUP,
        data: { path, message, ...(detail !== undefined ? { detail } : {}) },
      })
    );
  }

  it("logs out with revoked at once, keeping the rejected request", async () => {
    // checked a second ago: the timer would not check for 5 minutes
    storeSession("jwt-1", Date.now() - 1000);
    const connect = await readyConnect();
    vi.spyOn(window, "open").mockReturnValue(POPUP);
    const promise = connect.odin.buy({
      principal: PRINCIPAL,
      token: "t",
      btcAmount: 1n,
    });
    const seen: Array<{ user: unknown; error?: string }> = [];
    connect.subscribe((state) =>
      seen.push({ user: state.user, error: state.request?.error })
    );
    answer(connect, "/authorize/buy", "rejected", { reason: "session_revoked" });
    await expect(promise).rejects.toThrow();
    await vi.waitFor(() => expect(connect.user).toBeNull());
    expect(connect.state.logoutReason).toBe("revoked");
    expect(connect.state.request).toMatchObject({
      action: "buy",
      status: "rejected",
      error: "session_revoked",
    });
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.getItem(sessionKey())).toBeNull();
    // listeners first saw the rejected request, then the logout
    expect(seen[0].user).not.toBeNull();
    expect(seen[0].error).toBe("session_revoked");
    expect(seen.at(-1)?.user).toBeNull();
  });

  it("logs out a session without an API key (delegation only)", async () => {
    storeSession(null);
    const connect = await readyConnect();
    vi.spyOn(window, "open").mockReturnValue(POPUP);
    void connect.odin
      .sell({ principal: PRINCIPAL, token: "t", tokenAmount: 1n })
      .catch(() => {});
    answer(connect, "/authorize/sell", "rejected", { reason: "session_revoked" });
    await vi.waitFor(() => expect(connect.user).toBeNull());
    expect(connect.state.logoutReason).toBe("revoked");
    expect(localStorage.getItem(sessionKey())).toBeNull();
  });

  it("keeps the session for other reject reasons", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    vi.spyOn(window, "open").mockReturnValue(POPUP);
    void connect.odin
      .buy({ principal: PRINCIPAL, token: "t", btcAmount: 1n })
      .catch(() => {});
    answer(connect, "/authorize/buy", "rejected", { reason: "no_action" });
    await settle();
    expect(connect.user?.principal).toBe(PRINCIPAL);
    expect(connect.state).not.toHaveProperty("logoutReason");
  });

  it("leaves a newer session another tab stored", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    storeSession("jwt-2", Date.now());
    const stored = localStorage.getItem(sessionKey());
    vi.spyOn(window, "open").mockReturnValue(POPUP);
    void connect.odin
      .buy({ principal: PRINCIPAL, token: "t", btcAmount: 1n })
      .catch(() => {});
    answer(connect, "/authorize/buy", "rejected", { reason: "session_revoked" });
    await vi.waitFor(() => expect(connect.user).toBeNull());
    expect(localStorage.getItem(sessionKey())).toBe(stored);
  });

  it("does nothing once the user disconnected meanwhile", async () => {
    storeSession("jwt-1", Date.now());
    const connect = await readyConnect();
    vi.spyOn(window, "open").mockReturnValue(POPUP);
    void connect.odin
      .buy({ principal: PRINCIPAL, token: "t", btcAmount: 1n })
      .catch(() => {});
    answer(connect, "/authorize/buy", "rejected", { reason: "session_revoked" });
    connect.disconnect(); // before the logout microtask runs
    await settle();
    expect(connect.state).not.toHaveProperty("logoutReason");
  });
});
