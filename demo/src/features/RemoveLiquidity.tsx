import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import { OdinUtils } from "odin-connect";
import { TokenSelect } from "../ui/TokenSelect";
import { useRedirectAction } from "../useRedirectAction";

export function RemoveLiquidity() {
  const { odinConnect, requestUser, tokens } = useOdinContext();
  const [result, setResult] = useState<string | null>(null);
  const redirect = useRedirectAction({
    action: "remove_liquidity",
    label: "remove liquidity",
    success: (f) =>
      `Successfully removed liquidity of ${f.amount} ${f.token}:LP`,
    setResult,
  });
  const [amount, setAmount] = useState(redirect.fields?.amount ?? "100");
  const [token, setToken] = useState(redirect.fields?.token ?? "2jj5");

  const handleRemoveLiquidity = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setResult(null);
    redirect.begin({ token, amount });
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const tokenData = tokens.find((t) => t.id === token);
      if (!tokenData) {
        throw new Error("Invalid token selected");
      }

      const user = await requestUser();

      await user.removeLiquidity({
        lpAmount: OdinUtils.convertToOdinAmount(amount, tokenData),
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
    } finally {
      redirect.end();
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
          <TokenSelect
            id="token"
            tokens={tokens}
            value={token}
            onChange={setToken}
          />
        </div>
        <button type="submit">Remove Liquidity</button>
        {result && <div className="result">{result}</div>}
      </form>
    </div>
  );
}
