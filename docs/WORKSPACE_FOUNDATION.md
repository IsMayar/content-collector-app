# Workspace foundation — T07 Part 1 — 27 October 2026

Implements the workspace database/domain foundation and the four existing catalog routes. Code/test commit: `c3cff0d`. T07/M1 remain **In progress**, not full onboarding or product acceptance. T08 frontend session lifecycle, T09 templates, T10 projects, T13 invitation/member administration and T32 billing are outside this change. No frontend source, original specification or V1–V5 migration changed. No dependency added.

## Schema and ownership

`V6__create_workspace_foundation.sql` adds three tables in `collector`:

- `workspaces`: reference name, IANA timezone (default America/Chicago), optional logo key, ACTIVE/READ_ONLY/SUSPENDED/DELETION_PENDING state, decimal byte counters, optimistic version, creation/update timestamps. New workspaces have zero used/reserved bytes and 50,000,000,000 storage bytes. There is no invented workspace-type field: Solo/Agency is a plan choice, not a separate tenant identity model.
- `workspace_members`: UUID identity and workspace/user foreign keys, OWNER/MEMBER role, ACTIVE/DISABLED state, explicit timestamps, unique (workspace,user) and (workspace,id). An indexed user/state/workspace lookup supports membership discovery. There is no global support/admin role. Removal uses DISABLED in future management; a physically absent record also denies access.
- `subscriptions`: **local trial/entitlement-only subset of the reference table**, one row per workspace, SOLO/AGENCY plan key, reference entitlement states and period/grace/read-only timestamps. No provider IDs, prices, payment subscriptions, checkout, webhooks, external calls or payment activation. Provider columns/services belong to T32. This avoids inventing a competing workspace_plan table.

Two partial unique indexes enforce at most one active owner per workspace and one actively owned workspace per user. Every supported creation inserts the workspace, its sole ACTIVE OWNER membership and local trial in the same transaction; exactly one owner is a service invariant, as specified in Section 11.2. It is not falsely described as a database check guaranteeing a minimum of one owner under arbitrary direct SQL. Future transfer/removal services must preserve that invariant transactionally and reauthenticate transfer; no such endpoint is opened here. Existing verified accounts may own one workspace and join others as MEMBER. Disabling a global account prevents authentication/access; it does not silently transfer or erase historical ownership.

JPA maps UUIDs, text enums and timestamptz explicitly; entities never leave services as HTTP responses. Scalar parent UUID mappings plus database foreign keys avoid unnecessary entity graphs/bidirectional relationships. Mutable workspace settings use an explicit timestamp update and JPA optimistic version; owner/member/trial creation timestamps use the injected server clock. No demo users or global mutable pricing rows are seeded.

## Trusted identity and tenant boundary

WorkspaceService obtains the authenticated JwtAuthenticationToken from Spring Security, never a supplied userId/ownerId/header role. It locks that account and revalidates the existing persistent session/account eligibility through AgencySessions. Locks follow account -> workspace -> membership. The central WorkspaceAuthorization requires a live ACTIVE membership in the requested workspace and locks/rechecks that row before owner-only commands. Settings updates require OWNER, writable entitlements and expectedVersion; members can read only their own workspace metadata/entitlements. Inaccessible, missing, removed and disabled membership identifiers return the same safe 404; a live member denied an owner action receives 403. Global account disablement or session revocation rejects identity.

Repositories are package-private and expose no generic findAll/findById/deleteById shortcuts. Tenant access queries include both trusted user and explicit workspace; member/plan lookups take workspace IDs. Subscription lookup only occurs after central authorization within the same transaction. The only user-scoped cross-workspace query is the authenticated user's own membership list. A workspace UUID alone grants nothing. No partially configured RLS is claimed; this is mandatory service authorization, scoped repository access, database relationship integrity and PostgreSQL isolation tests.

