import { describe, it, expect, vi } from "vitest";
import { isDelegationValid } from "./session";

vi.mock("@dfinity/identity", () => ({
  DelegationChain: {
    fromJSON: (json: {
      delegations: Array<{
        delegation: { expiration: string };
      }>;
    }) => ({
      delegations: json.delegations.map((d) => ({
        delegation: {
          expiration: BigInt(d.delegation.expiration),
        },
      })),
    }),
  },
}));

function makeDelegationChainJson(expirationNs: bigint): string {
  return JSON.stringify({
    delegations: [
      {
        delegation: {
          pubkey: [0],
          expiration: expirationNs.toString(),
        },
        signature: [0],
      },
    ],
    publicKey: [0],
  });
}

describe("isDelegationValid", () => {
  it("should return true for a non-expired delegation", () => {
    const futureNs = BigInt(Date.now() + 60_000) * 1_000_000n;
    expect(isDelegationValid(makeDelegationChainJson(futureNs))).toBe(true);
  });

  it("should return false for an expired delegation", () => {
    const pastNs = BigInt(Date.now() - 60_000) * 1_000_000n;
    expect(isDelegationValid(makeDelegationChainJson(pastNs))).toBe(false);
  });

  it("should return false for malformed JSON", () => {
    expect(isDelegationValid("not-json")).toBe(false);
  });

  it("should return false for invalid delegation structure", () => {
    expect(isDelegationValid('{"bad":"data"}')).toBe(false);
  });

  it("should return false if any delegation in chain is expired", () => {
    const futureNs = BigInt(Date.now() + 60_000) * 1_000_000n;
    const pastNs = BigInt(Date.now() - 60_000) * 1_000_000n;
    const chain = JSON.stringify({
      delegations: [
        {
          delegation: {
            pubkey: [0],
            expiration: futureNs.toString(),
          },
          signature: [0],
        },
        {
          delegation: {
            pubkey: [0],
            expiration: pastNs.toString(),
          },
          signature: [0],
        },
      ],
      publicKey: [0],
    });
    expect(isDelegationValid(chain)).toBe(false);
  });
});
