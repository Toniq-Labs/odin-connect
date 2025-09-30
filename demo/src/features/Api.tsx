import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import type {
  OdinAchievementCategory,
  OdinActivity,
  OdinToken,
  OdinTokenWithBalance,
  OdinUser,
} from "odin-connect";
import JSONBigInt from "@apimatic/json-bigint";

export function Api() {
  const { odinConnect, user } = useOdinContext();
  const [results, setResults] = useState<
    | OdinToken
    | OdinUser
    | ReadonlyArray<
        OdinActivity | OdinTokenWithBalance | OdinAchievementCategory
      >
    | null
  >(null);
  const [loading, setLoading] = useState(false);

  const handleGetToken = async () => {
    if (!odinConnect) {
      console.error("OdinConnect is not initialized");
      return;
    }
    try {
      setLoading(true);
      const token = await odinConnect.getToken("2jj5");
      console.log("Fetched token:", token);
      setResults(token);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching tokens:", error);
    }
  };

  const handleGetUser = async () => {
    if (!odinConnect) {
      console.error("OdinConnect is not initialized");
      return;
    }
    try {
      setLoading(true);
      const data = await odinConnect.getUser(
        user?.principal ||
          "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe"
      );
      console.log("Fetched user:", data);
      setResults(data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user:", error);
    }
  };

  const handleGetUserActivity = async () => {
    if (!odinConnect) {
      console.error("OdinConnect is not initialized");
      return;
    }
    try {
      setLoading(true);
      const activity = await odinConnect.getUserActivity({
        principal:
          user?.principal ||
          "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
        pagination: { page: 1, limit: 2 },
      });
      console.log("Fetched user activity:", activity);
      setResults(activity.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user activity:", error);
    }
  };

  const handleGetUserLiquidity = async () => {
    if (!odinConnect) {
      console.error("OdinConnect is not initialized");
      return;
    }
    try {
      setLoading(true);
      const liquidity = await odinConnect.apiClient.getUserLiquidity(
        user?.principal ||
          "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
        { page: 1, limit: 10 }
      );
      console.log("Fetched user liquidity:", liquidity);
      setResults(liquidity.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user liquidity:", error);
    }
  };

  const handleGetUserTokens = async () => {
    if (!odinConnect) {
      console.error("OdinConnect is not initialized");
      return;
    }
    try {
      setLoading(true);
      const tokens = await odinConnect.apiClient.getUserTokens(
        user?.principal ||
          "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
        { page: 1, limit: 10 }
      );
      console.log("Fetched user tokens:", tokens);
      setResults(tokens.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user tokens:", error);
    }
  };

  const handleGetUserAchievements = async () => {
    if (!odinConnect) {
      console.error("OdinConnect is not initialized");
      return;
    }
    try {
      setLoading(true);
      const achievements = await odinConnect.apiClient.getUserAchievements(
        user?.principal ||
          "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
        { page: 1, limit: 10 }
      );
      console.log("Fetched user achievements:", achievements);
      setResults(achievements);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching user achievements:", error);
    }
  };

  return (
    <div>
      <div className="demo-buttons">
        <button onClick={handleGetToken}>Get Token</button>
        <button onClick={handleGetUser}>Get User</button>
        <button onClick={handleGetUserActivity}>Get User Activity</button>
      </div>
      <div className="demo-buttons">
        <button onClick={handleGetUserLiquidity}>Get User Liquidity</button>
        <button onClick={handleGetUserTokens}>Get User Tokens</button>
        <button onClick={handleGetUserAchievements}>
          Get User Achievements
        </button>
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
