import { describe, expect, it } from "vitest";
import { Connect } from "./connect";

describe("Connect env → API base URL mapping", () => {
  it("should map legacy env to the legacy API base URL", () => {
    const connect = new Connect({ env: "legacy" });
    expect(connect["_api"].BASE_URL).toBe("https://api.odin.fun/v1");
  });

  it("should map prod env to the prod API base URL", () => {
    const connect = new Connect({ env: "prod" });
    expect(connect["_api"].BASE_URL).toBe("https://api.odin.fun/v2");
  });

  it("should collapse dev/local to the dev API base URL", () => {
    expect(new Connect({ env: "dev" })["_api"].BASE_URL).toBe(
      "https://api.odin.fun/dev"
    );
    expect(new Connect({ env: "local" })["_api"].BASE_URL).toBe(
      "https://api.odin.fun/dev"
    );
  });
});
