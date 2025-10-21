import { useOdinContext } from "../OdinContext";

export function Canister() {
    const { user, delegationChain } = useOdinContext();

    if (!user) {
        return <div>Please connect first.</div>;
    }
    if (!delegationChain) {
        return <div>No delegation chain available.</div>;
    }
    return <div>Canister Feature</div>;
}