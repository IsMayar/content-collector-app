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
    clients/                    workspace customers, project contacts, schemas/types/API commands
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

## T12 contacts and owner preview

features/clients owns clientsApi typed query/command adapters, CustomerPanel (RHF/Zod list/create/versioned name edit), ProjectContactsPanel, clientSchema and customer/contact DTOs. Project types retain compatibility type re-exports only. No duplicate entity/transport/cache or extra navigation route. Existing project creation selects/creates the customer; project access hosts management.

features/projects owns previewApi, previewSchema, preview.types and PreviewPanel. The API envelope is {preview: ...}; a deliberate null-answer preview variant reuses ItemDefinition and the client TypedValue renderer without pretending an answer row exists. TypedValue preview mode never mounts UploadQueue. Fields are disabled, repeater rows are illustrative, section switching stays local, and there are no draft/AI/submission commands. The owner-only project tab and direct-tab boundary agree.

MSW uses the same HTTP paths/envelopes and the same default-enabled rule as real structure projection. Real contact save creates metadata only; existing invitation/revoke demonstrations remain explicitly mock-only, with disabled controls/explanation for real integration. No mocked production fallback. [Contracts, access rules, final verification and deferred workflows](../docs/T12_CLIENT_CONTACTS_AND_PREVIEW.md).


## T13 team and assignment integration

workspace/api/teamApi.ts owns typed team/entitlement queries; workspace/schemas/teamSchema.ts validates member and invitation lifecycle envelopes and invitation input. TeamPage reuses React Hook Form/Zod, shared modal/query/error UI and the existing RTK command transport. Project api/assignmentsApi.ts and schemas/assignmentSchema.ts own assignment reads and independent flag contracts; AssignmentsPanel handles loading, search, empty/error states and revocation. No extra HTTP client or unrelated feature relocation.

Team invitation acceptance keeps credentials in the existing memory-only action-token vault, refreshes /me, selects the returned workspace and links directly to its overview. Invitations reserve seats without staging undocumented assignments; owners assign members in the project Team tab after acceptance. Ownership transfer uses a stable idempotency key and refreshes live roles. Workspace identity changes clear agency/client caches; denied workspace requests trigger live identity reconciliation. Focus/reconnect revalidate active reads. Explicit bootstrap waits for ongoing identity refresh to avoid stale-role/cache races. Backend services remain authoritative; no server-push revocation claim.

Existing tests remain under tests/unit, tests/e2e, tests/integration/real-auth and tests/pwa; generated artifacts stay in .artifacts. [T13 exact contracts, files and final verification](../docs/T13_TEAM_COLLABORATION.md).

Final T13 evidence (30 October 2026): **97 unit tests**, **2 real HTTPS lifecycle tests with MSW disabled**, **75/75 responsive browser cases** and **1/1 production PWA case** passed. Strict TypeScript/build/lint/format pass. The full responsive rerun used a frozen frontend after correcting acceptance routing and identity/bootstrap ordering. Backend acceptance is recorded separately (657 tests); FE/PWA evidence does not prove production provider or deployment gates.


## T14 client-access and portal foundation

Client feature ownership is retained under features/client/{api,components,pages,schemas,store}. portalApi.ts composes the existing cookie-only RTK query; portalSchema.ts validates a foundation capability contract with null answers, canRespond=false and typed field settings. PortalFoundation displays sections/questions/required flags and disabled field previews, including static repeater definitions; it has no save, upload or submit action. The existing mock collection renderer remains a separate later-capability branch, never evidence that T15–T17 work on the real backend.

ClientAccessPage captures initial and hash-only fresh email links into component memory, removes the fragment with replacement navigation, and exchanges only after explicit user action. Project IDs in the nonsecret query remain available for fresh-link recovery. The existing one HTTP transport sends cookies and CSRF for client operations, never agency bearer tokens or agency refresh retries. clientAccessSlice contains only a blocked flag, no credentials or agency identity. Private 401s clear client caches and stop further reads until a successful new exchange; focus/reconnect recheck active data. Client queries use currentData, preventing the previous project's result from rendering while another ID is authorized. Read-only foundation screens wait for access revalidation before showing a cached request.

Project contacts expose safe accessInitializedAt metadata so eligible contacts can be distinguished from issued grants. Real owner invitation/revocation uses documented paths and stable invitation retry keys. DRAFT projects cannot send links; publication remains a separate lifecycle integration. A successful HTTP 204 is normalized to a success marker by useCommand, allowing real logout/revoke dialogs to complete. No token is put in Redux/browser persistence; PWA still caches only public assets. Detailed contracts, architecture, test evidence and file inventory are in docs/T14_CLIENT_ACCESS.md (project root).


## T15 Part 1 — persistent client drafts

The collection feature reuses T14 client session authorization for exact item GET/answer PUT routes. V13 adds project-shared mutable answers with contact attribution and independent answer versions. Existing project locks serialize writes, audit/state/version updates roll back together, and ProjectDraftVisibility drives portal/progress visibility without deleting hidden drafts. The existing client frontend feature adds server-confirmed serialized autosave, bounded retries, conflict comparison and volatile recovery; uploads/submissions remain deferred. T11 semantic changes to DRAFT collected items still fail closed pending revalidation/reopening. [Detailed contracts, feature trees, migration, file manifest, commands and final evidence](../docs/T15_CLIENT_DRAFTS.md). Original roadmap and T04–T06/T11/T22 gates remain independent.

## T16 real file fields

The established `features/client` feature owns real client collection; no duplicate `client-portal` feature is created. UploadQueue and TypedValue use the existing RTK Query command/read transport, with XHR only for signed object byte progress. Collection explicitly supplies live upload permission, field rules, metadata refresh, latest draft values and save-before-delete coordination. Only server-confirmed READY UUIDs enter the existing serialized autosave engine. Preview stays read-only. See [T16 report](../docs/T16_PRIVATE_ATTACHMENTS.md).
