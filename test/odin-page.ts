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
  if (params.has("session_key")) {
    throw new Error("v=2 SDK must not send session_key");
  }

  let delegationChain = null;
  const sessionPubkey = params.get("session_pubkey");
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

/** What a well-behaved odin-api returns for a proof. */
export function apiAccepts(jwt: string | null = "jwt-from-api") {
  return async (body: { payload: string; issue_jwt: boolean }) => ({
    principal: JSON.parse(body.payload).principal as string,
    username: null,
    jwt: body.issue_jwt ? jwt : null,
  });
}
