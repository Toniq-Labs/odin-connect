import { OdinUtils, type OdinBalance } from "odin-connect";
import { useOdinContext } from "../OdinContext";

export function BalanceTable({
  balances,
}: {
  balances: ReadonlyArray<OdinBalance>;
}) {
  const { odinConnect } = useOdinContext();
  const env = odinConnect?.currentEnv ?? "prod";
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
                      : OdinUtils.buildTokenImageUrl(
                          balance.id.replace("lp_", ""),
                          env
                        )
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
