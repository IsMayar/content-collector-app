# T12 Part 1 — customers, project contacts and owner preview

Date: 29 October 2026. Baseline commit: `7469599`. The specification, Section 22, defines T12 as “Client contacts and read-only client preview”; its acceptance is “Preview exposes no live client session.” Scope was checked against Sections 3, 4, 5, 8.2/8.3, 12.2 and the supplied API catalog/reference SQL. Original specification files are unchanged.

## Scope resolved before implementation

| Capability | Decision |
| --- | --- |
| Workspace customer list/create | Already implemented in T10; preserve GET/POST clients and ProjectCustomer. |
| Workspace customer update | Implement catalog PATCH clients/{clientId}: businessName and expectedVersion only. |
| Project association | Reuse T10 project creation with clientId and composite tenant relationship. No undocumented reassignment endpoint. |
| Project contact list/create | Implement catalog GET/POST projects/{projectId}/contacts with same-workspace, same-project-customer association. |
| Per-contact read/update/delete or customer DELETE | Not in this inventory; no new endpoints invented. Deletion is prevented by existing and new foreign keys. |
| Owner client preview | Implement authenticated catalog GET projects/{projectId}/client-preview. No public URL or client identity. |
| Team invitations/assignments | T13 remains unimplemented. Membership alone still grants no project access. |
| Client invitation email/exchange/session | T14 remains closed. A contact record issues no token, cookie, account, membership or email. |
| Drafts, uploads, submissions, review, reopening | T15–T17/T22 remain outside this task. T11 safety boundary is retained. |

## Persistence and architecture

ProjectCustomer remains the only workspace customer entity. The existing business/contact/email/version contract is preserved. PATCH changes only the business name with numeric optimistic version checking; it leaves contact/email, projects, snapshots and any collected markers untouched. Duplicate customer emails remain allowed because the original clients model has no unique-email rule and different businesses may share a contact.

V10__client_contacts.sql is additive. It adds the reference project_contacts table and a unique projects(workspace_id,id,client_id) key for the composite FK. Fields include tenant/project/customer IDs, name, normalized email, state, optional timezone, expiry, reminder preference, revocation timestamp and created/updated timestamps. Composite FKs enforce the exact project's customer and tenant; per-project normalized email is unique. Same email on another project is allowed. No invitation/session/answer/review persistence is created. Existing customer/project rows survive upgrade. V1–V9 are byte-unchanged; Hibernate remains validate and Flyway owns schema changes.

Contact inputs are Bean Validated, names are trimmed and emails use the existing EmailAddresses normalizer. Expiry must be in the future. The pilot maximum is 90 days, matching the guide's default grant duration and the catalog's bounded-grant requirement; the UI proposes 90 days. This is an expiry on the explicit contact record, never a reusable bearer link. Duplicate contact creation returns safe 409 CONTACT_EXISTS without generating another identity. PostgreSQL uniqueness also enforces this independently of service checks.

There are 24 production project classes, all under controller/service/repository/entity/dto/security. Five new feature classes:

```text
project/
  controller/ProjectClientController.java
  service/ProjectClientService.java
  repository/ProjectContactRepository.java
  entity/ProjectContact.java
  dto/ProjectClientDtos.java
```

ProjectClientService reuses ProjectAuthorization, ProjectRepository, ProjectCustomerRepository and ProjectStructureRepository. It does not duplicate structure persistence, create a generic repository, or introduce a pass-through service interface. Live account/session/workspace/member locks preserve existing ordering. Contact writes acquire the scoped project lock and require write entitlement plus an editable project. Customer writes serialize through existing workspace/member authorization and retain JPA version checks. Reads do not require a writable subscription. Preview takes the project lock for a coherent structure/version projection, without dirtying entities or writing an audit event.

## Actual HTTP contracts

Prefix `/api/v1/workspaces/{workspaceId}`. Agency JWT required, no-store JSON; write requests also require CSRF. Safe problem responses include existing request correlation IDs. Existing GET/POST clients are unchanged.

