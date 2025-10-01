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
