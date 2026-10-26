# Implementation status

Source: [MVP guide, Section 22](spec/Website_Content_Collector_MVP.md#22-sequential-implementation-plan). Updated 22 October 2026.

All tasks were initialized as Not started. T01–T03 are Complete. M0 is In progress; M1–M7 remain Not started.

T01 evidence: frontend/, backend/ and docs/ exist; root README documents purpose and required runtimes; all 10 docs/spec files match the supplied ZIP by SHA-256. No dependencies installed or application features implemented.

## Frontend-first plan — 22 October 2026

The owner implements the backend manually. Codex works only on frontend/ and relevant documentation. The original M0–M7/T01–T38 roadmap and all recorded progress below are preserved. Completing an FE batch does not complete corresponding backend tasks or full-stack acceptance criteria. T04 and later original tasks are not automatically advanced by this plan.

| Batch | Scope                                                           | Status                                 |
| ----- | --------------------------------------------------------------- | -------------------------------------- |
| FE01  | Architecture, design system, navigation, and authentication UI  | Complete (frontend only)               |
| FE02  | Workspace onboarding, dashboard, projects, and template gallery | Complete (frontend with HTTP mocks)    |
| FE03  | Project structure editor, team, access, and reminder settings   | Complete (frontend with HTTP mocks)    |
| FE04  | Client portal, typed answers, autosave, and upload experience   | Complete (frontend with HTTP mocks)    |
| FE05  | Agency review, comments, activity, and exports                  | Complete (frontend with HTTP mocks)    |
| FE06  | AI assistance UI, analytics, billing, and workspace settings    | Complete (frontend with HTTP mocks)    |
| FE07  | Responsive polish, accessibility, PWA, and frontend regression  | Complete (frontend verification scope) |

FE01–FE07 frontend implementation is complete within the development HTTP-mock scope. Backend code and the original full-stack roadmap remain preserved. This does not complete the production MVP or its backend/release gates.

### Reference-board screen rebuild — 23 October 2026

- Rebuilt page composition beyond the earlier theme pass: overview metric cards and recent-project table, attention panel, project table/filter tabs, three-step template/details/review wizard, separate template previews with section navigation, built-in/workspace template tabs, workspace logo and work-style setup, two-pane structure editor, semantic item table, right-side native settings dialog, repeater preview, and conditional-answer retention notice.
- Updated public landing/product preview, pricing comparison/FAQ, searchable help, explicitly draft legal pages, route-specific authentication illustrations and copy, field icons, compact workspace navigation, shared card/control spacing and phone layouts. Existing client collection, review, settings, billing, exports and reminder screens inherit the shared visual system and retain their API flows.
- PASS: final `npm run build` (including strict TypeScript), `npm run lint`, and `npm run format:check`.
- PASS: 42 unit/integration tests using `npx vitest run --maxWorkers=1 --pool=threads`. The initial default fork-worker run timed out before executing tests; the single-thread-pool rerun completed successfully.
- Browser verification: the final 30-case Edge run passed 27 cases and exposed drawer reverse-tab containment and phone table overflow. Both were fixed. A subsequent six-case rerun of keyboard sign-in/logout and wizard/drawer behavior across desktop 1440×1000, tablet 768×1024 and phone 360×800 passed all six. Thus every scenario has passing evidence, but there was not a subsequent clean all-30 run after these two final fixes.
- Passing journeys include all three project types, template preview, keyboard reorder, client draft/submission/review/export, uploads and explicit AI acceptance, public pages, registration/recovery/invitations, billing and query recovery. Added a regression for retaining wizard details on Back and native drawer Escape/focus restoration.
- Visual captures and scope details: [reference redesign evidence](verification/REFERENCE_REDESIGN.md). Corrected phone overflow evidence replaces the earlier failed capture. Source boards supplied detailed panels for 01–05 and a navigation map; no screen mockups for boards 06–14 were supplied. This is a substantial reference-based rebuild, not a measured pixel-perfect certification of every state. Real backend/provider integration and production release gates remain unverified. Backend and supplied specification files were not edited by this UI work.

### Earlier reference-board theme refresh — 22 October 2026 (superseded by screen rebuild)

- Updated the frontend visual system to follow the supplied AYAANTRIX Content Collector boards: blue C brand, compact white top bars, pale blue work canvas, light workspace sidebar with clear active navigation, blue primary actions, compact bordered cards, and reference-style split authentication screens with a product illustration panel. The public landing page now follows the boards' client-content message, product preview and collect/review/export summary. Existing route behavior and product workflows remain in place.
- PASS: `npm run build` (strict TypeScript and production Vite build), `npm run lint`, and `npm run format:check`.
- PASS: installed Microsoft Edge visual review at 1440×1000 and 390×844. Public landing, sign-in and owner dashboard rendered; mock sign-in reached the dashboard; first Tab reached the skip link with visible focus; phone document width remained 390px with no horizontal overflow on sign-in and dashboard.
- Screenshots: [public landing](verification/ui-refresh-public.png), [sign-in](verification/ui-refresh-sign-in.png), [owner dashboard](verification/ui-refresh-dashboard.png), [phone sign-in](verification/ui-refresh-phone.png), and [phone dashboard](verification/ui-refresh-dashboard-phone.png).
- This is a frontend visual update. It does not change supplied specifications, backend behavior, or full-stack milestone status. No automated test suite was rerun for this styling change.

### FE02–FE07 results — 22 October 2026

- FE02: freelancer/agency onboarding, owner/member dashboards, project creation and details, search/type/state/sort/pagination, lifecycle actions and dual submitted/approved counts. All ten supplied templates are available; project structures and published workspace-template versions are independent snapshots. New workspaces use clean usage/identity state and the selected timezone.
- FE03: section/item editing, enabled states, pointer and keyboard reordering, all field types, repeater field configuration, earlier-single-select visibility, structure-version conflicts, workspace template drafts/publishing, client contacts/invite/resend/revoke, read-only preview, team seats/invitations/assignments and separate reviewer/export flags. Reminder policies include timezone, pause, preview, eligibility and delivery history; client SMS consent/verification is synthetic.
- FE04: explicit fragment-token exchange, fresh-link requests, expired/revoked access recovery and an independent project-scoped client session. Typed editors include repeaters and conditional visibility, debounced autosave, local-input-preserving conflict recovery, unsaved-navigation protection, immutable submissions/withdrawal and client-visible comments. Uploads provide file/library/camera inputs, three concurrent transfers, size/type/quota feedback, progress, cancellation/retry, processing/rejection and original retention. Only READY selected files submit.
- FE05: exact-revision review/history, required change reasons, stale decision rejection, reopen/complete guards, internal/client comment separation, safe activity, approved-only immutable ZIP/JSON/Markdown export jobs, partial acknowledgement, expiry/fresh downloads and older-snapshot notices. Mock ZIPs contain valid manifests/Markdown and transferred synthetic file bytes.
- FE06: deterministic fact-based suggestions with explicit acceptance/version guards, normal writing during AI failures, usage/allowances, project friction metrics with 7-day windows/minimum samples, counts-only scoped shares/revocation/embed configuration, digest preferences/preview, identity/logo/sessions, proposed plans and mock hosted billing returns, grace/read-only/deletion workflows. Added public landing/pricing pages without invented testimonials.
- FE07: semantic responsive layouts, explicit field labels/descriptions, visible focus, keyboard reorder/navigation, native confirmation dialogs with Escape/focus restoration, reduced-motion styles, route splitting, recoverable query failures and removal of obsolete foundation navigation. Public/client pages remain available if agency session checking fails. The production manifest has SVG/192/512 icons; the worker caches only five fixed public assets and never private responses/navigation/content.
- PASS: strict TypeScript and production build; ESLint with zero warnings; Prettier; resolved dependency tree without invalid packages. Final initial main chunk is approximately 461 kB minified / 147 kB gzip, with product routes split. Production JavaScript was scanned and contains no demo credentials/access/invitation fixtures.
- PASS: 42 Vitest/Testing Library/HTTP tests. Includes original auth regressions, new-workspace isolation, assigned-member/tenant restrictions, independent project-type snapshots, draft/structure conflicts, visibility/validation, explicit client exchange, revocation/paused writes, internal-note privacy, immutable history, request changes/resubmission/stale review, valid approved-only exports, stale AI acceptance and counts-only share revocation.
- PASS: clean 27-case Edge/Playwright run across desktop 1440×1000, tablet 768×1024 and phone 360×800. Exercises auth/keyboard/focus/dialogs, all three project types, templates/reorder/settings, owner→client→review→ZIP handoff, real browser upload controls/READY processing, explicit AI acceptance, public pages, list failure/recovery, billing grace/mock return and read-only notices. Focused client/auth/handoff checks verified the final independent-session change; a phone helper timing race was fixed and its handoff rerun passed.
- PASS: production PWA browser test against the built output, verifying registration, install icons, no development label, stale-cache cleanup, exact public cache allowlist and honest offline private-route navigation. Test servers use isolated ports 5174/5175 and stop automatically.
- Browser testing found and fixed ambiguous wrapped labels, intercepted download navigation, scenario/toast overlap, native dependency/test type boundaries and obsolete route placeholders. Visually inspected desktop landing/dashboard/client and phone collection screenshots. Evidence is under [verification/FE02-FE07](verification/FE02-FE07/).
- Not performed: real backend/cookie/CORS/object-storage integration, PostgreSQL isolation/concurrency, actual scanning/HEIC decoding, AI/email/SMS/payment providers, physical-device camera/installation, screen-reader audit or Safari/Firefox. Mock behavior is not proof of production security, durable jobs, delivery, billing or analytics collection. No backend/full-stack milestone is advanced.
- [Product integration handoff](FRONTEND_PRODUCT_HANDOFF.md) records routes, operations/envelopes, concurrency, upload/export jobs, environment switches, reset/scenarios and contract decisions requiring backend agreement. The original 38 task rows, backend and all supplied specification files remain unchanged.

### Executed frontend plan

1. FE02: add typed domain contracts and independent template snapshots; stateful tenant-scoped MSW data; onboarding, dashboard/list, creation and template preview.
2. FE03: project workspace and versioned structure editor; team, assignments, client grants and reminders with permission/state checks.
3. FE04: separate client session/exchange, typed editors, versioned autosave/conflicts, uploads and immutable submission snapshots.
4. FE05: exact-revision review, comments/activity, completion/reopening and approved export jobs/download fixtures.
5. FE06: deterministic AI suggestions, defined analytics/shares, usage/billing/settings and public landing/pricing.
6. FE07: route audit, responsive/accessibility fixes, public-only PWA cache, code splitting, regression tests and final backend handoff.

Material assumptions: mock state is memory-only and resets on full reload; fixtures and real requests use one RTK Query path. Cross-tab concurrency is demonstrated with version conflicts through API tests and deterministic mock scenarios, not by persisting private data in browser storage. Any additional request/response fields or endpoints will be recorded in the handoff. Feature completion is recorded only after its checks run.

### FE01 verification — 22 October 2026

- Added public/authentication, agency and client layout foundations; responsive sidebar/mobile navigation, breadcrumbs, page headings, shared field/error controls, loading/empty/error/success panels, notifications and a native confirmation dialog. Design tokens retain the approved palette and define typography, spacing and surfaces.
- Added sign-in, sign-up, verification/resend, recovery, reset and team-invitation screens with React Hook Form/Zod. Includes pending/disabled states, password visibility, generic account recovery, explicit token submission and invalid/expired/consumed token feedback.
- Added runtime DTO schemas, configurable RTK Query HTTP transport, CSRF headers, memory-only access tokens, session bootstrap, in-tab/Web Locks refresh coordination, protected agency routes, membership/owner navigation, workspace selection, logout/cache clearing, cross-tab logout and safe internal return destinations. Signed-in destinations are clearly labeled placeholders; dashboard/project features remain FE02.
- Added explicitly enabled development MSW interception with separate synthetic owner/member/freelancer fixtures and failure scenarios. Real and mock modes use the same application endpoints. Production builds do not enable mocks. No token/browser-storage persistence, real email delivery or JWT/HttpOnly-cookie security is simulated.
- PASS: strict TypeScript checks and production build; build also passed with VITE_ENABLE_MOCKS=true and the resulting production JavaScript contained none of the fixture credentials/synthetic access values. A non-failing Vite warning reports the approximately 625 kB minified initial JS chunk; code splitting/performance refinement remains FE07.
- PASS: ESLint 10 with zero warnings; Prettier format check. Compatible direct dependency versions and complete npm lockfile are committed. npm reported zero vulnerabilities after the final dependency installation.
- PASS: 24 Vitest/Testing Library tests through the real RTK Query request path with MSW. Covers sign-in success/failure, client validation, generic recovery, protected redirects, safe destinations, logout/cache clearing, membership/owner restrictions, workspace switching, token expiry, server-session bootstrap, concurrent refresh, session-expiry cleanup, network errors and password reset.
- PASS: 12 Playwright scenarios in installed headless Microsoft Edge across desktop 1440×1000, tablet 768×1024 and phone 360×800. Covers keyboard skip link/field focus, visible password control, route focus, responsive overflow, native dialog focus/Escape restoration, sign-in/out, failure/recovery, expired/consumed links, registration, resend/verification, invitation sign-in round trip, member navigation and client layout.
- Visually inspected desktop sign-in/workspace and phone sign-in screenshots. Browser testing found and fixed a HeroUI `.field-error` style collision, cross-layout focus loss and tablet auth-grid overflow before the complete suite passed. Evidence: [desktop sign-in](verification/FE01/sign-in-desktop.png), [phone sign-in](verification/FE01/sign-in-phone.png), [workspace](verification/FE01/workspace-desktop.png).
- The in-app browser automation helper could not start; installed Edge/Playwright provided equivalent browser checks. Physical phones, screen readers, Firefox/Safari and real-backend authentication/cookie behavior were not tested. No backend or full-stack acceptance is claimed.
- [Frontend/backend handoff](FRONTEND_BACKEND_HANDOFF.md) records operations/shapes, cookie expectations, environment switches, mock accounts/limitations and the proposed resend endpoint missing from the original inventory. Mock sessions reset on full reload. The owner must implement/confirm backend contracts before real integration.
- All backend and supplied specification files remain unchanged. Original T01–T03 completion and T04–T38 statuses below are preserved. Verification servers stop automatically after the browser suite.

## T03 results — 21 October 2026

- Implemented Java 21/Spring Boot 4.1.1 from Spring Initializr, Maven Wrapper 3.3.4 with Maven 3.9.16, Web MVC, Security, Validation, JPA, PostgreSQL JDBC, Flyway and Actuator. Library versions come from Boot's parent/BOM; official references and resolved versions are recorded in `../backend/README.md`. The BOM supplies JUnit Jupiter 6.0.3 rather than forcing the guide's older JUnit 5 version.
- Added environment-driven datasource settings, dev/test profiles, ignored local `.env` initialization with a random password, placeholder example, and a project-isolated Compose database at loopback port 5433. Existing native PostgreSQL 16 was left untouched. Compose and Testcontainers use the same digest-pinned official PostgreSQL 18.6 Alpine image through public ECR.
- Flyway owns schema changes: V1 creates only an empty `collector` schema; history is in `public`. SQL auto-init is disabled; Hibernate uses `validate`, Flyway validates checksums, automatic baselining is off and clean is disabled. No feature entities/tables or authentication were implemented. Hibernate has no feature mappings to validate yet.
- Security exposes only GET `/actuator/health`, with exact status-only JSON, and denies all other requests with 403. Login/Basic authentication and generated users are absent; CSRF stays enabled. Actuator component details and probe group names are hidden/disabled for the minimal endpoint.
- PASS: wrapper execution on Java 21.0.11/Maven 3.9.16, backend/test compilation and executable JAR packaging. PASS: `./mvnw.cmd verify` — 3 tests, 0 failures, 0 errors, 0 skipped.
- PASS: disposable PostgreSQL 18.6 clean startup, V1 migration, Flyway validation, a second full startup against the same database, one unchanged successful history entry, zero pending migrations and preserved test-only probe data. Probe is confined to the disposable test database.
- PASS: security tests for anonymous health, blocked health children/other routes and blocked product requests even with a mock authenticated principal and valid CSRF token. Real HTTP checks ran on both integration-test startups.
- PASS: documented `spring-boot:run` dev command against fresh Compose database, live health HTTP 200 `{"status":"UP"}`, denied product and environment endpoints HTTP 403. Direct SQL inspection found one applied migration and no feature tables. Compose validation and Git exclusion of `.env` passed.
- Initial Docker Hub DNS/TLS/download failures were resolved by using Docker's official-image ECR mirror; no verification remains blocked by missing tools. A health-payload mismatch was fixed by disabling automatic probe groups, then the complete suite passed. Test runtime emits a non-failing Mockito dynamic-agent warning on Java 21.
- Verification backend and development database were stopped afterward; the named development volume and ignored local credentials are retained. The frontend and all supplied specifications remain unchanged. No later task was started.

## T04 results — 22 October 2026

Status: In progress — backend implementation.

### Implemented

- Added ApiException for application-level API errors.
- Added ApiProblemFactory using Spring ProblemDetail.
- Added RequestTraceFilter for request correlation IDs.
- Added RequestTrace for retrieving request trace IDs.
- Added GlobalExceptionHandler for centralized MVC exception handling.
- Added SecurityProblemHandler for standardized security errors.
- Updated SecurityConfiguration to use SecurityProblemHandler.
- Preserved deny-by-default security and public GET /actuator/health.
- Added security error response tests.
- Added ApiProblemFactory unit tests.
- Added backend GitHub Actions CI workflow.

### Verification

- PASS: Java 21 compilation.
- PASS: Maven clean verify.
- PASS: 7 tests, 0 failures, 0 errors, 0 skipped.
- PASS: Security configuration tests (3).
- PASS: API error factory tests (3).
- PASS: PostgreSQL 18.6 and Flyway migration validation.
- PASS: Executable Spring Boot JAR packaging.
- GitHub Actions CI: pending first remote run.

### Remaining Work

- Verify CSRF rejection response formatting.
- Verify malformed JSON and validation errors.
- Verify unsupported HTTP methods and media types.
- Verify missing-route handling.
- Verify request tracing behavior.
- Complete API transport conventions.
- Update root README with verification commands.
- Verify GitHub Actions CI remotely.

T04 remains In progress until these checks pass.

Next task after T04: M1 / T05.

## T02 results — 21 October 2026

- Implemented strict TypeScript and React StrictMode, Vite, Tailwind v4/HeroUI v3 style imports, RouterProvider and Redux Provider, separate empty agency/client RTK Query APIs with reusable transport, and the `@/` source alias.
- Added responsive semantic shell, Welcome/About placeholders, missing-page fallback, skip link, active navigation, visible focus and main-content focus after route changes. No authentication, product endpoints or product features were implemented.
- Official Vite, Tailwind, HeroUI, React Router and RTK Query setup references were checked; links are in `../frontend/README.md`. Node 24.3.0/npm 11.4.2 meet installed Vite 8.3.5 requirements. Direct dependency versions are pinned; `frontend/package-lock.json` records the resolved tree. HeroUI 3.2.6, React 19.3.1, Tailwind 4.3.3 and React Router 8.5.0 installed without peer conflicts. npm reported zero vulnerabilities.
- PASS: `npm run build`, including `npm run typecheck` (`tsc -b --pretty false`); production build generated successfully. PASS: `npm ls --depth=0` with no invalid dependencies.
- PASS: production preview in the in-app browser at 1440×900 and 360×800; content and navigation wrap with no horizontal overflow. Mobile lower content and footer were inspected by scrolling.
- PASS: Tab reaches visible skip link; Enter focuses main; next Tab reaches HeroUI button with visible outline. Space/Enter activate the button, Shift+Tab reaches header links, and Enter navigates between pages. Active link and document title update; route changes focus main. The same button keyboard flow passed at mobile width.
- PASS: direct `/about` reload and unknown-route recovery. Browser console inspection returned no application warnings or errors. Desktop evidence: [T02-desktop.png](T02-desktop.png).
- Limits: browser checks used desktop-browser viewport emulation; no physical mobile device or screen-reader testing was performed. No backend integration checks apply to this task.
- Git was initialized because the project had no repository. T02 and the resolved lockfile are included in the initial project commit; generated dependencies/build output are ignored. Original specification files remain unchanged.
- Windows startup recovery: stopped the verification preview process after it locked a native Lightning CSS dependency during a user `npm ci`. Restored all 152 packages using the existing lockfile; `npm run build` (including strict TypeScript) passed again, with zero npm vulnerabilities. Verified `npm run dev` starts on port 5173, then stopped that test server to release native file locks. README instructions now explain normal starts and stop on failed installation.

Complete tasks in order unless their dependency is explicitly independent. Each task should end with a working, reviewable change. Keep production provider credentials disabled until its integration stage. Suggested task numbers below are a build sequence, not a fixed calendar estimate.

### Milestone M0 Foundation

Milestone status: In progress

| Task | Deliverable                                            | Acceptance                                                      | Status   |
| ---- | ------------------------------------------------------ | --------------------------------------------------------------- | -------- |
| T01  | Repository with frontend, backend and docs directories | README identifies supported runtimes and project purpose        | Complete |
| T02  | React TS, Tailwind v4 and HeroUI v3 shell              | Production frontend build passes and keyboard navigation works  | Complete |
| T03  | Spring Boot, PostgreSQL, Flyway and health             | Backend starts on a clean database; migration validation passes | Complete |

| T04 | Error format, API transport and CI | Frontend and backend checks run with pinned dependencies | In progress |

### Milestone M1 Identity and tenant foundation

Milestone status: Not started

| Task | Deliverable                                     | Acceptance                                                     | Status      |
| ---- | ----------------------------------------------- | -------------------------------------------------------------- | ----------- |
| T05  | Account registration, verification and recovery | Purpose-bound single-use tokens and generic recovery responses | Not started |
| T06  | JWT access, refresh rotation, logout and CSRF   | Expiry, reuse and concurrent refresh tests pass                | Not started |
| T07  | Workspace owner, membership and plan seed       | Two tenants cannot access each other's resources               | Not started |
| T08  | Agency layout and session lifecycle             | Sign-in, workspace switch and cache clearing work              | Not started |

### Milestone M2 Projects templates and team

Milestone status: Not started

| Task | Deliverable                                  | Acceptance                                          | Status      |
| ---- | -------------------------------------------- | --------------------------------------------------- | ----------- |
| T09  | Template JSON validator and catalog seed     | All ten built-ins validate                          | Not started |
| T10  | Project creation for all three types         | Template snapshot remains independent               | Not started |
| T11  | Section and item editor and reorder          | Keyboard reorder and structure conflicts work       | Not started |
| T12  | Client contacts and read-only client preview | Preview exposes no live client session              | Not started |
| T13  | Team invitations and project assignments     | Seat reservation and reviewer/export flags enforced | Not started |

### Milestone M3 Client collection

Milestone status: Not started

| Task | Deliverable                                            | Acceptance                                             | Status      |
| ---- | ------------------------------------------------------ | ------------------------------------------------------ | ----------- |
| T14  | Invitation email, fragment exchange and client session | A passive GET cannot consume access                    | Not started |
| T15  | Typed client item editors and repeaters                | Server and browser enforce the same schema semantics   | Not started |
| T16  | Autosave and conflict UI                               | Two-tab edits produce a safe conflict                  | Not started |
| T17  | Submission versions and withdraw                       | Immutable revision and exact asset references recorded | Not started |

### Milestone M4 Files review and exports

Milestone status: Not started

| Task | Deliverable                                 | Acceptance                                                   | Status      |
| ---- | ------------------------------------------- | ------------------------------------------------------------ | ----------- |
| T18  | Private upload reservations and quota       | Concurrent reservations remain within allowance              | Not started |
| T19  | Scanner, canonical copy and image variants  | Unsafe staging bytes never become public READY content       | Not started |
| T20  | Phone upload queue and original option      | Real-device photo and error journeys pass                    | Not started |
| T21  | Comments and review decisions               | Internal comments never reach clients; decision race handled | Not started |
| T22  | Project completion, reopening and archive   | Progress and lifecycle guards use the same evaluator         | Not started |
| T23  | Immutable approved export manifest and jobs | Partial exports labeled; all three formats match snapshots   | Not started |

### Milestone M5 Assistance and reminders

Milestone status: Not started

| Task | Deliverable                                | Acceptance                                           | Status      |
| ---- | ------------------------------------------ | ---------------------------------------------------- | ----------- |
| T24  | AI adapter, allowance reservation and job  | Provider failures preserve ordinary writing          | Not started |
| T25  | Client suggestion preview and acceptance   | No automatic submission or overwriting newer answers | Not started |
| T26  | Reminder policy, outbox and email delivery | No chase when all remaining work is agency review    | Not started |
| T27  | SMS consent, verification and suppression  | STOP and quiet-window sandbox cases pass             | Not started |
| T28  | Provider unknown-outcome reconciliation    | No blind retry of potentially sent messages          | Not started |

### Milestone M6 Reporting commercial readiness and visibility

Milestone status: Not started

| Task | Deliverable                                    | Acceptance                                                | Status      |
| ---- | ---------------------------------------------- | --------------------------------------------------------- | ----------- |
| T29  | Server activity and minimal browser analytics  | No raw answers or tokens in events                        | Not started |
| T30  | Friction views and sample safeguards           | Incomplete observation windows are not called abandonment | Not started |
| T31  | Owner digest and scoped status share/embed     | Token cannot reach content or file endpoints              | Not started |
| T32  | Hosted checkout, webhook processing and portal | Sandbox subscription is source of entitlements            | Not started |
| T33  | Usage UI, trial, grace and read-only states    | Limits are disclosed and enforced server-side             | Not started |

### Milestone M7 Public MVP release

Milestone status: Not started

| Task | Deliverable                                              | Acceptance                                                     | Status      |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------- | ----------- |
| T34  | PWA manifest, public-only cache and mobile polish        | No cached private content after logout                         | Not started |
| T35  | Rate limits, accessibility and full isolation regression | A01-A31 pass in staging                                        | Not started |
| T36  | Backups, restoration and operational runbook             | A32 demonstrated                                               | Not started |
| T37  | Real-device, performance and provider launch checks      | Documented targets measured and failure handling verified      | Not started |
| T38  | First pilot onboarding and release review                | Public MVP checklist complete; no unsupported product promises | Not started |

MVP completion means M0 through M7 are implemented and verified. It is reasonable to invite controlled email-only development testers after M4, but do not call that the full feature-complete MVP described here.

## Reference boards 06–10 refresh — 2026-10-23

Implemented the team/member and client-access tables and invitation drawers; ownership transfer; client invitation, checklist home, files/feedback navigation and editor/comments layout; explicit AI draft comparison; review queue, exact-revision review and revision comparison; project file gallery/list, scoped uploads/downloads and file detail drawer; two-step section-selective export configuration/history; completion/archive screen. Shared modal focus handling, responsive layouts and keyboard focus retained.

Verification: production build and strict TypeScript passed; ESLint passed; 45 Vitest tests passed. Full 33-case browser run passed 30 cases and exposed an ambiguous new-test locator. Focused reruns then exposed and fixed a stale agency asset list after processing. Final 9 workflow cases passed at desktop 1440×1000, tablet 768×1024 and phone 360×800, covering draft→review→export, uploads/AI acceptance, and team invitation→agency upload→download→completion. This was not a final clean rerun of all 33 cases. See `verification/BOARDS_06_10.md`.

This remains frontend/mock verification. Backend files and supplied specifications were preserved. New mock contract extensions and unavailable reference metadata are recorded in `FRONTEND_BACKEND_HANDOFF.md`; no new full-stack milestone is marked complete.


## Reference boards 11–14 refresh — 2026-10-24

Updated reminder policy/cadence/preview/delivery views; analytics/friction/counts sharing; daily digest; workspace/account/session settings; billing/usage/subscription views; client SMS and conflict comparison; shared recovery/loading/offline/install styling. Frontend mock profile/password commands and visibility-aware analytics section summaries were added. This extends the FE03/FE04/FE06/FE07 UI work without advancing full-stack M0–M7 acceptance.

Verification: strict TypeScript/production build, ESLint and Prettier passed; 47 unit tests passed. Complete 36-case browser run passed across desktop/tablet/phone; after the final analytics loading correction, 6 targeted cases passed across those sizes. Production PWA cache-isolation/offline test passed on 2026-10-24 after fixing its outdated landing selector. Evidence and remaining visual/API limits: `verification/BOARDS_11_14.md`, with 27 screenshots. No 100% pixel-match or live backend completion is claimed.


## Screen coverage and navigation audit — 2026-10-25

Audited all 76 reference panels: 53 have implemented frontend capability and 23 are partial, with exact missing elements and route destinations listed in `SCREEN_COVERAGE_AUDIT.md`. All 14 board groups are represented; this count does not certify exact visual matching or live backend readiness.

Fixed member project Analytics discoverability; blank unknown/disallowed project tabs; unknown settings/billing views; invalid-workspace recovery; mobile menu closing after navigation; and client Checklist active state while editing. Preserved permission checks and pre-existing backend work.

Verification passed: production build/strict TypeScript, ESLint, formatting and 47 unit tests. Six new navigation browser cases passed across desktop/tablet/phone. Nine targeted keyboard, client→review→export and administration regression cases also passed at those sizes. The original full-stack milestones remain unchanged.


## Settings navigation and template flow polish — 2026-10-26

Confirmed the removed sidebar Billing & usage entry and Settings Billing tab target the same BillingPage and workspace subscription/usage data. Billing/Usage stay available within Settings navigation; existing billing URLs remain valid and Settings stays highlighted on them.

Template library cards now use aligned Preview and primary Use template buttons. A preselected template from either the card or preview opens Project details directly, with its title/type/version shown. Ordinary Create project still starts with template selection. Explicit Change template preserves entered details; an unavailable preselected template provides recovery instead of permitting creation without a template.

Verification passed: production build/strict TypeScript, ESLint, Prettier and 9 browser cases across desktop 1440×1000, tablet 768×1024 and phone 360×800. New regression creates WEBSITE/WEB_APP/MOBILE_APP projects and checks the submitted templateVersionId; existing wizard and billing grace/read-only recovery cases also passed. Desktop template cards and phone details screenshots were visually reviewed, with no horizontal overflow in tested journeys. Evidence: `verification/template-flow-*.png`. Backend changes and supplied specifications preserved.


## Auth, customer, invitation and Insights polish — 2026-10-26

Replaced all six agency authentication layouts with the supplied teal welcome-pane / white form-pane design. Kept existing forms, validation, verification/recovery/invitation flows and keyboard entry. Removed directional action glyphs and arrow-shaped icons throughout the UI; reorder controls use text. Projects and Templates remain distinct live-work versus reusable-structure areas, with clearer descriptions and the existing direct Use template → project details behavior preserved.

Project details now show Add a new customer and its fields on the left, Select an existing customer on the right; mobile stacks them. Selection controls required/disabled fields while preserving typed values. Team invitation received corrected search sizing/focus, selected-project count, bounded project cards, empty results and a separate permissions panel. Insights now shows actual loaded-project summary counts, a default selected project's analytics and clear project switching/empty states.

Verification: strict TypeScript/production build, ESLint, Prettier, 47 unit tests and the complete 57-case browser suite passed across desktop/tablet/phone. An initial thread worker startup timeout was resolved by an isolated one-fork unit run. After four final visual icon substitutions, build/lint/format and the production PWA cache/offline test passed again (1 case). No new backend or full-stack milestone acceptance is claimed. Evidence: `verification/PRODUCT_POLISH_2026_10_26.md` and 27 `product-polish-*.png` screenshots.


## Auth brand-color alignment — 2026-10-26

Retained the new split auth layout and aligned all six auth pages to the dashboard's shared navy/blue/background/muted/border tokens. Removed teal/green styling and yellow/pink decorative accents; replaced them with blue/cyan tints. Production build/strict TypeScript passed. Three responsive browser cases passed, each visiting all six auth routes at desktop/tablet/phone widths. Desktop sign-in render inspected; evidence: `verification/auth-brand-desktop.png` and `verification/auth-brand-phone.png`.
