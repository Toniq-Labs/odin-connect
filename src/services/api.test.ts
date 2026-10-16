import { beforeAll, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosResponse } from "axios";
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
    expect(prodApi.BASE_URL).toBe("https://api.odin.fun/v2");
  });

  it("it should have the correct base URL for legacy environment", () => {
    const legacyApi = new OdinApiClient("legacy");
    expect(legacyApi.BASE_URL).toBe("https://api.odin.fun/v1");
  });

  it("it should build the user avatar URL for dev environment", () => {
    expect(api.getUserAvatarUrl("some-principal")).toBe(
      "https://images.odin.fun/dev/user/some-principal"
    );
  });

  it("it should build the user avatar URL for prod environment", () => {
    const prodApi = new OdinApiClient("prod");
    expect(prodApi.getUserAvatarUrl("some-principal")).toBe(
      "https://images.odin.fun/v2/user/some-principal"
    );
  });

  it("it should build the user avatar URL for legacy environment", () => {
    const legacyApi = new OdinApiClient("legacy");
    expect(legacyApi.getUserAvatarUrl("some-principal")).toBe(
      "https://images.odin.fun/user/some-principal"
    );
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

  it("it should get balance for a specific token", async () => {
    const getSpy = vi.spyOn(api["_httpClient"], "get").mockResolvedValue({
      data: [
        { id: "other", balance: 50 },
        { id: "token1", balance: 100 },
      ],
    });
    const balance = await api.getBalance("some-principal", "token1");
    expect(getSpy).toHaveBeenCalledWith(
      "https://api.odin.fun/dev/user/some-principal/balances",
      { params: { token_in: "token1" } }
    );
    expect(balance).toEqual({ id: "token1", balance: 100 });
  });

  it("it should return null when token balance not found", async () => {
    vi.spyOn(api["_httpClient"], "get").mockResolvedValue({
      data: [],
    });
    const balance = await api.getBalance("some-principal", "nonexistent");
    expect(balance).toBeNull();
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

describe("OdinApiClient image uploads", () => {
  const png = new File([new Uint8Array([137, 80, 78, 71])], "a.png", {
    type: "image/png",
  });

  it("uploadImage surfaces a NestJS validation message array", async () => {
    const api = new OdinApiClient("dev");
    api.apiKey = "jwt";
    const err = new AxiosError("Request failed with status code 400");
    err.response = {
      status: 400,
      data: { message: ["file too large", "unsupported type"] },
    } as AxiosResponse;
    vi.spyOn(api["_httpClient"], "post").mockRejectedValue(err);
    await expect(api.uploadImage(png)).rejects.toThrow(
      "file too large; unsupported type"
    );
  });

  it("uploadImage keeps the validator's message for a bad file", async () => {
    const api = new OdinApiClient("dev");
    api.apiKey = "jwt";
    const post = vi.spyOn(api["_httpClient"], "post");
    const bad = new File(["x"], "a.txt", { type: "text/plain" });
    await expect(api.uploadImage(bad)).rejects.toBeInstanceOf(Error);
    expect(post).not.toHaveBeenCalled();
  });

  it("updateTokenImage rejects with the API's message (catch now fires)", async () => {
    const api = new OdinApiClient("dev");
    api.apiKey = "jwt";
    const err = new AxiosError("Request failed with status code 403");
    err.response = {
      status: 403,
      data: { message: "Not the token creator" },
    } as AxiosResponse;
    vi.spyOn(api["_httpClient"], "post").mockRejectedValue(err);
    await expect(api.updateTokenImage("2jjj", png)).rejects.toThrow(
      "Not the token creator"
    );
  });

  it("updateTokenImage resolves with the response on success", async () => {
    const api = new OdinApiClient("dev");
    api.apiKey = "jwt";
    vi.spyOn(api["_httpClient"], "post").mockResolvedValue({
      data: { id: "2jjj" },
    });
    await expect(api.updateTokenImage("2jjj", png)).resolves.toEqual({
      data: { id: "2jjj" },
    });
  });
});

describe("OdinApiClient.verifyConnect", () => {
  const body = {
    payload: "{}",
    signature: "c2ln",
    delegation: null,
    publicKey: "cGs=",
    audience: "https://app.example",
    nonce: "n".repeat(32),
    issue_jwt: true,
    client_signature: "Y2xpZW50",
  };

  it("POSTs the proof with client_signature to {base}/connect/verify per env", async () => {
    for (const [env, base] of [
      ["prod", "https://api.odin.fun/v2"],
      ["staging", "https://api.odin.fun/v2"],
      ["legacy", "https://api.odin.fun/v1"],
      ["dev", "https://api.odin.fun/dev"],
      ["local", "https://api.odin.fun/dev"],
    ] as const) {
      const api = new OdinApiClient(env);
      const response = { principal: "aaaaa-aa", username: null, jwt: "j" };
      const post = vi
        .spyOn(api["_httpClient"], "post")
        .mockResolvedValue(response);
      await expect(api.verifyConnect(body)).resolves.toEqual(response);
      expect(post).toHaveBeenCalledWith(`${base}/connect/verify`, body);
    }
  });

  it("rejects with the API's message on a 401", async () => {
    const api = new OdinApiClient("prod");
    vi.spyOn(api["_httpClient"], "post").mockRejectedValue(
      new AxiosError(
        "Request failed with status code 401",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 401,
          data: { message: "Invalid signature" },
        } as AxiosResponse
      )
    );
    await expect(api.verifyConnect(body)).rejects.toThrow("Invalid signature");
  });

  it("falls back to the axios message when the body has none", async () => {
    const api = new OdinApiClient("prod");
    vi.spyOn(api["_httpClient"], "post").mockRejectedValue(
      new AxiosError("Network Error", "ERR_NETWORK")
    );
    await expect(api.verifyConnect(body)).rejects.toThrow("Network Error");
  });
});
