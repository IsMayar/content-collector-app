# T27 — SMS consent, verification and suppression

Original roadmap: **M5 Assistance and reminders / T27 SMS consent, verification and suppression**. Acceptance: **STOP and quiet-window sandbox cases pass**. Sections15.1,15.3 and15.4 apply. T28 provider lookup/reconciliation and later features are excluded; UNKNOWN is held without automatic resend.

## Implementation

- Client-only explicit consent captures grant/contact/project, US E.164 phone, recipient-confirmed timezone, consent text version, purpose, timestamp, verification and withdrawal evidence. Existing client-cookie/live-grant authorization and CSRF are reused. Owner preview cannot opt clients in.
- Durable encrypted six-digit verification jobs expire after10 minutes. Codes are HMAC-protected, limited to five confirmation attempts and bound to the current contact verification ID/phone. Request throttles apply per contact and destination plus a five-request/contact/day bound. A verified provider receipt is required before confirmation; ambiguous outcomes never activate consent.
- Signed STOP suppresses the destination at configured Messaging Service scope and cancels queued SMS across matching contacts. START records permission to request fresh verification; it never automatically resumes recurring messages. Consent must be captured again after STOP. HELP is recorded, with provider-managed Advanced Opt-Out replies. Email preferences remain independent.
- SMS reuses T26 policy, visibility-aware client-action count, durable reminder outbox, live project/plan/grant checks, single-use access links, leases, daily/weekly caps, privacy and audit. Disabled SMS does not block permitted email.
- SMS skips weekends and20:00–09:00 in the client's explicitly confirmed timezone, including manual-send eligibility and dispatch deferral. Timezone edits cancel/recompute queued work and update client-confirmed SMS timezone. Changed phone/sender keys invalidate old prepared recipients.
- GSM-7/extension and UTF-16 multipart segments are counted. PostgreSQL reservations atomically enforce subscription-period segment allowances and an operator-configured hard micro-USD ceiling for application-initiated sends, including verification texts. Provider-managed replies and carrier pricing require separate production cost validation. Definite unsent failures release reservations; accepted/unknown sends conservatively consume them. No automatic overage.
- Concrete Twilio Messages HTTP adapter, fixed HTTPS endpoint, bounded connect/request time and signed status/inbound callbacks. Production requires enabled flag, approved onboarding, account/service, HTTPS callback URLs, reviewed per-segment upper-bound cost and budget. All default off/zero. No paid AI/email/SMS provider was used for acceptance.

## API and database

Existing catalog routes:

- POST `/api/v1/client/projects/{p}/sms/verification`, required Idempotency-Key, `{phoneE164,consentTextVersion,consent:true}` →202 `{verificationId}`. Current consent version: `2026-11-03`.
- POST `/api/v1/client/projects/{p}/sms/verification/confirm`, `{verificationId,code}` →200 `{smsStatus:"VERIFIED_OPTED_IN"}`. Invalid code returns standard422 problem JSON after persisting the attempt; expired/stale/unavailable verification is rejected.
- DELETE `/api/v1/client/projects/{p}/sms/consent` →204; queued SMS cancelled, email unchanged.
- POST `/api/v1/webhooks/twilio/inbound` and `/status`: bounded raw form, exact canonical URL, account/service binding, constant-time Twilio HMAC-SHA1 verification over every decoded parameter, deduplicated provider events →200 `{accepted:true}`. These exact POSTs alone bypass browser CSRF. No unsigned address-based mutation.
- Existing notification preference GET/PUT now report actual SMS status and additive `smsAvailable`, `smsConsentTextVersion`, `smsUsage` fields. Existing reminder policies/preview/send/history now support SMS, with actual estimated segment count and ineligibility reasons. Existing RTK transport is retained.

V22 alone adds five scoped tables: sms_destinations, sms_consents, sms_usage, sms_verifications and sms_events; it extends T26 deliveries with SMS channel/accounting metadata. Inventory:22 migrations/43 collector tables. V1–V21 and supplied specifications remain unchanged. Java21-compatible Google libphonenumber9.0.40 is pinned for real US-region validation; `+1` alone would also admit Canada. No Twilio SDK or frontend dependency is introduced.

## Architecture and configuration

Backend `sms/{controller,dto,provider,repository,security,service,worker}` contains only concrete responsibilities. JDBC projections reuse existing contacts/projects rather than duplicate domain entities. T26 reminder repository/service/worker are extended by channel, preserving email behavior. Scoped workspace/project locks precede destination locks; claim/provider calls are separate short transactions, and cancellation accounting settles under one workspace scope.

Frontend: existing client preferences/live collection and reminders components, workspace preference types, mocks and affected tests. SMS controls stay unavailable until the backend says the provider is ready. Explicit consent is unchecked by default; real mode never displays a synthetic verification code. Confirmation/withdrawal success waits for server response.

Server-only configuration (see backend/.env.example): SMS_ENABLED=false, SMS_ONBOARDING_APPROVED=false, SMS_WORKER_ENABLED=false; TWILIO_ACCOUNT_SID/AUTH_TOKEN/MESSAGING_SERVICE_SID/INBOUND_URL/STATUS_URL; SMS_SEGMENT_COST_MICROUSD=0, SMS_MONTHLY_BUDGET_MICROUSD=0. Existing TRIAL_SMS_SEGMENTS remains conservative (maximum25), delivery encryption and token pepper are reused. SMS_WORKER_ENABLED dispatches verification jobs; existing REMINDER_WORKER_ENABLED dispatches recurring email/SMS outbox work. Do not place any credential in VITE_ variables.

