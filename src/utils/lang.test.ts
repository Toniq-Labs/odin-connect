import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LANG, normalizeOdinLang } from "./lang";

describe("normalizeOdinLang", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should pass through supported values", () => {
    expect(normalizeOdinLang("en")).toBe("en");
    expect(normalizeOdinLang("zh")).toBe("zh");
  });

  it("should fall back to the default and warn on an unsupported value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(normalizeOdinLang("fr")).toBe(DEFAULT_LANG);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('"fr"');
  });

  it("should be case-sensitive (locale variants are not resolved)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(normalizeOdinLang("ZH")).toBe(DEFAULT_LANG);
    expect(normalizeOdinLang("zh-CN")).toBe(DEFAULT_LANG);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("should fall back to the default without warning when omitted", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(normalizeOdinLang(undefined)).toBe(DEFAULT_LANG);
    expect(warn).not.toHaveBeenCalled();
  });
});
