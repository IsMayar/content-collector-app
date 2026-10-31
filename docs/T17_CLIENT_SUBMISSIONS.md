# T17 Part 1 — immutable item submissions and withdrawal

Date: 31 October 2026. Baseline: `f339ea7`. **T17 Part 1 Complete** for locally verified item submission, withdrawal, immutable history and retained-file integration. **M3, T11 and T16 remain In progress** for their independent gates. No later review/approval/export workflow or remote push.

## Specification boundary

Guide Sections 4.2, 6.2–6.4, 10.5, 11.2–11.3, 12.5–12.6 and Section22 T17 define **item-level** submission and withdrawal. There is no whole-project submission transaction or preflight endpoint in the catalog. Other incomplete questions do not prevent submitting a valid visible item. The service loads the complete current structure and saved drafts to evaluate effective visibility, then validates the selected item. Disabled and hidden items are excluded; hidden drafts are never deleted.

T17 supports DRAFT -> SUBMITTED and explicit SUBMITTED -> DRAFT withdrawal. Withdrawing clears the current revision pointer but retains every historical revision, its number, schema/value snapshots and file links. Resubmitting creates the next item-scoped revision. APPROVED and unsupported revision markers remain read-only. Review decisions, request-changes comments, approval, approved-item reopening, project completion/publication/archive and exports are later tasks, not simulated here. There is no permissive reopening stub.

## Backend ownership

```text
com.ayaantrix.collector.submission/
  controller/ClientSubmissionController.java
  controller/AgencySubmissionController.java
  dto/SubmissionDtos.java
  repository/SubmissionRepository.java
  service/SubmissionService.java
  service/SubmissionValidationService.java
```

ClientAccessAuthorization, ProjectAuthorization, scoped structure/draft/attachment repositories and shared audit/idempotency infrastructure are reused. No duplicate authentication, draft entity or project entity. JDBC immutable JSON projections do not require duplicate JPA entities or empty entity/security directories. Controllers own HTTP validation/no-store responses; services own transactions/final validation; the scoped repository owns append-only persistence.

## Database and transaction

Only `V15__client_submissions.sql` is new. V1–V14 are preserved. Three tables bring collector's table count to28:

- `submission_revisions`: tenant/project/item/contact foreign keys, concurrency-safe per-item revision number, structure and answer versions, submitter/time, immutable item schema/value and full ordered project-structure snapshots. Evaluated conditional visibility is frozen from the same saved-answer snapshot used by final validation, rather than copying initial UI visibility hints.
- `revision_assets`: exact revision/item/project/asset composite foreign keys and immutable safe metadata manifests. Binaries are referenced, never copied.
- `submission_events`: content-free, append-only durable integration events for submission/withdrawal. These references are a transactional outbox boundary for later automation. No production email/notification dispatcher is enabled or fabricated; later consumers require their own checkpoints and live eligibility checks.

PostgreSQL triggers prohibit update/delete of immutable rows and protect retained file state/canonical keys/variants/digest. The pre-existing nullable item revision marker is maintained by the scoped service rather than retrofitting an invalidating FK over legacy markers. All newly inserted revisions/file/event links have composite scope FKs.

Existing workspace-before-project PostgreSQL locks serialize draft writes, structure edits, grant revocation, item versions and submission. Live cookie/session/grant/project/workspace/subscription checks run before writes; final answer/structure versions must match. Revision insertion, asset links, lifecycle/version changes, idempotency response, audit and outbox commit together. Failure rolls everything back. Idempotency is actor/route/input bound for24h and rechecks live access before replay.

## API inventory

All prefixes below include `/api/v1`. Client writes require the independent client cookie, CSRF and Idempotency-Key. Agency reads require a live agency identity and current tenant/assignment access.

| Method | Route | Result |
| --- | --- | --- |
| POST | `/client/projects/{p}/items/{i}/submit` | `{expectedAnswerVersion,expectedStructureVersion}` ->201 `{revisionId,revisionNo,itemVersion,state:SUBMITTED}` |
| POST | `/client/projects/{p}/items/{i}/withdraw` | `{expectedItemVersion}` ->200 `{state:DRAFT,itemVersion}` |
| GET | `/client/projects/{p}/items/{i}` (existing) | Existing saved answer plus own project-scoped immutable `revisions`; no new duplicate history route |
| GET | `/workspaces/{w}/projects/{p}/review-queue` | Paginated current submission summaries; owner/assigned reviewer only |
| GET | `/workspaces/{w}/projects/{p}/items/{i}/revisions` | Historical summaries; owner or assigned member |
| GET | `/workspaces/{w}/projects/{p}/items/{i}/revisions/{r}` | Exact historical schema/value, revision identity, submitter contact ID, time and file manifests; owner or assigned member |

