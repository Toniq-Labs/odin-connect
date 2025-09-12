import { Balance } from "../models/balance";
import { User } from "../models/user";
import { HttpClient } from "./http";

const BASE_URL_ENV = {
  dev: "https://api.odin.fun/dev",
  prod: "https://api.odin.fun/v1",
  local: "https://api.odin.fun/dev",
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

  async getBalances(principal: string): Promise<ReadonlyArray<Balance>> {
    console.log("Fetching balances for", principal);
    const response = await this._httpClient.get<{
      data: ReadonlyArray<Balance>;
    }>(`${this.BASE_URL}/user/${principal}/balances`, {
      headers: {
        Authorization: `Bearer ${this._apiKey}`,
      },
    });
    return response.data;
  }

  set apiKey(key: string) {
    this._apiKey = key;
  }
}
