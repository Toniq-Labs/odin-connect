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

  it("should fetch all tokens", async () => {
    connect["_api"].getTokens = vi.fn().mockResolvedValue({
      data: mockTokens,
      count: mockTokens.length,
      page: 1,
      limit: 10,
    });
    const tokens = await connect.getTokens({
      pagination: { page: 1, limit: 10 },
      sort: { field: "price", direction: "desc" },
    });
    expect(connect["_api"].getTokens).toHaveBeenCalledWith(
      {
        page: 1,
        limit: 10,
      },
      { field: "price", direction: "desc" }
    );
    expect(tokens.data).toEqual(mockTokens);
  });

  it("should fetch all balances", async () => {
    connect["_api"].getBalances = vi.fn().mockResolvedValue([]);
    const result = await connect.getBalances({
      principal: "test-principal",
      pagination: { page: 1, limit: 10 },
    });
    expect(connect["_api"].getBalances).toHaveBeenCalledWith("test-principal", {
      page: 1,
      limit: 10,
    });
    expect(result).toEqual([]);
  });

  it("should open the connect window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    // test both requires_api true and false
    connect.connect({ requires_api: false });
    connect.connect({ requires_api: true });
    connect.connect({
      open: {
        target: "_blank",
        settings: "height=600,width=400,left=100,top=100",
      },
    });
    expect(openSpy).toHaveBeenCalledTimes(3);
    for (let i = 0; i < openSpy.mock.calls.length; i++) {
      const url = openSpy.mock.calls[i][0] as URL;

      expect(url).toBeInstanceOf(URL);
      expect(url?.toString()).toContain(
        "http://localhost:5173/authorize/connect?"
      );
      const params = new URLSearchParams(url?.search);
      expect(params.get("app_name")).toBe("TestApp");
      expect(params.get("referrer")).toBeDefined();
      if (i === 0) {
        expect(params.get("requires_api")).toBe("0");
      } else if (i === 1) {
        expect(params.get("requires_api")).toBe("1");
      } else if (i === 2) {
        expect(params.get("requires_api")).toBe("0");
        expect(openSpy.mock.calls[i][1]).toBe("_blank");
        expect(openSpy.mock.calls[i][2]).toBe(
          "height=600,width=400,left=100,top=100"
        );
      }
    }
  });

  it("should open the buy authorization window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    connect.buy({
      token: "2jjj",
      btcAmount: 20001n,
      principal: "test-principal",
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
    connect.sell({
      token: "2jjj",
      tokenAmount: 32000n,
      principal: "test-principal",
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
  });

  it("should open the transfer authorization window", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    connect.transfer({
      token: "2jjj",
      amount: 45000n,
      destination: "to-principal",
      principal: "from-principal",
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
});
