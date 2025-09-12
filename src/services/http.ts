import axios, { AxiosRequestConfig } from "axios";

export class HttpClient {
    
  async get<T>(url: string, options?: AxiosRequestConfig) {
   return this.fetch<T>(url, { method: "GET", ...options });
  }

  async fetch<T>(url: string, options?: AxiosRequestConfig) {
    const overrides: AxiosRequestConfig = {
      ...options,
    };
    const response = await axios<T>(url, overrides);
    return response.data;
  }
}