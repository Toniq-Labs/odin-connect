import { useState } from "react";
import { useOdinContext } from "../hook";
import { convertToOdinAmount } from "../utils";
import { sampleTokens } from "./tokens";

export function Transfer() {
  const { odinConnect, user } = useOdinContext();
  const [recipient, setRecipient] = useState(
    "fdr2s-q4xug-vi6m7-tlvgs-divc6-hj6sp-xouwu-rmo55-yohcc-rqru4-aqe"
  );
  const [token, setToken] = useState("btc");
  const [amount, setAmount] = useState("0.00002");
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      if (!user) {
        throw new Error("No user connected");
      }
      const tokenInfo = sampleTokens.find((t) => t.id === token);
      if (!tokenInfo) {
        throw new Error(`Token ${token} not found`);
      }
      setResult(null);
      await odinConnect.transfer({
        principal: user.principal,
        destination: recipient,
        token,
        amount: convertToOdinAmount(
          amount,
          tokenInfo.decimals + tokenInfo.divisibility
        ),
      });
      setResult(
        `Successfully transferred ${amount} of ${token} to ${recipient}`
      );
    } catch (error) {
      console.error("Transfer error:", error);
      if (error instanceof Error) {
        setResult(`Transfer error: ${error.message}`);
      } else {
        setResult("Error executing transfer");
      }
    }
  };
  return (
    <div>
      <form className="trade-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="recipient">Recipient Principal</label>
          <input
            type="text"
            id="recipient"
            name="recipient"
            required
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="token">Token</label>
          <select value={token} onChange={(e) => setToken(e.target.value)}>
            {sampleTokens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.id})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="amount">Amount</label>
          <input
            type="number"
            id="amount"
            name="amount"
            required
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="form-group">
          <button type="submit">Transfer</button>
        </div>
        {result && <div className="result">{result}</div>}
      </form>
    </div>
  );
}
