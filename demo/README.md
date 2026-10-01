# OdinConnect demo

Run from the repository root with `npm run demo` (builds the SDK, installs it
here, starts Vite).

## Redirect mode: resuming forms

In redirect mode (`mode: "redirect"`, or `"auto"` inside a wallet in-app
browser) every `connect()` and action navigates this tab to Odin and back, so
the page reloads and in-memory form state is gone. The demo keeps it in the
page URL:

- [src/redirect-context.ts](src/redirect-context.ts) writes `odin_action` and
  `odin_f_<field>` query params with `history.replaceState`. The SDK sends the
  current URL (minus fragment) to Odin as `return_url`, and Odin navigates back
  to it unchanged, so the params survive the round trip.
- [src/useRedirectAction.ts](src/useRedirectAction.ts) is what each form
  uses: call `begin(fields)` synchronously before `requestUser()`, `end()` in
  `finally`, and seed the inputs from `fields`. On the next load the hook turns
  the SDK's `handleRedirectResult()` outcome into a result message.
- [src/OdinContextProvider.tsx](src/OdinContextProvider.tsx) reads the params
  during the first render, exposes them as `redirectContext`, then clears them
  from the address bar.

If the user was not connected, `requestUser()` redirects for `connect()`
first and the action never runs. The form is restored with a "Connected.
Submit again" message; it is never resubmitted automatically.

The values are visible in the address bar, browser history and to the Odin
frontend, so only the non-sensitive strings the user typed are carried. A
`File` (the create-token image) cannot be carried and must be selected again.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