Before production: approved10DLC or toll-free sender/campaign for the actual tenant model, Messaging Service Advanced Opt-Out and US geographic permissions, correct sender identification, exact HTTPS callbacks/trusted proxy setup, reviewed carrier-inclusive price bounds and real-device STOP/START/HELP/delivery acceptance. Sandbox completeness does not claim public activation.

Official references: [Twilio webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security), [Advanced Opt-Out](https://www.twilio.com/docs/messaging/services), [Google libphonenumber releases](https://github.com/google/libphonenumber/releases/tag/v9.0.40).

## Verification

-30 focused backend cases passed:14 new SMS cases plus16 existing reminder cases. Coverage includes US-versus-Canada validation, GSM/Unicode segments, DST/quiet windows, actual outbox deferral, consent/withdrawal, wrong-code persistence, grant/tenant/expiry restrictions, unknown outcomes, scoped STOP/START, signed callback deduplication, quota concurrency and transactional rollback.
-47 distinct affected frontend cases passed (7 reminder UI/contract cases,1 existing reminder mock case and39 client/submission regressions);24 unrelated cases in the filtered product file intentionally skipped. Strict TypeScript/production build and changed-file ESLint passed; existing Vite chunk-size warning remains non-fatal.
-The completed clean backend regression passed1017 tests,0 failures/errors/skips, including migrations/upgrade/restart, Hibernate validation and executable JAR packaging. One complete HTTPS/MSW-disabled lifecycle passed SMS request/confirmation/withdrawal and the existing draft/AI/upload/review/export/reopening/session journeys. Earlier browser runs passed the SMS stages but exposed a lifecycle query-version readiness race; the test now waits for authenticated bootstrap and the current version in RTK cache before capturing an action. It still requires the original200/state assertions, with no sleeps, inflated timeout or acceptance of409 as success. The completed rerun passed1 test,0 failures/errors/skips. The initial focused startup rejected an invalid test-only trial allowance (100 versus supported maximum25), corrected without relaxing the limit. Frontend test mock-mode/selector issues and a missing preview configuration constructor parameter were corrected before final verification. No full test cases ran in the compile-aborted attempt.
-Intentionally excluded: unrelated responsive/PWA suites, Docker restarts, worker-image rebuilds and real paid provider calls. T04–T06/T16/T20 and other production/device gates remain unchanged. T26's1001/1002 full run and separate corrections remain recorded, not reclassified as one green run.

T27 is **Complete for original-roadmap sandbox/local acceptance**. M5 remains In progress and T28 remains Not started. Production messaging account/sender onboarding, Advanced Opt-Out configuration, carrier/provider-generated response pricing and real-device delivery acceptance remain pending; all actual provider flags stay off. The two collection-file edits are protected byte-for-byte and excluded from this task's commit.


## Reproducible checks and file inventory

Backend: focused `./mvnw.cmd '-Dtest=SmsRulesTests,SubmissionTests#sms*+reminder*' test`; one completed `./mvnw.cmd clean verify` (an earlier compile-aborted attempt ran no tests); targeted `./mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck#realHttpsWorkspaceOnboardingWithoutMocks' test` with the corrected final complete run. Frontend: affected reminder/product cases, client-access/submission cases, TypeScript/production build, changed-file ESLint/Prettier and browser-runner lint. No broad responsive/PWA run, Docker restart or image rebuild. Generated logs remain ignored under backend/target-t27-* and frontend/.artifacts/t27-*.

Protected SHA256: ClientAnswerController `671023385490849D05B93CA3447F17A7E34D69D7B2CE34494215CE751309331B`; ClientAnswerRepository `33C660007381630D3730E7791FE885FAACD40A0C2B929AB82D68986BEF1FC1B2`.

Created:

- `backend/src/main/java/com/ayaantrix/collector/sms/controller/SmsController.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/controller/TwilioWebhookController.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/dto/SmsDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/provider/SmsSender.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/provider/TwilioSmsSender.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/repository/SmsRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/security/TwilioSignatures.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/service/SmsRules.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/service/SmsService.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/worker/SmsRunner.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/worker/SmsVerificationWorker.java`
- `backend/src/main/resources/db/migration/V22__sms_consent_and_suppression.sql`
- `backend/src/test/java/com/ayaantrix/collector/sms/SmsRulesTests.java`
- `docs/T27_IMPLEMENTATION.md`

Modified:

- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/pom.xml`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/dto/ReminderDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/repository/ReminderRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/ReminderService.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/worker/ReminderWorker.java`
- `backend/src/main/resources/application.properties`
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
- `frontend/src/features/client/components/ClientPreferences.tsx`
- `frontend/src/features/client/components/CollectionPortal.tsx`
- `frontend/src/features/reminders/components/RemindersPanel.tsx`
- `frontend/src/features/workspace/types/workspace.types.ts`
- `frontend/src/mocks/collection.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/reminders.test.tsx`
