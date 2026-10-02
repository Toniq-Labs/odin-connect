import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Connect, resetRedirectOutcomes } from "./connect";
import type { ConnectedUser } from "./connected-user";
import { POPUP_CLOSED_POLL_MS } from "./canister";
import type { OdinState } from "./state";
import { apiAccepts, odinConnectMessage } from "../../test/odin-page";

/** A popup the test can close (`popup.closed = true`). */
function popup(): { closed: boolean } & Window {
  return { closed: false } as { closed: boolean } & Window;
}

function record(connect: Connect) {
  const states: OdinState[] = [];
  connect.subscribe((state) => states.push(state));
  return states;
}

function openSpy(result: Window) {
  return vi.spyOn(window, "open").mockReturnValue(result);
}

function answer(
  connect: Connect,
  source: Window,
  path: string,
  message: unknown
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: connect.origin,
      source,
      data: { path, message },
    })
  );
}

/** Let the poll run `ticks` times. */
function poll(ticks = 1) {
  vi.advanceTimersByTime(POPUP_CLOSED_POLL_MS * ticks);
}

async function readyConnect() {
  const connect = new Connect({ name: "test", env: "dev", mode: "popup" });
  await connect.ready();
  return connect;
}

async function connectedUser(connect: Connect): Promise<ConnectedUser> {
  vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
  const win = popup();
  const open = openSpy(win);
  const promise = connect.connect({ requires_api: true });
  const url = open.mock.calls[0][0] as URL;
  answer(connect, win, "/authorize/connect", await odinConnectMessage(url));
  const user = await promise;
  open.mockRestore();
  return user;
}

