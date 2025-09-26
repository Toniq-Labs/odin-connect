import { useState } from "react";
import "../App.css";
import { useOdinContext } from "../OdinContext";
import { UserInfo } from "../ui/UserInfo";

const centeredWindowFeatures = (width: number, height: number) => {
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  return `width=${width},height=${height},left=${left},top=${top}`;
};

function Connect() {
  const [error, setError] = useState<string | null>(null);
  const [requireApi, setRequireApi] = useState(false);
  const { user, odinConnect, setUser } = useOdinContext();

  const openOdinConnect = async (mode: "window" | "tab" = "tab") => {
    setError(null);
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }
      const user = await odinConnect.connect({
        open: {
          target: "_blank",
          settings: mode === "window" ? centeredWindowFeatures(400, 600) : "",
        },
        requires_api: requireApi,
      });
      console.log("Received user:", user);
      setUser(user);
    } catch (error) {
      console.error("Connection error:", error);
      setUser(null);
      if (error instanceof Error) {
        setError(`Connection error: ${error.message}`);
      } else {
        setError("Did not get authorization");
      }
    }
  };

  const handleConnectWindow = () => {
    openOdinConnect("window");
  };

  const handleConnectTab = () => {
    if (!odinConnect) {
      throw new Error("OdinConnect is not initialized");
    }
    openOdinConnect("tab");
  };

  return user ? (
    <UserInfo user={user} />
  ) : (
    <div>
      <input
        type="checkbox"
        checked={requireApi}
        onChange={() => setRequireApi(!requireApi)}
      />{" "}
      Require API
      {error && <div className="result">{error}</div>}
      <div className="demo-buttons">
        <button onClick={handleConnectWindow}>Connect Popup</button>
        <button onClick={handleConnectTab}>Connect Tab</button>
      </div>
    </div>
  );
}

export default Connect;
