import { useState, type FormEvent } from "react";
import { useOdinContext } from "../OdinContext";
import { convertToOdinAmount } from "../utils";

export function Swap() {
  const { odinConnect, tokens, user } = useOdinContext();
  const [result, setResult] = useState<string | null>(null);
  const [tokenFrom, setTokenFrom] = useState("2jj5");
  const [tokenTo, setTokenTo] = useState("2jjj");
  const [amountFrom, setAmountFrom] = useState("1000");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);
    if (!odinConnect) {
      console.error("Odin Connect is not initialized.");
      return;
    }

    try {
      if (!user) {
        throw new Error("No user connected.");
      }
      const fromTokenData = tokens.find((t) => t.id === tokenFrom);
      if (!fromTokenData) {
        throw new Error("Invalid from token selected.");
      }
      const fromAmount = convertToOdinAmount(
        amountFrom,
        fromTokenData.decimals + fromTokenData.divisibility
      );
      const result = await odinConnect.swap({
        principal: user.principal,
        fromToken: tokenFrom,
        toToken: tokenTo,
        fromAmount,
      });
      console.log("Swap successful:", result);
    } catch (error) {
      if (error instanceof Error) {
        setResult("Error: " + error.message);
      } else {
        setResult("Error executing swap");
      }
      console.error("Swap failed:", error);
    }
  };

  return (
    <div>
      <form className="trade-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="tokenFrom">From Token</label>
          <select
            id="tokenFrom"
            value={tokenFrom}
            onChange={(e) => setTokenFrom(e.target.value)}
          >
            {tokens.map((token) => (
              <option key={token.id} value={token.id}>
                {token.name} ({token.id})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="amountFrom">Amount</label>
          <input
            type="number"
            id="amountFrom"
            value={amountFrom}
            onChange={(e) => setAmountFrom(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="tokenTo">To Token</label>
          <select
            id="tokenTo"
            value={tokenTo}
            onChange={(e) => setTokenTo(e.target.value)}
          >
            {tokens.map((token) => (
              <option key={token.id} value={token.id}>
                {token.name} ({token.id})
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Submit</button>
      </form>
      {result && <div className="result">{result}</div>}
    </div>
  );
}
