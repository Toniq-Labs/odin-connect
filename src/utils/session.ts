import { DelegationChain } from "@dfinity/identity";

export function isDelegationValid(chainJson: string): boolean {
  try {
    const chain = DelegationChain.fromJSON(JSON.parse(chainJson));
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    return chain.delegations.every(
      (d) => d.delegation.expiration == null || d.delegation.expiration > nowNs
    );
  } catch {
    return false;
  }
}
