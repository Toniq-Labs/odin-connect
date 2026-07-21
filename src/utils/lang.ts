import { OdinLang } from "../models/lang";

export const DEFAULT_LANG: OdinLang = "en";

export function normalizeOdinLang(value?: string): OdinLang {
  if (value === "en" || value === "zh") return value;
  if (value !== undefined) {
    console.warn(
      `[odin-connect] Unsupported lang "${value}", falling back to "${DEFAULT_LANG}"`
    );
  }
  return DEFAULT_LANG;
}
