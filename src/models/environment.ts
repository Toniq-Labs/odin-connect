export const ORIGINS = {
  local: "http://localhost:5173",
  prod: "https://odin.fun",
  dev: "https://dev.odin.fun",
  _preview: "https://deploy-preview-1368--dev-odin-toniq.netlify.app",
};

export type Environment = keyof typeof ORIGINS;
