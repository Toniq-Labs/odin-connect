import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelegationChain, Ed25519KeyIdentity } from "@dfinity/identity";
import { OdinApiClient } from "./api";
import { Connect, resetRedirectOutcomes } from "./connect";
import { PENDING_REDIRECT_MAX_AGE_MS, REDIRECT_RESULT_KEY } from "./redirect";
import {
  idbKeyId,
  resetSessionKeyDb,
  SessionKeyStore,
} from "./session-key";
import {
  apiAccepts,
  odinBackToApp,
  odinConnectMessage,
  odinReturnTarget,
} from "../../test/odin-page";

const TARGET = "74iy7-xqaaa-aaaaf-qagra-cai";
const P256_SPKI_LENGTH = 91;
const ED25519_SPKI_LENGTH = 44;

type Message = Awaited<ReturnType<typeof odinConnectMessage>>;

function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function pubkeyLength(url: URL): number {
  return fromBase64Url(url.searchParams.get("session_pubkey")!).length;
}

function storedSession(slug: string, env: string) {
  const raw = localStorage.getItem(`odin_connect:${slug}:${env}:session`);
  return raw ? JSON.parse(raw) : null;
}

const instances: Connect[] = [];

function create(options: ConstructorParameters<typeof Connect>[0] = {}) {
  const connect = new Connect({ name: "test", env: "dev", ...options });
  instances.push(connect);
  return connect;
}

/** An instance whose P-256 key (generated in the background) is ready. */
async function createWithKey(
  options: ConstructorParameters<typeof Connect>[0] = {}
) {
  const connect = create(options);
  await vi.waitFor(() => expect(connect["_nextKey"]).not.toBeNull());
  return connect;
}

async function popupConnect(
  connect: Connect,
  options: Parameters<Connect["connect"]>[0]
) {
  const popup = { closed: false } as Window;
  const open = vi.spyOn(window, "open").mockReturnValue(popup);
  const promise = connect.connect(options);
  expect(open).toHaveBeenCalledOnce();
  const url = open.mock.calls[0][0] as URL;
  const message = await odinConnectMessage(url);
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: connect.origin,
      source: popup,
      data: { path: "/authorize/connect", message },
    })
  );
  const user = await promise;
  open.mockRestore();
  return { url, message, user };
}

