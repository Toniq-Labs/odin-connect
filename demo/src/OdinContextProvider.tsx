import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  OdinConnect,
  type OdinConnectedUser,
  type OdinConnectMode,
  type OdinLang,
  type OdinToken,
} from "odin-connect";
import { OdinContext } from "./OdinContext";
import { useOdinState } from "./useOdinState";

const MODE_KEY = "odin-demo:mode";

const loadMode = (): OdinConnectMode => {
  const saved = localStorage.getItem(MODE_KEY);
  return saved === "popup" || saved === "redirect" ? saved : "auto";
};

export const OdinProvider = ({ children }: { children: ReactNode }) => {
  // Initialize OdinConnect once with your app name, target environment and
  // popup language. `mode` applies to connect() and every action. The
  // constructor already restores the session and applies a redirect result
  const [odinConnect] = useState<OdinConnect>(
    () =>
      new OdinConnect({
        name: "Demo",
        env: "dev",
        lang: "en",
        mode: loadMode(),
      })
  );
  // One source for both modes: a popup result and a redirect result read by
  // ready() on the next load both land in this state
  const { user: connectedUser, request } = useOdinState(odinConnect);
  const [tokens, setTokens] = useState<ReadonlyArray<OdinToken>>([]);
  const [lang, setLangState] = useState<OdinLang>("en");
  const [mode, setModeState] = useState<OdinConnectMode>(loadMode);

  const setLang = useCallback(
    (value: OdinLang) => {
      if (odinConnect) {
        // Runtime switch — applies to the next popup opened
        odinConnect.lang = value;
      }
      setLangState(value);
    },
    [odinConnect]
  );

  const setMode = useCallback(
    (value: OdinConnectMode) => {
      if (odinConnect) {
        odinConnect.mode = value;
      }
      localStorage.setItem(MODE_KEY, value);
      setModeState(value);
    },
    [odinConnect]
  );

  const requestUser = useCallback(async (): Promise<OdinConnectedUser> => {
    if (!odinConnect) {
      throw new Error("OdinConnect is not initialized");
    }
    if (connectedUser) {
      return connectedUser;
    }
    // popup: resolves with the user (also in state); redirect: navigates away
    return odinConnect.connect();
  }, [connectedUser, odinConnect]);

  useEffect(() => {
    if (odinConnect) {
      const fetchTokens = async () => {
        try {
          const { data } = await odinConnect.api.getTokens(
            { page: 1, limit: 50 },
            { field: "marketcap", direction: "desc" }
          );
          if (data) {
            setTokens(data);
          }
        } catch (error) {
          console.error("Error fetching tokens:", error);
        }
      };
      fetchTokens();
    }
  }, [odinConnect]);

  return (
    <OdinContext.Provider
      value={{
        odinConnect,
        connectedUser,
        tokens,
        setTokens,
        requestUser,
        lang,
        setLang,
        mode,
        setMode,
        request,
      }}
    >
      {children}
    </OdinContext.Provider>
  );
};
