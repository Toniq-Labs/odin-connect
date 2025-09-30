import { describe, expect, it } from "vitest";
import { convertToOdinAmount } from ".";

describe("convertToOdinAmount", () => {
  it("should convert to Odin amount correctly", () => {
    // divisibility of 8 i.e. ODIN tokens, BTC
    expect(convertToOdinAmount("0.1", { decimals: 3, divisibility: 8 })).toBe(
      10_000_000_000n
    );
    expect(
      convertToOdinAmount("0.00000001", { decimals: 3, divisibility: 8 })
    ).toBe(1_000n);
    expect(
      convertToOdinAmount("0.00000000000000001", { decimals: 3, divisibility: 8 })
    ).toBe(0n);
    // divisibility of 16 i.e. PUPS
    expect(
      convertToOdinAmount("0.0000000000000005", { decimals: 3, divisibility: 16 })
    ).toBe(5_000n);
    expect(
      convertToOdinAmount("2.00000000002", { decimals: 3, divisibility: 16 })
    ).toBe(20_000_000_000_200_000_000n);

    // divisibility of 0 i.e. whole tokens only
    expect(
      convertToOdinAmount("120", { decimals: 0, divisibility: 0 })
    ).toBe(120n);
  });

  it("should handle invalid inputs gracefully", () => {
    expect(convertToOdinAmount("abc")).toBe(0n);
    expect(convertToOdinAmount("")).toBe(0n);
    expect(convertToOdinAmount("   ")).toBe(0n);
    expect(convertToOdinAmount(NaN)).toBe(0n);
  });
});

describe("convertToOdinAmount edge cases", () => {
  it("should handle very large numbers", () => {
    expect(
      convertToOdinAmount("12345678901234567890.123456789", { decimals: 3, divisibility: 8 })
    ).toBe(1234567890123456789012345678900n);
  });

  it("should handle numbers with excessive decimal places", () => {
    expect(
      convertToOdinAmount("1.1234567890123456789012345", {
        decimals: 3,
        divisibility: 8,
      })
    ).toBe(112345678901n); // truncated to 11 decimal places
  });

  it("should handle negative numbers", () => {
    expect(
      convertToOdinAmount("-0.1", { decimals: 3, divisibility: 8 })
    ).toBe(-10_000_000_000n);
    expect(
      convertToOdinAmount("-123.456", { decimals: 3, divisibility: 8 })
    ).toBe(-12345600000000n);
  });
});
