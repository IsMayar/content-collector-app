# Backend architecture and agency session integration — T08 Part 1

**T08 Complete for documented agency layout/session acceptance; M1 remains In progress.** Root Java package: `com.ayaantrix.collector`. Refactor commit: `bdec2bc`; lifecycle/version correction commit: `242ef1c`. Source/dependency audit covered 63 production Java files and 21 test Java files: package declarations, type responsibilities, imports, nested DTO/enum references, JPA/JPQL, visibility and Spring wiring. No new production type, persistence table, HTTP endpoint, dependency or specification change was needed.

## Current structure and future convention

```text
com.ayaantrix.collector
  CollectorApplication
  auth/
    controller/   exact HTTP mappings and DTO validation
    service/      account/session transactions, credential orchestration, membership port
    repository/   identity/session/token persistence
    entity/       account/token/session mappings and enums
    dto/          request/response records (no entity serialization)
    security/     JWT validation/signing, password/capability/cookie handling
    delivery/     encrypted outbox, provider boundary, worker and maintenance operations
  workspace/
    controller/   workspace HTTP boundary
    service/      workspace transactions and AccountMemberships implementation
    repository/   narrow tenant/user-scoped query and persistence ports
    entity/       workspace/member/local-trial mappings and domain enums
    dto/          workspace input and response records
    security/     trusted account/session/live-membership authorization
  common/
    SecurityConfiguration  existing global HTTP/CSRF wiring, intentionally retained
    error/        safe problem JSON and MVC/security error translation
    web/          request correlation and filter
```

For future features use controller/service/repository/entity/dto, with security/config only when there are actual responsibilities. Controllers validate/map HTTP; services own transactions/orchestration; repositories perform scoped persistence; entities own mappings and domain state; DTOs define public shapes; security centralizes permission checks. Keep shared transport/error/config infrastructure in common. Do not create empty packages or one interface per service. Do not serialize JPA entities or let URL tenant IDs substitute for authorization. Apply the same convention to later features without creating their packages/features now.

Auth already matched its logical structure and is unchanged. AccountWorkflowConfiguration remains beside the small account workflow wiring it configures; PasswordConfiguration remains beside its security encoder policy. Global common.SecurityConfiguration is retained rather than moving working framework wiring just to create a config directory. common.error keeps SecurityProblemHandler because it shares problem serialization/correlation with MVC errors; no empty common.security or common.config added. Feature-specific email/token utilities stay in auth.security; no catch-all utility package.

## Exact source moves

Paths below are relative to `backend/src/main/java/com/ayaantrix/collector/`. Class names remain unchanged. Every old package `com.ayaantrix.collector.workspace.X` becomes `com.ayaantrix.collector.workspace.<subdirectory>.X`:

| Old file | New file |
| --- | --- |
| `workspace/Workspace.java` | `workspace/entity/Workspace.java` |
| `workspace/WorkspaceMember.java` | `workspace/entity/WorkspaceMember.java` |
| `workspace/WorkspaceRole.java` | `workspace/entity/WorkspaceRole.java` |
| `workspace/PlanKey.java` | `workspace/entity/PlanKey.java` |
| `workspace/WorkspaceSubscription.java` | `workspace/entity/WorkspaceSubscription.java` |
| `workspace/WorkspaceRepository.java` | `workspace/repository/WorkspaceRepository.java` |
| `workspace/WorkspaceMemberRepository.java` | `workspace/repository/WorkspaceMemberRepository.java` |
| `workspace/WorkspaceSubscriptionRepository.java` | `workspace/repository/WorkspaceSubscriptionRepository.java` |
| `workspace/WorkspaceController.java` | `workspace/controller/WorkspaceController.java` |
| `workspace/WorkspaceDtos.java` | `workspace/dto/WorkspaceDtos.java` |
| `workspace/WorkspaceAuthorization.java` | `workspace/security/WorkspaceAuthorization.java` |
| `workspace/WorkspaceService.java` | `workspace/service/WorkspaceService.java` |
| `workspace/WorkspaceMembershipProjection.java` | `workspace/service/WorkspaceMembershipProjection.java` |

No duplicate type or compatibility shim is left at an old location. All 13 moves stay under the existing Spring Boot root scan. Entity names/tables and mapping annotations are preserved. JPQL's constructor name now points to workspace.dto.WorkspaceDtos$Membership and its enum constant to workspace.entity.WorkspaceMember.State.ACTIVE. Full clean startup/CRUD tests validate repository discovery and those strings, not just Java compilation. V1–V6 migrations and schema ownership are unchanged.

### Visibility and refactor correction

Java subpackages do not share package-private access. Repository interfaces and WorkspaceAuthorization/access record/methods are now public because production service/security/DTO packages consume them; entity constructors/operations/accessors and View.from expose only what those production paths require. This is not a test-placement workaround or HTTP exposure. Repositories still extend narrow Repository ports, not global JpaRepository/findAll/findById shortcuts. Controllers inject only the service. WorkspaceMembershipProjection stays package-private behind the existing AccountMemberships port. JPA no-arg constructors remain protected. PlanKey immutable allowance fields are private with read-only accessors.

The first refactor run caught a framework dependency on visibility: public primitive version() unboxed the null @Version of a new workspace during Spring Data newness detection. Corrected it to nullable Long; response DTO version remains long after persistence and JSON is unchanged. A focused version-128 regression then reproduced boxed-reference comparison incorrectly rejecting a valid update; WorkspaceService now uses numeric value equality and still rejects the stale version after an update to 129. No failed run was counted as a pass, and lifecycle work waited for a successful full refactor verification.

## Test organization

