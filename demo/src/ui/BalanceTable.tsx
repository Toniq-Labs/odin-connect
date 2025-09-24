import type { OdinBalance } from "odin-connect";

export function BalanceTable({
  balances,
}: {
  balances: ReadonlyArray<OdinBalance>;
}) {
  return (
    <div className="balance-table">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Ticker</th>
            <th className="number">Balance</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((balance) => (
            <tr key={balance.id}>
              <td>
                <img
                  src={
                    balance.id == "btc"
                      ? "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Bitcoin.svg/64px-Bitcoin.svg.png"
                      : `https://images.odin.fun/dev/token/${balance.id.replace(
                          "lp_",
                          ""
                        )}`
                  }
                  alt={balance.ticker}
                  style={{
                    width: "20px",
                    height: "20px",
                    marginRight: "8px",
                    borderRadius: "50%",
                    verticalAlign: "middle",
                  }}
                />
                {balance.id.replace("_", ":").toUpperCase()}
              </td>
              <td>{balance.ticker}</td>

              <td className="number">
                {(
                  Number(balance.balance) /
                  10 ** (balance.divisibility + balance.decimals)
                ).toLocaleString("en-US", {
                  maximumFractionDigits: balance.divisibility,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
