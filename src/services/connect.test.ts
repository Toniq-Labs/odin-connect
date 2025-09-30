import { describe, it, expect, beforeAll, vi } from "vitest";
import { Connect } from "./connect";
import { Token } from "../models/token";

const mockTokens = [
  {
    id: "2jjj",
    ticker: "TEST",
  },
] as Token[];

describe("Connect", () => {
  let connect: Connect;

  beforeAll(() => {
    connect = new Connect({ name: "TestApp", env: "local" });
  });

  it("should initialize Connect instance", () => {
    expect(connect).toBeDefined();
    expect(connect).toBeInstanceOf(Connect);
    expect(connect["_appInfo"]?.name).toBe("TestApp");
    expect(connect["origin"])?.toBe("http://localhost:5173");
  });

  it("should say hello", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    connect.hello();
    expect(consoleLogSpy).toHaveBeenCalledWith("Hello from Odin Connect!");
    consoleLogSpy.mockRestore();
  });

  it("should create authorization URL", () => {
    const url = connect["createUrl"]("authorize/test");
    expect(url).toBeInstanceOf(URL);
    expect(url.pathname).toBe("/authorize/test");
    expect(url.searchParams.get("app_name")).toBe("TestApp");
    expect(url.searchParams.get("referrer")).toBeDefined();
  });

  it("should open the connect window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    // test both requires_api true and false
    const result = connect.connect({ requires_api: false });

    result.catch((e) => {
      expect(e).toBeInstanceOf(Error);
    });

    const url = openSpy.mock.calls[0][0] as URL;

    expect(url).toBeInstanceOf(URL);
    expect(url?.toString()).toContain(
      "http://localhost:5173/authorize/connect?"
    );
    const params = new URLSearchParams(url?.search);
    expect(params.get("app_name")).toBe("TestApp");
    expect(params.get("referrer")).toBeDefined();
    expect(params.get("requires_api")).toBe("0");
  });

  it("should open the buy authorization window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const result = connect.buy({
      token: "2jjj",
      btcAmount: 20001n,
      principal: "test-principal",
    });
    result.catch((e) => {
      console.log(e);
      expect(e).toBeInstanceOf(Error);
    });
    expect(openSpy).toHaveBeenCalled();
    const url = openSpy.mock.calls[0][0] as URL;
    expect(url).toBeInstanceOf(URL);
    expect(url?.toString()).toContain("http://localhost:5173/authorize/buy?");
    const params = new URLSearchParams(url?.search);
    expect(params.get("app_name")).toBe("TestApp");
    expect(params.get("token")).toBe("2jjj");
    expect(params.get("amount")).toBe("20001");
    expect(params.get("principal")).toBe("test-principal");
  });

  it("should open the sell authorization window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const sellPromise = connect.sell({
      token: "2jjj",
      tokenAmount: 32000n,
      principal: "test-principal",
    });

    sellPromise.then((result) => {
      expect(result).toBe(true);
    });

    expect(openSpy).toHaveBeenCalled();

    const url = openSpy.mock.calls[0][0] as URL;
    expect(url).toBeInstanceOf(URL);
    expect(url?.toString()).toContain("http://localhost:5173/authorize/sell?");

    const params = new URLSearchParams(url?.search);
    expect(params.get("app_name")).toBe("TestApp");
    expect(params.get("token")).toBe("2jjj");
    expect(params.get("amount")).toBe("32000");
    expect(params.get("principal")).toBe("test-principal");

    simulateMessage("authorize/sell", "sold");
  });

  it("should handle rejected sell", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const sellPromise = connect.sell({
      token: "2jjj",
      tokenAmount: 32000n,
      principal: "test-principal",
    });

    sellPromise.then(
      () => {
        expect(true).toBe(false); // should not be called
      },
      (e) => {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toContain("failed");
      }
    );

    expect(openSpy).toHaveBeenCalled();

    simulateRejectMessage("authorize/sell");
  });

  it("should open the transfer authorization window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const result = connect.transfer({
      token: "2jjj",
      amount: 45000n,
      destination: "to-principal",
      principal: "from-principal",
    });
    result.catch((e) => {
      expect(e).toBeInstanceOf(Error);
    });
    expect(openSpy).toHaveBeenCalled();
    const url = openSpy.mock.calls[0][0] as URL;
    expect(url).toBeInstanceOf(URL);
    expect(url?.toString()).toContain(
      "http://localhost:5173/authorize/transfer?"
    );
    const params = new URLSearchParams(url?.search);
    expect(params.get("app_name")).toBe("TestApp");
    expect(params.get("token")).toBe("2jjj");
    expect(params.get("amount")).toBe("45000");
    expect(params.get("destination")).toBe("to-principal");
    expect(params.get("principal")).toBe("from-principal");
  });

  it("should handle rejected transfer", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const transferPromise = connect.transfer({
      token: "2jjj",
      amount: 45000n,
      destination: "to-principal",
      principal: "from-principal",
    });

    transferPromise.then(
      () => expect(true).toBe(false), // should not be called
      (e) => {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toContain("failed");
      }
    );

    expect(openSpy).toHaveBeenCalled();

    simulateRejectMessage("authorize/transfer");
  });

  it("should open the add liquidity authorization window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const addLiquidityPromise = connect.addLiquidity({
      token: "2jjj",
      btcAmount: 10000n,
      principal: "test-principal",
    });

    addLiquidityPromise.then(
      (result) => expect(result).toBe(true),
      () => expect(true).toBe(false) // should not be called
    );

    expect(openSpy).toHaveBeenCalled();

    const url = openSpy.mock.calls[0][0] as URL;
    expect(url).toBeInstanceOf(URL);
    expect(url?.toString()).toContain(
      "http://localhost:5173/authorize/add_liquidity?"
    );

    const params = new URLSearchParams(url?.search);
    expect(params.get("app_name")).toBe("TestApp");
    expect(params.get("token")).toBe("2jjj");
    expect(params.get("amount")).toBe("10000");
    expect(params.get("principal")).toBe("test-principal");

    simulateMessage("authorize/add_liquidity", "addedLiquidity");
  });

  it("should handle rejected add liquidity", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const addLiquidityPromise = connect.addLiquidity({
      token: "2jjj",
      btcAmount: 10000n,
      principal: "test-principal",
    });

    addLiquidityPromise.then(
      () => expect(true).toBe(false), // should not be called
      (e) => {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toContain("failed");
      }
    );

    expect(openSpy).toHaveBeenCalled();

    simulateRejectMessage("authorize/add_liquidity");
  });

  it("should open the remove liquidity authorization window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const removeLiquidityPromise = connect.removeLiquidity({
      token: "2jjj",
      lpAmount: 15000n,
      principal: "test-principal",
    });

    removeLiquidityPromise.then(
      (result) => expect(result).toBe(true),
      () => expect(true).toBe(false) // should not be called
    );
    expect(openSpy).toHaveBeenCalled();
    const url = openSpy.mock.calls[0][0] as URL;
    expect(url).toBeInstanceOf(URL);
    expect(url?.toString()).toContain(
      "http://localhost:5173/authorize/remove_liquidity?"
    );
    const params = new URLSearchParams(url?.search);
    expect(params.get("app_name")).toBe("TestApp");
    expect(params.get("token")).toBe("2jjj");
    expect(params.get("amount")).toBe("15000");
    expect(params.get("principal")).toBe("test-principal");

    simulateMessage("authorize/remove_liquidity", "removedLiquidity");
  });

  it("should handle rejected remove liquidity", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const removeLiquidityPromise = connect.removeLiquidity({
      token: "2jjj",
      lpAmount: 15000n,
      principal: "test-principal",
    });

    removeLiquidityPromise.then(
      () => expect(true).toBe(false), // should not be called
      (e) => {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toContain("failed");
      }
    );

    expect(openSpy).toHaveBeenCalled();

    simulateRejectMessage("authorize/remove_liquidity");
  });

  it("should create a base action", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const action = connect["baseAction"]({
      params: { test: "param" },
      odinPath: "authorize/test_action",
      receivedMessageFromOrigin(message) {
        return message !== "rejected";
      },
      resolve: {
        success: (message) => {
          return message + " extra";
        },
        failure: "rejected",
        close: "rejected",
      },
    });

    action.then((res) => {
      expect(res).toBe("success extra");
    });

    expect(openSpy).toHaveBeenCalled();
    const url = openSpy.mock.calls[0][0] as URL;
    expect(url).toBeInstanceOf(URL);
    expect(url?.toString()).toContain(
      "http://localhost:5173/authorize/test_action?"
    );
    const params = new URLSearchParams(url?.search);
    expect(params.get("app_name")).toBe("TestApp");
    expect(params.get("test")).toBe("param");

    simulateMessage("authorize/test_action", "success");
  });
});

function simulateRejectMessage(path: string) {
  const messageEvent = new MessageEvent("message", {
    data: {
      path: "/" + path,
      message: "rejected",
    },
    origin: "http://localhost:5173",
  });
  window.dispatchEvent(messageEvent);
}

function simulateMessage<T>(path: string, data: T) {
  const messageEvent = new MessageEvent("message", {
    data: {
      path: "/" + path,
      message: data,
    },
    origin: "http://localhost:5173",
  });
  window.dispatchEvent(messageEvent);
}
