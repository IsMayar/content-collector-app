# T11 Part 1 — project structure editor

Date: 28 October 2026. M2 remains In progress. This implements editing independent operational project structure, not T12 preview, T13 grants/assignments, client responses, submissions, review or lifecycle commands. The supplied specifications, original ten template definitions, V1–V8 and dependency locks are unchanged.

## Contracts

Prefix: `/api/v1/workspaces/{workspaceId}/projects/{projectId}`. Every write requires a current agency JWT, CSRF and numeric `expectedStructureVersion` in the JSON body. Success is no-store JSON. Read the current structure/version through existing `GET` project detail; no alternate GET structure route was introduced.

| Method and suffix | Body in addition to expectedStructureVersion | Result |
| --- | --- | --- |
| POST `/sections` | `title`, optional stable `key` | 201 `{section}` |
| PATCH `/sections/{sectionId}` | `title?`, `enabled?` (at least one) | 200 `{section}` |
| POST `/sections/{sectionId}/items` | `definition: ItemDefinition` | 201 `{item}` |
| PATCH `/items/{itemId}/schema` | complete `definition`, `reopenAffected` | 200 `{item}` |
| POST `/structure/reorder` | `sectionIds`, `itemOrderBySection` | 200 `{structureVersion}` |

The existing frontend omits the section key. The backend accepts the documented explicit key and generates a unique stable key if omitted. An existing item's key cannot change. Item schema PATCH is replacement, so omitted optional visibility/AI configuration is removed rather than merged back from the old schema. Unknown definition/configuration properties are rejected. IDs, state, revision pointers and operational versions are server-owned and cannot be supplied inside a definition.

Removal uses `enabled:false`, as guide 6.4 requires. Sections/items remain represented; no DELETE route or hard deletion was added. Reorder requires exactly all current section IDs and a complete section-to-item-ID map, including disabled records. Items remain within their existing section. Cross-section moves are not in the agreed contract. Unknown scoped resources return 404; invalid permutations return 422. Ordinary metadata changes and reorders preserve IDs and source provenance.

## Validation

The existing TemplateSchemaValidator is reused for the entire proposed result before persistence. Its new project-editing entry point permits empty sections during construction; catalog validation still requires nonempty sections/items. All other strict limits and configuration checks remain shared. Disabled records count toward limits and their references remain valid for later re-enabling.

- At most 30 sections, 50 items per section and 300 items per project; globally unique item keys and unique section keys.
- Eight top-level types only: SHORT_TEXT, LONG_TEXT, URL, SINGLE_SELECT, MULTI_SELECT, IMAGE, FILE, REPEATER. No invented BOOLEAN/DATE/NUMBER top-level type.
- Text limits 200/10000, optional minimum length and email format where applicable. URL schemes limited to HTTP/HTTPS. Select option keys are unique; multi-select bounds fit the option set. File/image limits 1–50 with valid extension lists and consistent optional minimums.
- Repeater: one level, maximum 20 rows, 1–8 unique columns; SHORT_TEXT, LONG_TEXT, URL, NUMBER, SINGLE_SELECT and IMAGE columns. Required flags and select options preserved. The contract defines maxRows, not minRows/minimum repetitions: unknown minRows/nesting/configuration is rejected rather than invented.
- Visibility: EQUALS against an earlier SINGLE_SELECT in the same section, with a known option key. Reject self/forward/cyclic/cross-section references, option removal/type changes invalidating dependents, disabled controlling items with enabled dependents, and reorder invalidating dependencies. No conditions are silently removed.
- Optional AI settings only on LONG_TEXT, with valid targetWords. No provider call or automatic acceptance/submission.

Requests missing required envelope input/malformed JSON return safe standard 400 problems. Invalid definitions/resulting structure return 422 VALIDATION_FAILED with a safe diagnostic path/code in detail. There are no SQL/customer-content exception details in responses or logs.

## Concurrency, transactions and authorization

Existing live authorization locks/rechecks account/session, workspace/membership and subscription before a workspace/project-scoped pessimistic project-row lock. Owner-only structure editing retains T10 least privilege. MEMBERS are not implicitly assigned; T13 is still unavailable. Foreign/inactive membership/resources return safe 404, non-owner editing 403, invalid/revoked identity 401, and unavailable ACTIVE workspace/trial/plan write entitlement 403 WORKSPACE_READ_ONLY. No broad security matcher or CSRF/CORS relaxation.

DRAFT, ACTIVE and PAUSED projects permit editing. COMPLETED, ARCHIVED and DELETION_PENDING reject with 409 READ_ONLY, and detail canEditStructure agrees. The existing published lifecycle APIs are still closed.

Expected versions compare numerically, including values above the boxed-integer cache range. A stale writer receives 409 STRUCTURE_CONFLICT and currentVersion with existing traceId/X-Request-ID/problem fields. No stale mutation persists. Each accepted command, including accepted no-ops, increments structureVersion and project version/updatedAt, independent of catalog version. Changed item definitions increment item.version; order-only changes increment project/structure versions without changing item schema version. Current submission pointers/state are never reset.

