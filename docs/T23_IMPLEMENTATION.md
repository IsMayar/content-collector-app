# T23 — Immutable approved export manifest and jobs

Original roadmap: M4 / T23, **Immutable approved export manifest and jobs**. Acceptance: **Partial exports labeled; all three formats match snapshots**. Guide §17.3 and the supplied API catalog control scope. T24 and later features are unchanged.

## Implementation

The interrupted `PrivateObjectStorage` and `S3PrivateObjectStorage` streaming additions were preserved, formatted and verified first against actual private S3-compatible storage. Private streaming reads and file-backed writes do not buffer export-sized files. Unsupported storage adapters fail closed.

A request captures approved, visible exact submission revisions under the same account/workspace/project locks used by submission, review, lifecycle and structure mutations. This serialization supplies the guide's equivalent consistent snapshot; generation never reselects current drafts or approvals. The manifest records project/type/version, structure versions, stable section/item keys and IDs, revision IDs, submitted schema/values and verified file metadata. Explicit APPROVE decisions must match each selected current revision. Disabled/conditionally hidden items, unapproved answers, comments, audit data and internal object keys are excluded from artifacts.

V18 alone adds `collector.export_jobs`, scoped project/member foreign keys, expiry/dispatch indexes, lease/retry metadata and a trigger rejecting changes to snapshot identity, manifest, requester, format, project version, acknowledgment, creation/expiry times or row deletion. V1–V17 and supplied specifications/templates are unchanged. Execution state changes separately; old submissions, approvals and project/item IDs are never rewritten.

Formats:

- `APPROVED_ZIP`: `manifest.json`, `sections/<stable-section-id>/content.md`, and clean files under `files/<asset-id>/<variant>-<safe-name>` (working images use `.png`). Names cannot traverse paths and repeated references are deduplicated.
- `APPROVED_JSON`: the same public snapshot, including type, keys, schema/structure versions, approved values and file metadata; no private source-key envelope.
- `APPROVED_MARKDOWN`: readable section/item headings, revision identifiers, escaped values and file references. Raw HTML and injected Markdown links/headings are escaped.

Image working copies are included by default; retained originals are additionally included only when requested. Documents include their clean original. ZIP source reads use 64 KiB buffers. Output is file-backed, with both uncompressed file bytes and final artifact capped at 2 GiB. Request preflight rejects oversized selections; runtime bounds also fail closed. Select fewer sections to split large collections. Files are removed after generation/failure; crash leftovers older than 24 hours are swept nonrecursively in the dedicated OS temporary directory, without following symlinks.

## HTTP contracts

Base: `/api/v1/workspaces/{workspace}/projects/{project}/exports`.

| Operation | Request | Response |
| --- | --- | --- |
| GET base | — | 200 `{data: ExportSummary[]}` (latest 100) |
| POST base | `Idempotency-Key`; `{format, expectedProjectVersion, includeOriginals, acknowledgePartial}` | 202 `{jobId, state:"QUEUED"}` |
| GET `/{jobId}` | — | 200 `{export: ExportSummary}` |
| POST `/{jobId}/download` | `{}` | 200 `{url}` |

`ExportSummary`: `id`, `state`, `format`, `projectVersion`, `partial`, `createdAt`, `expiresAt`, `olderThanCurrentProject`; failures additionally expose only a safe `failureCode`.

The only additive request field is optional `sectionIds` (1–100 distinct project section UUIDs), enabling the guide's split-by-section option without another route. Omit it to export all eligible sections. Excluding required content still labels the snapshot partial and requires acknowledgment. Partial **never** means including unapproved content. No retry/cancel API was invented: a failed/expired job can be replaced by a newly acknowledged snapshot request.

Important problems retain standard problem JSON and `X-Request-ID`:

