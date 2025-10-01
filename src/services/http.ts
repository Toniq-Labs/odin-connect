import axios, { AxiosRequestConfig, AxiosResponseTransformer } from "axios";
import JSONBigInt from "@apimatic/json-bigint";

export const bigIntTransformer =
    (data:string) => {
      try {
        return JSONBigInt.parse(data);
      } catch (e) {
        console.error("Error parsing response:", e);
        return data;
      }
    }
export class HttpClient {

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
    const response = await axios<ResponseType>(url, overrides);
    return response.data;
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

  async delete<ResponseType>(url: string, options?: AxiosRequestConfig) {
    return this.fetch<ResponseType>(url, { method: "DELETE", ...options });
  }
}
