import { OdinConnect } from "odin-connect";
import { useState } from "react";

export function MySandbox() {
  const [result, setResult] = useState<object | null>(null);

  const testFunction1 = async () => {
    const odin = new OdinConnect({ name: "MySandbox", env: "dev" });
    const user1 = await odin.connect();
    console.log("Connected user:", user1);
    const result = await user1.getUser();

    setResult(result);
  };
  return (
    <div>
      <button onClick={testFunction1}>Test Function 1</button>
      <div>Result: {JSON.stringify(result, null, 2)}</div>
    </div>
  );
}
