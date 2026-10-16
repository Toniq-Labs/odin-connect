import { AxiosError } from "axios";

/**
 * Normalise a failed odin-api call: an `AxiosError` becomes an `Error` whose
 * message is the API's `message` (or axios' own), any other `Error` passes
 * through, and anything else becomes `Error(fallback)`.
 */
export function toApiError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.name === "AxiosError") {
    const axiosError = error as AxiosError<{ message?: unknown }>;
    const message = axiosError.response?.data?.message;
    return new Error(
      typeof message === "string" && message ? message : axiosError.message,
    );
  }
  return error instanceof Error ? error : new Error(fallback);
}
