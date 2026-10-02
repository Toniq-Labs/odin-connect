/**
 * Test double for the Odin `/authorize/connect` page (v=2): builds the
 * delegation chain and the signed identity proof exactly as the contract
 * describes, from the authorize URL the SDK produced.
 */
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  Ed25519PublicKey,
} from "@dfinity/identity";
import type { PublicKey, SignIdentity } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { createPublicKey, verify } from "node:crypto";

function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** An Odin identity like SIWB's: root key -> delegated session key. */
export async function siwbLikeIdentity(): Promise<DelegationIdentity> {
  const root = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(
    root,
    session.getPublicKey(),
    new Date(Date.now() + 3_600_000)
  );
  return DelegationIdentity.fromDelegation(session, chain);
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * The Odin page's redirect-mode `return_url` rule (all authorize types): a
 * valid URL on the referrer's origin (https, or http on loopback), any path,
 * no query string (not even a bare `?`), no fragment, no credentials.
 * Returns the URL Odin navigates back to; throws like the page's
 * invalid-return-URL error otherwise.
 */
export function odinReturnTarget(authorizeUrl: URL): URL {
  const raw = authorizeUrl.searchParams.get("return_url");
  const referrer = authorizeUrl.searchParams.get("referrer");
  if (!raw || !referrer) {
    throw new Error("Invalid return URL: missing return_url or referrer");
  }
  let target: URL;
  let origin: URL;
  try {
    target = new URL(raw);
    origin = new URL(referrer);
  } catch {
    throw new Error("Invalid return URL: not a URL");
  }
  const secure =
    origin.protocol === "https:" ||
    (origin.protocol === "http:" && LOOPBACK_HOSTS.includes(origin.hostname));
  if (!secure || target.origin !== origin.origin) {
    throw new Error("Invalid return URL: not the requesting origin");
  }
  if (target.search !== "" || raw.includes("?")) {
    throw new Error("Invalid return URL: query strings are not allowed");
  }
  if (target.hash !== "" || raw.includes("#")) {
    throw new Error("Invalid return URL: fragments are not allowed");
  }
  if (target.username || target.password) {
    throw new Error("Invalid return URL: credentials are not allowed");
  }
  return target;
}

/**
 * The `detail` the Odin page sends with a v=2 `icrc_approve` success:
 * the ledger block index only. Odin sends no ICRC-2 memo (the Odin canister
 * rejects approvals that carry one).
 */
export function odinApproveDetail(blockIndex: bigint) {
  return { block_index: blockIndex.toString() };
}

export interface OdinPageOptions {
  /** Odin identity of the user (default: a fresh Ed25519 key). */
  user?: SignIdentity;
  /** Override what the page reports as the principal. */
  principal?: string;
  /** Sign the delegation chain with this identity instead of `user`. */
  chainFrom?: SignIdentity;
  /** Delegate to this key instead of `session_pubkey`. */
  delegateTo?: PublicKey;
  /** Override delegation targets. */
  targets?: Principal[];
  /** Override delegation expiry. */
  expiry?: Date;
  /** Override fields in the signed payload. */
  payload?: Record<string, unknown>;
}

/** The success message the Odin page would post for `url`. */
export async function odinConnectMessage(url: URL, opts: OdinPageOptions = {}) {
  const user = opts.user ?? Ed25519KeyIdentity.generate();
  const principal = user.getPrincipal().toText();
  const params = url.searchParams;
  if (params.has("return_url")) {
    // redirect mode: the page refuses before authorizing anything
    odinReturnTarget(url);
  }
  if (params.has("session_key")) {
    throw new Error("v=2 SDK must not send session_key");
  }
  // v=2: every connect carries a valid session public key, which the proof
  // is bound to (`sk`); without one the page errors and authorizes nothing.
  const sessionPubkey = params.get("session_pubkey");
  if (params.get("v") === "2") {
    if (!sessionPubkey) {
      throw new Error("v=2 connect requires session_pubkey");
    }
    Ed25519PublicKey.fromDer(fromBase64Url(sessionPubkey));
  }

  let delegationChain = null;
  if (params.get("requires_delegation") === "1" && sessionPubkey) {
    const to =
      opts.delegateTo ?? Ed25519PublicKey.fromDer(fromBase64Url(sessionPubkey));
    const targets =
      opts.targets ??
      (params.get("targets") || "")
        .split(",")
        .filter(Boolean)
        .map((t) => Principal.fromText(t));
    const from = opts.chainFrom ?? user;
    const chain = await DelegationChain.create(
      from,
      to,
      opts.expiry ?? new Date(Date.now() + 60_000),
      { targets }
    );
    if (from instanceof DelegationIdentity) {
      (chain.delegations as unknown[]).unshift(
        ...from.getDelegation().delegations
      );
    }
    delegationChain = chain.toJSON();
  }

  const payload = JSON.stringify({
    typ: "odin-connect-identity",
    v: 1,
    aud: params.get("referrer"),
    nonce: params.get("request_id"),
    principal,
    api: params.get("requires_api") === "1",
    sk: sessionPubkey,
    iat: Date.now(),
    ...opts.payload,
  });
  const signature = await user.sign(
    new TextEncoder().encode("odin-connect-identity:v1\n" + payload)
  );
  const isDelegation = user instanceof DelegationIdentity;
  const proof = {
    payload,
    signature: toBase64(new Uint8Array(signature)),
    delegation: isDelegation
      ? JSON.stringify((user as DelegationIdentity).getDelegation().toJSON())
      : null,
    publicKey: isDelegation
      ? null
      : toBase64(new Uint8Array(user.getPublicKey().toDer())),
  };

  return {
    principal: opts.principal ?? principal,
    jwt: null,
    delegationChain,
    proof,
  };
}

/**
 * odin-api's session-key binding check: `client_signature` must verify over
 * UTF-8("odin-connect-verify:v1\n" + payload) with the key in `payload.sk`.
 */
export function clientSignatureValid(body: {
  payload: string;
  client_signature?: string;
}): boolean {
  const { sk } = JSON.parse(body.payload);
  if (typeof sk !== "string" || typeof body.client_signature !== "string") {
    return false;
  }
  return verify(
    null,
    Buffer.from("odin-connect-verify:v1\n" + body.payload, "utf8"),
    createPublicKey({
      key: Buffer.from(fromBase64Url(sk)),
      format: "der",
      type: "spki",
    }),
    Buffer.from(body.client_signature, "base64")
  );
}

/** What a well-behaved odin-api returns for a proof (401 without binding). */
export function apiAccepts(jwt: string | null = "jwt-from-api") {
  return async (body: {
    payload: string;
    issue_jwt: boolean;
    client_signature?: string;
  }) => {
    if (!clientSignatureValid(body)) {
      throw new Error("Invalid client signature");
    }
    return {
      principal: JSON.parse(body.payload).principal as string,
      username: null,
      jwt: body.issue_jwt ? jwt : null,
    };
  };
}
