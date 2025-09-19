import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import { convertToOdinAmount } from "../utils";

export function RemoveLiquidity() {
  const { odinConnect, user, tokens } = useOdinContext();
  const [result, setResult] = useState<string | null>(null);
  const [amount, setAmount] = useState("100");
  const [token, setToken] = useState("2jj5");

  const handleRemoveLiquidity = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      if (!user) {
        throw new Error("User is not connected");
      }
      const tokenData = tokens.find((t) => t.id === token);
      if (!tokenData) {
        throw new Error("Invalid token selected");
      }
      await odinConnect.removeLiquidity({
        principal: user.principal,
        lpAmount: convertToOdinAmount(
          amount,
          tokenData.divisibility + tokenData.decimals
        ),
        token: token,
      });
      setResult(`Successfully removed liquidity of ${amount} ${token}:LP`);
    } catch (error) {
      console.error("Error removing liquidity:", error);
      if (error instanceof Error) {
        setResult(error.message);
      } else {
        setResult("Error removing liquidity");
      }
    }
  };
  return (
    <div>
      <form className="trade-form" onSubmit={handleRemoveLiquidity}>
        <div className="form-group">
          <label htmlFor="amount">LP Tokens to remove</label>
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
            {tokens
              .filter((t) => t.id !== "btc")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.id})
                </option>
              ))}
          </select>
        </div>
        <button type="submit">Remove Liquidity</button>
        {result && <div className="result">{result}</div>}
      </form>
    </div>
  );
}