| Method and suffix | Request | Response |
| --- | --- | --- |
| GET `/clients?page=0&size=12` | Existing bounded pagination | 200 `{data: Client[], page}` |
| POST `/clients` | businessName, optional contactName/email | 201 `{client: Client}` |
| PATCH `/clients/{clientId}` | businessName, expectedVersion | 200 `{client: Client}` |
| GET `/projects/{projectId}/contacts` | None | 200 `{data: ProjectContact[]}` |
| POST `/projects/{projectId}/contacts` | clientId, name, email, accessExpiresAt | 201 `{contact: ProjectContact}` |
| GET `/projects/{projectId}/client-preview` | None | 200 `{preview: PreviewChecklist}` |

Customer version mismatch returns 409 VERSION_CONFLICT/currentVersion; duplicate project email returns 409 CONTACT_EXISTS. Invalid input/expiry is 400 VALIDATION_FAILED. A foreign, unknown or unrelated customer/project is safely hidden with 404 NOT_FOUND. Closed project contact mutations return 409 READ_ONLY; unavailable write entitlement remains 403 WORKSPACE_READ_ONLY. Standard 401 session and 403 CSRF failures are preserved. Only exact new routes were opened; invitation, revoke, collection and lifecycle descendants remain default-denied.

## Preview behavior and its deliberate data boundary

Owner preview reads the independent operational project structure, including T11 edits, never the live template catalog. It preserves project-specific IDs, section/item ordering, required flags, labels, instructions, examples and all eight field definitions. Disabled sections/items are excluded. Until actual answer persistence exists, unanswered visibility conditions are hidden using the existing structure projection; no sample answer is persisted to make a conditional request visible.

The catalog's `{preview: ClientChecklist}` envelope is honored as a read-only schema projection: project metadata, sections/items and preview progress. The frontend uses the same ItemDefinition/TypedValue field renderer as the client. Each preview item has canEdit=false, answer=null, empty assets/comments, and no currentRevisionId. NOT_STARTED/zero submission and approval counts describe the empty preview, not the real status of collected work. AI is disabled. This explicit null-answer preview variant avoids fabricating an Answer row, savedAt or immutable submission. The handoff records that distinction from the later authenticated checklist contract.

The UI clearly labels owner preview and shows the project title, agency and due date. Section switching is local. Text, URL, option and multi-select controls are disabled; repeaters show a disabled illustrative row using the same renderer. File/image requests show allowed extensions/count guidance instead of mounting UploadQueue. No draft, upload, AI, submit, review or analytics event is sent. Reload preserves the real project and independent snapshot. No preview token/cookie/link is returned and no internal comments, contact email list or historical answer content is serialized into preview.

Preview requires a valid agency identity, live workspace membership and project authorization. It is owner-only as specified by the endpoint catalog. Unassigned members receive safe 404 and have no preview link or usable direct tab. Foreign tenants cannot read contact emails or preview by guessing UUIDs. Real client access must later use the separate invitation/session boundary; an ACTIVE contact row alone authenticates nobody.

## Frontend ownership

```text
features/clients/
  api/clientsApi.ts                    existing RTK resource transport/cache and typed commands
  components/CustomerPanel.tsx         paginated list, create and versioned business-name edit
  components/ProjectContactsPanel.tsx  moved from projects/AccessPanels; contact-only real save
  schemas/clientSchema.ts              RHF/Zod input and response schemas
  types/client.types.ts                customer/contact DTO ownership
features/projects/
  api/previewApi.ts
  schemas/previewSchema.ts
  types/preview.types.ts
  components/PreviewPanel.tsx
features/client/components/TypedValue.tsx  shared field presentation with explicit safe preview mode
```

Project access hosts customer management and contacts. Customer creation/selection in the existing project wizard retains real clientId association. Customer form validation uses RHF, Zod and existing accessible FormField controls. Commands use the existing RTK HTTP path, CSRF/JWT refresh and cache invalidation. Loading, empty, error, success and stale-write recovery use existing UI primitives; unsaved business-name input is retained on failure.

