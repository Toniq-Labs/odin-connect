import { OdinConnect } from "odin-connect";

export function Examples() {
  const testFunction1 = async () => {
    const odin = new OdinConnect({ name: "MySandbox", env: "dev" });
    const user = await odin.connect();
    console.log("Connected user:", user);

    // get balances
    const balances = await user.getBalances({ page: 1, limit: 10 });
    // get tokens
    const tokens = await user.getTokens({ page: 1, limit: 10 });
    // get created tokens
    const createdTokens = await user.getCreatedTokens({ page: 1, limit: 10 });
    // get liquidity
    const liquidity = await user.getLiquidity({ page: 1, limit: 10 });
    // get activity
    const activity = await user.getActivity({ page: 1, limit: 10 });
    // get achievements
    const achievements = await user.getAchievements({ page: 1, limit: 10 });
    // get transactions
    const transactions = await user.getTransactions({ page: 1, limit: 10 });
    // get stats
    const stats = await user.getStats();

    console.log("Balances:", balances);
    console.log("Activity:", activity);
    console.log("Liquidity:", liquidity);
    console.log("Tokens:", tokens);
    console.log("Achievements:", achievements);
    console.log("Created Tokens:", createdTokens);
    console.log("Transactions:", transactions);
    console.log("Stats:", stats);
  };

  const testFunction2 = async () => {
    const odin = new OdinConnect({ name: "MySandbox", env: "dev" });
    const user = await odin.connect();
    // buy tokens
    const buyAuth = await user.buy({
      btcAmount: 10_000_000n,
      token: "2jjj",
    });
    console.log("Buy authorization:", buyAuth);
  };

  return (
    <div>
      <button onClick={testFunction1}>Test Function 1</button>
      <button onClick={testFunction2}>Test Function 2</button>
      <p>See console for results</p>
    </div>
  );
}