Assigned project read does not confer review or export rights. Queue access separately enforces review permission. No decision/export API is implemented. Errors preserve the shared problem envelope/correlation/no-store policy: STRUCTURE_CONFLICT, ANSWER_VERSION_CONFLICT, ITEM_VERSION_CONFLICT, READ_ONLY, UPLOAD_INCOMPLETE, INVALID_ASSET_REFERENCE, STORAGE_UNAVAILABLE, REOPEN_REQUIRED, and item-addressed422 SUBMISSION_VALIDATION_FAILED. Inaccessible resources remain404; unavailable client access401; denied review action403.

## Final validation and file retention

The existing draft validator remains permissive about missing required values/minimums. Final validation adds visible-required checks, text minima, select/multiselect minima, file minima, repeater row/required-cell checks and numeric column bounds. It reuses draft shape/max/option/URL/finite-number validation. NUMBER exists only in repeater columns and DATE is not one of this guide's eight item types; no conflicting new field model is invented.

Unresolved RESERVED/UPLOADED/PROCESSING uploads on the target item reject submission, even if not selected. Every selected file must be READY, exact-project/exact-item scoped and still have its private canonical variants. Image cells require verified JPEG/PNG image assets. Private HEAD checks fail closed if bytes are unavailable; they do not fetch client URLs. Existing scanner status, quarantine, quotas and sandbox processing remain authoritative.

Retained revision links extend T16's removal predicate. Unselected historical READY files do not consume a later draft's upload slots; selected files and pending reservations still do. All historical bytes remain charged to storage quota, and a maxFiles=1 replacement regression exercises original retention and new revision identity. A later draft clear cannot remove or reclaim submitted files. Existing cleanup preserves READY canonical variants and counts retained bytes. Authorized retained-file downloads remain possible when current visibility changes; live project/grant/assignment authorization still applies, and signed URLs retain the existing60s capability boundary. General purge/retention policy needs later project deletion integration; no physical purge API bypasses immutable triggers.

## T11/reopening boundary

New submissions set real SUBMITTED/current-revision markers under the existing project lock. T11 metadata/reorder operations preserve the immutable snapshots and stable item IDs. Semantic changes affecting collected content still return409 REOPEN_REQUIRED, including after withdrawal when the item holds a collected draft, and even when reopenAffected=true. Approved/review reopening requires the later exact-version reason/comment workflow and current-approval invalidation. This part does not close full T11 or T22.

## Frontend ownership and experience

```text
features/client/
  components/SubmissionControls.tsx
  components/SubmissionValidationSummary.tsx
  components/ClientSubmissionHistory.tsx
  components/ClientDraftField.tsx       # existing editor integration
  components/CollectionPortal.tsx       # saved-answer readiness and section links
  api/clientAnswersApi.ts               # existing shared client RTK transport
  schemas/submissionSchema.ts
features/projects/components/SubmissionHistoryPanel.tsx
shared/components/SubmittedAnswer.tsx
```

No duplicate client-portal feature or HTTP client. Client UI identifies missing saved required answers by section with keyboard-focus links, explains independent item submission, waits for serialized autosaves, blocks pending uploads/offline operations, freezes the current editor during the command, uses one in-flight action and retains retry idempotency keys for uncertain results. Only a valid server response confirms success. Reload derives SUBMITTED/read-only state from the server. Withdrawal is explicit; previous versions remain readable in item history. Session/version/network errors preserve the draft/recovery path.

Agency Submitted versions is available to authorized project readers and uses exact immutable detail APIs. Current review actions are not faked. Answers render as text, option labels, entries and file names, not raw JSON identifiers. Separate permission-protected queue reads do not grant decision permissions. Runtime Zod parsing guards revision contracts. Existing mock-only review screens remain explicitly mock-enabled, not a production fallback.

## Verification

- Focused `SubmissionTests,SubmissionValidationTests,AttachmentStorageTests`: **91 passed, 0 failures/errors/skips** (26 submission lifecycle/security/concurrency +25 final-validation +40 storage lifecycle cases; the latter preserves36 prior cases).
- Backend `clean verify`: **863 passed, 0 failures/errors/skips** (all808 baseline preserved +55 new). Clean/upgrade/restart Flyway V1–V15 validation, PostgreSQL scopes/constraints/locks/rollback, Hibernate validate and executable Boot JAR packaging pass. JAR inspection confirms the submission packages and V15 resource.
- Frontend unit: **161 passed /9 files** (144 preserved +17 new). Strict TypeScript, production build, zero-warning ESLint and Prettier passed after the response-compatibility correction. Existing >500kB bundle advisory remains nonfatal.
- Final real HTTPS/MSW-disabled rerun: **2 passed, 0 failures/errors/skips**, against actual Spring/PostgreSQL/private S3-compatible storage and clamd. The final parser, client/agency isolation, mobile submission/reload/withdrawal, retained files and desktop revision2 all pass. Backend tests additionally submit all three project types; no full all-type MVP acceptance is inferred.
- Responsive regression: an initial complete run had **72 passed /3 failed** (one legacy mock review-history regression at each viewport). The summary parser stripped the existing full snapshot fields; summary-compatible extra fields are now preserved, with a focused unit regression. The complete final rerun passed **75/75, 0 failed** in one run (25 desktop,25 tablet,25 phone). No isolated rerun or reduced assertion substitutes for it.
- Production PWA: **1 passed**, after a fresh production build; fixed public-only caching and honest offline navigation. No private API/history caching was introduced.

