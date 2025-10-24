import { createContext, useContext } from "react";
import type { OdinConnect, OdinToken, OdinUser } from "odin-connect";
import type { DelegationIdentity } from "@dfinity/identity";
type OdinContextType = {
  odinConnect: OdinConnect | null;
  user: OdinUser | null;
  setUser: (user: OdinUser | null) => void;
  tokens: ReadonlyArray<OdinToken>;
  setTokens: (tokens: ReadonlyArray<OdinToken>) => void;
  identity: DelegationIdentity | null;
  setIdentity: (identity: DelegationIdentity | null) => void;
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
