# M4 / T21 Part 1 — Comments and review decisions

1 November 2026. Baseline `b2c68d0`. Backend `817c206`; frontend `4e93b88`.

**T21 Complete for the original roadmap's local comments/decision acceptance. M4 remains In progress.** No T22 lifecycle/reopening, T23 exports, production deployment or full-MVP acceptance is claimed. No remote push.

## Original scope and existing foundation

Original Section 22 calls T21 **Comments and review decisions**, acceptance **Internal comments never reach clients; decision race handled**. This is broader than the prompt's review-decision title: client/agency comments and visibility are included. Sections 4, 6.2–6.3, 9–12 and the supplied API catalog define exact-revision APPROVE/REQUEST_CHANGES, a required client-visible change-request reason, live independent review permission, immutable history, idempotency and atomic races. Original specifications are unchanged.

T17 already provides immutable revisions/file manifests, client submit/withdraw, agency current review queue, history/detail and PostgreSQL project serialization. T13 provides owner access and independent assignment canReview/canExport flags. These are reused. Existing mock-only review UI remains mock-only; live mode now has a real Review tab and exact immutable detail flow. No global workspace review-queue endpoint or second HTTP client is invented.

## Architecture

```text
backend/src/main/java/com/ayaantrix/collector/review/
  controller/ AgencyReviewController, ClientCommentController
  dto/        ReviewDtos (validated decision/comment records and enums)
  repository/ ReviewRepository (scoped JDBC persistence and safe projections)
  security/   ReviewAuthorization (existing project/session/membership policies)
  service/    ReviewService (transactional decision/comment orchestration)
frontend/src/features/review/
  components/ LiveReviewPanel.tsx, ClientComments.tsx
  schemas/    reviewSchema.ts
  types/      existing review.types.ts reused unchanged
```

The new append-only tables use the existing scoped JDBC pattern, like submission snapshots; no duplicate JPA submission/item entity, empty entity package, speculative interface or replacement authentication framework. Existing ProjectAuthorization, SubmissionRepository.transition, ClientAnswerRepository, structure visibility, audit and IdempotencyRepository remain authoritative. Client checklist/item services use SQL-filtered client comment projections. Controllers only validate/map HTTP and cookie extraction.

## Contracts and transitions

All routes below include `/api/v1`.

