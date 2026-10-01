/**
 * Carries demo form state across an OdinConnect redirect through the page
 * URL. In redirect mode the SDK sends the current URL (minus its fragment) to
 * Odin as `return_url`, and Odin navigates back to it unchanged, so query
 * params survive the round trip. Only `odin_*` keys are touched here; any
 * other query params are kept as they are.
 *
 * The values are visible in the address bar, in browser history and to the
 * Odin frontend (as part of `return_url`). Keep them to the non-sensitive
 * strings the user typed.
 */
export type RedirectContext = {
  /** Authorize action the form started, e.g. `"icrc_approve"`. */
  action: string;
  /** Form field values, as typed. */
  fields: Record<string, string>;
};

const ACTION_KEY = "odin_action";
const FIELD_PREFIX = "odin_f_";

function stripContext(params: URLSearchParams) {
  for (const key of [...params.keys()]) {
    if (key === ACTION_KEY || key.startsWith(FIELD_PREFIX)) {
      params.delete(key);
    }
  }
}

/** Pure: the query string `search` with the context set (replacing any). */
export function applyContext(search: string, ctx: RedirectContext): string {
  const params = new URLSearchParams(search);
  stripContext(params);
  params.set(ACTION_KEY, ctx.action);
  for (const [key, value] of Object.entries(ctx.fields)) {
    params.set(FIELD_PREFIX + key, value);
  }
  return params.toString();
}

/** Pure: the query string `search` without any context keys. */
export function removeContext(search: string): string {
  const params = new URLSearchParams(search);
  stripContext(params);
  return params.toString();
}

/** Pure: the context carried by the query string `search`, if any. */
export function parseContext(search: string): RedirectContext | null {
  const params = new URLSearchParams(search);
  const action = params.get(ACTION_KEY);
  if (!action) return null;
  const fields: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key.startsWith(FIELD_PREFIX)) {
      fields[key.slice(FIELD_PREFIX.length)] = value;
    }
  }
  return { action, fields };
}

function replaceSearch(search: string) {
  const url = new URL(window.location.href);
  url.search = search;
  window.history.replaceState(window.history.state, "", url.href);
}

/** Put the context in the address bar (no navigation, no history entry). */
export function writeRedirectContext(ctx: RedirectContext) {
  replaceSearch(applyContext(window.location.search, ctx));
}

/** Read the context from the address bar. */
export function readRedirectContext(): RedirectContext | null {
  return parseContext(window.location.search);
}

/** Remove the context from the address bar. */
export function clearRedirectContext() {
  replaceSearch(removeContext(window.location.search));
}
