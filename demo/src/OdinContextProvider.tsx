import { useEffect, useState, type ReactNode } from "react";
import { OdinConnect, type OdinToken, type OdinUser } from "odin-connect";
import { OdinContext } from "./OdinContext";
import { Ed25519KeyIdentity, type DelegationChain } from "@dfinity/identity";

export const OdinProvider = ({ children }: { children: ReactNode }) => {
  const [odinConnect, setOdinConnect] = useState<OdinConnect | null>(null);
  const [user, setUser] = useState<OdinUser | null>(null);
  const [sessionKey, setSessionKey] = useState<Ed25519KeyIdentity | null>(null);
  const [delegationChain, setDelegationChain] = useState<DelegationChain | null>(null);
  const [tokens, setTokens] = useState<ReadonlyArray<OdinToken>>([]);

  useEffect(() => {
    // Initialize OdinConnect with your app name and target environment
    const odin = new OdinConnect({ name: "Demo", env: "_deployment_preview" });
    setOdinConnect(odin);
    setSessionKey(Ed25519KeyIdentity.generate());
  }, []);

  useEffect(() => {
    if (odinConnect) {
      const fetchTokens = async () => {
        try {
          const { data } = await odinConnect.getTokens({
            pagination: { page: 1, limit: 50 },
            sort: { field: "marketcap", direction: "desc" },
          });
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
    <OdinContext.Provider value={{ odinConnect, user, setUser, tokens, delegationChain, setDelegationChain, sessionKey }}>
      {children}
    </OdinContext.Provider>
  );
};
