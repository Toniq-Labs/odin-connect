import { describe, expect, it } from "vitest";
import { buildTokenImageUrl } from ".";

describe("buildTokenImageUrl", () => {
  it("should default to the prod image CDN", () => {
    expect(buildTokenImageUrl("2jjj")).toBe(
      "https://images.odin.fun/v2/token/2jjj"
    );
  });

  it("should build the token image URL for the legacy environment", () => {
    expect(buildTokenImageUrl("2jjj", "legacy")).toBe(
      "https://images.odin.fun/token/2jjj"
    );
  });
});
