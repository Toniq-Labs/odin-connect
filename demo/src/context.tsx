import { useEffect, useState, type ReactNode } from "react";
import { OdinConnect, type OdinUser } from "odin-connect";
import { OdinContext } from "./hook";

export const OdinProvider = ({ children }: { children: ReactNode }) => {
  const [odinConnect, setOdinConnect] = useState<OdinConnect | null>(null);
  const [user, setUser] = useState<OdinUser | null>(null);

  useEffect(() => {
    const odin = new OdinConnect({ name: "Demo", env: "local" });
    setOdinConnect(odin);
  }, []);

  return (
    <OdinContext.Provider value={{ odinConnect, user, setUser }}>
      {children}
    </OdinContext.Provider>
  );
};
