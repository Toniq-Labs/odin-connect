import { useOdinContext } from "../OdinContext";

/**
 * Outcome of the last redirect-mode connect() or action, if any, and the
 * form state the URL carried across it.
 */
export const RedirectResult = () => {
  const { redirectResult, redirectContext } = useOdinContext();
  if (!redirectResult && !redirectContext) return null;
  return (
    <div className="result">
      {redirectResult && (
        <div>
          Redirect result: {redirectResult.action} → {redirectResult.status}
        </div>
      )}
      {redirectContext && (
        <div>
          Carried form: {redirectContext.action}{" "}
          {Object.entries(redirectContext.fields)
            .map(([key, value]) => `${key}=${value}`)
            .join(", ")}
        </div>
      )}
    </div>
  );
};
