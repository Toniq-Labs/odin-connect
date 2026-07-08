import { describe, expect, it } from "vitest";
import { createTokenValidators } from ".";

describe("token-field-validators", () => {
  it("should validate ticker correctly", () => {
    const validator = createTokenValidators.ticker;

    if (validator) {
      expect(validator("TEST")).toBeUndefined();
      expect(validator("T3ST")).toBeUndefined();
      expect(validator("TICKER1")).toBeUndefined();
      expect(validator("tax")).toBe(
        "Ticker must be alphanumeric characters in uppercase only."
      );
      expect(validator("AB")).toBe(
        "Ticker must be between 3 and 10 characters."
      );
      expect(validator("A1")).toBe(
        "Ticker must be between 3 and 10 characters."
      );
      expect(validator("123456")).toBe(
        "Ticker must have at least 2 alpha characters."
      );
    }
  });

  it("should validate vanity_ticker correctly", () => {
    const validator = createTokenValidators.vanity_ticker;

    if (validator) {
      // Optional — absent/empty means no vanity ticker.
      expect(validator(undefined as never)).toBeUndefined();
      expect(validator(null)).toBeUndefined();
      expect(validator("")).toBeUndefined();
      // Any characters allowed, 1-10 code points.
      expect(validator("A")).toBeUndefined();
      expect(validator("MyTicker")).toBeUndefined();
      expect(validator("1234567890")).toBeUndefined(); // exactly 10
      expect(validator("Tëst🚀")).toBeUndefined(); // non-ASCII + emoji
      expect(validator("你好世界")).toBeUndefined(); // CJK
      // Emoji count as 1 code point each — 10 emoji is valid.
      expect(validator("🚀".repeat(10))).toBeUndefined();
      // Too long.
      expect(validator("12345678901")).toBe(
        "Vanity ticker must be below 10 characters."
      );
      expect(validator("🚀".repeat(11))).toBe(
        "Vanity ticker must be below 10 characters."
      );
      // Surrounding whitespace.
      expect(validator(" AB")).toBe(
        "Vanity ticker must not have leading or trailing whitespace."
      );
      expect(validator("AB ")).toBe(
        "Vanity ticker must not have leading or trailing whitespace."
      );
    }
  });

  it("should validate name correctly", () => {
    const validator = createTokenValidators.name;

    if (validator) {
      expect(validator("My Token")).toBeUndefined();
      expect(validator("")).toBe("Name is required.");
      expect(validator("A".repeat(51))).toBe(
        "Name must be between 3 and 30 characters."
      );
    }
  });

  it("should validate description correctly", () => {
    const validator = createTokenValidators.description;
    if (validator) {
      expect(validator("This is a token description.")).toBeUndefined();
      expect(validator("A".repeat(201))).toBe(
        "Description must not exceed 100 characters."
      );
    }
  });
});
