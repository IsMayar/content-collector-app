# T26 — Reminder policy, outbox and email delivery

Original Section 22 title: **Reminder policy, outbox and email delivery**. Acceptance: **No chase when all remaining work is agency review**. Sections 15.1, 15.2 and 15.4 govern email scheduling/delivery. T27 SMS consent and T28 unknown-outcome reconciliation are excluded. Original specifications and V1–V20 remain unchanged.

## Implementation and contracts

Agency base: `/api/v1/workspaces/{workspace}/projects/{project}`. Live owner membership/session and tenant binding are checked through existing ProjectAuthorization. Writes also require a writable workspace plan.

- GET `/reminder-policy` → `{policy}`. Defaults: EMAIL offsets −3/0/+3, 10:00, weekdays, project timezone.
- PUT `/reminder-policy` accepts catalog `{rules,timezone,paused,expectedVersion}` plus optional `enabled`. Maximum five EMAIL rules, offsets −30..90, unique rule IDs, valid local times/zones. Disabling an individual rule removes it from the current rule list; historical occurrences remain. Stale policy →409 `REMINDER_POLICY_CONFLICT`.
- POST `/reminders/preview` `{contactId,channel}` → `{preview}`; no token creation/delivery. SMS previews explain `SMS_UNAVAILABLE`.
- POST `/reminders/send`, same body and required Idempotency-Key →202 `{jobId}`. Manual sends obey the same client-action, live-grant, preference, daily and weekly caps. Ineligible →409 `REMINDER_INELIGIBLE`; no fake delivery success.
- GET `/deliveries?page=0&size=20` → `{data,page:{page,size,totalElements}}`, maximum size100. No recipient address, message, raw link or private storage data is exposed.
- Client GET `/api/v1/client/projects/{project}/notification-preferences` returns `{emailEnabled,timezone,smsStatus,emailSuppressionReason}` directly; PUT `{emailEnabled,timezone}` returns `{preferences}`. Own live client cookie and normal write CSRF apply. The additional suppression reason is read-only; re-enabling preferences cannot clear a provider suppression.
- POST `/api/v1/webhooks/email` requires bounded raw payload, canonical configured endpoint, Svix HMAC-SHA256 signature and five-minute timestamp tolerance. Only this exact POST bypasses browser CSRF; it never bypasses signature validation. Metadata-only inbox deduplicates event IDs. Delivered/bounced/complained events update known provider receipts; bounce/complaint persists suppression. No address-based unsigned callback is accepted.

V21 adds `reminder_policies`, `reminder_deliveries`, `email_webhook_events`, and contact email suppression. It adds no SMS or AI persistence. Scoped FKs, occurrence uniqueness and recipient/day uniqueness protect reservations. Migration inventory becomes21 migrations/38 collector tables.

## Durability and safety

Existing visibility-aware progress supplies the actual visible required client-action count. SUBMITTED/APPROVED are not missing client work. Before dispatch, scoped workspace/project locks recheck ACTIVE project, writable plan, live grant, preference/suppression, policy version, limits and current client work. Due-date/policy/preference changes cancel queued obsolete work; final checks suppress stale in-flight claims. No submitted answer, approval, asset or historical revision is changed.

Calendar occurrences use recipient timezone when selected, otherwise policy timezone; DST gaps shift forward and overlaps choose the earlier offset. Five deliveries per project calendar week and one per recipient/channel/local day are conservatively reserved; an additional rolling24-hour guard prevents timezone-change duplicates. Week boundaries use project timezone. Scheduler scans by stable paged UUID cursor, stores occurrences durably, coalesces downtime to one useful catch-up, and retains future work. Weekend deferral preserves weekday-only rules. Daily/weekly reservations include uncertain/failed outcomes rather than permit unsafe duplicate sends.

