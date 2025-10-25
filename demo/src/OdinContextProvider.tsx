import { useEffect, useState, type ReactNode } from "react";
import {
  OdinConnect,
  type OdinConnectedUser,
  type OdinToken,
} from "odin-connect";
import { OdinContext } from "./OdinContext";
import type { DelegationIdentity } from "@dfinity/identity";

export const OdinProvider = ({ children }: { children: ReactNode }) => {
  const [odinConnect, setOdinConnect] = useState<OdinConnect | null>(null);
  const [connectedUser, setConnectedUser] = useState<OdinConnectedUser | null>(
    null
  );
  const [tokens, setTokens] = useState<ReadonlyArray<OdinToken>>([]);
  const [identity, setIdentity] = useState<DelegationIdentity | null>(null);

  useEffect(() => {
    // Initialize OdinConnect with your app name and target environment
    const odin = new OdinConnect({ name: "Demo", env: "dev" });
    setOdinConnect(odin);
  }, []);

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
        setIdentity,
        identity,
        setTokens,
      }}
    >
      {children}
    </OdinContext.Provider>
  );
};
