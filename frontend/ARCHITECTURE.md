# Frontend organization

The application is organized by product feature. Shared transport, layouts and visual primitives have a single home; browser test tools and generated output live outside application source.

```text
frontend/
  src/
    app/                  router, Redux store, hooks and providers
    api/                  contracts, runtime schemas, shared transport and RTK Query
    components/           reusable layouts, fields, dialogs, feedback and navigation
    features/
      auth/               account forms, session state and agency bootstrap
      client/             private client portal and content editing
      foundation/         route recovery and legacy-bookmark compatibility
      projects/           project wizard, templates, structure, access and files
      public/             landing, help, pricing and legal reading pages
      review/             revisions, comments, activity and exports
      settings/           workspace/team/account, reminders, analytics and billing
    lib/                  shared domain rules, downloads, errors and return destinations
    mocks/                explicit development/test MSW handlers and synthetic fixtures
    styles/               global tokens, framework imports and product styles
    test/                 Vitest/Testing Library tests and shared setup
  tests/
    e2e/                  mock-backed browser journeys at desktop/tablet/phone widths
    pwa/                  production service-worker and public-cache acceptance
    integration/real-auth/ real HTTPS harness launched by backend acceptance tests
  scripts/                fail-fast PowerShell verification
  public/                 static public assets, manifest and service worker
  .artifacts/             ignored logs, compiler caches and browser traces/results
  dist/                   ignored production build
  node_modules/           ignored installed dependencies
```

Keep feature UI and its state with the owning feature. Promote a component into components only when it is shared. Keep API contracts/validation and shared HTTP behavior in api, and business rules independent of rendering in lib. Do not copy mocks into production features or add a second transport for backend integration. Preserve separate agency/client identities, in-memory tokens and public-only PWA caching.

Unit/component tests remain in src/test so their existing setup and source aliases stay consistent. All standalone browser suites are grouped under tests. Both Playwright configurations use explicit test/output directories; TypeScript build information is in .artifacts/cache. The HTTPS harness resolves Vite relative to the frontend root regardless of its deeper test directory.

Required root configuration files stay at the root where tools discover them. package-lock.json is required for npm ci. .gitignore and .prettierrc.json are active project configuration, not disposable files. Local environment files remain ignored. Do not place new log files, screenshots or traces at the root; use .artifacts. Verify-Frontend.ps1 writes current check logs into .artifacts/logs/verification and stops at the first failure.

This organization change does not redesign pages, change routes or implement T12/T13. Backend T11 contracts and remaining submitted-content reopening integration are documented in ../docs/T11_STRUCTURE_EDITOR.md.
