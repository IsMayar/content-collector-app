# M6 / T29 — Server activity and minimal browser analytics

## Original scope

Section 22 names **Server activity and minimal browser analytics**, under **M6 Reporting commercial readiness and visibility**. Acceptance: **No raw answers or tokens in events**. Sections 16.2/16.3 and the supplied API catalog define metadata-only client events and safe agency activity. Existing server audit records already capture authoritative saves, submissions, reviews, upload operations and AI acceptance; these are reused rather than trusting browser claims about successful actions.

T30 completion/friction aggregation, percentage/sample-window reporting and template comparisons remain excluded, as do T31+ sharing/digests/billing features. No provider, submission, review, export or consent workflow was rebuilt. M6 remains In progress.

## Implemented contracts

- `POST /api/v1/client/projects/{projectId}/events`: existing client cookie plus CSRF; JSON `{ "events": [{ "clientEventId": "UUID", "type": "project_opened" }] }`, or `item_started` with required `itemId`. Optional `occurredAt` is an untrusted ISO instant (bounded to year 2000 through one day ahead). Batch size 1–20; success **202** `{ "accepted": integer }`, counting newly inserted rows. Server receive time determines observation eligibility. Extra fields at either level, other event types, invalid IDs/times and invalid batches return **400 INVALID_INTERACTION_EVENT**. Unavailable/hidden/cross-project items return the existing **404 NOT_FOUND**. Validation of the whole batch precedes all inserts.
- `GET /api/v1/workspaces/{workspaceId}/projects/{projectId}/activity?page=0&size=20`: live agency JWT/session, owner or assigned member. Returns `{ data: SafeAuditEvent[], page: { page, size, totalElements } }`; newest first with ID tie-breaker. Page is 0–100000, size 1–100; invalid values return **400 INVALID_PAGE**. The six allowlisted fields are `id`, `action`, `resourceKind`, `resourceId`, `actorDisplayName`, `occurredAt`. Actor labels are generic Agency member/Client/System; metadata JSON, raw content, emails, tokens and file URLs are never projected.

Both responses use no-store and preserve standard problem JSON/X-Request-ID. Existing agency/client identity separation, CORS/CSRF and default-deny wiring remain. A client cookie does not grant agency activity access. Authorization uses existing ProjectAuthorization and ClientAccessAuthorization with workspace/project locks, live membership/assignment/grant/session checks and existing visibility evaluation. Independent review/export permissions are unchanged; activity reads require assignment, not review/export permission.

## Persistence and privacy

V24__minimal_interaction_events.sql is the only new migration. It adds `projects.analytics_excluded` (default false) and the metadata-only `analytics_events` table, yielding **24 migrations / 44 collector tables**. Scoped foreign keys bind project, original template version and item. Rows contain only opaque IDs, server-derived stable item key/template context, event type, server receive time, optional reported time and a domain-separated SHA-256 hash of the internal random session UUID. Neither the client cookie nor its authentication lookup hash is stored. There is no arbitrary metadata/content column, contact email, phone, referrer or URL.

Unique constraints deduplicate clientEventId per project/session and item starts/project opens within that session, including concurrent requests. Existing client authorization serializes against revocation and structure edits. An invalid batch rolls back completely. Raw interactions are purged after 90 days by the daily transactional InteractionRetention job (`collector.analytics.cleanup-poll-ms`, default 86400000). No T30 aggregate or percentage calculation is introduced.

Agency preview never invokes the cookie-only ingestion path. Authorized operators can mark synthetic/test projects with `analytics_excluded=true` before client use; those requests return accepted=0 without storing interactions. For previously marked test projects, operators should remove any pre-existing raw rows as part of test-data cleanup. This is a server-controlled flag, never a client-provided eligibility claim. No new project-setting API/UI was invented.

Frontend uses the existing client RTK Query transport. CollectionPortal records an open only after authenticated checklist loading/token-fragment removal; ClientDraftField records the first actual focus, not keystrokes or answer values. In-memory deduplication reduces traffic and server uniqueness remains authoritative across reloads/tabs. Optional telemetry errors do not block writing or display success for unsaved answers. The existing activity panel now supports pagination. Agency preview and unrelated screens are unchanged. Mock mode intentionally collects no interaction telemetry and returns the documented integer accepted=0 rather than its previous boolean placeholder.

