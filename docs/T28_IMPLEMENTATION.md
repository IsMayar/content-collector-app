# M5 / T28 — Provider unknown-outcome reconciliation

## Original scope and result

Section 22 names T28 **Provider unknown-outcome reconciliation**; acceptance is **No blind retry of potentially sent messages**. Guide Sections 9/15.4 and acceptance A24 govern ambiguous email/SMS outcomes. T28 is Complete for local acceptance. M5 and existing production/device release gates remain In progress/pending. No T29 work, frontend redesign or paid service enablement.

## Implementation and contracts

Existing email/SMS sender boundaries gain read-only receipt lookup. UNKNOWN deliveries and verification messages with known provider IDs are claimed durably using PostgreSQL SKIP LOCKED, a separate 60-second lease, bounded backoff and at most eight lookups. Lookups run outside database transactions; scoped workspace/project/row locks and lease fencing protect application of results. No lookup calls send, queues a resend, refunds uncertain charges or treats missing evidence as proof of non-delivery. Separate worker instances cannot claim the same live lease. Existing verified event metadata can resolve callback-before-response races without another provider request.

New outbound email tags carry collector_delivery_id; Twilio status URLs carry an attempt UUID. Existing signature verification precedes exact attempt/channel/provider/destination binding. The Twilio query is included in the canonical signed URL; arbitrary/inbound queries remain denied. SENDING callbacks bind evidence without prematurely finishing the original send; stored evidence is applied after an UNKNOWN outcome. Duplicate receipts are idempotent. Conflicting recipient/correlation evidence returns standard problem JSON with PROVIDER_EVIDENCE_MISMATCH (400); existing request correlation remains intact.

No agency/client REST route or DTO changes. Existing email and Twilio webhook routes remain authoritative. There is no manual retry endpoint. Provider acceptance is distinct from delivery; SMS OTP evidence can mark SENT but cannot verify a phone, grant consent or enable reminders without explicit code verification. Existing STOP/suppression and quota settlement remain authoritative. Transactional metadata-only audit records record receipt binding and reconciliation; no content, tokens or provider response bodies are persisted in the new fields.

Repository/service/worker code lives under com.ayaantrix.collector.reminder.repository/service/worker. Provider adapters remain in reminder.service and sms.provider; signed callbacks remain in their existing controller/security packages. No duplicate domain entities or transport.

## Persistence and operation

V23__provider_reconciliation.sql extends reminder_deliveries and sms_verifications with reconciliation_count, reconcile_after, reconcile_lease, reconcile_until and reconciliation_failure, plus eligible UNKNOWN indexes. There are 23 migrations and 43 collector tables; no new table. V1–V22 and supplied specifications are unchanged. Durable claims survive restarts; stale leases cannot apply late results. Eight inconclusive lookups leave UNKNOWN for investigation, never resend.

PROVIDER_RECONCILIATION_ENABLED defaults false. Enable only with approved sandbox/provider credentials and receipt-read access; retain existing email/SMS approval gates. New sends include correlation metadata automatically. Legacy UNKNOWN rows without an ID or verifiable correlation remain held; unavailable, unsupported, mismatched, missing/404 and malformed receipts also remain UNKNOWN. Operators must investigate provider evidence; absence is never permission to replay.

Provider field/signature references: [Resend retrieve](https://resend.com/docs/api-reference/emails/retrieve-email), [Resend tags](https://resend.com/docs/api-reference/emails/send-email), [Twilio Message](https://www.twilio.com/docs/messaging/api/message-resource), [Twilio signature validation](https://www.twilio.com/docs/usage/security). No live provider calls were used for verification.

## Actual verification — 3 November 2026

- Initial focused run: 38 cases, 37 passed/1 error (synthetic-clock claim readiness). Correction run: 3 cases, 1 passed/2 errors (SQL parameter binding introduced during correction). Fixed the SQL and reran both affected claim cases: 2 passed. Together these cover 39 distinct affected cases, including 13 new T28 cases; this is not a one-shot focused green run.
- Final `backend/ .\mvnw.cmd clean verify`: **1030 tests, 0 failures, 0 errors, 0 skipped**, one complete green run. Preserves the 1017 baseline plus 13 additions. Flyway fresh/upgrade/restart inventories, Hibernate validation and executable Spring Boot JAR packaging passed. Log: backend/target-t28-verify.log (ignored local artifact).
- New coverage: exact receipt parsing; acceptance versus delivery; inconclusive/error/mismatch handling; lost-ID signed correlation; signature/query tampering; tenant/destination mismatch; early callback; duplicate audit; stale lease fencing; PostgreSQL exclusive claims; rollback; preserved SMS suppression/charges and explicit OTP consent.
- Java formatter applied only to task files; final git diff whitespace check performed before commit.
- Frontend tests/build/lint, real HTTPS browser, responsive and PWA suites intentionally skipped: no frontend source, user-facing API or browser workflow changes. Provider callbacks are exercised through authenticated/signed Spring integration tests and provider fakes. No claim of production provider delivery/read permissions or physical-device acceptance.
- T26's earlier non-green full-run history is unchanged. Production email/SMS/AI/storage, physical-device and all earlier release gates remain open. The two pre-existing collection-file edits are excluded and preserved byte-for-byte.

## Files created or modified

- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/reminder/controller/EmailWebhookController.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/repository/DeliveryReconciliationRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/repository/ReminderRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/DeliveryReconciliationService.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/EmailSender.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/ResendEmailSender.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/worker/DeliveryReconciliationWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/worker/ReminderWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/controller/TwilioWebhookController.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/provider/SmsSender.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/provider/TwilioSmsSender.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/repository/SmsRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/security/TwilioSignatures.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/worker/SmsVerificationWorker.java`
- `backend/src/main/resources/application.properties`
- `backend/src/main/resources/db/migration/V23__provider_reconciliation.sql`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/clientaccess/ClientAccessTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectClientPreviewTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectFoundationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectStructureTests.java`
- `backend/src/test/java/com/ayaantrix/collector/reminder/ProviderReceiptTests.java`
- `backend/src/test/java/com/ayaantrix/collector/submission/SubmissionTests.java`
- `backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/TeamCollaborationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/T28_IMPLEMENTATION.md`
