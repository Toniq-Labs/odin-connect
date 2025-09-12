import { useState, type FormEvent } from "react";
import { useOdinContext } from "../hook";
import { convertToPreciseBigInt } from "../utils";
import { sampleTokens } from "./tokens";

export function Buy() {
  const { odinConnect, user } = useOdinContext();
  const [amount, setAmount] = useState("0.00002");
  const [token, setToken] = useState("2jjj");
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      if (!user) {
        throw new Error("No user connected");
      }
      const tokenInfo = sampleTokens.find((t) => t.id === token);
      if (!tokenInfo) {
        throw new Error("Invalid token selected");
      }
      // Placeholder for trade execution logic
      await odinConnect.buy({
        btcAmount: convertToPreciseBigInt(amount),
        token,
        principal: user.principal,
      });

      setResult(`Successfully bought ${amount} of ${tokenInfo.name}`);

      console.log(`Executing trade: ${amount} of ${tokenInfo.id}`);
    } catch (error) {
      setResult("Error executing trade");
      console.error("Error executing trade:", error);
    }
  };

  return (
    <form className="trade-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="amount">BTC to spend</label>
        <input
          type="number"
          id="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="token">Token:</label>

        <select
          id="token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        >
          {sampleTokens.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.id})
            </option>
          ))}
        </select>
      </div>
      {user ? (
        <button type="submit">Buy Token</button>
      ) : (
        <p>Please connect your wallet to trade.</p>
      )}
      {result && <div className="result">{result}</div>}
    </form>
  );
}
