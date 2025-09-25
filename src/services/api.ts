import { Activity } from "../models/activity";
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

export type Sort = {
  field: string;
  direction: "asc" | "desc";
};

export type PaginatedResponse<T> = {
  data: ReadonlyArray<T>;
  count: number;
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

  async getBalances(principal: string, pagination: Pagination) {
    const response = await this._httpClient.get<{
      data: ReadonlyArray<Balance>;
    }>(`${this.BASE_URL}/user/${principal}/balances`, {
      params: {
        ...pagination,
      },
    });
    return response.data;
  }

  getTokens(
    pagination: Pagination,
    sort: Sort = { field: "marketcap", direction: "desc" }
  ) {
    return this._httpClient.get<PaginatedResponse<Token>>(
      `${this.BASE_URL}/tokens`,
      {
        params: {
          ...pagination,
          sort: `${sort.field}:${sort.direction}`,
        },
      }
    );
  }

  getToken(id: string) {
    return this._httpClient.get<Token>(`${this.BASE_URL}/token/${id}`);
  }

  uploadImage(image: File) {
    // image file type validation
    if (!image.type.startsWith("image/")) {
      return Promise.reject(new Error("Invalid image file type"));
    }
    const formData = new FormData();
    formData.append("file", image);
    return this._httpClient.post<{ upload: string }, FormData>(
      `${this.BASE_URL}/upload/image`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${this._apiKey}`,
        },
      }
    );
  }

  getUserActivity(principal: string, pagination: Pagination) {
    return this._httpClient.get<PaginatedResponse<Activity>>(
      `${this.BASE_URL}/user/${principal}/activity`,
      {
        headers: {
          Authorization: this.apiKey ? `Bearer ${this.apiKey}` : "",
        },
        params: {
          ...pagination,
        },
      }
    );
  }

  set apiKey(key: string) {
    this._apiKey = key;
  }

  get apiKey(): string | null {
    return this._apiKey;
  }
}
