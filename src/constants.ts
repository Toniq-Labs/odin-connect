import type { Environment } from "./models/environment";

/**
 * Authorize protocol version sent as `v` on every authorize URL. `2` means:
 * `session_pubkey` instead of the session secret, a signed identity proof in
 * the connect result, no JWT in URLs or messages, and `request_id` binding.
 */
export const PROTOCOL_VERSION = "2";

/**
 * Default for the `sessionCheckIntervalMs` option: how often, at most, the
 * SDK asks odin-api whether the stored session is still alive (on page load,
 * tab focus and visibility). A logout on odin.fun is noticed at the first
 * load or focus after this time; nothing checks while a tab just stays
 * focused.
 */
export const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Connect-proof version asked for as `proof_v` on the connect URL. With `2`,
 * Odin signs a v2 proof carrying the user's odin.fun session id (`sid`) when
 * it has one, so odin-api can tie the app's JWT to that session and end it
 * when the user logs out on odin.fun. Odin falls back to v1 (no `sid`)
 * otherwise, and SDKs that don't ask always get v1.
 */
export const CONNECT_PROOF_VERSION = "2";

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
