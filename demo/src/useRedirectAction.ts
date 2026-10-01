import { useCallback, useEffect, useRef } from "react";
import type { OdinAction } from "odin-connect";
import { useOdinContext } from "./OdinContext";
import {
  clearRedirectContext,
  writeRedirectContext,
} from "./redirect-context";

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
 * Wires a form to the URL redirect context.
 *
 * - `fields` holds the values the form carried into the redirect this page
 *   load returned from (null when this form did not start it). Use them as
 *   initial state so the inputs are restored.
 * - When the redirect result for this form is known, `setResult` is called
 *   once with a message built from the outcome and the carried `fields`.
 * - `begin(fields)` writes the context into the URL; call it synchronously
 *   before `requestUser()` so a connect-first redirect carries it too.
 * - `end()` removes the context; call it in `finally`. In redirect mode the
 *   page unloads before it runs and the provider clears the URL on the next
 *   load instead. In popup mode it keeps the URL clean.
 */
export function useRedirectAction({
  action,
  label,
  success,
  setResult,
}: {
  action: OdinAction;
  /** Verb phrase for messages, e.g. `"approve"` or `"add liquidity"`. */
  label: string;
  /** Success message built from the carried fields. */
  success: (fields: Record<string, string>) => string;
  setResult: (message: string) => void;
}) {
  const { redirectContext, redirectResult } = useOdinContext();
  const fields =
    redirectContext?.action === action ? redirectContext.fields : null;

  let outcome: RedirectOutcome | null = null;
  if (fields && redirectResult) {
    if (redirectResult.action === action) {
      outcome = redirectResult.status;
    } else if (redirectResult.action === "connect") {
      outcome =
        redirectResult.status === "connected" ? "connected" : "rejected";
    }
  }

  // Keep the latest callbacks without re-running the effect for them.
  const successRef = useRef(success);
  successRef.current = success;
  const setResultRef = useRef(setResult);
  setResultRef.current = setResult;

  useEffect(() => {
    if (outcome && fields) {
      setResultRef.current(
        outcomeMessage(outcome, label, successRef.current(fields))
      );
    }
  }, [outcome, fields, label]);

  const begin = useCallback(
    (fields: Record<string, string>) => {
      writeRedirectContext({ action, fields });
    },
    [action]
  );

  const end = useCallback(() => {
    clearRedirectContext();
  }, []);

  return { fields, begin, end };
}
