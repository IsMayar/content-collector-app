# Website Content Collector

A responsive, multi-tenant web application for freelancers and small development agencies to collect client content, requirements and files for website, web application and mobile application projects. The MVP includes templates, private client access, draft saving, optional AI writing assistance, item-level review, reminders and approved ZIP, Markdown and JSON exports. The collector is a web app with a planned installable PWA shell.

## Project layout

- `frontend/`: React and TypeScript application foundation with routing, Tailwind/HeroUI styling and Redux/RTK Query.
- `backend/`: planned Spring Boot modular monolith; currently an empty directory.
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

T01 and T02 are complete. The frontend foundation runs independently of a backend; authentication and product features are not implemented. Verified frontend tools: Node 24.3.0 and npm 11.4.2. Backend runtimes remain unverified. The exact dependency tree is recorded in `frontend/package-lock.json`.

Start the frontend from PowerShell:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm ci
npm run dev
```

Open http://127.0.0.1:5173. You should see the Welcome placeholder with responsive navigation and an About page. Run `npm run typecheck` and `npm run build` in the same directory to verify it. See [frontend setup notes](frontend/README.md) for architecture, official setup references and production preview instructions.

Next is T03: Spring Boot, PostgreSQL, Flyway and health. Backend ports, environment examples and migration instructions will be documented when that task is implemented.

Use provider fakes and sandboxes during development. Keep secrets out of version control and frontend bundles; production provider credentials stay disabled until their integration stage.
