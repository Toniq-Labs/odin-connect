import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import type { OdinBalance } from "odin-connect";
import { BalanceTable } from "../ui/BalanceTable";

export function Balances() {
  const { odinConnect, connectedUser, setConnectedUser } = useOdinContext();
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<ReadonlyArray<OdinBalance>>([]);
  const [loading, setLoading] = useState(false);

  const handleFetchBalance = async () => {
    try {
      setLoading(true);
      setError(null);
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const u = connectedUser ? connectedUser : await odinConnect.connect();
      if (!connectedUser) {
        setConnectedUser(u);
      }
      const balances = await u.getBalances({
        page: 1,
        limit: 20,
      });
      console.log("Fetched balances:", balances);
      setBalances(balances);
    } catch (error) {
      console.error("Fetch balance error:", error);
      setBalances([]);
      if (error instanceof Error) {
        setError(`Fetch balance error: ${error.message}`);
      } else {
        setError("Did not get balances");
      }
    } finally {
      setLoading(false);
    }
  };
  if (!odinConnect) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <button onClick={handleFetchBalance}>
        {loading ? "Fetching..." : "Fetch Balances"}
      </button>
      {error && <div className="result">{error}</div>}
      {balances.length > 0 && <BalanceTable balances={balances} />}
    </div>
  );
}