Tests retain matching feature organization: auth/ contains cross-layer account/session HTTP/PostgreSQL journeys and shared package-private fixture types; auth/security, auth/entity and auth/delivery match focused implementation tests. workspace/WorkspaceFoundationTests remains a feature-wide HTTP/persistence/isolation suite across the new production layers; imports and PlanKey accessor uses changed, all prior assertions and 57 cases remain; one version-range regression extends the suite to 58 cases. common/error and common/web match their targets. Root CollectorApplicationTests and SecurityConfigurationTests remain bootstrap/global HTTP integration tests. No test moved merely to force wider production visibility; no existing test disabled or deleted.

## T08 lifecycle corrections and acceptance

Most session functionality already existed; it was reused. Two focused tests reproduced actual gaps before correction:

1. A direct/reloaded authorized member-workspace URL displayed that workspace while Redux still selected the first membership. AgencyLayout now aligns selection with the authorized route membership via the existing selectWorkspace action, which clears private caches. It does not accept an unrecognized route ID as membership.
2. selectWorkspace previously cleared private caches before the reducer rejected an unrelated ID. It now ignores unknown and already-selected IDs before clearing. Valid switches retain the existing cache reset and selection behavior.

No dashboard/navigation redesign, extra HTTP API or workspace role JWT claims. Server-side live membership/session checks continue to reject cross-tenant access and inactive members. Browser state is a navigation aid, not authorization. Tokens remain memory-only.

Existing cross-tab logout uses BroadcastChannel with the literal logout message and no credentials. Added real same-origin two-tab acceptance: both tabs bootstrap the same cookie session and hold actual workspace query caches; UI logout revokes the server session and both tabs clear access tokens, membership state, agency/client caches and return to sign-in. No new broadcast transport implemented. Existing bootstrap, /me profile, no-workspace onboarding, valid selection/OWNER-MEMBER navigation, expired-access refresh, membership revocation and session-expiry handling are preserved. Safe return destination handling is reused and exercised with an external destination rejected during actual sign-in.

Project/template backend routes remain denied. Browser checks exercise actual workspace metadata/navigation while those later product calls report the existing closed response; no mocks or placeholder endpoints are added to make later features look complete.

## Verification stages

- **Before restructuring:** fresh backend clean verify passed 290 tests, no failures/errors/skips, with executable JAR.
- **After restructuring, before T08 lifecycle edits:** fresh clean verify passed the same 290 tests after fixing nullable version access. Spring beans, JPA mappings, JPQL, tenant isolation, concurrency, V1–V6 and authentication/reset regressions passed. Commit bdec2bc isolates this phase.
- **Lifecycle unit/integration:** all 72 frontend tests across 3 files pass, preserving prior 70 and adding two reproduced selection/cache regressions. Focused red runs are evidence of the gaps, not successful acceptance; no test.skip/disabled annotation introduced.
- **Real HTTPS acceptance:** two explicit Edge/Vite/Spring/PostgreSQL lifecycles pass with MSW off. Authentication covers bootstrap, expiry/refresh, concurrent requests, reset revocation, logout-all, session expiry and storage safety. Workspace lifecycle covers real registration/test-mail verification/login/no-workspace onboarding, current profile, trial/ownership, reload, A->B OWNER/MEMBER selection, reload selection/caches, expired workspace access, tenant/forged-ID/owner-action denial, disabled membership and UI cross-tab logout/cache clearing. B and membership changes are isolated fixtures, not T13 endpoints. Generated local certificate trust is bypassed only in isolated browser contexts; no public TLS/provider claim.
- **Final after numeric-version correction:** clean verify passed **291 tests, zero failures/errors/skips**, all baseline 290 preserved plus the version-range regression; WorkspaceFoundationTests now 58. JAR packaging, Flyway V1–V6/Hibernate/upgrade/restart/auth/tenant/concurrency tests pass. Final actual HTTPS rerun passed **2 tests, zero failures/errors/skips**. JAR inspection confirms new subpackage classes and no old flat workspace classes. All **72 frontend tests**, strict TypeScript/production build, zero-warning lint and formatting (including the explicit browser runner) pass. No remaining local T08 acceptance gap identified; T04/T05/T06 and full M1/release gates remain pending.

Reproduce with Java 21, Docker Desktop Linux engine, Node, existing frontend dependencies and installed Edge:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS lifecycle checks failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test -- --maxWorkers=1 --pool=threads
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Frontend lint failed.' }
npm run format:check
if ($LASTEXITCODE -ne 0) { throw 'Formatting failed.' }
npx prettier --check real-auth/browser-check.mjs
if ($LASTEXITCODE -ne 0) { throw 'Browser runner formatting failed.' }
```

The explicit browser checks remain separate from default backend-only Surefire discovery (2 tests, not silently skipped). No real email/payment/AI/SMS credentials or outbound provider delivery. No raw tokens/mail capabilities in logs, traces, HARs or browser storage. No screenshots/traces created by these checks.

## Change manifest outside the 13 source moves

Created: `backend/ARCHITECTURE.md` (this file). Files updated, including this file:

- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `frontend/src/components/Layouts.tsx`
- `frontend/src/features/auth/session.ts`
- `frontend/src/test/auth.test.tsx`
- `frontend/real-auth/browser-check.mjs`
- `AGENTS.md`
- `backend/README.md`
- `backend/ARCHITECTURE.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/WORKSPACE_FOUNDATION.md`
- `docs/FRONTEND_BACKEND_HANDOFF.md`

No auth/common production file, dependency manifest, lockfile, migration or supplied specification changed. Existing T04 hosted CI, T05 provider/resend and T06 deployment/retention gates remain independent; M1 cannot be marked complete while those remain. No T09/later feature or full MVP claim.
