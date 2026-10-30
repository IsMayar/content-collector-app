# T14 Part 1 — project-specific client access

30 October 2026. Baseline `b0e8028`. M3 In progress. This is the real read-only client access foundation, not T15–T17 response/submission workflows. Original specifications, V1–V11, templates and dependency locks are unchanged.

## Access and credential lifecycle

An existing T12 project contact is not a grant until an owner explicitly sends an invitation. V12 records access_initialized_at on that same contact; no duplicate contact, account or membership model is created. The existing fixed grant expiry is retained (default 90 days); sending another invitation never silently extends it. Revoked grants can be reissued within that expiry. Expired grants reject with GRANT_EXPIRED; a renewal API is outside this scope.

Invitations use 256-bit random credentials, SHA-256 digests in access_tokens and encrypted existing outbox payloads. They expire after seven days or the grant expiry, whichever comes first. Links use `/client/access?projectId=<uuid>#token=<secret>`. The SPA removes the fragment and requires an explicit button before POST exchange. GET never consumes a credential. Successful atomic consumption erases queued payloads and creates a distinct opaque client session. Reissue invalidates old unused invitations; current sessions remain until expiry/revocation/logout. Replacing a client session revokes its previous credential.

The host-only `__Secure-collector_client` cookie is Secure, HttpOnly, SameSite=Lax, Path=/api/v1. It has a seven-day absolute lifetime and 24-hour sliding idle limit, bounded by grant expiry. Only the existing explicitly guarded loopback development mode allows an insecure cookie. Client credentials never enter Redux, localStorage, sessionStorage, agency JWTs or logs. Client state contains only an access-blocked boolean. Exchange/logout rotate the CSRF session identifier and token. Existing CSRF, restricted CORS, exact route whitelists, no-store and no-referrer protections remain enforced.

Every client read rechecks the live scoped contact grant, workspace/project state and session under workspace/project locks. Revocation cancels all grant sessions and unused invitation deliveries atomically. Cross-project reads return 404; missing/expired/revoked access returns 401 CLIENT_ACCESS_UNAVAILABLE. Client credentials confer no agency permissions; agency JWTs confer no client access. Focus/reconnect revalidation clears client cache on 401 without clearing agency identity. Pending route changes use currentData and hide cached portal content during revalidation.

## API contracts

All paths below have prefix `/api/v1`. Unsafe requests require CSRF. Owner operations additionally require the existing agency authentication and live owner authorization.

| Method / path | Result |
| --- | --- |
| POST /workspaces/{w}/projects/{p}/contacts/{c}/invite | Idempotency-Key required; 202 `{invitation:{id,email,expiresAt,state}}` |
| DELETE /workspaces/{w}/projects/{p}/contacts/{c}/access | 204; revoke grant, sessions and unused links |
| POST /client-access/exchange | `{token}`; 200 `{projectId,expiresAt}` plus private cookie |
| POST /client-access/request-link | `{email,projectId}`; generic 202 `{message}` regardless of grant existence |
| POST /client-access/logout | 204, clears only client cookie/session; idempotent for unavailable credentials |
| GET /client/projects/{p}/checklist | `{project,sections,progress,capabilities:{canRespond:false}}` |

Public exchange is limited to 30/IP/minute; fresh-link requests to 10/IP/minute and 3/project-email/minute through existing hashed limiter keys. Existing correlation/problem response infrastructure remains authoritative. Invalid/replayed/expired invitation errors share CLIENT_ACCESS_UNAVAILABLE. Unpublished/closed issuance returns PROJECT_NOT_PUBLISHED; expired grants return GRANT_EXPIRED. Foreign owner resources remain hidden.

## Portal and scope

