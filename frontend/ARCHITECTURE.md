# Frontend architecture

The source now follows feature ownership. Pages compose feature components; feature APIs use the existing shared RTK Query transport and cache. The UI, HTTP routes, agency/client identity boundary and permissions are preserved.

```text
src/
  app/
    App.tsx                     Redux, feedback and router composition
    main.tsx                    StrictMode bootstrap, explicit development mocks, public PWA
    router/AppRouter.tsx        route definitions and lazy page loading
    store/store.ts              Redux store, cache/session listeners
  features/
    auth/
      api/authApi.ts
      components/LoginForm.tsx  sign-in orchestration using existing transport
      pages/LoginPage.tsx       page presentation; other account pages are separate
      schemas/loginSchema.ts
      schemas/authResponseSchemas.ts
      types/auth.types.ts
      store/                    in-memory identity, refresh and bootstrap
      utils/actionToken.ts      transient action-link token handling
    projects/
      api/projectsApi.ts        typed project queries sharing the resource cache
      components/ProjectCard.tsx
      components/ProjectTable.tsx
      pages/ProjectsPage.tsx
      pages/ProjectPage.tsx
      pages/CreateProjectPage.tsx
      schemas/projectSchema.ts
      types/project.types.ts
    workspace/                  onboarding, dashboard and workspace types
    templates/                  library/editor pages, preview components, template types
    structure-editor/           structure/item editors, schema and field definitions
    client/                     client pages, editors, upload helpers, schemas/types
    settings/                   workspace settings page composition
    billing/                    plan/subscription/usage pages and DTOs
    analytics/                  insights, project metrics, digest and status sharing
    reminders/                  reminder policy/delivery UI and DTOs
    ai/                         AI draft UI and DTOs
    review/                     review/activity/export components and DTO types
    public/                     public landing, pricing, help and legal pages
  shared/
    components/                 reusable fields, feedback, dialogs and route recovery
    hooks/                      typed Redux hooks, workspace and mutation hooks
    types/                      common HTTP, pagination and JSON primitives
    utils/                      shared domain rules, downloads, errors and safe destinations
  layouts/                      AgencyLayout, ClientLayout, AuthLayout, PublicLayout
  services/api/
    baseApi.ts                  shared agency base, retaining agencyApi reducer identity
    clientApi.ts                separate client base/identity
    baseQuery.ts                one CSRF/auth/refresh HTTP implementation
    resourceApi.ts              shared read/command endpoint cache
    resourceSchemas.ts          routes responses into feature-owned Zod schemas
  config/env.ts                 public build/runtime configuration; no secrets
  mocks/                        explicit MSW fixtures/handlers only
  styles/globals.css            single CSS entry preserving existing layer order
```

Keep pages, components, API adapters, schemas and types inside their owning feature. Shared code must actually be reused; do not add unused wrapper APIs or duplicate DTO definitions. ProjectCard extracts the existing compact project identity markup; the rest of its table stays ProjectTable. LoginPage uses LoginForm, while other account forms share AuthForm. No page redesign was needed to satisfy this structure.

The former src/api, src/components, src/lib and mixed-feature page modules are removed. Public DTO types are split by feature; fixture-only records are under mocks/types. Type-only cross-feature references do not create runtime coupling. The existing agencyApi/clientApi reducer identities remain unchanged so sessions, cache clearing and the HTTPS harness observe the same stores. Feature queries reuse the same RTK endpoints rather than creating a second transport or cache.

All unit/component tests are in tests/unit, with their shared setup there. Standalone suites remain tests/e2e, tests/pwa and tests/integration/real-auth. Unit tests are typechecked by tsconfig.app; browser/tooling TypeScript is checked by tsconfig.node. Configurations and index.html remain at the root. The @/ alias still resolves strictly to src. Generated logs/caches/traces stay under ignored .artifacts; dependencies and build output stay in ignored node_modules/dist.

Use scripts/Verify-Frontend.ps1 for typecheck, build, lint, formatting and unit checks; -Browser -Pwa adds both browser suites. Run suites serially on this machine. The real HTTPS runner imports the current source paths and is launched through the existing backend acceptance test. No application token or raw customer content is written to persistent browser storage, logs or version control.
