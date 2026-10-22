# Implementation status

Source: [MVP guide, Section 22](spec/Website_Content_Collector_MVP.md#22-sequential-implementation-plan). Updated 21 October 2026.

All tasks were initialized as Not started. T01–T03 are Complete. M0 is In progress; M1–M7 remain Not started.

T01 evidence: frontend/, backend/ and docs/ exist; root README documents purpose and required runtimes; all 10 docs/spec files match the supplied ZIP by SHA-256. No dependencies installed or application features implemented.

## Frontend-first plan — 22 October 2026

The owner implements the backend manually. Codex works only on frontend/ and relevant documentation. The original M0–M7/T01–T38 roadmap and all recorded progress below are preserved. Completing an FE batch does not complete corresponding backend tasks or full-stack acceptance criteria. T04 and later original tasks are not automatically advanced by this plan.

| Batch | Scope | Status |
| --- | --- | --- |
| FE01 | Architecture, design system, navigation, and authentication UI | In progress |
| FE02 | Workspace onboarding, dashboard, projects, and template gallery | Not started |
| FE03 | Project structure editor, team, access, and reminder settings | Not started |
| FE04 | Client portal, typed answers, autosave, and upload experience | Not started |
| FE05 | Agency review, comments, activity, and exports | Not started |
| FE06 | AI assistance UI, analytics, billing, and workspace settings | Not started |
| FE07 | Responsive polish, accessibility, PWA, and frontend regression | Not started |

Current authorization: FE01 only. Next frontend batch: FE02 after FE01 verification and completion.

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

| Task | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| T01 | Repository with frontend, backend and docs directories | README identifies supported runtimes and project purpose | Complete |
| T02 | React TS, Tailwind v4 and HeroUI v3 shell | Production frontend build passes and keyboard navigation works | Complete |
| T03 | Spring Boot, PostgreSQL, Flyway and health | Backend starts on a clean database; migration validation passes | Complete |
| T04 | Error format, API transport and CI | Frontend and backend checks run with pinned dependencies | Not started |

### Milestone M1 Identity and tenant foundation

Milestone status: Not started

| Task | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| T05 | Account registration, verification and recovery | Purpose-bound single-use tokens and generic recovery responses | Not started |
| T06 | JWT access, refresh rotation, logout and CSRF | Expiry, reuse and concurrent refresh tests pass | Not started |
| T07 | Workspace owner, membership and plan seed | Two tenants cannot access each other's resources | Not started |
| T08 | Agency layout and session lifecycle | Sign-in, workspace switch and cache clearing work | Not started |

### Milestone M2 Projects templates and team

Milestone status: Not started

| Task | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| T09 | Template JSON validator and catalog seed | All ten built-ins validate | Not started |
| T10 | Project creation for all three types | Template snapshot remains independent | Not started |
| T11 | Section and item editor and reorder | Keyboard reorder and structure conflicts work | Not started |
| T12 | Client contacts and read-only client preview | Preview exposes no live client session | Not started |
| T13 | Team invitations and project assignments | Seat reservation and reviewer/export flags enforced | Not started |

### Milestone M3 Client collection

Milestone status: Not started

| Task | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| T14 | Invitation email, fragment exchange and client session | A passive GET cannot consume access | Not started |
| T15 | Typed client item editors and repeaters | Server and browser enforce the same schema semantics | Not started |
| T16 | Autosave and conflict UI | Two-tab edits produce a safe conflict | Not started |
| T17 | Submission versions and withdraw | Immutable revision and exact asset references recorded | Not started |

### Milestone M4 Files review and exports

Milestone status: Not started

| Task | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| T18 | Private upload reservations and quota | Concurrent reservations remain within allowance | Not started |
| T19 | Scanner, canonical copy and image variants | Unsafe staging bytes never become public READY content | Not started |
| T20 | Phone upload queue and original option | Real-device photo and error journeys pass | Not started |
| T21 | Comments and review decisions | Internal comments never reach clients; decision race handled | Not started |
| T22 | Project completion, reopening and archive | Progress and lifecycle guards use the same evaluator | Not started |
| T23 | Immutable approved export manifest and jobs | Partial exports labeled; all three formats match snapshots | Not started |

### Milestone M5 Assistance and reminders

Milestone status: Not started

| Task | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| T24 | AI adapter, allowance reservation and job | Provider failures preserve ordinary writing | Not started |
| T25 | Client suggestion preview and acceptance | No automatic submission or overwriting newer answers | Not started |
| T26 | Reminder policy, outbox and email delivery | No chase when all remaining work is agency review | Not started |
| T27 | SMS consent, verification and suppression | STOP and quiet-window sandbox cases pass | Not started |
| T28 | Provider unknown-outcome reconciliation | No blind retry of potentially sent messages | Not started |

### Milestone M6 Reporting commercial readiness and visibility

Milestone status: Not started

| Task | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| T29 | Server activity and minimal browser analytics | No raw answers or tokens in events | Not started |
| T30 | Friction views and sample safeguards | Incomplete observation windows are not called abandonment | Not started |
| T31 | Owner digest and scoped status share/embed | Token cannot reach content or file endpoints | Not started |
| T32 | Hosted checkout, webhook processing and portal | Sandbox subscription is source of entitlements | Not started |
| T33 | Usage UI, trial, grace and read-only states | Limits are disclosed and enforced server-side | Not started |

### Milestone M7 Public MVP release

Milestone status: Not started

| Task | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| T34 | PWA manifest, public-only cache and mobile polish | No cached private content after logout | Not started |
| T35 | Rate limits, accessibility and full isolation regression | A01-A31 pass in staging | Not started |
| T36 | Backups, restoration and operational runbook | A32 demonstrated | Not started |
| T37 | Real-device, performance and provider launch checks | Documented targets measured and failure handling verified | Not started |
| T38 | First pilot onboarding and release review | Public MVP checklist complete; no unsupported product promises | Not started |

MVP completion means M0 through M7 are implemented and verified. It is reasonable to invite controlled email-only development testers after M4, but do not call that the full feature-complete MVP described here.
