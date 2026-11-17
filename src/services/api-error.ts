import { AxiosError } from "axios";

/**
 * Normalise a failed odin-api call: an `AxiosError` becomes an `Error` whose
 * message is the API's `message` (a string, or a NestJS validation string[]
 * joined with "; "; otherwise axios' own), any other `Error` passes
 * through, and anything else becomes `Error(fallback)`.
 */
export function toApiError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.name === "AxiosError") {
    const axiosError = error as AxiosError<{ message?: unknown }>;
    const message = axiosError.response?.data?.message;
    // NestJS validation 400s send `message` as a string[].
    const text = Array.isArray(message)
      ? message.filter((m): m is string => typeof m === "string").join("; ")
      : typeof message === "string"
        ? message
        : "";
    return new Error(text || axiosError.message);
  }
  return error instanceof Error ? error : new Error(fallback);
}
