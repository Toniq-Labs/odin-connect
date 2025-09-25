import { useOdinContext } from "../OdinContext";

export function Api() {
  const { odinConnect } = useOdinContext();

  const handleGetToken = async () => {
    if (!odinConnect) {
      console.error("OdinConnect is not initialized");
      return;
    }
    try {
      const token = await odinConnect.getToken("2jj5");
      console.log("Fetched token:", token);
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
      const user = await odinConnect.getUser(
        "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe"
      );
      console.log("Fetched user:", user);
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
      const activity = await odinConnect.getUserActivity({
        principal:
          "veyov-kjgrf-hke6v-6d63i-sdwae-oldgg-huau6-ke5g3-rllp2-5jhca-uqe",
        pagination: { page: 1, limit: 10 },
      });
      console.log("Fetched user activity:", activity);
    } catch (error) {
      console.error("Error fetching user activity:", error);
    }
  };

  return (
    <div>
      <button onClick={handleGetToken}>Get Token</button>
      <button onClick={handleGetUser}>Get User</button>
      <button onClick={handleGetUserActivity}>Get User Activity</button>
    </div>
  );
}
