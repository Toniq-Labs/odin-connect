import { useState } from "react";
import { useOdinContext } from "../hook";
import { convertToPreciseBigInt } from "../utils";

export function Transfer() {
  const { odinConnect, user } = useOdinContext();
  const [recipient, setRecipient] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      if (!user) {
        throw new Error("No user connected");
      }
      await odinConnect.transfer({
        principal: user.principal,
        destination: recipient,
        token,
        amount: convertToPreciseBigInt(amount),
      });
    } catch (error) {
      console.error("Transfer error:", error);
      alert("Transfer failed");
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
          <input
            type="text"
            id="token"
            name="token"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
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
      </form>
    </div>
  );
}
