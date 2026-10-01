# Upgrading an app to odin-connect 2.0 — instructions for coding agents

This file is written for an AI coding agent (Claude Code, Cursor, Codex, …)
asked to upgrade an application that uses `odin-connect` from **1.6.x or
1.7.x to 2.0**. It is shipped inside the npm package, so in the app's repo
it is at `node_modules/odin-connect/MIGRATION-2.0.md`. Humans can read the
"Migrating to 2.0.0" section of the readme instead; both say the same thing.

Follow the steps in order. Do not skip the verification step.

## What changed, in one paragraph

2.0 delivers every result (a connect, a buy, an approval) through **one
state store** instead of only through the promise returned by the call.
That is what makes wallet in-app browsers (OKX, Xverse, …) work: there the
SDK uses a full-page **redirect** to Odin and back (the new default
`mode: "auto"`), the page reloads, and an awaited promise from before the
reload never returns. The app reads results from `odin.state` /
`odin.subscribe()` instead, which works the same way in popup mode. Connect
results are now cryptographically verified (locally and by
`POST https://api.odin.fun/<env>/connect/verify`), and the SDK no longer
sends secrets in URLs. 1.6.0-style popup code still compiles and works.

## Step 1 — Inventory (read-only)

Run these from the app's repo root and keep the output for your report:

```bash
grep -rn -E \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
  --include='*.mjs' --include='*.vue' --include='*.svelte' \
  "odin-connect|OdinConnect|restoreSession|handleRedirectResult|lastRedirectResult|OdinRedirectResult|requires_api|requires_delegation|mode:[[:space:]]*\"(popup|redirect|auto)\"" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build .
grep -n '"odin-connect"' package.json
```

Record:
- the installed version (1.6.x or 1.7.x);
- where `new OdinConnect(` is called (it must end up as **one** instance per
  page load, created at module level or once in a provider — not per render
  or per route);
- every `restoreSession()`, `connect(…)` and `user.<action>(…)` call, and
  what the code does **after** each `await` (that logic is what moves);
- 1.7.x only: every `handleRedirectResult()` use and any `mode:` option;
- whether the app sets a Content-Security-Policy (`connect-src`);
- whether any page reads URL query parameters on load;
- the framework (React, Vue, Svelte, vanilla) and whether it server-renders.

## Step 2 — Upgrade the dependency

```bash
npm install odin-connect@^2.0.0   # or pnpm add / yarn add
```

2.0 is a major version: `^1.x` ranges will not pick it up on their own.

## Step 3 — Decide the scope

- **Recommended (full migration):** do Steps 4–7. The app then works in
  normal browsers *and* in wallet in-app browsers.
- **Popup-only (minimal):** if the owner explicitly does not want wallet
  in-app browser support, pass `mode: "popup"` to the constructor and stop
  after Step 6. Existing 1.6.0 popup code then behaves as before. Say in your
  report that wallet in-app browsers stay broken in this mode (popups cannot
  return results there).

Never leave a 1.6.0-style app on the default `mode: "auto"` without doing
Step 4: inside wallet browsers it would redirect, come back, and show the
user as not logged in.

## Step 4 — Render from state

### 4a. One instance, then `subscribe` + `ready`

```ts
import { OdinConnect } from "odin-connect";

export const odin = new OdinConnect({ name: "My App", env: "prod" }); // once per page load

odin.subscribe((state) => applyOdinState(state)); // every change, both modes
const initial = await odin.ready();                // stored session + any returning redirect result
applyOdinState(initial);
```

`state` is `{ status: "initializing" | "ready", user, request }`:
- `user` — `OdinConnectedUser | null` (replaces `restoreSession()`'s return
  value and the value `await connect()` returned);
- `request` — the latest `connect()` or action:
  `{ id, action, status, input, detail?, returnState?, error? }`, with
  `status` one of `"pending" | "success" | "rejected" | "failed" | "unverified"`
  and `input` the call's own arguments (e.g. `{ token, spender, amount }`,
  bigints preserved).

### 4b. Move "after await" logic into the state handler

Before (1.6.0):

```ts
const ok = await user.icrcApprove({ token, spender, amount });
if (ok) goToStep("commit", { token, amount });
```

After (2.0, works in popup and redirect mode):

```ts
// button handler: just start it
odin.user?.icrcApprove({ token, spender, amount });

// in applyOdinState:
function applyOdinState({ user, request }) {
  setUser(user);
  if (request?.action === "icrc_approve") {
    if (request.status === "success") goToStep("commit", request.input);
    if (request.status === "rejected") showError("Approval was rejected");
    if (request.status === "failed") showError(request.error ?? "Approval failed");
  }
  if (request?.action === "connect" && request.status === "unverified") {
    showError("Could not verify the sign-in. Please try again.");
  }
}
```

Rules:
- Use `request.input` instead of variables captured before the call; they
  are gone after a redirect. Use `returnState` (any JSON, bigints allowed)
  only for extra app context that is not part of the call's inputs, e.g.
  `user.icrcApprove({ …, returnState: { step: "approve" } })` →
  `request.returnState`.
- Key handlers on `request.action` + `request.status`, and make them
  idempotent: the handler may see the same `request` again on re-render.
