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

- A supported Node.js LTS meeting the selected Vite version's requirements; the guide's baseline is Node 22.12 or later on the 22 line. Use npm and commit the resolved lockfile when T02 is implemented.
- Java 21 JDK and Maven; add the Maven wrapper during T03.
- PostgreSQL 18 as the reference database; confirm the supported provider major and test against that exact major during T03.
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

Expected HTTP 200 JSON: `{"status":"UP"}`. Only GET on this health path is public; other requests return 403 until authentication is implemented. No login or feature endpoints exist. Stop the backend with Ctrl+C; from `backend/`, `docker compose stop` stops its database without deleting data.

Flyway owns migrations under `backend/src/main/resources/db/migration`; V1 creates only the empty application schema. Hibernate validates rather than creating/updating tables. Do not execute `docs/spec/schema_reference.sql`; add feature migrations in later tasks. The verification suite uses a disposable PostgreSQL 18 container and checks clean startup, migrations, restart persistence and health/security behavior. See [backend setup notes](backend/README.md) for configuration, migration rules and official references.

Next integration step: the owner implements/confirms the documented backend API contracts, then disables mocks as described in the product handoff. The original T04+ statuses remain unchanged. Use `npm run test:pwa` for the production public-cache/offline check, in addition to the frontend checks above.

Use provider fakes and sandboxes during development. Keep secrets out of version control and frontend bundles; production provider credentials stay disabled until their integration stage.
