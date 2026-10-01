import { useCallback, useEffect, useRef } from "react";
import type { OdinAction } from "odin-connect";
import { useOdinContext } from "./OdinContext";

/**
 * What the demo forms pass as `returnState` to `connect()` and every action.
 * It never leaves the tab: the SDK keeps it in sessionStorage with the
 * one-time nonce and hands it back from `handleRedirectResult()`.
 */
export type FormReturnState = {
  action: OdinAction;
  fields: Record<string, string>;
};

function isFormReturnState(value: unknown): value is FormReturnState {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.action === "string" &&
    typeof record.fields === "object" &&
    record.fields !== null
  );
}

/** What a form learns about its action on the page load after a redirect. */
export type RedirectOutcome =
  /* the action itself came back */
  | "success"
  | "failed"
  /* the user was not connected, so connect() redirected first and the action
     never ran; the form is restored and should be submitted again */
  | "connected"
  | "rejected";

function outcomeMessage(
  outcome: RedirectOutcome,
  label: string,
  success: string
): string {
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  switch (outcome) {
    case "success":
      return success;
    case "failed":
      return `${capitalized} failed or was rejected on Odin`;
    case "connected":
      return `Connected. Submit again to ${label}.`;
    case "rejected":
      return `Connection rejected. ${capitalized} was not submitted.`;
  }
}

/**
 * Wires a form to the SDK's `returnState`.
 *
 * - `state(fields)` builds the value to pass as `returnState` to both
 *   `requestUser()` (so a connect-first redirect carries it) and the action.
 * - On the page load after a redirect that this form started, `restore` is
 *   called with the carried fields and `setResult` with a message built from
 *   the outcome. Nothing happens in popup mode, where the awaited call
 *   resolves as usual.
 */
export function useReturnState({
  action,
  label,
  success,
  restore,
  setResult,
}: {
  action: OdinAction;
  /** Verb phrase for messages, e.g. `"approve"` or `"add liquidity"`. */
  label: string;
  /** Success message built from the carried fields. */
  success: (fields: Record<string, string>) => string;
  /** Put the carried fields back into the inputs. */
  restore: (fields: Record<string, string>) => void;
  setResult: (message: string) => void;
}) {
  const { redirectResult } = useOdinContext();

  // Keep the latest callbacks without re-running the effect for them.
  const successRef = useRef(success);
  successRef.current = success;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const setResultRef = useRef(setResult);
  setResultRef.current = setResult;

  useEffect(() => {
    if (!redirectResult) return;
    const state = redirectResult.returnState;
    if (!isFormReturnState(state) || state.action !== action) return;

    let outcome: RedirectOutcome | null = null;
    if (redirectResult.action === "connect") {
      outcome =
        redirectResult.status === "connected" ? "connected" : "rejected";
    } else if (redirectResult.action === action) {
      outcome = redirectResult.status;
    }
    if (!outcome) return;

    restoreRef.current(state.fields);
    setResultRef.current(
      outcomeMessage(outcome, label, successRef.current(state.fields))
    );
  }, [redirectResult, action, label]);

  const state = useCallback(
    (fields: Record<string, string>): FormReturnState => ({ action, fields }),
    [action]
  );

  return { state };
}
