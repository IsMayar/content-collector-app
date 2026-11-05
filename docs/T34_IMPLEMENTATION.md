# T34 — PWA manifest, public-only cache and mobile polish

Section 22 places T34 in **M7 Public MVP release**. Its acceptance criterion is “No cached private content after logout” (A31 in Section 21). The existing production frontend, manifest, icons and session flow provide the foundation. Section 8 limits offline support to public static assets and keeping unsent text in the open page. Full offline collection and background uploads are outside scope.

## Implementation

- The production manifest identifies Website Content Collector as a standalone app starting at the public home page. The HTML now links the existing 192 px touch icon.
- The worker precaches five fixed public assets. It fetches them without credentials and rejects redirects, unexpected media types, private or no-store responses, and responses that vary on credentials. It reads assets only from its current versioned cache. Requests with authorization headers bypass asset cache lookup.
- Navigation always goes to the network with HTTP cache bypass, including navigation to allowlisted paths. On network failure the worker serves the static offline screen. API responses, private routes, files, downloads, drafts, AI and billing data never enter the worker cache.
- Installation completes the public cache before activation. The replacement worker removes older Collector caches and claims open pages without reloading them. Registration bypasses the HTTP cache for worker update checks. Sign-out clears in-memory API state and requests cleanup of legacy private Collector caches.
- The offline screen offers a retry for the current page and a route to public home. Install and connection buttons have 44 px minimum touch targets, and notice text wraps on narrow screens. Keyboard dismissal and status announcements support the existing install flow.

## Verification and release gates

- All 30 affected frontend auth tests passed. Strict TypeScript, one successful production build and changed-file lint and formatting checks passed.
- Both production Edge PWA checks passed. They exercised manifest metadata, cleanup of an old cache at activation, isolation from a conflicting entry in another cache, sign-out against a synthetic API session, offline private reopening and failed offline API retrieval. The mobile check used a 320 px viewport, a simulated install event, keyboard dismissal and touch target measurements.
- Backend and unrelated responsive/provider suites were skipped. Physical iOS and Android installation, native upload checks and a deployed worker upgrade remain release checks. T34 passes local A31 acceptance. M7 is In progress, and M6 remains In progress pending actual Stripe sandbox acceptance.

## Changed files

- `frontend/index.html`, `frontend/public/sw.js`, `frontend/public/offline.html`
- `frontend/src/app/main.tsx`, `frontend/src/app/store/store.ts`, `frontend/src/features/auth/store/session.ts`
- `frontend/src/shared/components/ConnectionStatus.tsx`, `frontend/src/styles/administration.css`
- `frontend/tests/pwa/production.spec.ts`, `docs/IMPLEMENTATION_STATUS.md`, this report
