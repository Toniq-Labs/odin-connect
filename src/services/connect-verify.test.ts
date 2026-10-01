import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { Principal } from "@dfinity/principal";
import { Connect } from "./connect";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import {
  apiAccepts,
  clientSignatureValid,
  odinConnectMessage,
  OdinPageOptions,
  siwbLikeIdentity,
} from "../../test/odin-page";

const TARGET = "74iy7-xqaaa-aaaaf-qagra-cai";
const OTHER_TARGET = "ryjl3-tyaaa-aaaaa-aaaba-cai";

type ConnectOptions = Parameters<Connect["connect"]>[0];

/**
 * Run a popup connect against the fake Odin page: capture the opened URL,
 * answer with `odinConnectMessage(url, page)` (optionally edited), and return
 * the settled promise plus what was sent.
 */
async function popupConnect(
  connect: Connect,
  options: ConnectOptions,
  page: OdinPageOptions = {},
  edit: (message: Awaited<ReturnType<typeof odinConnectMessage>>) => unknown = (
    m
  ) => m
) {
  const open = vi
    .spyOn(window, "open")
    .mockReturnValue({ closed: false } as Window);
  const promise = connect.connect(options);
  expect(open).toHaveBeenCalledOnce();
  const url = open.mock.calls[0][0] as URL;
  const message = await odinConnectMessage(url, page);
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: connect.origin,
      data: { path: "/authorize/connect", message: edit(message) },
    })
  );
  const settled = await promise.then(
    (user) => ({ user, error: null }),
    (error: Error) => ({ user: null, error })
  );
  return { url, message, ...settled };
}