Failed intermediate stages were corrected without skipping tests, increasing timeouts or weakening assertions: pending-upload error ordering; strict test-fixture typing; obsolete no-submission-table assertions (replaced with no-submission-side-effect checks); the internal-pointer response projection; the editor remount on NOT_STARTED->DRAFT that cancelled real uploads; file-name label markup; an ambiguous ready/rejected-file checkbox selector; and stripping legacy full-revision fields. Failed-run diagnostics use synthetic data and redact capabilities. The readiness list is collapsible on phones; actual360px screenshots were inspected. Actual HTTPS covers real scan/upload, per-item submission, PostgreSQL persistence, agency immutable history, mobile reload/read-only state, explicit withdrawal, failed historical-file removal, retained authorized download and desktop revision2 resubmission, with live denial checks preserved.

Heavy suites run serially. Logs/artifacts are ignored under backend/target-t17-*.log and frontend/.artifacts/. The failed responsive run is retained as t17-responsive-before-fix.log. No real email, production provider, paid API or physical-camera acceptance is claimed.

## Reproduction

Use the existing Java21/Docker/PostgreSQL/private-storage/scanner/Node/Edge setup in backend/README.md. No dependency or lockfile change is required.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=SubmissionTests,SubmissionValidationTests,AttachmentStorageTests' test
if ($LASTEXITCODE -ne 0) { throw 'Focused T17 verification failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS verification failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test -- --maxWorkers=1 --pool=threads
npm run build
npm run lint
npm run format:check
npm run test:browser
npm run test:pwa
```

Check LASTEXITCODE after each frontend command. Browser tests use MSW disabled for real HTTPS and explicit mocks only for the responsive regression suite. Production PWA tests serve a real production build.

## Remaining independent gates

T04 hosted CI; T05 actual email provider/resend; T06 deployment/TLS/retention; T11 reason-bearing collected/approved-content reopening and draft revalidation; T16 production storage/IAM/scanner monitoring, WebP/HEIC/HEIF and physical camera acceptance, and missing agency file-library listing/detail contract; T22 publication/lifecycle. M2/M3 remain In progress. No full-MVP, production provider or physical-device claim. No push.

## Exact change manifest and commits

17 created; 35 modified; no deleted source files. Paths below are relative to the project root. Backend commits: `616acb5` (initial immutable workflow) and `ae0183d` (effective visibility, retained-file replacement and regression coverage). Frontend/integration commit: `0d41e8e`. The final documentation commit hash is reported with the final clean working-tree status. Nothing pushed.

### Created

- `backend/src/main/java/com/ayaantrix/collector/submission/controller/AgencySubmissionController.java`
- `backend/src/main/java/com/ayaantrix/collector/submission/controller/ClientSubmissionController.java`
- `backend/src/main/java/com/ayaantrix/collector/submission/dto/SubmissionDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/submission/repository/SubmissionRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/submission/service/SubmissionService.java`
- `backend/src/main/java/com/ayaantrix/collector/submission/service/SubmissionValidationService.java`
- `backend/src/main/resources/db/migration/V15__client_submissions.sql`
- `backend/src/test/java/com/ayaantrix/collector/submission/SubmissionTests.java`
- `backend/src/test/java/com/ayaantrix/collector/submission/SubmissionValidationTests.java`
- `docs/T17_CLIENT_SUBMISSIONS.md`
- `frontend/src/features/client/components/ClientSubmissionHistory.tsx`
- `frontend/src/features/client/components/SubmissionControls.tsx`
- `frontend/src/features/client/components/SubmissionValidationSummary.tsx`
- `frontend/src/features/client/schemas/submissionSchema.ts`
- `frontend/src/features/projects/components/SubmissionHistoryPanel.tsx`
- `frontend/src/shared/components/SubmittedAnswer.tsx`
- `frontend/tests/unit/submissions.test.tsx`

### Modified

- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/attachment/repository/AttachmentRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/service/AttachmentService.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/PrivateObjectStorage.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/S3PrivateObjectStorage.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientPortalService.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/service/ClientAnswerService.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
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
- `backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/TeamCollaborationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `frontend/ARCHITECTURE.md`
- `frontend/src/features/client/api/clientAnswersApi.ts`
- `frontend/src/features/client/components/ClientDraftField.tsx`
- `frontend/src/features/client/components/CollectionPortal.tsx`
- `frontend/src/features/client/schemas/collectionSchema.ts`
- `frontend/src/features/projects/pages/ProjectPage.tsx`
- `frontend/src/services/api/resourceSchemas.ts`
- `frontend/src/styles/globals.css`
- `frontend/tests/integration/real-auth/browser-check.mjs`
