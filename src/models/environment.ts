export const ORIGINS = {
  local: "http://localhost:5173",
  prod: "https://odin.fun",
  dev: "https://dev.odin.fun",
  legacy: "https://legacy.odin.fun",
};

export type Environment = keyof typeof ORIGINS;
