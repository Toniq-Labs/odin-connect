import { useEffect, useState } from "react";
import { useOdinContext } from "../OdinContext";
import { Actor, HttpAgent } from "@dfinity/agent";
import { DelegationIdentity } from "@dfinity/identity";
import { idlFactory, type _SERVICE } from "../canister/odin-dev";


export function Canister() {
    const { user, delegationChain, sessionKey } = useOdinContext();
    const [agent, setAgent] = useState<HttpAgent | null>(null);


    useEffect(() => {
        if (!delegationChain || !sessionKey) {
            return;
        }
        const delegated = DelegationIdentity.fromDelegation(sessionKey, delegationChain);
        const agent = new HttpAgent({ identity: delegated, host: "https://icp0.io" });
        setAgent(agent);
    }, [delegationChain, sessionKey]);

    const handleTest = async () => {
        try {
            if (!agent) {
                throw new Error("Agent is not initialized");
            }
            const api = Actor.createActor<_SERVICE>(idlFactory, {
                agent,
                canisterId: "w5cxm-6iaaa-aaaaj-az4jq-cai",
            });
            const token = await api.getToken('2jj2')
            console.log("Token info:", token);
        } catch (error) {
            console.error("Error occurred:", error);
        }
    }


    if (!user) {
        return <div>Please connect first.</div>;
    }
    if (!delegationChain) {
        return <div>No delegation chain available.</div>;
    }
    return <div>Canister Feature

        <button onClick={handleTest}>Test</button>
    </div>;
}