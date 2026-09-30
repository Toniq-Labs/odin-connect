import { useOdinContext } from "../OdinContext";

/** Outcome of the last redirect-mode connect() or action, if any. */
export const RedirectResult = () => {
  const { redirectResult } = useOdinContext();
  if (!redirectResult) return null;
  return (
    <div className="result">
      Redirect result: {redirectResult.action} → {redirectResult.status}
    </div>
  );
};