Workers use PostgreSQL SKIP LOCKED claims,120-second fencing leases and a bounded30-second provider request. Claimed work is prepared under current scoped authorization, with a fresh single-use client invitation from the existing token service. The same encrypted message/token and delivery idempotency key are reused only for definite pre-send retries (at most three attempts, backoff). Tokens/message payloads use existing AES-GCM delivery encryption and are erased from terminal outbox rows. Link exchange remains explicit; passive email-link GETs do not authenticate. The preference link enters the same secure exchange and opens the live preferences panel.

Provider acceptance remains ACCEPTED, never DELIVERED. Timeouts, ambiguous5xx and abandoned leases become UNKNOWN and never auto-resend. Callback-before-receipt events are retained for application when the receipt commits. Provider calls occur outside database transactions; an already submitted external request cannot be recalled after concurrent opt-out/submission. This is deliberately not an exactly-once claim. Provider lookup/manual resolution of unknown outcomes remains T28.

## Configuration and production gates

Defaults keep the worker and actual email adapter disabled. Reuse existing environment initialization; never place server secrets in VITE_ variables.

- `REMINDER_WORKER_ENABLED=false`, `REMINDER_EMAIL_ENABLED=false`.
- `EMAIL_API_KEY`, verified platform `EMAIL_FROM`, `EMAIL_WEBHOOK_SECRET`, canonical HTTPS `EMAIL_WEBHOOK_URL`.
- Existing `APP_BASE_URL` must be the public HTTPS application origin; existing token-delivery encryption key is required. Trusted proxy/TLS configuration must make the callback URL equal its configured canonical public endpoint.
- Concrete Resend adapter uses the existing pinned Java21 HTTP runtime, fixed HTTPS `/emails`, per-delivery Idempotency-Key, verified current workspace-owner Reply-To, and no external SDK/dependency change. From never uses an agency-supplied domain.

