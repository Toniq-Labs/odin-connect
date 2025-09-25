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
import { Api } from "./features/Api";

function App() {
  return (
    <OdinProvider>
      <div className="demo-container">
        <section>
          <h1>Connect</h1>
          <Connect />
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
          <h1>Api</h1>
          <Api />
        </section>
      </div>
    </OdinProvider>
  );
}

export default App;
