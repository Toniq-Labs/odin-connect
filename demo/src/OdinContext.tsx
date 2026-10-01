import { createContext, useContext } from "react";
import type {
  OdinConnect,
  OdinConnectedUser,
  OdinConnectMode,
  OdinLang,
  OdinRequestState,
  OdinToken,
} from "odin-connect";

type OdinContextType = {
  odinConnect: OdinConnect | null;
  /* state.status: "initializing" until ready() restored the session */
  status: "initializing" | "ready";
  /* state.user: restored, or set by a popup or redirect connect */
  connectedUser: OdinConnectedUser | null;
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
  /* state.request: the latest connect() or action, popup or redirect */
  request: OdinRequestState | null;
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