function encode(result: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Odin navigating back to return_url with `message`. */
function returnWith(
  url: URL,
  message: unknown,
  overrides: Record<string, unknown> = {}
) {
  const back = odinReturnTarget(url);
  back.hash = `${REDIRECT_RESULT_KEY}=${encode({
    path: url.pathname,
    state: url.searchParams.get("state"),
    message,
    ...overrides,
  })}`;
  window.history.replaceState(null, "", back.href);
}

/** Start a redirect connect; resolves with the URL the tab went to. */
async function startRedirect(
  connect: Connect,
  options: Parameters<Connect["connect"]>[0]
) {
  const navigate = vi
    .spyOn(connect["_window"], "navigate")
    .mockImplementation(() => {});
  void connect.connect(options);
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  return navigate.mock.calls[0][0] as URL;
}

const keys = new SessionKeyStore("test-248", "dev");

describe("non-extractable P-256 session key (SDK-6)", () => {
  beforeEach(async () => {
    window.history.replaceState(null, "", "/app?x=1");
    localStorage.clear();
    sessionStorage.clear();
    resetRedirectOutcomes();
    resetSessionKeyDb();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("odin_connect");
      request.onsuccess = request.onerror = () => resolve();
    });
    vi.spyOn(OdinApiClient.prototype, "verifyConnect").mockImplementation(
      apiAccepts()
    );
    vi.spyOn(OdinApiClient.prototype, "checkConnectSession").mockResolvedValue(
      true
    );
  });

  afterEach(() => {
    for (const connect of instances.splice(0)) connect.disconnect();
    vi.restoreAllMocks();
  });

  it("uses the slug the tests assume", () => {
    expect(create().slug).toBe("test-248");
  });

  it("popup: connects with a P-256 key, stores only a reference, restores it", async () => {
    const connect = await createWithKey();
    const { url, message, user } = await popupConnect(connect, {
      requires_api: true,
      requires_delegation: true,
      targets: [TARGET],
    });
    expect(pubkeyLength(url)).toBe(P256_SPKI_LENGTH);
    expect(user.getIdentity()?.getPrincipal().toText()).toBe(message.principal);

    const stored = storedSession("test-248", "dev");
    expect(stored.sessionKey).toMatch(/^idb:[0-9a-f]{32}$/);
    const keyPair = await keys.get(idbKeyId(stored.sessionKey)!);
    expect(keyPair?.privateKey.extractable).toBe(false);

    // a reload rebuilds the delegation identity from the IndexedDB key
    const restored = (await create().ready()).user;
    const identity = restored?.getIdentity();
    expect(identity?.getPrincipal().toText()).toBe(message.principal);
    expect(identity?.getPublicKey().toDer()).toEqual(
      user.getIdentity()?.getPublicKey().toDer()
    );
    const signature = await identity!.sign(new Uint8Array([1, 2, 3]));
    expect(new Uint8Array(signature).length).toBe(64);
  });

  it("each connect gets a new key", async () => {
    const connect = await createWithKey();
    const first = await popupConnect(connect, { requires_api: true });
    await vi.waitFor(() => expect(connect["_nextKey"]).not.toBeNull());
    const second = await popupConnect(connect, { requires_api: true });
    expect(pubkeyLength(second.url)).toBe(P256_SPKI_LENGTH);
    expect(second.url.searchParams.get("session_pubkey")).not.toBe(
      first.url.searchParams.get("session_pubkey")
    );
  });

  it("stores no key for a session without a delegation", async () => {
    const connect = await createWithKey();
    const { url } = await popupConnect(connect, { requires_api: true });
    expect(pubkeyLength(url)).toBe(P256_SPKI_LENGTH);
    expect(storedSession("test-248", "dev").sessionKey).toBe("");
  });

  it("falls back to Ed25519 when the P-256 key isn't ready yet", async () => {
    const connect = create();
    const { url, user } = await popupConnect(connect, {
      requires_delegation: true,
      targets: [TARGET],
    });
    expect(pubkeyLength(url)).toBe(ED25519_SPKI_LENGTH);
    expect(user.getIdentity()).not.toBeNull();
    const stored = storedSession("test-248", "dev");
    expect(() => Ed25519KeyIdentity.fromJSON(stored.sessionKey)).not.toThrow();
  });

  it("uses Ed25519 on the legacy env (no P-256 support there yet)", async () => {
    const connect = create({ env: "legacy" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(connect["_nextKey"]).toBeNull();
    const { url } = await popupConnect(connect, { requires_api: true });
    expect(pubkeyLength(url)).toBe(ED25519_SPKI_LENGTH);
  });

  it("restores a session stored with an Ed25519 key (before 2.2)", async () => {
    const connect = create();
    const { user } = await popupConnect(connect, {
      requires_delegation: true,
      targets: [TARGET],
    });
    const restored = (await create().ready()).user;
    expect(restored?.getIdentity()?.getPublicKey().toDer()).toEqual(
      user.getIdentity()?.getPublicKey().toDer()
    );
  });

  it("restoreSession() before ready(): the user at once, the identity after ready()", async () => {
    const connect = await createWithKey();
    const { message } = await popupConnect(connect, {
      requires_api: true,
      requires_delegation: true,
      targets: [TARGET],
    });
    const next = create();
    const early = next.restoreSession();
    expect(early?.principal).toBe(message.principal);
    expect(early?.getIdentity()).toBeNull();
    expect((await next.ready()).user?.getIdentity()).not.toBeNull();
  });

  it("drops a stored session whose P-256 key is gone", async () => {
    const connect = await createWithKey();
    await popupConnect(connect, {
      requires_api: true,
      requires_delegation: true,
      targets: [TARGET],
    });
    const ref = storedSession("test-248", "dev").sessionKey;
    await keys.delete(idbKeyId(ref)!);
    const next = create();
    expect((await next.ready()).user).toBeNull();
    expect(storedSession("test-248", "dev")).toBeNull();
    expect(next.api.apiKey).toBeNull();
  });

  it("disconnect() deletes the P-256 key", async () => {
    const connect = await createWithKey();
    await popupConnect(connect, {
      requires_delegation: true,
      targets: [TARGET],
    });
    const id = idbKeyId(storedSession("test-248", "dev").sessionKey)!;
    connect.disconnect();
    await vi.waitFor(async () => expect(await keys.get(id)).toBeNull());
  });

  it("a new connect deletes the previous session's key", async () => {
    const connect = await createWithKey();
    const options = { requires_delegation: true as const, targets: [TARGET] };
    await popupConnect(connect, options);
    const first = idbKeyId(storedSession("test-248", "dev").sessionKey)!;
    await vi.waitFor(() => expect(connect["_nextKey"]).not.toBeNull());
    await popupConnect(connect, options);
    const second = idbKeyId(storedSession("test-248", "dev").sessionKey)!;
    expect(second).not.toBe(first);
    await vi.waitFor(async () => expect(await keys.get(first)).toBeNull());
    expect(await keys.get(second)).not.toBeNull();
  });

  describe("redirect mode", () => {
    it("keeps only the key's reference in sessionStorage across the round trip", async () => {
      const connect = await createWithKey({ mode: "redirect" });
      const url = await startRedirect(connect, {
        requires_api: true,
        requires_delegation: true,
        targets: [TARGET],
      });
      expect(pubkeyLength(url)).toBe(P256_SPKI_LENGTH);
      const pending = Object.values({ ...sessionStorage }).join("");
      expect(pending).toMatch(/"sessionKey":"idb:[0-9a-f]{32}"/);

      const message: Message = await odinConnectMessage(url);
      returnWith(url, message);
      const state = await create({ mode: "redirect" }).ready();
      expect(state.request).toMatchObject({
        action: "connect",
        status: "success",
      });
      expect(state.user?.getIdentity()?.getPrincipal().toText()).toBe(
        message.principal
      );
      const ref = storedSession("test-248", "dev").sessionKey;
      expect(pending).toContain(ref);
      expect(await keys.get(idbKeyId(ref)!)).not.toBeNull();
    });

    it("deletes the key when the connect is rejected", async () => {
      const connect = await createWithKey({ mode: "redirect" });
      const url = await startRedirect(connect, {
        requires_delegation: true,
        targets: [TARGET],
      });
      const id = /"sessionKey":"idb:([0-9a-f]{32})"/.exec(
        Object.values({ ...sessionStorage }).join("")
      )![1];
      expect(await keys.get(id)).not.toBeNull();
      const { message, detail } = odinBackToApp(url, "untrusted_origin");
      returnWith(url, message, { detail });
      const state = await create({ mode: "redirect" }).ready();
      expect(state.request?.status).toBe("rejected");
      await vi.waitFor(async () => expect(await keys.get(id)).toBeNull());
    });

    it("deletes the key of a connect without a delegation once verified", async () => {
      const connect = await createWithKey({ mode: "redirect" });
      const url = await startRedirect(connect, { requires_api: true });
      const id = /"sessionKey":"idb:([0-9a-f]{32})"/.exec(
        Object.values({ ...sessionStorage }).join("")
      )![1];
      returnWith(url, await odinConnectMessage(url));
      const state = await create({ mode: "redirect" }).ready();
      expect(state.request?.status).toBe("success");
      expect(storedSession("test-248", "dev").sessionKey).toBe("");
      await vi.waitFor(async () => expect(await keys.get(id)).toBeNull());
    });

    it("unverified when the key is gone on return", async () => {
      const connect = await createWithKey({ mode: "redirect" });
      const url = await startRedirect(connect, {
        requires_delegation: true,
        targets: [TARGET],
      });
      const id = /"sessionKey":"idb:([0-9a-f]{32})"/.exec(
        Object.values({ ...sessionStorage }).join("")
      )![1];
      returnWith(url, await odinConnectMessage(url));
      await keys.delete(id);
      const state = await create({ mode: "redirect" }).ready();
      expect(state.request).toMatchObject({
        status: "unverified",
        error: expect.stringContaining("session key is gone"),
      });
      expect(state.user).toBeNull();
    });
  });

  it("sweeps old keys nothing uses, keeps recent ones and the session's", async () => {
    const connect = await createWithKey();
    await popupConnect(connect, {
      requires_delegation: true,
      targets: [TARGET],
    });
    const sessionId = idbKeyId(storedSession("test-248", "dev").sessionKey)!;
    const spare = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"]
    )) as CryptoKeyPair;
    const now = Date.now();
    await keys.put("old", spare);
    vi.spyOn(Date, "now").mockReturnValue(now + PENDING_REDIRECT_MAX_AGE_MS + 1);
    await keys.put("recent", spare);
    await keys.sweep(new Set([sessionId]), PENDING_REDIRECT_MAX_AGE_MS);
    expect(await keys.get("old")).toBeNull();
    expect(await keys.get("recent")).not.toBeNull();
    expect(await keys.get(sessionId)).not.toBeNull();
  });

  it("a delegation chain to the P-256 key is what odin-api and the SDK check", async () => {
    const connect = await createWithKey();
    const { url, message } = await popupConnect(connect, {
      requires_delegation: true,
      targets: [TARGET],
    });
    const chain = DelegationChain.fromJSON(message.delegationChain!);
    const last = chain.delegations[chain.delegations.length - 1];
    expect(new Uint8Array(last.delegation.pubkey)).toEqual(
      fromBase64Url(url.searchParams.get("session_pubkey")!)
    );
  });
});
