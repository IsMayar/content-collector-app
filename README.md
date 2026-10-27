# Website Content Collector

A responsive, multi-tenant web application for freelancers and small development agencies to collect client content, requirements and files for website, web application and mobile application projects. The MVP includes templates, private client access, draft saving, optional AI writing assistance, item-level review, reminders and approved ZIP, Markdown and JSON exports. The collector is a web app with a planned installable PWA shell.

## Project layout

- `frontend/`: frontend-first feature batches, with responsive layouts, authentication UI, Redux/RTK Query and explicitly enabled MSW development mocks.
- `backend/`: Java 21/Spring Boot 4.1 foundation, Maven wrapper, Flyway migrations and isolated PostgreSQL Compose setup.
- `docs/spec/`: all 10 original specification files, preserved unchanged, including the supplied README.
- `docs/IMPLEMENTATION_STATUS.md`: Section 22 milestones and task status.
- `AGENTS.md`: project scope and development rules.

Start with [the MVP guide](docs/spec/Website_Content_Collector_MVP.md). Supporting contracts, templates, schema, architecture and acceptance cases are in the same directory.

## Required runtimes and tooling

The specification calls for:

- A supported Node.js LTS meeting the selected Vite version's requirements; the guide's baseline is Node 22.12 or later on the 22 line. Node 24.3.0/npm 11.4.2 were used for the verified frontend setup; install the committed lockfile with `npm ci`.
- Java 21 JDK; the committed Maven wrapper pins Maven 3.9.16, so a separate Maven installation is unnecessary.
- PostgreSQL 18, supplied by the isolated Docker Compose setup and tested with Testcontainers.
- Local S3-compatible storage or isolated development buckets for the later file workflow; scanner and image-decoder tooling at its integration stage.

Planned libraries include React 19, strict TypeScript, Vite, Tailwind CSS v4, HeroUI v3, React Router, Redux Toolkit/RTK Query, React Hook Form and Zod. The backend uses a supported stable Spring Boot line (the guide selects 4.1), Spring Security and Flyway. Verify compatible supported versions at the relevant setup task before pinning dependencies.

## Current state

The original T01–T03 records are preserved. FE01–FE07 are tracked separately from the full-stack roadmap. The frontend now includes projects/templates, structure/team/access, client answers/uploads, exact-revision review/exports, AI/analytics/shares, billing/settings, public pages and a PWA shell against development HTTP mocks. The owner implements the backend manually. Frontend verification does not establish production or full-stack acceptance. Dependencies are pinned in `frontend/package-lock.json`; the preserved backend foundation uses Spring Boot 4.1.1.

Start the frontend from PowerShell:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; do not start Vite yet.' }
npm run dev:mock
```

Open http://127.0.0.1:5173/. Demo accounts `owner@studio.example`, `solo@studio.example` and `member@studio.example` use `ContentDemo!2026`. The development label identifies synthetic data; no email, SMS or payment is sent. Start with Projects → Lamar Dental website → Client access to open a synthetic client invitation in the same tab. Review submissions and download approved exports from the project tabs. See [frontend setup](frontend/README.md), [authentication contracts](docs/FRONTEND_BACKEND_HANDOFF.md) and [product integration/scenarios](docs/FRONTEND_PRODUCT_HANDOFF.md).

After the first install, use `npm run dev:mock` for normal frontend-only starts. Use `npm run dev` with mocks disabled to integrate the owner's API. Stop dev/preview servers with Ctrl+C before reinstalling with `npm ci`, so Windows can replace native dependencies. Verification: `npm run typecheck`, `npm run build`, `npm run lint`, `npm test`, and `npm run test:browser` (installed Edge).

## Backend setup (PowerShell)

Prerequisites: Java 21 JDK and Docker Desktop running Linux containers. The Maven wrapper pins Maven 3.9.16; application libraries are managed by Spring Boot 4.1.1's BOM.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
java -version
docker version
.\scripts\Initialize-Local.ps1
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed.' }
.\mvnw.cmd verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run
```

The script creates a random local database password in ignored `backend/.env`, preserving existing configuration. Placeholder keys are in `backend/.env.example`; process environment variables override the file. PostgreSQL runs at `127.0.0.1:5433` with database `collector_dev`, separate from other databases. The backend listens at `127.0.0.1:8080` in the dev profile.

