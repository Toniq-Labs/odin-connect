import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  OdinConnect,
  type OdinConnectedUser,
  type OdinConnectMode,
  type OdinLang,
  type OdinRedirectResult,
  type OdinToken,
} from "odin-connect";
import { OdinContext } from "./OdinContext";

const MODE_KEY = "odin-demo:mode";

const loadMode = (): OdinConnectMode => {
  const saved = localStorage.getItem(MODE_KEY);
  return saved === "popup" || saved === "redirect" ? saved : "auto";
};

export const OdinProvider = ({ children }: { children: ReactNode }) => {
  const [odinConnect, setOdinConnect] = useState<OdinConnect | null>(null);
  const [connectedUser, setConnectedUser] = useState<OdinConnectedUser | null>(
    null
  );
  const [tokens, setTokens] = useState<ReadonlyArray<OdinToken>>([]);
  const [lang, setLangState] = useState<OdinLang>("en");
  const [mode, setModeState] = useState<OdinConnectMode>(loadMode);
  const [redirectResult, setRedirectResult] =
    useState<OdinRedirectResult | null>(null);

  useEffect(() => {
    // Initialize OdinConnect with your app name, target environment and popup language
    // `mode` applies to connect() and every action
    const odin = new OdinConnect({
      name: "Demo",
      env: "dev",
      lang: "en",
      mode: loadMode(),
    });
    setOdinConnect(odin);

    let cancelled = false;
    const init = async () => {
      // Finish a redirect-mode connect() or action first (async since 2.0.0:
      // connect results are verified with odin-api), so its outcome,
      // including a rejection or an unverified result, is visible
      let restoredUser: OdinConnectedUser | null = null;
      try {
        const result = await odin.handleRedirectResult();
        if (cancelled) return;
        setRedirectResult(result);
        if (result?.action === "connect" && result.status === "connected") {
          restoredUser = result.user;
        }
      } catch (error) {
        console.error("Redirect result failed:", error);
      }
      if (cancelled) return;

      // Otherwise attempt to restore a previous session from localStorage
      restoredUser ??= odin.restoreSession();
      if (restoredUser) {
        setConnectedUser(restoredUser);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const user = await odinConnect.connect();
    setConnectedUser(user);
    return user;
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
        setConnectedUser,
        tokens,
        setTokens,
        requestUser,
        lang,
        setLang,
        mode,
        setMode,
        redirectResult,
      }}
    >
      {children}
    </OdinContext.Provider>
  );
};
