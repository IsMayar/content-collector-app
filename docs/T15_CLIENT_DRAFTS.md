# T15 Part 1 — persistent client drafts and autosave

30 October 2026. Baseline `dd925dd`. M3 remains In progress. This request explicitly includes reliable autosave and conflict recovery in T15 Part 1; the original Section22 T16 autosave/T18 upload roadmap is retained rather than renamed to match the request's upload task shorthand. Uploads and immutable submissions remain deferred.

## Persistence and identity

V13__client_draft_answers.sql creates only collector.answers. It follows the reference model: one shared project answer per stable project item, not one private draft per contact. Invited contacts collaborating on the same project share that answer and optimistic version. updated_by_contact_id records the last author, but no contact identity or email is returned with answer content. No data from another project, tenant, or ungranted contact is exposed. There is no new account or client authentication model.

The table has workspace/project/item composite FK, scoped author-contact FK, unique item_id, JSONB object value, positive answer and structure versions, timestamps, and save-operation identity/hash. It is queried through a scoped JDBC repository; no unused JPA entity or package is introduced. Draft updates, DRAFT item state, item/project version/freshness and a content-free client audit event commit atomically under the existing scoped project lock. Nothing mutates initial project snapshots or original template definitions. Acknowledged answers survive application-context restart.

No answer is represented by no row, version0, an empty object and null savedAt on item detail; explicit clear is a retained row containing {}, with a positive version and savedAt. Empty typed optional work such as {text:""} remains distinct. Cleared answers retain DRAFT state and audit history; they do not pretend that collection never occurred.

## HTTP contracts

All paths below have prefix /api/v1. Existing T14 client cookie authorization is mandatory; unsafe methods retain CSRF. Agency JWT/session membership alone cannot authorize these requests. Responses use no-store and existing problem/correlation infrastructure.

| Operation | Contract |
| --- | --- |
| GET /client/projects/{projectId}/checklist | Existing route; collection:true, capabilities.canRespond, safe visible sections/items with nullable saved answers and live canEdit |
| GET /client/projects/{projectId}/items/{itemId} | {item,answer,clientComments:[]} including version0/no timestamp when never saved |
| PUT /client/projects/{projectId}/items/{itemId}/answer | {value,expectedVersion,expectedStructureVersion,saveOperationId}; returns {answer:{itemId,value,version,savedAt},itemState:"DRAFT"} |

Clear uses the same PUT with value:{}; there is no duplicate clear/batch endpoint. A positive version increments for each acknowledged new save. Replay of the latest matching save operation by the same contact returns its previous acknowledgement without writing/auditing again. Reusing that operation with different input returns409. If another writer has since saved, old retries conflict rather than overwrite. Operation deduplication is deliberately per-item/latest-operation, not a fabricated immutable history.

Stale answer writes return409 ANSWER_VERSION_CONFLICT with currentVersion, matching the guide. Stale structure writes return409 STRUCTURE_CONFLICT with currentVersion. Semantic validation returns422 VALIDATION_FAILED with a safe path/message errors array. Missing/hidden/foreign item reads and writes return404. Expired/revoked grant/session returns401 CLIENT_ACCESS_UNAVAILABLE. Closed item/project/workspace writes reject; file-only saves return409 UPLOAD_UNAVAILABLE. Submitted/approved/current-revision markers remain read-only; no actual revision models/APIs are added.

Every write resolves current T14 session/grant, locks workspace/project, verifies ACTIVE project and workspace, scoped enabled/visible item and editable state, checks structure/answer versions, validates its current field definition, then persists. Reads retain T14 PAUSED/COMPLETED/ARCHIVED/read-only workspace access where allowed. Grant expiry/revocation and client/agency identity isolation remain independent.

## Field semantics

Only the existing eight top-level types are supported. SHORT_TEXT/LONG_TEXT use {text}; URL uses {url}; SINGLE_SELECT uses {optionKey}; MULTI_SELECT uses {optionKeys}; REPEATER uses {rows:[{rowId,values}]}. No extra top-level date/boolean/number types are invented. NUMBER is supported only as an existing repeater column.

Draft saves permit incomplete required/minimum-length/minimum-option work and empty rows/cells; required/minimum completeness remains final-submission validation. They enforce object shapes and data types, maximum text length and row/option counts, option membership and uniqueness, HTTP(S) scheme/host rules without embedded credentials, distinct UUID row IDs, known columns, finite numbers and nested cell types. Email-format short text validates when nonempty. FILE/IMAGE top-level requests are displayed unavailable. Repeater IMAGE cells permit only an empty array until upload persistence exists; no fake asset IDs are accepted. Unknown properties/columns/types fail closed. Current structure configuration is already validated by the shared catalog/project validator.