| Method and path                                                | Contract and access                                                                                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/workspaces/{w}/projects/{p}/review-queue`                | Reused current SUBMITTED revision summaries with existing page/size; owner or assigned canReview member                                                          |
| GET `/workspaces/{w}/projects/{p}/items/{i}/revisions`         | Reused immutable historical summaries; owner or assigned reader                                                                                                  |
| GET `/workspaces/{w}/projects/{p}/items/{i}/revisions/{r}`     | Existing `{revision}` plus additive `{decisions: ReviewDecision[]}`; frozen revision payload unchanged                                                           |
| POST `/workspaces/{w}/projects/{p}/items/{i}/review-decisions` | `{revisionId, expectedItemVersion, decision: APPROVE or REQUEST_CHANGES, reason?}`; required Idempotency-Key; 201 `{item,decision}`; owner or assigned reviewer  |
| GET/POST `/workspaces/{w}/projects/{p}/items/{i}/comments`     | Read `{data: Comment[]}` or post `{body,visibility: CLIENT or INTERNAL}` ->201 `{comment}`; owner or assigned member; review permission is not needed to comment |
| GET/POST `/client/projects/{p}/items/{i}/comments`             | Independent client cookie and live grant; read `{data: ClientVisibleComment[]}` or post `{body}` ->201 `{comment}`; client visibility always CLIENT              |

Only SUBMITTED with the exact current revision ID and item version can receive a decision. APPROVE sets APPROVED, retains its current revision reference and records reviewer/member identity, decision, timestamp and optional reason. REQUEST_CHANGES restores the exact submitted value into a separate editable answer, advances answer version, clears its old save operation identity, sets CHANGES_REQUESTED/current revision null and creates revision-bound CLIENT feedback. The original submitter attribution remains on the copied answer; the reviewer/action is separately attributed in the decision and audit. Subsequent edits use DRAFT; resubmission creates a new immutable revision. Previous submissions and decisions remain unchanged.

Item and project versions/timestamps advance atomically through the existing submission transition. Existing visibility-aware progress counts APPROVED as submitted/approved and change requests as client work. Website, web-app and mobile-app review tests use the same evaluator. There is no approval of a draft, historical revision or newer unsent draft. Client withdrawal and newer submissions make old commands conflict.

Current mutations require an ACTIVE project, ACTIVE workspace and writable subscription; PAUSED, COMPLETED, ARCHIVED and deletion states reject writes. Readable history remains available subject to live access. T22 publication/resume/reopen/completion/archive are not implemented here. Existing new DRAFT projects still require future publication before client invitation; tests use the existing trusted ACTIVE fixture, not a fake publication API.

Comments are plain text, nonblank and at most 5000 characters. Client DTOs have no selectable visibility/author and client SQL queries only select CLIENT rows. Responses omit visibility/member/contact/email/private author fields. Request-change feedback appears in item/checklist projections and explicit comment reads. The frontend collection schema now accepts real safe comments; read-only preview contracts still allow no comments. No raw HTML renderer or internal-to-client fallback exists.

Standard no-store, problem JSON and X-Request-ID behavior remain. Live agency routes return401 without credentials,403 for missing review action on an accessible project,404 for inaccessible tenant/project/item resources, and409 ITEM_VERSION_CONFLICT with currentVersion for stale/current-state conflicts. Missing or malformed keys use existing validation; changed input with the same key returns409 IDEMPOTENCY_KEY_REUSED. Blank change-request reasons return422 VALIDATION_FAILED (ordinary bean-shape violations use400). READ_ONLY, WORKSPACE_READ_ONLY and REVIEW_FORBIDDEN preserve existing denial semantics.

## Security, persistence and concurrency

- Live JWT/session, account, workspace membership and exact project assignment are rechecked inside transactions. Assignment and export permission alone never confer review permission. Revoked membership, assignment, session and foreign tenant/revision tests deny writes. Client sessions never become agency principals; owner preview remains read-only.
- Existing account/workspace/membership and project locks serialize mutation; item SELECT FOR UPDATE protects the exact decision target. A unique revision decision constraint is a second database guard. Concurrent reviewers yield one committed decision and one409. Waiting reviews recheck withdrawal, replacement submission, project closure and permission revocation after committed changes.
- Decision, mutable draft restoration, item/project versions, client-visible feedback, audit and 24h actor/tenant/route/input-bound idempotency response commit or roll back together. Live authorization precedes replay, so cached success cannot resurrect revoked access. No external network/provider call occurs under these locks.
- V16 alone adds `collector.review_decisions` and `collector.comments`, composite tenant/project/item/revision/member/contact FKs, one decision per revision, body/reason/visibility/actor checks and a scoped comment index. Existing immutable-history rejection triggers protect decisions and comments from UPDATE/DELETE. V1–V15 are byte-for-byte unchanged. JAR inspection confirms review classes and V16 resource.
- Review history stores stable reviewer member identity/time and preserves attribution after member disable. Client replies cannot request INTERNAL visibility. Feedback bodies and submitted values never enter audit metadata/application logs; audits carry safe identity/action/revision references. Private attachment downloads and retained immutable file links remain under existing authorization/scanning/quota rules.

## Frontend behavior

Live authorized projects now expose Review in navigation. Queue pagination and history selection reuse RTK Query. Review fetches the exact immutable detail, renders typed answer labels/files, displays previous decisions and separates client conversation from internal notes. Assigned readers can discuss content through Submitted versions without acquiring decision controls. Historical/approved revisions disable decisions; no live Reopen action was added.

Approval requires explicit confirmation. Change requests require clear feedback and label it client-visible. Commands freeze revision/item version at confirmation, reuse a per-payload request key on uncertain retry and guard duplicate in-flight confirmation. UI success requires a validated matching server decision, item and resulting state. Failures retain feedback; stale decisions instruct refresh. Client editors show server-confirmed feedback/replies through the existing transport. No optimistic approval, draft mutation on click, browser-persistent token, shared UI redesign or unrelated feature.

## Verification and exact evidence

| Check                                           | Actual outcome                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial focused review PostgreSQL run           | 23 passed,0 failures/errors/skips                                                                                                                                                                                                                                                            |
| Full backend `clean verify` with Docker running | 913 executed:896 passed,17 failed on stale migration/table-count expectations,0 errors/skips; all24 new review tests passed, existing26 submission tests passed                                                                                                                              |
| Focused correction of those17 checks            | 17 passed,0 failures/errors/skips; `verify` packaged executable Boot JAR                                                                                                                                                                                                                     |
| Backend coverage conclusion                     | All913 distinct cases have passing evidence across the full run and the17-case correction. There was **not** a subsequent single full913 green run. Production backend code did not change between those runs; only exact test expectations changed from15 to16 migrations and28 to30 tables |
| Targeted frontend                               | Final44 passed /3 files:6 review,17 submission,21 client-access;0 failures                                                                                                                                                                                                                   |
| Strict TypeScript and production build          | Passed; existing large-chunk advisory remains                                                                                                                                                                                                                                                |
| Changed-file ESLint/Prettier                    | Passed,0 lint warnings                                                                                                                                                                                                                                                                       |
| Actual HTTPS browser, MSW disabled              | Final1 passed,0 failures/errors/skips; real navigation, internal/client discussion, change request, resubmission, historical denial, approval and immutable prior snapshot                                                                                                                   |
| Flyway/Hibernate/restart/JAR                    | Fresh/older-version upgrades, validation and data-preserving restarts passed in corrected checks; executable JAR packaged and contents inspected                                                                                                                                             |
| Whitespace/source preservation                  | `git diff --check` passed; specifications, prior migrations, dependencies/lockfiles unchanged                                                                                                                                                                                                |

A preceding engine-unavailable full attempt reported288 tests,0 failures,16 infrastructure errors; it is not counted as successful regression evidence. Docker Desktop was restored locally without disabling tests. During initial focused development there were Java test compilation/type errors, an idempotency numeric-node comparison mismatch and a401 route-classification gap; fixed without weakening assertions. Initial frontend build caught unsupported Testing Library `exact` options; corrected to exact regex names. First HTTPS run exposed the empty-only client comment schema; fixed with a regression case. The complete selected HTTPS lifecycle then passed. No failed run or skipped assertion is represented as a pass.

Focused backend cases cover exact approval/replay/history, request changes/draft restoration/resubmission, client/internal isolation across explicit and embedded reads, forced client visibility, concurrent decisions, atomic rollback, independent review/export flags, absent/revoked assignments/membership/session, cross-tenant and revision binding, waiting withdrawal/new-submission/closure/revocation, request/error/CSRF/correlation contracts, three project types/progress and read-only plan writes.

The one HTTPS JUnit lifecycle uses the existing real Spring/PostgreSQL/private-storage/scanner/browser fixture with MSW off and synthetic email. It also preserves prior onboarding/attachment/session steps. The new stage enters through real Review navigation, posts an INTERNAL note, verifies it is absent from client data/UI, requests changes on revision2, posts a client reply, submits revision3, refuses historical revision2 approval, approves revision3, checks APPROVED/read-only client state, and compares unchanged revision2 snapshots. Provider/device/production acceptance is not inferred.

Ignored logs: `backend/target-t21-focused-final.log`, `target-t21-verify.log` (engine failure), `target-t21-verify-final.log` (913-case run), `target-t21-failed-selection.log`, `target-t21-migration-recheck.log`, `target-t21-https.log` (first failure), `target-t21-https-final.log`; frontend `.artifacts/t21-unit-final.log`, `t21-build-final.log`, `t21-lint.log`, `t21-format.log`. Raw credentials and customer data were not committed.

Commands from the project root, PowerShell:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=SubmissionTests#review*' test
# Full regression: initial Docker-blocked attempt, then one complete run and focused failure correction:
.\mvnw.cmd clean verify
# The exact17-case selector from the failed run is in ignored target-t21-failed-selection.log.
# Packaging/recheck was: .\mvnw.cmd "-Dtest=$failedChecks" verify
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck#realHttpsWorkspaceOnboardingWithoutMocks' test
Set-Location -LiteralPath '..\frontend'
npm test -- tests/unit/review.test.tsx tests/unit/submissions.test.tsx tests/unit/client-access.test.tsx --maxWorkers=1 --pool=threads
npm run build
```