Apply only changed scoped rows, then flush project version and insert the audit record in the same transaction. Existing V8 deferred ordering uniqueness permits swaps. Validation, SQL constraint, project-flush or audit-write failures roll everything back. PostgreSQL locks serialize processes; no synchronized/JVM lock or external provider call is involved. The initial snapshot and catalog are never used as editable storage or updated by these commands.

V9__project_structure_editing.sql adds the minimal reference-model audit_logs subset needed by guide 6.4: tenant/project FK, trusted USER actor FK, action/resource IDs, timestamps and structureVersion-only metadata. It contains no raw labels, field definitions, answers or tokens. This task adds no submission/answer/review tables. Future audit actor kinds and retention belong to later migrations.

## Frontend compatibility and acceptance

Minimal changes: supply HTTP/HTTPS schemes for a new URL item, maxOptions for a new multi-select, preserve existing AI targetWords, declare/parse optional problem currentVersion and show safe structure-specific conflict/validation/reopen messages. No UI redesign or mock/real transport fork.

The real HTTPS Edge runner uses the existing Vite proxy, real Spring/PostgreSQL and two authenticated browser tabs with MSW off. Existing authentication/workspace/all-three-type project acceptance remains. Added actual UI checks create and rename a section, create all eight item types, configure/persist a repeater and condition, activate section/item reorder buttons with the keyboard, reject a dependency-breaking reorder, retain an unsaved label after another tab changes the server, receive correlated 409/currentVersion, refresh while keeping input, retry successfully, disable/re-enable and reload. Backend assertions verify 17 accepted audit records, structureVersion 18, and byte-equivalent initial snapshot JSON values. Original no-token-storage/logout/tenant checks remain.

## Deliberate safety boundary and task status

Part 1 supports fresh structure editing and the T11 keyboard/conflict flow. Editing label/instructions/example preserves collected-work metadata. Semantic changes or removal of an item with collected work are rejected with 409 REOPEN_REQUIRED even if reopenAffected=true. Section removal also rejects if it would hide collected work. That flag is not implemented as a fake reopening, deleted draft or mutable historical submission.

The guide's full submitted-content reopening/schema-version workflow needs real immutable submissions, draft revalidation and affected-item confirmation. Those client/review workflows are explicitly excluded from this request. **T11 remains In progress for that deferred integration; Part 1 is implemented.** No local missing-tool blocker was encountered. Assigned-member access remains T13; answer-aware visibility remains collection work, with unanswered conditional items initially hidden. T12/T13 and later tasks are not complete. Existing T04 hosted CI, T05 resend/provider and T06 deployment/TLS/proxy/key/retention gates remain pending. No push.

## Reproduction

Reuse the existing Java 21, Maven wrapper, Docker Desktop Linux engine/PostgreSQL configuration, signing keys and environment setup in backend/README.md. Do not put credentials in source or VITE_ variables.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\scripts\Initialize-Local.ps1
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Database startup failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'HTTPS acceptance failed.' }
.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run
```

In a second PowerShell window, with the existing frontend dependencies installed:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'TypeScript failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
npm run format:check
if ($LASTEXITCODE -ne 0) { throw 'Formatting failed.' }
npm test -- --maxWorkers=1 --pool=threads
if ($LASTEXITCODE -ne 0) { throw 'Frontend regression failed.' }
npm run dev
```

For real UI use dev mode with mocks off (not dev:mock), sign in as a verified owner with an active trial, open an existing draft project and its Content editor. Other product tabs whose backend tasks remain pending can still return denied/unimplemented responses; this acceptance does not fake them into working features.

## Exact project package tree

```text
com.ayaantrix.collector.project
  controller/
    ProjectController.java
    ProjectStructureController.java
  dto/
    ProjectDtos.java
    ProjectStructureDtos.java
  entity/
    Project.java
    ProjectCustomer.java
    ProjectSnapshot.java
    ProjectState.java
  repository/
    ProjectCreationRequests.java
    ProjectCustomerRepository.java
    ProjectRepository.java
    ProjectSnapshotRepository.java
    ProjectStructureRepository.java
  security/
    ProjectAuthorization.java
  service/
    ProjectService.java
    ProjectSnapshotService.java
    ProjectStructureService.java
    ProjectStructureValidationService.java
```

Controllers handle HTTP/DTO validation, service owns live authorization/locking/atomic mutations, validation service constructs a definition-only projection for the shared strict validator, existing repository owns scoped JDBC persistence/progress/audit, Project owns state/version behavior. No duplicate section/item JPA entities or new package were needed; the existing JDBC persistence is retained.

## Verification evidence