Existing later-workflow demonstrations remain explicitly mock-only. Real contact save does not automatically send an invitation. Real invite/revoke controls and the wizard invitation checkbox are disabled with an explanation until later backend access workflows exist. Real production never falls back to fixture data. MSW uses the same routes and corrected preview envelope; tests and artifacts retain their organized folders. No unrelated redesign or new dependency.

## Verification

- Focused ProjectClientPreviewTests: **40 passed, 0 failures/errors/skips** using actual PostgreSQL/Testcontainers and MockMvc. Includes contact list/create/normalization/duplicates, invalid/missing/foreign association, optimistic customer update, all eight types, disabled/conditional/order/snapshot projection, no content/audit/outbox writes, six project states, CSRF, session/membership revocation, unassigned member and tenant isolation, database FKs, concurrent duplicate creation, restart and V9-to-V10 upgrade preservation.
- Full backend `clean verify`: **620 passed, 0 failures/errors/skips**, all prior 580 retained plus 40. Existing latest-schema assertions advance to 10 migrations/19 tables; old default-denial checks now target still-unsupported descendants. No test is skipped or assertion disabled. Flyway checksums/upgrade/restart, Hibernate validation and executable JAR packaging passed.
- Frontend: **87 unit tests/4 files passed** (74 existing + 13 new), strict TypeScript passed. TypeScript, production build, zero-warning lint and formatting also passed in the current complete wrapper; the final complete browser/PWA results are recorded below.
- Real HTTPS: **2 tests passed, zero failures/errors/skips** in the final rerun after all source changes, Edge/Vite/Spring/PostgreSQL, MSW disabled. Existing session/workspace/all-three-project-type/T11 journeys remain. Extended actual UI acceptance renames a customer, creates a project contact, opens preview, renders seven currently visible fields while the unanswered multi-select dependency stays hidden, checks disabled controls, mobile overflow, reload, absence of application writes and cross-tenant denial. Java verifies unchanged project versions/state, snapshots and 17 structure-audit entries. Only synthetic data/test delivery, no real email.
- **Final complete responsive suite: 75 passed, 0 failed**, including all existing 72 plus the new T12 case at desktop/tablet/phone widths. **Production PWA: 1 passed**, public-only cache and honest offline shell. The sequential Verify-Frontend.ps1 -Browser -Pwa wrapper completed successfully. TypeScript, build, lint, formatting and all 87 unit tests passed in that same final run. The existing chunk-size advisory remains; warning thresholds were not altered.

Initial failed focused attempts are not acceptance passes: the new test helper incorrectly scoped the existing account outbox by a nonexistent workspace_id and referred to refresh_sessions instead of auth_sessions; these fixtures were corrected. A subsequent incremental test compilation reported missing existing classes; a clean compilation passed without relaxing production checks or tests. Initial frontend field-prop/type mistakes were corrected before the initial 86-test pass. The first 75-case responsive run passed all 72 prior cases but failed three new T12 cases because the mock preview treated omitted optional enabled flags as disabled. Corrected the default and added a mock HTTP regression; the focused desktop/tablet/phone rerun passed 3/3. One intermediate wrapper stopped at a mock email variable scope error, corrected before running tests. Another run passed 85/87 unit tests but hit two auth helper timeouts during per-character input; the helper now uses real paste/input events, retaining all assertions and browser keyboard tests. The final whole-unit run passed 87/87; the later complete run passed all 75 browser cases and the PWA check. No sleeps, increased timeouts or disabled assertions were introduced.

JAR inspection confirms all five new feature classes, ten SQL migrations and a byte-identical packaged original template catalog.

Logs remain ignored: backend/target-t12-*.log and frontend/.artifacts/logs/{t12-*,verification/t12-acceptance.log}; browser artifacts stay in frontend/.artifacts.

## Reproduction

