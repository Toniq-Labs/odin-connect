// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Connect } from "./connect";
import { INITIAL_ODIN_STATE } from "./state";

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

  it("has a stable, frozen server snapshot for useSyncExternalStore", () => {
    const connect = new Connect({ name: "test" });
    const { getServerState } = connect;
    expect(getServerState()).toBe(getServerState());
    expect(getServerState()).toBe(Connect.serverState);
    expect(Connect.serverState).toBe(INITIAL_ODIN_STATE);
    expect(new Connect({ name: "other" }).getServerState()).toBe(
      INITIAL_ODIN_STATE
    );
    expect(INITIAL_ODIN_STATE).toEqual({
      status: "initializing",
      user: null,
      request: null,
    });
    expect(Object.isFrozen(INITIAL_ODIN_STATE)).toBe(true);
    // the same snapshot the server renders with
    expect(connect.getState()).toBe(getServerState());
  });
});