## Packages and files

Backend feature files use `com.ayaantrix.collector.analytics.controller/service/repository/dto/worker`; no empty entity/security packages or duplicate domain entities. The feature reuses the existing JDBC/transaction/security infrastructure. Frontend additions are under `features/client/api` and `features/client/hooks`; existing client components and the review activity panel are updated in place.

- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/analytics/controller/ActivityController.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/controller/InteractionController.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/dto/ActivityDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/repository/ActivityRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/repository/InteractionRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/service/ActivityService.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/service/InteractionService.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/worker/InteractionRetention.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/resources/db/migration/V24__minimal_interaction_events.sql`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `backend/src/test/java/com/ayaantrix/collector/clientaccess/ClientAccessTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectClientPreviewTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectFoundationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectStructureTests.java`
- `backend/src/test/java/com/ayaantrix/collector/submission/SubmissionTests.java`
- `backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/TeamCollaborationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/T29_IMPLEMENTATION.md`
- `frontend/src/features/client/api/interactionApi.ts`
- `frontend/src/features/client/components/ClientDraftField.tsx`
- `frontend/src/features/client/components/CollectionPortal.tsx`
- `frontend/src/features/client/hooks/useInteraction.ts`
- `frontend/src/features/review/components/ReviewPanels.tsx`
- `frontend/src/mocks/collection.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/interactions.test.tsx`

## Verification — 3 November 2026

- Initial affected backend run: 10 cases, 6 passed, 1 failure and 3 errors (test fixture/accessor mistakes plus a cookie-only agency denial expected as 401 instead of the established 403). Clean correction run: 10 cases, 6 passed, 1 failure and 3 errors (the initial status assertion replacement did not match, and the token digest helper correctly rejected domain-prefixed input). Fixed the test and used a domain-separated internal session-UUID hash instead of the token helper.
- Final focused event/privacy/CSRF/isolation/deduplication/retention/activity run: **10 passed, zero failures/errors/skips** (`target-t29-focused-corrected.log`). Additional live assignment/membership revocation case: **1 passed**.
- **1 real HTTPS/MSW-disabled analytics journey passed**, using the existing onboarding fixture, real cookie exchange, real Vite/API, open/focus event responses, payload allowlisting, fragment removal, client/agency isolation and safe activity shape. The runner stops after T29 rather than executing unrelated later lifecycle steps. Log: `backend/target-t29-browser.log` (2 tests: the HTTPS journey plus the extra permission case).
- **27 affected frontend tests passed** across interactions/review/draft-autosave. `npm run build` passed strict TypeScript and production Vite build; the existing greater-than-500kB bundle warning remains. All seven changed frontend/test files passed zero-warning ESLint and Prettier check. The subsequently corrected mock file passed its formatter and zero-warning ESLint; a final production build after that change also passed. Java task files were formatted with the existing formatter.
- Final single `backend/ .\mvnw.cmd clean verify`: **1041 tests passed, 0 failures, 0 errors, 0 skipped** (1030 baseline plus11 T29 additions), including Flyway fresh/upgrade/restart, Hibernate validation and executable Spring Boot JAR packaging. Log: `backend/target-t29-verify.log` (ignored local artifact).
- Full frontend, unrelated responsive/PWA and live-provider suites were intentionally skipped. Existing fixture/bootstrap browser steps ran only to establish the real client/agency sessions; no production service was enabled. Initial failed runs are not counted as passing.

## Status and remaining gates

**T29 Complete for original-roadmap local acceptance; M6 In progress.** No outstanding local T29 acceptance blocker. T30+ metrics and later features remain unimplemented.

Existing T04–T06, production email/SMS/AI/storage, physical-device and all other recorded release gates remain open. T26's previous non-green one-shot history is preserved. Protected ClientAnswerController.java and ClientAnswerRepository.java are byte-for-byte unchanged and excluded from staging/commit. DeliveryReconciliationRepository.java had no pending user edit at the start and is unchanged by T29. No push.
