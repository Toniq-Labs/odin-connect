import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import type {
  OdinAchievementCategory,
  OdinActivity,
  OdinToken,
  OdinTokenWithBalance,
  OdinTransaction,
  OdinUser,
} from "odin-connect";
import JSONBigInt from "@apimatic/json-bigint";

export function UserApi() {
  const { odinConnect, requestUser } = useOdinContext();
  const [results, setResults] = useState<
    | OdinToken
    | ReadonlyArray<OdinToken>
    | OdinUser
    | ReadonlyArray<
        OdinActivity | OdinTokenWithBalance | OdinAchievementCategory | OdinTransaction
      >
    | string
    | null
  >(null);
  const [loading, setLoading] = useState(false);

  const handleGetUser = async () => {
    try {
      setLoading(true);
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const user = await requestUser();
      const data = await user.getUser();
      console.log("Fetched user:", data);
      setResults(data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user:", error);
    }
  };

  const handleGetUserActivity = async () => {
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const user = await requestUser();
      setLoading(true);
      const activity = await user.getActivity({ page: 1, limit: 10 });
      console.log("Fetched user activity:", activity);
      setResults(activity.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user activity:", error);
      if (error instanceof Error) {
        setResults(error.message);
      } else {
        setResults("Error fetching user activity");
      }
    }
  };

  const handleGetUserLiquidity = async () => {
    try {
      setLoading(true);
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const user = await requestUser();
      const liquidity = await user.getLiquidity({
        page: 1,
        limit: 10,
      });
      console.log("Fetched user liquidity:", liquidity);
      setResults(liquidity.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user liquidity:", error);
    }
  };

  const handleGetUserTokens = async () => {
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      setLoading(true);
      const user = await requestUser();
      const tokens = await user.getTokens({ page: 1, limit: 10 });
      console.log("Fetched user tokens:", tokens);
      setResults(tokens.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user tokens:", error);
      if (error instanceof Error) {
        setResults(error.message);
      } else {
        setResults("Error fetching user tokens");
      }
    }
  };

  const handleGetUserAchievements = async () => {
    try {
      setLoading(true);
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const user = await requestUser();
      const achievements = await user.getAchievements({
        page: 1,
        limit: 10,
      });
      console.log("Fetched user achievements:", achievements);
      setResults(achievements);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user achievements:", error);
    }
  };

  const handleGetTransactions = async () => {
    try {
      setLoading(true);
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const user = await requestUser();
      const transactions = await user.getTransactions({
        page: 1,
        limit: 10,
      });
      console.log("Fetched user transactions:", transactions);
      setResults(transactions.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user transactions:", error);
    }
  };

  return (
    <div>
      <div className="demo-buttons">
        <button onClick={handleGetUserTokens}>getTokens()</button>
        <button onClick={handleGetUser}>getUser()</button>
        <button onClick={handleGetUserActivity}>getActivity()</button>
        <button onClick={handleGetUserLiquidity}>getLiquidity()</button>
        <button onClick={handleGetTransactions}>getTransactions()</button>
        <button onClick={handleGetUserAchievements}>getAchievements()</button>
      </div>
      <div className="object-result">
        {loading ? (
          <div>Loading...</div>
        ) : (
          <pre>
            {results ? JSONBigInt.stringify(results, null, 2) : "No results"}
          </pre>
        )}
      </div>
    </div>
  );
}
