import { useOdinContext } from "../OdinContext";

/** Outcome of the last redirect-mode connect() or action, if any. */
export const RedirectResult = () => {
  const { redirectResult } = useOdinContext();
  if (!redirectResult) return null;
  return (
    <div className="result">
      Redirect result: {redirectResult.action} → {redirectResult.status}
      {redirectResult.returnState !== undefined &&
        ` (returnState: ${JSON.stringify(redirectResult.returnState, (_k, v) =>
          typeof v === "bigint" ? `${v}n` : v
        )})`}
    </div>
  );
};
