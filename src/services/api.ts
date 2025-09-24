import { Balance } from "../models/balance";
import { Token } from "../models/token";
import { User } from "../models/user";
import { HttpClient } from "./http";

const BASE_URL_ENV = {
  dev: "https://api.odin.fun/dev",
  prod: "https://api.odin.fun/v1",
  local: "https://api.odin.fun/dev",
};

export type Pagination = {
  page: number;
  limit: number;
};

export class OdinApi {
  private _apiKey: string | null = null;
  private _httpClient: HttpClient;
  readonly BASE_URL: string;

  constructor(env: "prod" | "dev" = "prod") {
    this._httpClient = new HttpClient();
    this.BASE_URL = BASE_URL_ENV[env];
  }

  getUser(id: string) {
    return this._httpClient.get<User>(`${this.BASE_URL}/user/${id}`);
  }

  async getBalances(
    principal: string,
    pagination: Pagination
  ): Promise<ReadonlyArray<Balance>> {
    const response = await this._httpClient.get<{
      data: ReadonlyArray<Balance>;
    }>(`${this.BASE_URL}/user/${principal}/balances`, {
      headers: {
        Authorization: `Bearer ${this._apiKey}`,
      },
      params: {
        ...pagination,
      },
    });
    return response.data;
  }

  async getTokens(pagination: Pagination) {
    const response = await this._httpClient.get<{
      data: ReadonlyArray<Token>;
    }>(`${this.BASE_URL}/tokens`, {
      headers: {
        Authorization: `Bearer ${this._apiKey}`,
      },
      params: {
        ...pagination,
        sort: "marketcap:desc",
      },
    });
    return response.data;
  }

  set apiKey(key: string) {
    this._apiKey = key;
  }
}
