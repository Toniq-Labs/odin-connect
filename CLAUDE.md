# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`odin-connect` — TypeScript SDK for the [Odin](https://odin.fun) token platform on the Internet Computer (ICP). Published to npm; consumers import the `OdinConnect` class. Handles user auth, token trading, liquidity, and REST API calls. Browser-only (depends on `window`, `localStorage`, `postMessage`).

## Commands

```bash
npm run build          # bundle src/index.ts -> dist/ via tsup (ESM, minified, .d.ts)
npm test               # vitest (watch mode by default)
npx vitest run         # single non-watch run (what CI effectively needs)
npx vitest run src/services/api.test.ts   # one test file
npm run demo           # build SDK, install it into demo/, run demo Vite dev server
npm run audit          # npm audit, production deps only, fails on moderate+ (also in demo/: fails on high+)
npm run release        # release-it: bump version, tag v${version}, npm publish
```

CI runs `npm test` (`.github/workflows/pr.yml`) and `npm run audit` in root and `demo/` (`.github/workflows/audit.yml`) on every PR. Node 20.18.

Tests use `environment: "jsdom"` with `globals: true` — no per-file vitest imports needed. Tests live next to source as `*.test.ts` and are excluded from the build (`tsconfig.json`).

## Architecture

Layered. Public surface is small; everything else is internal services composed in `Connect`'s constructor.

- [src/index.ts](src/index.ts) — the entire public API. Only `OdinConnect` (the `Connect` class) and types are exported, all prefixed `Odin*`. Adding a public export means editing this file.
- [src/services/connect.ts](src/services/connect.ts) — `Connect`, the entry point. Owns the API/canister/window/storage instances and the state store. `connect()` records a pending request, then opens a popup and settles it from a `postMessage` (or, in redirect mode — the default `"auto"` inside wallet in-app browsers — navigates the tab). `ready()` (auto-started by the constructor, idempotent, shared per `slug:env` via the module-level `redirectOutcomes` cache with instances whose `ready()` starts before the outcome settled; later instances get `request: null` and the stored session) restores the stored session and consumes/verifies a redirect result into the state. A popup connect only sets `state.user` / persists / sets the API key when it is still `state.request` (`disconnect()` clears it); a redirect result is dropped when `disconnect()` ran while it was read (module-level `disconnects` counter per `slug:env`, since the outcome is shared); popup connect listeners only accept messages whose `event.source` is their own popup. Apps read `state`/`getState()`, `getServerState()` (constant `INITIAL_ODIN_STATE`, the SSR snapshot), `subscribe()`, `user`; `restoreSession()` is deprecated and synchronous as in 1.6.0 (stored session's user, or `state.user` once ready; never applies redirect results). The returned promises (connect → `ConnectedUser`, actions → `true`) exist only for 1.6.0 popup code; redirect-mode promises never settle.
- [src/services/state.ts](src/services/state.ts) — `StateStore` + pure `reduce()`: the one path every result takes (popup messages, redirect results applied by `ready()`, the stored session). Each change is a new frozen `OdinState` snapshot (`getState()` is stable between changes, for `useSyncExternalStore`). Also the public `OdinState` / `OdinRequestState` / `OdinRequestInput` / `OdinAction` types. A new request replaces `state.request`; a settle for an older request id is ignored entirely (neither `request` nor `user` changes). A listener unsubscribed during a dispatch is not called.
- [src/services/connected-user.ts](src/services/connected-user.ts) — `ConnectedUser`, returned after auth. Thin facade: binds `principal` then delegates every method to `OdinApiClient` (reads) or `OdinCanisterClient` (actions). New user-scoped action ⇒ add here AND on the underlying client.
- [src/services/api.ts](src/services/api.ts) — `OdinApiClient`, all REST calls to `api.odin.fun`. Read-only data + authenticated image uploads (`apiKey`).
- [src/services/canister.ts](src/services/canister.ts) — `OdinCanisterClient`, all blockchain mutations (buy/sell/transfer/swap/liquidity/icrcApprove/createToken). Every action funnels through private `baseAction()`: records the request (with its user-facing `input`) in the store, opens a popup to an `authorize/*` path (or redirects) and settles on a matching `postMessage`: the action's success message → `success`, `"rejected"` → `rejected` (Odin's `detail.reason` code, if any, becomes `error`; see `readRejectReason`), else `failed`; a popup closed without an answer → `rejected` / `popup_closed` (`watchPopupClosed` polls `closed`, stops on answer, settle, supersede or disconnect; `connect()` uses it too). Paths, success messages and failure texts live in the `ACTIONS` table. New trading action = an `ACTIONS` entry, an `OdinRequestInput` entry, a `baseAction` wrapper.
- [src/services/redirect.ts](src/services/redirect.ts) — `RedirectClient`, redirect-mode plumbing shared by `connect()` and every action. Sends `return_url` as `origin + pathname` only (the Odin page rejects any query, fragment or other origin; there is no app registry), keeps the full page URL (`returnHref`), the request `input`/`returnState` and the one-time nonce in `sessionStorage` (bigint-safe), and on consume strips `#odin_connect` and restores the original query via `history.replaceState`.
- [src/services/window.ts](src/services/window.ts) — `WindowClient`, wraps `window.open` for popups.
- [src/services/http.ts](src/services/http.ts) — `HttpClient`, axios wrapper.
- [src/services/storage.ts](src/services/storage.ts) — `SessionStorage`, localStorage-backed session under key `odin_connect:${slug}:${env}:session`. All accesses try/catch (SSR / privacy mode safe).
- [src/models/](src/models/) — pure type definitions. [src/utils/](src/utils/) — `convertToOdinAmount`, token-field validators, delegation validity check.

### Cross-cutting conventions

- **BigInt everywhere for token amounts.** API responses parsed with `@apimatic/json-bigint` (`bigIntTransformer` in http.ts) so large numbers survive. `getUserTokens`/`getUserLiquidity` re-cast `balance` to `BigInt`. Canister action params take `bigint` and `.toString()` them into URL params. Keep amounts `bigint` through the whole path.
- **Results go through the store, not return values.** Anything new that produces a result must dispatch to `StateStore` (both popup and redirect paths) and keep secrets (session key, JWT) out of `state.request` and the pending `input`. Returned promises are marked handled (`quiet()`) so apps that only subscribe never get unhandled rejections.
- **Popup + postMessage is the auth/action mechanism.** No direct canister calls — the Odin frontend (origin from `ORIGINS`) handles signing in a popup; the SDK only opens the URL and listens for the reply. Always verify `event.origin === this.origin` before trusting a message.
- **Environments** ([src/models/environment.ts](src/models/environment.ts)): `prod`/`dev`/`local`/`legacy`. `Connect` maps `prod`→`prod`, `legacy`→`legacy`, and everything else to `dev` for the API base URL, but keeps the full env for popup origins.
- **Token-creation validators** ([src/utils/index.ts](src/utils/index.ts)): `createTokenValidators` map runs in `createToken`/`uploadImage`; each returns an error string or `undefined`. Add field rules there, not inline.

## Conventions for changes

- Branch names and commit messages include the ClickUp task ID (e.g. `docs/86aj57792-...`).
- Release commit format is `chore: release v${version}` (release-it config in package.json).
- `dist/` is gitignored but published to npm (via the `files` field) — rebuild (`npm run build`) when changing the public bundle.

## Migration guide for agents

`MIGRATION-2.0.md` (repo root, shipped in the npm package via `files`) tells
coding agents how to upgrade an app from 1.6.x/1.7.x to 2.0. Keep it in sync
with the readme's "Migrating to 2.0.0" section and the public API whenever
either changes.
