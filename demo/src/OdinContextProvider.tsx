import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  // Initialize OdinConnect once with your app name, target environment and
  // popup language. `mode` applies to connect() and every action
  const [odinConnect] = useState<OdinConnect | null>(
    () =>
      new OdinConnect({
        name: "Demo",
        env: "dev",
        lang: "en",
        mode: loadMode(),
      })
  );
  const initialized = useRef(false);
  const [connectedUser, setConnectedUser] = useState<OdinConnectedUser | null>(
    null
  );
  const [tokens, setTokens] = useState<ReadonlyArray<OdinToken>>([]);
  const [lang, setLangState] = useState<OdinLang>("en");
  const [mode, setModeState] = useState<OdinConnectMode>(loadMode);
  const [redirectResult, setRedirectResult] =
    useState<OdinRedirectResult | null>(null);

  useEffect(() => {
    // Restore once per page load. StrictMode runs effects twice; both calls
    // would return the same outcome anyway, the ref just avoids the second.
    if (!odinConnect || initialized.current) return;
    initialized.current = true;
    const init = async () => {
      // Finishes a redirect-mode connect() (verified with odin-api), else
      // restores the stored session. Async since 2.0.0
      const restoredUser = await odinConnect.restoreSession();
      if (restoredUser) {
        setConnectedUser(restoredUser);
      }

      // Optional: read the outcome for the result banner (a rejected or
      // unverified connect, an action result, returnState). Same read as
      // restoreSession(), so odin-api is not asked again
      try {
        setRedirectResult(await odinConnect.handleRedirectResult());
      } catch (error) {
        console.error("Redirect result failed:", error);
      }
    };
    void init();
  }, [odinConnect]);

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
