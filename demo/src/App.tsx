import { useRef, useState } from "react";

import "./App.css";
import { OdinConnect, type OdinUser } from "odin-connect";

function App() {
  const [received, setReceived] = useState<OdinUser | null>(null);
  const odinRef = useRef(new OdinConnect());

  const handleConnectWindow = async () => {
    const width = 400;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    const features = `width=${width},height=${height},left=${left},top=${top}`;
    const message = await odinRef.current.connect("_blank", features);
    setReceived(message);
  };

  const handleConnectTab = async () => {
    const message = await odinRef.current.connect("_blank", "");
    setReceived(message);
  };

  return (
    <>
      <div className="card">
        <h3>Odin-Connect Demo</h3>
        {received ? (
          <UserCard user={received} />
        ) : (
          <p>No user connected yet.</p>
        )}
        <div className="demo-buttons">
          <button onClick={handleConnectWindow}>Connect (WINDOW)</button>
          <button onClick={handleConnectTab}>Connect (TAB)</button>
        </div>
      </div>
    </>
  );
}


function UserCard({ user }: { user: OdinUser }) {
  return (
    <div className="user-card">
      { user.image ? 
        <img src={`https://images.odin.fun/user/${user.principal}`} alt="User Avatar" /> : 
        <div className="avatar-placeholder">{user.username.slice(0,2)}</div> }
      <div className="user-info">
        <h4>{user.username}</h4>
        <p>id: {user.principal}</p>
      </div>
    </div>
  );
}
export default App;
