# T11 Part 1 resume and frontend organization

Started 28 October; final checks resumed 29 October 2026.

The requested starting point was checked against Git before editing. The preceding T11 work had already been verified and committed: 995728c (backend), 2ca9345 (frontend/HTTPS), 6f12074 (documentation). The working tree was clean. Existing T11 controllers/services/repositories/DTOs, V9, security, field validation, audit and concurrency behavior were preserved. No implementation was restarted or recreated.

## Frontend cleanup

The screenshot's audit/contract/FE01 log files are generated command output, not application inputs. Removed 28 obsolete root logs; retained six latest audit-t11 logs under ignored frontend/.artifacts/logs/t11. Existing browser artifacts were moved under .artifacts/playwright/legacy. Removed the two generated root TypeScript build-info files; new runs write build caches under .artifacts/cache. There are no .log or .tsbuildinfo files at the frontend root after verification.

Preserved active root .gitignore, .prettierrc.json, environment examples/local settings, package manifest/lockfile, index.html and framework/tool configurations. node_modules and dist remain normal ignored dependency/build directories. No dependency reinstall or version change was needed; package.json changes only the formatter's test path.

Consolidated browser tooling with these source-preserving moves:

| Previous path under frontend | Current path |
| --- | --- |
| e2e/auth.spec.ts | tests/e2e/auth.spec.ts |
| e2e/navigation.spec.ts | tests/e2e/navigation.spec.ts |
| e2e/polish.spec.ts | tests/e2e/polish.spec.ts |
| e2e/product.spec.ts | tests/e2e/product.spec.ts |
| pwa/production.spec.ts | tests/pwa/production.spec.ts |
| real-auth/browser-check.mjs | tests/integration/real-auth/browser-check.mjs |

All five .ts browser specs remain byte-for-byte identical in Git. Only the moved HTTPS runner's two frontend-root-relative paths changed. The Java launcher points to its new location. Playwright test/output directories, lint integration glob, TypeScript includes/build-cache paths and format:check are updated. CI's existing npm/Maven commands remain valid.

src already separates app, api, components, features, lib, mocks, styles and unit-test setup. These feature boundaries, routes and UI were retained rather than moved speculatively. frontend/ARCHITECTURE.md documents actual ownership. frontend/scripts/Verify-Frontend.ps1 runs checks in order, stops on nonzero exit, preserves each log under .artifacts/logs/verification and restores the caller's working directory. Its optional -Browser and -Pwa flags include the browser suites. Native stderr warnings are retained without being mistaken for failed commands in Windows PowerShell 5.1.

## T11 review and correction

Read AGENTS.md, architecture/status, original T11 implementation and regression tests. All 18 project production classes match their controller/dto/entity/repository/security/service package directories. Authorization, size-limit, repeater, visibility, stable-ID, isolation, version, concurrency and rollback tests already exist. No missing feature class or migration was recreated.

Corrected one malformed @ValueSource fixture that combined the intended malformed JSON and empty-object cases into a single string. They now run independently: 85 focused structure cases, preserving all original assertions and increasing the complete backend suite from 554 to 555. Backend production code and applied migrations are unchanged by this cleanup/resume.

## APIs and persistence preserved

Prefix `/api/v1/workspaces/{workspaceId}/projects/{projectId}`:

| Method | Suffix |
| --- | --- |
| POST | /sections |
| PATCH | /sections/{sectionId} |
| POST | /sections/{sectionId}/items |
| PATCH | /items/{itemId}/schema |
| POST | /structure/reorder |

Existing GET project detail returns current structure/version. Disable-based removal preserves IDs and snapshots. Writes require expectedStructureVersion, valid JWT/CSRF, live scoped owner membership and allowed project/workspace/plan state. Stale writes return 409 STRUCTURE_CONFLICT/currentVersion. V9 is the existing audit migration; no new migration and no V1–V9 modification. Full-result validation, PostgreSQL locks, atomic writes/audit and immutable initial snapshot behavior are unchanged. See T11_STRUCTURE_EDITOR.md for exact bodies and detailed rules.

## Verification

