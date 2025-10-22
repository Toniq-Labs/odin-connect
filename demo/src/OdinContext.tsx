import { createContext, useContext } from "react";
import type { OdinConnect, OdinToken, OdinUser } from "odin-connect";
import type { DelegationChain, Ed25519KeyIdentity } from "@dfinity/identity";
type OdinContextType = {
  odinConnect: OdinConnect | null;
  user: OdinUser | null;
  setUser: (user: OdinUser | null) => void;
  tokens: ReadonlyArray<OdinToken>;
  delegationChain: DelegationChain | null;
  setDelegationChain: (chain: DelegationChain | null) => void;
  sessionKey: Ed25519KeyIdentity | null;
};

export const OdinContext = createContext<OdinContextType | undefined>(
  undefined
);

export const useOdinContext = () => {
  const context = useContext(OdinContext);
  if (!context) {
    throw new Error("useOdinContext must be used within an OdinProvider");
  }
  return context;
};
