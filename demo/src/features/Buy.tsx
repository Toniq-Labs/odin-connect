import { useState, type FormEvent } from "react";
import { useOdinContext } from "../OdinContext";
import { TokenSelect } from "../ui/TokenSelect";
import { OdinUtils } from "odin-connect";

export function Buy() {
  const { odinConnect, user, tokens } = useOdinContext();
  const [amount, setAmount] = useState("0.0002");
  const [token, setToken] = useState("2jj5");
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResult(null);
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      if (!user) {
        throw new Error("No user connected");
      }
      const tokenInfo = tokens.find((t) => t.id === token);
      if (!tokenInfo) {
        throw new Error("Invalid token selected");
      }
      await odinConnect.buy({
        btcAmount: OdinUtils.convertToOdinAmount(amount),
        token,
        principal: user.principal,
      });
      setResult(`Successfully bought of ${tokenInfo.name} for ${amount} BTC`);
    } catch (error) {
      if (error instanceof Error) {
        setResult(`Error: ${error.message}`);
      } else {
        setResult("Error executing trade");
      }
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
        <TokenSelect
          id="token"
          tokens={tokens}
          value={token}
          onChange={setToken}
        />
      </div>
      <button type="submit">Buy Token</button>
      {result && <div className="result">{result}</div>}
    </form>
  );
}
