import { describe, expect, it, vi } from "vitest";
import { OdinCanisterClient } from "./canister";
import { OdinApiClient } from "./api";
import { WindowClient } from "./window";
import { AppInitOptions } from "./connect";

const ORIGIN = "https://odin.fun";

function makeClient(openSpy: (url: URL) => void) {
  const windowClient = {
    open: vi.fn((url: URL) => {
      openSpy(url);
      return { closed: false } as Window;
    }),
  } as unknown as WindowClient;

  const apiClient = {
    uploadImage: vi.fn(async () => "https://cdn.example/img.png"),
  } as unknown as OdinApiClient;

  const appInfo: AppInitOptions = { name: "TestApp" };

  return new OdinCanisterClient(windowClient, apiClient, appInfo, ORIGIN);
}

async function resolveCreateToken(path: string) {
  // Wait a macrotask so baseAction attaches its message listener, then reply.
  await new Promise((r) => setTimeout(r, 0));
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: ORIGIN,
      data: { path: "/" + path, message: "tokenCreated" },
    })
  );
}

describe("OdinCanisterClient.createToken", () => {
  const baseParams = {
    principal: "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
    name: "Test Token",
    ticker: "TEST",
    image: new File(["x"], "img.png", { type: "image/png" }),
  };

  it("forwards vanity_ticker to the authorize URL params", async () => {
    let captured: URL | undefined;
    const client = makeClient((url) => (captured = url));

    const p = client.createToken({ ...baseParams, vanity_ticker: "MyVanity" });
    await resolveCreateToken("authorize/create_token");
    await p;

    expect(captured?.searchParams.get("vanity_ticker")).toBe("MyVanity");
  });

  it("omits vanity_ticker from the URL when not provided", async () => {
    let captured: URL | undefined;
    const client = makeClient((url) => (captured = url));

    const p = client.createToken({ ...baseParams });
    await resolveCreateToken("authorize/create_token");
    await p;

    expect(captured?.searchParams.has("vanity_ticker")).toBe(false);
  });

  it("rejects an invalid vanity_ticker before opening a popup", async () => {
    const openSpy = vi.fn();
    const client = makeClient(openSpy);

    await expect(
      client.createToken({ ...baseParams, vanity_ticker: "12345678901" })
    ).rejects.toThrow("Vanity ticker must be below 10 characters.");
    expect(openSpy).not.toHaveBeenCalled();
  });
});
