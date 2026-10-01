import { useState, type FormEvent } from "react";
import { useOdinContext } from "../OdinContext";
import { OdinUtils } from "odin-connect";
import { TokenSelect } from "../ui/TokenSelect";
import { useRedirectAction } from "../useRedirectAction";

export function Swap() {
  const { odinConnect, tokens, requestUser } = useOdinContext();
  const [result, setResult] = useState<string | null>(null);
  const redirect = useRedirectAction({
    action: "swap",
    label: "swap",
    success: (f) =>
      `Successfully swapped ${f.amountFrom} of ${f.tokenFrom} to ${f.tokenTo}`,
    setResult,
  });
  const [tokenFrom, setTokenFrom] = useState(
    redirect.fields?.tokenFrom ?? "2jj5"
  );
  const [tokenTo, setTokenTo] = useState(redirect.fields?.tokenTo ?? "2jjj");
  const [amountFrom, setAmountFrom] = useState(
    redirect.fields?.amountFrom ?? "1000"
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);
    if (!odinConnect) {
      console.error("Odin Connect is not initialized.");
      return;
    }

    redirect.begin({ tokenFrom, tokenTo, amountFrom });
    try {
      const fromTokenData = tokens.find((t) => t.id === tokenFrom);
      if (!fromTokenData) {
        throw new Error("Invalid from token selected.");
      }
      const fromAmount = OdinUtils.convertToOdinAmount(
        amountFrom,
        fromTokenData
      );

      const user = await requestUser();
      const swapped = await user.swap({
        fromToken: tokenFrom,
        toToken: tokenTo,
        fromAmount,
      });
      console.log("Swap successful:", swapped);
      setResult(
        `Successfully swapped ${amountFrom} of ${tokenFrom} to ${tokenTo}`
      );
    } catch (error) {
      if (error instanceof Error) {
        setResult("Error: " + error.message);
      } else {
        setResult("Error executing swap");
      }
      console.error("Swap failed:", error);
    } finally {
      redirect.end();
    }
  };

  return (
    <div>
      <form className="trade-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="tokenFrom">From Token</label>
          <TokenSelect
            id="tokenFrom"
            tokens={tokens}
            value={tokenFrom}
            onChange={setTokenFrom}
          />
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
          <TokenSelect
            id="tokenTo"
            tokens={tokens}
            value={tokenTo}
            onChange={setTokenTo}
          />
        </div>
        <button type="submit">Submit</button>
      </form>
      {result && <div className="result">{result}</div>}
    </div>
  );
}
