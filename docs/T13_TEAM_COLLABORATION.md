# T13 Part 1 — team collaboration

30 October 2026. **T13 Part 1 Complete. M2 remains In progress** for the independent T11 reopening and release dependencies. No remaining local T13 acceptance blocker.

## Scope and lifecycle

Owners invite workspace members by email. A pending invitation reserves one plan seat (Solo 1; Agency 5, including the owner). The credential uses the existing 32-byte random, purpose-bound SHA-256 token mechanism, expires after seven days, and is accepted only by the matching authenticated, ACTIVE, email-verified agency account. Registration and verification remain the existing account workflow; accepting an invitation never creates an account or bypasses verification.

PENDING transitions to CONSUMED, REVOKED or EXPIRED. Expiration frees capacity without a delivery worker. Duplicate live invitations return 409 INVITATION_PENDING; active membership returns 409 MEMBER_EXISTS. The catalog defines no team resend endpoint: revoke then issue a replacement with a fresh idempotency key. T05 provider/resend deployment gates remain pending. Repeated same-key requests replay only within the existing 24-hour actor/workspace/route scope; changed payloads return IDEMPOTENCY_KEY_REUSED. Acceptance replay checks current membership and cannot reactivate removed access. A fresh authorized invitation may reactivate an existing disabled membership while preserving its ID and clearing old assignments.

Owners can list members/invitation lifecycle summaries, disable/remove a member, restore an eligible member subject to quota, revoke invitations, and transfer ownership after current-password verification. Direct role promotion is rejected. The owner cannot be disabled/deleted; transfer atomically demotes/promotes under locks and the existing unique-owner indexes. A target must be a live verified active member and cannot already own another workspace. Transfer revokes pending invitations issued under the previous ownership authority. Contributions and attribution survive membership disable/removal.

## API contracts

All paths are under /api/v1; all responses use no-store. The ordinary agency authentication/session/CSRF/CORS policy applies. Default-deny remains in place for unlisted routes and methods.

| Method/path | Request | Response / access |
|---|---|---|
| GET /workspaces/{w}/members | — | 200 {data, pendingInvites}; OWNER |
| POST /workspaces/{w}/members | {email}; Idempotency-Key | 202 {invitation:{id,email,expiresAt,state}}; OWNER |
| POST /team-invitations/accept | {token}; Idempotency-Key | 200 {membership:{memberId,workspaceId,workspaceName,role}}; matching verified user |
| PATCH /workspaces/{w}/members/{m} | {state: ACTIVE or DISABLED} | 200 {member}; OWNER; no direct role changes |
| DELETE /workspaces/{w}/members/{m} | — | 204; OWNER; disables and removes assignments |
| DELETE /workspaces/{w}/member-invitations/{i} | — | 204; OWNER; releases reservation and destroys queued capability |
| POST /workspaces/{w}/ownership-transfer | {targetMemberId,currentPassword}; Idempotency-Key | 200 {workspace}; current OWNER with reauthentication |
| GET /workspaces/{w}/projects/{p}/assignments | — | 200 {data:[{memberId,canReview,canExport}]}; OWNER |
| PUT /workspaces/{w}/projects/{p}/assignments/{m} | {canReview:boolean,canExport:boolean} | 200 {assignment}; OWNER; same-workspace eligible MEMBER |
| DELETE /workspaces/{w}/projects/{p}/assignments/{m} | — | 204; OWNER; idempotent removal |

The optional role field on invitations accepts MEMBER only; it never promotes. The member read response includes lifecycle summaries (latest 100 invitations), not credentials. Unknown/foreign IDs return 404 NOT_FOUND. Wrong invitation identity returns 403 INVITATION_EMAIL_MISMATCH; expired/revoked/consumed capabilities return documented TOKEN_* errors. Invalid credentials/purpose fail closed. SEAT_LIMIT, OWNER_REQUIRED, WORKSPACE_ALREADY_OWNED and ownership-transfer reauthentication errors are explicit; standard problem JSON and request correlation are preserved.

## Authorization and concurrency

Roles are projected live through /me, never embedded as workspace grants in JWTs. The existing session/account validation is reused. Owner project reads remain workspace-wide; MEMBER lists, project detail/structure and customer lists require exact project assignments. Review/export flags are independent; assignment never grants structure editing, client contact management, preview or assignment administration. Read-only owner preview remains owner-only. Read-only/closed workspace and project gates constrain grant creation; revocation remains available to reduce access.

Services acquire account, workspace/membership, subscription and scoped project locks in existing order. Ownership transfer locks both account rows in UUID order before workspace locks. PostgreSQL constraints and transactions, not in-memory locks, serialize seats, duplicate invitations, token consumption, assignments and ownership. Removal racing an authorized read can allow that already-ordered read to finish, but every subsequent operation rechecks live access. Audit writes and idempotency state roll back with grants and token consumption. No immutable snapshot, structure ID/version, collected answer or historical submission is modified.

