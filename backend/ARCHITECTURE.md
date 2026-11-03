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


## T09 Part 1 — template feature addition

The T08 sections above are historical evidence. T09 adds this feature under the same application root; auth/workspace packages and their responsibilities remain intact:

```text
template/
  controller/TemplateCatalogController.java
  service/TemplateCatalogService.java
  repository/TemplateCatalogRepository.java
  entity/Template.java
  entity/TemplateVersion.java
  dto/TemplateCatalogDtos.java
  validation/TemplateSchemaValidator.java
  seed/BuiltInTemplateSeeder.java
```

No empty packages or service interfaces. Controller maps the two existing catalog GET routes and no-store DTO responses. Service owns the transaction, first resolves the actor through WorkspaceAuthorization, then rechecks URL-workspace membership before any scoped catalog read. It intentionally uses a regular transaction because the shared live authorization helper takes pessimistic account/workspace/member locks. Repository is a narrow Spring Data Repository port: scoped catalog/definition queries only, with no global findAll/findById or mutation operations. Read-only entities map the two reference catalog tables; public responses are records and independent JSON trees. Latest-version listing and exact historical-version retrieval are separate queries. No project feature dependency has been introduced.

The standalone validator is reusable by later publishing and snapshot orchestration; it knows schema semantics but no HTTP or tenant identity. Its bounded index paths/fixed diagnostics do not echo raw JSON. It uses Jackson 3 already in the application, without another JSON framework. Unknown properties are rejected rather than dropped. [Full vocabulary, limits and schema/answer boundary](README.md#original-source-and-schema-boundary).

Seeder alone has a narrow administrative JDBC path to global built-in identities; it cannot be invoked through HTTP and accepts no caller-supplied definitions. It reads the immutable classpath copy, validates all ten before writing, serializes instances with a database advisory lock and performs insert/check in one transaction. Existing mismatches fail startup, including rollback of earlier inserts. Published version UPDATE/DELETE is independently prohibited by V7's trigger. Current JPA entities expose no mutation path; future workspace publishing must introduce explicitly authorized validation/version operations rather than reusing global seed authority. New versions never alter existing definitions. [Source, IDs, concurrency and snapshot contract](README.md#storage-startup-and-immutable-snapshots).

Changes to existing production wiring are limited to two exact authenticated GET patterns in common.SecurityConfiguration and corresponding anonymous-401 classification in SecurityProblemHandler. All other routes remain default-denied, CORS/CSRF/tracing/error handling unchanged. Existing regression tests retain their cases and assertions, updating only latest schema expectations (7 migrations, 11 tables) and removing the now-implemented /templates entry from the closed-route loop; new catalog tests directly cover its positive and negative permissions.

Tests: template/TemplateSchemaValidatorTests covers original bytes/definitions and valid/invalid schemas; template/TemplateCatalogTests covers actual PostgreSQL/JPA/Flyway/HTTP/authorization/tenant isolation, independent reads, constraints, concurrency, failed startup rollback, later version preservation, V6 upgrade and restart. Existing 291 cases stay enabled. No frontend source/UI change or new dependency. Current final evidence and task status are in docs/IMPLEMENTATION_STATUS.md; T10 and later features are out of scope.


### T09 exact file manifest

Created (paths relative to backend/):

```text
src/main/java/com/ayaantrix/collector/template/controller/TemplateCatalogController.java
src/main/java/com/ayaantrix/collector/template/service/TemplateCatalogService.java
src/main/java/com/ayaantrix/collector/template/repository/TemplateCatalogRepository.java
src/main/java/com/ayaantrix/collector/template/entity/Template.java
src/main/java/com/ayaantrix/collector/template/entity/TemplateVersion.java
src/main/java/com/ayaantrix/collector/template/dto/TemplateCatalogDtos.java
src/main/java/com/ayaantrix/collector/template/validation/TemplateSchemaValidator.java
src/main/java/com/ayaantrix/collector/template/seed/BuiltInTemplateSeeder.java
src/main/resources/db/migration/V7__create_template_catalog.sql
src/main/resources/templates/starter_templates.json
src/test/java/com/ayaantrix/collector/template/TemplateSchemaValidatorTests.java
src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java
```

Modified (paths relative to the project root):

```text
.gitattributes
backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java
backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java
backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java
backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java
backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java
backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java
backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java
backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java
backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java
backend/README.md
backend/ARCHITECTURE.md
docs/FRONTEND_PRODUCT_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
```

All 26 files belong to T09's foundation, verification and integration documentation. Supplied specs, V1–V6, dependency manifests, lockfiles, application configuration and frontend implementation remain unchanged. The original roadmap is preserved with evidence-based T09/M2 status updates. Ignored command logs are local evidence, not source artifacts.

Final local verification: backend clean verify **406 tests, zero failures/errors/skips** (291 prior + 115 template cases), executable JAR; frontend **72 tests in 3 files** passed. T09 Complete for validator/catalog-seed acceptance and this Part 1 scope; M2 In progress. No local T09 blocker. T04 hosted CI, T05 resend/provider and T06 deployment/retention gates remain independent. Browser/visual/deployment checks were not rerun for this backend-only change. No T10 implementation or push.

The packaged JSON has an explicit -text attribute, matching the supplied specification source, so Git autocrlf cannot change its bytes on a fresh Windows checkout.


## T10 Part 1 — project foundation

The earlier T08/T09 sections are historical evidence. New feature files follow the same convention:

```text
com.ayaantrix.collector.project/
  controller/ProjectController.java
  dto/ProjectDtos.java
  entity/Project.java
  entity/ProjectCustomer.java
  entity/ProjectSnapshot.java
  entity/ProjectState.java
  repository/ProjectCreationRequests.java
  repository/ProjectCustomerRepository.java
  repository/ProjectRepository.java
  repository/ProjectSnapshotRepository.java
  repository/ProjectStructureRepository.java
  security/ProjectAuthorization.java
  service/ProjectService.java
  service/ProjectSnapshotService.java
```

Controller owns exactly the five agreed project/customer HTTP mappings and DTO envelopes. ProjectService owns live authorization, plan gating, validation, tenant-scoped source selection, transactions, idempotency and response assembly. ProjectSnapshotService is a transaction-mandatory internal copy collaborator; it validates a separate tree, stores the immutable initial snapshot and delegates ordered operational inserts. ProjectAuthorization reuses WorkspaceAuthorization and the existing subscription writable predicate; it does not add JWT roles or client impersonation. The existing WorkspaceMember exposes its trusted user ID for creator/idempotency scope, and WorkspaceSubscriptionRepository adds a scoped pessimistic read of the existing plan row. Global HTTP wiring adds only exact GET/POST route patterns and matching anonymous-401 classification.

Project, ProjectCustomer and ProjectSnapshot have JPA mappings and safe public DTOs. ProjectState follows the guide's state vocabulary; ProjectType reuses the template enum. Narrow Spring Data repositories take workspace IDs for every consumer read. ProjectStructureRepository uses bound JDBC for the relational operational copy and batched scope-filtered counts; it never reads the source catalog during project retrieval. ProjectCreationRequests implements only creation's reference 24-hour idempotency persistence under the existing transaction/workspace lock. JDBC timestamps use the established explicit Timestamp conversion, not unsupported raw Instant binding. No unnecessary service interfaces, empty packages or global findById/findAll APIs.

V8 is additive: customer, project, immutable initial snapshot, relational section/item and idempotency tables only. The snapshot table is justified by the requested independent initial identity/provenance and the guide's JSONB snapshot allowance; relational rows preserve the reference structure for T11. Immutable snapshot data and mutable future structure have distinct lifecycles. There are no answer/submission/assignment/contact tables and no lifecycle/update/preview commands. [Exact schema, API and authorization boundaries](README.md#t10-part-1--project-creation-and-independent-initial-snapshots).

M2 remains In progress. T10 acceptance is recorded with actual evidence in IMPLEMENTATION_STATUS.md. Assigned-member reads await T13 assignment persistence; until then members see no project/customer data. General template overrides/structure modifications await the editor contract. No supplied specification, old migration, dependency or frontend UI source is modified. The existing HTTPS test runner is extended to exercise real save-as-draft creation and detail/reload for all three types; it changes test tooling only.


### T10 exact file manifest

Created (16):

```text
backend/src/main/java/com/ayaantrix/collector/project/controller/ProjectController.java
backend/src/main/java/com/ayaantrix/collector/project/dto/ProjectDtos.java
backend/src/main/java/com/ayaantrix/collector/project/entity/Project.java
backend/src/main/java/com/ayaantrix/collector/project/entity/ProjectCustomer.java
backend/src/main/java/com/ayaantrix/collector/project/entity/ProjectSnapshot.java
backend/src/main/java/com/ayaantrix/collector/project/entity/ProjectState.java
backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectCreationRequests.java
backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectCustomerRepository.java
backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectRepository.java
backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectSnapshotRepository.java
backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectStructureRepository.java
backend/src/main/java/com/ayaantrix/collector/project/security/ProjectAuthorization.java
backend/src/main/java/com/ayaantrix/collector/project/service/ProjectService.java
backend/src/main/java/com/ayaantrix/collector/project/service/ProjectSnapshotService.java
backend/src/main/resources/db/migration/V8__create_project_foundation.sql
backend/src/test/java/com/ayaantrix/collector/project/ProjectFoundationTests.java
```

Modified (18):

```text
backend/ARCHITECTURE.md
backend/README.md
backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java
backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java
backend/src/main/java/com/ayaantrix/collector/workspace/entity/WorkspaceMember.java
backend/src/main/java/com/ayaantrix/collector/workspace/repository/WorkspaceSubscriptionRepository.java
backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java
backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java
backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java
backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java
backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java
backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java
backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java
backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java
backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java
docs/FRONTEND_PRODUCT_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
frontend/real-auth/browser-check.mjs
```

Final verification: clean verify **470 tests, zero failures/errors/skips** (all original 406 + 64 project cases), executable JAR; frontend **72 tests/3 files**, explicit real HTTPS **2 tests**, zero failures/errors/skips. The onboarding HTTPS case now additionally creates/reloads all three project types through the existing UI, including real customer creation/selection and frontend runtime response schemas, with MSW off. T10 Complete for creation/independent-snapshot acceptance; M2 In progress. T11/T12/T13 workflows remain deferred. No local T10 blocker, production provider/deployment acceptance or push.

T10 implementation/regression commit: `0e14422`. Real HTTPS all-type wizard acceptance commit: `35f0c41`. No push.


## T11 Part 1 — project structure editing

The existing project feature gains controller/ProjectStructureController, dto/ProjectStructureDtos, service/ProjectStructureService and service/ProjectStructureValidationService. Existing entity/Project and repository/ProjectRepository own edit-state/version behavior and scoped pessimistic project locking. ProjectStructureRepository retains scoped JDBC section/item persistence, adds differential writes/auditing, and includes parent section state in initial visibility. No duplicate entity, repository, root-package type or empty package was introduced.

The service validates the complete candidate before persistence using a definition-only projection into the shared TemplateSchemaValidator; only its project-editing entry point allows temporary empty sections. Strict catalog publishing/seeding remains unchanged. Existing transaction and lock order is account, workspace/membership, subscription, project, children. Deferred V8 sort constraints allow atomic swaps; project flush and V9 audit insert are in the same transaction. Returned DTOs are detached JSON values, not JPA entities. No initial snapshot/catalog rewrite occurs.

[Exact package tree, API inventory, transaction/security semantics, remaining submitted-content reopening boundary and file manifest](../docs/T11_STRUCTURE_EDITOR.md). T11 In progress pending that deferred revision integration; M2 In progress. T12/T13 and production acceptance gates remain separate.

Final verification: **554 backend tests** (all original 470 + 84 T11 cases), **74 frontend tests/3 files**, and **2 explicit real HTTPS browser tests**, all zero failures/errors/skips. Strict TypeScript, production build, lint, formatting, Flyway V1–V9/Hibernate/restart/upgrade and executable JAR checks passed. Original specifications, V1–V8, catalog bytes and dependency lockfiles are unchanged. Full mocked visual/PWA/deployment/provider suites were not rerun. Implementation/regression commit `995728c`; frontend/HTTPS integration commit `2ca9345`. No push. Detailed verification and corrections are recorded in docs/T11_STRUCTURE_EDITOR.md.


## T11 Part 1 resume and frontend tooling organization — 28 October 2026

The prior T11 implementation and evidence were already committed and were preserved. Authorization/limit/concurrency/rollback tests were inspected; one combined malformed-JSON fixture was separated into two intended cases. No backend production behavior, original specifications/templates, security policy or applied migration changed. The focused suite now has 85 cases; M2/T11 status and deferred submitted-content reopening boundary remain unchanged.

Browser suites now live under frontend/tests/{e2e,pwa,integration/real-auth}; the Java HTTPS launcher and Vite-relative paths follow the move. Browser results/logs/compiler caches use ignored frontend/.artifacts. Required root configurations and the resolved dependency lockfile are retained. The new frontend/scripts/Verify-Frontend.ps1 runs checks sequentially with optional -Browser -Pwa. [Exact cleanup/file inventory, commands, current verification and remaining gates](../docs/T11_RESUME_AND_FRONTEND_ORGANIZATION.md).

Final resume evidence: **85 focused T11 cases**, **555 backend clean-verify tests** (original 470 + 85), **74 frontend tests**, **2 real HTTPS tests with MSW off**, and **1 production PWA test** passed. TypeScript/build/lint/format and the final Windows PowerShell 5.1 core verification wrapper passed. Responsive mock browser coverage exercised 57 scenarios: latest full run 54 passed/3 timing failures, followed by all 3 passing unchanged on isolated rerun; this is not a clean single-run 57/57 claim. No assertions/timeouts were weakened. T11 Part 1 is verified; full T11/M2 remain In progress for the existing submitted-content reopening boundary. No T12/T13, security, application source, applied migration, original specification/template or dependency-resolution change. Commits: `ec3f44d` test correction, `a07808e` organization/HTTPS paths. No push.


## T11 Part 2 — collected-work impact boundary

The project feature now has 19 classes, all inside its existing controller/service/repository/entity/dto/security subpackages. The sole new production class is service/ProjectStructureMutationPolicy. It computes immutable semantic-impact/draft/revision ID sets from the entire validated candidate, including transitive visibility dependencies and section enabled transitions. ProjectStructureService invokes it under the existing scoped project lock and rejects unsupported collected-work changes before SQL. Existing authorization, validation, persistence and audit services are reused. No public interface, fake submission persistence, new endpoint or migration.

Metadata/order preserve existing state, IDs, revision pointers and historical snapshots. Semantic edits affecting collected work remain 409 REOPEN_REQUIRED even with reopenAffected=true; closed project states remain READ_ONLY. Future T17/T22 must handle real draft revalidation, immutable revisions and approval invalidation atomically under this boundary. [Rules, concurrency evidence, exact endpoints and verification](../docs/T11_PART2.md). V1–V9 and original templates/specifications remain unchanged.


## T12 Part 1 — project customer/contact and preview boundary

The existing project feature now has 24 production classes in controller/service/repository/entity/dto/security. New ProjectClientController maps only customer PATCH, project contact GET/POST and owner preview GET. ProjectClientService reuses existing live ProjectAuthorization and scoped project/customer/structure repositories; ProjectContactRepository is a narrow tenant/project-scoped port, ProjectContact maps the additive reference contact table, and ProjectClientDtos defines safe public shapes. No duplicate customer entity, root-package class, empty package or unnecessary interface.

V10 adds project_contacts and the composite project/customer key/FK without changing V1–V9. Customer rename uses the existing JPA version; contact writes reuse workspace/member/plan/project locks. Owner preview locks a coherent operational structure but makes no persistence/audit/session changes. Its null-answer, canEdit=false projection excludes disabled/unanswered conditional requests and private history; TypedValue is shared with the client renderer. No client token/session/invitation/collection/review implementation. [Exact scope, contracts, security, files and current evidence](../docs/T12_CLIENT_CONTACTS_AND_PREVIEW.md).


## T13 Part 1 — invitations, memberships and project assignments

T13 adds scoped invitation metadata and project assignment entities/repositories in existing feature subpackages. WorkspaceTeamController and ProjectAssignmentController are thin route adapters. WorkspaceInvitationService owns single-use verified-email acceptance, reserved seats and revocation; WorkspaceMembershipService owns state changes and reauthenticated single-owner transfer; WorkspaceTeamPolicy owns shared plan/seat/delivery eligibility. Common transactional IdempotencyRepository and AuditRepository reuse existing tables; ProjectCreationRequests retains its public contract through delegation.

ProjectAuthorization now distinguishes owner-only contact/preview administration from exact-assignment member reads. ProjectService and scoped project/customer repository queries filter ordinary member reads to assignments. Review/export flags are independent and do not grant structure writes or preview. Live account/session/membership checks remain authoritative. Account→workspace→membership/subscription→project lock order is retained; transfer locks both accounts in sorted UUID order before workspace. Audit, token consumption, membership/assignment changes and idempotency records commit or roll back atomically.

V11 alone extends purpose-bound tokens and the existing encrypted outbox, adds workspace_invitations/project_members with composite tenant foreign keys, and permits workspace-scoped audit events. No client revision persistence or historical schema/template rewrite. Unknown delivery outcomes use existing trusted evidence reconciliation; provider/resend gates remain separate. Full contracts, package/file inventory, safety guarantees and actual test evidence: [T13_TEAM_COLLABORATION.md](../docs/T13_TEAM_COLLABORATION.md). T11 reopening and T04–T06 release gates remain pending; M2 remains In progress.

T13 final verification (30 October 2026): **657 backend tests** (620 preserved + 37 T13), **97 frontend unit tests**, **2 real HTTPS lifecycles**, **75 responsive cases** and **1 production PWA case** passed; zero final failures/errors/skips. Strict TypeScript/build/lint/format, Flyway V1–V11, Hibernate validation, restart/concurrency/rollback and executable JAR packaging passed. T13 Part 1 Complete; M2/T11 and release gates retain their separate status. Commits: backend `aca9494`, frontend `01f06ff`; no push.


## T14 Part 1 — independent project client access

Owner invitation/revocation, explicit fragment exchange, generic fresh links, separate opaque cookie sessions and a read-only real portal are implemented. V12 is additive; V1–V11 and existing agency/team identities remain intact. Shared safe structure projection excludes private content; all client reads revalidate the live scoped grant/session. No answer/upload/submission APIs or T22 publication are added. DRAFT invitation issuance remains closed pending publication. See [T14 contracts, architecture, lifecycle, migration, exact manifest and verification](../docs/T14_CLIENT_ACCESS.md). T11 and T04–T06 gates remain independent.


## T15 Part 1 — persistent client drafts

The collection feature reuses T14 client session authorization for exact item GET/answer PUT routes. V13 adds project-shared mutable answers with contact attribution and independent answer versions. Existing project locks serialize writes, audit/state/version updates roll back together, and ProjectDraftVisibility drives portal/progress visibility without deleting hidden drafts. The existing client frontend feature adds server-confirmed serialized autosave, bounded retries, conflict comparison and volatile recovery; uploads/submissions remain deferred. T11 semantic changes to DRAFT collected items still fail closed pending revalidation/reopening. [Detailed contracts, feature trees, migration, file manifest, commands and final evidence](../docs/T15_CLIENT_DRAFTS.md). Original roadmap and T04–T06/T11/T22 gates remain independent.

## T16 private attachment boundary

Attachment HTTP/service/repository/entity/dto/security/storage subpackages follow the existing feature convention. V14 adds private metadata/reservations, durable leased scan jobs and cleanup ledgers. Workspace-before-project database locks protect quota, access and final publication; provider work occurs outside transactions. ClamAV and sandboxed image verification precede READY. Expired crash leases share the bounded attempt policy; worker outputs use bounded non-following regular-file reads. Existing subscription write rules apply to upload intents and publication. Streaming SVG/DOCX parsing avoids a document-sized DOM. Collection references are exact project/item-scoped UUIDs. See [T16 report](../docs/T16_PRIVATE_ATTACHMENTS.md) for lifecycle, tests and deployment restrictions. No submissions/reviews were added.


## T17 immutable submissions

The submission feature uses controller/dto/repository/service subpackages and reuses existing client/agency authorization and scoped collection/attachment persistence. V15 adds append-only item revisions, revision-file retention and content-free integration events. Project locks serialize submission/withdrawal with draft/structure/grant changes; T11 semantic reopening remains fail-closed. See [T17 contracts, package trees, immutability and evidence](../docs/T17_CLIENT_SUBMISSIONS.md). No approval/review decisions or project lifecycle endpoints are added.


## T18 original-roadmap quota acceptance — 1 November 2026

The new task attachment's review title differs from original Section 22. Its precedence instruction keeps T18 scoped to private upload reservations and quota; review decisions remain T21. Existing attachment controller/service/repository/security/storage ownership and transactional workspace-before-project locking are reused. No review package, duplicate entity, route or migration is created. AttachmentRepository reads only the already-authorized locked workspace's quota figures after a failed conditional reservation; common.error.StorageQuotaException carries safe usedBytes/availableBytes into the existing problem handler. Available capacity excludes outstanding reservations. Existing session, CSRF, immutable revisions and private downloads are unchanged. [Scope, exact contract and verification](../docs/T18_AGENCY_REVIEW.md).

T18 final local acceptance:42 focused storage,865 backend,161 frontend unit,2 real HTTPS (MSW off),75/75 responsive and1/1 production PWA passed; TypeScript/build/lint/format passed. Executable JAR and Flyway/Hibernate checks passed. M4 and independent release gates remain In progress; see the T18 report for scope and exact evidence.


## T19 scanner and variant boundary — 1 November 2026

Existing attachment.storage classes own scanner protocol and isolated-decoder output validation. ClamAvScanner accepts only complete NUL-framed clean replies. SandboxedImageProcessor checks bounded PNG container/CRC/dimensions/metadata without decompressing pixels on the host; the networkless/resource-limited decoder remains responsible for pixel processing. The t19 worker removes orientation metadata after normalizing pixels. Existing worker transactions, scoped repositories, quota/idempotency and immutable canonical history remain unchanged. No new package, route, table, migration or frontend redesign. [Exact scope, failures and verification](../docs/T19_IMPLEMENTATION.md).

T19 final local evidence:110 focused attachment,889 backend,162 frontend unit,2 real HTTPS (MSW off),75/75 complete responsive and1/1 fresh production PWA passed; TypeScript/build/lint/format and Flyway/Hibernate/JAR checks passed. A reproduced frontend regression now separates initial anonymous agency bootstrap from explicit sign-out so an independent client exchange is not canceled; confirmed logout/authenticated expiry still clear both caches. T19 is Complete locally; M3/M4 and independent release gates remain In progress. Earlier failed stages and unresolved diagnostic risk are recorded in the T19 report.


## T21 comments and exact-revision decisions

The review feature uses controller/dto/repository/security/service subpackages. Scoped JDBC follows the existing immutable-submission pattern; no duplicate entity or empty package is introduced. ReviewAuthorization reuses live ProjectAuthorization/session/membership/assignment/plan checks. ReviewService serializes through existing workspace/project locks, locks the exact item, requires current SUBMITTED revision/version, and commits decision, draft restoration/CLIENT feedback when requesting changes, item/project versions, audit and idempotency together. Unique revision decisions and V16 append-only triggers add database protection. SubmissionRepository retains transition/history ownership; ClientAnswerRepository owns the separate mutable draft copy. SQL-filtered client comment projections exclude INTERNAL rows and private author fields before serialization.

Only V16 adds review_decisions/comments; V1–V15 remain unchanged. Existing read-only preview, client/agency identity separation, CSRF/CORS, private retained assets and default-deny remain. Live review applies only to ACTIVE projects/writable plans; later reopening/completion/archive belongs to T22. [Exact contracts, package/file manifest and evidence](../docs/T21_REVIEW_DECISIONS.md). Local acceptance is complete across913 backend cases with17 corrected migration checks rerun,44 targeted frontend cases and1 actual HTTPS lifecycle; the report explicitly distinguishes these from a one-shot full green rerun. T20 device and independent release gates remain pending.


## T22 lifecycle integration — 2 November 2026

ProjectLifecycleController/Service/Repository implement catalog publish/pause/resume/complete/reopen/archive/restore with expectedVersion and required Idempotency-Key. ProjectReopeningService implements exact approved-item reopen with expectedItemVersion and reason. ProjectCollectedWorkService consumes T11 impact, verifies real persisted reopening/collected state and validates candidate drafts/files before atomic mutation; no permissive flag bypass. Inline ItemPatch adds optional reason when reopenAffected is requested. Completion shares existing visibility-aware progress; project reopen preserves approvals until selective item commands. PAUSED blocks client writes while agency review remains permitted. V17 adds publication metadata and immutable reopening/lifecycle records; previous migrations are unchanged. Existing auth, scoped repositories, audit/idempotency, snapshots/private files and one RTK transport remain authoritative.

Final936 backend tests passed in one clean verify;31 distinct focused frontend checks and1 real HTTPS lifecycle passed. T11 local reopening dependency is closed; T20 real-device and independent release/T16/T23+ gates remain pending. Full contracts, failure history and manifest: [T22 report](../docs/T22_PROJECT_PUBLICATION_REOPENING.md).


## T23 approved export snapshots

`export/controller`, `dto`, `repository`, `service` and `worker` contain only concrete responsibilities. ExportRepository.Job is an internal JDBC execution projection, never an API entity; no duplicate submission/attachment entities or empty entity/security packages were added. ExportService reuses ProjectAuthorization, scoped project locks, visibility, immutable SubmissionRepository detail, approval decisions, attachment metadata, audit and idempotency. The shared account/workspace/project lock order supplies consistent snapshot selection against concurrent review/submission/lifecycle/permission changes. Export permission remains independent of review; client identity never enters export authorization.

V18 adds one immutable-manifest/mutable-execution job table (18 migrations/33 tables). Claims use PostgreSQL SKIP LOCKED, fencing leases, bounded retries and attempt-specific private keys. File generation and private transfers happen outside claim transactions; only READY publication is fenced. Lost commit acknowledgments cannot cause deletion of a committed READY object. Generation uses captured public schema/values/file metadata only; private source keys never enter artifacts. Streaming ZIP/file-backed outputs, a 2 GiB operational bound, safe Markdown, 24-hour expiry, 60-second maximum private URLs and retryable expiry/temp cleanup are implemented. Worker startup is explicit via EXPORT_WORKER_ENABLED. Exact contracts, evidence and limitations: `docs/T23_IMPLEMENTATION.md`. No T24 work or prior migration/specification changes.

T23 final verification:955 backend checks passed in one clean verify (0 failures/errors/skips), executable JAR packaging passed,13 affected frontend checks passed (24 unrelated mock cases intentionally filtered), strict TypeScript/build/changed-file lint/format passed, and1 real HTTPS lifecycle with MSW disabled passed the export journey. Production storage/load and existing release/device gates remain separate.


## T24 AI provider/job boundary

The ai feature owns controller/dto/config/provider/repository/security/service/worker responsibilities. AiService reuses live client grant authorization, visibility/draft versions, plan allowances, audit and idempotency under the established workspace/project lock order. AiDraftProvider is the concrete external boundary; OpenAiResponsesProvider uses bounded direct JDK21 HTTPS with strict Responses JSON and no SDK dependency. V19 adds scoped usage periods/jobs only. Conditional used+reserved accounting prevents concurrent allowance/budget overspend; fenced PostgreSQL claims survive restarts. Calls happen outside transactions; live eligibility is rechecked before exposing results. Abandoned calls are UNKNOWN failures with conservative cost settlement, never blindly resent. Counter/job settlement is atomic; retention removes input/result content after30 days. No write path reaches answers/submissions/approvals/exports, and no T25 accept route exists. Defaults remain disabled pending account/model/price/privacy evaluation. [Contracts, verification and remaining gates](../docs/T24_IMPLEMENTATION.md).

T24 local evidence:971 backend checks passed in one clean verify,0 failures/errors/skips;1 complete real HTTPS lifecycle with MSW disabled passed provider failure/manual writing and preserved review/export flows. The changed runner passed lint/format; no frontend runtime change or T25 acceptance work. Unrelated collection formatting is preserved outside this commit; its missing previously committed restoreSubmission method was restored before clean regression. Production provider/model/privacy/cost/grounding and previous release/device gates remain pending.


## T25 explicit AI draft acceptance

AiService now owns explicit accept orchestration through existing ClientAnswerService.read/save; it does not duplicate answer persistence/validation. Existing scoped workspace/project locks serialize creation/acceptance against draft edits, permission revocation and collected-content mutations. Current/base answer versions and captured question definitions are authoritative; only an eligible creating contact can accept a successful unexpired job. V20 adds ACCEPTED plus schema/acceptance snapshots on the existing job; prior answer recovery content is purged at its original30-day expiry. Job state, normal draft save, audit and idempotency commit/roll back together. No immutable submission, review, export or provider/accounting logic is rewritten. ClientPortalService exposes actual AI opt-in only to the live collection; ProjectContentPresentation's owner preview remains false/read-only. [T25 contracts and evidence](../docs/T25_IMPLEMENTATION.md).

T25 final local verification:984 backend tests passed in one clean verify,0 failures/errors/skips, plus executable JAR packaging.28 distinct affected frontend cases, strict TypeScript/build/changed-file lint/format and1 complete real HTTPS/MSW-disabled lifecycle passed. The offline browser retry race was corrected without sleeps or weaker assertions. Provider approval/model/privacy/grounding and prior release/device gates remain separate; M5 remains In progress.


## T26 reminder policy and email outbox

The reminder feature owns controller/dto/repository/service/worker subpackages. It reuses ProjectAuthorization, live client grants, existing visibility-aware progress, invitation token issuance, AES-GCM delivery encryption and audit/idempotency. Scoped workspace→project locks serialize final eligibility/policy/preferences against existing lifecycle/submission/access changes. Separate short SKIP LOCKED claim transactions avoid job→workspace deadlocks; fencing checks precede message preparation. Provider HTTP runs outside transactions with bounded time and conservative UNKNOWN handling. Signed webhook events retain metadata only; known-receipt application follows the same scoped lock order. V21 adds policies/deliveries/event inbox plus contact suppression; V1–V20 remain unchanged. No duplicate project/contact/submission entity or generic HTTP client was introduced. See `docs/T26_IMPLEMENTATION.md` for contracts, the external in-flight race boundary and T27/T28 exclusions.

T26 evidence:19 focused backend/44 affected frontend cases passed. One full backend run passed1001/1002; corrected startup migration inventory and final retry tests passed targeted verify/package, yielding1003 distinct verified cases across runs. One complete real HTTPS/MSW-disabled lifecycle passed after a test-readiness correction. Production email and earlier release/device gates remain pending; actual provider/worker defaults stay disabled.


## T27 SMS consent and suppression

The sms feature owns controller/dto/provider/repository/security/service/worker packages; existing contact/project entities, live client access, T26 reminder policy/outbox, invitation tokens, delivery encryption and auditing remain authoritative. Verification jobs have encrypted ephemeral codes and HMAC comparison, current challenge binding and durable attempt/usage accounting. Provider calls occur outside claim/authorization transactions. Sender-scope destination locks serialize final SMS eligibility with signed STOP; existing workspace/project lock order is retained. Cancellation accounting settles one workspace at a time. Twilio status receipts use conservative terminal states; UNKNOWN never blindly retries (T28 remains future work). V22 alone adds five SMS tables and delivery accounting/channel metadata. No new client/agency identity or duplicate HTTP transport is introduced. See `docs/T27_IMPLEMENTATION.md` for contracts, sandbox evidence and disabled production gates.


## T28 provider reconciliation

DeliveryReconciliationRepository/Service/Worker in the existing reminder subpackages coordinate read-only receipt lookup and signed callback correlation for reminder deliveries and SMS verification. V23 extends existing rows; no new domain entity or REST API. Claims use separate short SKIP LOCKED transactions, bounded attempts and lease fencing; application uses workspace/project/scoped row locks. Provider HTTP remains outside transactions. Stored verified event replay handles early callbacks. No UNKNOWN path resends; inconclusive legacy receipts remain held. Existing SMS suppression/accounting and explicit code verification are preserved. [Contracts and 1030-test clean verification](../docs/T28_IMPLEMENTATION.md).


## T29 safe activity and minimal interactions

The analytics feature owns controller/service/repository/dto/worker responsibilities. It reuses live ClientAccessAuthorization, ProjectAuthorization, shared visibility and existing transactional audit records. Browser ingestion accepts only project_opened/item_started with opaque IDs; domain-separated internal session-UUID hashes, project/item/template scope and PostgreSQL uniqueness prevent token persistence and duplicate starts. Test projects use the server-controlled projects.analytics_excluded flag; agency preview has no client cookie route. Activity projects six safe fields without audit metadata or names/emails/content. V24 alone adds one interaction table and project exclusion flag; 90-day raw cleanup is transactional. T30 aggregation is deliberately separate. [Contracts and actual verification](../docs/T29_IMPLEMENTATION.md).
