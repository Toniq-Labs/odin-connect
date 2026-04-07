import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionStorage, SessionData } from "./storage";

const mockData: SessionData = {
  principal: "abc-principal",
  sessionKey: '["key-type",[1,2,3]]',
  delegationChain: '{"delegations":[],"publicKey":[]}',
  jwt: "mock-jwt-token",
};

describe("SessionStorage", () => {
  let storage: SessionStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = new SessionStorage("my-app", "prod");
  });

  it("should save and load session data", () => {
    storage.save(mockData);
    const loaded = storage.load();
    expect(loaded).toEqual(mockData);
  });

  it("should return null when no data stored", () => {
    expect(storage.load()).toBeNull();
  });

  it("should clear stored data", () => {
    storage.save(mockData);
    storage.clear();
    expect(storage.load()).toBeNull();
  });

  it("should scope keys by slug and env", () => {
    const storageA = new SessionStorage("app-a", "prod");
    const storageB = new SessionStorage("app-b", "prod");

    storageA.save(mockData);
    expect(storageB.load()).toBeNull();
    expect(storageA.load()).toEqual(mockData);
  });

  it("should scope keys by env", () => {
    const storageProd = new SessionStorage("my-app", "prod");
    const storageDev = new SessionStorage("my-app", "dev");

    storageProd.save(mockData);
    expect(storageDev.load()).toBeNull();
    expect(storageProd.load()).toEqual(mockData);
  });

  it("should return null for invalid JSON in storage", () => {
    localStorage.setItem("odin_connect:my-app:prod:session", "not-json");
    expect(storage.load()).toBeNull();
  });

  it("should return null for data with missing required fields", () => {
    localStorage.setItem(
      "odin_connect:my-app:prod:session",
      JSON.stringify({ principal: "abc" })
    );
    expect(storage.load()).toBeNull();
  });

  it("should return null for data with wrong field types", () => {
    localStorage.setItem(
      "odin_connect:my-app:prod:session",
      JSON.stringify({ principal: 123, sessionKey: null, delegationChain: null, jwt: null })
    );
    expect(storage.load()).toBeNull();
  });

  it("should not throw when localStorage is unavailable on save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("localStorage disabled");
    });
    expect(() => storage.save(mockData)).not.toThrow();
    vi.restoreAllMocks();
  });

  it("should return null when localStorage is unavailable on load", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("localStorage disabled");
    });
    expect(storage.load()).toBeNull();
    vi.restoreAllMocks();
  });
});
