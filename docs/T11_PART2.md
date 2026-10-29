# T11 Part 2 and frontend organization

Date: 29 October 2026. Baseline: `dde2b76`. Part 1 was preserved, not recreated. **M2 and full T11 remain In progress**; the bounded Part 2 safety implementation is complete, with final verification recorded below. No T12/T13 or T14–T17 workflow was implemented.

## Frontend ownership

The requested app/router/store, feature api/components/pages/schemas/types, shared components/hooks/types/utils, layouts, services/api, config/env and styles/globals structure is implemented. See [frontend architecture](../frontend/ARCHITECTURE.md) for the complete directory map. Auth and project pages/components are separated; workspace, templates, structure-editor, client, review, reminders, analytics, AI, billing, settings and public code live in their owning features. Public API types and runtime schemas are feature-owned; mock-only records live in mocks/types. Shared APIs retain existing reducer identities and one HTTP/refresh/CSRF implementation. No duplicate transport or mock/real fork was introduced. Existing dependencies and resolved lockfiles are unchanged.

Unit tests moved to tests/unit. Existing tests/e2e, tests/pwa and tests/integration/real-auth remain separate. Generated logs, cache, reports and screenshots remain ignored under frontend/.artifacts. Root build/test configurations are necessary and retained. No UI redesign or product-feature expansion was included. Wizard buttons now declare non-submit/submit semantics explicitly.

## Specification and collected-work rules

Guide Sections 6.4, item/project state tables and API schema/reopen contracts require stable IDs, soft disable, explicit reopening of semantic changes to submitted content, audit and structure-version increments, draft revalidation, immutable historical submissions/approvals, and invalidation of current approval when truly reopened. COMPLETED projects require the later reason-bearing project reopen command. A request boolean alone cannot establish that these operations happened.

| Existing condition | Current T11 behavior |
| --- | --- |
| NOT_STARTED item with no revision pointer | Valid schema changes are allowed in editable projects. |
| DRAFT item with no revision pointer | Label/instructions/example and valid order changes are allowed. Affected semantic changes reject with 409 REOPEN_REQUIRED until real draft revalidation exists. |
| SUBMITTED, CHANGES_REQUESTED, APPROVED or any currentRevisionId | Metadata/order changes preserve markers and history; affected semantic changes reject with 409 REOPEN_REQUIRED, even with reopenAffected=true. |
| Reopened item/project | No reopen API is implemented here. Eligibility uses actual current project/item state; a flag or forged payload never bypasses checks. Actual reopening integration requires T17/T22. |
| COMPLETED, ARCHIVED, DELETION_PENDING project | 409 READ_ONLY before mutation. DRAFT/ACTIVE/PAUSED remain editable subject to live permission/plan checks. |
| Independent new section/item | Allowed if the full resulting structure is valid, without changing existing collected requests. |
| Type/options/constraints/required/visibility/AI-policy/enabled change | Full-candidate impact assessment protects the changed item and transitive old/new visibility dependents. Section disable AND re-enable protect affected collected descendants. |
| Removal or changed stable identity | Hard removal, changed keys or section ownership reject; disable preserves existing IDs. |

The existing V8 item state/revision-pointer columns are the only collected-work evidence available. Tests set those real markers to exercise rejection; they do not create fake answer/submission tables. Historical answer/revision approval semantics cannot be proven against nonexistent persistence. Existing initial project snapshots are verified immutable and independent; no claim is made that future submission persistence has been implemented.

## Integration boundary and transactions

`project/service/ProjectStructureMutationPolicy` has one concrete responsibility: compare the complete validated before/after structures and return immutable affected-item, draft-item and revision-item ID sets. It reuses ProjectStructureRepository.definition to distinguish metadata from semantic definition changes and propagates visibility impact transitively. It has no persistence, authorization bypass, provider or public endpoint.

ProjectStructureService keeps its existing live ProjectAuthorization checks, scoped project-row lock, version check and full validator. It assesses the candidate and rejects unsupported collected-work impact before any SQL. Supported operations use the existing scoped apply, project flush/version increment and audit insertion in one transaction. Failed validation, policy, SQL, stale version or audit operations leave no partial rows/version/audit. Current state and revision pointers are retained. PostgreSQL serialization, not JVM synchronization, coordinates competing writers.

