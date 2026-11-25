import { useOdinContext } from "../OdinContext";

/**
 * Shown when the SDK logged the user out on its own (`state.logoutReason`):
 * they logged out on odin.fun, or the API key expired. Gone once a user
 * connects again (or after `disconnect()` / a reload). The app does not
 * reconnect automatically: the user signs in again with a Connect button.
 */
export const LogoutNotice = () => {
  const { logoutReason } = useOdinContext();
  if (!logoutReason) return null;
  return (
    <div className="result">
      {logoutReason === "revoked"
        ? "You were signed out on odin.fun. Connect again to continue."
        : "Your session expired. Connect again to continue."}
    </div>
  );
};
