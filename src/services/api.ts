import { AxiosError } from "axios";
import { Activity } from "../models/activity";
import { Balance } from "../models/balance";
import {
  Token,
  TokenFilterFields,
  TokenSortableFields,
  TokenWithBalance,
} from "../models/token";
import { User } from "../models/user";
import { HttpClient } from "./http";
import { createTokenValidators } from "../utils";
import { AchievementCategory } from "../models/achievement";
import { Transaction } from "../models/transactions";

const BASE_URL_ENV = {
  dev: "https://api.odin.fun/dev",
  prod: "https://api.odin.fun/v2",
  local: "https://api.odin.fun/dev",
};

const IMAGE_CDN_ENV = {
  dev: "https://images.odin.fun/dev",
  prod: "https://images.odin.fun/v2",
  local: "https://images.odin.fun/dev",
};

export type Pagination = {
  page: number;
  limit: number;
};

export type Sort<T = string> = {
  field: T;
  direction: "asc" | "desc";
};

export type PaginatedResponse<T> = {
  data: ReadonlyArray<T>;
  count: number;
  page: number;
  limit: number;
};

export class OdinApiClient {
  private _apiKey: string | null = null;
  private _httpClient: HttpClient;
  readonly BASE_URL: string;
  readonly ENV: "prod" | "dev";

  constructor(env: "prod" | "dev" = "prod") {
    this._httpClient = new HttpClient();
    this.BASE_URL = BASE_URL_ENV[env];
    this.ENV = env;
  }

  getUser(id: string) {
    return this._httpClient.get<User>(`${this.BASE_URL}/user/${id}`);
  }

  getUserAvatarUrl(principal: string): string {
    return `${IMAGE_CDN_ENV[this.ENV]}/user/${principal}`;
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

  async getBalance(principal: string, tokenId: string) {
    const response = await this._httpClient.get<{
      data: ReadonlyArray<Balance>;
    }>(`${this.BASE_URL}/user/${principal}/balances`, {
      params: {
        token_in: tokenId,
      },
    });
    return response.data.find((b) => b.id === tokenId) ?? null;
  }

  getTokens(
    pagination: Pagination,
    sort: Sort<TokenSortableFields> = { field: "marketcap", direction: "desc" },
    filters: Partial<TokenFilterFields> = {}
  ) {
    return this._httpClient.get<PaginatedResponse<Token>>(
      `${this.BASE_URL}/tokens`,
      {
        params: {
          ...pagination,
          sort: `${sort.field}:${sort.direction}`,
          ...filters,
        },
      }
    );
  }

  getToken(id: string) {
    return this._httpClient.get<Token>(`${this.BASE_URL}/token/${id}`);
  }

  async uploadImage(image: File) {
    if (!this._apiKey) {
      throw new Error("API key is not set");
    }
    try {
      const errors = createTokenValidators.image?.(image);
      if (errors) {
        throw new Error(errors);
      }
      const formData = new FormData();
      formData.append("file", image);
      const result = await this._httpClient.post<
        { data: { upload: string } },
        FormData
      >(`${this.BASE_URL}/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${this._apiKey}`,
        },
      });
      return result.data.upload;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AxiosError") {
          const axiosError = error as AxiosError<{ message: string }>;
          throw new Error(
            axiosError.response?.data?.message || axiosError.message
          );
        } else {
          throw new Error(error.message);
        }
      } else {
        throw new Error("Image upload failed");
      }
    }
  }

  updateTokenImage(tokenId: string, image: File) {
    if (!this._apiKey) {
      throw new Error("API key is not set");
    }
    try {
      return this._httpClient.post<{ data: Token }, { image: File }>(
        `${this.BASE_URL}/token/${tokenId}/image`,
        { image },
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${this._apiKey}`,
          },
        }
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AxiosError") {
        const axiosError = error as AxiosError<{ message: string }>;
        throw new Error(
          axiosError.response?.data?.message || axiosError.message
        );
      } else {
        throw new Error("Image update failed");
      }
    }
  }

  getUserActivity(principal: string, pagination: Pagination) {
    return this._httpClient.get<PaginatedResponse<Activity>>(
      `${this.BASE_URL}/user/${principal}/activity`,
      {
        params: {
          ...pagination,
        },
      }
    );
  }

  async getUserTokens(principal: string, pagination: Pagination) {
    const response = await this._httpClient.get<
      PaginatedResponse<{
        balance: bigint;
        token: Token;
        unrealized_pnl?: number;
        unrealized_pnl_percent?: number;
      }>
    >(`${this.BASE_URL}/user/${principal}/tokens`, {
      params: {
        ...pagination,
      },
    });

    return {
      ...response,
      data: response.data.map((item) => ({
        ...item,
        balance: BigInt(item.balance), // Cast balance to BigInt always
      })),
    };
  }

  async getUserLiquidity(principal: string, pagination: Pagination) {
    const response = await this._httpClient.get<
      PaginatedResponse<TokenWithBalance>
    >(`${this.BASE_URL}/user/${principal}/liquidity`, {
      params: {
        ...pagination,
      },
    });

    return {
      ...response,
      data: response.data.map((item) => ({
        ...item,
        balance: BigInt(item.balance), // Cast balance to BigInt always
      })),
    };
  }

  async getUserAchievements(principal: string, pagination: Pagination) {
    const response = await this._httpClient.get<
      PaginatedResponse<AchievementCategory>
    >(`${this.BASE_URL}/user/${principal}/achievements`, {
      params: {
        ...pagination,
      },
    });
    return response.data;
  }

  getUserTransactions(principal: string, pagination: Pagination) {
    return this._httpClient.get<PaginatedResponse<Transaction>>(
      `${this.BASE_URL}/user/${principal}/transactions`,
      {
        params: {
          ...pagination,
        },
      }
    );
  }

  getUserCreatedTokens(principal: string, pagination: Pagination) {
    return this._httpClient.get<PaginatedResponse<Token>>(
      `${this.BASE_URL}/user/${principal}/created`,
      {
        params: {
          ...pagination,
        },
      }
    );
  }

  getUserStats(principal: string) {
    return this._httpClient.get<{ followers: number; following: number }>(
      `${this.BASE_URL}/user/${principal}/stats`
    );
  }

  set apiKey(key: string | null) {
    this._apiKey = key;
  }

  get apiKey(): string | null {
    return this._apiKey;
  }
}