- **Never** call `connect()` automatically when `request.status` is
  `"rejected"` or `"unverified"` — in redirect mode that sends the user
  straight back to Odin in a loop. Show a retry button instead.
- Pages that derive their screen from on-chain/API data (balances,
  allowances, positions) may need no handler at all beyond re-fetching when
  `request.status === "success"`.

### 4c. Replace `restoreSession()`

`restoreSession()` still works (synchronous, deprecated) but does **not**
see a result that just came back from a redirect. Replace

```ts
const user = odin.restoreSession();
```

with `odin.state.user` after `await odin.ready()`, or with the `user` from
the state handler.

### 4d. React

```tsx
import { useSyncExternalStore } from "react";
import { odin } from "./odin"; // the single instance from 4a

export function useOdin() {
  return useSyncExternalStore(odin.subscribe, odin.getState, odin.getServerState);
}
```

Pass `odin.getServerState` (not `getState`) as the third argument so
server-rendered HTML hydrates without a mismatch. While
`status === "initializing"`, render a loading state. React StrictMode's
double effects are safe (odin-api is asked once).

### 4e. 1.7.x only

- Delete `handleRedirectResult()` calls and the `OdinRedirectResult` type;
  read `(await odin.ready()).request` / `subscribe()` instead.
  `status: "connected"` is now `"success"`; the user is `state.user`.
- `restoreSession()` no longer finishes a redirect connect (1.7.0 did).
- Remove `mode: "auto"` / `"redirect"` if it only restated the new default.

## Step 5 — URL query, CSP, redirects

- **Query string:** in redirect mode Odin returns to `origin + pathname`
  (no query) and the SDK restores the original query once the result is
  read. Code that reads `location.search` on load must read it **after**
  `await odin.ready()`.
- **CSP:** if the app sets `connect-src`, add `https://api.odin.fun` (every
  connect is verified there).
- **Open redirects:** if the app has any page that forwards to a URL taken
  from the query or path (`/go?to=…`, `/redirect/<url>`), flag it in your
  report — apps using redirect mode with `requires_delegation` or
  `requires_api` must not have one. Do not try to "fix" it silently.
- `requires_api` now works in redirect mode (1.7.0 rejected it); nothing to
  change.

## Step 6 — Errors and behavior changes to account for

- Popup `connect()` can reject with `OdinConnectVerificationError` (the
  result could not be verified). Existing `catch` blocks should show a retry.
- A blocked connect popup now **rejects** ("Failed to open authorize/connect
  window, please always allow popups and try again") instead of hanging.
- A new verified connect replaces the stored session (the previous user's
  JWT and delegation are cleared).
- Only the latest request updates `state`; a connect that finishes after a
  newer request or `disconnect()` resolves its promise but does not set the
  user.
- Action statuses are only a UI signal: before moving value (e.g. a step
  that spends an ICRC-2 allowance), confirm on-chain (`icrc2_allowance`,
  balances). Never treat `"success"` as proof.

## Step 7 — Verify

1. Typecheck, lint, unit tests and production build of the app pass.
2. Desktop browser, default mode: connect → user shown; one action → the
   handler runs on `success`; reject in Odin → `rejected` shown, no loop.
3. Redirect path without a wallet browser: temporarily construct with
   `mode: "redirect"` (or run `odin.mode = "redirect"` in the console),
   repeat step 2 from a page whose URL has a query string; after the reload
   the user/result appear and the query string is back. Use `https://` or
   `http://localhost` (plain-http LAN addresses are rejected by Odin).
4. If possible, open the app inside the OKX or Xverse in-app browser and
   repeat step 2 with the default mode.
5. Revert any temporary `mode: "redirect"`.

## Report back

List: files changed; every former "after await" block and where its logic
moved; which `request.action` values the app now handles; whether CSP,
query-on-load or open-redirect findings needed attention; the verification
results from Step 7 (and what could not be tested, e.g. no wallet device).

## Quick reference (2.0 public API)

| API | Purpose |
|---|---|
| `new OdinConnect({ name, env, mode?, lang?, slug? })` | One instance per page load. `mode` defaults to `"auto"`. |
| `await odin.ready()` | Initial state: stored session + any returning redirect result. Idempotent. |
| `odin.state` / `odin.getState()` | Current immutable snapshot `{ status, user, request }`. |
| `odin.subscribe(listener)` → `unsubscribe` | Called on every state change (popup and redirect). |
| `odin.getServerState()` / `INITIAL_ODIN_STATE` | Server snapshot for `useSyncExternalStore`. |
| `odin.user` | Shortcut for `odin.state.user`. |
| `odin.connect(options)` | Start a connect (`requires_api`, `requires_delegation`, `targets`, `returnState`). |
| `odin.user.buy/sell/transfer/swap/addLiquidity/removeLiquidity/icrcApprove/createToken(…)` | Start an action; optional `returnState`. |
| `odin.disconnect()` | Clear the session; `user` and `request` become `null`. |
| `odin.mode` | Read/override `"popup" \| "redirect" \| "auto"`. |
| `restoreSession()` | Deprecated, synchronous, stored session only. |
| `OdinConnectVerificationError` | Popup connect rejection when verification fails. |
| `isInAppBrowser()` | The detection `"auto"` uses. |
