import { useEffect, useRef, useState } from "react";
import "../App.css";
import { type OdinBalance, OdinConnect, type OdinUser } from "odin-connect";
import { BalanceTable } from "../ui/BalanceTable";

const centeredWindowFeatures = (width: number, height: number) => {
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  return `width=${width},height=${height},left=${left},top=${top}`;
};

function Connect() {
  const [received, setReceived] = useState<OdinUser | null>(null);
  const [balances, setBalances] = useState<ReadonlyArray<OdinBalance>>(
    Object.freeze([])
  );
  const [error, setError] = useState<string | null>(null);
  const odinRef = useRef(
    new OdinConnect({ name: "Connect Demo", env: "local" })
  );

  const openOdinConnect = async (mode: "window" | "tab" = "tab") => {
    try {
      const message = await odinRef.current.connect({
        open: {
          target: "_blank",
          settings: mode === "window" ? centeredWindowFeatures(600, 600) : "",
        },
      });
      console.log("Received user:", message);
      setReceived(message);
    } catch (error) {
      console.error("Connection error:", error);
      setReceived(null);
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
    if (!received) {
      openOdinConnect("tab");
    } else {
      odinRef.current.buy({
        token: "btc",
        amount: BigInt(100000),
        principal: received.principal,
      });
    }
  };

  const handleFetchBalance = async () => {
    try {
      const balances = await odinRef.current.getBalances({
        principal: received?.principal || "",
      });
      console.log("Fetched balances:", balances);
      setBalances(balances);
    } catch (error) {
      console.error("Error fetching balances:", error);
      if (error instanceof Error) {
        setError(`Error fetching balances: ${error.message}`);
      } else {
        setError("Unknown error fetching balances");
      }
    }
  };

  return (
    <>
      <div className="card">
        <h3>Odin-Connect Demo</h3>
        {received ? (
          <UserCard user={received} />
        ) : error ? (
          <p style={{ color: "red" }}>{error}</p>
        ) : (
          <p>No user connected yet.</p>
        )}

        <div className="demo-buttons">
          <button onClick={handleConnectWindow}>Connect (WINDOW)</button>
          <button onClick={handleConnectTab}>Connect (TAB)</button>
          <button onClick={handleFetchBalance}>Fetch Balance</button>
        </div>

        {balances && <BalanceTable balances={balances} />}
      </div>
    </>
  );
}

function UserCard({ user }: { user: OdinUser }) {
  const [placeholder, setPlaceholder] = useState(false);

  useEffect(() => {
    console.log("User data:", user);
    setPlaceholder(false);
  }, [user]);

  return (
    <div className="user-card">
      {placeholder ? (
        <div className="avatar-placeholder">{user.username.slice(0, 2)}</div>
      ) : (
        <img
          src={`https://images.odin.fun/user/${user.principal}`}
          alt="User Avatar"
          onError={() => setPlaceholder(true)}
        />
      )}
      <strong>{user.username}</strong>
      <p>
        {user.principal.slice(0, 16)}...
        {user.principal.slice(
          user.principal.length - 8,
          user.principal.length
        )}{" "}
      </p>
    </div>
  );
}
export default Connect;
