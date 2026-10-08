/**
 * Local checks on a connect result before the SDK trusts it. The identity
 * proof's signature is verified by odin-api (`POST /connect/verify`), which
 * also handles canister-signature roots (Internet Identity); these checks
 * bind the result to this request, this origin and this session key. The
 * proof names the session public key (`sk`) and odin-api only redeems it
 * with a `client_signature` from that key, so a proof read from a return
 * URL is useless without the secret, which never leaves the SDK.
 */
import {
  DelegationChain,
  Ed25519KeyIdentity,
  JsonnableDelegationChain,
} from "@dfinity/identity";
import { Principal } from "@dfinity/principal";
import { ConnectProof } from "./api";
import { isDelegationValid } from "../utils/session";

/** What the Odin connect page posts / puts in the fragment (v=2). */
export interface ConnectResult {
  principal: string;
  /** Always null for v=2; ignored either way. */
  jwt?: string | null;
  delegationChain?: JsonnableDelegationChain | null;
  proof?: ConnectProof | null;
}

/** Thrown for any connect result the SDK will not accept. */
export class ConnectVerificationError extends Error {
  constructor(reason: string) {
    super(`OdinConnect could not verify the connection: ${reason}`);
    this.name = "ConnectVerificationError";
  }
}

function fail(reason: string): never {
  throw new ConnectVerificationError(reason);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

/** base64 (standard alphabet, with padding). */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Domain prefix of `client_signature`, distinct from the user's identity
 * proof (`odin-connect-identity:v1\n`) and `/auth` (bare timestamp).
 */
export const CLIENT_SIGNATURE_PREFIX = "odin-connect-verify:v1\n";

/**
 * Sign the exact proof `payload` string with the connect's session key, so
 * odin-api only redeems the proof for whoever holds the key whose public half
 * the proof names (`sk`). Returns base64 (standard, with padding).
 */
export async function signClientBinding(
  sessionKey: Ed25519KeyIdentity,
  payload: string
): Promise<string> {
  const signature = await sessionKey.sign(
    new TextEncoder().encode(CLIENT_SIGNATURE_PREFIX + payload)
  );
  return toBase64(new Uint8Array(signature));
}

/** Root public key (DER) of the identity that signed the proof. */
function proofRootKey(proof: ConnectProof): Uint8Array {
  try {
    if (proof.delegation) {
      return new Uint8Array(
        DelegationChain.fromJSON(JSON.parse(proof.delegation)).publicKey
      );
    }
    if (proof.publicKey) {
      return fromBase64(proof.publicKey);
    }
  } catch {
    // fall through
  }
  fail("the identity proof has no readable signer");
}

/**
 * Check the identity proof's signed payload against this request, and that
 * its signer derives `principal`. Signature verification is odin-api's job.
 */
export function checkProof(
  proof: ConnectProof | null | undefined,
  expected: {
    principal: string;
    nonce: string;
    audience: string;
    requires_api: boolean;
    /** `session_pubkey` exactly as sent (base64url DER, no padding). */
    sessionPubkey: string;
  }
): void {
  if (
    !proof ||
    typeof proof.payload !== "string" ||
    typeof proof.signature !== "string"
  ) {
    fail("the result carries no identity proof");
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(proof.payload);
  } catch {
    fail("the identity proof payload is malformed");
  }
  if (payload?.typ !== "odin-connect-identity" || payload.v !== 1) {
    fail("the identity proof has an unknown type");
  }
  if (payload.nonce !== expected.nonce) {
    fail("the identity proof belongs to another request");
  }
  if (payload.aud !== expected.audience) {
    fail("the identity proof was issued to another origin");
  }
  if (payload.principal !== expected.principal) {
    fail("the identity proof is for another principal");
  }
  if (typeof payload.sk !== "string") {
    fail("the identity proof is not bound to a session key");
  }
  if (payload.sk !== expected.sessionPubkey) {
    fail("the identity proof was issued to another session key");
  }
  if (expected.requires_api && payload.api !== true) {
    fail("API access was not granted");
  }
  const root = proofRootKey(proof);
  if (Principal.selfAuthenticating(root).toText() !== expected.principal) {
    fail("the identity proof signer does not match the principal");
  }
}

/**
 * Check a delegation chain issued to our session key: present, unexpired,
 * last delegation to `sessionPublicKey`, rooted at `principal`, and scoped
 * within the requested `targets`.
 */
export function checkDelegationChain(
  chainJson: JsonnableDelegationChain | null | undefined,
  expected: {
    principal: string;
    sessionPublicKey: Uint8Array;
    targets: readonly string[];
  }
): DelegationChain {
  if (!chainJson) {
    fail("the delegation chain is missing");
  }
  let chain: DelegationChain;
  try {
    chain = DelegationChain.fromJSON(chainJson);
  } catch {
    fail("the delegation chain is malformed");
  }
  if (chain.delegations.length === 0) {
    fail("the delegation chain is empty");
  }
  if (!isDelegationValid(JSON.stringify(chain.toJSON()))) {
    fail("the delegation chain has expired");
  }
  const last = chain.delegations[chain.delegations.length - 1].delegation;
  if (!bytesEqual(new Uint8Array(last.pubkey), expected.sessionPublicKey)) {
    fail("the delegation chain was issued to another session key");
  }
  const root = new Uint8Array(chain.publicKey);
  if (Principal.selfAuthenticating(root).toText() !== expected.principal) {
    fail("the delegation chain belongs to another principal");
  }
  const allowed = new Set(expected.targets);
  for (const { delegation } of chain.delegations) {
    if (delegation.targets?.some((t) => !allowed.has(t.toText()))) {
      fail("the delegation chain targets canisters that were not requested");
    }
  }
  return chain;
}
