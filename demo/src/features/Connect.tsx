import { useState } from "react";
import "../App.css";
import { useOdinContext } from "../OdinContext";
import { UserInfo } from "../ui/UserInfo";
import { Ed25519KeyIdentity } from "@dfinity/identity";

const centeredWindowFeatures = (width: number, height: number) => {
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  return `width=${width},height=${height},left=${left},top=${top}`;
};

function Connect() {
  const [error, setError] = useState<string | null>(null);
  const [requireApi, setRequireApi] = useState(false);
  const [requireDelegation, setRequireDelegation] = useState(false);
  const { user, odinConnect, setUser } = useOdinContext();

  const openOdinConnect = async (mode: "window" | "tab" = "tab") => {
    setError(null);
    try {
      if (!odinConnect) {
        throw new Error("OdinConnect is not initialized");
      }

      const session = Ed25519KeyIdentity.generate();
      const baseOptions = {
        open: {
          target: "_blank",
          settings: mode === "window" ? centeredWindowFeatures(400, 600) : "",
        },
        requires_api: requireApi,
      };

      const connectOptions: Parameters<typeof odinConnect.connect>[0] = requireDelegation
        ? {
            ...baseOptions,
            requires_delegation: true,
            session_key: session,
            public_key: session.getPublicKey().toDer(),
            targets: ["openid"],
          }
        : baseOptions;

      const { user } = await odinConnect.connect(connectOptions);
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
    <div>
      <UserInfo user={user} />
    </div>
  ) : (
    <div>
      <div>
        <label htmlFor="requireApi">Require API</label>
        <input
          id="requireApi"
          type="checkbox"
          checked={requireApi}
          onChange={() => setRequireApi(!requireApi)}
        />
      </div>
      <div>
        <label htmlFor="requireDelegation">Require Delegation</label>
        <input
          id="requireDelegation"
          type="checkbox"
          checked={requireDelegation}
          onChange={() => setRequireDelegation(!requireDelegation)}
        />
      </div>
      {error && <div className="result">{error}</div>}
      <div className="demo-buttons">
        <button onClick={handleConnectWindow}>Connect Popup</button>
        <button onClick={handleConnectTab}>Connect Tab</button>
      </div>
    </div>
  );
}

export default Connect;