Before production: verify sending domain/SPF/DKIM, provider account/sandbox, signed bounce/complaint endpoint and real deliverability. No production email or paid AI call was made. Official references: [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [Svix manual signature rules](https://docs.svix.com/receiving/verifying-payloads/how-manual).

## Verification

Focused backend checks cover calendars/DST, actual shared submitted-item progress, token privacy/single use, final lifecycle/grant/opt-out eligibility, idempotency/concurrent requests, tenant binding, CSRF/client preferences, retries/unknown leases, webhook signature/dedup/suppression, rollback, policy version/due-date cancellation, weekly caps, catch-up deduplication and definite preparation-failure retry without token leakage.19 distinct cases passed across the focused run, corrected scheduler rerun and final preparation/retry checks. Initial test failures (wrong table, unsynchronized schema fixture and backwards test clock) were corrected without weakening assertions.

44 distinct affected frontend cases passed: four reminder UI/contract cases, one existing reminder mock acceptance case,39 client access/submission regression cases.24 unrelated cases in the filtered product file were intentionally skipped. Strict TypeScript/production build and changed-file lint/format passed. Existing Vite chunk-size warning remains non-fatal.

The single `clean verify` ran1002 cases:1001 passed and one old startup inventory assertion failed (expected35 tables, actual38). Its table/migration expectations were corrected; targeted `CollectorApplicationTests verify` passed1 test and executable JAR packaging. A final preparation-failure retry guard added one essential test; targeted preparation/definite-retry `verify` passed2 cases and repackaged the final JAR. Thus1003 distinct backend cases are verified across these runs, not a claimed one-shot1003-test green run. No production implementation test failure remains. Flyway fresh/upgrade/restart checks and Hibernate validation passed in these runs.

One complete real HTTPS/MSW-disabled lifecycle passed, including client preferences, owner policy/preview/manual queue, ACCEPTED versus DELIVERED history, and existing draft/AI/attachment/review/export/reopening/session flows. The first combined browser attempt passed both reminder stages but hit an existing offline-autosave readiness race: the writer could be Saving with neither Retry nor Saved visible yet. The test now observes that valid intermediate state, still requiring terminal Saved and exact server-persisted text; the complete rerun passed. No sleep, inflated timeout or weakened final assertion was added.

T26 is **Complete for original-roadmap local acceptance**. M5 remains In progress. Live provider/domain/SPF/DKIM/webhook/deliverability acceptance remains an explicit production gate; no production email was sent. T27 SMS/T28 reconciliation are future tasks. Unrelated responsive/PWA suites, Docker restarts and worker image builds are intentionally excluded. T04–T06/T16/T20 device/production gates and AI approval gates remain unchanged.

## File inventory

New backend feature: `reminder/controller/{ReminderController,EmailWebhookController}`, `dto/ReminderDtos`, `repository/ReminderRepository`, `service/{ReminderService,ReminderCalendar,EmailSender,ResendEmailSender}`, `worker/{ReminderWorker,ReminderRunner}`. JDBC records are internal execution projections; no duplicate entities or empty security/entity packages.

Changed backend: existing client invitation token extraction, exact security route rules, application/environment examples, focused SubmissionTests, real HTTPS check, and migration-count assertions in existing auth/clientaccess/project/template/workspace tests. New `reminder/ReminderCalendarTests` and V21 migration.

Changed frontend: existing reminders panel/history, live collection/preferences/access pages, shared response validators, collaboration mocks, existing reminder mock acceptance, new `tests/unit/reminders.test.tsx` and real-auth browser runner. Existing RTK Query transport is retained. No unrelated page redesign.

Documentation: this report, implementation status, architecture, backend README and frontend/backend handoff. The two unrelated collection controller/repository changes are preserved byte-for-byte and excluded from task commits.


## Commands and evidence

Executed from backend/: `./mvnw.cmd '-Dtest=ReminderCalendarTests,SubmissionTests#reminder*' test`; corrected scheduler-only test; one `./mvnw.cmd clean verify`; corrected `./mvnw.cmd '-Dtest=CollectorApplicationTests' verify`; `./mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck#realHttpsWorkspaceOnboardingWithoutMocks' test` (initial failure and corrected full rerun); final `./mvnw.cmd '-Dtest=SubmissionTests#reminderPreparationFailureRetriesWithoutLeakingOrDuplicatingTokens+reminderDefiniteFailuresRetryButAbandonedClaimsRemainUnknown' verify`.

Frontend: filtered reminder/new-contract cases, client-access/submission tests, `npm run build` (includes strict TypeScript), changed-file ESLint and Prettier, browser-runner lint/format. Evidence logs remain ignored under `backend/target-t26-*.log` and `frontend/.artifacts/t26-*`; generated artifacts are not committed.

Protected collection SHA256 values remained:
- ClientAnswerController.java: `671023385490849D05B93CA3447F17A7E34D69D7B2CE34494215CE751309331B`.
- ClientAnswerRepository.java: `33C660007381630D3730E7791FE885FAACD40A0C2B929AB82D68986BEF1FC1B2`.

## Exact task file manifest

Created:

- `backend/src/main/java/com/ayaantrix/collector/reminder/controller/EmailWebhookController.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/controller/ReminderController.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/dto/ReminderDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/repository/ReminderRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/EmailSender.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/ReminderCalendar.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/ReminderService.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/ResendEmailSender.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/worker/ReminderRunner.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/worker/ReminderWorker.java`
- `backend/src/main/resources/db/migration/V21__email_reminders.sql`
- `backend/src/test/java/com/ayaantrix/collector/reminder/ReminderCalendarTests.java`
- `docs/T26_IMPLEMENTATION.md`
- `frontend/tests/unit/reminders.test.tsx`

Modified:

- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientAccessService.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
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
- `frontend/src/features/client/pages/ClientAccessPage.tsx`
- `frontend/src/features/reminders/components/DeliveryHistory.tsx`
- `frontend/src/features/reminders/components/RemindersPanel.tsx`
- `frontend/src/mocks/collaboration.ts`
- `frontend/src/services/api/resourceSchemas.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/product.test.ts`
