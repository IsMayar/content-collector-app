# M6 / T31 — Owner digest and scoped status share/embed

## Original requirements and implementation

Section22 title: **Owner digest and scoped status share/embed**. Acceptance: **Token cannot reach content or file endpoints**. Guide17.1 requires one opt-in daily workspace-timezone digest, project aliases/counts/private links, assigned-member scope and no duplicate agency item emails. Guide17.2 requires explicit neutral-alias sharing, hash-only random capabilities, expiry at most30 days, five-minute audience-restricted read JWTs held in memory, rate limits, live revocation, counts-only responses and validated HTTPS frame ancestors with ordinary-link fallback. T32+ is excluded.

The new visibility feature uses controller/service/repository/dto/security/worker subpackages. It reuses live workspace/project authorization, existing JWT signing/rotation, shared progress, immutable submission queue counts, account request limiting, the email adapter and signed webhook inbox. No duplicate account/project/submission entity, HTTP-client library or paid-provider enablement.

## API and persistence

Original catalog routes:

- `POST /api/v1/workspaces/{w}/projects/{p}/status-shares`: owner + CSRF + Idempotency-Key; `{alias,expiresAt,allowedOrigins}`.201 `{shareId,fragmentToken,url}`. Capabilities are256-bit random values shown once in a fragment URL. Only their SHA-256 hash is stored. Idempotency stores the safe share UUID only: replay returns that same ID with fragmentToken=null, never another copy of the capability. UI explains that the owner must retain the original link or revoke/create another.
- `DELETE .../status-shares/{shareId}`: owner,204; allowed even when workspace is read-only. Every previously issued read JWT is denied on subsequent reads.
- `POST /api/v1/status-shares/exchange`: explicit `{shareId,token}` body,200 `{readToken}`. Token-only, credential-free operation; only this exact public exchange is exempted from CSRF. All existing cookie-authenticated writes remain protected. Thirty exchanges/minute per hashed remote-address key.
- `GET /api/v1/status-shares/{shareId}/counts`: X-Status-Token,120 reads/minute per hashed remote-address key. Exactly `{alias,approved,submitted,requiredTotal,updatedAt}`; no project type/state/identity, answers, filenames, emails, comments, invitation links or private URLs. updatedAt reflects project/item modification time, not the read time. No-store responses and live workspace/project/share state checks on every read.

The guide specifies digest behavior but no digest REST routes in the supplied catalog. Minimal additive routes are `GET/PUT /api/v1/workspaces/{w}/digest-preferences` (own member preference, expectedVersion conflict checking), and `GET .../digest-preview` (own live-authorized preview). Preference returns enabled/version/workspace timezone/sendTime09:00. Preview returns timezone/sendTime and scoped project aliases, awaitingReview/clientAction counts and private authenticated app URLs. No arbitrary recipient IDs/emails can be submitted. A supplemental `GET /api/v1/status-shares/{id}/embed` serves the counts-only HTML required for real HTTP frame policy.

**V25__digest_and_status_shares.sql** alone adds status_shares, digest_preferences and digest_jobs: **25 migrations /47 collector tables**. V1–V24 and supplied specifications are unchanged. No raw capability/read JWT, message body or customer answers are stored in the new tables or idempotency responses. Jobs retain IDs, local date, lease/state and provider metadata only.

## Security, privacy and concurrency

Status JWTs reuse existing RS256 keys/rotation but have a distinct `:status-read` audience, share-only subject, no agency session claim and a strict five-minute expiry. Agency JWT decoding rejects them; client-cookie authorization rejects them; the status header cannot authenticate private routes. Read tokens cannot cross shares. Revocation/expiry and suspended/deletion workspace state fail closed. Workspace/project locks serialize creation, progress snapshots and revocation; duplicate creates are idempotent and failures roll back share/audit/idempotency writes together.

Origins are exact canonical HTTPS origins only, maximum10: no paths, credentials, query/fragment, wildcard or header-control characters. The standalone embed response uses validated frame-ancestors plus hash-restricted inline script/style and no-store/no-referrer. It contains no capability/content in initial HTML; fragment capture removes the fragment before exchange, and counts are rendered with textContent. Empty origin lists deny framing. Private Spring responses keep X-Frame-Options DENY and frame-ancestors none. Vite dev/preview pages also deny framing; only the dedicated backend embed path is exempt. Generated embed code includes an ordinary status-link fallback.

The public React reader uses the existing RTK/base-query transport in a route-confined credential-omitting status mode; no agency header/refresh or client-session identity is used. Tokens live in component/Redux memory only, with no persistent browser storage or devtools. Cache state is cleared on reader unmount. StrictMode fragment capture uses the router snapshot before removing browser history. A failed/revoked refresh clears displayed counts and shows a generic safe error.

## Digest delivery

Each active member owns an opt-in preference; default off. The UI shows09:00 in the workspace timezone and previews only live authorized projects. Owners receive their eligible workspace projects; other members receive only currently assigned ones, independently of review/export action flags. Summaries use neutral active share aliases or neutral Project/UUID prefixes, pending review counts including optional submitted items, visible required client-action counts and private authenticated app links. Client reminders/password-reset/invitation emails are independent. No separate agency item-level activity email path existed; T31 adds only digest delivery and no duplicate item notifications.

Digest jobs are durable PostgreSQL rows unique by workspace/member/local date. Java ZoneId scheduling follows the workspace local date/time. Claims use short SKIP LOCKED transactions and leases; authorization/preference/project scope is rebuilt immediately before dispatch. Expired unprepared leases can recover safely; prepared/possibly sent abandoned work becomes UNKNOWN and never blindly requeues. Stale previous-day jobs cancel rather than produce a backlog. Empty scope, revoked/disabled membership and opt-out cancel unsent work. Concurrent worker instances cannot duplicate the same daily job. Provider I/O is outside database transactions; as with existing T26, a revocation after preparation cannot recall an already in-flight external email.

