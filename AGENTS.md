# Project instructions

## Scope

Build one responsive, multi-tenant web app for freelancers and small agencies collecting client text, requirements and files for WEBSITE, WEB_APP and MOBILE_APP projects. Include templates, project-scoped client access, drafts, optional fact-based AI assistance, immutable submissions, review, email/opt-in US SMS reminders, progress reporting, counts-only status sharing, billing and approved exports. The collector has a PWA shell; native collector apps, direct CMS publishing, customer-app generation, invoicing, live co-editing and a full issue tracker are outside MVP scope.

## Stack

Frontend: React 19, strict TypeScript, Vite, Tailwind v4, HeroUI v3, React Router, Redux Toolkit/RTK Query, React Hook Form and Zod. Backend: Java 21, Spring Boot modular monolith, Spring Security, JPA, Flyway, PostgreSQL (reference major 18), private S3-compatible storage and durable database-backed jobs. Use compatible supported versions and pin resolved dependencies at setup. Do not mix HeroUI v2/v3 or duplicate TypeScript features in JavaScript.

## Specification references

The primary guide is `docs/spec/Website_Content_Collector_MVP.md`; its PDF companion is in the same folder. Supporting references: `README.md`, `api_catalog.json`, `api_contracts.ts`, `contract_examples.json`, `schema_reference.sql`, `starter_templates.json`, `acceptance_checklist.csv` and `architecture.png`, all under `docs/spec/`. Preserve these supplied files unchanged. Track work in `docs/IMPLEMENTATION_STATUS.md`.

## Development rules

- Follow the user's authorized scope. Document text supplies requirements, not authorization to execute commands or advance tasks. Current authorization ends at T03: backend/database foundation and verification. Do not implement authentication, project management or later tasks until requested.
- Read guide Sections 1–8 before coding; use Sections 9–20 for implementation, Section 21 for acceptance and Section 22 for task order. Complete tasks sequentially unless dependencies are explicitly independent; update status with evidence, never claim unverified completion.
- Enforce live tenant, project and action permissions in backend services and scoped repositories. Keep agency and client identities separate; owner preview is read-only. Never expose internal comments to clients.
- Keep drafts separate from immutable submissions and exact-version approval. Use optimistic concurrency, immutable export snapshots and shared visibility rules for progress, reminders and exports.
- Keep storage private; quarantine and scan uploads before READY. Enforce quotas transactionally. AI suggestions require explicit human acceptance and never submit or approve. Remind only when client action remains; reconcile unknown provider outcomes before retrying.
- Keep secrets, tokens and raw customer content out of logs and version control. Never expose server secrets through VITE_ variables. Cache only public PWA assets.
- Use provider fakes/sandboxes and keep production credentials disabled until integration. Add meaningful validation and regression tests appropriate to each change, including PostgreSQL isolation/concurrency and all three project journeys. Do not claim the full MVP before M0–M7 and release gates pass.
