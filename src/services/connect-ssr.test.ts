// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Connect } from "./connect";

describe("OdinConnect on a server (no window)", () => {
  it("constructs without throwing and stays initializing", async () => {
    expect(typeof window).toBe("undefined");
    const connect = new Connect({ name: "test" });
    expect(connect.state).toEqual({
      status: "initializing",
      user: null,
      request: null,
    });
    expect(await connect.ready()).toBe(connect.state);
    expect(connect.getState()).toBe(connect.state);
    const unsubscribe = connect.subscribe(() => {});
    unsubscribe();
  });
});
