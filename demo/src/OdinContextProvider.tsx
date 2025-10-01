import { useEffect, useState, type ReactNode } from "react";
import { OdinConnect, type OdinToken, type OdinUser } from "odin-connect";
import { OdinContext } from "./OdinContext";

export const OdinProvider = ({ children }: { children: ReactNode }) => {
  const [odinConnect, setOdinConnect] = useState<OdinConnect | null>(null);
  const [user, setUser] = useState<OdinUser | null>(null);
  const [tokens, setTokens] = useState<ReadonlyArray<OdinToken>>([]);

  useEffect(() => {
    // Initialize OdinConnect with your app name and target environment
    const odin = new OdinConnect({ name: "Demo", env: "local" });
    setOdinConnect(odin);
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
    <OdinContext.Provider value={{ odinConnect, user, setUser, tokens }}>
      {children}
    </OdinContext.Provider>
  );
};
