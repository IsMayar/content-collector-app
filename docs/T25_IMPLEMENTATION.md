# T25 — Client suggestion preview and acceptance

Original M5/T25 acceptance: **No automatic submission or overwriting newer answers**. Guide §14.1 requires fact-based suggestion preview, regeneration within allowance, explicit Use this draft, ordinary DRAFT persistence and conflict handling. T24 generation/allowance/provider code is reused; T26+ is unchanged. Paid providers remain disabled pending existing production approval/configuration.

## Implementation and contracts

- Existing POST `client/projects/{p}/items/{i}/ai-drafts` returns202 `{jobId,state:"QUEUED"}`. The frontend and synthetic handler now follow this real T24 shape.
- Existing GET `client/projects/{p}/ai-drafts/{id}` previews the creating contact's job. SUCCEEDED is a proposal only; it never saves an answer.
- New POST `/api/v1/client/projects/{p}/ai-drafts/{id}/accept`: client cookie, CSRF, required Idempotency-Key and `{expectedAnswerVersion}` →200 `{answer:Answer}`.
- No rejection endpoint or invented REJECTED state. Discard dismisses the local proposal, keeps the client's notes/answer, performs no mutation and does not refund already-used generation allowance. A server job cannot write an answer without a separate authorized accept request.

Acceptance rechecks the current client grant, same project/creating contact, visibility, LONG_TEXT/item/project opt-ins, editable state and writable plan. Only SUCCEEDED/unexpired jobs with a result can be accepted. Both the request's expected answer version and current saved version must equal the job's baseAnswerVersion; passing a newer expected version cannot force an overwrite. The complete current question definition must match the captured definition. Reordering/unrelated project edits do not invalidate an unchanged question; semantic/validation changes fail closed.

`AiService.accept` calls **ClientAnswerService.read/save**, never duplicate answer SQL. Normal current field/attachment validation, answer concurrency, project/item versions, DRAFT state, audit and T11 collected-content protection remain authoritative. Successful acceptance, prior/accepted answer recovery snapshot, job ACCEPTED state, audit and idempotent response commit atomically under existing workspace/project locks. Generation accounting is unchanged; accepting incurs no extra provider call/allowance. A failed mutation rolls back all effects. Concurrent decisions produce one mutation. Repeating the same request key replays its original response only after live permission/state checks; new keys cannot re-accept an ACCEPTED job.

Problems use existing JSON/X-Request-ID conventions:409 ANSWER_VERSION_CONFLICT (current version),409 STRUCTURE_CONFLICT,409 AI_NOT_ACCEPTABLE;410 AI_EXPIRED; opaque404 for inaccessible jobs,401 for unavailable client sessions, normal validation/CSRF/read-only errors. Submitted/approved items cannot be overwritten or reopened by AI acceptance. Historical submissions/approvals/exports remain unchanged.

## Database

**V20 only** adds ACCEPTED to the existing job state constraint and nullable `schema_snapshot` / `acceptance_json` columns. No new table, dependency or applied-migration edit. Snapshot capture is part of new job creation; legacy V19 jobs lacking a reliable question snapshot remain previewable/copyable but acceptance requires regeneration. The acceptance snapshot retains the prior ordinary answer, accepted answer/version and timestamp until the job's original30-day expiry. Existing retention maintenance purges these new content columns alongside input/result and sets EXPIRED; this is not permanent draft-history retention. Original text can be copied in the current comparison; no new restore API was invented. Strict checks now expect20 migrations and35 tables.

## Frontend

The established `features/ai` component/schema and `features/client` portal/autosave paths are retained (no parallel client-portal feature). Existing RTK Query transport, forms, shared panels, native confirmation dialog, error controls and styles are reused. Preview labels distinguish the original saved answer from AI-generated copy; supplied facts, missing facts and warnings are visible. Generate/read/accept responses are validated with Zod. Processing, failure, refusal, expiry and load errors keep normal writing available. Copy and local discard never save; regenerate preserves notes and requests another job only after an explicit new generation action.

