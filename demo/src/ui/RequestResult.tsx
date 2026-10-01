import { useOdinContext } from "../OdinContext";

const json = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${v}n` : v));

/**
 * The latest connect() or action, from `state.request`: the same banner
 * for a popup result and for a redirect result applied by `ready()`.
 */
export const RequestResult = () => {
  const { request } = useOdinContext();
  if (!request) return null;
  return (
    <div className="result">
      Last request: {request.action} → {request.status}
      <br />
      input: {json(request.input)}
      {request.detail && (
        <>
          <br />
          detail: {json(request.detail)}
        </>
      )}
      {request.returnState !== undefined && (
        <>
          <br />
          returnState: {json(request.returnState)}
        </>
      )}
      {request.error && (
        <>
          <br />
          error: {request.error}
        </>
      )}
    </div>
  );
};
