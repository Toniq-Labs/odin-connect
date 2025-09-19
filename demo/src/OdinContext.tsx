import { createContext, useContext } from "react";
import type { OdinConnect, OdinUser } from "odin-connect";
type OdinContextType = {
  odinConnect: OdinConnect | null;
  user: OdinUser | null;
  setUser: (user: OdinUser | null) => void;
  tokens: ReadonlyArray<{
    id: string;
    name: string;
    divisibility: number;
    decimals: number;
  }>;
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
