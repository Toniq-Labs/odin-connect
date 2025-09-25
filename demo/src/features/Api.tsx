import { useState } from "react";
import { useOdinContext } from "../OdinContext";
import type { OdinActivity, OdinToken, OdinUser } from "odin-connect";

export function Api() {
  const { odinConnect } = useOdinContext();
  const [results, setResults] = useState<
    OdinToken | OdinUser | ReadonlyArray<OdinActivity> | null
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
      const user = await odinConnect.getUser(
        "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe"
      );
      console.log("Fetched user:", user);
      setResults(user);
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

  return (
    <div>
      <div className="demo-buttons">
        <button onClick={handleGetToken}>Get Token</button>
        <button onClick={handleGetUser}>Get User</button>
        <button onClick={handleGetUserActivity}>Get User Activity</button>
      </div>
      <div className="object-result">
        {loading ? (
          <div>Loading...</div>
        ) : (
          <pre>{results ? JSON.stringify(results, null, 2) : "No results"}</pre>
        )}
      </div>
    </div>
  );
}
