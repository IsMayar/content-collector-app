# Website Content Collector frontend

From PowerShell:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; do not start Vite yet.' }
npm run dev:mock
```

Open http://127.0.0.1:5173/sign-in. `dev:mock` explicitly enables MSW, with a visible development label and synthetic accounts. No backend or database is needed. Use `owner@studio.example` with `ContentDemo!2026`, or `solo@studio.example` / `member@studio.example` with the same password.

For later mock starts, run only `npm run dev:mock`. Use `npm run dev` with mocks disabled when integrating the owner's backend. The default API base is `/api/v1/`; Vite proxies `/api` to `http://127.0.0.1:8080`. Environment names are documented in `.env.example` and [the handoff](../docs/FRONTEND_BACKEND_HANDOFF.md). The existing T03 backend intentionally denies auth requests until the owner implements those contracts.

Before `npm ci`, stop this project's dev/preview servers with Ctrl+C. Windows locks native dependencies while Vite runs; a failed install can leave Vite unavailable until installation succeeds.

```powershell
npm run typecheck
npm run build
npm run lint
npm test
npm run test:browser
npm run test:pwa
npm run format:check
npm run preview
```

`test:browser` starts an isolated mock server on port 5174 and runs desktop (1440×1000), tablet (768×1024) and phone (360×800) scenarios in installed Microsoft Edge, then stops it. Override the channel with `$env:PLAYWRIGHT_CHANNEL='chromium'` after installing Playwright Chromium using `npx playwright install chromium`. Traces/screenshots are in ignored `test-results/`; reproduce a failure with `npx playwright show-trace <trace.zip>`.

Preview serves production output on http://127.0.0.1:4173 with mocks disabled. It requires the real API for session bootstrap; production mocking cannot be enabled through VITE_ENABLE_MOCKS. Production hosting must rewrite application routes to `index.html`.

## Structure

- `src/app`: router, typed hooks, Redux store and providers.
- `src/api`: shared HTTP/CSRF transport, runtime DTO schemas and separate agency/client RTK Query APIs.
- `src/features/auth`: session state, bootstrap, all authentication forms and injected endpoints.
- `src/components`: public/auth/agency/client layouts, navigation, page headers, form controls, state panels, notifications and confirmation dialog.
- `src/features/projects`: onboarding, dashboards, projects, templates, structure/access/team/reminder editors.
- `src/features/client`: client access, typed answers, autosave/conflicts, submissions and uploads.
- `src/features/review`: exact-revision review, comments, activity and approved exports.
- `src/features/settings`: AI assistance, analytics/shares/digests, billing, identity and sessions.
- `src/features/public`: landing and proposed pricing pages.
- `src/mocks`: browser MSW setup, request handlers and deterministic synthetic fixtures.
- `src/test`: Vitest + Testing Library tests using MSW's Node interceptor.
- `e2e`: real Edge browser scenarios using the same network mocks.
- `src/styles`: Tailwind/HeroUI imports, palette, typography, spacing and surface tokens.

`@/` resolves to `src/` in TypeScript and Vite. Strict TypeScript and React StrictMode remain enabled. Authentication forms use React Hook Form/Zod; product editors use typed local state, native constraints and shared domain validation. RTK Query owns server data; the auth slice keeps access tokens/identity only in memory. There is no persistent token storage. HeroUI v3 needs no v2-style provider. Native semantic fields integrate with React Hook Form; HeroUI supplies primary buttons. Route guards support UX and do not replace backend authorization.

The owner handles backend implementation manually. Frontend batches remain separate from original full-stack milestones. See [the authentication handoff](../docs/FRONTEND_BACKEND_HANDOFF.md) and [the product integration handoff](../docs/FRONTEND_PRODUCT_HANDOFF.md) for actual operations, DTOs, scenarios and unresolved backend decisions. Reload resets mock sessions, file bytes and fixture changes. Stay in one SPA tab for the owner → client → review → export demo.

## Product preview

Start at `/` or `/sign-in`. Sign in as the owner, open **Projects**, then **Lamar Dental website**. **Client access → Send / resend invite → Open client access** creates a synthetic invitation. Explicitly open it, fill an item, wait for autosave and submit. Return through the home brand and **Open workspace**; use **Review** to request changes or approve, then **Exports** to download an approved snapshot. ZIP, JSON and Markdown downloads contain synthetic content.

The gallery includes all ten supplied templates. Create Website, Web application and Mobile application projects; each copies an independent structure. Assignments and review/export permissions are separate. Members see assigned projects only. Owner preview never opens a live client session.

The development-only **Demo scenarios** disclosure supports empty/list failure, quota, read-only, grace, limit reached, AI/export failure, conflicts and expired client sessions. Normal restores write entitlement; full reload resets all mock state. File names containing `reject`, `virus` or `password` simulate rejection; `failed` simulates processing failure. Synthetic SMS verification uses `123456`. No actual AI provider, scanner, email, SMS or payment service is called.

The production PWA caches a fixed public allowlist only. Private pages, APIs, tokens, answers and files are never cached. Offline navigation shows a reconnect page; offline editing is not promised. `npm run test:pwa` builds production output and checks the worker/cache boundary using Edge on isolated port 5175. Mock browser testing uses port 5174.

## Setup references

Original foundation references checked 21 October 2026; FE01 additions checked 22 October 2026:

- [Vite](https://vite.dev/guide/): React/TypeScript integration and Node requirements.
- [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite): `@tailwindcss/vite` and CSS import.
- [HeroUI v3](https://heroui.com/en/docs/react/getting-started/quick-start): React 19+, Tailwind v4, styles after Tailwind.
- [React Router](https://reactrouter.com/start/data/installation): browser router and RouterProvider.
- [RTK Query](https://redux.js.org/toolkit/rtk-query/overview): API reducers and middleware.
- [MSW browser](https://mswjs.io/guides/integrations/browser) and [Node](https://mswjs.io/guides/integrations/node): shared request interception.
- [React Hook Form](https://react-hook-form.com/get-started): forms and schema resolvers.
- [Vitest](https://vitest.dev/guide/): test runner.
- [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files).

Direct dependency versions are resolved exactly in `package.json`; `package-lock.json` records the full dependency tree. Use `npm ci` to reproduce it.