beforeEach(() => {
  // only the poll's timers: crypto and promises keep running for real
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  window.history.replaceState(null, "", "/app");
  sessionStorage.clear();
  localStorage.clear();
  resetRedirectOutcomes();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("popup closed without an answer", () => {
  it("connect: settles rejected / popup_closed; the promise rejects as a user rejection", async () => {
    const connect = await readyConnect();
    const states = record(connect);
    const win = popup();
    openSpy(win);
    const promise = connect.connect();
    poll(3);
    expect(connect.state.request?.status).toBe("pending");

    win.closed = true;
    poll();
    await expect(promise).rejects.toThrow("User rejected the connection");
    expect(connect.state.request).toMatchObject({
      action: "connect",
      status: "rejected",
      error: "popup_closed",
    });
    expect(states.map((s) => s.request?.status)).toEqual([
      "pending",
      "rejected",
    ]);
    expect(connect.user).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("action: settles rejected / popup_closed; the promise rejects with the action's failure text", async () => {
    const connect = await readyConnect();
    const user = await connectedUser(connect);
    const win = popup();
    openSpy(win);
    const promise = user.icrcApprove({
      token: "2jjj",
      spender: "aaaaa-aa",
      amount: 1n,
    });
    win.closed = true;
    poll();
    await expect(promise).rejects.toThrow(
      "ICRC approve failed or was cancelled"
    );
    expect(connect.state.request).toMatchObject({
      action: "icrc_approve",
      status: "rejected",
      error: "popup_closed",
    });
    // a still-connected user stays connected
    expect(connect.user).toBe(user);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a late answer after the close is ignored (first settle wins)", async () => {
    const connect = await readyConnect();
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const states = record(connect);
    const win = popup();
    const open = openSpy(win);
    const promise = connect.connect({ requires_api: true });
    const url = open.mock.calls[0][0] as URL;
    win.closed = true;
    poll();
    answer(connect, win, "/authorize/connect", await odinConnectMessage(url));
    await expect(promise).rejects.toThrow("User rejected the connection");
    await new Promise((r) => setTimeout(r, 0));
    expect(verify).not.toHaveBeenCalled();
    expect(states.map((s) => s.request?.status)).toEqual([
      "pending",
      "rejected",
    ]);
    expect(connect.user).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("action: a late success after the close is ignored", async () => {
    const connect = await readyConnect();
    const user = await connectedUser(connect);
    const states = record(connect);
    const win = popup();
    openSpy(win);
    const promise = user.buy({ token: "2jjj", btcAmount: 1n });
    win.closed = true;
    poll();
    answer(connect, win, "/authorize/buy", "purchased");
    await expect(promise).rejects.toThrow("Purchase failed or was cancelled");
    expect(states.map((s) => s.request?.status)).toEqual([
      "pending",
      "rejected",
    ]);
  });
});

describe("popup answered, then closed", () => {
  it("connect: the answer wins, also while it is still being verified", async () => {
    const connect = await readyConnect();
    let accept!: () => void;
    const accepts = apiAccepts();
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(
      (body) =>
        new Promise((resolve) => {
          accept = () => resolve(accepts(body));
        })
    );
    const states = record(connect);
    const win = popup();
    const open = openSpy(win);
    const promise = connect.connect({ requires_api: true });
    const url = open.mock.calls[0][0] as URL;
    const message = await odinConnectMessage(url);
    answer(connect, win, "/authorize/connect", message);
    // the Odin page closes itself right after answering
    win.closed = true;
    poll(4);
    expect(vi.getTimerCount()).toBe(0);
    await vi.waitFor(() => expect(accept).toBeTypeOf("function"));
    expect(connect.state.request?.status).toBe("pending");
    accept();
    const user = await promise;
    expect(user.principal).toBe(message.principal);
    expect(states.map((s) => s.request?.status)).toEqual([
      "pending",
      "success",
    ]);
    expect(connect.user).toBe(user);
  });

  it("action: the answer wins; no second settle", async () => {
    const connect = await readyConnect();
    const user = await connectedUser(connect);
    const states = record(connect);
    const win = popup();
    openSpy(win);
    const promise = user.sell({ token: "2jjj", tokenAmount: 5n });
    answer(connect, win, "/authorize/sell", "sold");
    win.closed = true;
    poll(4);
    await expect(promise).resolves.toBe(true);
    expect(states.map((s) => s.request?.status)).toEqual([
      "pending",
      "success",
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("popup watch lifecycle", () => {
  it("a superseded request's popup closing does not touch the newer request", async () => {
    const connect = await readyConnect();
    const user = await connectedUser(connect);
    const winA = popup();
    const winB = popup();
    openSpy(winA);
    void user.buy({ token: "2jjj", btcAmount: 1n });
    expect(vi.getTimerCount()).toBe(1);
    openSpy(winB);
    void user.sell({ token: "2jjj", tokenAmount: 1n });
    // A stopped watching as soon as B replaced it
    expect(vi.getTimerCount()).toBe(1);
    const states = record(connect);
    winA.closed = true;
    poll(3);
    expect(states).toEqual([]);
    expect(connect.state.request).toMatchObject({
      action: "sell",
      status: "pending",
    });
    expect(connect.state.request).not.toHaveProperty("error");

    // B's own popup still settles B
    winB.closed = true;
    poll();
    expect(connect.state.request).toMatchObject({
      action: "sell",
      status: "rejected",
      error: "popup_closed",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a superseded connect's popup closing leaves the newer connect pending", async () => {
    const connect = await readyConnect();
    const winA = popup();
    const winB = popup();
    openSpy(winA);
    void connect.connect();
    openSpy(winB);
    void connect.connect();
    expect(vi.getTimerCount()).toBe(1);
    winA.closed = true;
    poll(2);
    expect(connect.state.request).toMatchObject({
      action: "connect",
      status: "pending",
    });
  });

  it("disconnect() stops watching", async () => {
    const connect = await readyConnect();
    const user = await connectedUser(connect);
    const win = popup();
    openSpy(win);
    void user.buy({ token: "2jjj", btcAmount: 1n });
    expect(vi.getTimerCount()).toBe(1);
    connect.disconnect();
    expect(vi.getTimerCount()).toBe(0);
    win.closed = true;
    poll();
    expect(connect.state.request).toBeNull();
  });

  it("an answer stops watching right away", async () => {
    const connect = await readyConnect();
    const states = record(connect);
    const win = popup();
    openSpy(win);
    const promise = connect.connect();
    expect(vi.getTimerCount()).toBe(1);
    answer(connect, win, "/authorize/connect", "rejected");
    await expect(promise).rejects.toThrow("User rejected the connection");
    expect(vi.getTimerCount()).toBe(0);
    expect(connect.state.request).not.toHaveProperty("error");
    expect(states.map((s) => s.request?.status)).toEqual([
      "pending",
      "rejected",
    ]);
  });

  it("a blocked popup starts no watch", async () => {
    const connect = await readyConnect();
    vi.spyOn(window, "open").mockReturnValue(null);
    await expect(connect.connect()).rejects.toThrow(/allow popups/);
    expect(vi.getTimerCount()).toBe(0);
  });
});
