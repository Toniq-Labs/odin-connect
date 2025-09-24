import { useEffect, useState, type ReactNode } from "react";
import { OdinConnect, type OdinUser } from "odin-connect";
import { OdinContext } from "./OdinContext";

export const OdinProvider = ({ children }: { children: ReactNode }) => {
  const [odinConnect, setOdinConnect] = useState<OdinConnect | null>(null);
  const [user, setUser] = useState<OdinUser | null>(null);
  const [tokens, setTokens] = useState<
    ReadonlyArray<{
      id: string;
      name: string;
      divisibility: number;
      decimals: number;
    }>
  >([]);

  useEffect(() => {
    const odin = new OdinConnect({ name: "Demo", env: "_deployment_preview" });
    setOdinConnect(odin);
  }, []);

  useEffect(() => {
    if (odinConnect) {
      const fetchTokens = async () => {
        try {
          const fetchedTokens = await odinConnect.getTokens({
            page: 1,
            limit: 50,
          });
          if (fetchedTokens) {
            setTokens(fetchedTokens);
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