The existing `/client/access` and `/client/projects/:projectId` routes use the shared HTTP/RTK path with MSW explicitly off for real integration. The server supplies project-specific operational structure and stable IDs, not mutable original templates. ProjectContentPresentation is shared with authenticated owner preview and whitelists client field metadata. Disabled sections/items and unanswered conditional fields are omitted; internal notes, revision metadata, internal comments, answers and assets are excluded. All eight field types, options and repeater definitions render read-only. There are no real save, upload or submit controls and no invented saved content.

Owner issuance permits ACTIVE, PAUSED and COMPLETED projects with writable workspace/plan. DRAFT and archived/deleted projects cannot issue links. Existing sessions may read ACTIVE, PAUSED, COMPLETED and ARCHIVED projects in ACTIVE or READ_ONLY workspaces. Suspended/deleted or unavailable grants fail closed. The real HTTPS test uses a documented trusted SQL DRAFT-to-ACTIVE fixture transition: T22 publication is deliberately not implemented. Newly created DRAFT projects therefore still depend on publication before real invitation issuance.

T11 reopening remains In progress. T15–T17 must add actual answer validation, autosave/concurrency and immutable submissions; later review/T22 must preserve exact-version decisions/history. No fake persistence or future write endpoints were introduced. Real mail-provider delivery, hosted CI and production proxy/key/retention requirements remain T04–T06 gates; automated mail uses synthetic provider fakes only.

## Architecture

Backend under `com.ayaantrix.collector.clientaccess`:

```text
controller/ClientAccessController.java
service/ClientAccessService.java
service/ClientPortalService.java
repository/ClientAccessRepository.java
repository/ClientSessionRepository.java
entity/ClientSession.java
dto/ClientAccessDtos.java
security/ClientAccessAuthorization.java
security/ClientSessionCookies.java
```

ProjectContentPresentation stays in project/service. Existing ProjectAuthorization, project locks, AccountToken, encrypted delivery worker, idempotency and transactional audit are reused. No Java class is placed in a feature root. Client/anonymous audit actors have explicit scoped contact identity; anonymous fresh-link requests are never attributed as authenticated clients.

Frontend under `src/features/client` adds api/portalApi.ts, schemas/portalSchema.ts, components/PortalFoundation.tsx and store/clientAccessSlice.ts; existing pages own exchange/recovery and rendering. Existing features/clients owns agency contact management. Shared API, error and command handling remain in their existing services/shared folders. Unit tests remain tests/unit, real browser integration tests/integration/real-auth; generated artifacts stay ignored under .artifacts.

## Migration

V12__client_access_foundation.sql alone adds explicit grant initialization, project/contact scope to purpose-bound access tokens, CLIENT_INVITE encrypted outbox support, client_sessions with composite workspace/project/contact FK and unique credential digest, and narrowly constrained client/anonymous audit attribution. USER audit foreign keys remain intact. Seven-day session limits and valid timestamp ordering have database checks. V11 upgrade preserves existing records and creates no client sessions automatically. Flyway validation, Hibernate validation, restart and executable JAR packaging are exercised by backend verification.

## Verification

- Backend clean verify: **697 passed, 0 failures/errors/skips** (657 prior plus 40 T14 cases). PostgreSQL Testcontainers: one-use/replay concurrency, grant/session/state/idle/absolute boundaries, cross-tenant/project access, CSRF/CORS/rates, rollback, safe projection, unknown delivery reconciliation, migration upgrade/restart and agency separation.
- Frontend unit: **114 passed / 6 files**. Covers all field types, null answers/read-only capabilities, no credential persistence, 204 success handling, client-only cache invalidation, hash-only fresh-link navigation and cross-project stale-content prevention.
- Strict TypeScript, production build, lint and formatting passed. Existing bundle-size advisory remains nonfatal.
- Real HTTPS/MSW off: **2 passed, 0 failures/errors/skips**, including owner send, explicit exchange, secure cookie checks, wrong-project/agency denial, idle recovery, expired invitation, revocation/reload and agency-session preservation. Real portal exercised at 1440px and 360px, screenshots visually inspected; synthetic fixtures/provider/certificate only.
- Complete responsive suite: **75 passed, 0 failures** in one final run across desktop/tablet/phone. Production PWA: **1 passed**, public-only caching/offline navigation.
- T14 Part 1 and its roadmap invitation/exchange/session acceptance are Complete. M3 remains In progress. No remaining local T14 blocker; provider/deployment and later workflow dependencies above remain explicit.

