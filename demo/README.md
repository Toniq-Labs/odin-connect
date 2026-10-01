# OdinConnect demo

Run from the repository root with `npm run demo` (builds the SDK, installs it
here, starts Vite).

## Redirect mode: resuming forms with `returnState`

In redirect mode (`mode: "redirect"`, or `"auto"` inside a wallet in-app
browser) every `connect()` and action navigates this tab to Odin and back, so
the page reloads and in-memory form state is gone. The demo passes what each
form needs as the SDK's `returnState`, which stays in `sessionStorage` and
comes back from `handleRedirectResult()`:

- [src/useReturnState.ts](src/useReturnState.ts) is what each form uses.
  `state(fields)` builds the value; pass it to both `requestUser()` and the
  action. On the next load the hook calls `restore(fields)` to refill the
  inputs and `setResult` with a message built from the outcome.
- [src/OdinContextProvider.tsx](src/OdinContextProvider.tsx) calls
  `handleRedirectResult()` before `restoreSession()` (which would drop the
  `returnState` of a connect result) and forwards `requestUser(returnState)`
  into `connect({ returnState })`.

If the user was not connected, that `connect()` redirects first and the
action never runs. The result is then a connect result carrying the form's
`returnState`; the form is restored with a "Connected. Submit again" message
and is never resubmitted automatically.

`returnState` is plain JSON plus bigints, so the create-token image `File`
is not carried and must be selected again.

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