Use this draft opens a separate confirmation. Success is shown only after a validated matching server answer. Dirty/conflicted answers block generation/acceptance. The editor is locked during acceptance; its autosave object adopts a confirmed answer/version without issuing a second save. If local content changed, the autosave handoff retains it and opens the existing comparison instead. Uncertain acceptance retries keep the same idempotency key, including when a later job read reports ACCEPTED. The original comparison remains available to copy; no raw HTML is rendered. Terminal jobs stop polling.

The live collection now exposes the real project AI flag and validates item AI policy. The separate owner read-only preview still exposes aiEnabled=false and cannot mutate client data. The live portal integrates the AI assistant only for editable opted-in LONG_TEXT items. No production provider, model, key or cost setting was enabled.

## Verification

- Backend focused acceptance/HTTP run:13 passed,1 draft-validation test expectation corrected; the corrected case then passed separately. The correction tests maximum-length validation, because minimum/required constraints deliberately apply at submission rather than ordinary draft save.14 distinct focused cases are covered, including all three project types, explicit/idempotent acceptance, prior-answer recovery, stale/force-overwrite conflicts, changed/legacy schema, QUEUED/FAILED/REFUSED/expired/revoked/submitted restrictions, rollback, tenant isolation and concurrent writers.
- Frontend:27 preview/autosave tests passed. After adding uncertain-acknowledgment recovery, its10-case AI subset passed again; the17 unchanged autosave cases remain green. The existing mock stale-suggestion case passed1 test with24 unrelated cases intentionally filtered out. Total28 distinct affected frontend cases. Initial schema/type and duplicate-hidden-status test issues were fixed before the green runs.
- Strict TypeScript/production build, changed-file zero-warning ESLint and Prettier passed. Existing nonfatal bundle-size advisory remains.
- Real HTTPS/MSW-disabled AI stage passed preview/discard/no mutation, separate confirmation, normal DRAFT persistence and stale acceptance409 preserving a newer writer. The complete enclosing lifecycle also passed:1 test,0 failures/errors/skips, including prior submission/review/reopening/export checks. Its first run exposed an existing offline-test race: automatic retry could complete before clicking Retry save. The test now atomically chooses the available retry action or confirmed saved state and additionally checks exact server text; no sleep, weakened assertion or inflated timeout was added.
- Full backend `clean verify`: **984 passed,0 failures,0 errors,0 skipped**, preserving all971 baseline cases plus13 T25 additions. This one complete run includes all14 focused acceptance/HTTP cases, fresh/upgrade/restart Flyway V1–V20, Hibernate validation and executable Spring Boot JAR packaging. Shared security, collection projection and persistence changes justified this single full regression.
- Unrelated complete frontend, responsive and PWA suites intentionally skipped. No paid-model grounding, production AI account/pricing/privacy or deployment acceptance is claimed. T04–T06, T16, T20 and all other independent production/device gates remain unchanged.

## Changed files

- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/ai/controller/AiController.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/dto/AiDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/repository/AiRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/service/AiService.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientPortalService.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
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
- `frontend/src/features/ai/components/AiAssistant.tsx`
- `frontend/src/features/client/components/ClientDraftField.tsx`
- `frontend/src/features/client/components/CollectionPortal.tsx`
- `frontend/src/features/client/hooks/draftAutosave.ts`
- `frontend/src/features/client/schemas/collectionSchema.ts`
- `frontend/src/mocks/commercial.ts`
- `frontend/src/services/api/resourceSchemas.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/draft-autosave.test.ts`
- `frontend/tests/unit/product.test.ts`
- `backend/src/main/resources/db/migration/V20__ai_acceptance.sql`
- `docs/T25_IMPLEMENTATION.md`
- `frontend/src/features/ai/schemas/aiSchema.ts`
- `frontend/tests/unit/ai-assistant.test.tsx`

The pre-existing collection controller/repository edits are excluded from this task and commit. They were not reset, overwritten or formatted; both SHA-256 hashes match the task-start values after implementation.

Status: **T25 Complete for original-roadmap local acceptance.** M5 remains In progress. Commit and working-tree status are reported separately.
