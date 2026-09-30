import type { OdinConnectMode } from "odin-connect";
import { useOdinContext } from "../OdinContext";

/** How connect() and every action reach Odin: popup, redirect, or auto. */
export const ModeSelect = () => {
  const { mode, setMode } = useOdinContext();

  return (
    <div>
      <label htmlFor="connectMode">Mode</label>{" "}
      <select
        id="connectMode"
        value={mode}
        onChange={(e) => setMode(e.target.value as OdinConnectMode)}
      >
        <option value="auto">Auto (redirect in wallet browsers)</option>
        <option value="popup">Popup</option>
        <option value="redirect">Redirect</option>
      </select>
    </div>
  );
};
