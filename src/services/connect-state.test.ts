import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { Connect, resetRedirectOutcomes } from "./connect";
import type { ConnectedUser } from "./connected-user";
import { StateStore, type OdinState } from "./state";
import {
  apiAccepts,
  odinApproveDetail,
  odinBackToApp,
  odinConnectMessage,
} from "../../test/odin-page";

const POPUP = { closed: false } as Window;

/** Every state the instance goes through, from now on. */
function record(connect: Connect) {
  const states: OdinState[] = [];
  connect.subscribe((state) => states.push(state));
  return states;
}

function openSpy(result: Window | null = POPUP) {
  return vi.spyOn(window, "open").mockReturnValue(result);
}

/** Post what the Odin page would for `path` (popup mode), from `source`. */
function answer(
  connect: Connect,
  path: string,
  message: unknown,
  detail?: unknown,
  {
    source = POPUP,
    origin = connect.origin,
  }: { source?: Window; origin?: string } = {}
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      source,
      data: { path, message, ...(detail !== undefined ? { detail } : {}) },
    })
  );
}

async function readyConnect() {
  const connect = new Connect({ name: "test", env: "dev", mode: "popup" });
  await connect.ready();
  return connect;
}

/** A connected user, through a verified popup connect. */
async function connectedUser(connect: Connect): Promise<ConnectedUser> {
  vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
  const open = openSpy();
  const promise = connect.connect({ requires_api: true });
  const url = open.mock.calls[0][0] as URL;
  answer(connect, "/authorize/connect", await odinConnectMessage(url));
  const user = await promise;
  open.mockClear();
  return user;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/app");
  sessionStorage.clear();
  localStorage.clear();
  resetRedirectOutcomes();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("popup connect → state", () => {
  it("pending → success, with the verified user", async () => {
    const connect = await readyConnect();
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const states = record(connect);
    const open = openSpy();
    const promise = connect.connect({
      requires_api: true,
      returnState: { step: 1 },
    });
    const url = open.mock.calls[0][0] as URL;
    const id = url.searchParams.get("request_id");
    expect(connect.state.request).toEqual({
      id,
      action: "connect",
      status: "pending",
      input: { requires_api: true, requires_delegation: false, targets: [] },
      returnState: { step: 1 },
    });
    expect(connect.user).toBeNull();

    const message = await odinConnectMessage(url);
    answer(connect, "/authorize/connect", message);
    // 1.6.0: the promise resolves with the user, from the same transition
    const user = await promise;
    expect(user.principal).toBe(message.principal);
    expect(states.map((s) => s.request?.status)).toEqual([
      "pending",
      "success",
    ]);
    expect(connect.state).toEqual({
      status: "ready",
      user,
      request: {
        id,
        action: "connect",
        status: "success",
        input: { requires_api: true, requires_delegation: false, targets: [] },
        returnState: { step: 1 },
      },
    });
    expect(connect.user).toBe(user);
  });

  it("pending → rejected; the promise rejects as in 1.6.0", async () => {
    const connect = await readyConnect();
    const states = record(connect);
    openSpy();
    const promise = connect.connect();
    answer(connect, "/authorize/connect", "rejected");
    await expect(promise).rejects.toThrow("User rejected the connection");
    expect(states.map((s) => s.request?.status)).toEqual([
      "pending",
      "rejected",
    ]);
    expect(connect.state.request).not.toHaveProperty("error");
    expect(connect.user).toBeNull();
  });

  it("pending → rejected with Odin's reason as error; the promise still rejects as in 1.6.0", async () => {
    const connect = await readyConnect();
    const open = openSpy();
    const promise = connect.connect({
      requires_delegation: true,
      targets: ["aaaaa-aa"],
    });
    const url = open.mock.calls[0][0] as URL;
    const { message, detail } = odinBackToApp(url, "untrusted_origin");
    answer(connect, "/authorize/connect", message, detail);
    await expect(promise).rejects.toThrow("User rejected the connection");
    expect(connect.state.request).toMatchObject({
      action: "connect",
      status: "rejected",
      error: "untrusted_origin",
    });
    expect(connect.user).toBeNull();
  });

  it("ignores a reason that is not a short code", async () => {
    const connect = await readyConnect();
    openSpy();
    const promise = connect.connect();
    answer(connect, "/authorize/connect", "rejected", {
      reason: "<b>not a code</b>",
    });
    await expect(promise).rejects.toThrow("User rejected the connection");
    expect(connect.state.request?.status).toBe("rejected");
    expect(connect.state.request).not.toHaveProperty("error");
  });

  it("pending → unverified with the verification error", async () => {
    const connect = await readyConnect();
    vi.spyOn(connect.api, "verifyConnect").mockRejectedValue(
      new Error("Invalid signature")
    );
    const open = openSpy();
    const promise = connect.connect({ requires_api: true });
    const url = open.mock.calls[0][0] as URL;
    answer(connect, "/authorize/connect", await odinConnectMessage(url));
    await expect(promise).rejects.toThrow(/odin-api refused the proof/);
    expect(connect.state.request).toMatchObject({
      action: "connect",
      status: "unverified",
      error: expect.stringContaining("Invalid signature"),
    });
    expect(connect.user).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("pending → failed when the popup is blocked", async () => {
    const connect = await readyConnect();
    const states = record(connect);
    openSpy(null);
    await expect(connect.connect()).rejects.toThrow(
      "Failed to open authorize/connect window, please always allow popups and try again"
    );
    expect(states.map((s) => s.request?.status)).toEqual(["pending", "failed"]);
    expect(connect.state.request?.error).toMatch(/allow popups/);
  });
});

describe("popup connect: only its own answer, only while current", () => {
  /** Open a connect popup that is `popup`; returns its promise and URL. */
  function startConnect(
    connect: Connect,
    popup: Window,
    options: Parameters<Connect["connect"]>[0] = { requires_api: true }
  ) {
    const open = openSpy(popup);
    const promise = connect.connect(options);
    const url = open.mock.lastCall![0] as URL;
    return { promise, url, id: url.searchParams.get("request_id")! };
  }

  it("ignores a valid answer from a foreign origin", async () => {
    const connect = await readyConnect();
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const { promise, url } = startConnect(connect, POPUP);
    const message = await odinConnectMessage(url);
    answer(connect, "/authorize/connect", message, undefined, {
      origin: "https://evil.example",
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(verify).not.toHaveBeenCalled();
    expect(connect.state.request?.status).toBe("pending");
    expect(connect.user).toBeNull();
    // the real answer still settles it
    answer(connect, "/authorize/connect", message);
    expect((await promise).principal).toBe(message.principal);
  });

  it("ignores an answer from another window (e.g. another connect's popup)", async () => {
    const connect = await readyConnect();
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const { promise, url } = startConnect(connect, POPUP);
    const other = { closed: false } as Window;
    answer(connect, "/authorize/connect", "rejected", undefined, {
      source: other,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(connect.state.request?.status).toBe("pending");
    const message = await odinConnectMessage(url);
    answer(connect, "/authorize/connect", message);
    expect((await promise).principal).toBe(message.principal);
  });

  it("a newer connect replaces the latest: the older success changes neither user nor storage", async () => {
    const connect = await readyConnect();
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const popupA = { closed: false } as Window;
    const popupB = { closed: false } as Window;
    const a = startConnect(connect, popupA);
    const b = startConnect(connect, popupB);
    expect(connect.state.request?.id).toBe(b.id);

    // A's popup answers first: only A's listener takes it
    const messageA = await odinConnectMessage(a.url);
    answer(connect, "/authorize/connect", messageA, undefined, {
      source: popupA,
    });
    // 1.6.0: A's promise still resolves with A's user
    const userA = await a.promise;
    expect(userA.principal).toBe(messageA.principal);
    expect(connect.user).toBeNull();
    expect(connect.state.request).toMatchObject({
      id: b.id,
      status: "pending",
    });
    expect(localStorage.length).toBe(0);
    expect(connect.api.apiKey).toBeNull();
    // A's user has its own API key, not the instance's
    expect(userA["_api"]).not.toBe(connect.api);
    expect(userA["_api"].apiKey).toBe("jwt-from-api");

    const messageB = await odinConnectMessage(b.url);
    answer(connect, "/authorize/connect", messageB, undefined, {
      source: popupB,
    });
    const userB = await b.promise;
    expect(connect.user).toBe(userB);
    expect(connect.state.request).toMatchObject({
      id: b.id,
      status: "success",
    });
    expect(connect.api.apiKey).toBe("jwt-from-api");
    const restored = (await new Connect({ name: "test", env: "dev" }).ready())
      .user;
    expect(restored?.principal).toBe(messageB.principal);
  });

  it("disconnect() while the popup is open: its success does not resurrect the user", async () => {
    const connect = await readyConnect();
    const old = await connectedUser(connect);
    expect(localStorage.length).toBe(1);
    const { promise, url } = startConnect(connect, POPUP);
    connect.disconnect();
    const message = await odinConnectMessage(url);
    answer(connect, "/authorize/connect", message);
    expect((await promise).principal).toBe(message.principal);
    expect(connect.state).toEqual({
      status: "ready",
      user: null,
      request: null,
    });
    expect(localStorage.length).toBe(0);
    expect(connect.api.apiKey).toBeNull();
    expect(old.principal).not.toBe(message.principal);
    expect(
      (await new Connect({ name: "test", env: "dev" }).ready()).user
    ).toBeNull();
  });

  it("disconnect() while verifying: not stored, not applied", async () => {
    const connect = await readyConnect();
    let accept!: () => void;
    const accepts = apiAccepts();
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(
      (body) =>
        new Promise((resolve) => {
          accept = () => resolve(accepts(body));
        })
    );
    const { promise, url } = startConnect(connect, POPUP);
    answer(connect, "/authorize/connect", await odinConnectMessage(url));
    await vi.waitFor(() => expect(accept).toBeTypeOf("function"));
    connect.disconnect();
    accept();
    await promise;
    expect(connect.user).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(connect.api.apiKey).toBeNull();
  });
});

describe("popup actions → state", () => {
  it("pending → success, resolving true as in 1.6.0, with icrc_approve detail", async () => {
    const connect = await readyConnect();
    const user = await connectedUser(connect);
    const states = record(connect);
    const open = openSpy();
    const promise = user.icrcApprove({
      token: "2jjj",
      spender: "aaaaa-aa",
      amount: 10n ** 30n,
      returnState: { step: "approve" },
    });
    const url = open.mock.calls[0][0] as URL;
    expect(connect.state.request).toEqual({
      id: url.searchParams.get("request_id"),
      action: "icrc_approve",
      status: "pending",
      input: { token: "2jjj", spender: "aaaaa-aa", amount: 10n ** 30n },
      returnState: { step: "approve" },
    });
    const detail = odinApproveDetail(42n);
    answer(connect, "/authorize/icrc_approve", "approved", detail);
    await expect(promise).resolves.toBe(true);
    expect(states.map((s) => s.request?.status)).toEqual([
      "pending",
      "success",
    ]);
    expect(connect.state.request).toMatchObject({ status: "success", detail });
    // an action never changes the user
    expect(connect.user).toBe(user);
  });

  it("pending → rejected / failed; the promise rejects with the 1.6.0 message", async () => {
    const connect = await readyConnect();
    const user = await connectedUser(connect);
    openSpy();
    const rejected = user.buy({ token: "2jjj", btcAmount: 1n });
    answer(connect, "/authorize/buy", "rejected");
    await expect(rejected).rejects.toThrow("Purchase failed or was cancelled");
    expect(connect.state.request).toMatchObject({
      action: "buy",
      status: "rejected",
    });

    const failed = user.buy({ token: "2jjj", btcAmount: 1n });
    answer(connect, "/authorize/buy", "something went wrong");
    await expect(failed).rejects.toThrow("Purchase failed or was cancelled");
    expect(connect.state.request).toMatchObject({
      action: "buy",
      status: "failed",
      error: "Purchase failed or was cancelled",
    });
  });

  it("pending → rejected with Odin's reason; the promise rejects with the action's failure text", async () => {
    const connect = await readyConnect();
    const user = await connectedUser(connect);
    const open = openSpy();
    const promise = user.swap({
      fromToken: "btc",
      toToken: "2jjj",
      fromAmount: 1n,
    });
    const url = open.mock.calls[0][0] as URL;
    const { message, detail } = odinBackToApp(url, "no_action");
    answer(connect, "/authorize/swap", message, detail);
    await expect(promise).rejects.toThrow("Swap failed or was cancelled");
    expect(connect.state.request).toMatchObject({
      action: "swap",
      status: "rejected",
      error: "no_action",
    });
  });

  it("pending → failed when the popup is blocked", async () => {
    const connect = await readyConnect();
    openSpy(null);
    await expect(
      connect.odin.sell({ principal: "p", token: "2jjj", tokenAmount: 1n })
    ).rejects.toThrow(/allow popups/);
    expect(connect.state.request).toMatchObject({
      action: "sell",
      status: "failed",
      error: expect.stringMatching(/allow popups/),
    });
  });

  it("records each action's input, bigints kept, principal and File left out", async () => {
    const connect = await readyConnect();
    const user = await connectedUser(connect);
    openSpy();
    vi.spyOn(connect.api, "uploadImage").mockResolvedValue("https://img/x");
    const big = 2n ** 70n;
    const cases = [
      [
        () => user.buy({ token: "t", btcAmount: big }),
        { action: "buy", input: { token: "t", btcAmount: big } },
      ],
      [
        () => user.sell({ token: "t", tokenAmount: big }),
        { action: "sell", input: { token: "t", tokenAmount: big } },
      ],
      [
        () => user.transfer({ token: "t", amount: big, destination: "d" }),
        {
          action: "transfer",
          input: { token: "t", amount: big, destination: "d" },
        },
      ],
      [
        () => user.swap({ fromToken: "a", toToken: "b", fromAmount: big }),
        {
          action: "swap",
          input: { fromToken: "a", toToken: "b", fromAmount: big },
        },
      ],
      [
        () => user.addLiquidity({ token: "t", btcAmount: big }),
        { action: "add_liquidity", input: { token: "t", btcAmount: big } },
      ],
      [
        () => user.removeLiquidity({ token: "t", lpAmount: big }),
        { action: "remove_liquidity", input: { token: "t", lpAmount: big } },
      ],
      [
        () => user.icrcApprove({ token: "t", spender: "s", amount: big }),
        {
          action: "icrc_approve",
          input: { token: "t", spender: "s", amount: big },
        },
      ],
    ] as const;
    for (const [start, expected] of cases) {
      void start();
      expect(connect.state.request).toEqual({
        id: expect.any(String),
        status: "pending",
        ...expected,
      });
    }

    void user.createToken({
      name: "Token",
      ticker: "TKN",
      image: new File(["png"], "a.png"),
      buy: big,
    });
    // pending right away, without the image until it is uploaded
    expect(connect.state.request).toMatchObject({
      action: "create_token",
      status: "pending",
      input: { name: "Token", ticker: "TKN", buy: big },
    });
    expect(connect.state.request?.input).not.toHaveProperty("image");
    await vi.waitFor(() =>
      expect(connect.state.request?.input).toHaveProperty("image")
    );
    expect(connect.state.request).toEqual({
      id: expect.any(String),
      action: "create_token",
      status: "pending",
      input: { name: "Token", ticker: "TKN", buy: big, image: "https://img/x" },
    });
    const input = connect.state.request!.input as Record<string, unknown>;
    expect(Object.values(input).some((v) => v instanceof File)).toBe(false);
  });

  it("a createToken validation error marks the request failed", async () => {
    const connect = await readyConnect();
    const upload = vi.spyOn(connect.api, "uploadImage");
    await expect(
      connect.odin.createToken({
        principal: "p",
        name: "Token",
        ticker: "TKN",
        image: new File([], "a.png"),
        discount: "bad",
      })
    ).rejects.toThrow(/Discount code/);
    expect(upload).not.toHaveBeenCalled();
    expect(connect.state.request).toMatchObject({
      action: "create_token",
      status: "failed",
      error: expect.stringMatching(/Discount code/),
    });
  });

  it("a newer request replaces the latest; the older result is ignored", async () => {
    const connect = await readyConnect();
    openSpy();
    const first = connect.odin.buy({
      principal: "p",
      token: "t",
      btcAmount: 1n,
    });
    void connect.odin.sell({ principal: "p", token: "t", tokenAmount: 1n });
    const sellId = connect.state.request?.id;
    answer(connect, "/authorize/buy", "purchased");
    await expect(first).resolves.toBe(true);
    expect(connect.state.request).toMatchObject({
      id: sellId,
      action: "sell",
      status: "pending",
    });
  });
});

describe("no secrets in state.request", () => {
  it("connect input and result carry no session secret", async () => {
    const generate = vi.spyOn(Ed25519KeyIdentity, "generate");
    const connect = await readyConnect();
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const open = openSpy();
    const promise = connect.connect({
      requires_api: true,
      requires_delegation: true,
      targets: ["74iy7-xqaaa-aaaaf-qagra-cai"],
    });
    const url = open.mock.calls[0][0] as URL;
    const secretHex = (
      generate.mock.results[0].value as Ed25519KeyIdentity
    ).toJSON()[1];
    const pending = JSON.stringify(connect.state.request);
    answer(connect, "/authorize/connect", await odinConnectMessage(url));
    await promise;
    for (const text of [pending, JSON.stringify(connect.state.request)]) {
      expect(text).not.toContain(secretHex);
      expect(text).not.toContain("jwt-from-api");
    }
  });
});

describe("subscribe / getState", () => {
  it("calls listeners on every change with new frozen snapshots", async () => {
    const connect = await readyConnect();
    const listener = vi.fn();
    connect.subscribe(listener);
    // not called on subscribe
    expect(listener).not.toHaveBeenCalled();
    const before = connect.getState();
    expect(connect.getState()).toBe(before);
    expect(connect.state).toBe(before);

    openSpy();
    const promise = connect.odin.buy({
      principal: "p",
      token: "t",
      btcAmount: 1n,
    });
    expect(listener).toHaveBeenCalledOnce();
    const pending = listener.mock.calls[0][0] as OdinState;
    expect(pending).toBe(connect.getState());
    expect(pending).not.toBe(before);
    // the previous snapshot is untouched
    expect(before.request).toBeNull();
    // stable between changes
    expect(connect.getState()).toBe(pending);

    answer(connect, "/authorize/buy", "purchased");
    await promise;
    expect(listener).toHaveBeenCalledTimes(2);
    const done = listener.mock.calls[1][0] as OdinState;
    expect(done).not.toBe(pending);
    expect(done.request).not.toBe(pending.request);
    expect(pending.request?.status).toBe("pending");
    expect(done.request?.status).toBe("success");
    expect(Object.isFrozen(done)).toBe(true);
    expect(Object.isFrozen(done.request)).toBe(true);
    expect(Object.isFrozen(done.request?.input)).toBe(true);
    expect(() => {
      (done as { user: unknown }).user = "x";
    }).toThrow();
  });

  it("stops calling a listener after unsubscribe", async () => {
    const connect = await readyConnect();
    const kept = vi.fn();
    const dropped = vi.fn();
    connect.subscribe(kept);
    const unsubscribe = connect.subscribe(dropped);
    openSpy(null);
    await connect.odin
      .buy({ principal: "p", token: "t", btcAmount: 1n })
      .catch(() => {});
    expect(dropped).toHaveBeenCalledTimes(2);
    unsubscribe();
    unsubscribe();
    await connect.odin
      .buy({ principal: "p", token: "t", btcAmount: 1n })
      .catch(() => {});
    expect(dropped).toHaveBeenCalledTimes(2);
    expect(kept).toHaveBeenCalledTimes(4);
  });

  it("a settle for a replaced (or cleared) request changes neither request nor user", () => {
    const store = new StateStore();
    const input = {
      requires_api: true,
      requires_delegation: false,
      targets: [],
    };
    const user = {} as ConnectedUser;
    store.dispatch({
      type: "request",
      request: { id: "old", action: "connect", status: "pending", input },
    });
    store.dispatch({
      type: "request",
      request: { id: "new", action: "connect", status: "pending", input },
    });
    const before = store.state;
    store.dispatch({ type: "settle", id: "old", status: "success", user });
    expect(store.state).toBe(before);
    store.dispatch({ type: "disconnect" });
    const cleared = store.state;
    store.dispatch({ type: "settle", id: "new", status: "success", user });
    expect(store.state).toBe(cleared);
    expect(store.state.user).toBeNull();
  });

  it("does not call a listener unsubscribed by an earlier one in the same dispatch", async () => {
    const connect = await readyConnect();
    const later = vi.fn();
    let unsubscribeLater = () => {};
    const first = vi.fn(() => unsubscribeLater());
    connect.subscribe(first);
    unsubscribeLater = connect.subscribe(later);
    openSpy(null);
    void connect.odin.buy({ principal: "p", token: "t", btcAmount: 1n });
    expect(first).toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
  });

  it("getServerState stays the initializing snapshot in the browser too", async () => {
    const connect = await readyConnect();
    expect(connect.getState().status).toBe("ready");
    expect(connect.getServerState()).toBe(Connect.serverState);
    expect(connect.getServerState()).toEqual({
      status: "initializing",
      user: null,
      request: null,
    });
  });

  it("works unbound, as useSyncExternalStore calls it", async () => {
    const connect = await readyConnect();
    const { subscribe, getState } = connect;
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    connect.disconnect();
    openSpy(null);
    void connect.odin.buy({ principal: "p", token: "t", btcAmount: 1n });
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.lastCall?.[0]).toBe(getState());
    unsubscribe();
  });

  it("a throwing listener does not stop the others", async () => {
    const connect = await readyConnect();
    const after = vi.fn();
    connect.subscribe(() => {
      throw new Error("app bug");
    });
    connect.subscribe(after);
    const thrown = vi.fn();
    const onError = (event: ErrorEvent) => {
      thrown(event.error);
      event.preventDefault();
    };
    process.on("uncaughtException", thrown);
    window.addEventListener("error", onError);
    try {
      openSpy(null);
      void connect.odin.buy({ principal: "p", token: "t", btcAmount: 1n });
      expect(after).toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 0));
      // reported asynchronously, not swallowed
      expect(thrown.mock.calls[0][0]).toEqual(new Error("app bug"));
    } finally {
      process.off("uncaughtException", thrown);
      window.removeEventListener("error", onError);
    }
  });
});

describe("ready()", () => {
  it("is started by the constructor; ready at once without a redirect result", () => {
    const connect = new Connect({ name: "test" });
    // nothing to verify: the stored session is read synchronously
    expect(connect.state.status).toBe("ready");
  });

  it("is idempotent and resolves with the current state", async () => {
    const connect = new Connect({ name: "test" });
    const listener = vi.fn();
    connect.subscribe(listener);
    const a = await connect.ready();
    const b = await connect.ready();
    expect(a).toBe(b);
    expect(a.status).toBe("ready");
    // already ready: no further transition
    expect(listener).not.toHaveBeenCalled();
    openSpy(null);
    void connect.connect();
    expect(await connect.ready()).toBe(connect.state);
    expect(connect.state.request?.action).toBe("connect");
  });

  it("ignored calls cause no unhandled rejections", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const connect = await readyConnect();
      openSpy(null);
      // never awaited: blocked popups reject, nobody listens
      void connect.connect();
      void connect.odin.buy({ principal: "p", token: "t", btcAmount: 1n });
      void connect.odin.createToken({
        principal: "p",
        name: "",
        ticker: "",
        image: new File([], "a.png"),
      });
      openSpy();
      void connect.odin.swap({
        principal: "p",
        fromToken: "a",
        toToken: "b",
        fromAmount: 1n,
      });
      answer(connect, "/authorize/swap", "rejected");
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("disconnect()", () => {
  it("clears storage, user and request", async () => {
    const connect = await readyConnect();
    await connectedUser(connect);
    expect(connect.user).not.toBeNull();
    expect(localStorage.length).toBe(1);
    connect.disconnect();
    expect(connect.state).toEqual({
      status: "ready",
      user: null,
      request: null,
    });
    expect(localStorage.length).toBe(0);
    expect(connect.api.apiKey).toBeNull();
    expect(
      (await new Connect({ name: "test", env: "dev" }).ready()).user
    ).toBeNull();
  });
});