- **PASS:** final `backend\mvnw.cmd clean verify`: **554 tests, 0 failures, 0 errors, 0 skipped** = all original 470 plus 84 ProjectStructureTests. Clean Flyway V1–V9, Hibernate validate, schema constraints, existing upgrade/restart suites, tenant/session checks, all original template/project regressions, configuration/visibility/reorder, real concurrent writers and persistence rollback passed. Executable Spring Boot JAR contains the new service and V9; packaged starter_templates.json matches the original resource bytes.
- **PASS:** frontend strict TypeScript, production build, lint with zero warnings, format:check and additional HTTPS-runner formatting check. **74 tests in 3 files**, all passed = original 72 plus 2 structure error-recovery cases. The first full frontend build exposed a missing shared Problem.currentVersion declaration; corrected and all checks rerun successfully.
- **PASS:** explicit `-Dtest=RealAuthenticationBrowserCheck`: **2 tests, 0 failures/errors/skips**, real HTTPS Edge/Vite/Spring/PostgreSQL, MSW off. Existing lifecycle and all-three-type wizard acceptance retained; added all-eight-type structure editor, keyboard reorder, dependency rejection, repeaters, enabled states, two-tab 409/currentVersion/input retention/refresh/retry and persistence acceptance. These 2 tests are separate from the default 554.
- An earlier full backend run had one stale Flyway-history count assertion (8 instead of 9); corrected the expected migration count and reran the exact clean verify successfully. No test deleted, disabled or relaxed. Existing denial coverage was narrowed only for the newly authorized sections route; unsupported descendant DELETE/lifecycle/preview routes remain denied.
- Protected source check: no changes to supplied docs/spec, V1–V8, starter template resource, backend pom, frontend package manifest or resolved lockfile. No new dependencies, credentials, application provider calls, remote push or backend submission workflow.
- Ignored local evidence: backend/target-t11-verify-final.log, backend/target-t11-focused.log, backend/target-t11-browser.log; frontend/.artifacts/logs/t11/audit-t11-{typecheck,build,lint,format,browser-format,tests}.log. Default Surefire XML totals independently summed to 554/0/0/0 after final clean.
- Full mock visual/PWA/browser suites and hosted deployment/provider acceptance were not rerun for this backend-scoped change. Real HTTPS integration was run. Existing T04 hosted CI, T05 resend/provider and T06 deployment/TLS/proxy/key/retention gates remain pending.


## Changed files

Created (7):

```text
backend/src/main/java/com/ayaantrix/collector/project/controller/ProjectStructureController.java
backend/src/main/java/com/ayaantrix/collector/project/dto/ProjectStructureDtos.java
backend/src/main/java/com/ayaantrix/collector/project/service/ProjectStructureService.java
backend/src/main/java/com/ayaantrix/collector/project/service/ProjectStructureValidationService.java
backend/src/main/resources/db/migration/V9__project_structure_editing.sql
backend/src/test/java/com/ayaantrix/collector/project/ProjectStructureTests.java
docs/T11_STRUCTURE_EDITOR.md
```

Modified (29):

```text
backend/ARCHITECTURE.md
backend/README.md
backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java
backend/src/main/java/com/ayaantrix/collector/common/error/ApiException.java
backend/src/main/java/com/ayaantrix/collector/common/error/GlobalExceptionHandler.java
backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java
backend/src/main/java/com/ayaantrix/collector/project/entity/Project.java
backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectRepository.java
backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectStructureRepository.java
backend/src/main/java/com/ayaantrix/collector/project/service/ProjectService.java
backend/src/main/java/com/ayaantrix/collector/template/validation/TemplateSchemaValidator.java
backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java
backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java
backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java
backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java
backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java
backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java
backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java
backend/src/test/java/com/ayaantrix/collector/project/ProjectFoundationTests.java
backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java
backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java
docs/FRONTEND_BACKEND_HANDOFF.md
docs/FRONTEND_PRODUCT_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
frontend/real-auth/browser-check.mjs
frontend/src/api/types.ts
frontend/src/features/projects/ProjectPage.tsx
frontend/src/lib/apiError.ts
frontend/src/test/product.test.ts
```

Implementation/regression commit: `995728c`. Frontend/real HTTPS integration commit: `2ca9345`. Documentation is committed separately; no push.



The later resume/cleanup preserved this original implementation and moved its HTTPS harness into frontend/tests/integration/real-auth. The original changed-file inventory above records the implementation commits. [Current organization, test-fixture correction, file moves and latest verification](T11_RESUME_AND_FRONTEND_ORGANIZATION.md).


## Part 2 continuation — 29 October 2026

[Current full-candidate collected-work policy and final verification](T11_PART2.md) supersedes the Part 1 per-target safety description. It protects transitive visibility dependents and both section enabled transitions without implementing submission/review persistence or treating reopenAffected as authorization. Full T11/M2 remain In progress for actual T17/T22 integration. Existing endpoints and V1–V9 remain unchanged.