## Persistence and delivery

Only V11__team_invitations_and_project_assignments.sql is added. V1–V10 remain byte-for-byte unchanged. V11 adds scoped invitation metadata, project_members assignments with composite tenant FKs and uniqueness/indexes, extends access_tokens with TEAM_INVITE and workspace-bound principal constraints, extends the existing outbox purpose check, and permits workspace audit records without project_id. Existing account token purposes retain non-null account identity constraints. Invitation principals reference same-workspace membership; assignment records reference same-workspace projects and memberships.

The existing AES-GCM encrypted outbox is reused atomically with invitation issuance; only digests and safe lifecycle metadata are queryable. Raw capabilities are encrypted with job/token AAD and never returned by the production API, persisted in browser storage, or logged. The existing delivery worker builds /team-invite#token=... links, rechecks token/workspace/inviter/plan eligibility, and erases terminal payloads. It sends outside the issuance transaction. Known failures use the existing bounded retry policy; unknown outcomes remain held for trusted evidence-based AccountDeliveryOperations reconciliation. Revocation/acceptance destroys queued or held payloads. No new email subsystem, provider credential, public operations endpoint or automatic unknown-outcome resend is introduced. A send already in flight cannot be recalled; the revoked capability remains unusable.

## Backend packages

- workspace/controller/WorkspaceTeamController: thin catalog route adapters.
- workspace/service/{WorkspaceInvitationService,WorkspaceMembershipService,WorkspaceTeamPolicy}: invitation, member/ownership and entitlement responsibilities.
- workspace/repository/{WorkspaceInvitationRepository,WorkspaceMemberRepository,WorkspaceRepository}: scoped metadata, membership and locking.
- workspace/entity/{WorkspaceInvitation,WorkspaceMember}; workspace/dto/WorkspaceTeamDtos; workspace/security/WorkspaceAuthorization.
- project/{controller/ProjectAssignmentController,service/ProjectAssignmentService,repository/ProjectAssignmentRepository,entity/ProjectAssignment,dto/ProjectAssignmentDtos}; existing ProjectAuthorization/ProjectService/ProjectRepository/ProjectCustomerRepository enforce assigned reads.
- common/repository/{IdempotencyRepository,AuditRepository}: shared concrete transactional persistence, not another framework. ProjectCreationRequests delegates the existing project request contract.
- auth existing token/outbox/worker/operations packages support the new purpose; account/session model unchanged.

## Frontend organization and behavior

Feature-owned workspace/api/teamApi and workspace/schemas/teamSchema reuse the one RTK Query transport and strict response validation. TeamPage uses React Hook Form/Zod, member/lifecycle states, seat counts from actual workspace entitlements, stable per-payload invitation retries and correct revocation paths. Invitations do not stage undocumented assignments; owners use the project Team tab after acceptance. Project api/assignmentsApi and schemas/assignmentSchema own assignment contracts; AssignmentsPanel handles loading/errors/empty states, search, independent flags and removal. Owner controls are hidden for members, with backend enforcement authoritative.

TeamInvitationPage retains its memory-only capability through sign-in, refreshes /me after explicit acceptance, selects the returned workspace and opens its overview route. Ownership transfer refreshes live identity after success. Membership changes clear agency/client caches; access-denied workspace requests reconcile /me; focus/reconnect recheck active reads and live identity. There is no claim of server push or erasing information already observed by an authorized user. Existing cross-tab logout and in-memory bearer token handling remain in place. All generated frontend evidence stays under .artifacts/.

## Verification

Final backend clean verify: **657 tests passed**, preserving all 620 baseline cases and adding **37 focused T13 cases**; zero failures, errors or skips. PostgreSQL 18 Testcontainers exercised duplicate/acceptance races, owner/assignment changes, revocation versus reads/writes, expiry/workspace closure during a real database lock wait, rollback, quota, tenant FKs, delivery hold/reconciliation and restart. Flyway validates all 11 migrations; Hibernate uses validation; the executable Spring Boot JAR includes the T13 feature classes and V11. No dependency/specification/applied V1–V10 changes.

Frontend unit: **97 passed / 5 files** (87 baseline + 10 collaboration/session contract cases); strict TypeScript, production build, zero-warning lint and formatting passed. Vite retains the existing nonblocking >500 kB browser/mock chunk advisory; no dependency or chunk-warning suppression was added.

Final real HTTPS: **2 passed**, zero failures/errors/skips, with MSW disabled and isolated fake delivery. The extended onboarding lifecycle performs owner invitation, encrypted-outbox delivery, new account registration and verification, explicit matching-user acceptance, /me projection, actual project assignment UI, direct denial of unassigned Project B, read-only owner preview denial, assignment/member revocation and reload/refresh/cache/logout regression. No real provider email or production credentials are used. The original authentication lifecycle retains secure-cookie, CSRF/CORS, refresh rotation, recovery and logout checks.

