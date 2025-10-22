import { useEffect, useState } from "react";
import { useOdinContext } from "../OdinContext";
import { Actor, HttpAgent } from "@dfinity/agent";
import { DelegationIdentity } from "@dfinity/identity";
import { idlFactory, type _SERVICE } from "../canister/odin-dev";
import { DEMO_CANISTER_ID, DEMO_IC_HOST } from "../constants";

export function Canister() {
  const { user, delegationChain, sessionKey } = useOdinContext();
  const [agent, setAgent] = useState<HttpAgent | null>(null);

  useEffect(() => {
    if (!delegationChain || !sessionKey) {
      return;
    }
    const delegatedIdentity = DelegationIdentity.fromDelegation(
      sessionKey,
      delegationChain
    );
    console.log({
      delegatedIdentity,
      sessionKey,
      delegationChain,
    });
    const agent = HttpAgent.createSync({
      identity: delegatedIdentity,
      host: DEMO_IC_HOST,
    });
    setAgent(agent);
  }, [delegationChain, sessionKey]);

  const handleTest = async () => {
    try {
      if (!agent) {
        throw new Error("Agent is not initialized");
      }
      const api = Actor.createActor<_SERVICE>(idlFactory, {
        agent,
        canisterId: DEMO_CANISTER_ID,
      });
      const token = await api.getToken("2jj2");
      console.log("Token info:", token);
    } catch (error) {
      console.error("Error occurred:", error);
    }
  };

  if (!user) {
    return <div>Please connect first.</div>;
  }
  if (!delegationChain) {
    return <div>No delegation chain available.</div>;
  }
  return (
    <div>
      Canister Feature
      <br />
      <button onClick={handleTest}>Get Token (2jj2)</button>
      Look at the console for results.
    </div>
  );
}