In another PowerShell terminal:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/actuator/health'
```

Expected HTTP 200 JSON: `{"status":"UP"}`. Public account routes now include GET `/api/v1/auth/csrf` and CSRF-protected POST `/api/v1/auth/register` and `/api/v1/auth/verify-email`. CSRF-protected POST `/api/v1/auth/forgot-password` and `/api/v1/auth/reset-password` are also implemented. Registration and recovery require a persistent delivery encryption key; see the backend setup notes. All unrelated routes remain denied. T06 now implements configured login/JWT/refresh/bootstrap/logout; see [agency session setup](docs/AGENCY_SESSION_ARCHITECTURE.md). Authenticated account/session routes are available; business routes remain denied. Stop the backend with Ctrl+C; from `backend/`, `docker compose stop` stops its database without deleting data.

Flyway owns migrations under `backend/src/main/resources/db/migration`; V1 creates only the empty application schema. Hibernate validates rather than creating/updating tables. Do not execute `docs/spec/schema_reference.sql`; add feature migrations in later tasks. The verification suite uses a disposable PostgreSQL 18 container and checks clean startup, migrations, restart persistence and health/security behavior. See [backend setup notes](backend/README.md) for configuration, migration rules and official references.

Next integration step: the owner implements/confirms the documented backend API contracts, then disables mocks as described in the product handoff. T04/M0 remain In progress pending remote CI verification; M1/T05 are In progress for account registration, verification and password recovery/reset. Use `npm run test:pwa` for the production public-cache/offline check, in addition to the frontend checks above.

Use provider fakes and sandboxes during development. Keep secrets out of version control and frontend bundles; production provider credentials stay disabled until their integration stage.

## T04 verification and real-backend transport

Run frontend regression from PowerShell (stop this project's Vite/preview process before `npm ci`):

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build or TypeScript check failed.' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
npm run format:check
if ($LASTEXITCODE -ne 0) { throw 'Formatting check failed.' }
npm test -- --maxWorkers=1 --pool=threads
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
```

The existing `test` script already invokes `vitest run`; one worker limits Windows resource usage without excluding tests. With Docker Desktop's Linux engine running, the full backend check is:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
```

On 26 October 2026, frontend locked installation, strict TypeScript/production build, lint, formatting and **68 tests** passed. Backend **36 tests** passed, including PostgreSQL clean startup, Flyway validation, restart preservation and health/security checks; the executable JAR built. No tests were skipped. Both GitHub Actions workflows passed local actionlint 1.7.12 validation. No Git remote is configured, so hosted CI remains pending; these local results do not prove remote GitHub Actions passed.

For a real-backend connection, start the database/backend using the commands above, then use a second PowerShell terminal:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
$env:VITE_ENABLE_MOCKS = 'false'
$env:VITE_API_BASE_URL = '/api/v1/'
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8080'
npm run dev
```

Vite forwards `/api` under the frontend origin; production requires the same reverse-proxy arrangement. Broad CORS is unnecessary. JSON/problem JSON, `X-Request-ID`, memory-only agency bearer credentials and `X-XSRF-TOKEN` follow the [transport handoff](docs/FRONTEND_BACKEND_HANDOFF.md#t04-transport-alignment---26-october-2026). The CSRF, registration, verification and recovery/reset endpoints are implemented; login/refresh/me and persistent sessions are now implemented when signing/pepper configuration is supplied; workspace/product APIs remain pending. See [backend setup and recovery contracts](backend/README.md#t05-part-3---password-recovery-and-reset). Use `npm run dev:mock` for synthetic product journeys, not to claim real authentication works.

T04 and M0 remain **In progress** solely pending an actual remote CI run after a repository remote is configured and these commits are pushed. M1/T05 remain **In progress**; no later backend feature was implemented by this task.


T05 Part 3 verification, 26 October 2026: backend `clean verify` passed **142 tests, zero failures/errors/skips**, including all previous 104 and 38 recovery/reset cases against PostgreSQL. V1-V4 validation, restart, V3 upgrade preservation and JAR packaging passed. Real provider delivery and T06 session revocation remain pending; frontend checks were not rerun for this backend-only task.


T06 Parts 1-2, 27 October 2026: secure login, five-minute JWTs, persistent rotating refresh sessions, /me bootstrap, logout/session listing/revocation and transactional reset invalidation are implemented. Follow [the exact PowerShell key/database/startup commands](docs/AGENCY_SESSION_ARCHITECTURE.md#local-setup-and-verification); keys are explicitly generated once and kept outside Git. Backend **229 tests** and frontend auth/transport **46 tests** passed. T06/M1 remain In progress for deployment acceptance; T05 delivery/resend and T04/M0 hosted CI remain pending. No T07 workspace functionality or live inbox/browser acceptance is claimed.
