import { useRef, useState } from "react";

import "./App.css";
import { OdinConnect } from "odin-connect";

function App() {
  const [received, setReceived] = useState<string | null>(null);
  const odinRef = useRef(new OdinConnect());

  const handleConnect = async () => {
    const message = await odinRef.current.connect(
      "_blank",
      "width=400,height=600"
    );
    setReceived(message);
  };

  return (
    <>
      <div className="card">
        <button onClick={handleConnect}>Connect</button>
        <p>
          {received ? (
            <>
              Welcome <strong>{received}</strong>
            </>
          ) : (
            "Please connect"
          )}
        </p>
      </div>
    </>
  );
}

export default App;
