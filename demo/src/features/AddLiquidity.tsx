import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import { OdinUtils } from "odin-connect";
import { TokenSelect } from "../ui/TokenSelect";
import { useRedirectAction } from "../useRedirectAction";

export function AddLiquidity() {
  const { odinConnect, requestUser, tokens } = useOdinContext();
  const [result, setResult] = useState<string | null>(null);
  const redirect = useRedirectAction({
    action: "add_liquidity",
    label: "add liquidity",
    success: (f) =>
      `Successfully added liquidity of ${f.amount} BTC to ${f.token}`,
    setResult,
  });
  const [amount, setAmount] = useState(redirect.fields?.amount ?? "0.0002");
  const [token, setToken] = useState(redirect.fields?.token ?? "2jj5");

  const handleAddLiquidity = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setResult(null);
    redirect.begin({ token, amount });
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const user = await requestUser();
      const added = await user.addLiquidity({
        btcAmount: OdinUtils.convertToOdinAmount(amount),
        token: token,
      });
      console.log("Liquidity added:", added);
      setResult(`Successfully added liquidity of ${amount} BTC to ${token}`);
    } catch (error) {
      console.error("Error adding liquidity:", error);
      if (error instanceof Error) {
        setResult(error.message);
      } else {
        setResult("Error adding liquidity");
      }
    } finally {
      redirect.end();
    }
  };
  return (
    <div>
      <form className="trade-form" onSubmit={handleAddLiquidity}>
        <div className="form-group">
          <label htmlFor="amount">BTC to add</label>
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
        <button type="submit">Add Liquidity</button>
        {result && <div className="result">{result}</div>}
      </form>
    </div>
  );
}
