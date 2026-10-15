import type { Environment } from "./models/environment";

/**
 * Authorize protocol version sent as `v` on every authorize URL. `2` means:
 * `session_pubkey` instead of the session secret, a signed identity proof in
 * the connect result, no JWT in URLs or messages, and `request_id` binding.
 */
export const PROTOCOL_VERSION = "2";

/** API base URL per frontend env. One row per `Environment` (type-checked). */
export const BASE_URL_ENV: Record<Environment, string> = {
  dev: "https://api.odin.fun/dev",
  prod: "https://api.odin.fun/v2",
  local: "https://api.odin.fun/dev",
  legacy: "https://api.odin.fun/v1",
  staging: "https://api.odin.fun/v2",
};

/** Image CDN base URL per frontend env. One row per `Environment`. */
export const IMAGE_CDN_ENV: Record<Environment, string> = {
  dev: "https://images.odin.fun/dev",
  prod: "https://images.odin.fun/v2",
  local: "https://images.odin.fun/dev",
  legacy: "https://images.odin.fun",
  staging: "https://images.odin.fun/v2",
};

export type OdinEnv = Environment;
