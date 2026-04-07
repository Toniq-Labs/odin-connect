import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  OdinConnect,
  type OdinConnectedUser,
  type OdinToken,
} from "odin-connect";
import { OdinContext } from "./OdinContext";

export const OdinProvider = ({ children }: { children: ReactNode }) => {
  const [odinConnect, setOdinConnect] = useState<OdinConnect | null>(null);
  const [connectedUser, setConnectedUser] = useState<OdinConnectedUser | null>(
    null
  );
  const [tokens, setTokens] = useState<ReadonlyArray<OdinToken>>([]);

  useEffect(() => {
    // Initialize OdinConnect with your app name and target environment
    const odin = new OdinConnect({ name: "Demo", env: "dev" });
    setOdinConnect(odin);

    // Attempt to restore a previous session from localStorage
    const restoredUser = odin.restoreSession();
    if (restoredUser) {
      setConnectedUser(restoredUser);
    }
  }, []);

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
      }}
    >
      {children}
    </OdinContext.Provider>
  );
};
