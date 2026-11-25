import axios, { AxiosRequestConfig, AxiosResponseTransformer } from "axios";
import JSONBigInt from "@apimatic/json-bigint";

export const bigIntTransformer =
    (data:string) => {
      // axios calls custom transformers unconditionally (unlike its default,
      // which skips empty bodies), so a 204 / empty body must pass through.
      if (typeof data !== "string" || data === "") return data;
      try {
        return JSONBigInt.parse(data);
      } catch (e) {
        console.error("Error parsing response:", e);
        return data;
      }
    }
/** HTTP status of a failed axios call, or undefined for anything else. */
export function httpStatus(error: unknown): number | undefined {
  if (error instanceof Error && error.name === "AxiosError") {
    return (error as Error & { response?: { status?: number } }).response
      ?.status;
  }
  return undefined;
}

/** The Bearer token a request was sent with, if any. */
function bearerToken(options?: AxiosRequestConfig): string | null {
  const headers = options?.headers as Record<string, unknown> | undefined;
  const value = headers?.Authorization ?? headers?.authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length);
}

export class HttpClient {
  /**
   * Called with the token when a request sent with a Bearer token gets a
   * `401`: the token is no longer accepted (expired, or its odin.fun session
   * logged out). One place for every API-key request, so no method has to
   * handle it. The request still rejects as before.
   */
  onUnauthorized: ((token: string) => void) | null = null;

  async get<ResponseType>(url: string, options?: AxiosRequestConfig) {
    return this.fetch<ResponseType>(url, { method: "GET", ...options });
  }

  async fetch<ResponseType>(url: string, options?: AxiosRequestConfig) {
    // for any custom headers or other axios options in the future
    // should we add Auth bearer token here if available?
    const overrides: AxiosRequestConfig = {
      transformResponse: [bigIntTransformer],
      ...options,
    };
    try {
      const response = await axios<ResponseType>(url, overrides);
      return response.data;
    } catch (error) {
      const token = bearerToken(options);
      if (token && httpStatus(error) === 401) {
        try {
          this.onUnauthorized?.(token);
        } catch {
          // the handler never changes how the request fails
        }
      }
      throw error;
    }
  }

  async post<ResponseType, DataType = string>(
    url: string,
    data?: DataType,
    options?: AxiosRequestConfig
  ) {
    return this.fetch<ResponseType>(url, {
      method: "POST",
      data,
      ...options,
    });
  }

  async put<DataType, ResponseType>(
    url: string,
    data?: DataType,
    options?: AxiosRequestConfig
  ) {
    return this.fetch<ResponseType>(url, {
      method: "PUT",
      data,
      ...options,
    });
  }

  async patch<ResponseType, DataType = string>(
    url: string,
    data?: DataType,
    options?: AxiosRequestConfig
  ) {
    return this.fetch<ResponseType>(url, {
      method: "PATCH",
      data,
      ...options,
    });
  }

  async delete<ResponseType>(url: string, options?: AxiosRequestConfig) {
    return this.fetch<ResponseType>(url, { method: "DELETE", ...options });
  }
}