Future T17/T22 integration must consume this impact under the same lock, authorize reopening with actual persisted revision/item versions and a reason, preserve immutable historical submissions and approvals, revalidate real drafts, invalidate only current approval/progress, and record the transition atomically. Only then may collected-work semantic changes proceed. No pluggable permissive stub or client-supplied approval capability was added.

## API and packages

The existing prefix is `/api/v1/workspaces/{workspaceId}/projects/{projectId}`:

- POST `/sections`
- PATCH `/sections/{sectionId}`
- POST `/sections/{sectionId}/items`
- PATCH `/items/{itemId}/schema`
- POST `/structure/reorder`

Bodies, success shapes and existing problem envelopes are unchanged. Each write requires expectedStructureVersion, current agency authorization and CSRF. 409 STRUCTURE_CONFLICT retains currentVersion; 409 REOPEN_REQUIRED describes unsupported collected-work mutation; 409 READ_ONLY guards closed project states; invalid structures retain 422. Request correlation IDs and no-store responses are preserved. The stronger safety check includes dependent collected items even when the directly edited controller is uncollected.

All 19 project production classes are within controller/service/repository/entity/dto/security. Only the mutation policy is new; existing services/repositories/authorization are reused. No class was placed directly in the project package and no empty package/interface was added. V1–V9 are unchanged. V9 remains the existing structure-audit migration; no new migration is necessary. No answer/submission/review table was added.

## Verification evidence

Generated logs are local ignored artifacts, not source files. Backend logs are `backend/target-t11-part2-*.log`; frontend logs are `frontend/.artifacts/logs/verification/part2-*.log` and the normal verification-wrapper logs.

- Focused ProjectStructureTests: **110 passed, 0 failures/errors/skips** (85 existing plus 25 added). Includes all existing field/repeater/validation/security/limits tests, metadata/ordering across collected states, both reopen flags, transitive visibility impact, section enabled transitions, stable identity, snapshot independence, exact errors/correlation and rollback.
- Full `mvnw.cmd clean verify`: **580 passed, 0 failures/errors/skips** (all prior 555 plus 25). Flyway V1–V9 validation, clean/upgrade/restart, Hibernate validation, catalog/project/security regressions and executable Spring Boot JAR packaging passed.
- Final tightening to exact concurrent-demotion error assertion: **4 parameterized cases passed**, no production change after the 580-test full run. Actual PostgreSQL lock wait is observed before concurrent membership revocation/demotion, project archive or structure-version changes commit. Rejected waiters preserve all state/audit. Existing simultaneous writer tests remain.
- Frontend: **74 tests / 3 files passed**; strict TypeScript, production build, zero-warning ESLint and Prettier passed through Verify-Frontend.ps1. Build emits the existing large-chunk advisory; no build failure or changed warning threshold.
- Complete final responsive regression: **72 passed, 0 failed**, desktop/tablet/mobile, one worker. Six independent auth-page checks replace one cumulative six-route loop, adding 15 cases across three viewports while retaining assertions. Navigation waits for actual main-page readiness, RTK reads, project creation response and destination. No arbitrary sleep, increased timeout or weakened assertion. The wizard also asserts no full-document navigation after login. Vite excludes generated .artifacts from watching.
- Earlier complete responsive run: **71 passed, 1 failed** in the desktop all-types wizard (unexpected document navigation/session loss). Failure evidence is preserved in part2-first-full.log. Explicit button semantics/artifact watching and readiness fixes preceded the focused 1/1 pass and final clean 72/72 run; the earlier failure is not counted as a pass.
- Production PWA: **1 passed**, real production preview/public-only caching and offline navigation. No private API caching introduced.
- Real HTTPS: **2 passed, 0 failures/errors/skips** in the final explicit Edge/Vite/Spring/PostgreSQL run, with MSW disabled. Real account/session, all-three-type project creation, structure edits, stable IDs, keyboard reorder, stale two-tab conflict/retry, audit and immutable snapshot assertions passed. Initial run was **1 passed / 1 failed**: the server test clock advanced before reload-triggered reads settled, causing an extra refresh. The runner now awaits the rendered page and pending RTK reads before clock advancement; the exact single-refresh assertion remains.

## Reproduction