describe("verified connect (popup)", () => {
  let connect: Connect;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    connect = new Connect({ name: "test", env: "dev" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connects after local checks and odin-api verification", async () => {
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const { url, message, user, error } = await popupConnect(connect, {
      requires_api: true,
      requires_delegation: true,
      targets: [TARGET],
    });
    expect(error).toBeNull();
    expect(user?.principal).toBe(message.principal);
    expect(user?.getIdentity()?.getPrincipal().toText()).toBe(
      message.principal
    );
    expect(verify).toHaveBeenCalledWith({
      payload: message.proof.payload,
      signature: message.proof.signature,
      delegation: null,
      publicKey: message.proof.publicKey,
      audience: window.location.origin,
      nonce: url.searchParams.get("request_id"),
      issue_jwt: true,
      client_signature: expect.any(String),
    });
    expect(connect.api.apiKey).toBe("jwt-from-api");
    // the same user is in the state, and a reload restores it
    expect(connect.state.user).toBe(user);
    expect(connect.state.request).toMatchObject({
      action: "connect",
      status: "success",
    });
    expect(
      (await new Connect({ name: "test", env: "dev" }).ready()).user?.principal
    ).toBe(message.principal);
  });

  it("accepts a SIWB-style delegated Odin identity", async () => {
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const odinIdentity = await siwbLikeIdentity();
    const { message, user, error } = await popupConnect(
      connect,
      { requires_delegation: true, targets: [TARGET] },
      { user: odinIdentity }
    );
    expect(error).toBeNull();
    expect(user?.principal).toBe(odinIdentity.getPrincipal().toText());
    expect(message.proof.delegation).not.toBeNull();
    expect(verify.mock.calls[0][0].delegation).toBe(message.proof.delegation);
  });

  it("never sends the session secret, only session_pubkey", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const { url, user } = await popupConnect(connect, {
      requires_delegation: true,
      targets: [TARGET],
    });
    expect(url.searchParams.has("session_key")).toBe(false);
    const stored = JSON.parse(localStorage.getItem(localStorage.key(0)!)!);
    const [publicHex, secretHex] = JSON.parse(stored.sessionKey) as string[];
    expect(user).not.toBeNull();
    expect(url.href).not.toContain(secretHex);
    expect(decodeURIComponent(url.href)).not.toContain(secretHex);
    // session_pubkey is the DER of the stored key's public half
    const der = Ed25519KeyIdentity.fromParsedJson([publicHex, secretHex])
      .getPublicKey()
      .toDer();
    const sent = url.searchParams.get("session_pubkey")!;
    const bytes = Uint8Array.from(
      atob(sent.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    expect(Array.from(bytes)).toEqual(Array.from(new Uint8Array(der)));
  });

  it("binds the proof to the session key with client_signature", async () => {
    for (const options of [
      {},
      { requires_api: true },
      { requires_delegation: true as const, targets: [TARGET] },
    ]) {
      const verify = vi
        .spyOn(connect.api, "verifyConnect")
        .mockImplementation(apiAccepts());
      const { url, message, user } = await popupConnect(connect, options);
      expect(user).not.toBeNull();
      const sessionPubkey = url.searchParams.get("session_pubkey")!;
      expect(sessionPubkey).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(JSON.parse(message.proof.payload).sk).toBe(sessionPubkey);
      const body = verify.mock.calls[0][0];
      // the exact payload received, never re-stringified
      expect(body.payload).toBe(message.proof.payload);
      expect(body.client_signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      const der = Buffer.from(
        sessionPubkey.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      );
      const key = createPublicKey({ key: der, format: "der", type: "spki" });
      const sig = Buffer.from(body.client_signature, "base64");
      expect(
        verifySignature(
          null,
          Buffer.from("odin-connect-verify:v1\n" + body.payload),
          key,
          sig
        )
      ).toBe(true);
      // domain-separated: not a signature over the bare payload or the
      // identity-proof message
      expect(verifySignature(null, Buffer.from(body.payload), key, sig)).toBe(
        false
      );
      expect(
        verifySignature(
          null,
          Buffer.from("odin-connect-identity:v1\n" + body.payload),
          key,
          sig
        )
      ).toBe(false);
      vi.restoreAllMocks();
    }
  });

  it("never puts the session secret in a URL, request body or postMessage", async () => {
    const generate = vi.spyOn(Ed25519KeyIdentity, "generate");
    const postMessage = vi.spyOn(window, "postMessage");
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const { url, message, user } = await popupConnect(connect, {
      requires_api: true,
      requires_delegation: true,
      targets: [TARGET],
    });
    expect(user).not.toBeNull();
    const sessionKey = generate.mock.results[0].value as Ed25519KeyIdentity;
    const secretHex = sessionKey.toJSON()[1];
    const secret = new Uint8Array(sessionKey.getKeyPair().secretKey);
    let binary = "";
    for (const byte of secret) binary += String.fromCharCode(byte);
    const secretB64 = btoa(binary);
    const forms = [
      secretHex,
      secretB64,
      secretB64.replace(/=+$/, ""),
      secretB64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    ];
    const sent = [
      url.href,
      decodeURIComponent(url.href),
      JSON.stringify(verify.mock.calls[0][0]),
      JSON.stringify(message),
      ...postMessage.mock.calls.map((c) => JSON.stringify(c)),
    ];
    for (const text of sent) {
      for (const form of forms) {
        expect(text).not.toContain(form);
      }
    }
  });

  it("rejects a proof bound to another session key, or to none", async () => {
    const attacker = Ed25519KeyIdentity.generate();
    const attackerPubkey = btoa(
      String.fromCharCode(...new Uint8Array(attacker.getPublicKey().toDer()))
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    for (const [sk, reason] of [
      [attackerPubkey, /another session key/],
      [undefined, /not bound to a session key/],
    ] as const) {
      // a lenient API that skips the binding: only the local check catches it
      const verify = vi
        .spyOn(connect.api, "verifyConnect")
        .mockImplementation(async (body) => ({
          principal: JSON.parse(body.payload).principal,
          username: null,
          jwt: "jwt",
        }));
      const { user, error } = await popupConnect(
        connect,
        { requires_api: true },
        { payload: { sk } }
      );
      expect(user).toBeNull();
      expect(error?.name).toBe("ConnectVerificationError");
      expect(error?.message).toMatch(reason);
      expect(verify).not.toHaveBeenCalled();
      expect(connect.api.apiKey).toBeNull();
      expect(localStorage.length).toBe(0);
      vi.restoreAllMocks();
    }
  });

  it("a proof replayed by someone without the session key is refused by odin-api", async () => {
    // e.g. read from a leaked return URL: the thief can send payload and
    // signature but can only sign the binding with their own key
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const { message } = await popupConnect(connect, { requires_api: true });
    const thief = Ed25519KeyIdentity.generate();
    const forged = await thief.sign(
      new TextEncoder().encode(
        "odin-connect-verify:v1\n" + message.proof.payload
      )
    );
    expect(
      clientSignatureValid({
        payload: message.proof.payload,
        client_signature: Buffer.from(new Uint8Array(forged)).toString(
          "base64"
        ),
      })
    ).toBe(false);
    expect(clientSignatureValid({ payload: message.proof.payload })).toBe(
      false
    );
  });

  it("rejects a forged principal in the message", async () => {
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const victim = Ed25519KeyIdentity.generate().getPrincipal().toText();
    const { user, error } = await popupConnect(
      connect,
      { requires_delegation: true, targets: [TARGET] },
      { principal: victim }
    );
    expect(user).toBeNull();
    expect(error?.message).toMatch(/could not verify/);
    expect(verify).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("rejects a forged principal even when the proof payload is rewritten", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const victim = Ed25519KeyIdentity.generate().getPrincipal().toText();
    const { error } = await popupConnect(
      connect,
      {},
      { principal: victim, payload: { principal: victim } }
    );
    // the proof's signer key derives the attacker's principal, not the victim's
    expect(error?.message).toMatch(/signer does not match/);
  });

  it("rejects a proof payload for another principal than the message", async () => {
    // a lying API echoing the message principal: only the local check catches it
    let messagePrincipal = "";
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(async () => ({
        principal: messagePrincipal,
        username: null,
        jwt: null,
      }));
    const other = Ed25519KeyIdentity.generate().getPrincipal().toText();
    const { message, user, error } = await popupConnect(
      connect,
      {},
      { payload: { principal: other } },
      (m) => {
        messagePrincipal = m.principal;
        return m;
      }
    );
    expect(message.principal).not.toBe(other);
    expect(user).toBeNull();
    expect(error?.message).toMatch(/proof is for another principal/);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects api: false in the proof when requires_api was requested", async () => {
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const { user, error } = await popupConnect(
      connect,
      { requires_api: true },
      { payload: { api: false } }
    );
    expect(user).toBeNull();
    expect(error?.message).toMatch(/API access was not granted/);
    expect(verify).not.toHaveBeenCalled();
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("rejects requires_api when odin-api returns no JWT", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts(null));
    const { user, error } = await popupConnect(connect, {
      requires_api: true,
    });
    expect(user).toBeNull();
    expect(error?.name).toBe("ConnectVerificationError");
    expect(error?.message).toMatch(/issued no API key/);
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("a re-connect replaces the previous user's JWT and session", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(
      apiAccepts("jwt-of-user-a")
    );
    const a = await popupConnect(connect, { requires_api: true });
    expect(connect.api.apiKey).toBe("jwt-of-user-a");
    expect(connect.state.user?.principal).toBe(a.message.principal);

    const b = await popupConnect(connect, {});
    expect(b.user?.principal).toBe(b.message.principal);
    expect(connect.state.user).toBe(b.user);
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(connect.isSessionValid()).toBe(false);
  });

  it("a failed re-connect keeps the previous session", async () => {
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const a = await popupConnect(connect, { requires_api: true });
    verify.mockRejectedValue(new Error("Invalid signature"));
    const b = await popupConnect(connect, { requires_api: true });
    expect(b.error).not.toBeNull();
    expect(connect.api.apiKey).toBe("jwt-from-api");
    expect(connect.state.user).toBe(a.user);
    expect(connect.state.request).toMatchObject({ status: "unverified" });
    expect(
      (await new Connect({ name: "test", env: "dev" }).ready()).user?.principal
    ).toBe(a.message.principal);
  });

  it("rejects a chain issued to a different session key", async () => {
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const { error } = await popupConnect(
      connect,
      { requires_delegation: true, targets: [TARGET] },
      { delegateTo: Ed25519KeyIdentity.generate().getPublicKey() }
    );
    expect(error?.message).toMatch(/another session key/);
    expect(verify).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("rejects a chain rooted at another identity than the proof", async () => {
    const verify = vi
      .spyOn(connect.api, "verifyConnect")
      .mockImplementation(apiAccepts());
    const { error } = await popupConnect(
      connect,
      { requires_delegation: true, targets: [TARGET] },
      { chainFrom: Ed25519KeyIdentity.generate() }
    );
    expect(error?.message).toMatch(/belongs to another principal/);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects a chain with targets that were not requested", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const { error } = await popupConnect(
      connect,
      { requires_delegation: true, targets: [TARGET] },
      { targets: [Principal.fromText(OTHER_TARGET)] }
    );
    expect(error?.message).toMatch(/not requested/);
  });

  it("rejects an expired chain", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const { error } = await popupConnect(
      connect,
      { requires_delegation: true, targets: [TARGET] },
      { expiry: new Date(Date.now() - 1000) }
    );
    expect(error?.message).toMatch(/expired/);
  });

  it("rejects a proof for another request or origin", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const nonce = await popupConnect(
      connect,
      {},
      {
        payload: { nonce: "x".repeat(32) },
      }
    );
    expect(nonce.error?.message).toMatch(/another request/);
    const aud = await popupConnect(
      connect,
      {},
      {
        payload: { aud: "https://evil.example" },
      }
    );
    expect(aud.error?.message).toMatch(/another origin/);
  });

  it("rejects when odin-api answers 401", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockRejectedValue(
      new Error("Invalid signature")
    );
    const { error } = await popupConnect(connect, { requires_api: true });
    expect(error?.message).toMatch(/odin-api refused the proof/);
    expect(error?.message).toMatch(/Invalid signature/);
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("rejects when odin-api verifies a different principal", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockResolvedValue({
      principal: "aaaaa-aa",
      username: null,
      jwt: "jwt",
    });
    const { error } = await popupConnect(connect, { requires_api: true });
    expect(error?.message).toMatch(/different principal/);
    expect(connect.api.apiKey).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("only stores the JWT from the API response, never the message", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(apiAccepts());
    const { user } = await popupConnect(
      connect,
      { requires_api: true },
      {},
      (m) => ({ ...m, jwt: "jwt-from-the-page" })
    );
    expect(user).not.toBeNull();
    expect(connect.api.apiKey).toBe("jwt-from-api");
    expect(JSON.stringify(localStorage)).not.toContain("jwt-from-the-page");
  });

  it("does not set an API key when requires_api was not requested", async () => {
    vi.spyOn(connect.api, "verifyConnect").mockImplementation(async (body) => ({
      principal: JSON.parse(body.payload).principal,
      username: null,
      jwt: "unexpected",
    }));
    const { user } = await popupConnect(connect, {});
    expect(user).not.toBeNull();
    expect(connect.api.apiKey).toBeNull();
  });
});

describe("authorize URLs carry v=2 and a request_id", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const REQUEST_ID = /^[A-Za-z0-9_-]{32}$/;

  it("on connect and all 8 actions, in popup and redirect mode", async () => {
    for (const mode of ["popup", "redirect"] as const) {
      const connect = new Connect({ name: "test", mode });
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      const navigate = vi
        .spyOn(connect["_window"], "navigate")
        .mockImplementation(() => {});
      vi.spyOn(connect.api, "uploadImage").mockResolvedValue("https://img");
      const swallow = (p: Promise<unknown>) => void p.catch(() => {});
      swallow(connect.connect());
      const p = "p";
      swallow(connect.odin.buy({ principal: p, token: "t", btcAmount: 1n }));
      swallow(connect.odin.sell({ principal: p, token: "t", tokenAmount: 1n }));
      swallow(
        connect.odin.transfer({
          principal: p,
          token: "t",
          amount: 1n,
          destination: "aaaaa-aa",
        })
      );
      swallow(
        connect.odin.swap({
          principal: p,
          fromToken: "a",
          toToken: "b",
          fromAmount: 1n,
        })
      );
      swallow(
        connect.odin.addLiquidity({ principal: p, token: "t", btcAmount: 1n })
      );
      swallow(
        connect.odin.removeLiquidity({ principal: p, token: "t", lpAmount: 1n })
      );
      swallow(
        connect.odin.icrcApprove({
          principal: p,
          token: "t",
          spender: "aaaaa-aa",
          amount: 1n,
        })
      );
      swallow(
        connect.odin.createToken({
          principal: p,
          name: "Token",
          ticker: "TKN",
          image: new File([], "a.png"),
        })
      );
      const spy = mode === "popup" ? open : navigate;
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(9));
      const urls = spy.mock.calls.map((c) => c[0] as URL);
      expect(urls.map((u) => u.pathname)).toEqual([
        "/authorize/connect",
        "/authorize/buy",
        "/authorize/sell",
        "/authorize/transfer",
        "/authorize/swap",
        "/authorize/add_liquidity",
        "/authorize/remove_liquidity",
        "/authorize/icrc_approve",
        "/authorize/create_token",
      ]);
      const ids = new Set<string>();
      for (const url of urls) {
        expect(url.searchParams.get("v")).toBe("2");
        const id = url.searchParams.get("request_id")!;
        expect(id).toMatch(REQUEST_ID);
        ids.add(id);
        if (mode === "redirect") {
          expect(url.searchParams.get("state")).toBe(id);
        } else {
          expect(url.searchParams.has("state")).toBe(false);
        }
      }
      expect(ids.size).toBe(9);
      vi.restoreAllMocks();
    }
  });
});
