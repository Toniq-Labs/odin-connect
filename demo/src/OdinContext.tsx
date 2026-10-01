import { createContext, useContext } from "react";
import type {
  OdinConnect,
  OdinConnectedUser,
  OdinConnectMode,
  OdinLang,
  OdinRedirectResult,
  OdinToken,
} from "odin-connect";

type OdinContextType = {
  odinConnect: OdinConnect | null;
  connectedUser: OdinConnectedUser | null;
  setConnectedUser: (user: OdinConnectedUser | null) => void;
  tokens: ReadonlyArray<OdinToken>;
  setTokens: (tokens: ReadonlyArray<OdinToken>) => void;
  /* get the connected user, if not call odinConnect.connect() */
  requestUser: () => Promise<OdinConnectedUser>;
  /* popup UI language, applied to the next popup opened */
  lang: OdinLang;
  setLang: (lang: OdinLang) => void;
  /* popup / redirect / auto, applied to connect() and every action */
  mode: OdinConnectMode;
  setMode: (mode: OdinConnectMode) => void;
  /* outcome of the redirect this page load returned from, if any */
  redirectResult: OdinRedirectResult | null;
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
