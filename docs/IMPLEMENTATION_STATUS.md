# Implementation status

Source: [MVP guide, Section 22](spec/Website_Content_Collector_MVP.md#22-sequential-implementation-plan). Updated 5 November 2026.

All tasks were initialized as Not started. T01–T03 are Complete. M0/T04 remain In progress pending hosted CI. T07 is Complete for workspace foundation/live membership/onboarding acceptance. M1/T05 and T06 remain In progress; T08 is Complete; M2 and M3 are In progress; M4 is In progress; M5, M6 and M7 are In progress.

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

Status: In progress — local T04 checks passed; remote CI pending.

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

### Part 5 — backend error handling and tracing — 26 October 2026

- Completed centralized MVC handling through Spring's `ResponseEntityExceptionHandler` and the existing `ApiProblemFactory`: application errors, body validation, malformed JSON, missing/invalid parameters, 404, 405, 406, 415 and unexpected 500. Responses use `application/problem+json` and the agreed fields; validation entries use `fieldPath`/safe `message`. Framework status/protocol headers are retained. Unexpected failures omit raw exception messages, stack traces, SQL and credentials from responses and application error logs.
- Request IDs are generated or accepted from exactly one constrained `X-Request-ID` header (1–64 ASCII letters/digits/underscore/hyphen). Invalid/oversized/ambiguous values are replaced. IDs remain stable in the request, response header, error body and logging context. Normal, exceptional, async and error filter dispatches have isolated coverage; previous MDC context is restored.
- Preserved exact GET `/actuator/health` access and deny-by-default security. Anonymous/authenticated denied requests, unknown routes and missing/invalid CSRF tokens return standardized 403 problems. CSRF remains enabled. Isolated MVC fixtures verify standardized 404 after MVC dispatch without adding production routes or weakening security.
- PASS: `backend\mvnw.cmd clean verify` on Java 21.0.11 / Spring Boot 4.1.1 — **32 tests, 0 failures, 0 errors, 0 skipped**. Breakdown: factory 3; MVC exceptions 11; tracing 11 (including six invalid-ID inputs); security 6; PostgreSQL integration 1. No dependency version changes.
- PASS: Docker Desktop engine available; disposable PostgreSQL 18.6 clean startup, Flyway migration/checksum validation, second full startup, preserved probe data, unchanged single migration and no pending migrations. Real HTTP health/access checks passed on both startups. Executable Spring Boot JAR built. No test was disabled or skipped.
- Documented error format, trace policy and exact verification/diagnostic commands in `backend/README.md`. Frontend, original specifications, migrations and the existing CI workflow were not changed. This scoped backend request supersedes the earlier frontend-only restriction for this work only. No T05+ functionality was implemented.
- Environment: Docker was initially stopped; starting the installed Docker Desktop restored the engine and full verification succeeded. Existing non-failing Mockito/Java dynamic-agent warnings remain. Remote CI has not been run/verified by this task.

### Part 6 - transport, CI and final documentation - 26 October 2026

- Reviewed Sections 1-10, 19, 21-23 and existing frontend/backend contracts. Retained `/api/v1/`, JSON/problem JSON, same-origin `/api` proxying, cookie credentials, agency-only memory bearer headers and the current deny-by-default boundary. No CORS allowlist was necessary; a regression confirms untrusted cross-origin preflight remains denied.
- Aligned the backend's session CSRF header with frontend `X-XSRF-TOKEN` while retaining token/session and BREACH protection. No CSRF endpoint, authentication/JWT or T05+ functionality was added. Unknown product routes and `/api/v1/auth/csrf` still return standard 403 problems.
- Minimal shared frontend transport fixes: explicit JSON/problem JSON Accept default, case-normalized methods before CSRF checks, typed response metadata for request-ID headers, and runtime-checked problem fields/field-error arrays with authoritative HTTP status. Screens, layouts, design components, mock product features and original specifications were untouched. No dependencies or lockfiles changed.
- PASS: `npm ci` installed 411 packages from the committed lockfile with zero reported vulnerabilities. Node 24.3.0/npm 11.4.2. Stopped the existing project Vite process first to release the Windows native dependency lock.
- PASS: final `npm run build` (strict TypeScript and production Vite build), `npm run lint`, `npm run format:check`; **68 frontend tests passed, no failures/skips**, using `npm test -- --maxWorkers=1 --pool=threads`. New transport coverage comprises 21 cases: error statuses 400/401/403/404/405/409/415/422/429/500, success 200/201/202/204, headers/JSON/cookies, agency/client separation, denied CSRF acquisition, timeout, network failure, non-JSON gateway failure and malformed envelopes. Initial TypeScript failures in the new metadata typing were fixed; final build passed without changing endpoints or removing tests.
- PASS: `backend\mvnw.cmd clean verify` - **36 tests, 0 failures, 0 errors, 0 skipped** (factory 3, MVC 13, tracing 11, security 8, PostgreSQL integration 1). Real PostgreSQL 18.6/Flyway migration and validation, two application startups/restart preservation, real HTTP health/security and executable JAR packaging passed. Added test-only 401/422 application-status coverage; body-binding errors remain 400 and semantic 422 behavior is reserved for feature tasks.
- PASS: actual Vite-to-backend proxy with mocks disabled on temporary local ports: direct health 200 UP, `/api/v1/auth/csrf` and unknown API path 403 `application/problem+json`; header `X-Request-ID` matched body `traceId`. The first PowerShell assertion misread a byte-array response; explicit UTF-8 decoding confirmed the contract. This proves closed-foundation transport, not real authentication.
- Updated the existing backend workflow (previously untracked), added the missing frontend workflow, and pinned maintained official checkout v7.0.1/setup-java v6.1.0/setup-node v7.1.0 release commits. Java 21/Maven Wrapper, Docker check, `clean verify`; Node 24.3.0/`npm ci`, build/lint/format/all unit-integration tests. Both use dependency caches, read-only permissions, push/PR/manual triggers, no source credentials and bounded execution. PASS: both workflows validated by actionlint 1.7.12. No frontend workflow existed to duplicate.
- Updated root/backend READMEs and frontend/backend handoff with commands, proxy and security boundaries, exact results and CI limits. Repaired mixed encoding in the previous Part 5 text without rewriting historical evidence or the roadmap.

- Temporary proxy/backend verification processes and the database started for the smoke check were stopped without deleting data. The previously running frontend mock server was restored at `http://127.0.0.1:5173/`.

### Remaining Work

- **Remote CI only:** `git remote -v` is empty. No repository/run can be identified or inspected. Configure the intended remote and push these commits; then verify the actual Backend CI and Frontend CI runs. No remote success is claimed.

T04 remains **In progress** pending remote CI evidence, preserving the previous completion gate. M0 remains **In progress** (T01-T03 Complete, T04 In progress). M1 and T05 remain **Not started**. Local transport/error/regression/documentation work is complete; no task beyond T04 was started.

Next task after T04: M1 / T05.

## T05 Part 1 - account database and secure identity foundation - 26 October 2026

Status: **In progress**. The explicit T05 Part 1 backend request authorizes this work while T04's hosted CI gate remains pending; it does not mark T04 or M0 Complete.

- Added `V2__create_identity_schema.sql` without changing V1 or supplied references. Only `collector.users` and the account subset of `collector.access_tokens` exist: UUID primary keys, canonical unique email, prefixed password hash, display name, verification time/state, account optimistic version, purpose-bound unique SHA-256 digests, foreign key, lifecycle timestamps/checks and account-purpose/active-expiry indexes. Names/purposes use the reference `VERIFY_EMAIL`/`RESET_PASSWORD`. Workspace/team/project/billing/session objects were not added.
- Added `UserAccount`/`AccountToken`, `AccountState`/`TokenPurpose`, repositories, `EmailAddresses`, `SecureAccountTokens` and `PasswordConfiguration`. Email normalization is locale-independent, missing values are safely rejected, entity Bean Validation covers format, and the database requires canonical lowercase email. Repositories provide normalized-email existence/lookup, ID/save, digest-and-purpose lookup, user/purpose listing and conditional transactional consume/revoke/purpose-scoped invalidation.
- Passwords use the specification's prefixed Argon2id, 19,456 KiB/two iterations/parallelism one, with random salt. This follows Section 8.1 over the task's BCrypt fallback. Spring's implementation requires Bouncy Castle; Boot's BOM does not manage it, so the sole additional dependency is explicitly pinned `bcprov-jdk18on:1.85`, matching Spring Security 7.1.1's version catalog. All existing BOM-managed versions remain unchanged. Deployment benchmarking and password request policy/rate limits remain later work.
- SecureRandom generates 256-bit URL-safe unpadded raw tokens; storage uses lowercase 64-character SHA-256 digests only. Verification expiry is 24 hours and reset expiry 30 minutes. Informational validity checks include purpose, issue/expiry time, consumption and revocation. Authoritative database consumption has a single winner under concurrency and joins the caller's transaction; rollback restores usability. Full verification/reset/reissuance workflows are not implemented.
- Disabled Hibernate SQL/bind/extract/vendor-error diagnostics that can echo hash values during constraint failures; a captured-output regression checks hashes/digests are absent. No raw password/token logging, production credentials, public endpoints, email delivery, JWT, login, refresh sessions, frontend changes or T06+ features were introduced. HTTP security and CSRF tests/configuration remain intact.
- **PASS:** final `backend\mvnw.cmd clean verify` on Java 21.0.11 / Spring Boot 4.1.1: **71 tests, 0 failures, 0 errors, 0 skipped**. All previous 36 tests remain, plus 35 identity tests: PostgreSQL persistence/constraints/concurrency/rollback/upgrade 13, normalization 8, encoder 4, token generation/digest 7, entity purpose/expiry/secret guards 3. Executable Spring Boot JAR built.
- **PASS:** disposable PostgreSQL 18.6 clean V1/V2 migration, V1-to-V2 upgrade with preserved pre-existing probe data, Flyway checksum validation/no pending migrations, Hibernate validation of both entities, and original full-application restart/data/health/security test. Its two schema assertions now expect two identity tables and two migrations; no original test was removed/disabled or security assertion weakened. The first run had one incorrect test exception-cause assertion; it was corrected to match the directly thrown validation exception, and the full suite then passed.
- Frontend and specification files are unchanged. No new frontend run is claimed; existing 68-test T04 evidence is retained. Hosted GitHub Actions still has no configured remote/run evidence and is **pending**.

Created files (paths relative to project root):

- `backend/src/main/resources/db/migration/V2__create_identity_schema.sql`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/AccountState.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/TokenPurpose.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/UserAccount.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/AccountToken.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/repository/UserAccountRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/repository/AccountTokenRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/security/EmailAddresses.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/security/PasswordConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/security/SecureAccountTokens.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/entity/AccountTokenTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/security/EmailAddressesTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/security/PasswordConfigurationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/security/SecureAccountTokensTests.java`

Modified files:

- `backend/pom.xml` - required Argon2 provider only.
- `backend/src/main/resources/application.properties` - sensitive ORM diagnostic suppression.
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java` - current table/migration counts only.
- `backend/README.md` - identity schema/utilities, dependency rationale, commands, results and boundaries.
- `docs/IMPLEMENTATION_STATUS.md` - this evidence and T05/M1 progress.

Remaining T05: transactional account registration/verification/recovery services and HTTP contracts, request/password policy, generic anti-enumeration responses, disabled-account/email-change policy, purpose-bound reissue/invalidation orchestration, provider-fake delivery, rate limiting and workflow acceptance tests. Token consumption/account mutation must remain atomic. Session revocation integration must be added when session infrastructure exists; no full account recovery or authentication is claimed. No local tool blocker remains. T04/M0 remain In progress for hosted CI, T05/M1 In progress, and T06+ Not started.

## T05 Part 2 - registration API and email verification - 26 October 2026

Status: **In progress** for T05/M1. This part implements registration and verification without password recovery, login, JWT, refresh sessions, workspace features or frontend changes. T04/M0 remain In progress for hosted CI.

- Implemented exact GET `/api/v1/auth/csrf`, POST `/api/v1/auth/register` and POST `/api/v1/auth/verify-email`, matching existing frontend DTOs. Registration returns generic 202 `{message}` for new/duplicate/active/disabled addresses; verification returns 200 `{verified:true}` without authentication. Exact method/path security rules preserve all unrelated denials and CSRF. The session cookie is anti-CSRF state only. A real token exchange/header/session is exercised by MockMvc tests, not only a security test helper.
- Added DTO validation (email <=254, display name 2-100 matching the frontend, password 12-128/untrimmed with 512-byte safety cap; no composition rules), transactional registration, database-unique race handling, and transactional account-locked verification. Existing Argon2id/token utilities are reused. Verification checks purpose, account state/email, expiry and revocation, then conditionally consumes and updates account together. Failure rolls back both; concurrent verification has one winner. Invalid DTOs use standard 400 problems, invalid links `TOKEN_INVALID` 400, expired/consumed `TOKEN_EXPIRED`/`TOKEN_CONSUMED` 410 (existing frontend guidance), and shared rate limits return 429 `RATE_LIMITED` with `Retry-After: 60`. Trace headers and bodies match.
- **Additive V3:** `V3__add_account_delivery_outbox.sql` adds only account `outbox_jobs` and `account_request_limits`. V1/V2 are unchanged. Existing users/tokens remain untouched on upgrade. Outbox metadata contains token/trace IDs, with the raw token encrypted using AES-256-GCM, separate persistent environment key/identifier, random nonce and job/token-bound authenticated data. No raw token is stored in JSON, returned via API or logged. Missing key safely disables registration with 503 before account/token creation for all addresses; health/other foundations remain available.
- Delivery is behind `VerificationMailSender`; default adapter is disabled, tests use synthetic `.test` recipients. Registration only queues in its transaction. Explicit `VerificationDeliveryWorker.dispatchOne()` claims committed work with SKIP LOCKED/lease/attempts, sends outside transactions, and acknowledges only its lease owner. Definite failures use capped backoff/max five attempts; final outcomes erase ciphertext. Unknown outcomes/expired leases are held for reconciliation, not blind retry; held ciphertext is erased after the 24-hour lifetime during worker maintenance. No production provider, automated scheduler, provider credentials or real inbox delivery is configured or claimed. Provider/worker-runner/key-rotation/reconciliation integration remains pending.
- Database-backed limits apply to validated requests per transport peer address (5 registrations/20 verifications per minute by default, configurable). No raw IP is stored; stale limiter metadata is removed after a day. Counts survive service failures and are shared across instances. Trusted proxy address handling, edge connection/body/invalid-input controls and operational deployment benchmarks remain deployment work.
- **Resend contract unresolved:** endpoint catalog omits it; handoff explicitly proposes but does not agree POST `/auth/resend-verification`. Per this request, no competing route was invented. It remains denied. Route/response, cooldown, replacement/invalidations and safe durable delivery need agreement before implementation. Duplicate registration does not replace a usable token.
- **PASS:** final `backend\mvnw.cmd clean verify` on Java 21.0.11 / Spring Boot 4.1.1: **104 tests, 0 failures, 0 errors, 0 skipped**. Previous 71 retained, plus 30 PostgreSQL/MockMvc/workflow cases and 3 cipher tests. Covered normal/duplicate/concurrent registration, validation/malformed/missing fields, password storage, purpose/expiry/digest, verification failures/concurrency/state, registration/verification rollback, safe DTOs/logs, CSRF/exact routes, rate windows, fake delivery/no send in caller transaction, retry cap/unknown outcome/expired lease/worker claims, AES-GCM tamper/key/AAD checks and V2-to-V3 data preservation. Original security/error and restart suites pass. Initial CSRF test appended an invalid header after a valid one; replacing the header corrected the test setup without disabling protection.
- **PASS:** real PostgreSQL 18.6, clean V1/V2/V3 migrations and checksum/no-pending validation, V1/current and V2/current upgrade preservation, Hibernate identity validation, full application restart/data/security checks and executable JAR. Existing table/migration count assertions now expect four tables and three migrations; no test was removed or skipped. No new dependencies/versions were introduced.
- Updated backend/root setup notes, placeholder environment keys and frontend/backend handoff. Original specs, frontend implementation and FE01-FE07 history are unchanged; no new frontend test claim. Hosted GitHub Actions is still unverified/no Git remote configured.

Created files:

- `backend/src/main/java/com/ayaantrix/collector/auth/controller/AccountRegistrationController.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/TokenDeliveryCipher.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationDeliveryWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationMailSender.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationOutbox.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/dto/AccountResponses.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/dto/RegistrationRequest.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/dto/VerificationRequest.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/AccountRequestLimiter.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/AccountWorkflowConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/EmailVerificationService.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/RegistrationService.java`
- `backend/src/main/resources/db/migration/V3__add_account_delivery_outbox.sql`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/delivery/TokenDeliveryCipherTests.java`

Modified files:

- `README.md`
- `backend/.env.example`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/auth/repository/UserAccountRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/GlobalExceptionHandler.java`
- `backend/src/main/resources/application.properties`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`

Remaining T05: password recovery (Part 3), explicit resend contract/policy and workflow, configured email sandbox/provider/worker runner, operational reconciliation and key rotation, further abuse controls and end-to-end account acceptance. Login/JWT/refresh/session infrastructure remains T06, not implemented here. T05/M1 remain In progress; T04/M0 remain In progress pending hosted CI. No local verification/tool blocker remains; real inbox delivery and resend agreement are explicitly pending.

## T05 Part 3 - password recovery and secure reset - 26 October 2026

Status: **In progress** for T05/M1. This authorized backend part completes recovery/reset in the existing account foundation. T04/M0 remain In progress pending hosted CI; T06 and all later backend tasks remain Not started. Prior history and all original milestone/task rows are preserved.

- POST `/api/v1/auth/forgot-password` accepts `{email}` and returns 202 `{message: "If an eligible account exists, a password reset link will be sent."}`. Email is normalized; verified ACTIVE accounts are eligible. Unknown, unverified, disabled and repeated requests have identical generic responses, equal Argon2id work and a default 250 ms response floor (practical mitigation, not a constant-time guarantee). Recipient-specific enqueue failures roll back and retain generic success; globally missing delivery configuration gives uniform safe 503 before lookup.
- Recovery locks the account and coalesces requests while a usable 30-minute RESET_PASSWORD token exists; no duplicate token/job or resend is created. After expiry, issuance revokes old outstanding reset tokens and queues a replacement in one transaction. SecureRandom 256-bit raw tokens remain encrypted only in the durable outbox; token rows contain SHA-256 digests only.
- POST `/api/v1/auth/reset-password` accepts `{token,password}` and returns 200 `{message: "Your password has been reset."}`. Existing password/DTO policy and standard errors remain: 400 VALIDATION_FAILED/MALFORMED_REQUEST/TOKEN_INVALID; 410 TOKEN_EXPIRED/TOKEN_CONSUMED. Hashing, account eligibility/email checks, account locking and conditional consumption protect exact-purpose use. Consumption, Argon2id password update, revocation of other reset tokens and stale outbox payload cleanup commit together or roll back together. Verification state is preserved; no authentication is created.
- Both exact POST routes require the existing CSRF cookie/token exchange and X-XSRF-TOKEN. Wrong methods/child routes/unrelated auth remain denied; exact public health, existing registration/verification, CORS, problem JSON, safe traces and no-store success responses remain. Database-backed limits default to 5 recovery / 20 reset requests per minute per peer, with 429 and Retry-After: 60. Added optional RECOVERY_PER_MINUTE, RESET_PER_MINUTE and RECOVERY_MIN_RESPONSE_MS placeholders; no secrets were committed.
- Reused the same cipher/outbox/adapter/worker, extending messages with purpose and safe `/reset-password#token=...` links. Existing verification links/ciphertext remain compatible. Concurrent claims have one sender; unknown outcomes remain held for reconciliation, with unusable/expired capability cleanup on subsequent worker runs. Reset/replacement cancels stale pending reset payloads atomically. An already in-flight message can contain an inert link but cannot restore token usability. Provider delivery is not claimed exactly-once.
- V4__enable_password_reset_delivery.sql widens only the existing job-type constraint. No new table/column/account credential-version field was needed. V1-V3 and all supplied specifications are unchanged. T06 must revoke all actual account sessions/refresh families within the successful reset transaction when those services/tables exist; no implemented session-invalidation claim is made now.

Verification actually performed:

- **PASS:** `backend\mvnw.cmd clean verify`, Java 21 / Spring Boot 4.1.1, **142 tests, 0 failures, 0 errors, 0 skipped**; executable JAR packaged. Docker was available and real PostgreSQL 18.6 Testcontainers ran.
- All previous **104 tests retained and passing**, plus **38** new recovery/reset cases. Existing registration/verification suite remains 30; cipher 3; identity persistence 13; token entity 3; email normalization 8; password configuration 4; secure tokens 7; application startup/restart 1; problem factory 3; global errors 13; request tracing 11; security 8; recovery/reset 38.
- Covered normalized/generic/unknown/ineligible recovery, equal expensive work and minimum budget, encrypted purpose/expiry/digest delivery, coalescing and expiry replacement, rate limits/windows, concurrent issuance/consumption/worker claims, actual database rollback on enqueue and password persistence failures, malformed/invalid/missing inputs, invalid/revoked/expired/consumed/wrong-purpose/changed-email/disabled links, remaining token revocation and pending payload erasure, unchanged verification, no auto-login, safe response/log data, real CSRF exchange and denial, problem JSON and correlation IDs, held unknown delivery expiry and replay denial.
- Clean V1-V4 migration/Hibernate validation, V1/V2 upgrade regression, V3-to-V4 queued verification ciphertext preservation, restart preservation and JAR packaging passed. Existing tests only adjusted expected migration count and newly public POSTs; test clock/mail configuration is now explicitly test-only to prevent component-scan leakage. Security and CSRF were not weakened.
- **Not performed:** live provider inbox delivery, full browser-to-backend recovery journey or frontend regression (no frontend files changed), session revocation before T06, hosted CI (no Git remote configured). No local tool blocker affected the backend checks. No dependency versions changed.

Exact files created:

- `backend/src/main/java/com/ayaantrix/collector/auth/controller/PasswordRecoveryController.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/dto/PasswordResetRequest.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/dto/RecoveryRequest.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/PasswordRecoveryService.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/PasswordResetService.java`
- `backend/src/main/resources/db/migration/V4__enable_password_reset_delivery.sql`
- `backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java`

Exact files modified:

- `backend/.env.example`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationDeliveryWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationMailSender.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationOutbox.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/resources/application.properties`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `README.md`
- `backend/README.md`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`

Remaining T05: agree/implement verification resend route and replacement/cooldown policy; configure/test a sandbox/provider and automated worker runner; operational reconciliation/key rotation, deployment abuse controls and end-to-end account acceptance. Default email delivery remains disabled and only the controlled fake delivered in tests. T06 session invalidation/login/JWT/refresh remain future work. T05/M1 and T04/M0 stay In progress. Code/test commit: `5eaff7f`; documentation is committed separately. No push performed.

## T05 Part 4 - account workflow integration and delivery operations - 26 October 2026

Status: **In progress** for T05/M1. The explicit Part 4 backend request authorizes this focused work. All earlier results and the original M0-M7/T01-T38 roadmap remain preserved. T04/M0 stay In progress because no Git remote/hosted CI evidence exists; T06 and later backend tasks remain Not started.

- Added AccountDeliveryRunner: opt-in SmartLifecycle polling, one sequential thread, 1-50 claims per poll, validated delay/shutdown bounds, guarded startup requiring the existing key and an available explicit adapter, fixed safe failure logs, no global unrelated scheduling, idempotent start/stop, and bounded in-flight drain/interruption. Default worker flag remains false; disabled fallback cannot accidentally dispatch. Existing PostgreSQL leases/claims, purpose eligibility, retry caps and unknown-outcome holding remain authoritative. Maintenance now processes at most 100 stale leases and 100 expired held payloads per dispatch.
- Added AccountDeliveryOperations: internal-only inspection capped at 100 redacted rows, row-locked decisions using expected timestamp AND attempt count, and transactional confirmed-sent / confirmed-not-sent / abandon handling. UNKNOWN never automatically becomes QUEUED. Only evidence-confirmed not-sent, still-eligible tokens below the attempt cap can requeue. Terminal decisions erase ciphertext; metadata records only resolution, safe CASE-number reference and decision time. Stale/concurrent decisions fail safely; repeated clock values cannot make an old decision apply to a new attempt. Pause/drain all workers and resolve provider evidence first; the runbook does not present shutdown timeout as proof of failure.
- Reused existing test-only controlled FakeMail; new Mailbox adds completion signalling for automated tests. No development HTTP token mailbox, real provider, SMTP connection, new production credentials or Actuator token exposure was added. Delivery operations runbook documents bounded safe SQL/service inspection, evidence handling, eligibility, restart/shutdown, unavailable cipher/key handling and remaining operational prerequisites. Multi-key rotation and cipher-repair retry tooling remain pending.
- Resend remains explicitly **unapproved and denied**. Repository inspection found no agreed replacement for the proposed frontend route. The handoff now proposes exact route/DTO/generic response/eligibility, peer and recipient throttle limits, queued/unknown coalescing and atomic token replacement/lifetime rules, all clearly pending approval. Existing frontend mock capability is not treated as approval.
- Reviewed actual frontend auth request/response shapes, CSRF exchange, token capture and error transport against real controllers. Existing five public account operations remain unchanged; no contract correction was necessary. Deny-by-default authorization, exact health, restricted CORS and CSRF remain. T06 session revocation must join the successful reset transaction when real session/refresh infrastructure exists; no login/JWT/refresh work was introduced.
- No migration or dependency update was necessary. V1-V4 and all original specification files are unchanged. The existing jsonb outbox metadata holds bounded operational references; no second queue/audit framework was added. Authenticated operator identity/audit evidence lives in the restricted operational case, not an invented T06 session or public endpoint.

Verification actually performed:

- **PASS:** final `backend\mvnw.cmd clean verify`, Java 21.0.11 / Spring Boot 4.1.1, **175 tests, 0 failures, 0 errors, 0 skipped**, executable JAR packaged. All previous **142 retained**, plus **21** AccountDeliveryOperationsTests and **12** AccountDeliveryRunnerTests. No old tests were weakened or removed.
- PostgreSQL 18.6 Testcontainers covered the real-CSRF register -> scheduled test mailbox -> verify -> recovery -> scheduled reset mail -> HTTP password reset journey; purpose/password/state preservation, consumed links, no secrets in logs, bounded redacted inspection/maintenance, two competing pollers, concurrent/stale reconciliation, unchanged-clock attempt protection, cap/expiry/revocation/disabled/email-change guards, actual rollback, held unknown/cipher states, and real context restart with stable key/queued ciphertext and crashed leases. Existing clean migration, upgrade, Hibernate validation, restart, registration/reset/security/error suites passed.
- Runner tests covered default-off/explicit-on lifecycle, disabled sender/missing key fail-closed, all configuration bounds, idempotent lifecycle, bounded claims, in-flight shutdown drain, poll recovery and safe failure logging. Initial test-only compilation errors in an overloaded stop method reference and JSON strings were corrected before passing verification. Final review added attempt-count stale protection and reran the full suite successfully.
- **PASS:** existing frontend auth/transport contract tests: `npm test -- src/test/auth.test.tsx src/test/transport.test.ts --maxWorkers=1 --pool=forks`, **46 tests in 2 files**. No frontend source, UI or product page changed; no broader frontend build/browser claim is made.
- **Not performed:** live provider/inbox delivery, provider reconciliation against real external records, browser-to-live-backend workflow, T06 session revocation, multi-key rotation and hosted CI. Docker/local tools were available; no local verification blocker remains. A real provider adapter, restricted maintenance deployment/evidence process and approved resend contract are integration prerequisites, not simulated production successes.

Exact files created:

- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/AccountDeliveryOperations.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/AccountDeliveryRunner.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/delivery/AccountDeliveryRunnerTests.java`
- `docs/ACCOUNT_DELIVERY_OPERATIONS.md`

Exact files modified:

- `backend/.env.example`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationDeliveryWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationMailSender.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/AccountWorkflowConfiguration.java`
- `backend/src/main/resources/application.properties`
- `backend/README.md`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`

Acceptance decision: T05 is **not Complete** while verification resend approval/workflow, real sandbox/provider acceptance and remaining operational/end-to-end account requirements are pending. Worker execution and internal unknown-outcome reconciliation are now implemented and verified within controlled-test scope. Next T05 step is approving the documented resend decisions and configuring a controlled provider integration; T06 authentication/session invalidation stays separate. Code/test commit: `1cb8ed5`; runbook/status/contracts committed separately. No push performed.

## T06 Parts 1 and 2 - secure login, JWTs and persistent agency sessions - 27 October 2026

Status: **In progress** for T06/M1. The first request authorized login/JWT foundations; the latest request authorized complete refresh sessions and activation of the real login contract. Inspection confirmed Part 1 was not already present, so both parts were implemented together before public login activation. This explicit backend authorization is separate from the earlier frontend batches. T05 remains In progress for its original resend/provider requirements; T04/M0 remain In progress for hosted CI. No T07 or later backend task was implemented.

- CredentialVerifier reuses canonical emails and existing Argon2id. Validated login requests use the existing PostgreSQL limiter (10/minute/peer default, configurable LOGIN_PER_MINUTE); unknown accounts perform dummy Argon2id matching. Unknown/wrong/disabled credentials receive the same 401 INVALID_CREDENTIALS; EMAIL_NOT_VERIFIED is returned only after a correct unverified password. The account/hash/state are checked again under the user lock before issuing a session. No password/hash/entity or refresh secret enters response JSON; no workspace is created.
- AccessTokens uses BOM-managed Spring Security JOSE/resource-server 7.1.1 and Nimbus 10.9.1. RS256 is pinned; local public-only JWKS select known kids and support staged key rollover. The matching PKCS#8 private key and separate 32-byte HMAC pepper are externally configured, stable across restarts and never auto-generated at application startup. Tokens last exactly five minutes, with iss/aud/sub/sid/jti/iat/exp and kid; signature, issuer, exact audience, IDs/timestamps/lifetime, algorithm and bounded 30-second skew are checked. Unsigned/unsupported/malformed/expired/future/unknown-key/wrong-signature claims are rejected. The standard bearer filter rechecks live account/session state without persisting bearer identity in the anti-CSRF HTTP session.
- V5__create_agency_sessions.sql adds USER-only auth_sessions/session_tokens, scoped foreign keys, digest/timestamp/rotation constraints and indexes. Existing V1-V4 are unchanged. Refresh credentials are 256-bit random capabilities; only HMAC-SHA-256 digests are stored. Sessions last 14 days absolute / seven days idle; refresh advances activity capped at the absolute deadline. Token rows retain rotation/replacement links for reuse detection. Row locks serialize login/reset/refresh/revocation through a consistent user -> session order.
- Public POST /api/v1/auth/login accepts {email,password}, returns 200 {accessToken,expiresIn:300,user} and the refresh cookie. POST auth/refresh accepts {} plus cookie and returns 200 {accessToken,expiresIn:300} with atomic rotation. A rotated token gets 409 REFRESH_ALREADY_ROTATED during the exact [rotation,rotation+2s) race window, without credentials/cookie changes/revocation; later reuse commits family revocation before returning 401. Other families are unaffected. Failure rolls replacement/rotation/activity back. Refresh attempts also use the shared peer limiter (60/minute).
- GET /api/v1/me returns safe user and honest memberships:[] until T07. GET me/sessions returns the original catalog's {data:SessionSummary[]} (bounded to 100) and a generic label, without raw device/IP metadata. DELETE me/sessions/{id} revokes only own sessions, with 404 for cross-user IDs. POST auth/logout revokes the persistent current session via cookie or valid bearer when the cookie is absent and returns idempotent 204/clearing; expired optional bearer headers cannot block cookie logout/refresh. POST auth/logout-all revokes all of the authenticated user's sessions.
- Password reset now revokes every account session within its existing password/token/outbox transaction. A revocation failure rolls the new password and token consumption back; reset/refresh concurrency cannot preserve an old-credential session. Live session/account checks also invalidate issued JWTs on revocation/disablement. Future password-change paths must join this same transaction pattern, not bypass it.
- Production refresh cookie is __Secure-collector_refresh, Secure/HttpOnly/SameSite=Lax, host-only, Path=/api/v1/auth, with remaining absolute Max-Age. The loopback dev HTTP exception uses collector_refresh; insecure refresh settings outside dev/loopback fail closed. Anti-CSRF session cookies are explicitly Secure/HttpOnly/SameSite=Lax in production and cookie-only tracking is enforced. Login/refresh/logout change the CSRF session ID and remove the old CSRF token; the frontend already refetches before mutations. No bearer-CSRF exemption, broad auth wildcard, CORS relaxation or business permission was introduced. Standard problem JSON/correlation is retained; authenticated account identity failures use 401 while closed business/CSRF denials remain 403.
- Added Windows local key initialization with a Java 21 single-file generator: restrict the ignored secret directory first, generate once, append UTF-8 ignored .env configuration without printing secrets, and preserve existing/partial files instead of silently replacing keys. Checked generation in an isolated ignored directory; valid public JWKS was produced and no secret was printed. Production uses restricted secret-manager mounts, not committed keys. Partial invalid signing configuration fails closed; fully blank settings leave health/T05 running and return safe AUTH_UNAVAILABLE for login.

Verification actually performed:

- **PASS:** final backend `./mvnw.cmd clean verify`, Java 21.0.11 / Boot 4.1.1, **229 tests, 0 failures, 0 errors, 0 skipped**. All previous **175 tests retained**, plus **33 AgencySessionWorkflowTests**, **19 AccessTokensTests**, **2 RefreshCookiesTests**. Executable JAR packaged successfully; no skipped or bypassed failures.
- PostgreSQL 18.6 covered login/state/normalization/Argon2id/generic errors, peer throttling with forged forwarded headers, cookie and digest storage, /me bootstrap, atomic rotation, single-winner concurrency, exact race/reuse boundaries, family isolation, absolute/idle expiry, expired-access refresh, logout/idempotency/logout-all/own-session scope, disablement, CSRF even with bearer, old CSRF invalidation, untrusted origin preflight, safe errors/traces, reset revocation and reset/refresh races, actual login/rotation/reset-revocation rollback, V4 upgrade preserving accounts/ciphertext, clean V1-V5/Hibernate validation, real application restart with stable keys/pepper and existing regressions. Existing tests only changed newly activated route statuses/descendant-denial assertions and expected migration/table counts, preserving their test counts.
- JWT tests verified safe required claims, five-minute TTL, algorithm/key/signature/issuer/audience/expiry/future/malformed rejection, restart stability, retained-public-key rollover/retirement, fail-closed missing/mismatched configuration, and stable keyed refresh digests. Cookie-policy tests verified rejection of insecure non-dev/non-loopback settings and the restricted dev name/path.
- Initial Java import ambiguity and PostgreSQL CHAR mapping mismatch were corrected before passing verification; the digest mapping now matches the existing AccountToken convention. Final full rerun included the precise two-second boundary and explicit CSRF cookie settings. A dependency tree confirmed BOM resolution (Spring 7.1.1, Nimbus 10.9.1); no independent version override was added.
- **PASS:** existing frontend auth/transport `npm test -- src/test/auth.test.tsx src/test/transport.test.ts --maxWorkers=1 --pool=threads`: **46 tests in 2 files**. An initial fork worker failed to start (21 transport tests passed, auth file did not execute); the one-thread rerun passed both files. The failed attempt was not claimed as success. Frontend source/UI/mocks/lockfile were unchanged; no broader browser/build claim is made.
- **Not performed:** live browser/TLS reverse-proxy cookie acceptance, production secret/key rollout, hosted CI, provider delivery or full workspace/product journeys. No local tool blocker remains. T06 stays In progress for deployment acceptance and operational expiry/retention hardening; T05 resend/provider gaps are unchanged. No T07 tables/features or full MVP completion claim was added.

Exact files created:

- `backend/scripts/GenerateAuthKeys.java`
- `backend/scripts/Initialize-Auth.ps1`
- `backend/src/main/java/com/ayaantrix/collector/auth/controller/AgencySessionController.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/dto/LoginRequest.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/dto/SessionResponses.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/AuthSession.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/SessionToken.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/repository/AuthSessionRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/repository/SessionTokenRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/security/AccessTokenSecurity.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/security/AccessTokens.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/security/RefreshCookies.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/security/RefreshTokenHashes.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/AgencySessions.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/CredentialVerifier.java`
- `backend/src/main/resources/db/migration/V5__create_agency_sessions.sql`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/security/AccessTokensTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/security/RefreshCookiesTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/security/SigningKeyFixture.java`
- `docs/AGENCY_SESSION_ARCHITECTURE.md`

Exact files modified:

- `.gitignore`
- `backend/.env.example`
- `backend/pom.xml`
- `backend/src/main/java/com/ayaantrix/collector/auth/service/PasswordResetService.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java`
- `backend/src/main/resources/application-dev.properties`
- `backend/src/main/resources/application.properties`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java`
- `README.md`
- `backend/README.md`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`

Current evidence supersedes earlier statements that T06/login/refresh/me are unimplemented or reset session invalidation is deferred. Next T06 follow-up: verify real browser and HTTPS deployment/cookie/key rollout behavior and bounded expired-session retention operations. T07 remains Not started. T05 remains In progress for resend/provider acceptance, and T04/M0 remain In progress until an actual remote CI run. Setup commit: `3655eaf`; implementation/test commit: `f7a2c9b`; documentation committed separately. No push performed.

## T06 Part 3 — final local security audit and real browser integration — 27 October 2026

**T06/M1: In progress.** Code/test commit: `107a718`. Local audit and browser integration complete; deployment acceptance remains pending. [Full audit, reproduction commands, exact files and coverage matrix](verification/T06_AUTH_AUDIT.md).

- Fixed logout reporting success without revoking a valid bearer session when its refresh cookie was malformed/unknown. Two PostgreSQL regressions reproduced the defect before correction and now pass. Fixed stale CSRF nonce on the frontend mutation retry after access refresh; unit and real-browser DELETE regression pass. No security protection was disabled, no dependency/schema/UI feature changed, V1–V5 and supplied specifications remain unchanged.
- Reviewed credentials/Argon2id/rate limits, JWT keys/RS256/issuer/audience/subject/time, digest-only refresh families/atomic locking/race window, expiry/revocation, cookies/CSRF/CORS and reset transaction. Existing policies retained. Added post-restart revoked-access/refresh and cross-user signed JWT/session binding coverage; strengthened 409 assertions to exclude credentials. Live database validation rejects previously issued JWTs on subsequent requests after revocation/disablement; ordinary rotation alone does not revoke unexpired access in a live family.
- **PASS:** backend `.\mvnw.cmd clean verify`: **233 tests, 0 failures/errors/skips** (all prior 229 + four new cases); PostgreSQL 18.6 concurrency/restart/upgrade, clean V1–V5, Hibernate validation, registration/verification/recovery/reset regressions and executable JAR packaging.
- **PASS:** separate explicit `.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test`: **1 test, 0 failures/errors/skips**, actual headless Edge, HTTPS Vite, real Spring HTTP and disposable PostgreSQL, verified synthetic account, MSW off. Includes UI login/invalid credentials/reset, Secure/HttpOnly cookie/deletion, missing-CSRF attacks, untrusted origin/preflight, reload bootstrap, expiry/write retry, concurrent requests sharing one refresh, logout, reset invalidation, two-device logout-all, idle expiry and no private browser storage/service-worker interception. Transport/session commands use actual app modules directly, not redesigned product screens. Initial harness polling/preflight observation failures were corrected before the passing run; no application security relaxation.
- **PASS:** frontend auth/transport **47 tests in 2 files** (previous 46 + nonce regression), strict TypeScript and production build, zero-warning lint, package formatting and browser-runner formatting. No broad visual/PWA/product regression claim.
- Browser test is deliberately explicit, outside backend-only default Surefire naming; requires Java/Node/frontend dependencies/Edge/Docker. It uses a temporary self-signed HTTPS certificate with trust bypass confined to isolated test contexts. Public TLS/proxy behavior, secret mounts/key rollout, trusted peer/edge abuse controls, retention operations and hosted CI remain unverified. No local tool blocker remains. T05 resend/provider/operational acceptance remains pending; T04/M0 remain pending hosted CI, T07 Not started. No push.

Exact files created:

- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `frontend/real-auth/browser-check.mjs`
- `docs/verification/T06_AUTH_AUDIT.md`

Exact files modified:

- `backend/src/main/java/com/ayaantrix/collector/auth/service/AgencySessions.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `frontend/src/api/baseQuery.ts`
- `frontend/src/test/transport.test.ts`
- `frontend/eslint.config.js`
- `backend/README.md`
- `docs/AGENCY_SESSION_ARCHITECTURE.md`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`

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

Milestone status: In progress

| Task | Deliverable                                     | Acceptance                                                     | Status      |
| ---- | ----------------------------------------------- | -------------------------------------------------------------- | ----------- |
| T05  | Account registration, verification and recovery | Purpose-bound single-use tokens and generic recovery responses | In progress |
| T06  | JWT access, refresh rotation, logout and CSRF   | Expiry, reuse and concurrent refresh tests pass                | In progress |
| T07  | Workspace owner, membership and plan seed       | Two tenants cannot access each other's resources               | Complete    |
| T08  | Agency layout and session lifecycle             | Sign-in, workspace switch and cache clearing work              | Complete    |

### Milestone M2 Projects templates and team

Milestone status: In progress

| Task | Deliverable                                  | Acceptance                                          | Status      |
| ---- | -------------------------------------------- | --------------------------------------------------- | ----------- |
| T09  | Template JSON validator and catalog seed     | All ten built-ins validate                          | Complete    |
| T10  | Project creation for all three types         | Template snapshot remains independent               | Complete    |
| T11  | Section and item editor and reorder          | Keyboard reorder and structure conflicts work       | Complete |
| T12  | Client contacts and read-only client preview | Preview exposes no live client session              | Complete    |
| T13  | Team invitations and project assignments     | Seat reservation and reviewer/export flags enforced | Complete |

### Milestone M3 Client collection

Milestone status: In progress

| Task | Deliverable                                            | Acceptance                                             | Status      |
| ---- | ------------------------------------------------------ | ------------------------------------------------------ | ----------- |
| T14  | Invitation email, fragment exchange and client session | A passive GET cannot consume access                    | Complete |
| T15  | Typed client item editors and repeaters                | Server and browser enforce the same schema semantics   | Complete |
| T16  | Autosave and conflict UI                               | Two-tab edits produce a safe conflict                  | Not started |
| T17  | Submission versions and withdraw                       | Immutable revision and exact asset references recorded | Complete |

### Milestone M4 Files review and exports

Milestone status: In progress

| Task | Deliverable                                 | Acceptance                                                   | Status      |
| ---- | ------------------------------------------- | ------------------------------------------------------------ | ----------- |
| T18  | Private upload reservations and quota       | Concurrent reservations remain within allowance              | Complete |
| T19  | Scanner, canonical copy and image variants  | Unsafe staging bytes never become public READY content       | Complete |
| T20  | Phone upload queue and original option      | Real-device photo and error journeys pass                    | In progress |
| T21  | Comments and review decisions               | Internal comments never reach clients; decision race handled | Complete |
| T22  | Project completion, reopening and archive   | Progress and lifecycle guards use the same evaluator         | Complete |
| T23  | Immutable approved export manifest and jobs | Partial exports labeled; all three formats match snapshots   | Complete |

### Milestone M5 Assistance and reminders

Milestone status: In progress

| Task | Deliverable                                | Acceptance                                           | Status      |
| ---- | ------------------------------------------ | ---------------------------------------------------- | ----------- |
| T24  | AI adapter, allowance reservation and job  | Provider failures preserve ordinary writing          | Complete |
| T25  | Client suggestion preview and acceptance   | No automatic submission or overwriting newer answers | Complete |
| T26  | Reminder policy, outbox and email delivery | No chase when all remaining work is agency review    | Complete |
| T27  | SMS consent, verification and suppression  | STOP and quiet-window sandbox cases pass             | Complete |
| T28  | Provider unknown-outcome reconciliation    | No blind retry of potentially sent messages          | Complete (local acceptance) |

### Milestone M6 Reporting commercial readiness and visibility

Milestone status: In progress

| Task | Deliverable                                    | Acceptance                                                | Status      |
| ---- | ---------------------------------------------- | --------------------------------------------------------- | ----------- |
| T29  | Server activity and minimal browser analytics  | No raw answers or tokens in events                        | Complete (local acceptance) |
| T30  | Friction views and sample safeguards           | Incomplete observation windows are not called abandonment | Complete (local acceptance) |
| T31  | Owner digest and scoped status share/embed     | Token cannot reach content or file endpoints              | Complete (local acceptance) |
| T32  | Hosted checkout, webhook processing and portal | Sandbox subscription is source of entitlements            | Complete |
| T33  | Usage UI, trial, grace and read-only states    | Limits are disclosed and enforced server-side             | Complete |

### Milestone M7 Public MVP release

Milestone status: In progress

| Task | Deliverable                                              | Acceptance                                                     | Status      |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------- | ----------- |
| T34  | PWA manifest, public-only cache and mobile polish        | No cached private content after logout                         | Complete |
| T35  | Rate limits, accessibility and full isolation regression | A01-A31 pass in staging                                        | In progress |
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

## T07 Part 1 — workspace ownership, membership, trial and tenant foundation — 27 October 2026

Status: **T07/M1 In progress**. Code/test commit: `c3cff0d`. Explicit backend authorization covers this foundation; no T08/frontend or later feature implemented. [Full schema/domain/security decisions, exact file manifest and commands](WORKSPACE_FOUNDATION.md).

- V6 adds reference `collector.workspaces`, `workspace_members` and local-trial-only `subscriptions`. No payment provider columns/integration, new plan catalog, synthetic users or workspace-type field. V1–V5 and all supplied specifications remain unchanged. UUID/FK/unique/state/nonnegative/time checks, one active owner per workspace and one owned workspace per user, tenant lookup index and optimistic settings version are enforced.
- Transactional verified-owner creation inserts workspace + ACTIVE OWNER + server-timed 14-day trial together. Memberships are OWNER/MEMBER and ACTIVE/DISABLED; can_review/can_export stay future project-assignment permissions. Server-defined Solo/Agency allowances follow Section 18; optional initial planKey chooses only a trial, defaults SOLO, and cannot activate paid entitlement. Undefined reduced trial AI/SMS budgets default zero and providers stay disabled. No dependencies added.
- Central trusted-JWT/account/session/live-membership authorization, scoped package-private repositories, account -> workspace -> member locks, owner-only versioned settings changes. Inaccessible/disabled/removed tenant IDs give 404, a live member's denied owner action gives 403. Exactly one owner is a creation/service invariant; partial unique indexes enforce at most one under arbitrary SQL. Future member/transfer services must preserve the invariant transactionally.
- Opened only documented GET/POST workspaces and GET/PATCH workspaces/{id}; standard DTOs, Bean Validation, CSRF, no-store and tracing retained. Anonymous opened workspace routes use 401. T13 member/invitation/transfer and all project routes remain denied. Existing `/me` membership projection is unchanged in Part 1; live projection + real onboarding acceptance remain T07 integration work, not a completed T08 frontend journey.
- **PASS:** `.\mvnw.cmd clean verify`: **278 tests, zero failures/errors/skips** (all prior 233 + 45 workspace cases), PostgreSQL 18.6 V5 upgrade/clean V1–V6/Hibernate/restart, tenant read/write/plan isolation, constraints, rollback, concurrency, JWT/account/security regressions and executable JAR. No tests removed/disabled; historical migration assertions advanced to V6/nine tables.
- **PASS:** separate real HTTPS authentication browser regression **1 test**, MSW off; new workspace UI onboarding was not tested. Final strengthened lock-wait concurrency rerun **2 cases passed**.
- **PASS:** frontend auth/transport/product contract regression **69 tests in 3 files**, using existing mocks; frontend code unchanged. This is not new live workspace browser acceptance. Focused initial test-fixture SQL issues/status expectation were corrected before passing; no security protection weakened.
- Remaining: live `/me` projection and complete real verified-owner onboarding acceptance; T13 management/transfer/project permissions and T32/T33 billing/usage are later work. T04 hosted CI, T05 resend/provider and T06 deployment/retention limitations remain. No local tool blocker or full MVP claim. No push.

## T07 Part 2 — live memberships and real workspace onboarding — 27 October 2026

Status: **T07 Complete within its workspace foundation acceptance; M1 In progress** for T05/T06/T08. Code/test commit: `0414c15`. [Detailed contract, acceptance evidence and exact files](WORKSPACE_FOUNDATION.md#t07-part-2--live-membershipsession-projection-and-real-onboarding--27-october-2026). Part 2 supersedes Part 1's remaining `/me`/onboarding gaps; original roadmap/history preserved.

- GET `/api/v1/me` now projects live ACTIVE memberships from PostgreSQL into the unchanged user + MembershipSummary contract (memberId, workspaceId, workspaceName, OWNER/MEMBER role). DISABLED/removed memberships excluded; trusted JWT/session/account validation retained. No `/auth/me` duplicate endpoint, inactive status exposure, entities or workspace-role JWT cache. One scoped constructor join avoids N+1 queries; an internal projection port avoids circular service dependencies. Membership changes appear on the next request without reissuing JWT.
- Existing frontend login/onboarding/reload bootstrap and selection now consume real memberships. Added only an identity-change listener to clear both private API caches when existing memberships/user change, plus its regression. No dashboard/navigation redesign, new polling or T08 work. Tokens stay memory-only. Backend authorization remains authoritative.
- **PASS:** backend clean verify **290 tests, zero failures/errors/skips** (all previous 278 + 12 membership cases); WorkspaceFoundationTests now 57. Flyway V1–V6/Hibernate/upgrade/restart, JWT/session/password-reset regressions, transactional trial/concurrency/tenant constraints and executable JAR all pass. No migrations/dependencies/specifications changed.
- **PASS:** frontend **70 tests across all 3 files** (previous 69 + cache/navigation regression), strict TypeScript/production build, zero-warning lint and formatting including real-auth runner.
- **PASS:** explicit real HTTPS Edge/Vite/Spring/PostgreSQL suite **2 tests**, zero failures/errors/skips: existing authentication lifecycle + actual registration -> encrypted outbox/test mailbox -> explicit verification -> login -> UI workspace creation -> owner/trial persistence -> list/read -> reload/bootstrap/selection -> isolation -> member navigation/owner-write denial -> disabled-membership recovery/cache clearing -> logout. MSW off, no external provider calls; second tenant/membership changes use isolated Java/SQL fixtures, not invented T13 endpoints.
- Dashboard project endpoints remain denied (later tasks); browser acceptance does not claim implemented project/template backend or full product. Self-signed certificate trust is bypassed only in isolated browser tests; production TLS/CI/provider acceptance is not claimed.
- No T07-scope blocker remains. T04 hosted CI, T05 resend/provider and T06 deployment/retention gaps remain; T08 and later backend tasks Not started. No push or full M1/MVP completion claim.

## T08 Part 1 — backend package organization and agency session integration — 27 October 2026

Status: **T08 Complete for documented agency layout/session acceptance; M1 In progress** for T05/T06. [Architecture, exact moves, visibility decisions and reproduction commands](../backend/ARCHITECTURE.md). Existing FE01–FE07 and T01–T07 history/roadmap preserved; no T09/later backend feature or full M1/MVP claim.

- Audited current 63 production/21 test Java source files and dependencies. Moved 13 flat workspace classes to entity (5), repository (3), controller (1), dto (1), security (1), service (2). Updated imports, nested DTO constructor/enum JPQL references and production-required visibility. Auth/common wiring and feature-wide test packages intentionally retained. No duplicate/empty packages or migration/API/DTO/dependency changes. Future feature convention added to AGENTS.md. Refactor commit: `bdec2bc`; lifecycle/version correction commit: `242ef1c`.
- **PASS before refactor:** fresh clean verify, 290 tests, zero failures/errors/skips, JAR. **PASS after refactor and before lifecycle work:** fresh clean verify, same 290 tests, Spring/JPA/repository/JPQL/tenant/security regressions and JAR. First refactor run exposed public primitive version accessor unboxing null; corrected to nullable Long before passing. Final review added a version-128 numeric-equality regression after reproducing the boxed-reference error; value comparison now preserves optimistic conflict behavior.
- Two focused frontend tests reproduced valid member-route reload selecting the wrong active workspace and invalid selection needlessly clearing caches. Minimal fixes synchronize authorized route selection through the existing action and validate selection before clearing. No navigation redesign/new session subsystem or backend role claims.
- **PASS:** all 72 frontend tests (prior 70 + two selection regressions) across 3 files. Strict TypeScript/production build, zero-warning ESLint, package formatting and real-auth runner formatting passed.
- Extended actual HTTPS Edge/Vite/Spring/PostgreSQL checks (MSW off) to profile/no-workspace onboarding, rejected external return URL, expired workspace access, owner/member switch and reload alignment/cache separation, and two-tab UI logout clearing tokens/memberships/agency/client caches and returning both tabs to sign-in. Existing auth/refresh/reset/logout-all/session-expiry/security flows preserved. Isolated fixture tenant grants/disablement do not add T13 endpoints; project/template APIs remain denied.
- **PASS final after numeric-version correction:** clean verify **291 tests**, zero failures/errors/skips (all baseline 290 + version-range regression; WorkspaceFoundationTests 58), clean V1–V6/Flyway/Hibernate/tenant/concurrency/auth/reset regressions and executable JAR. Artifact inspection confirms all workspace classes in new subpackages and no old flat workspace classes. **PASS:** complete explicit real HTTPS browser rerun **2 tests**, zero failures/errors/skips, MSW off. No remaining T08/local tool blocker identified. T04 hosted CI, T05 resend/provider and T06 deployment/proxy/key/retention gates remain pending; M1 remains In progress. No push.


## T09 Part 1 — original template catalog and strict validation — 28 October 2026

M2 is In progress; T10 and all later task rows remain unchanged. [Package tree/responsibilities](../backend/ARCHITECTURE.md#t09-part-1--template-feature-addition), [original source, validation boundary, seeding, endpoints and reproduction](../backend/README.md#t09-part-1--validated-template-catalog-28-october-2026), [real frontend contract handoff](FRONTEND_PRODUCT_HANDOFF.md#t09-part-1--real-template-catalog-backend-28-october-2026).

- Inspected the original ten JSON definitions and their 68 sections/220 items, guide Sections 1–8 and relevant backend/schema/API/testing sections, original API/catalog/schema, handoffs, existing feature/security/error/session/workspace code, migrations, tests and dependency setup. No invented templates or original-specification edits. Packaged source is byte-identical, SHA-256 `75f33a836337b5de3f0b122c955e1e8c24ffe7fa85c50a27ac95369c23e44cef`.
- Eight production classes under controller/service/repository/entity/dto/validation/seed. No duplicate/empty packages, new dependencies, frontend UI/source, project controllers/entities, billing changes or publish endpoints. Exact existing catalog DTOs include the already-documented summary versionId extension.
- Additive V7 creates templates/template_versions only (11 current collector tables, 7 migrations), constraints/indexes and published version UPDATE/DELETE rejection. V1–V6 remain unchanged. JPA validates and treats catalog entities as immutable.
- Complete-batch validation, deterministic source-key/version UUIDs, classpath-only source, one advisory-locked transaction and insert/equality checks. Existing v1 conflicts fail startup and roll back all new seed inserts. Original content, user-created catalog rows, later versions and timestamps survive seeding/restart. Independent definition reads prepare T10 without implementing it.
- Exact authenticated GET list/filter and immutable version-detail routes reuse live WorkspaceAuthorization; current membership plus account/session checks, scoped repositories, no-store, safe problems and correlation preserved. MEMBER catalog reads do not grant project/action access. All unsupported routes/mutations stay denied; no CSRF/CORS bypass.
- Added 88 schema tests and 27 PostgreSQL/catalog integration tests (115 new cases); all original 291 backend cases remain enabled. Existing schema assertions advance to V7/11 tables; catalog permission cases replace the old route's default-denial expectation. No assertions/tests disabled.
- Early runs were not acceptance passes: a Jackson-3 test fixture class name needed StringNode; the blank-industry fixture used an encoded literal instead of a real blank parameter; the failed-startup test expected a nested cause although Spring returns the IllegalStateException directly. Corrected the tests and reran; no production validation/security relaxation. The first full run passed all 291 existing cases but had the old blank-parameter fixture failure.
- Frontend final full suite: **72 tests across 3 files passed** with `npm test -- --maxWorkers=1 --pool=threads`. The initial run passed 44 tests but had an auth worker startup timeout, so was not counted as a full pass. Clean isolated rerun passed without changing test isolation/configuration or dependencies. No frontend UI change; no additional browser/visual/deployment acceptance claim.
- **PASS final:** `backend\mvnw.cmd clean verify`: **406 tests, 0 failures, 0 errors, 0 skipped** (all original 291 plus 88 validator and 27 catalog cases). Clean V1–V7/Flyway checksum validation, Hibernate schema validation, V6 upgrade preservation, deterministic seed equality, database constraints/immutability, concurrent seed runs, failed-startup whole-batch rollback, future version preservation, restart/live session and tenant/security regression checks passed. Executable Spring Boot JAR built. **T09 Complete for its validator/catalog-seed acceptance and this Part 1 scope; M2 remains In progress.** No local T09 blocker remains; no T10 implementation. Explicit real-browser/visual/deployment suites were not rerun for this backend-only change. Existing T04 hosted CI, T05 resend/provider and T06 deployment/proxy/key/retention gates remain pending; M1/full MVP are not declared complete. No push.

Artifact audit confirmed V7 and all template classes in the executable JAR and a byte-identical original resource. An explicit .gitattributes -text rule prevents the packaged copy changing under Windows autocrlf on checkout. Implementation/test commit: `5c513c1`; checkout-byte preservation commit: `f7ccb98`.


## T10 Part 1 — project creation and independent snapshots — 28 October 2026

M2 In progress. T11/T12/T13 and later task rows/history unchanged. [Exact architecture and package tree](../backend/ARCHITECTURE.md#t10-part-1--project-foundation), [persistence/API/plan/snapshot details and commands](../backend/README.md#t10-part-1--project-creation-and-independent-initial-snapshots), [integration contract](FRONTEND_PRODUCT_HANDOFF.md#t10-part-1--real-projectcustomer-backend).

- Inspected actual existing code, guide scope/security/schema/API/acceptance/roadmap, V1–V7, handoffs, workspace/session/template/error code, existing tests and frontend wizard/list/detail/transport contracts. Preserved original ten definitions and all original specifications/dependencies/migrations. No frontend UI/source, T11 edits, T12 preview or T13 invitations/assignments.
- Added organized project feature with JPA project/customer/immutable snapshot, scoped repositories, DTOs, authorization, transaction-mandatory copy service, explicit JDBC structure persistence and creation idempotency. Existing project-type enum reused; states match the guide. Existing account/workspace/member/plan locks and live session checks retained.
- V8 adds six necessary tables: clients, projects, project_snapshots, sections, items, idempotency_records; latest schema 17 tables/8 migrations. Composite tenant relationships, source scope/type trigger, immutable initial snapshot trigger, identities/order/positive-version constraints. No answer/submission/assignment/contact/provider data/tables.
- Required same-workspace customer and explicitly selected compatible published version; DRAFT, project/item/structure version 1, AI false. All metadata/order/configuration copied by value to independent snapshot/operational IDs. Later template publication and edits to another project's operational copy do not alter existing snapshots; project reads do not consult live catalog content.
- Existing five API contracts only: GET/POST clients, GET/POST projects and GET project detail. Exact DTO envelopes, list Summary, search/combined type/state filters, bounded pagination and stable sort. Standard problem/trace IDs/no-store, CSRF and default deny retained. Owner-only creation; member data is empty/hidden until actual T13 assignments exist; cross-tenant/missing/inactive scope 404; forbidden owner action 403; revoked identity 401.
- Write gating reuses existing server-time trial/period/grace predicate and workspace state with locked plan reads. No project cap or provider budget invented/consumed. Creation idempotency is actor/workspace-route scoped with canonical request hash and 24-hour result; same input replays 201, changed input 409, expiry permits a fresh creation. Atomic rollback tested at snapshot, section, item and idempotency persistence stages, plus concurrent requests and membership/owner/plan changes while the actual DB lock wait is observed.
- Added **64 ProjectFoundationTests** preserving all prior 406 tests; schema expectations advance to V8/17 tables and old project-list denial assertion moves to an unimplemented descendant. Original guide says initialize answers in its broad inventory; this task explicitly forbids creating response/submission data, so no answer records/tables are fabricated. Initial required/remaining counts derive from real copied items, submission/approval counts zero; unanswered visibility dependencies start hidden and remain intact for later answer evaluation.
- Focused final project suite: **64 passed, zero failures/errors/skips**. Initial compile/import and raw JDBC Instant bindings were corrected using existing Timestamp conventions; an escaped-underscore search fixture was corrected because two synthetic type titles contain literal underscores. Failed runs were not counted as acceptance. No security/validation relaxation or disabled test.
- First full clean verify passed **470 tests, zero failures/errors/skips**, executable JAR. A final exact ProjectSummary projection/field-set assertion was then added; final full regression, frontend and real HTTPS results are recorded after completion below. No full MVP or deployment acceptance claim. Existing T04 hosted CI, T05 resend/provider and T06 deployment/retention limits remain pending.

- **PASS final after exact summary projection:** `backend\mvnw.cmd clean verify`: **470 tests, 0 failures, 0 errors, 0 skipped** (406 existing + 64 new). Flyway V1–V8/checksums, Hibernate mappings, clean DB/V7 upgrade, original catalog seeds, tenant/session/security regressions, SQL constraints, concurrent creation/revocation/plan gating, full rollback, immutable snapshot independence and executable JAR passed.
- **PASS frontend:** **72 tests across 3 files**, zero failures, with existing isolated one-thread Vitest configuration. No frontend application/UI source changed.
- **PASS real HTTPS:** explicit RealAuthenticationBrowserCheck **2 tests, zero failures/errors/skips**, actual Edge/Vite/Spring/PostgreSQL, MSW off. Existing authentication/session/registration/workspace/selection/revocation/cross-tab flows preserved. Extended onboarding uses the unchanged wizard to create a customer, select that existing customer thereafter, choose real server-returned templates, save WEBSITE/WEB_APP/MOBILE_APP projects as DRAFT, validate actual detail against frontend runtime schema and reload each successfully. Java verifies three persisted projects/snapshots and all three types. Isolated test certificate bypass and synthetic-only data/providers; no public deployment acceptance claim.
- **T10 Complete** for the roadmap creation/independent-snapshot acceptance and this Part 1 scope. **M2 In progress.** No remaining local T10 blocker. Structure editing/general overrides (T11), preview/grants (T12), assignments/invitations/member project reads (T13) and response/submission/lifecycle features remain closed/deferred; no later task is claimed complete. Existing T04/T05/T06 gates remain independent.

T10 implementation/regression commit: `0e14422`. Real HTTPS all-type wizard acceptance commit: `35f0c41`. No push.


## T11 Part 1 — independent project structure editing — 28 October 2026

M2 remains In progress. [Exact contracts, package tree, migration, validation, commands and file manifest](T11_STRUCTURE_EDITOR.md). Implemented section/item creation, metadata/schema editing, soft disable/re-enable, exact scoped reorder and full-result validation using the existing catalog validator. Eight field types and all agreed repeater/visibility settings are preserved. V9 adds safe transactional structure audit records; V1–V8, supplied specs, original catalog definitions, initial snapshots and dependency locks are unchanged.

Project-row database locking, expectedStructureVersion/currentVersion conflicts, transactional rollback, current account/session/member/plan checks and owner-only least privilege are enforced. DRAFT/ACTIVE/PAUSED permit edits; closed states reject. Tiny frontend contract fixes supply new URL/multi-select defaults, preserve AI settings and support conflict recovery; no redesign. T12 preview, T13 grants/assignments, client submission/review/lifecycle commands remain outside scope.

T11 remains In progress for the guide's submitted-content reopen/schema-revalidation integration: Part 1 fails closed with REOPEN_REQUIRED instead of faking revisions when collected work exists. Existing roadmap and FE01–FE07 mock-only evidence, T01–T10 history and T04 hosted CI/T05 resend-provider/T06 deployment gates remain unchanged. No push.

Final verification: **554 backend tests** (all original 470 + 84 T11 cases), **74 frontend tests/3 files**, and **2 explicit real HTTPS browser tests**, all zero failures/errors/skips. Strict TypeScript, production build, lint, formatting, Flyway V1–V9/Hibernate/restart/upgrade and executable JAR checks passed. Original specifications, V1–V8, catalog bytes and dependency lockfiles are unchanged. Full mocked visual/PWA/deployment/provider suites were not rerun. Implementation/regression commit `995728c`; frontend/HTTPS integration commit `2ca9345`. No push. Detailed verification and corrections are recorded in docs/T11_STRUCTURE_EDITOR.md.


## T11 Part 1 resume and frontend tooling organization — 28 October 2026

The prior T11 implementation and evidence were already committed and were preserved. Authorization/limit/concurrency/rollback tests were inspected; one combined malformed-JSON fixture was separated into two intended cases. No backend production behavior, original specifications/templates, security policy or applied migration changed. The focused suite now has 85 cases; M2/T11 status and deferred submitted-content reopening boundary remain unchanged.

Browser suites now live under frontend/tests/{e2e,pwa,integration/real-auth}; the Java HTTPS launcher and Vite-relative paths follow the move. Browser results/logs/compiler caches use ignored frontend/.artifacts. Required root configurations and the resolved dependency lockfile are retained. The new frontend/scripts/Verify-Frontend.ps1 runs checks sequentially with optional -Browser -Pwa. [Exact cleanup/file inventory, commands, current verification and remaining gates](T11_RESUME_AND_FRONTEND_ORGANIZATION.md).

Final resume evidence: **85 focused T11 cases**, **555 backend clean-verify tests** (original 470 + 85), **74 frontend tests**, **2 real HTTPS tests with MSW off**, and **1 production PWA test** passed. TypeScript/build/lint/format and the final Windows PowerShell 5.1 core verification wrapper passed. Responsive mock browser coverage exercised 57 scenarios: latest full run 54 passed/3 timing failures, followed by all 3 passing unchanged on isolated rerun; this is not a clean single-run 57/57 claim. No assertions/timeouts were weakened. T11 Part 1 is verified; full T11/M2 remain In progress for the existing submitted-content reopening boundary. No T12/T13, security, application source, applied migration, original specification/template or dependency-resolution change. Commits: `ec3f44d` test correction, `a07808e` organization/HTTPS paths. No push.


## T11 Part 2 and complete frontend source organization — 29 October 2026

Requested feature-owned frontend structure is implemented without a UI redesign or dependency change. App/router/store, feature api/components/pages/schemas/types, shared components/hooks/types/utils, layouts, shared API services, env and global style entry are in place. Unit tests live in tests/unit; browser suites retain their organized directories; generated artifacts remain ignored. [Current directory map](../frontend/ARCHITECTURE.md), [Part 2 rules, endpoints, reproduction and evidence](T11_PART2.md).

ProjectStructureMutationPolicy assesses the complete validated structure under the existing scoped project lock, including transitive old/new visibility dependencies and section enabled transitions. It returns immutable affected/draft/revision ID sets; unsupported collected-work semantic changes reject with REOPEN_REQUIRED before SQL even when reopenAffected=true. Metadata/reorder preserve IDs/state/revision markers, independent additions remain possible, and hard deletion/identity mutation is rejected. No fake submission/reopening system, new API, migration or duplicated authorization/persistence. All 19 project classes stay in existing feature subpackages. V1–V9, original templates/specifications and dependency resolution are unchanged.

**Final evidence:** 110 focused T11 tests; full clean verify **580 tests, 0 failures/errors/skips** (555 prior plus 25 new); final exact concurrent-authorization assertions **4/4**; frontend **74/74 across 3 files**; TypeScript/build/lint/format passed; full responsive browser run **72/72, 0 failures**; production PWA **1/1**; real HTTPS/MSW-off **2/2**, zero failures/errors/skips. PostgreSQL revocation/demotion/archive/version lock-wait races, rollback, tenant/security, V9/Hibernate/restart and executable JAR checks passed. Existing chunk-size advisory remains.

Earlier responsive 71/72 and HTTPS 1/2 runs failed and are documented, not counted as passes. Fixed test readiness around lazy page/RTK queries/API navigation and clock advancement, explicit wizard button semantics and ignored artifact watching. Auth styling coverage is split into six independent cases per viewport without reducing assertions or raising timeouts. Final complete suites passed after fixes.

**Full T11 remains In progress** for real draft revalidation and submitted/approved revision reopening acceptance requiring T14–T17/T22 persistence. Part 2's bounded safety/integration work is verified. **M2 remains In progress**; T12/T13 and client/review workflows were not implemented. T04 hosted CI, T05 provider/resend and T06 deployment/proxy/key/retention gates remain pending. No remote push or full-MVP claim.

Implementation commits: `4914c1d` frontend organization/regression readiness; `cbfa778` backend collected-work policy/tests. Documentation follows in a separate commit. No push.


## T12 Part 1 — client contacts and read-only owner preview — 29 October 2026

**T12 Complete** for its documented roadmap acceptance: client contacts and a preview that exposes no live client session. **M2 remains In progress.** [Exact scope decisions, API/DTO contracts, package trees, migration, files, commands and verification](T12_CLIENT_CONTACTS_AND_PREVIEW.md). T01–T11 history and all later task statuses are preserved.

Reused T10 ProjectCustomer/list/create and clientId association. Added only catalog customer-name PATCH with numeric expectedVersion, scoped contact GET/POST, and authenticated owner preview GET. Additive V10 creates project_contacts and a composite project/customer FK; existing rows survive V9 upgrade, V1–V9/original specs/templates/dependency resolution remain unchanged. Live JWT/session/workspace/member/plan/project authorization and CSRF/CORS/default-deny are preserved. Same project/email duplicates reject, foreign or unrelated association is hidden, and a contact row creates no account/member/invitation/session/email.

Preview reads independent operational structure with stable ordered IDs and shared client field presentation; disabled and unanswered conditional requests are omitted. Explicit null-answer preview projection, empty assets/comments, canEdit=false and no AI/upload/submit APIs prevent impersonation or persistence. All 24 project classes remain in proper subpackages. Frontend features/clients owns query/commands, schemas/types and management components; project preview owns its API/schema/types and uses TypedValue's safe preview mode. Real invitation/revoke controls are explicitly deferred; mock demos remain opt-in with no production fallback.

**Final PASS:** focused T12 **40/40**; backend clean verify **620 tests, 0 failures/errors/skips** (all 580 prior plus 40), including existing T11 110-case regression; frontend **87/87 in 4 files** (74 prior plus 13); strict TypeScript/production build/zero-warning lint/format passed; complete desktop/tablet/phone browser suite **75/75, 0 failed** (all 72 prior plus 3); production PWA **1/1**; final real HTTPS/MSW-off **2/2**, zero failures/errors/skips. PostgreSQL isolation/concurrent duplicates/rollback/FKs/V9 upgrade/restart, Flyway/Hibernate validation and executable JAR passed. Original packaged template bytes verified. The existing bundle-size advisory remains.

Failed attempts are documented and not counted as passes. New mock preview default-enabled mismatch caused 3 new responsive failures with the prior 72 passing; fixed and covered by an added HTTP regression. Auth unit per-character typing hit two existing 5-second budgets; normal paste/input now exercises the same real form/API without changing assertions or timeouts, while full browser keyboard coverage remains. The final whole wrapper and final HTTPS rerun passed after all source changes. No arbitrary sleeps, skipped tests or security relaxation.

No remaining local T12 acceptance blocker. T11 remains In progress for real draft/revision reopening dependencies. T13 team invitations/assignments, T14 invitation delivery/exchange/client sessions, T15–T17 collection/review and T22 lifecycle were not implemented. T04 hosted CI, T05 provider/resend and T06 production deployment/proxy/key/retention gates remain pending. No full-MVP/provider/deployment claim or remote push. Backend foundation commit: `73aa4a4`; frontend/integration and documentation are separate commits.

T12 implementation commits: `73aa4a4` backend and `f5af935` frontend/real-browser integration. Exact file manifest and final evidence are in T12_CLIENT_CONTACTS_AND_PREVIEW.md. No push.


## T13 Part 1 — verified Complete (30 October 2026)

Team invitations/verified acceptance, reserved seats, member administration/reauthenticated ownership transfer and project assignments are implemented with live tenant/session authorization, transactional audit/idempotency and the existing encrypted delivery infrastructure. V11 alone adds scoped metadata/assignment persistence; V1–V10 and supplied specifications/templates remain unchanged. The frontend uses real catalog routes and assigned-only navigation; undocumented pre-acceptance assignment staging is removed.

Final acceptance passed. Full backend clean verify passed **657 tests** (620 preserved + 37 T13 cases), including the final lock-wait expiry/workspace-state cases. Frontend 97 tests and strict TypeScript/build/lint/format pass. Both real HTTPS lifecycle tests pass after fixing actual accepted-workspace routing and identity/bootstrap ordering. The final complete responsive run passed **75/75** and production PWA verification passed **1/1**. Earlier navigation/session defects and the development-reload interruption are documented with their fixes; no failed final cases remain. [Full contract, architecture, file and evidence record](T13_TEAM_COLLABORATION.md).

**T13 Part 1 Complete**; no remaining local T13 blocker. Backend commit `aca9494`; frontend commit `01f06ff`; documentation follows separately. M2 remains In progress independently for T11 real collected-work reopening/revalidation dependencies (T14–T17/T22). T04 hosted CI, T05 provider/resend and T06 deployment/proxy/key/retention gates remain pending. No client collection/review workflow, full MVP/provider/deployment claim or remote push.


## T14 Part 1 — secure project client access — 30 October 2026

**T14 Complete** for invitation, passive-GET safety, explicit exchange and independent session acceptance; **M3 In progress**. [Exact files, APIs, architecture trees, V12, expiry/revocation, scope and commands](T14_CLIENT_ACCESS.md). Existing project contacts become grants only on explicit owner issuance; no client account or workspace membership is invented. One-use fragment credentials, encrypted delivery, seven-day/24-hour-idle opaque HttpOnly cookies, live tenant/project checks and transactional revocation preserve agency isolation. Current client-safe independent structure renders read-only with no fake responses or future write APIs.

Final evidence: **697 backend tests, 0 failures/errors/skips** (657 preserved + 40 T14); **114 frontend unit tests / 6 files**; strict TypeScript/build/lint/format passed; **2 real HTTPS lifecycle tests with MSW disabled**, **75 responsive browser cases in one complete run**, **1 production PWA case**, all passing. Real portal desktop1440/phone360 screenshots inspected. PostgreSQL one-use concurrency, rollback, migration upgrade/restart, Hibernate validation and executable JAR checks passed. Early failed expectations/selectors/recovery are recorded in the focused document; only final completed runs are counted.

V1–V11, original specifications/templates and dependency resolution are unchanged. T11 collected-work reopening remains In progress; T15–T17 answers/autosave/submissions and T22 publication remain deferred. New DRAFT projects cannot issue invitations before publication; HTTPS uses a trusted ACTIVE fixture rather than a fake publish endpoint. Provider fakes do not close T04 hosted CI, T05 real provider/resend or T06 production proxy/key/retention gates. No push or full-MVP claim. Backend commit `2db3caa`; frontend/docs commits recorded in the focused document.


## T15 Part 1 - persistent client drafts and autosave - 30 October 2026

**T15 Part 1 Complete** for the requested non-upload typed editor/draft/autosave scope. **M3 remains In progress**. [Exact files, feature trees, V13, API/value contracts, validation, concurrency/recovery, commands and evidence](T15_CLIENT_DRAFTS.md). Original Section22 T16 autosave/T18 uploads and T17 submission tasks retain their original labels/statuses; this request explicitly includes bounded autosave/conflict integration in T15 without claiming full later-task acceptance.

V13 adds only mutable project-shared answers with scoped stable item/contact foreign keys and independent versions. No answer, explicit clear and empty typed work remain distinct. T14 client-cookie/session authorization, agency separation, CSRF/CORS, project locking and content-free transactional audit are preserved. Existing non-upload types and repeater columns validate against live configuration; FILE/IMAGE writes remain unavailable. Shared visibility retains hidden drafts and drives operational progress. T11 sees DRAFT collected work and rejects unsafe semantic mutation with REOPEN_REQUIRED; metadata/reorder preserve answers/IDs and immutable initial snapshots.

Frontend RHF/Zod/RTK integration provides800ms debounce, one writer per item, immutable retry operations, server-confirmed Saved status, bounded backoff/Retry-After, explicit conflict comparison and volatile recovery. Section navigation waits for visible saves; unload warns; opening a replacement session explicitly clears old-contact buffers only after a recovery choice. No localStorage/sessionStorage/private PWA cache becomes draft persistence. No upload/submission/review APIs or functional final Submit action are introduced.

**Final evidence:** backend clean verify **728 passed, 0 failures/errors/skips** (all697 baseline +31 new); frontend **133 passed across7 files** (all114 baseline +19 new); strict TypeScript/build/lint/format passed; real HTTPS/MSW disabled **2 passed**, including PostgreSQL save/navigation/reload/update, select/multi/URL/repeater inputs, offline recovery, competing edits/reconciliation, T11 protection, revocation and mobile layout. Complete responsive suite **75/75 in one run**; production PWA **1/1**. Final360px draft screenshot inspected. Flyway V1-V13, Hibernate validation, restart, isolation/rollback/concurrency and executable JAR passed. Earlier failed baseline expectations, blur/conflict handling, focus readiness and concurrent-run timeouts are documented; no skipped assertions or inflated timeouts.

Original specifications/templates, V1-V12 and dependency manifests/locks are unchanged. T11 real draft revalidation/submitted reopening, T22 publication and T04 hosted CI/T05 provider-resend/T06 production deployment gates remain pending. DRAFT projects still require future publication before issuing links. Tests use synthetic data/provider fakes, with no real email or full-MVP claim. Backend commit `a52d9e8`; frontend `e3f5241`; final documentation/copy correction follows separately. No push.

## User-requested M3 / T16 Part 1 — private attachments (2026-10-30–31)

**Part 1 implemented and locally verified. T16 remains In progress; M3 remains In progress.** V14 private metadata/reservations, actual private S3 transfers, mandatory clamd verification, sandboxed PNG/JPEG derivatives, durable bounded jobs/cleanup, live client/agency permissions, subscription write restrictions, T15 READY UUID references and real upload UI are implemented. Unknown/slow verification is reconciled against the same asset; no duplicate reservation or false success is created.

Final results: **808 backend tests** (728 preserved + 80 new; zero failures/errors/skips), **80 focused attachment checks**, **144 frontend unit tests** (133 preserved + 11 new), **2 actual HTTPS lifecycles with MSW disabled**, **75 responsive browser cases in the complete run**, and **1 production PWA test** passed. TypeScript, production build, lint and formatting passed. Full-definition ClamAV malware rejection and disposable local setup/idempotency passed. Clean Flyway migration/restart/Hibernate validation and executable JAR packaging passed. The existing bundle-size warning remains. No failed or isolated rerun was substituted for a clean complete run.

Remaining T16 gates: live production storage/IAM/CORS/lifecycle and scanner monitoring, deployed WebP/HEIC/HEIF decoder/device acceptance, and an agreed agency file-library data-list/detail contract absent from the supplied catalog. No undocumented public endpoint or production mock fallback was added. Future immutable revision retention/reopening/publication must integrate with the existing fail-closed boundaries. T04 hosted CI, T05 provider/resend, T06 deployment/TLS, T11 reopening and T22 publication remain pending. No T17 submissions/review workflow was implemented. The original roadmap labels/history and supplied specifications remain unchanged.

See [T16 report, exact files, APIs and evidence](T16_PRIVATE_ATTACHMENTS.md) and [backend setup commands](../backend/README.md).


## M3 / T17 Part 1 — immutable item submissions — 31 October 2026

**T17 Part 1 Complete for the documented submission/withdrawal and immutable-history acceptance; M3 remains In progress.** The guide/catalog item-level submit and withdraw contracts now persist immutable revision/schema/value/structure snapshots, exact retained READY file links, contact/time attribution and content-free transactional integration events. V15 alone is additive; V1–V14 and supplied specifications/templates remain unchanged. Existing scoped auth, CSRF, PostgreSQL locks, optimistic versions, audit and actor-bound idempotency are preserved. T11 semantic changes remain409 REOPEN_REQUIRED; no later review-decision, project-reopen, approval or export feature is implemented.

Backend clean verify: **863 passed, 0 failures/errors/skips** (808 preserved +55 new). Focused submission/storage run: **91 passed** (36 previous storage +55 new). Frontend: **161 tests across9 files passed** (144 preserved +17 new); strict TypeScript/production build/lint/format passed. **2 real HTTPS lifecycles with MSW disabled, 75 responsive cases in one complete final run, and1 production PWA case passed**, all with zero final failures. The earlier complete responsive run had72 passes/3 failures from stripped legacy mock snapshot fields; compatibility was corrected and the full75-case suite rerun without skipped assertions or increased timeouts. The existing bundle-size advisory remains. Earlier failing stages are recorded in the focused report and are not counted as passes.

Client final confirmation waits for autosaves/verified uploads, uses one in-flight idempotent action, preserves errors/drafts, and reloads authoritative read-only state. Withdrawal preserves history. Agency assigned readers can see exact submitted versions; queue review access is separately protected. [Exact contracts, package trees, migration, validation, immutable retention, file manifest and verification](T17_CLIENT_SUBMISSIONS.md).

Independent gates remain open: T04 hosted CI, T05 real provider/resend, T06 deployment/TLS/retention, T11 collected/approved reopening/draft revalidation, T16 production storage/scanner/codec/camera and agency file-library contract, and T22 publication/lifecycle. T16 and M2/M3 remain In progress. Original T01–T16 evidence and roadmap labels are preserved. No production provider or full-MVP claim; no push.

T17 implementation commits: `616acb5` and `ae0183d`; frontend/integration: `0d41e8e`. Final documentation commit and clean working tree are reported separately. No push.


## T18 original-roadmap scope reconciliation — 1 November 2026

The new attachment calls T18 agency review, but explicitly requires the original specification to govern discrepancies. Section22 defines T18 as Private upload reservations and quota; comments/review decisions remain T21. Existing T16/T17 private-upload/immutable-retention work is preserved. No new review subsystem, approval, comment, export, or migration. Quota problems now include safe usedBytes/availableBytes, including outstanding reservations in the available calculation. Current focused storage suite:42 passed, zero failures/errors/skips (40 preserved +2 quota HTTP cases). Final current-code verification passed:865 backend tests (863 preserved +2 new),161 frontend unit tests, strict TypeScript/production build, zero-warning lint/formatting,2 real HTTPS lifecycles with MSW disabled,75/75 complete responsive cases and1/1 production PWA. Fresh/upgrade/restart Flyway, Hibernate validation and executable JAR packaging passed. T18 is Complete for its original private reservation/quota acceptance; no later review workflow is claimed. Implementation commit:`68a7d35`. The existing bundle-size advisory remains nonfatal. M4 remains In progress. [Exact scope, contracts and evidence](T18_AGENCY_REVIEW.md). T04/T05/T06/T11/T16/T22 gates remain open.


## M4 / T19 — scanner, canonical copy and image variants — 1 November 2026

**T19 Complete for original-roadmap local acceptance; M3 and M4 remain In progress.** Findings were recorded before production edits in [T19_IMPLEMENTATION.md](T19_IMPLEMENTATION.md). Existing private canonical writes, quota and immutable history are preserved. ClamAV requires a complete framed clean verdict; decoder outputs independently enforce bounded PNG chunks/CRCs/dimensions and stripped metadata without host pixel decompression. The matching t19 worker removes orientation metadata after normalizing pixels. Existing environments must explicitly select the rebuilt image. No new API, migration, dependency, UI redesign or later task.

Final evidence:110 focused attachment tests,889 backend tests (865 preserved +24 new),162 frontend unit tests (161 preserved +1 deterministic client/agency race regression), strict TypeScript/production build, zero-warning lint/formatting,2 actual HTTPS lifecycles with MSW off,75/75 responsive cases in one complete current-source run and1/1 fresh production PWA passed. Flyway/Hibernate/restart and executable JAR checks passed. The existing bundle-size advisory remains.

Earlier runs are recorded accurately:5 focused image/retry failures were fixed in the actual worker;1 full-backend catalog session setup error was addressed with deterministic fixture time without changing production security;1 initial HTTPS cross-tab error did not recur and has better redacted diagnostics; the first responsive run was74/1, then an invitation/bootstrap race was reproduced and corrected without weakening assertions/timeouts. Initial anonymous agency bootstrap now leaves the independent client API intact; explicit logout/authenticated-session loss still clear both caches. The final full responsive run passed75, not isolated reruns.

T04/T05/T06/T11/T16/T22 and production storage/scanner/codec/device gates remain open. Original specifications, templates and V1–V15 are unchanged. Commits:`cab063b`, `7bd34a1`, `74f277d`, `a6b7a3b`; final documentation hash and working tree are reported separately. No push.


## M4 / T20 Part 1 — phone upload queue and original option — 1 November 2026

**Software changes implemented and locally verified; T20 remains In progress and M4 remains In progress.** The original acceptance remains **Real-device photo and error journeys pass**. Physical iOS/Android devices are unavailable; native camera/photo-picker, device-network recovery and deployed codec acceptance remain pending. Desktop browsers at mobile widths do not close this gate.

Existing `features/client/` and T16–T19 APIs/storage are reused. A bounded three-transfer queue now reports actual XHR progress, captures per-file original choices, reconciles lost reservation/finalize acknowledgments, retries with stable keys, pauses offline, cancels unfinalized work safely, handles unmount/authorization/quota errors, refreshes terminal server states and offers separate private original downloads. No browser-termination persistence promise. No duplicate client-portal feature, HTTP client, backend change, API contract/migration/dependency change, T21+ implementation or specification edit.

Final current-source evidence: **21 focused frontend upload tests / 1 file**, strict TypeScript/production build, changed-file zero-warning lint/format, **1 real HTTPS lifecycle with MSW disabled (0 failures/errors/skips)** and **3/3 focused responsive upload cases** (1440/768/360) passed. Desktop/phone screenshots inspected. Earlier HTTPS selector ambiguity and missing rejection-metadata refresh were corrected before the final complete selected run. Existing bundle-size advisory remains. Full889 backend, unrelated frontend tests, full75 responsive and PWA were intentionally not rerun because their production areas did not change. Historical T19 results are not represented as T20 reruns.

[Exact files, retry/cancel/original/security behavior, commands, evidence and device checklist](T20_PHONE_UPLOAD_QUEUE.md). Implementation commit `12292a8`; final documentation commit reported separately. T04/T05/T06/T11/T16/T22 and production/device gates remain open. No push.


## M4 / T21 Part 1 — comments and review decisions — 1 November 2026

**T21 Complete for original-roadmap local acceptance; M4 remains In progress.** The original title includes comments as well as decisions, so both agency/client discussion and strict internal-note isolation are implemented. Existing T17 immutable submissions and T13 independent review/export permissions are reused. V16 alone adds append-only decisions/comments with scoped FKs, actor/visibility constraints and unique exact-revision decisions; V1–V15 and supplied specifications/templates remain unchanged. ACTIVE/writable project review transitions SUBMITTED to APPROVED or CHANGES_REQUESTED; change requests copy the exact snapshot to a separate versioned draft and atomically record client-visible feedback, reviewer identity/time, audit and idempotent response. No T22 lifecycle/reopen/completion API.

Live Review navigation, queue/history, explicit exact-version confirmation, stable retry keys, historical-decision display, client feedback/replies and agency/internal notes use existing RTK transport. SQL filters internal comments before client serialization; real collected-content schemas accept safe feedback while owner preview remains unchanged/read-only.

Evidence:23 initial focused review checks passed; full backend executed913 cases (889 preserved +24 review):896 passed and17 failed only on stale schema totals. Exact expectations were updated to16 migrations/30 tables; all17 failed cases then passed via focused Maven verify, including Boot JAR packaging. **This is passing coverage across the full run plus targeted correction, not a subsequent one-shot913 green run.** A prior engine-unavailable attempt reported288 tests/16 infrastructure errors and is not counted as successful. No production backend edits occurred between the913 run and17-case repair. Final frontend44 tests /3 files, strict TypeScript/build, changed-file zero-warning lint/format and1 actual HTTPS lifecycle with MSW disabled passed. HTTPS demonstrated internal-note exclusion, revision2 feedback, client resubmission3, historical denial and exact approval with unchanged previous snapshot. The initial empty-only client-comment schema failure was fixed and regression-tested before the final passing lifecycle. Unrelated responsive/PWA/frontend suites were intentionally not rerun.

[Exact contracts, concurrency/security, tests, limitations, commands and file manifest](T21_REVIEW_DECISIONS.md). Backend `817c206`; frontend `4e93b88`; documentation commit reported separately. T20 physical-device acceptance, T04/T05/T06/T11/T16/T22 and production gates remain pending. No push or full-MVP claim.


## T22 project lifecycle and reopening — 2 November 2026

T22 Complete for original-roadmap local acceptance: publication, pause/resume, shared-evaluator completion, explicit project/item reopening, archive/restore, and real T11 draft revalidation are integrated. T11 local reopening dependency/editor acceptance is Complete; M2 and M4 remain In progress under independent release/remaining-task gates. V17 alone adds publication metadata and append-only reopening/lifecycle history; V1–V16 and supplied specifications are unchanged.

Final full clean verify: **936 passed,0 failures/errors/skips in one complete run**, preserving913 prior cases plus23 additions. Initial affected226 checks passed; focused corrections24 plus1 route check passed. Frontend30 checks across3 files plus1 editor regression passed; TypeScript/build/changed-file lint/format passed. **1 real HTTPS lifecycle with MSW disabled passed**, replacing artificial ACTIVE setup with real publication and exercising completion/reopening/archive/restore and immutable prior snapshots. Earlier935-case run had2 obsolete expectation failures; they were corrected and the full run repeated. Earlier browser editor render failure was reproduced/fixed before the final green lifecycle. Unrelated responsive/PWA/frontend suites were intentionally not rerun.

[T22 exact contracts, transitions, security/concurrency, file manifest and evidence](T22_PROJECT_PUBLICATION_REOPENING.md). Implementation commits:8b8ae0e, a377b88. T20 physical-device acceptance, T04–T06, T16 production/storage/codec/device and T23+ gates remain pending. No push or full-MVP claim.


## T23 approved snapshot exports — 2 November 2026

T23 implementation resumed from the two uncommitted private streaming-storage additions; those changes are preserved and verified. V18 adds immutable approved manifests and durable leased PostgreSQL export jobs, ZIP/JSON/Markdown generation, explicit partial acknowledgment, private live-authorized downloads, 24-hour expiry, bounded retries and cleanup. The existing frontend export panel now uses the real queue/summary contracts through RTK Query. No T24+ feature or supplied specification/applied migration changed. M4 remains In progress.

Focused verification: streaming1 passed; export/renderer17 passed; uncertain-commit regression1 passed; frontend export/review12 passed; TypeScript/build and changed-file lint/format passed. One real HTTPS journey with MSW disabled passed ZIP download, real files and matching JSON/Markdown snapshots; initial test-harness issues were corrected before the passing run. Full backend clean verify passed **955 tests, zero failures/errors/skips in one complete run**, preserving936 existing cases plus19 additions; Flyway V1–V18/Hibernate validation/upgrade/restart and executable JAR packaging passed. The focused existing mock artifact test also passed1 case, with24 unrelated cases intentionally filtered out. T23 is Complete for original-roadmap local acceptance. Unrelated responsive/PWA suites were intentionally skipped. Existing release/provider/device gates remain unchanged. [Contracts, file manifest, operations and evidence](T23_IMPLEMENTATION.md).

T23 backend implementation commit:`f1690f6`; frontend/documentation commit and final working tree are reported separately. No push.


## T24 AI adapter and durable allowance/job boundary — 2 November 2026

Original T24 belongs to M5, not M4: **AI adapter, allowance reservation and job**, acceptance **Provider failures preserve ordinary writing**. V19 adds AI usage periods and durable client-scoped jobs; existing live grant/visibility/version/plan checks, audit/idempotency and ordinary draft persistence are reused. A concrete Responses HTTP adapter uses strict locally validated JSON, selected facts only, store=false, bounded output/body/30-second budget and at most one controlled transient retry. Worst-case cost and monthly drafts reserve atomically; unknown outcomes are conservatively charged without blind retry. No T25 acceptance/answer mutation, no paid call, no guessed production model/price and no supplied-spec/applied-migration change. M5 is In progress; prior M4 status and release/device gates are preserved.

Focused verification passed15 cases, then8 affected provider/failure cases (16 distinct T24 additions). One complete real HTTPS lifecycle with MSW disabled passed AI failure/manual writing plus preserved review/reopening/export flows. Earlier review500 was traced to a concurrent collection-repository edit removing restoreSubmission; its committed method was restored while preserving unrelated formatting, followed by clean compilation and a green browser rerun. The single full backend clean verify passed **971 tests, zero failures/errors/skips**, preserving955 baseline cases plus16 T24 additions. Flyway V1–V19/upgrade/restart/Hibernate validation and executable JAR packaging passed. Changed browser-runner lint/format passed; frontend runtime code is unchanged, so frontend unit/build/responsive/PWA suites were intentionally skipped. T24 is Complete for original-roadmap local acceptance, with production model/account/pricing/privacy/grounding and existing release/device gates preserved. The two unrelated collection-file edits remain outside the T24 commit. [Exact scope, contracts, costs, production gates and files](T24_IMPLEMENTATION.md).


## T25 client AI preview and explicit acceptance — 2 November 2026

Original M5/T25: **Client suggestion preview and acceptance**, acceptance **No automatic submission or overwriting newer answers**. T24 jobs/providers/allowances are reused. Explicit cookie/CSRF/idempotent accept delegates to the normal draft service, checks the exact base/current answer version and captured current question definition, retains the prior answer until job expiry, records ACCEPTED/audit atomically and never submits/approves. V20 alone extends the existing job; applied migrations/specifications remain unchanged. The existing AI/client feature UI now supports real preview, copy/discard/regenerate, separate confirmation, terminal states and safe autosave adoption. Owner preview stays read-only. No paid provider or T26+ feature enabled.

14 focused backend cases were verified across the initial run and targeted correction;28 distinct frontend preview/autosave/mock cases passed. TypeScript/build/changed-file lint/format passed. One complete real HTTPS lifecycle with MSW disabled passed AI acceptance/stale-write plus existing review/reopening/export checks; the single full backend clean verify passed **984 tests, zero failures/errors/skips**, preserving971 baseline cases plus13 T25 additions. Flyway V1–V20 fresh/upgrade/restart/Hibernate validation and executable JAR packaging passed. T25 is Complete for original-roadmap local acceptance. M5 stays In progress and all production/device gates remain unchanged. The two unrelated collection-file edits are preserved and excluded from commits. [Contracts, exact files and verification](T25_IMPLEMENTATION.md).


## T26 email reminders — implementation verification

Original title: **Reminder policy, outbox and email delivery**; acceptance: **No chase when all remaining work is agency review**. V21 adds durable policies/email deliveries/signed event metadata; existing shared visibility, live authorization, token service and RTK transport are reused. Owner cadence/pause/preview/send/history and live client email preferences are integrated. Conservative caps, encrypted single-use links, fenced jobs, bounded definite-failure retries and UNKNOWN no-replay protect delivery safety. T27 SMS and T28 provider reconciliation remain excluded.

19 focused backend cases and44 distinct affected frontend cases passed, with strict TypeScript/build/changed-file lint/format. The single full backend run passed1001/1002 cases; its sole failure was an outdated startup table count, corrected and verified by a passing1-test startup/restart/package rerun. Final preparation/retry verification passed2 tests and packaged the final JAR:1003 distinct backend cases verified across runs, not a one-shot full green claim. One complete real HTTPS/MSW-disabled lifecycle passed after correcting an existing autosave Saving-state readiness race without weakening saved-content checks. Flyway fresh/upgrade/restart and Hibernate validation passed. T26 is Complete for original-roadmap local acceptance; production email/domain/SPF/DKIM/webhook delivery acceptance remains pending and disabled. M5 remains In progress; all earlier gates and protected collection changes remain. [Exact contracts, files, configuration and evidence](T26_IMPLEMENTATION.md).


## T27 SMS consent, verification and suppression — 3 November 2026

Original M5/T27 acceptance: **STOP and quiet-window sandbox cases pass**. Client-owned consent/verification/withdrawal, sender-scope signed suppression, SMS segment/budget accounting and quiet-window dispatch extend the existing T26 outbox; production SMS stays disabled. V22 adds scoped SMS persistence without editing V1–V21 or supplied specifications.30 focused backend cases passed (14 new SMS plus16 reminder). The completed clean full regression passed **1017 tests,0 failures/errors/skips**, with migration/upgrade/restart/Hibernate validation and executable JAR packaging. **47 distinct affected frontend cases**, strict TypeScript/build and changed-file lint/format passed;24 unrelated filtered mock cases were intentionally skipped. One complete HTTPS/MSW-disabled lifecycle passed SMS consent/verification/withdrawal plus existing project/review/export/session flows after correcting lifecycle cache/auth readiness in the test (no weaker assertions or sleeps). T27 is Complete for original-roadmap sandbox/local acceptance. SMS remains off pending account/sender, Advanced Opt-Out/callback, price and real-device gates. T28 and later tasks are not implemented; M5 and all earlier release/device/provider gates remain. T26's original non-green one-shot history is preserved. [Contracts, configuration and evidence](T27_IMPLEMENTATION.md).


## M5 / T28 provider unknown-outcome reconciliation — 3 November 2026

T28 is Complete for original-roadmap local acceptance: **No blind retry of potentially sent messages**. Durable fenced receipt lookups, exact signed lost-ID correlation and stored-event replay resolve only supported provider evidence. Missing/inconclusive evidence remains UNKNOWN; no resend/requeue path is introduced. V23 extends existing delivery/verification rows, preserving V1–V22, quotas, STOP, explicit phone verification and all immutable content. Provider reconciliation defaults disabled.

39 distinct affected cases passed across the focused runs/corrections; the final single full backend clean verify passed **1030 tests, zero failures/errors/skips**, including migration/upgrade/restart/Hibernate checks and executable JAR packaging. Initial clock/SQL-binding test failures were corrected before the full green run. No frontend source or browser workflow changed, so frontend/build/browser/responsive/PWA checks were intentionally skipped. M5 and all previous production/provider/device gates remain open; T26 verification history is unchanged. Protected collection edits remain outside the commit. [Exact scope, contracts, files, test evidence and limitations](T28_IMPLEMENTATION.md).


## M6 / T29 safe activity and minimal browser analytics — 3 November 2026

Original T29 acceptance: **No raw answers or tokens in events**. T29 is Complete for original-roadmap local acceptance; M6 is In progress. Existing server-authoritative audit records supply safe paginated activity to owners/assigned members. Cookie/CSRF-only browser ingestion accepts only project_opened/item_started with opaque IDs and optional untrusted time; full allowlist validation, live item visibility, session pseudonyms, scoped foreign keys, atomic batches and PostgreSQL uniqueness protect privacy/integrity. Test-project exclusions are server-controlled; raw interactions expire after90 days. V24 alone adds one table and project flag, preserving V1–V23. Frontend optional telemetry cannot block writing; mocks collect no telemetry. No T30+ metric or other later feature.

11 distinct focused backend cases passed after documented fixture/pseudonym corrections. The single full backend clean verify passed **1041 tests, zero failures/errors/skips**, including Flyway fresh/upgrade/restart, Hibernate validation and executable JAR packaging. **27 affected frontend cases**, strict TypeScript/production build, changed-file ESLint/formatting and **1 real HTTPS/MSW-disabled analytics journey** passed. An additional final frontend build passed after correcting the mock integer-response contract. Unrelated frontend/responsive/PWA/provider suites were intentionally skipped. All production/provider/physical-device and earlier release gates, including T26's original verification history, are preserved. The two original collection edits are unchanged/excluded; DeliveryReconciliationRepository had no pending edit and remains unchanged. [Exact contracts, files, evidence and limitations](T29_IMPLEMENTATION.md).


## M6 / T30 friction views and sample safeguards — 3 November 2026

Original acceptance: **Incomplete observation windows are not called abandonment**. T30 is Complete for original-roadmap local acceptance; M6 stays In progress. Read-only project/template analytics reuse T29 server-timed starts, immutable first submissions, shared visibility-aware progress and live authorization. The90-day retained cohort separates7-day-open versus closed windows; rates require10 eligible starts and10 closed windows and use only the closed denominator. Observed median first-submission time exposes its completed-item sample count and excludes review delay. Template versions/stable keys/project types remain separate. No migration or aggregate archive; V24 remains latest, all supplied specs/applied migrations unchanged. No T31+ work.

8 distinct focused backend cases were verified across the initial7-pass/1-failure run and correction of the expected existing session error code. All8 shared security checks plus1 real HTTPS/MSW-disabled friction journey passed in a focused verify, including executable JAR packaging.4 new frontend checks and1 affected mock contract check passed;24 unrelated mock cases were intentionally filtered out. Strict TypeScript/production build and changed-file lint/format passed after a browser-runner formatting-only correction. Full1041-case backend regression, unrelated frontend/responsive/PWA/provider suites and infrastructure rebuilds were intentionally skipped for these read-only projections; the baseline was not rerun. Existing gates/history and both protected collection-file edits are preserved. [Exact scope, contracts, files and evidence](T30_IMPLEMENTATION.md).


## M6 / T31 owner digest and scoped status share/embed — 4 November 2026

T31 is Complete for original-roadmap local acceptance: **Token cannot reach content or file endpoints**. V25 adds hash-only status shares, own-member digest preferences and durable daily jobs; existing signing/rotation, scoped authorization, progress/submissions, request limits and provider/inbox infrastructure are reused. Status JWTs have a distinct audience/share subject, strict5-minute expiry and live revocation; counts expose only alias/approved/submitted/requiredTotal/updatedAt. Dedicated HTML embeds enforce approved exact HTTPS ancestors, and ordinary/private pages retain frame denial. Capabilities are shown once; idempotency stores only the safe share ID. Opt-in09:00 workspace-local digests rebuild live membership/assignment scope at dispatch, include optional submitted items in pending review, and never blindly retry uncertain sends. Signed digest receipts remain distinct from T28 reminder evidence; production delivery defaults off. No T32+ implementation or supplied-spec/applied-migration edits.

15 distinct new T31 backend cases were verified across focused/full/corrected runs, with existing T28 receipt regression preserved. The single full clean verify passed **1063 tests,0 failures/errors/skips**, including25 migrations/47 tables, fresh/upgrade/restart/Hibernate validation and executable JAR packaging. That full run preceded the final optional-review-count correction; the existing daily-send case and new optional-item case then passed targeted verification (the optional fixture initially needed its JSON required flag corrected). Final source was repackaged; no subsequent one-shot1064-case full run is claimed. **28 distinct affected frontend checks**, strict TypeScript/production build and changed-file lint/format passed;24 unrelated mock cases were filtered out. **1 final real HTTPS/MSW-disabled journey passed** digest opt-in/dispatch, anonymous counts, approved/denied iframe origins, private headers and revocation. Earlier browser reader initialization and fixture-clock failures were corrected without sleeps or weaker assertions. Unrelated responsive/PWA/paid-provider/physical-device/external-host checks were intentionally skipped. M6 and all existing provider/storage/device/release gates remain open. Both original collection-file edits are unchanged and excluded. [Exact contracts, files, evidence and operations](T31_IMPLEMENTATION.md).

## M6 / T32 hosted billing — 4 November 2026

T32 is Complete for explicitly authorized **local provider-fixture acceptance**: the reconciled provider subscription, never browser return parameters or webhook bodies, supplies paid entitlements. V26 adds durable account/operation/event records and narrow SYSTEM subscription auditing. Owner-only hosted sessions reuse live security, CSRF, independent account bindings, encrypted capabilities and stable provider idempotency. Signed raw-byte events deduplicate durably; fenced worker leases and sequence watermarks preserve concurrent/newer state without holding database locks across provider calls. Fifteen-minute reconciliation repairs missed events; failed jobs back off and grace remains clock-bound. Production billing remains disabled.

**16 focused backend cases and 1 real HTTPS/MSW-disabled fixture journey passed**. The single full clean verify passed **1,080 tests, 0 failures/errors/skips**, including 26 migrations/50 tables, migration/restart/Hibernate checks and executable JAR packaging. **6 frontend checks**, strict TypeScript/production build, changed-file lint and formatting passed. Compilation assertions, a duplicate heading selector and PostgreSQL CASE typing were corrected during focused verification; no failing tests were skipped. Real Stripe sandbox payment, public-host/provider, unrelated responsive/PWA and physical-device suites were intentionally not run. These remain operational/release gates; M6 stays In progress. Both protected collection files remain byte-for-byte unchanged and excluded. [Contracts, exact files and evidence](T32_IMPLEMENTATION.md).

## M6 / T33 usage and subscription states — 5 November 2026

T33 is Complete for original-roadmap local acceptance: **limits are disclosed and enforced server-side**. Owner-only usage reads actual storage, seats, AI and SMS ledgers, including reservations, and the existing plan/trial caps. Server-clock trial, grace and cancellation deadlines block writes even with no cleanup worker. Manual client drafts now honor the write policy. The 30-day read-only window preserves authorized content/export access and bounds new private download URLs; after it ends, content fails closed while billing recovery and live consent withdrawal remain available. No automatic data deletion, provider activation, migration or T34+ work. V26 and supplied specifications are unchanged.

**7 new focused PostgreSQL cases** passed across corrected runs, including exact deadlines, live authorization, quota enforcement, manual collection, concurrent saves and approved-export access. **1 real HTTPS/MSW-disabled fixture journey passed** storage-limit disclosure, grace and read-only transitions, and rejected writes while usage stayed readable. **22 distinct affected frontend checks**, strict TypeScript/production build and changed-file lint/format passed. One full clean run executed **1,087 backend tests: 1,086 passed, one legacy missing-plan read assertion failed, zero errors/skips**. The assertion now requires a known read window and preserves all eligible-read/write-denial checks. The corrected five-case focused verify passed **5/5** and packaged the executable JAR; no second clean full run is claimed. M6 and all actual-provider/public-host/physical-device/release gates remain open. Both original collection edits retain their original SHA-256 hashes and are unstaged. [Exact contracts, files and verification](T33_IMPLEMENTATION.md).

## M7 / T35 rate limits, accessibility and isolation — 5 November 2026

Local implementation adds a normalized-email login limit alongside the existing remote-address limit, strengthens accessible field associations and verifies representative keyboard flows at desktop, tablet and phone widths. Targeted PostgreSQL, provider fixture and browser runs give local passing evidence for 30 acceptance cases and partial evidence for A18. All staging results remain pending because there is no approved staging environment. The deployed model evaluation and native zoom and assistive technology checks remain open. T35 and M7 remain In progress. M6 remains In progress pending actual Stripe sandbox acceptance. [A01–A31 evidence, changed files and release gates](T35_IMPLEMENTATION.md).

## Settings interface redesign

Settings now groups account security and digest preferences, workspace details and team management, billing and usage, and privacy information. Existing billing URLs resolve to the combined Settings section. Mock scenarios remain available through the demoTools query parameter in mock mode.

The live workspace form uses the existing workspace read and update endpoints. Profile edits, inline password changes, workspace logo changes, and workspace deletion remain available in mock mode because the current backend does not expose those mutations. Live accounts can request password recovery and manage their active sessions.

Verification passed with 12 billing unit tests, three mock browser checks across desktop, tablet, and phone, TypeScript, and changed-file lint. Browser coverage includes keyboard activation and legacy billing navigation. Native 200% browser zoom and live service mutations were not exercised in this pass.

## Insights dashboard redesign

Insights now separates authorized project-list totals from the selected-project snapshot. The overview labels assigned or partial project lists explicitly, counts only ACTIVE projects in its active card, and uses the supplied required-item progress counts. The snapshot shows a section chart and collapsible status table when section data is returned. The current live analytics DTO supplies project totals and a timestamp without sections, so the live view falls back to project totals. Template friction retains the existing grouping and sample safeguards.

Verified with three Playwright viewport checks, five focused frontend tests, and eight focused backend tests, including three PostgreSQL reporting integration cases. TypeScript and changed-file lint passed. Native 200% browser zoom and assistive technology were not exercised.