- 400 `VALIDATION_FAILED`: missing/invalid idempotency key or malformed command.
- 409 `PROJECT_VERSION_CONFLICT`: stale expected project version, with current version.
- 409 `PARTIAL_EXPORT_ACK_REQUIRED`: missing explicit acknowledgment.
- 409 `NO_APPROVED_CONTENT`, `EXPORT_REVISION_CONFLICT`, `EXPORT_ASSET_UNAVAILABLE`, `EXPORT_NOT_READY`.
- 422 `VALIDATION_FAILED` for invalid section selection; `EXPORT_TOO_LARGE` explains splitting by section.
- 403 `EXPORT_FORBIDDEN`; opaque 404 for inaccessible tenant/project/job; 401 for invalid agency sessions.
- 410 `EXPORT_EXPIRED`; 503 `EXPORT_UNAVAILABLE` / `EXPORT_ASSET_UNAVAILABLE` for unavailable private storage.

## Durability, access and expiry

The request, immutable manifest, queued row, audit record and actor-scoped idempotency response commit atomically. A single worker per application instance claims PostgreSQL rows with `FOR UPDATE SKIP LOCKED`, a random fencing token and a 120-second lease. Streaming renews every 20 seconds. Provider calls retain existing 45-second SDK deadlines. Work is outside claim transactions. Process restart preserves queued rows; abandoned leases can be reclaimed. There are at most three attempts with bounded backoff. Attempt-specific deterministic keys cannot overwrite historical artifacts; a stale lease cannot publish READY. Cleanup checks committed object references before deleting after an uncertain READY commit acknowledgment. Operational failures expose safe codes, never provider payloads, credentials, content or signed URLs in logs.

Live agency JWT/session, workspace membership and independent project `canExport` permissions are checked server-side on every list/detail/create/download. Owner rights follow existing authorization; assignment or `canReview` alone grants no export. Clients receive no export routes. Workspace/project locks serialize permission revocation with export authorization. Private bucket settings, CSRF, restricted CORS and default deny remain intact. Read-only workspace exports reuse existing allowed export permissions.

Jobs expire exactly 24 hours after creation; API reads report EXPIRED immediately even before maintenance. Downloads require READY and a future expiry. Signed private capability URLs last at most 60 seconds and never exceed the remaining job lifetime. Already-issued capabilities can remain usable within that brief window; revocation is authoritative on subsequent URL requests. Stale snapshots remain downloadable while valid and clearly report `olderThanCurrentProject` after reopening.

Expired-object cleanup deletes all three possible attempt keys, waits for active leases, retries failed deletions and periodically re-sweeps expired keys to cover late/ambiguous writes. It retains immutable database snapshot/history rows; workspace-data retention/deletion remains a separate later operational workflow. Exports do not delete retained submission attachments. Configure production bucket lifecycle as defense in depth; production provider/load acceptance is not claimed here.

## Frontend

`features/exports/components/ExportPanel.tsx` owns the existing export UI; `features/exports/schemas/exportSchema.ts` validates queue and summary contracts. ReviewPanels re-exports the panel for the established project route. Existing RTK Query transport, authentication, shared controls and styles are reused. Format/section/original selection, partial acknowledgment, queued/running/ready/failed/expired states, status polling, older-snapshot warnings and authorized downloads are supported. Retry keys stay stable for an unchanged failed request; success is shown only after a validated server acknowledgment. Signed attachment navigation lets the browser stream downloads without constructing a ZIP-sized JavaScript blob. Mocks explicitly remain synthetic and now return the real queue response shape. No unrelated UI redesign.

## Operations and verification

Existing private-storage/scanner setup is reused. Set server-only `EXPORT_WORKER_ENABLED=true` on an instance responsible for dispatch and expiry cleanup; `PRIVATE_STORAGE_ENABLED=true` plus the existing private bucket/credentials configuration is required. Both remain false in the committed placeholder `.env.example`; no credentials were committed. Do not enable an export worker without storage. Health endpoints remain minimal.

Commands run from `backend/`:

