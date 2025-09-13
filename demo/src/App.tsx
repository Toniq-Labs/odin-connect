import "./App.css";
import { OdinProvider } from "./context";
import { Balances } from "./features/Balances";
import Connect from "./features/Connect";
import { Sell } from "./features/Sell";
import { Buy } from "./features/Buy";
import { Transfer } from "./features/Transfer";
import { Liquidity } from "./features/Liquidity";

function App() {
  return (
    <OdinProvider>
      <section>
        <h1>Connect</h1>
        <Connect />
      </section>
      <div className="demo-container">
        <section>
          <h1>Balances</h1>
          <Balances />
        </section>
        <section>
          <h1>Trade</h1>
          <h2>Buy Token with BTC</h2>
          <Buy />
          <h2>Sell Token for BTC</h2>
          <Sell />
        </section>
        <section>
          <h1>Transfer</h1>
          <Transfer />
        </section>
        <section>
          <h1>Liquidity</h1>
          <Liquidity />
        </section>
      </div>
    </OdinProvider>
  );
}

export default App;