Future membership/ownership commands must acquire locks in the documented order and update timestamps; project services must additionally enforce same-workspace relationships and live project assignment. can_review/can_export belong to future project_members assignments, not workspace-wide roles. Membership in a workspace does not grant unimplemented project routes; all those routes remain denied. Client sessions cannot become agency/workspace identities.

## Plan definitions and trial seed

The deterministic closed PlanKey enum follows Section 18: SOLO has 1 seat, 100 AI drafts and 25 SMS segments; AGENCY has 5 seats, 300 drafts and 100 segments; both have 50 GB decimal storage and no commercial active-project cap. Prices are not stored or activated. PostgreSQL restricts plan keys to the same set. Definitions are version-controlled code, not extra invented catalog tables.

Creation always seeds TRIALING with the server timestamp and exactly 14 days. Optional planKey selects SOLO/AGENCY **for this local trial only**; omitting it uses SOLO. It cannot select ACTIVE, extend dates, supply provider identifiers or purchase/escalate a paid plan. PATCH only changes name/timezone and cannot change ownership, plan or entitlement state. Unknown plan enum values are 400. Server-side DTO allowlisting ignores unrelated fields without granting their requested privileges.

The guide does not give numeric reduced trial AI/SMS budgets. `TRIAL_AI_DRAFTS=0` and `TRIAL_SMS_SEGMENTS=0` therefore fail closed by default; operators can configure reduced budgets only within 0–100/0–25 after cost review. AI/SMS activation flags remain false until their later provider/consent implementations. No unapproved costly allowance or provider activation is invented. Entitlement checks compare the server clock with the trial/period deadline, not merely TRIALING text. Expired trial, non-ACTIVE workspace or missing plan denies settings writes. Missing plan returns a conservative zero-capacity response, never another tenant's entitlement. This foundation does not implement full T33 usage reservations, provider-driven grace/cancellation transitions or deletion jobs.

## HTTP contracts

All routes are relative to `/api/v1`, use real bearer authentication and no-store responses. POST/PATCH retain the existing CSRF session/header exchange. Anonymous identity on these opened routes is 401; missing CSRF is 403. Unrelated closed routes retain their existing default-deny behavior. Problem JSON, safe validation and X-Request-ID correlation are unchanged.

| Method/path | Request | Response |
| --- | --- | --- |
| GET /workspaces | None | 200 `{data: MembershipSummary[]}`; only active memberships of this actor |
| POST /workspaces | `{name,timezone?,planKey?}` | 201 `{workspace}`; name required <=150, timezone validated against Java IANA IDs; defaults America/Chicago and SOLO |
| GET /workspaces/{workspaceId} | None | 200 `{workspace,entitlements}` after live membership |
| PATCH /workspaces/{workspaceId} | `{name?,timezone?,expectedVersion}` | 200 `{workspace}` with incremented version on change; owner only; stale version 409 |

These envelopes follow api_catalog/api_contracts and existing frontend product DTOs. Optional planKey is the existing product handoff's documented onboarding extension, now accepted for initial trial choice. The original catalog name/timezone request remains valid; supplied references are unchanged. A duplicate owned workspace returns 409 WORKSPACE_ALREADY_OWNED. Blank/invalid settings return safe 400; read-only entitlement blocks PATCH with 403 WORKSPACE_READ_ONLY. No JPA/internal account, password, JWT or plan-provider state is serialized.

GET `/me` still returns the existing empty membership projection in this Part 1; GET `/workspaces` is the verified discovery endpoint. Wiring live membership summaries into `/me` and accepting real browser onboarding is remaining T07 backend integration, without redesigning T08 frontend session lifecycle. Do not claim the current frontend bootstrap automatically discovers a newly created real workspace yet.

## Actual verification