Reuse the existing Java 21, Docker Desktop Linux engine, isolated PostgreSQL, signing-key/environment setup, Node and Edge documented in backend/README.md. Run suites serially:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean '-Dtest=ProjectClientPreviewTests' test
if ($LASTEXITCODE -ne 0) { throw 'Focused T12 verification failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS verification failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
.\scripts\Verify-Frontend.ps1 -Browser -Pwa
```

## Task and release boundaries

**T12 Complete** for the documented contact-management/read-only-preview roadmap acceptance and this Part 1 scope. No local T12 blocker remains. M2 stays In progress. T11 retains its real draft/revision reopening dependencies. T13 assignments/team invitations, T14 invitation delivery/exchange/client sessions, T15–T17 collection/review and T22 lifecycle are not implemented. T04 hosted CI, T05 provider/resend and T06 production deployment/proxy/key/retention gates remain pending. No production-provider, hosted CI, deployment or full-MVP acceptance is claimed. No remote push.

The final HTTPS rerun is backend/target-t12-https-final.log. Earlier failed and successful attempts remain separate local artifacts; final results above are whole-suite passes, not isolated-retry totals. Implementation foundation commit: `73aa4a4`. Frontend/browser integration and documentation follow in separate commits. No push.

## Commits and exact file manifest

Backend implementation/regression: `73aa4a4`. Frontend and real-browser integration: `f5af935`. Documentation follows in its own commit. The complete manifest below is relative to inspected clean baseline `7469599`: A = created, M = modified, R = moved/modified with similarity. Paths are relative to the project root. There are no deleted specifications or migrations.

```text
M	backend/ARCHITECTURE.md
M	backend/README.md
M	backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java
M	backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java
A	backend/src/main/java/com/ayaantrix/collector/project/controller/ProjectClientController.java
A	backend/src/main/java/com/ayaantrix/collector/project/dto/ProjectClientDtos.java
A	backend/src/main/java/com/ayaantrix/collector/project/entity/ProjectContact.java
M	backend/src/main/java/com/ayaantrix/collector/project/entity/ProjectCustomer.java
A	backend/src/main/java/com/ayaantrix/collector/project/repository/ProjectContactRepository.java
A	backend/src/main/java/com/ayaantrix/collector/project/service/ProjectClientService.java
A	backend/src/main/resources/db/migration/V10__client_contacts.sql
M	backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java
M	backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java
M	backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java
M	backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java
M	backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java
M	backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java
M	backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java
A	backend/src/test/java/com/ayaantrix/collector/project/ProjectClientPreviewTests.java
M	backend/src/test/java/com/ayaantrix/collector/project/ProjectFoundationTests.java
M	backend/src/test/java/com/ayaantrix/collector/project/ProjectStructureTests.java
M	backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java
M	backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java
M	docs/FRONTEND_BACKEND_HANDOFF.md
M	docs/IMPLEMENTATION_STATUS.md
A	docs/T12_CLIENT_CONTACTS_AND_PREVIEW.md
M	frontend/ARCHITECTURE.md
M	frontend/README.md
M	frontend/src/features/client/components/TypedValue.tsx
A	frontend/src/features/clients/api/clientsApi.ts
A	frontend/src/features/clients/components/CustomerPanel.tsx
R065	frontend/src/features/projects/components/AccessPanels.tsx	frontend/src/features/clients/components/ProjectContactsPanel.tsx
A	frontend/src/features/clients/schemas/clientSchema.ts
A	frontend/src/features/clients/types/client.types.ts
A	frontend/src/features/projects/api/previewApi.ts
M	frontend/src/features/projects/components/PreviewPanel.tsx
M	frontend/src/features/projects/pages/CreateProjectPage.tsx
M	frontend/src/features/projects/pages/ProjectPage.tsx
A	frontend/src/features/projects/schemas/previewSchema.ts
A	frontend/src/features/projects/types/preview.types.ts
M	frontend/src/features/projects/types/project.types.ts
M	frontend/src/mocks/collaboration.ts
M	frontend/src/mocks/productHandlers.ts
M	frontend/src/services/api/resourceSchemas.ts
M	frontend/tests/e2e/product.spec.ts
M	frontend/tests/integration/real-auth/browser-check.mjs
M	frontend/tests/unit/auth.test.tsx
A	frontend/tests/unit/client-preview.test.tsx
M	frontend/tests/unit/product.test.ts
```