Intentionally not rerun: all unrelated frontend unit tests, responsive75-case suite, production PWA, the separate auth-only HTTPS lifecycle or real providers/devices. Shared CSS/navigation architecture/PWA/dependencies did not change; the new Review link and journey were exercised in actual HTTPS. The full backend suite was not repeated after only migration-count expectations were corrected; the17 failures were individually rerun and passed. Hosted CI can supply a future one-shot913 green report.

## Remaining gates and status

No remaining local blocker for original T21 comments/decision acceptance. T21 Part1 and the roadmap T21 are Complete for this scope; M4 remains In progress. T20 real-device iOS/Android photo/error acceptance stays pending. T04 hosted CI, T05 live provider/resend, T06 deployment, T11 collected/approved reopening/revalidation, T16 production storage/scanner/codec/device and T22 publication/completion/reopen/archive gates stay open. Native devices, real mail and production infrastructure were not verified. New review tests do not close any of these gates.

Backend commit `817c206`; frontend/integration commit `4e93b88`; final documentation commit is reported separately. Working-tree status is reported after documentation commit. No push.

## Exact changed-file manifest

The migration-count test edits retain every existing assertion and only update the expected current schema totals. All paths below are relative to the project root.

- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientPortalService.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/repository/ClientAnswerRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/service/ClientAnswerService.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java`
- `backend/src/main/java/com/ayaantrix/collector/review/controller/AgencyReviewController.java`
- `backend/src/main/java/com/ayaantrix/collector/review/controller/ClientCommentController.java`
- `backend/src/main/java/com/ayaantrix/collector/review/dto/ReviewDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/review/repository/ReviewRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/review/security/ReviewAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/review/service/ReviewService.java`
- `backend/src/main/java/com/ayaantrix/collector/submission/service/SubmissionService.java`
- `backend/src/main/resources/db/migration/V16__review_decisions_and_comments.sql`
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
- `frontend/src/features/client/components/ClientDraftField.tsx`
- `frontend/src/features/client/schemas/collectionSchema.ts`
- `frontend/src/features/projects/components/SubmissionHistoryPanel.tsx`
- `frontend/src/features/projects/pages/ProjectPage.tsx`
- `frontend/src/features/review/components/ClientComments.tsx`
- `frontend/src/features/review/components/LiveReviewPanel.tsx`
- `frontend/src/features/review/schemas/reviewSchema.ts`
- `frontend/src/services/api/resourceSchemas.ts`
- `frontend/src/shared/utils/apiError.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/client-access.test.tsx`
- `frontend/tests/unit/review.test.tsx`
- `docs/T21_REVIEW_DECISIONS.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
