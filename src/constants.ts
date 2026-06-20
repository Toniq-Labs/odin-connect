export const BASE_URL_ENV = {
  dev: "https://api.odin.fun/dev",
  prod: "https://api.odin.fun/v2",
  local: "https://api.odin.fun/dev",
};

export const IMAGE_CDN_ENV = {
  dev: "https://images.odin.fun/dev",
  prod: "https://images.odin.fun/v2",
  local: "https://images.odin.fun/dev",
};

export type OdinEnv = keyof typeof IMAGE_CDN_ENV;
