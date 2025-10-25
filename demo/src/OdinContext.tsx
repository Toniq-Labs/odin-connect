import { createContext, useContext } from "react";
import type { OdinConnect, OdinConnectedUser, OdinToken } from "odin-connect";
import type { DelegationIdentity } from "@dfinity/identity";
type OdinContextType = {
  odinConnect: OdinConnect | null;
  connectedUser: OdinConnectedUser | null;
  setConnectedUser: (user: OdinConnectedUser | null) => void;
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
