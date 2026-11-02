# T22 — Project completion, reopening and archive

2 November 2026. **T22 Part 1 Complete for original-roadmap local acceptance.** M4 remains In progress. Backend commit `8b8ae0e`; frontend commit `a377b88`. No push.

## Scope and contracts

Original T22 is **Project completion, reopening and archive**, acceptance **Progress and lifecycle guards use the same evaluator**. Publication, pause/resume and restore are included as the existing catalog lifecycle foundation; this is broader than the attachment title. T23 and later features remain deferred. Original specifications and V1–V16 are unchanged.

All routes start `/api/v1/workspaces/{w}/projects/{p}`:

- POST `/publish`, `/pause`, `/resume`, `/complete`, `/reopen`, `/archive`, `/restore`: `{expectedVersion,reason?}`, required Idempotency-Key,200 `{projectState,projectVersion,publishedAt,publishedVersion}`. Project reopen requires a reason. Only the live owner can change project lifecycle.
- POST `/items/{i}/reopen`: `{expectedItemVersion,reason}`, required Idempotency-Key,200 `{item}`. Only the exact current APPROVED item can be reopened by owner or independently assigned canReview member.
- Existing PATCH `/items/{i}/schema` adds optional `reason` for explicit inline `reopenAffected`. Existing metadata/reorder contracts remain. A boolean alone cannot bypass REOPEN_REQUIRED.

DRAFT publication requires a validated enabled structure, usable active unexpired client contact and due date. Publication records its first timestamp/project version without issuing any client credential or changing the immutable initial project snapshot. Client invitation remains an explicit authorized operation.

ACTIVE pauses to PAUSED; PAUSED resumes to ACTIVE. Paused clients retain authorized reads but cannot write; agency review of existing submissions is allowed, correcting the earlier ACTIVE-only restriction. Completion from ACTIVE/PAUSED requires every visible required item approved, using the existing shared visibility-aware progress evaluator; optional unapproved items do not block it. COMPLETED project reopening requires a reason and returns ACTIVE while preserving approvals. Selective item reopening uses the separate exact-version item endpoint; project reopening does not silently reopen all items. Archive makes any eligible nondeleted project ARCHIVED/read-only and revokes pending invitation capabilities/outbox payloads through existing infrastructure. Restore returns PAUSED and requires an explicit resume. Restoring an unpublished archived draft cannot bypass publication validation when resumed. Future reminder/export jobs are not fabricated.

## Revision and T11 safety

Item reopening copies immutable submitted values into a separate versioned editable draft, clears current approval/revision eligibility, records a permanent reopening, client-visible reason and safe audit, and increments item/project versions. Old approvals, submissions and attachment links remain immutable. Resubmission creates a new revision identity.

T11 still assesses complete/transitive affected-item sets. Real drafts are revalidated using existing autosave semantics and retained attachment ownership/readiness, proposed image type and extension rules. Incompatible values reject the entire operation with422 DRAFT_REVALIDATION_FAILED; no value is truncated, converted or deleted. Required/minimum completeness still belongs to final submission validation. Submitted/approved work requires explicit reason-bearing reopening or persisted prior reopening/change-request proof for the latest revision. Marker-only legacy/fabricated collected states remain fail-closed. Compatible semantic changes preserve IDs, originals, draft values and immutable snapshots; project structure version advances atomically. This closes the local T11 draft/reopening integration dependency without disabling its policy.

Existing live JWT/session/membership/assignment checks, independent review/export flags, CSRF/CORS, client/agency separation and private storage remain. Existing workspace/project locks, item locks, unique reopening-per-revision constraint and optimistic versions serialize publication, reopening, decisions, autosaves and revocation. Audit, reopening/history, feedback, draft restoration, state/version and actor/tenant/route/input-bound idempotency commit or roll back together. Replays reauthorize and do not reapply historical transitions. Stale versions return409 PROJECT_VERSION_CONFLICT, ITEM_VERSION_CONFLICT or STRUCTURE_CONFLICT; invalid state changes return409 INVALID_PROJECT_TRANSITION. Missing publication prerequisites return422 PUBLICATION_VALIDATION_FAILED; incomplete completion returns409 PROJECT_INCOMPLETE. Standard problems, X-Request-ID and no-store remain.

V17 alone adds publication columns to projects and append-only item_reopenings/project_lifecycle_events with scoped foreign keys and immutable triggers. Lifecycle reasons are stored in domain history rather than raw answer/application logs. Controllers remain thin; project service/repository/dto/entity ownership and existing review security are reused. No duplicate domain entity/interface or HTTP client.

Frontend changes stay in projects, structure-editor, review and existing client features. Explicit confirmations, reason fields, stable request keys, version/conflict recovery, server-verified success, affected-content lists, approved read-only messaging and real completion/archive controls are integrated. Production deletion/export actions are not invented. Editor help text uses the shared Field hint contract, and conditional options use current query data.

## Verification