- Full `clean verify`: **278 backend tests, 0 failures, 0 errors, 0 skipped**. All previous 233 retained plus **45 WorkspaceFoundationTests**. Existing tests changed only expected latest migration/table counts and the prior no-workspace-autocreation assertion (now checks zero rows rather than absence of the newly required table). No test removed/disabled. Executable JAR packaged.
- Workspace tests use PostgreSQL 18.6 Testcontainers and actual signed JWTs/MockMvc. Covered clean V1–V6/Hibernate validation, V5 upgrade preserving account hashes and persistent sessions, real application restart, foreign keys, duplicate membership/owner/plan and one-owned-workspace rules, invalid enum/storage/period constraints, exact trial expiry, safe defaults, full transactional rollback at member/trial insertion, owner/member/disabled/unverified/global-disabled/revoked-session cases, forged tenant/user IDs, cross-tenant read/write/plan denial, CSRF/CORS, standard errors/tracing, default-denied future routes and concurrent creation/settings/membership changes.
- Concurrent creation has one complete winner and one 409 with no orphan tenant/member/plan. Concurrent settings writes have one version winner and one 409. Ownership demotion/member disablement while a command waits on the workspace lock is rechecked: 403/404 respectively. The strengthened targeted check also observes the actual PostgreSQL lock waiter before allowing the membership change to commit.
- Initial focused run exposed test-fixture SQL type/column mistakes and an anonymous route-status mismatch; these were corrected. New workspace identity failures use specification-required 401 while CSRF stays enforced. Final focused/full verification passed; no failed attempt was counted as success.
- Separate real HTTPS authentication browser regression: **1 test passed, zero failures/errors/skips**, after the new security route additions. Uses actual Edge/Vite/Spring/PostgreSQL, MSW off, with the established isolated test-certificate trust bypass. This verifies existing authentication, not new workspace UI onboarding.
- Frontend focused contracts/regressions: **69 tests in 3 files passed** (47 existing auth/transport + 22 product fixture tests). They use controlled HTTP mocks and are not proof of new real workspace browser acceptance. No frontend source changed or broad UI/PWA/build claim made.

Reproduce with Docker Desktop Linux engine running and Java 21:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real authentication regression failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test -- src/test/auth.test.tsx src/test/transport.test.ts src/test/product.test.ts --maxWorkers=1 --pool=threads
if ($LASTEXITCODE -ne 0) { throw 'Frontend contract regression failed.' }
```

The explicit authentication browser regression additionally needs Node/frontend dependencies and Edge, as documented for T06. It is separate from the 278 default backend tests. No real email, payment, AI or SMS provider credentials are used.

## Remaining acceptance and limitations

T07/M1 stay In progress for the remaining live `/me` membership projection and full verified-owner backend/browser onboarding acceptance. T13 owns invitation acceptance/reserved seats/member administration/reauthenticated transfer and audit; T08 owns frontend workspace switching/cache/session lifecycle; T32/T33 own actual billing and complete entitlement enforcement. No project-level isolation claim is made before those tables/services exist; future routes remain denied.

T04/M0 hosted CI remains pending (no remote configured). T05 resend/provider/operational acceptance remains pending. T06 deployment TLS/proxy/key rollout/abuse controls/retention checks remain pending. No local tool blocker, production credential, destructive migration or push. No full MVP completion claim.

Official implementation references checked: [Spring Data repository locks](https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html), [PostgreSQL 18 unique indexes](https://www.postgresql.org/docs/18/indexes-unique.html), [PostgreSQL partial uniqueness](https://www.postgresql.org/docs/18/indexes-partial.html).

## Exact change manifest

Created:

- `backend/src/main/java/com/ayaantrix/collector/workspace/PlanKey.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/Workspace.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceController.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceMember.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceMemberRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceRole.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceService.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceSubscription.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/WorkspaceSubscriptionRepository.java`
- `backend/src/main/resources/db/migration/V6__create_workspace_foundation.sql`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `docs/WORKSPACE_FOUNDATION.md`

Modified:

- `backend/.env.example`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java`
- `backend/src/main/resources/application.properties`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java`
- `backend/README.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
