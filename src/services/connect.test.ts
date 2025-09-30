import { describe, it, expect, beforeAll, vi } from "vitest";
import { Connect } from "./connect";

describe("sample test", () => {
  let connect: Connect;

  beforeAll(() => {
    connect = new Connect({ name: "TestApp", env: "local" });
  });

  it("should initialize Connect instance", () => {
    expect(connect).toBeDefined();
    expect(connect).toBeInstanceOf(Connect);
    expect(connect["_appInfo"]?.name).toBe("TestApp");
    expect(connect["origin"])?.toBe("http://localhost:5173");
  });

  it("should say hello", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    connect.hello();
    expect(consoleLogSpy).toHaveBeenCalledWith("Hello from Odin Connect!");
    consoleLogSpy.mockRestore();
  });

  it("should create authorization URL", () => {
    const url = connect["createUrl"]("authorize/test");
    expect(url).toBeInstanceOf(URL);
    expect(url.pathname).toBe("/authorize/test");
    expect(url.searchParams.get("app_name")).toBe("TestApp");
    expect(url.searchParams.get("referrer")).toBeDefined();
  });
});