- Initial affected suites: **226 passed**, including existing structure, submission/review and attachment tests.
- Focused corrections: **24 passed**, plus **1 route guard passed**. New coverage includes publication for all three types, prerequisites/replay/version conflicts, concurrent publication/reopening, independent permissions, paused review, autosave serialization, completion/progress, snapshot/history preservation, compatible/incompatible drafts, retained document-to-image rejection and rollback.
- **Final full backend clean verify:936 passed,0 failures/errors/skips**, one complete green run. This includes all913 previous tests and23 additions. Flyway17 migrations, Hibernate validation, upgrade/restart and executable Boot JAR packaging passed. JAR contents include V17 and new lifecycle classes.
- Frontend: **30 passed across3 affected files**, then **1 additional editor regression passed**;31 distinct passing checks across4 files. Strict TypeScript/production build and changed-file lint/format passed. Existing large-chunk advisory remains.
- **Focused real HTTPS lifecycle:1 passed,0 failures/errors/skips, MSW disabled.** The previous artificial ACTIVE fixture is replaced with real UI publication. The lifecycle covers review, pause/resume, item reopening, compatible schema change, client resubmission4, exact approval, completion, project reopen/selective item reopen, archive/restore/resume and unchanged prior snapshots. Existing security/client/session steps remain. PostgreSQL asserts final ACTIVE and two reopening records. Synthetic provider fixtures do not prove production delivery/device acceptance.

Earlier failures are retained accurately: the first full run executed935 with2 failures from obsolete expectations (all draft semantic edits forbidden; newly implemented lifecycle routes considered unavailable). Those expectations now test compatible draft preservation/reorder and unsupported descendants; assertions were not suppressed. An additional retained-file revalidation gap was fixed and tested before the final936 green run. The first HTTPS run exposed an editor render error from multiple children in a single-control Field; a unit test reproduced it, the help text moved to hint, and the final complete selected HTTPS lifecycle passed. The old browser safety assertion now tests an actually incompatible draft edit and422 DRAFT_REVALIDATION_FAILED. No increased timeouts, arbitrary sleeps or skipped tests.

Ignored evidence: backend/target-t22-focused-final.log, target-t22-affected.log, target-t22-corrections.log, target-t22-route-correction.log, target-t22-verify.log (earlier failures), target-t22-verify-final.log (936 green), target-t22-https.log (earlier editor failure), target-t22-https-final.log (final green). Frontend .artifacts/t22-unit-final.log, t22-editor-unit.log, t22-build-final.log, t22-typecheck-final.log, t22-lint.log, t22-editor-lint.log and t22-format.log.

Reproduce in PowerShell from backend: `.\mvnw.cmd '-Dtest=SubmissionTests,ProjectStructureTests,AttachmentStorageTests' test`, `.\mvnw.cmd clean verify`, then `.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck#realHttpsWorkspaceOnboardingWithoutMocks' test`. Frontend: `npm test -- tests/unit/review.test.tsx tests/unit/lifecycle.test.tsx tests/unit/submissions.test.tsx tests/unit/structure-editor.test.tsx --maxWorkers=1 --pool=threads`, `npm run build`. Existing Java21/Docker Linux engine, Node/dependencies, Edge and private storage/scanner fixtures are required.

Intentionally not run: unrelated frontend units, full responsive suite, PWA suite, separate auth-only HTTPS lifecycle, physical devices or production providers. No shared CSS/PWA/dependency changes. Full backend was repeated only after actual failures/corrections to establish the requested all-green final run.

## Gates and file manifest

T22 and the local T11 reopening dependency are complete. T11 local editor acceptance is marked Complete; M2 remains In progress under recorded independent release gates. M4 remains In progress for T20 real-device acceptance and T23 exports. T04–T06 and T16 production/storage/codec/device gates remain pending; no full-MVP or production-readiness claim.

Exact implementation file paths, relative to project root:

- `backend/src/main/java/com/ayaantrix/collector/attachment/service/AttachmentService.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java`
- `backend/src/main/java/com/ayaantrix/collector/project/controller/ProjectLifecycleController.java`
- `backend/src/main/java/com/ayaantrix/collector/project/dto/ProjectLifecycleDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/project/dto/ProjectStructureDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/project/entity/Project.java`
- `backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectLifecycleRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectCollectedWorkService.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectLifecycleService.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectReopeningService.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectStructureMutationPolicy.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectStructureService.java`
- `backend/src/main/java/com/ayaantrix/collector/review/security/ReviewAuthorization.java`
- `backend/src/main/resources/db/migration/V17__project_lifecycle_reopening.sql`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/AttachmentStorageTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `backend/src/test/java/com/ayaantrix/collector/clientaccess/ClientAccessTests.java`
- `backend/src/test/java/com/ayaantrix/collector/collection/ClientAnswerTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectClientPreviewTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectFoundationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectStructureTests.java`
- `backend/src/test/java/com/ayaantrix/collector/submission/SubmissionTests.java`
- `backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/TeamCollaborationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `frontend/src/features/client/components/CollectionPortal.tsx`
- `frontend/src/features/client/components/SubmissionControls.tsx`
- `frontend/src/features/projects/components/LiveCompletionPanel.tsx`
- `frontend/src/features/projects/pages/ProjectPage.tsx`
- `frontend/src/features/review/components/LiveReviewPanel.tsx`
- `frontend/src/features/structure-editor/components/ItemEditor.tsx`
- `frontend/src/shared/utils/apiError.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/lifecycle.test.tsx`
- `frontend/tests/unit/review.test.tsx`
- `frontend/tests/unit/structure-editor.test.tsx`
- `frontend/tests/unit/submissions.test.tsx`

Documentation also updates docs/IMPLEMENTATION_STATUS.md, docs/FRONTEND_BACKEND_HANDOFF.md and backend/ARCHITECTURE.md.
