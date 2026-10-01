import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { Connect, resetRedirectOutcomes } from "./connect";
import type { ConnectedUser } from "./connected-user";
import type { OdinState } from "./state";
import { apiAccepts, odinConnectMessage } from "../../test/odin-page";

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

/** Post what the Odin page would for `path` (popup mode). */
function answer(
  connect: Connect,
  path: string,
  message: unknown,
  detail?: unknown
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: connect.origin,
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
    const detail = { block_index: "42", memo: "ab".repeat(32) };
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
