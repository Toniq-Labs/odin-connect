import { useEffect, useState } from "react";
import { useOdinContext } from "../OdinContext";
import { Actor, HttpAgent } from "@dfinity/agent";
import { idlFactory, type _SERVICE } from "../canister/test";
import { DEMO_CANISTER_ID, DEMO_IC_HOST } from "../constants";
import JSONBig from "@apimatic/json-bigint";

export function Canister() {
  const { connectedUser, identity } = useOdinContext();
  const [agent, setAgent] = useState<HttpAgent | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<unknown | null>(null);

  useEffect(() => {
    if (identity) {
      const agent = HttpAgent.createSync({
        identity,
        host: DEMO_IC_HOST,
      });
      setAgent(agent);
    }
  }, [identity]);

  const handleCanisterCall = async () => {
    try {
      setPending(true);
      if (!agent) {
        throw new Error("Agent is not initialized");
      }
      const canisterApi = Actor.createActor<_SERVICE>(idlFactory, {
        agent,
        canisterId: DEMO_CANISTER_ID,
      });
      console.log("Calling canister...");
      console.log("Agent:", agent);
      const result = await canisterApi.icrc1_name();
      console.log("Token info:", result);
      setResult(result);
    } catch (error) {
      console.error("Error occurred:", error);
    } finally {
      setPending(false);
    }
  };

  if (!connectedUser) {
    return <div>Please connect first.</div>;
  }
  if (!identity) {
    return <div>No identity available.</div>;
  }
  return (
    <div>
      <button onClick={handleCanisterCall}>Run icrc1_name()</button>
      <br />
      <pre style={{ height: 350, overflow: "auto" }}>
        {pending ? "Loading..." : JSONBig.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
