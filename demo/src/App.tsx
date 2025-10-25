import "./App.css";
import { OdinProvider } from "./OdinContextProvider";
import { Balances } from "./features/Balances";
import Connect from "./features/Connect";
import { Sell } from "./features/Sell";
import { Buy } from "./features/Buy";
import { Transfer } from "./features/Transfer";
import { AddLiquidity } from "./features/AddLiquidity";
import { RemoveLiquidity } from "./features/RemoveLiquidity";
import { Swap } from "./features/Swap";
import { UserApi } from "./features/UserApi";
import { CreateToken } from "./features/CreateToken";
import { Canister } from "./features/Canister";
//import { MySandbox } from "./features/MySandbox";

function App() {
  return (
    <OdinProvider>
      <div className="demo-container">
        <section>
          <h1>Connect</h1>
          <Connect />
        </section>
        <section>
          <h1>Canister</h1>
          <Canister />
        </section>
        <section>
          <h1>Balances</h1>
          <Balances />
        </section>
        <section>
          <h1>Buy Token with BTC</h1>
          <Buy />
        </section>
        <section>
          <h1>Sell Token for BTC</h1>
          <Sell />
        </section>
        <section>
          <h1>Add Liquidity</h1>
          <AddLiquidity />
        </section>
        <section>
          <h1>Remove Liquidity</h1>
          <RemoveLiquidity />
        </section>
        <section>
          <h1>Transfer</h1>
          <Transfer />
        </section>
        <section>
          <h1>Swap</h1>
          <Swap />
        </section>
        <section>
          <h1>Create Token</h1>
          <CreateToken />
        </section>
        <section>
          <h1>User Methods</h1>
          <UserApi />
        </section>
        {/* <section>
          <MySandbox />
        </section> */}
      </div>
    </OdinProvider>
  );
}

export default App;
