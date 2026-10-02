/**
 * Authorize protocol version sent as `v` on every authorize URL. `2` means:
 * `session_pubkey` instead of the session secret, a signed identity proof in
 * the connect result, no JWT in URLs or messages, and `request_id` binding.
 */
export const PROTOCOL_VERSION = "2";

export const BASE_URL_ENV = {
  dev: "https://api.odin.fun/dev",
  prod: "https://api.odin.fun/v2",
  local: "https://api.odin.fun/dev",
  legacy: "https://api.odin.fun/v1",
};

export const IMAGE_CDN_ENV = {
  dev: "https://images.odin.fun/dev",
  prod: "https://images.odin.fun/v2",
  local: "https://images.odin.fun/dev",
  legacy: "https://images.odin.fun",
};

export type OdinEnv = keyof typeof IMAGE_CDN_ENV;