ProjectDraftVisibility is a shared pure evaluator for collection and operational progress. It supports only the existing EQUALS dependency on an earlier single-select item. Evaluation reads scoped saved drafts, recursively respects hidden/disabled controllers and never deletes hidden values. After a controller save, checklist refetch updates visible questions. Hidden saved answers reappear if their condition becomes true again. Hidden unsent changes remain in volatile recovery, not silently deleted or marked saved. Future submission must evaluate the same visibility and exclude hidden requests without deleting their historical data.

## Autosave and recovery

Feature-owned DraftAutosave serializes one in-flight write per item. Text changes debounce800ms; blur flushes fields and section navigation waits for all visible pending saves. New input remains the latest local value while a request is in flight; a confirmed version is used for the next queued write. React Hook Form owns displayed field input; the autosave buffer retains the immutable in-flight operation and latest unsent value. RTK Query uses the existing client transport, cookies/CSRF and no agency refresh/bearer flow.

Saving is shown during the request, Saved at time only after validated server acknowledgement. Other states include Unsaved changes, Offline/Save error, Validation error, unavailable session and Conflict. Network/5xx errors retain input and retry at most twice with1s/2s backoff. A retry reuses its operation ID and original payload, preventing an uncertain accepted response from causing a blind duplicate write.429 respects Retry-After (with a60s minimum).400/422/401/403/409 do not automatically retry. There is no infinite retry loop.

Conflict handling freezes automatic writes, retains local input and fetches the saved answer only on Compare. Clients explicitly choose Load saved answer or save their local answer against the compared version. A further race still conflicts. Blur on action buttons never initiates a new write. Structure conflicts require reloading/reconciling the current request; unsafe schema changes are never guessed safe.

There is no authoritative localStorage/sessionStorage draft. Volatile per-project/item controllers survive an editor unmount in the same tab; recovery copy is available after session failure or hiding. beforeunload warns about unsaved input. Opening a replacement client session requires explicit confirmation before discarding unsent memory, and successful exchange clears old-contact buffers. Explicit logout flushes visible work and clears volatile buffers; it does not log out the agency. Browser closure loses unacknowledged input; full offline collection is outside MVP.

No functional final Submit action, save-as-submission shortcut, upload API or review workflow is provided. Existing later-stage MSW demonstrations remain explicitly mocked and do not prove backend acceptance.

## T11 integration

A successful answer save marks its stable operational item DRAFT in the same transaction. Existing ProjectStructureMutationPolicy therefore includes it and affected visibility descendants when assessing semantic edits. Type/option/constraint/visibility/disable changes affecting collected drafts still fail with REOPEN_REQUIRED; metadata and exact reorder preserve answers/IDs. Empty explicit clears remain collected work. Snapshots remain immutable. Real draft revalidation/confirmed schema-impact handling and submitted/approved reopening are still T11/T17/T22 dependencies; this task does not falsely mark T11 Complete.

## Architecture

```text
backend/.../collection/
  controller/ClientAnswerController.java
  service/ClientAnswerService.java
  repository/ClientAnswerRepository.java
  dto/ClientAnswerDtos.java
  validation/ClientFieldValidator.java
backend/.../project/service/ProjectDraftVisibility.java
```

Existing ClientAccessAuthorization and ClientSessionCookies are reused rather than duplicated. ClientPortalService owns safe checklist projection; ProjectStructureRepository uses the shared visibility evaluator for operational counts. Existing global problem handling supports safe field diagnostics, and all default-deny routes remain closed except exact item GET/answer PUT mappings.

```text
frontend/src/features/client/
  api/clientAnswersApi.ts
  components/CollectionPortal.tsx
  components/ClientDraftField.tsx
  components/UnsavedDraftRecovery.tsx
  hooks/draftAutosave.ts
  schemas/collectionSchema.ts
  schemas/draftAnswerSchema.ts
```

The existing client feature name is preserved rather than duplicating it as client-portal. App/store, shared API, layouts, organized tests and ignored .artifacts remain in place. Existing TypedValue, RHF, Zod and UI styling are reused; no redesign/dependency update.

## Verification

Final backend/HTTP/unit/static evidence (completed after the final implementation changes):

