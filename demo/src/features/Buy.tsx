import { useState, type FormEvent } from "react";
import { useOdinContext } from "../OdinContext";
import { TokenSelect } from "../ui/TokenSelect";
import { OdinUtils } from "odin-connect";
import { useRedirectAction } from "../useRedirectAction";

export function Buy() {
  const { odinConnect, requestUser, tokens } = useOdinContext();
  const [result, setResult] = useState<string | null>(null);
  const redirect = useRedirectAction({
    action: "buy",
    label: "buy",
    success: (f) => `Successfully bought ${f.token} for ${f.amount} BTC`,
    setResult,
  });
  const [amount, setAmount] = useState(redirect.fields?.amount ?? "0.0002");
  const [token, setToken] = useState(redirect.fields?.token ?? "2jj5");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResult(null);
    redirect.begin({ token, amount });
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const tokenInfo = tokens.find((t) => t.id === token);
      if (!tokenInfo) {
        throw new Error("Invalid token selected");
      }
      const user = await requestUser();
      await user.buy({
        btcAmount: OdinUtils.convertToOdinAmount(amount),
        token,
      });
      setResult(`Successfully bought of ${tokenInfo.name} for ${amount} BTC`);
    } catch (error) {
      if (error instanceof Error) {
        setResult(`Error: ${error.message}`);
      } else {
        setResult("Error executing trade");
      }
      console.error("Error executing trade:", error);
    } finally {
      redirect.end();
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
