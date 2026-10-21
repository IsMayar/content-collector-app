# Frontend foundation

From PowerShell:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The development server uses a fixed port and fails clearly if it is occupied. No backend is needed for this placeholder shell.

```powershell
npm run typecheck
npm run build
npm run preview
```

Preview serves the production output on http://127.0.0.1:4173 by default. Production hosting must rewrite application routes (for example `/about`) to `index.html`.

## Structure

- `src/app`: router, Redux store and providers.
- `src/api`: shared transport factory and separate empty agency/client RTK Query slices. Future features can use `injectEndpoints`; there are no network requests from the shell.
- `src/components`: semantic responsive application shell.
- `src/features/foundation`: placeholder Welcome, About and missing-page views.
- `src/styles`: Tailwind/HeroUI imports and product palette tokens.

`@/` resolves to `src/` in TypeScript and Vite. Both TypeScript projects use strict mode; React StrictMode wraps the application. Redux owns the two API caches; authentication and API error/CSRF handling remain later tasks. HeroUI v3 needs no v2-style provider. The button uses HeroUI's accessible press behavior.

## Setup references

Official instructions checked on 21 October 2026:

- [Vite](https://vite.dev/guide/): React/TypeScript integration and Node requirements.
- [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite): `@tailwindcss/vite` and CSS import.
- [HeroUI v3](https://heroui.com/en/docs/react/getting-started/quick-start): React 19+, Tailwind v4, styles after Tailwind.
- [React Router](https://reactrouter.com/start/data/installation): browser router and RouterProvider.
- [RTK Query](https://redux.js.org/toolkit/rtk-query/overview): API reducers and middleware.

Direct dependency versions are resolved exactly in `package.json`; `package-lock.json` records the full dependency tree. Use `npm ci` to reproduce it.
