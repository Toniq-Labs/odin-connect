# Upgrading an app to odin-connect 2.0 — instructions for coding agents

This file is written for an AI coding agent (Claude Code, Cursor, Codex, …)
asked to upgrade an application that uses `odin-connect` from **1.6.x or
1.7.x to 2.0**. It is shipped inside the npm package from 2.0.0 on, so once
the app depends on 2.x it is at `node_modules/odin-connect/MIGRATION-2.0.md`
(an app still on 1.x does not have that file yet). Humans can read the
"Migrating to 2.0.0" section of the readme instead; both say the same thing.

Follow the steps in order. Do not skip the verification step.

**App already on 2.0.x?** Skip to
[Upgrading from 2.0 to 2.1](#upgrading-from-20-to-21) at the end.

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
  "odin-connect|OdinConnect|restoreSession|handleRedirectResult|lastRedirectResult|OdinRedirectResult|requires_api|requires_delegation|mode:[[:space:]]*\"(popup|redirect|auto)\"|\.(connect|disconnect|buy|sell|transfer|swap|addLiquidity|removeLiquidity|icrcApprove|createToken)\(" \
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
npm install odin-connect@^2.1.0   # or pnpm add / yarn add
```

2.0 is a major version: `^1.x` ranges will not pick it up on their own.
Install 2.1 or later: 2.0.x stops being able to connect after the v1 proof
deadline (`"legacy"` env: a later date; see [Upgrading from 2.0 to 2.1](#upgrading-from-20-to-21)).

Testing an unreleased 2.0 build (before it is on npm): run `npm pack` in
the odin-connect repo and install the tarball **temporarily**
(`npm install /path/to/odin-connect-<version>.tgz`). Never commit a `file:`
or tarball dependency; once 2.0 is released, put back `^2.0.0` and
regenerate the lockfile. A pack built before the release version bump
reports the old version (e.g. `1.7.0`) in `package.json`, so do not trust
the version number: confirm you have 2.0 by checking that
`node_modules/odin-connect/dist/index.d.ts` declares `getServerState`.

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

Typical mapping from an app's own auth state machine:

| App state | 2.0 state |
|---|---|
| idle / logged out | `status: "ready"`, `user: null`, no pending `request` |
| signed out by odin.fun | `user: null` and `logoutReason` set (`"revoked"` / `"expired"`) |
| connecting | `request.action === "connect"` and `request.status === "pending"` |
| connected | `user !== null` |
| error | `request.action === "connect"` and `request.status` is `"rejected"`, `"failed"` or `"unverified"` |
| (loading) | `status: "initializing"` |

Check `user` first: a user who is still connected stays connected when a
re-connect is rejected (`user` is set **and** `request.status` is
`"rejected"`); show them as connected, not as an error screen.

### 4a. One instance, then `subscribe` + `ready`

```ts
import { OdinConnect } from "odin-connect";

export const odin = new OdinConnect({ name: "My App", env: "prod" }); // once per page load

odin.subscribe((state) => applyOdinState(state)); // every change, both modes
const initial = await odin.ready();                // stored session + any returning redirect result
applyOdinState(initial);
```

`state` is `{ status: "initializing" | "ready", user, request, logoutReason? }`:
- `user` — `OdinConnectedUser | null` (replaces `restoreSession()`'s return
  value and the value `await connect()` returned);
- `request` — the latest `connect()` or action:
  `{ id, action, status, input, detail?, returnState?, error? }`, with
  `status` one of `"pending" | "success" | "rejected" | "failed" | "unverified"`
  and `input` the call's own arguments (e.g. `{ token, spender, amount }`,
  bigints preserved);
- `logoutReason` — set only when the SDK logged the user out on its own
  (`"revoked"`: logged out on odin.fun; `"expired"`: the API key expired).
  See Step 6.

### 4b. Move "after await" logic into the state handler

Before (1.6.0):

```ts
const ok = await user.icrcApprove({ token, spender, amount });
if (ok) goToStep("commit", { token, amount });
```

After (2.0, works in popup and redirect mode):

```ts
// button handler: just start it
const user = odin.user;
if (!user) return showError("Connect first");
void user.icrcApprove({ token, spender, amount });

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
  if (request?.action === "connect" && request.status === "rejected") {
    if (request.error === "untrusted_origin") {
      // Odin's ICRC-28 check failed: a target canister does not list this
      // app's origin in icrc28_trusted_origins. Not fixable by retrying.
      showError("This app's origin is not trusted by the target canisters.");
    } else {
      showError("Sign-in was cancelled.");
    }
  }
}
```

A `"rejected"` request carries `request.error` when the user tapped "Back
to app" on an Odin error screen (`untrusted_origin`, `invalid_targets`,
`no_targets`, `invalid_session_key`, `missing_request_id`,
`unsupported_identity`, `no_action`, `session_revoked`) or closed the popup without answering
(`popup_closed`, set by the SDK in popup mode; `navigated_back`, set by the SDK in redirect mode when the user presses Back on Odin) — `OdinRejectReason`; see the
readme's "Rejection reasons". A plain Reject leaves it unset. Treat unknown
codes as a plain rejection. For a plain rejection (no `error`), supply your
own copy (e.g. "Approval was rejected"); the SDK has no message for it.

Starting an action without awaiting it is safe: the returned promise is
already marked handled, so ignoring it never causes an unhandled rejection.
Do not write `odin.user?.icrcApprove(…)` as a statement: it silently does
nothing when `user` is null, and lint (`no-floating-promises`) flags it.
Check for the user, show an error if it is missing, and use `void` as above.

Rules:
- Use `request.input` instead of variables captured before the call; they
  are gone after a redirect. Use `returnState` (any JSON, bigints allowed)
  only for extra app context that is not part of the call's inputs, e.g.
  `user.icrcApprove({ …, returnState: { step: "approve" } })` →
  `request.returnState`. If the follow-up needs values that are not the
  call's own arguments, they must go in `returnState`; nothing else survives
  a redirect.
- Two flows that start the same action (e.g. a deposit and a withdrawal that
  both `icrcApprove` the same spender) can have identical `input`: tag each
  call's `returnState` (`{ flow: "deposit" }`) and match on
  `request.returnState` as well as `request.action`.
- Key handlers on `request.action` + `request.status`, and make them
  idempotent. A settled request stays in `state` until the next request, and
  effects re-run (re-render, React StrictMode, remount), so the handler sees
  it again. When the follow-up moves value this is mandatory: claim
  `request.id` **synchronously, before any `await`**, in storage that
  outlives the component (module scope), e.g.

  ```ts
  const handled = new Set<string>(); // module scope, not component state
  function onApproved(request) {
    if (handled.has(request.id)) return;
    handled.add(request.id); // claim before awaiting anything
    void commitDeposit(request.input);
  }
  ```
- After a redirect reload, async resources the app rebuilds from the session
  (e.g. a canister actor created from `user`'s delegation identity) can arrive
  after the `success` state. Wait for them before acting, and do not mark
  the request handled until you actually act (in the example above, return
  before `handled.add` while the actor is not ready, and run the handler
  again when it is).
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
server-rendered HTML hydrates without a mismatch. With
`useSyncExternalStore` you do not call `ready()` or `subscribe()` yourself:
React subscribes, and the constructor already started `ready()`; while
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
  `await odin.ready()`. Readers that consume and remove a parameter on the
  first load, before any connect or action can start (e.g. a referral code
  stored and stripped at startup), are unaffected: the query they saw is the
  one before any redirect.
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
- A popup the user closes without answering settles the request as
  `"rejected"` with `error: "popup_closed"` (the promise rejects with the
  usual rejection text) once a 1.5 s grace period has passed; an answer
  Odin posted just before closing the popup still wins. Do not keep buttons
  disabled until a reload: re-enable them on any settled status.
- A new verified connect replaces the stored session (the previous user's
  JWT and delegation are cleared).
- Only the latest request updates `state`; a connect that finishes after a
  newer request or `disconnect()` resolves its promise but does not set the
  user.
- **The SDK can log the user out on its own** (2.1): when odin-api refuses
  the API key (the user logged out on odin.fun, or the key expired) or Odin
  rejects an action with `session_revoked`. `state.user` becomes `null` and
  `state.logoutReason` is set; `state.request` is kept. Render the logged-out
  screen from `state` (any app-side copy of the user or API key must follow
  `state.user`), optionally with a message such as "You were signed out on
  odin.fun" when `logoutReason === "revoked"`. **Never** call `connect()`
  automatically on a logout; show a sign-in button.
- Action statuses are only a UI signal: before moving value (e.g. a step
  that spends an ICRC-2 allowance), confirm on-chain (`icrc2_allowance`,
  balances). Never treat `"success"` as proof.

## Step 7 — Verify

1. The checks the app has (typecheck, lint, format, unit tests, production
   build — whichever exist) pass.
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
| `new OdinConnect({ name, env, mode?, lang?, slug?, sessionCheckIntervalMs? })` | One instance per page load. `mode` defaults to `"auto"`; the session check runs at most every 5 minutes by default. |
| `await odin.ready()` | Initial state: stored session + any returning redirect result. Idempotent. |
| `odin.state` / `odin.getState()` | Current immutable snapshot `{ status, user, request, logoutReason? }`. |
| `odin.subscribe(listener)` → `unsubscribe` | Called on every state change (popup and redirect). |
| `odin.getServerState()` / `INITIAL_ODIN_STATE` | Server snapshot for `useSyncExternalStore`. |
| `odin.user` | Shortcut for `odin.state.user`. |
| `odin.connect(options)` | Start a connect (`requires_api`, `requires_delegation`, `targets`, `returnState`). |
| `odin.user.buy/sell/transfer/swap/addLiquidity/removeLiquidity/icrcApprove/createToken(…)` | Start an action; optional `returnState`. |
| `odin.disconnect()` | Clear the session; `user` and `request` become `null`. |
| `odin.mode` | Read/override `"popup" \| "redirect" \| "auto"`. |
| `restoreSession()` | Deprecated, synchronous, stored session only. |
| `OdinLogoutReason` | `"revoked"` \| `"expired"`: why the SDK logged the user out (`state.logoutReason`). |
| `OdinConnectVerificationError` | Popup connect rejection when verification fails. |
| `isInAppBrowser()` | The detection `"auto"` uses. |

## Upgrading from 2.0 to 2.1

2.1 ends the app's session when the user logs out on odin.fun. No code
change is required; do these checks:

1. `npm install odin-connect@^2.1.0` and regenerate the lockfile. Upgrade
   before the v1 proof deadline: 2.1 asks Odin for a v2 identity proof (with
   the user's odin.fun session id), and odin-api stops accepting v1 proofs
   30 days after the 2.1.0 release (the date is announced with it). After
   that, connect fails with 2.0.x on `env` `"prod"`, `"staging"` and
   `"dev"`. `"legacy"` (odin-api `/v1`) keeps accepting v1 proofs until a
   separate date, announced later; upgrade legacy apps anyway.
2. Search for places that keep their own copy of the user or the API key
   (`grep -rn -E "\.user\b|apiKey|getState\(\)" --exclude-dir=node_modules .`).
   They must follow `state.user`: it can now become `null` without a
   `disconnect()` call (see Step 6).
3. Optional: show a message when `state.logoutReason === "revoked"` (the user
   logged out on odin.fun). Do not call `connect()` automatically.
4. Optional: `sessionCheckIntervalMs` in the constructor changes how often
   the SDK checks the session (default 5 minutes, `0` = on every load and
   focus). Leave the default unless the owner asks.
5. Verify: connect with `requires_api`, log out on odin.fun in another tab,
   then come back to the app tab after 5 minutes (or reload it); the app
   shows the user as logged out (on `env: "legacy"` only once legacy.odin.fun
   and odin-api `/v1` support it; until then skip this check). Starting an action after the odin.fun
   logout also logs the user out, with `request.error === "session_revoked"`.
