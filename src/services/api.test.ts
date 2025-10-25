import { beforeAll, describe, expect, it, vi } from "vitest";
import { OdinApiClient } from "./api";

describe("ApiClient", () => {
  let api: OdinApiClient;
  beforeAll(() => {
    api = new OdinApiClient("dev");
  });

  it("should create an instance of OdinApiClient", () => {
    expect(api).toBeInstanceOf(OdinApiClient);
  });

  it("it should have the correct base URL for dev environment", () => {
    expect(api.BASE_URL).toBe("https://api.odin.fun/dev");
  });

  it("it should have the correct base URL for prod environment", () => {
    const prodApi = new OdinApiClient("prod");
    expect(prodApi.BASE_URL).toBe("https://api.odin.fun/v1");
  });

  it("it should get user by ID", async () => {
    const getUserSpy = vi.spyOn(api["_httpClient"], "get").mockResolvedValue({
      id: "some-id",
      name: "Test User",
    });
    const user = await api.getUser("some-id");
    expect(getUserSpy).toHaveBeenCalledWith(
      "https://api.odin.fun/dev/user/some-id"
    );
    expect(user).toEqual({ id: "some-id", name: "Test User" });
  });

  it("it should get balances for a user", async () => {
    const getSpy = vi.spyOn(api["_httpClient"], "get").mockResolvedValue({
      data: [
        { token: "token1", balance: 100 },
        { token: "token2", balance: 200 },
      ],
    });
    const balances = await api.getBalances("some-principal", {
      page: 1,
      limit: 10,
    });
    expect(getSpy).toHaveBeenCalledWith(
      "https://api.odin.fun/dev/user/some-principal/balances",
      { params: { page: 1, limit: 10 } }
    );
    expect(balances).toEqual([
      { token: "token1", balance: 100 },
      { token: "token2", balance: 200 },
    ]);
  });

  it("it should get tokens with pagination and sorting", async () => {
    const getSpy = vi.spyOn(api["_httpClient"], "get").mockResolvedValue({
      data: [
        { id: "token1", marketcap: 1000 },
        { id: "token2", marketcap: 2000 },
      ],
      count: 2,
      page: 1,
      limit: 10,
    });
    const tokens = await api.getTokens(
      { page: 1, limit: 10 },
      { field: "marketcap", direction: "asc" }
    );
    expect(getSpy).toHaveBeenCalledWith("https://api.odin.fun/dev/tokens", {
      params: { page: 1, limit: 10, sort: "marketcap:asc" },
    });
    expect(tokens).toEqual({
      data: [
        { id: "token1", marketcap: 1000 },
        { id: "token2", marketcap: 2000 },
      ],
      count: 2,
      page: 1,
      limit: 10,
    });
  });
});