- Focused ProjectStructureTests: **85 passed**, zero failures/errors/skips. Includes all eight types, configuration/repeaters, full-result visibility, exact reorder, stale/current-version recovery, two real PostgreSQL writers, rollback, tenant/session/member/plan/CSRF checks, limits and restart/snapshot independence.
- Exact `backend/mvnw.cmd clean verify`: **555 passed**, zero failures/errors/skips = original 470 plus 85 T11 cases. Original suites remain enabled. Flyway V1–V9/Hibernate validation, existing upgrade/restart cases and executable JAR packaging passed. The JAR contains the T11 service and V9, and its starter template resource matches the original bytes.
- Frontend: **74 tests in 3 files passed**, strict TypeScript, production build, lint and formatting passed using the consolidated test directories. All original dependencies and lockfile remain unchanged.
- Mock-backed responsive browser suite: all **57 distinct scenarios** were exercised at desktop/tablet/phone widths. The latest complete run had **54 passes and 3 timing failures**; all **3 failed scenarios passed on an isolated rerun** with unchanged assertions/timeouts. An earlier run under parallel backend load had 5 timing failures, also all passing on rerun. Do not interpret these as a clean single-run 57/57 result; long-run browser timing stability remains a limitation. No test was skipped, removed or weakened, and the moved .ts specifications are unchanged.
- Production PWA browser suite: **1 passed**, validating public-only cache/offline behavior from tests/pwa.
- Real HTTPS confirmation: **2 passed**, zero failures/errors/skips, in one fresh run on 29 October. MSW disabled; real Edge/Vite/Spring/PostgreSQL verifies authentication plus all-three-type projects and T11 section/item editing, eight types, conditions/repeaters, keyboard reorder, two-tab stale-version/input retention/refresh/retry, stable persisted data and untouched initial snapshots. The moved Java/Node launch paths work. A prior fresh attempt passed T11 onboarding but encountered an independent browser-start error in the authentication case; the final pair passed unchanged.
- Final Verify-Frontend.ps1 invocation under Windows PowerShell 5.1: **passed**, exit 0. It ran TypeScript, production build, lint, formatting and all 74 unit/component tests, and kept generated output under .artifacts. Optional browser/PWA paths were also executed; browser failures correctly stopped the wrapper and were investigated/rerun separately as recorded above.
- Protected-source checks: backend production code/resources/security, every existing migration, supplied docs/spec, original template bytes, frontend/src and dependency resolution are unchanged. All 18 project classes match their feature package paths. No new dependency, application feature, T12/T13 or production provider call.
- Evidence: backend/target-t11-resume-focused.log, target-t11-resume-verify.log, target-t11-resume-https.log, target-t11-resume-https-final.log and target-t11-resume-https-confirm.log; frontend/.artifacts/logs/verification and Playwright results under .artifacts/playwright. The overnight HTTPS attempt elapsed approximately eight hours and timed out during workspace-projects; it is retained as a failed attempt, not reported as passing. Fresh execution results are recorded above separately.


## Status and remaining issues

T11 Part 1 is implemented and verified for the independent fresh-structure editor, keyboard reordering and conflict recovery. The full T11 row remains In progress: changing collected/submitted content needs the later immutable-revision reopening and draft-revalidation workflow, explicitly outside this request. REOPEN_REQUIRED fails closed instead of modifying historical work. T12/T13, assignment-based member access, client submissions and review workflows were not implemented. M2 remains In progress. Existing T04 hosted CI, T05 resend/provider and T06 deployment/TLS/proxy/key/retention gates remain pending.

## Commands

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=ProjectStructureTests' test
if ($LASTEXITCODE -ne 0) { throw 'Focused T11 verification failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS acceptance failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
.\scripts\Verify-Frontend.ps1 -Browser -Pwa
```

Run frontend/backend/browser suites serially on this machine. They use existing dependencies, Java 21 and Docker Desktop Linux containers. Real HTTPS uses disposable PostgreSQL, existing Edge/Node/keytool and isolated test certificates, with MSW disabled. No production provider credentials are needed.

## Exact tracked-file manifest

Created (3):

```text
docs/T11_RESUME_AND_FRONTEND_ORGANIZATION.md
frontend/ARCHITECTURE.md
frontend/scripts/Verify-Frontend.ps1
```

Modified (16):

```text
backend/ARCHITECTURE.md
backend/README.md
backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java
backend/src/test/java/com/ayaantrix/collector/project/ProjectStructureTests.java
docs/FRONTEND_BACKEND_HANDOFF.md
docs/FRONTEND_PRODUCT_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/T11_STRUCTURE_EDITOR.md
frontend/.gitignore
frontend/README.md
frontend/eslint.config.js
frontend/package.json
frontend/playwright.config.ts
frontend/playwright.pwa.config.ts
frontend/tsconfig.app.json
frontend/tsconfig.node.json
```

Moved (6):

```text
frontend/e2e/auth.spec.ts -> frontend/tests/e2e/auth.spec.ts
frontend/e2e/navigation.spec.ts -> frontend/tests/e2e/navigation.spec.ts
frontend/e2e/polish.spec.ts -> frontend/tests/e2e/polish.spec.ts
frontend/e2e/product.spec.ts -> frontend/tests/e2e/product.spec.ts
frontend/pwa/production.spec.ts -> frontend/tests/pwa/production.spec.ts
frontend/real-auth/browser-check.mjs -> frontend/tests/integration/real-auth/browser-check.mjs
```

No tracked application source file was deleted. The 28 removed log files and two removed/recreated compiler caches were generated ignored files, so their deletion does not appear as a Git source deletion. Six current T11 logs and older browser results were retained under .artifacts.



Verified test-fixture correction commit: `ec3f44d`. Verified frontend organization/HTTPS path commit: `a07808e`. Documentation is committed separately. No push.


## 29 October continuation

The later feature-source reorganization replaces the old flat/mixed frontend modules with the requested app/features/shared/layouts/services/config/styles ownership. Unit tests now live in tests/unit; browser directories and ignored .artifacts are retained. See [current frontend architecture](../frontend/ARCHITECTURE.md) and [T11 Part 2 evidence and remaining dependencies](T11_PART2.md). Earlier evidence above remains historical.
