import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import { OdinUtils } from "odin-connect";
import { TokenSelect } from "../ui/TokenSelect";

export function IcrcApprove() {
  const { tokens, odinConnect, requestUser } = useOdinContext();
  const [token, setToken] = useState("2jj5");
  const [spender, setSpender] = useState("");
  const [amount, setAmount] = useState("1000");
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setResult(null);
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }

      const tokenInfo = tokens.find((t) => t.id === token);
      if (!tokenInfo) {
        throw new Error(`Token ${token} not found`);
      }
      const user = await requestUser();
      await user.icrcApprove({
        token,
        spender,
        amount: OdinUtils.convertToOdinAmount(amount, tokenInfo),
      });
      setResult(
        `Successfully approved ${amount} of ${token} for spender ${spender}`
      );
    } catch (error) {
      console.error("ICRC approve error:", error);
      if (error instanceof Error) {
        setResult(`Approve error: ${error.message}`);
      } else {
        setResult("Error executing ICRC approve");
      }
    }
  };

  return (
    <div>
      <form className="trade-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="icrc-token">Token</label>
          <TokenSelect
            id="icrc-token"
            tokens={tokens}
            value={token}
            onChange={setToken}
          />
        </div>
        <div className="form-group">
          <label htmlFor="spender">Spender Canister ID</label>
          <input
            type="text"
            id="spender"
            name="spender"
            required
            value={spender}
            onChange={(e) => setSpender(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="icrc-amount">Amount</label>
          <input
            type="number"
            id="icrc-amount"
            name="amount"
            required
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="form-group">
          <button type="submit">Approve</button>
        </div>
        {result && <div className="result">{result}</div>}
      </form>
    </div>
  );
}