- Backend clean verify: **728 passed, 0 failures/errors/skips** (697 baseline +31 new collection cases). Flyway V1–V13, Hibernate validation, restart durability, SQL constraints, rollback/concurrency and executable JAR packaging passed.
- Frontend: **133 passed across7 unit files** (114 baseline +19 new). Final serial run passed; strict TypeScript/production build/lint/format passed. Existing bundle-size advisory remains nonfatal.
- Real HTTPS/MSW disabled: **2 passed, 0 failures/errors/skips**, including collection persistence/reload, offline recovery, reconciliation, T11 protection and revocation. Final mobile draft screenshot visually inspected after correcting the existing panel class; real portal1440/360 layouts checked without horizontal overflow.
- Complete responsive suite: **75 passed, zero failures in one full desktop/tablet/phone run**. Production PWA: **1 passed**, fixed public assets/offline navigation without private API caching.
- **T15 Part 1 Complete** for this requested non-upload draft collection/autosave scope. M3 remains In progress. Original T16/T17 and all independent pending gates remain separately tracked; no local T15 Part 1 verification blocker remains.

Previously observed: 728 backend clean-verify tests passed before final safe item-detail projection; 133 frontend tests passed before the final runtime-schema refinement; two real HTTPS lifecycles passed before final RHF/error-contract refinements. Those are intermediate results, not final acceptance. Initial full run found three obsolete migration/no-answer-table assertions; updated expectations preserve no-side-effect assertions. One HTTPS run found blur/conflict resubmission; fixed automatic-write freeze and action-button blur handling with regression tests. One loaded concurrent unit run had six auth timeouts; rerun serially without inflated timeouts or skipped assertions. Existing async auth focus assertion now waits for actual focus readiness.

Real HTTPS uses synthetic data/provider and isolated certificate/PostgreSQL, with MSW disabled. It exercises owner invitation, client exchange, text save, section navigation/reload persistence, updates, additional select/multi/URL/repeater controls, offline retry, external writer conflicts, explicit reconciliation, T11 protection, mobile layout, cross-project/agency denial and rejected saves after revocation. It does not send real mail or claim hosted/provider/physical-device acceptance.

## Reproduction

PowerShell from the project root:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=ClientAnswerTests,ClientAccessTests' test
.\mvnw.cmd clean verify
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test
npm run build
npm run lint
npm run format:check
npm run test:browser
npm run test:pwa
```

Check $LASTEXITCODE after each command and stop on failure. Run the heavy suites serially. Existing local initialization/Docker/PostgreSQL/Java21/Node/Edge setup remains documented in backend/README.md. Normal startup remains .\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run plus frontend npm run dev with the existing real-API setup. Never expose credentials through source or VITE_ variables.

M3 remains In progress. T04 hosted CI, T05 provider/resend, T06 deployment and T22 publication remain independent gates; new DRAFT projects still need future publication before client issuance. Original specs, V1–V12 and dependency manifests/locks are preserved. No push.

## Exact file manifest (baseline dd925dd)

Created:

- `backend/src/main/java/com/ayaantrix/collector/collection/controller/ClientAnswerController.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/dto/ClientAnswerDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/repository/ClientAnswerRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/service/ClientAnswerService.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/validation/ClientFieldValidator.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectDraftVisibility.java`
- `backend/src/main/resources/db/migration/V13__client_draft_answers.sql`
- `backend/src/test/java/com/ayaantrix/collector/collection/ClientAnswerTests.java`
- `docs/T15_CLIENT_DRAFTS.md`
- `frontend/src/features/client/api/clientAnswersApi.ts`
- `frontend/src/features/client/components/ClientDraftField.tsx`
- `frontend/src/features/client/components/CollectionPortal.tsx`
- `frontend/src/features/client/components/UnsavedDraftRecovery.tsx`
- `frontend/src/features/client/hooks/draftAutosave.ts`
- `frontend/src/features/client/schemas/collectionSchema.ts`
- `frontend/src/features/client/schemas/draftAnswerSchema.ts`
- `frontend/tests/unit/draft-autosave.test.ts`

Modified:

- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientPortalService.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/ApiException.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/GlobalExceptionHandler.java`
- `backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectStructureRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectStructureMutationPolicy.java`
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
- `backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/TeamCollaborationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `frontend/ARCHITECTURE.md`
- `frontend/src/features/client/api/portalApi.ts`
- `frontend/src/features/client/pages/ClientAccessPage.tsx`
- `frontend/src/features/client/pages/ClientProjectPage.tsx`
- `frontend/src/services/api/resourceSchemas.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/auth.test.tsx`
- `frontend/tests/unit/client-access.test.tsx`

## Commits

Backend: `a52d9e8`. Frontend collection/autosave integration: `e3f5241`. Status punctuation correction: `4ca645e` (unit/build/lint/format and production PWA rechecked). Documentation is committed separately after final verification. No push. Final documentation hash and clean working-tree state are reported after committing.

The final documentation pass restored the unchanged historical status content from baseline bytes before appending T15, correcting an intermediate Windows text-decoding issue. Original roadmap history and supplied specifications are preserved. The final frontend copy correction changed display punctuation only, with no autosave behavior change.
