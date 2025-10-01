import { it, beforeAll, describe, expect, vi, Mock } from "vitest";
import { bigIntTransformer, HttpClient } from "./http";
import axios from "axios";
import { afterEach } from "node:test";

describe("HttpClient", () => {
  let http: HttpClient;
  let mockedAxios = axios as unknown as Mock;
  vi.mock("axios");

  beforeAll(() => {
    http = new HttpClient();
  });

  afterEach(() => {
    mockedAxios.mockClear();
  });

  it("should create http instance", () => {
    expect(http).toBeDefined();
    expect(http).toBeInstanceOf(HttpClient);
  });

  it("should send GET request", async () => {
    const url = "http://localhost:3000";
    mockedAxios.mockResolvedValue({ data: true });
    const data = await http.get<boolean>(url);
    expect(mockedAxios).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: "GET" })
    );
    expect(data).toBe(true);
  });

  it("should send POST request", async () => {
    const url = "http://localhost:3000";
    mockedAxios.mockResolvedValue({ data: "success" });
    const data = await http.post<boolean>(url);
    expect(mockedAxios).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: "POST" })
    );
    expect(data).toBe("success");
  });

  it("should transform", () => {
    expect(
      bigIntTransformer(`{"bigInt":200000000000000023}`)["bigInt"]
    ).toBeTypeOf("bigint");

    expect(bigIntTransformer(`{"num":200}`)["num"]).toBeTypeOf("number");
  });
});
