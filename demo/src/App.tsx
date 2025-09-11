import { useRef, useState } from "react";

import "./App.css";
import { OdinConnect } from "odin-connect";

function App() {
  const [received, setReceived] = useState<string | null>(null);
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
        {received ? (
          <p>connected: {received}</p>
        ) : (
          <p>No user connected yet.</p>
        )}
        <button onClick={handleConnectWindow}>Connect (WINDOW)</button>
        <button onClick={handleConnectTab}>Connect (TAB)</button>
      </div>
    </>
  );
}

export default App;