Initial full backend run failed three obsolete baseline migration/closed-route expectations; these were updated without deleting cases. HTTPS readiness and same-page hash recovery exposed and fixed actual integration issues; client expiry guidance now uses its own domain message. TypeScript rejected Testing Library's unsupported exact role option; string name matching already provides exact matching, so that redundant option was removed. All final counts above come from actual completed runs.

## Reproduction (PowerShell)

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=ClientAccessTests' test
.\mvnw.cmd clean verify
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test
npm run build
npm run lint
npm run format:check
npm run test:browser
npm run test:pwa
```

Stop after any failed command (`if ($LASTEXITCODE -ne 0) { throw 'Verification failed.' }`). Existing Java21, Docker Linux engine, Node/frontend dependencies and Edge are required. Normal local setup remains backend/scripts/Initialize-Local.ps1, docker compose up -d --wait, and the documented dev profile. Never put provider/encryption credentials in source or VITE_ variables.

## Exact file manifest

Created:

- `backend/src/main/java/com/ayaantrix/collector/clientaccess/controller/ClientAccessController.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/dto/ClientAccessDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/entity/ClientSession.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/repository/ClientAccessRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/repository/ClientSessionRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/security/ClientAccessAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/security/ClientSessionCookies.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientAccessService.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientPortalService.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectContentPresentation.java`
- `backend/src/main/resources/db/migration/V12__client_access_foundation.sql`
- `backend/src/test/java/com/ayaantrix/collector/clientaccess/ClientAccessTests.java`
- `docs/T14_CLIENT_ACCESS.md`
- `frontend/src/features/client/api/portalApi.ts`
- `frontend/src/features/client/components/PortalFoundation.tsx`
- `frontend/src/features/client/schemas/portalSchema.ts`
- `frontend/src/features/client/store/clientAccessSlice.ts`
- `frontend/tests/unit/client-access.test.tsx`

Modified:

- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/AccountDeliveryOperations.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationDeliveryWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/delivery/VerificationOutbox.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/AccountToken.java`
- `backend/src/main/java/com/ayaantrix/collector/auth/entity/TokenPurpose.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/SecurityProblemHandler.java`
- `backend/src/main/java/com/ayaantrix/collector/common/repository/AuditRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/project/dto/ProjectClientDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/project/entity/ProjectContact.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectClientService.java`
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
- `backend/src/test/java/com/ayaantrix/collector/workspace/TeamCollaborationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `frontend/ARCHITECTURE.md`
- `frontend/src/app/store/store.ts`
- `frontend/src/features/client/pages/ClientAccessPage.tsx`
- `frontend/src/features/client/pages/ClientProjectPage.tsx`
- `frontend/src/features/clients/components/ProjectContactsPanel.tsx`
- `frontend/src/features/clients/schemas/clientSchema.ts`
- `frontend/src/features/clients/types/client.types.ts`
- `frontend/src/features/projects/pages/ProjectPage.tsx`
- `frontend/src/services/api/clientApi.ts`
- `frontend/src/services/api/resourceApi.ts`
- `frontend/src/services/api/resourceSchemas.ts`
- `frontend/src/shared/hooks/useCommand.ts`
- `frontend/src/shared/utils/apiError.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`

## Commits and repository state

- `2db3caa`: verified backend access/session/migration and PostgreSQL regression tests.
- `06b1ad7`: frontend integration, unit and real HTTPS browser regression coverage.
- Documentation/status: separate following commit. No push. Final working-tree state is reported after that commit.
