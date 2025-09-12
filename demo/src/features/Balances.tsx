import { useState } from "react";
import { useOdinContext } from "../hook";
import type { OdinBalance } from "odin-connect";
import { BalanceTable } from "../ui/BalanceTable";

export function Balances() {
  const { odinConnect, user } = useOdinContext();
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<ReadonlyArray<OdinBalance>>([]);
  const [loading, setLoading] = useState(false);

  const handleFetchBalance = async () => {
    try {
      setLoading(true);
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      if (!user) {
        throw new Error("No user connected");
      }
      const balances = await odinConnect.getBalances({
        principal: user.principal,
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
  if (!user) {
    return <div>Please connect to view balances.</div>;
  }

  return (
    <div>
      <button onClick={handleFetchBalance}>
        {loading ? "Fetching..." : "Fetch Balances"}
      </button>
      {error && <div className="error">{error}</div>}
      {balances.length > 0 && <BalanceTable balances={balances} />}
    </div>
  );
}