Corrections made during verification: configured the missing synthetic encryption key in the initial test fixture; isolated the delivery test to its own recipient; corrected new browser field selectors; fixed the actual accepted-workspace link to /overview; and serialized live identity refresh before explicit bootstrap, with a new deterministic unit regression. An earlier responsive run had **72 passes/3 failures** from the real navigation defect. The next had **74 passes/1 failure** after a documentation edit triggered a Vite document reload and reset an in-memory mock session; the trace shows the second HTML navigation and bootstrap 401. No application assertions/timeouts were weakened. The final complete responsive rerun passed **75/75** with the frontend frozen, zero failures/skips. Production PWA verification passed **1/1**, including public-only cache allowlisting and offline private-route behavior. Earlier failures are retained here as correction history; the final run is clean.

Evidence (ignored): backend/target-t13-{focused,verify,https}.log; frontend/.artifacts/t13-{unit,typecheck,build,lint,format-check,responsive}.log and .artifacts/playwright/e2e screenshots/traces. Desktop/tablet/phone invitation drawer screenshots were inspected for labels, focus, layout and overflow. All final counts above are confirmed from the completed logs. No physical-device/provider/deployment verification is implied.

## Remaining dependencies

T11 real collected-work reopening/revalidation still requires T14–T17/T22 persistence. T14 client grants/exchange, T15–T17 answers/revisions/review, T22 lifecycle and future review/export API enforcement remain separate tasks. No such workflow was implemented here. T04 hosted CI, T05 actual provider/resend, T06 deployment/proxy/key/retention gates remain pending. Physical devices, production email providers and hosted deployment are not verified by local fakes/browser tests. No push.

## File manifest and commits

Manifest relative to the clean starting HEAD `dd4ae71`; generated logs/artifacts are ignored and not committed.

### Created

- `backend/src/main/java/com/ayaantrix/collector/common/repository/AuditRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/common/repository/IdempotencyRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/project/controller/ProjectAssignmentController.java`
- `backend/src/main/java/com/ayaantrix/collector/project/dto/ProjectAssignmentDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/project/entity/ProjectAssignment.java`
- `backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectAssignmentRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectAssignmentService.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/controller/WorkspaceTeamController.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/dto/WorkspaceTeamDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/entity/WorkspaceInvitation.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/repository/WorkspaceInvitationRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/service/WorkspaceInvitationService.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/service/WorkspaceMembershipService.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/service/WorkspaceTeamPolicy.java`
- `backend/src/main/resources/db/migration/V11__team_invitations_and_project_assignments.sql`
- `backend/src/test/java/com/ayaantrix/collector/workspace/TeamCollaborationTests.java`
- `docs/T13_TEAM_COLLABORATION.md`
- `frontend/src/features/projects/api/assignmentsApi.ts`
- `frontend/src/features/projects/schemas/assignmentSchema.ts`
- `frontend/src/features/workspace/api/teamApi.ts`
- `frontend/src/features/workspace/schemas/teamSchema.ts`
- `frontend/tests/unit/team.test.ts`

### Modified

- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/AccountDeliveryOperations.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationDeliveryWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationOutbox.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/AccountToken.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/TokenPurpose.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java`
- `backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectCreationRequests.java`
- `backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectCustomerRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/project/security/ProjectAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectService.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/entity/WorkspaceMember.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/repository/WorkspaceMemberRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/repository/WorkspaceRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/security/WorkspaceAuthorization.java`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectClientPreviewTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectFoundationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectStructureTests.java`
- `backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `frontend/ARCHITECTURE.md`
- `frontend/src/app/store/store.ts`
- `frontend/src/features/auth/components/SessionBoundary.tsx`
- `frontend/src/features/auth/pages/TeamInvitationPage.tsx`
- `frontend/src/features/auth/store/authSlice.ts`
- `frontend/src/features/auth/store/session.ts`
- `frontend/src/features/projects/components/AssignmentsPanel.tsx`
- `frontend/src/features/workspace/components/OwnershipPanel.tsx`
- `frontend/src/features/workspace/pages/TeamPage.tsx`
- `frontend/src/mocks/collaboration.ts`
- `frontend/src/mocks/handlers.ts`
- `frontend/src/services/api/baseApi.ts`
- `frontend/src/services/api/baseQuery.ts`
- `frontend/src/services/api/resourceSchemas.ts`
- `frontend/src/shared/hooks/useCommand.ts`
- `frontend/tests/e2e/polish.spec.ts`
- `frontend/tests/e2e/product.spec.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/auth.test.tsx`
- `frontend/tests/unit/product.test.ts`

Verified backend implementation/regression commit: `aca9494`. Frontend integration/session/browser regression commit: `01f06ff`. Documentation is a separate final commit. No push. The final working-tree status is checked after documentation is committed.