The existing email adapter gets a distinct collector_digest_id tag while preserving the old reminder tag by default. Only verified signed callbacks may bind that exact prepared digest ID/provider/recipient. Existing verified inbox replay handles early callbacks; known receipts resolve UNKNOWN without sending again. Bounce/complaint disables that member's digest preference. If evidence remains unavailable or the account recipient changed, fail closed and hold UNKNOWN for investigation. Acceptance does not claim delivery.

DIGEST_WORKER_ENABLED defaults false and additionally requires the existing approved email adapter configuration. Saving a preference does not enable a provider. APP_BASE_URL supplies private links. Existing production email/domain/webhook and other provider/storage/device gates remain open.

## Actual verification — 4 November2026

- Initial Java quoting mistakes were fixed before the clean focused run. **12 focused cases passed**; the prepared-crash case passed separately; **8 affected digest/receipt cases passed**, including existing T28 signed-receipt regression. These cover14 distinct new T31 cases plus1 existing receipt case.
- **28 distinct affected frontend checks passed**:4 public-reader/privacy/credential-boundary cases,22 shared transport cases and2 mock share/revocation/optional-digest cases.24 unrelated mock tests were deliberately filtered out. The4 reader tests passed again with StrictMode coverage after the browser finding.
- Final strict TypeScript/production build, all14 changed-file ESLint and Prettier checks passed. One earlier browser-runner lint formatting issue was corrected without weakening assertions. The existing greater-than500kB bundle warning remains.
- **1 final real HTTPS/MSW-disabled journey passed**, including actual digest opt-in/private preview and one-time fake-provider dispatch, anonymous counts, approved iframe rendering, blocked unapproved origin, private-page headers and immediate owner revocation. Initial reader failure exposed fragment loss during repeated initialization; fixed and regression-tested. A second attempt passed reader/embed checks but exposed a test-clock advance beyond the owner's idle session; corrected the fixture and used normal auth readiness before revocation. No sleeps, inflated timeouts or weakened security assertions. Log: backend/target-t31-browser-final.log (ignored).
- The single full `backend/ .\mvnw.cmd clean verify` passed **1063 tests,0 failures/errors/skips**, including Flyway fresh/upgrade/restart, Hibernate validation and executable JAR packaging (target-t31-verify.log, ignored). This includes the1041 T29 baseline,8 T30 additions and14 initial T31 additions.
- After the full run, pending-review counting was corrected to reuse SubmissionRepository.queueCount, including optional current submissions. The existing daily-dispatch case passed with the correction; the new optional-item fixture initially failed because its schema JSON still marked the item required. Correcting the fixture to synchronize its relational/JSON flags produced a passing targeted verify and final JAR packaging. This adds a15th T31 case; no subsequent one-shot1064-case full run is claimed. Final mocks/build/lint also passed after the same count correction.
- Unrelated responsive/PWA/paid-provider checks, physical devices and external hosts such as Notion were not tested. No Docker restart or unchanged worker-image rebuild. Local controlled HTTPS ancestor compatibility passed; selected external host compatibility remains a deployment gate, with fallback link provided.

## Deployment requirements and remaining gates

Keep DIGEST_WORKER_ENABLED and production email disabled until the existing provider/domain/webhook gates pass. Set APP_BASE_URL to the actual HTTPS frontend. The production frontend host must send X-Frame-Options DENY, CSP frame-ancestors none and Referrer-Policy no-referrer for ordinary/private documents. Proxy the dedicated backend embed path without overriding its validated per-share CSP or adding DENY there; preserve all other API security headers. Production frontend-host/header and specific external embed-host compatibility were not deployed/verified in this task. Capabilities are intentionally unrecoverable; retain the once-shown link securely for sharing/revocation, and never log request bodies/tokens.

**T31 Complete for original-roadmap local acceptance; M6 In progress.** No outstanding local implementation blocker. Production email, deployed frontend headers and selected external-host compatibility remain open release gates, alongside all prior production/storage/device gates.

## Exact files

- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/auth/security/AccessTokens.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/controller/EmailWebhookController.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/EmailSender.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/ResendEmailSender.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/controller/DigestController.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/controller/StatusShareController.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/dto/VisibilityDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/repository/DigestRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/repository/ShareRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/security/ShareFrameHeaders.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/security/ShareOrigins.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/service/DigestService.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/service/ShareService.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/service/StatusEmbedPage.java`
- `backend/src/main/java/com/ayaantrix/collector/visibility/worker/DigestWorker.java`
- `backend/src/main/resources/application.properties`
- `backend/src/main/resources/db/migration/V25__digest_and_status_shares.sql`
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
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/T31_IMPLEMENTATION.md`
- `frontend/src/app/store/store.ts`
- `frontend/src/features/analytics/api/statusApi.ts`
- `frontend/src/features/analytics/components/AnalyticsPanel.tsx`
- `frontend/src/features/analytics/components/DigestPreview.tsx`
- `frontend/src/features/analytics/pages/StatusSharePage.tsx`
- `frontend/src/features/auth/components/AccountPanel.tsx`
- `frontend/src/features/settings/pages/SettingsPage.tsx`
- `frontend/src/mocks/commercial.ts`
- `frontend/src/mocks/productHandlers.ts`
- `frontend/src/services/api/baseQuery.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/product.test.ts`
- `frontend/tests/unit/status-sharing.test.tsx`
- `frontend/vite.config.ts`

Both original collection-file edits remain byte-for-byte unchanged and excluded. No push.
