# T33 — Usage UI, trial, grace and read-only states

Original milestone: **M6 — Reporting commercial readiness and visibility**. Section 22 acceptance: **Limits are disclosed and enforced server-side**. Section 18 defines the 14-day trial, seven-day grace, scheduled cancellation, and 30-day read-only access; Section 21 A30 verifies quota/read-only writes are blocked while permitted reads and exports continue.

## Implementation

- `GET /api/v1/workspaces/{workspaceId}/usage` is owner-only, uses the existing agency bearer/session authorization, and returns `{ usage: UsageSummary }` with `Cache-Control: no-store`. It reports actual used and reserved storage bytes, active members and unexpired seat reservations, AI drafts, SMS segments and current plan/trial limits. Counts are scoped to the selected workspace. Clients do not use agency seats.
- Existing reservation ledgers stay authoritative. AI uses its existing UTC calendar-month window; SMS uses the subscription period. The response adds `aiDraftsReserved`, `smsSegmentsReserved`, `aiPeriodStart`, and `aiPeriodEnd` to disclose those semantics without resetting or combining counters. Separate provider spending ceilings remain in force. No provider is enabled by a plan or usage response.
- Storage reservation checks and the displayed limit use the same minimum of the configured workspace cap and the 50 GB plan cap. Quota exhaustion does not remove files or disable unrelated manual text collection. Existing AI/SMS/seat admission policies are reused.
- Subscription state is evaluated against server time, independently of the billing worker. Manual client draft saves and checklist capabilities now honor live subscription write eligibility; existing project-level read-only responses remain unchanged. Trial, grace and scheduled cancellation stop writes at their deadline. Authorized project/client reads and approved exports remain available for the 30-day read-only window. New private attachment/export URLs cannot outlast that window or their existing shorter limits.
- After the read-only deadline, protected content and export authorization fail closed. Owner billing/usage recovery and live client notification preferences and consent withdrawal remain available. No submission, attachment, answer, or historical revision is deleted by expiration. Physical purge and public retention-policy rollout remain separate release work.
- The existing Settings → Billing/Usage routes use the real wrapped contracts and the same RTK Query transport as mocks. Usage shows actual limits, reservations, exhausted and zero allowances, and period labels. Trial, grace, scheduled cancellation, read-only and suspension notices follow server responses. Non-owners never request owner billing state; the client portal gets ordinary read-only capabilities without financial details.

No new migration or dependency. V26 remains latest; supplied specifications and applied migrations are unchanged. No T34+ work or production provider activation.

## Verification

T33 is Complete for local acceptance. M6 remains In progress; actual Stripe-account acceptance, public retention/purge operations, approved provider configurations and earlier release gates are unchanged.

- **7 new PostgreSQL usage/access tests passed** across focused/corrected runs and the full run. Earlier runs corrected the expected anonymous 403 and the fixture's required original-file flag. All 198 submission integration cases passed in the full run, including T32 billing regressions and the final project-list deadline check.
- **One real HTTPS browser journey passed** with MSW disabled and a local provider fixture: actual usage and storage-limit display, a live grace notice, expiry into read-only without a worker, and a rejected API write while usage remained available. No external Stripe payment was exercised.
- **22 distinct affected frontend tests passed** (12 billing/usage and 10 AI). Strict TypeScript and the final production build passed; the existing large-chunk warning remains informational. Changed-file ESLint and Prettier passed.
- `./mvnw.cmd clean verify` executed **1,087 tests: 1,086 passed, 1 failed, 0 errors, 0 skips**. The legacy missing-plan case expected reads with no subscription record. Its assertion now requires denial without a known access window, while preserving valid-window reads and every write-denial assertion. No production code changed after the full run. `./mvnw.cmd '-Dtest=ProjectFoundationTests#existingPlanPolicyDeniesNewWritesAndPreservesEligibleReadAccess' verify` passed **5/5** and repackaged the executable JAR. No second full run is claimed.
- Unrelated responsive, PWA, device and external-provider tests were intentionally skipped. No dependency or infrastructure rebuild was needed. Evidence is in the ignored `backend/target-t33-*.log` and `frontend/.artifacts/t33-*.log` files.
- Both original collection-file changes remain byte-for-byte unchanged and excluded. No push.

## Files changed

- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/attachment/repository/AttachmentRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/security/AttachmentAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/service/AttachmentService.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/controller/BillingController.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/dto/BillingDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/repository/BillingRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/service/BillingService.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/security/ClientAccessAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientPortalService.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/service/ClientAnswerService.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/export/service/ExportService.java`
- `backend/src/main/java/com/ayaantrix/collector/project/security/ProjectAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectService.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/ReminderService.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/service/SmsService.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/entity/WorkspaceSubscription.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectFoundationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/submission/SubmissionTests.java`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/T33_IMPLEMENTATION.md`
- `frontend/src/features/ai/components/AiAssistant.tsx`
- `frontend/src/features/billing/api/billingApi.ts`
- `frontend/src/features/billing/components/SubscriptionNotice.tsx`
- `frontend/src/features/billing/components/WorkspaceBillingNotice.tsx`
- `frontend/src/features/billing/pages/BillingPage.tsx`
- `frontend/src/features/billing/types/billing.types.ts`
- `frontend/src/layouts/AgencyLayout.tsx`
- `frontend/src/mocks/commercial.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/billing.test.tsx`
