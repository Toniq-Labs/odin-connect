import { describe, expect, it, vi } from "vitest";
import {
  actionOutcome,
  clearsSession,
  OdinCanisterClient,
  PRINCIPAL_MISMATCH_ERROR,
} from "./canister";
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
    principal:
      "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
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

describe("actionOutcome: principal check", () => {
  it("success when detail.principal matches the principal the app sent", () => {
    const detail = { principal: "aaaaa-aa" };
    expect(actionOutcome("buy", "purchased", detail, "aaaaa-aa")).toEqual({
      status: "success",
      detail,
    });
  });

  it("failed with PRINCIPAL_MISMATCH_ERROR when Odin ran it for someone else", () => {
    const detail = { principal: "other", block_index: "1" };
    expect(actionOutcome("icrc_approve", "approved", detail, "me")).toEqual({
      status: "failed",
      error: PRINCIPAL_MISMATCH_ERROR,
      detail,
    });
  });

  it("success without detail.principal (older Odin) or without an expected principal", () => {
    expect(actionOutcome("buy", "purchased", { x: 1 }, "me")).toEqual({
      status: "success",
      detail: { x: 1 },
    });
    expect(actionOutcome("buy", "purchased", undefined, "me")).toEqual({
      status: "success",
    });
    expect(actionOutcome("buy", "purchased", { principal: "other" })).toEqual({
      status: "success",
      detail: { principal: "other" },
    });
  });

  it("a non-string detail.principal is not compared", () => {
    expect(
      actionOutcome("buy", "purchased", { principal: 1 }, "me").status
    ).toBe("success");
  });

  it("the success message still rules: a rejection never checks the principal", () => {
    expect(
      actionOutcome("sell", "rejected", { principal: "me" }, "me")
    ).toEqual({ status: "rejected" });
  });
});

describe("clearsSession", () => {
  it("is true for not_connected / principal_mismatch rejections and the mismatch failure", () => {
    expect(
      clearsSession(
        actionOutcome("buy", "rejected", { reason: "not_connected" })
      )
    ).toBe(true);
    expect(
      clearsSession(
        actionOutcome("buy", "rejected", { reason: "principal_mismatch" })
      )
    ).toBe(true);
    expect(
      clearsSession(
        actionOutcome("buy", "purchased", { principal: "other" }, "me")
      )
    ).toBe(true);
  });

  it("is false for every other outcome", () => {
    expect(clearsSession(actionOutcome("buy", "purchased", undefined))).toBe(
      false
    );
    expect(clearsSession(actionOutcome("buy", "rejected", undefined))).toBe(
      false
    );
    expect(
      clearsSession(actionOutcome("buy", "rejected", { reason: "no_action" }))
    ).toBe(false);
    expect(clearsSession({ status: "rejected", error: "popup_closed" })).toBe(
      false
    );
    expect(clearsSession(actionOutcome("buy", "boom", undefined))).toBe(false);
  });
});