Use the existing local setup in backend/README.md (Java 21, Docker Desktop Linux engine, PostgreSQL, existing environment/signing keys, Node and Edge). Run suites serially:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=ProjectStructureTests' test
if ($LASTEXITCODE -ne 0) { throw 'Focused T11 verification failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS verification failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
.\scripts\Verify-Frontend.ps1 -Browser -Pwa
```

## Status and remaining dependencies

Part 2 implements the safe integration boundary and preserves secure rejection where later persistence is absent. Full **T11 remains In progress**, pending real draft revalidation and submitted/approved-content reopening acceptance against T14–T17/T22 persistence. **M2 remains In progress.** T12/T13 and submission/review workflows were not implemented. T04 hosted CI, T05 provider/resend and T06 deployment/proxy/key/retention gates remain pending. No production-provider, deployment or full-MVP acceptance is claimed. JAR inspection confirmed the new policy in its service subpackage and all nine unchanged SQL migration resources. Protected specification/resource and dependency files have no diff from baseline. No remote push.

## Commits and exact file manifest

Implementation commits: `4914c1d` (frontend ownership, imports/configuration and browser readiness), `cbfa778` (backend mutation policy and regression tests). Documentation is committed separately. No push. The manifest below is relative to baseline `dde2b76`; A = created, M = modified, D = removed old module, R = detected move with similarity. Split modules can appear as D/A rather than one-to-one moves. This list includes the current documentation update.

```text
M	backend/ARCHITECTURE.md
M	backend/README.md
A	backend/src/main/java/com/ayaantrix/collector/project/service/ProjectStructureMutationPolicy.java
M	backend/src/main/java/com/ayaantrix/collector/project/service/ProjectStructureService.java
M	backend/src/test/java/com/ayaantrix/collector/project/ProjectStructureTests.java
M	docs/FRONTEND_BACKEND_HANDOFF.md
M	docs/FRONTEND_PRODUCT_HANDOFF.md
M	docs/IMPLEMENTATION_STATUS.md
A	docs/T11_PART2.md
M	docs/T11_RESUME_AND_FRONTEND_ORGANIZATION.md
M	docs/T11_STRUCTURE_EDITOR.md
M	frontend/ARCHITECTURE.md
M	frontend/README.md
M	frontend/index.html
D	frontend/src/api/contracts.ts
A	frontend/src/app/App.tsx
R062	frontend/src/main.tsx	frontend/src/app/main.tsx
D	frontend/src/app/providers.tsx
R057	frontend/src/app/router.tsx	frontend/src/app/router/AppRouter.tsx
R087	frontend/src/app/store.ts	frontend/src/app/store/store.ts
D	frontend/src/components/ReferenceUI.tsx
A	frontend/src/config/env.ts
R094	frontend/src/features/settings/AiAssistant.tsx	frontend/src/features/ai/components/AiAssistant.tsx
A	frontend/src/features/ai/types/ai.types.ts
A	frontend/src/features/analytics/components/AnalyticsPanel.tsx
R052	frontend/src/features/settings/ReportingExtras.tsx	frontend/src/features/analytics/components/DigestPreview.tsx
A	frontend/src/features/analytics/pages/InsightsPage.tsx
A	frontend/src/features/analytics/pages/StatusSharePage.tsx
A	frontend/src/features/analytics/types/analytics.types.ts
D	frontend/src/features/auth/AuthPages.tsx
R088	frontend/src/features/auth/authApi.ts	frontend/src/features/auth/api/authApi.ts
R090	frontend/src/features/settings/AccountPanel.tsx	frontend/src/features/auth/components/AccountPanel.tsx
A	frontend/src/features/auth/components/AuthCard.tsx
R088	frontend/src/features/auth/AuthForm.tsx	frontend/src/features/auth/components/AuthForm.tsx
A	frontend/src/features/auth/components/LoginForm.tsx
R082	frontend/src/features/auth/SessionBoundary.tsx	frontend/src/features/auth/components/SessionBoundary.tsx
A	frontend/src/features/auth/components/authFields.ts
A	frontend/src/features/auth/pages/ForgotPasswordPage.tsx
A	frontend/src/features/auth/pages/LoginPage.tsx
A	frontend/src/features/auth/pages/RegisterPage.tsx
A	frontend/src/features/auth/pages/ResetPasswordPage.tsx
A	frontend/src/features/auth/pages/TeamInvitationPage.tsx
A	frontend/src/features/auth/pages/VerifyEmailPage.tsx
R082	frontend/src/features/auth/schemas.ts	frontend/src/features/auth/schemas/accountSchemas.ts
R052	frontend/src/api/types.ts	frontend/src/features/auth/schemas/authResponseSchemas.ts
A	frontend/src/features/auth/schemas/loginSchema.ts
R079	frontend/src/features/auth/authSlice.ts	frontend/src/features/auth/store/authSlice.ts
R089	frontend/src/features/auth/session.ts	frontend/src/features/auth/store/session.ts
A	frontend/src/features/auth/types/auth.types.ts
A	frontend/src/features/auth/utils/actionToken.ts
A	frontend/src/features/billing/pages/BillingPage.tsx
A	frontend/src/features/billing/types/billing.types.ts
D	frontend/src/features/client/ClientPages.tsx
A	frontend/src/features/client/api/clientApi.ts
A	frontend/src/features/client/components/AnswerEditor.tsx
A	frontend/src/features/client/components/ClientPreferences.tsx
A	frontend/src/features/client/components/TypedValue.tsx
A	frontend/src/features/client/components/UploadQueue.tsx
A	frontend/src/features/client/pages/ClientAccessPage.tsx
A	frontend/src/features/client/pages/ClientProjectPage.tsx
A	frontend/src/features/client/schemas/answerSchema.ts
A	frontend/src/features/client/types/client.types.ts
A	frontend/src/features/client/types/upload.types.ts
D	frontend/src/features/projects/ProjectPage.tsx
D	frontend/src/features/projects/WorkspacePages.tsx
A	frontend/src/features/projects/api/projectsApi.ts
R096	frontend/src/features/projects/AccessPanels.tsx	frontend/src/features/projects/components/AccessPanels.tsx
A	frontend/src/features/projects/components/AssignmentsPanel.tsx
R095	frontend/src/features/projects/FilesPanel.tsx	frontend/src/features/projects/components/FilesPanel.tsx
A	frontend/src/features/projects/components/PreviewPanel.tsx
A	frontend/src/features/projects/components/ProjectCard.tsx
A	frontend/src/features/projects/components/ProjectSteps.tsx
A	frontend/src/features/projects/components/ProjectSymbol.tsx
A	frontend/src/features/projects/components/ProjectTable.tsx
R092	frontend/src/features/projects/ProjectWizard.tsx	frontend/src/features/projects/pages/CreateProjectPage.tsx
A	frontend/src/features/projects/pages/ProjectPage.tsx
A	frontend/src/features/projects/pages/ProjectsPage.tsx
A	frontend/src/features/projects/schemas/projectSchema.ts
A	frontend/src/features/projects/types/file.types.ts
A	frontend/src/features/projects/types/project.types.ts
A	frontend/src/features/projects/types/projectOptions.ts
R099	frontend/src/features/public/HelpPages.tsx	frontend/src/features/public/pages/HelpPages.tsx
R051	frontend/src/features/public/PublicPages.tsx	frontend/src/features/public/pages/LandingPage.tsx
A	frontend/src/features/public/pages/PricingPage.tsx
A	frontend/src/features/reminders/components/DeliveryHistory.tsx
R096	frontend/src/features/settings/RemindersPanel.tsx	frontend/src/features/reminders/components/RemindersPanel.tsx
A	frontend/src/features/reminders/types/reminder.types.ts
R097	frontend/src/features/review/ReviewPanels.tsx	frontend/src/features/review/components/ReviewPanels.tsx
A	frontend/src/features/review/types/review.types.ts
D	frontend/src/features/settings/SettingsPages.tsx
A	frontend/src/features/settings/pages/SettingsPage.tsx
A	frontend/src/features/structure-editor/components/FieldSymbol.tsx
A	frontend/src/features/structure-editor/components/ItemEditor.tsx
A	frontend/src/features/structure-editor/components/StructureEditor.tsx
A	frontend/src/features/structure-editor/schemas/structureSchema.ts
A	frontend/src/features/structure-editor/types/fieldOptions.ts
A	frontend/src/features/structure-editor/types/structure.types.ts
R095	frontend/src/features/projects/TemplateEditor.tsx	frontend/src/features/templates/components/TemplateEditor.tsx
A	frontend/src/features/templates/components/TemplatePreview.tsx
A	frontend/src/features/templates/components/TemplateSymbol.tsx
A	frontend/src/features/templates/components/TemplateTiles.tsx
A	frontend/src/features/templates/pages/TemplatesPage.tsx
A	frontend/src/features/templates/types/template.types.ts
R085	frontend/src/features/settings/OwnershipPanel.tsx	frontend/src/features/workspace/components/OwnershipPanel.tsx
R092	frontend/src/features/projects/WorkspaceOverview.tsx	frontend/src/features/workspace/pages/DashboardPage.tsx
A	frontend/src/features/workspace/pages/OnboardingPage.tsx
R095	frontend/src/features/settings/TeamPage.tsx	frontend/src/features/workspace/pages/TeamPage.tsx
A	frontend/src/features/workspace/pages/WorkspaceEntry.tsx
A	frontend/src/features/workspace/types/workspace.types.ts
R060	frontend/src/components/Layouts.tsx	frontend/src/layouts/AgencyLayout.tsx
A	frontend/src/layouts/AuthLayout.tsx
A	frontend/src/layouts/ClientLayout.tsx
A	frontend/src/layouts/PublicLayout.tsx
M	frontend/src/mocks/ScenarioControls.tsx
M	frontend/src/mocks/agencyFiles.ts
M	frontend/src/mocks/browser.ts
M	frontend/src/mocks/collaboration.ts
M	frontend/src/mocks/collection.ts
M	frontend/src/mocks/commercial.ts
M	frontend/src/mocks/fixtures.ts
M	frontend/src/mocks/handlers.ts
M	frontend/src/mocks/productDb.ts
M	frontend/src/mocks/productHandlers.ts
M	frontend/src/mocks/review.ts
R063	frontend/src/api/productTypes.ts	frontend/src/mocks/types/fixtures.types.ts
R054	frontend/src/api/agencyApi.ts	frontend/src/services/api/baseApi.ts
R089	frontend/src/api/baseQuery.ts	frontend/src/services/api/baseQuery.ts
R075	frontend/src/api/clientApi.ts	frontend/src/services/api/clientApi.ts
R094	frontend/src/api/productApi.ts	frontend/src/services/api/resourceApi.ts
R054	frontend/src/api/productSchemas.ts	frontend/src/services/api/resourceSchemas.ts
R100	frontend/src/components/AppShell.tsx	frontend/src/shared/components/AppShell.tsx
A	frontend/src/shared/components/Brand.tsx
R097	frontend/src/components/ConnectionStatus.tsx	frontend/src/shared/components/ConnectionStatus.tsx
R097	frontend/src/components/Feedback.tsx	frontend/src/shared/components/Feedback.tsx
R100	frontend/src/components/FormFields.tsx	frontend/src/shared/components/FormFields.tsx
R095	frontend/src/components/Modal.tsx	frontend/src/shared/components/Modal.tsx
R099	frontend/src/components/PageHeader.tsx	frontend/src/shared/components/PageHeader.tsx
R066	frontend/src/components/ProductUI.tsx	frontend/src/shared/components/ProductUI.tsx
R086	frontend/src/components/RouteFocus.tsx	frontend/src/shared/components/RouteFocus.tsx
R084	frontend/src/features/foundation/AgencyFoundation.tsx	frontend/src/shared/components/routing/AgencyAccess.tsx
R099	frontend/src/features/foundation/Pages.tsx	frontend/src/shared/components/routing/RecoveryPages.tsx
R074	frontend/src/app/hooks.ts	frontend/src/shared/hooks/useAppStore.ts
A	frontend/src/shared/hooks/useCommand.ts
A	frontend/src/shared/hooks/useWorkspace.ts
A	frontend/src/shared/types/common.types.ts
A	frontend/src/shared/types/jsonSchema.ts
A	frontend/src/shared/types/paginationSchema.ts
R097	frontend/src/lib/apiError.ts	frontend/src/shared/utils/apiError.ts
R095	frontend/src/lib/domain.ts	frontend/src/shared/utils/domain.ts
R089	frontend/src/lib/download.ts	frontend/src/shared/utils/download.ts
R100	frontend/src/lib/returnDestination.ts	frontend/src/shared/utils/returnDestination.ts
A	frontend/src/styles/globals.css
A	frontend/tests/e2e/helpers/readiness.ts
M	frontend/tests/e2e/polish.spec.ts
M	frontend/tests/e2e/product.spec.ts
M	frontend/tests/integration/real-auth/browser-check.mjs
R095	frontend/src/test/auth.test.tsx	frontend/tests/unit/auth.test.tsx
R097	frontend/src/test/product.test.ts	frontend/tests/unit/product.test.ts
R094	frontend/src/test/setup.ts	frontend/tests/unit/setup.ts
R096	frontend/src/test/transport.test.ts	frontend/tests/unit/transport.test.ts
M	frontend/tsconfig.app.json
M	frontend/tsconfig.node.json
M	frontend/vite.config.ts
```
