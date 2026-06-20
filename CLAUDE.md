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
npm run release        # release-it: bump version, tag v${version}, npm publish
```

CI (`.github/workflows/pr.yml`) runs `npm test` on every PR. Node 20.18.

Tests use `environment: "jsdom"` with `globals: true` — no per-file vitest imports needed. Tests live next to source as `*.test.ts` and are excluded from the build (`tsconfig.json`).

## Architecture

Layered. Public surface is small; everything else is internal services composed in `Connect`'s constructor.

- [src/index.ts](src/index.ts) — the entire public API. Only `OdinConnect` (the `Connect` class) and types are exported, all prefixed `Odin*`. Adding a public export means editing this file.
- [src/services/connect.ts](src/services/connect.ts) — `Connect`, the entry point. Owns the API/canister/window/storage instances. `connect()` opens a popup and resolves a `ConnectedUser` from a `postMessage`. `restoreSession()`/`isSessionValid()` rehydrate from `localStorage`.
- [src/services/connected-user.ts](src/services/connected-user.ts) — `ConnectedUser`, returned after auth. Thin facade: binds `principal` then delegates every method to `OdinApiClient` (reads) or `OdinCanisterClient` (actions). New user-scoped action ⇒ add here AND on the underlying client.
- [src/services/api.ts](src/services/api.ts) — `OdinApiClient`, all REST calls to `api.odin.fun`. Read-only data + authenticated image uploads (`apiKey`).
- [src/services/canister.ts](src/services/canister.ts) — `OdinCanisterClient`, all blockchain mutations (buy/sell/transfer/swap/liquidity/icrcApprove/createToken). Every action funnels through private `baseAction()`: opens a popup to an `authorize/*` path and resolves a Promise on a matching `postMessage`. New trading action = a new `baseAction` wrapper.
- [src/services/window.ts](src/services/window.ts) — `WindowClient`, wraps `window.open` for popups.
- [src/services/http.ts](src/services/http.ts) — `HttpClient`, axios wrapper.
- [src/services/storage.ts](src/services/storage.ts) — `SessionStorage`, localStorage-backed session under key `odin_connect:${slug}:${env}:session`. All accesses try/catch (SSR / privacy mode safe).
- [src/models/](src/models/) — pure type definitions. [src/utils/](src/utils/) — `convertToOdinAmount`, token-field validators, delegation validity check.

### Cross-cutting conventions

- **BigInt everywhere for token amounts.** API responses parsed with `@apimatic/json-bigint` (`bigIntTransformer` in http.ts) so large numbers survive. `getUserTokens`/`getUserLiquidity` re-cast `balance` to `BigInt`. Canister action params take `bigint` and `.toString()` them into URL params. Keep amounts `bigint` through the whole path.
- **Popup + postMessage is the auth/action mechanism.** No direct canister calls — the Odin frontend (origin from `ORIGINS`) handles signing in a popup; the SDK only opens the URL and listens for the reply. Always verify `event.origin === this.origin` before trusting a message.
- **Environments** ([src/models/environment.ts](src/models/environment.ts)): `prod`/`dev`/`local`. `Connect` collapses everything non-`prod` to `dev` for the API base URL but keeps the full env for popup origins.
- **Token-creation validators** ([src/utils/index.ts](src/utils/index.ts)): `createTokenValidators` map runs in `createToken`/`uploadImage`; each returns an error string or `undefined`. Add field rules there, not inline.

## Conventions for changes

- Branch names and commit messages include the ClickUp task ID (e.g. `docs/86aj57792-...`).
- Release commit format is `chore: release v${version}` (release-it config in package.json).
- `dist/` is committed/published — rebuild (`npm run build`) when changing the public bundle.