```powershell
.\mvnw.cmd '-Dtest=AttachmentStorageTests#privateStreamingFileRoundTrip' test
.\mvnw.cmd '-Dtest=SubmissionTests#export*,ExportRendererTests' test
.\mvnw.cmd '-Dtest=SubmissionTests#exportLostCommitAcknowledgmentPreservesReadyObject' test
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck#realHttpsWorkspaceOnboardingWithoutMocks' test
.\mvnw.cmd clean verify
```

Final local evidence:

- Streaming storage: 1 passed first, including exact file round-trip and denied unsigned private GET.
- Focused export selection/persistence/worker/renderer: 17 passed; subsequent lost-commit-acknowledgment regression: 1 passed. Covers all formats, exact manifests after reopening, DB immutability, partial acknowledgment, stale version, rollback, concurrent idempotency, live permission/session/tenant denial, hidden/section selection, restart, lease fencing/recovery, three-attempt failure, expiry, cleanup, escaping and path traversal.
- Frontend export/review: 12 passed; focused existing mock artifact contract: 1 passed, with 24 unrelated cases intentionally filtered out. Strict TypeScript/production build, changed-file ESLint and Prettier passed; existing nonfatal chunk-size advisory remains.
- Real HTTPS with MSW disabled: 1 lifecycle passed, including UI ZIP download with real referenced files, JSON/Markdown reads matching immutable submitted revisions, partial labeling and internal-note exclusion. The initial new browser test used the wrong API-helper argument shape; corrected before the passing run. The subsequent backend-only uncertain-commit defense is separately regression-tested.
- Full backend `clean verify`: **955 passed, 0 failures, 0 errors, 0 skipped** in one complete run (936 prior cases preserved +19 new). Fresh/upgrade/restart Flyway V1–V18, Hibernate validation and executable Spring Boot JAR packaging passed. The 955 includes all 16 export integration cases, 2 renderer cases and the streaming-storage case.

Unrelated complete frontend, responsive and PWA suites were intentionally not run. No large 2 GiB load transfer, production S3 lifecycle or physical-device acceptance is claimed. Existing T04–T06, T16 production/storage/codec/device and T20 physical-device gates remain unchanged; T11/T22 recorded local acceptance and independent pending release gates are preserved. M4 remains In progress.

## Changed files

The exact implementation/test/documentation paths are listed below; migration-count-only test changes retain strict fresh/upgrade/restart schema assertions for 18 migrations and 33 tables.

- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/PrivateObjectStorage.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/S3PrivateObjectStorage.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java`
- `backend/src/main/resources/application.properties`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/AttachmentStorageTests.java`
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
- `frontend/src/features/review/components/ReviewPanels.tsx`
- `frontend/src/mocks/review.ts`
- `frontend/src/services/api/resourceSchemas.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/product.test.ts`
- `backend/src/main/java/com/ayaantrix/collector/export/controller/ExportController.java`
- `backend/src/main/java/com/ayaantrix/collector/export/dto/ExportDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/export/repository/ExportRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/export/service/ExportService.java`
- `backend/src/main/java/com/ayaantrix/collector/export/worker/ExportRenderer.java`
- `backend/src/main/java/com/ayaantrix/collector/export/worker/ExportWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/export/worker/ExportWorkerRunner.java`
- `backend/src/main/resources/db/migration/V18__approved_exports.sql`
- `backend/src/test/java/com/ayaantrix/collector/export/worker/ExportRendererTests.java`
- `docs/T23_IMPLEMENTATION.md`
- `frontend/src/features/exports/components/ExportPanel.tsx`
- `frontend/src/features/exports/schemas/exportSchema.ts`
- `frontend/tests/unit/exports.test.tsx`

Status: **T23 Complete for original-roadmap local acceptance.** M4 remains In progress. No T24 or full-MVP completion claim. Backend implementation commit: `f1690f6`. The frontend/documentation commit and final working-tree evidence are recorded in the final report.
