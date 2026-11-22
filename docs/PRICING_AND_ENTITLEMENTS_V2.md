# Pricing and entitlements V2 — 19 November 2026

Status: **Local implementation and fixture acceptance complete (21 November 2026); real Stripe sandbox acceptance pending.** The approved request supersedes the commercial proposals in specification Section 18. Supplied specifications remain unchanged. Earlier progress entries below are historical; the final continuation records current results.

## Approved commercial policy (payments remain disabled)

| Policy | Free | Solo | Agency |
| --- | --- | --- | --- |
| Monthly USD | 0 | 7 | 19 |
| Active projects | 2 | 10 | Unlimited commercial count |
| Seats | 1 | 1 | 5 |
| Distinct active/reserved client emails | 5 | 50 | Unlimited commercial count |
| Storage bytes | 500,000,000 | 5,000,000,000 | 25,000,000,000 |
| Successful AI drafts/month | 0 | 50 | 200 |
| US SMS segments/month | 0 | 0 | 50 |
| Custom templates / branding | No | Private / yes | Shared / yes |
| Automated email reminders | No | Default cadence, pause/resume | Advanced existing scheduling |
| Review | Owner | Owner | Independently authorized team reviewers |
| Approved exports | JSON, Markdown | JSON, Markdown, ZIP | JSON, Markdown, ZIP |
| Analytics | Basic progress | Project | Workspace/template |

Provider availability, budgets, scanning, operational limits and authorization remain independent of commercial allowances.

## Implemented and verified so far

- Existing `StripeBillingProvider` retrieves the configured new price before creating Checkout. It requires an active test-mode, per-unit, licensed, USD monthly price with one-month interval and exact unit amount (700 Solo / 1900 Agency). Quantity transformations and customer-defined amounts are rejected. Checkout quantity remains one.
- Optional explicit legacy price mappings allow reconciliation of historical Solo 1900 / Agency 4900 prices, including archived prices backing existing subscriptions. Checkout never selects a legacy mapping. Ambiguous or malformed mappings fail closed.
- Provider reconciliation validates the expanded price's amount and billing configuration as well as the existing workspace/customer/checkout bindings. Existing webhook verification, durable reconciliation, encrypted URLs and authorization are unchanged.
- Configuration placeholders added in `backend/.env.example` and `application.properties`; actual secrets and provider enablement were not changed.
- Focused adapter fixture run: `./mvnw.cmd -Dtest=StripeBillingProviderTests test`: **7 passed, 0 failures, 0 errors, 0 skipped**. This includes the existing five cases and two additional price-validation/legacy cases. Local log: `backend/target-pricing-provider.log` (generated, not a release artifact).

## Continuation — 20 November 2026

Implemented in the uncommitted working tree:

- `PlanKey` now owns the approved commercial matrix. New workspace creation always selects permanent Free without Stripe. Existing trial records retain their original dates and resolve to writable Free at expiry; existing paid and administrative suspension behavior is retained.
- V27 permits the Free plan/state without rewriting existing rows. Clean startup/Hibernate/restart checks passed in the earlier focused foundation run. A populated V26-to-V27 migration test now proves trial, active, overdue, read-only and suspended subscription rows and workspace rows remain byte-for-byte equivalent as JSON; a second migration executes zero changes.
- Workspace-locked project and distinct normalized contact admissions, commercial storage reservations, custom-template, assignment/review, export, analytics and reminder gates are implemented. Queued AI and ZIP export work rechecks plan eligibility. Provider availability and cost limits remain separate.
- Custom template draft/create/publish operations reuse the existing schema validator and immutable version tables, with optimistic draft versions and owner/tenant/plan checks. The existing editor now reads the stored draft/version and sends expected versions.
- Cancellation reconciliation preserves a verified paid period and changes to Free only at its end. Failed-payment grace and fenced reconciliation remain in place. Paid-to-paid plan changes are **not yet implemented**.
- Pricing/onboarding/billing copy and plan types show Free $0 forever, Solo $7 and Agency $19. Billing usage now additionally reports scoped `activeProjects`, nullable `activeProjectLimit`, `clientContacts`, and nullable `clientContactLimit`. Null limits mean unlimited commercial counts; no fabricated zero count is shown when an older response omits them.

### Actual verification

These are separate focused runs, not a claim of one green full regression:

- Prior foundation run: WorkspaceFoundationTests 58 + PricingPolicyTests 3 = **61 passed**.
- Prior template run: **28 passed**, including denied Free mutations and immutable paid template versions. A later legacy-draft fallback query has not yet received its final targeted rerun.
- Export run: **16 passed, 1 failed** because a lost-acknowledgment fixture counted transaction commits. Corrected injection targets the actual READY transition. Focused rerun of that case and queued-ZIP-after-downgrade: **2 passed** (`target-pricing-export-fix.log`).
- Populated migration and billing run: **13 total, 11 passed, 1 failed, 1 error**. The failed expectation still expected READ_ONLY after confirmed cancellation; the error used an expired session after advancing 30 days. Both fixtures corrected without altering authentication. Rerun of those two plus two concurrent Free admission tests: **4 passed** (`target-pricing-quotas.log`). The populated migration itself passed in `target-pricing-migration-billing.log`.
- Latest affected frontend run: **13 billing tests passed**; TypeScript passed. Changed pricing files formatted. Production build, changed-file ESLint and final full frontend regression remain pending.

### Remaining implementation and acceptance at the 20 November checkpoint

- Server-controlled paid upgrades/downgrades with provider-confirmed effective dates, quota/feature checks and safe concurrency; corresponding billing UI. General portal subscription updates remain disabled.
- Finish the feature/worker audit, missing storage-limit/concurrency coverage, legacy fixture updates and affected frontend checks.
- Final full backend and frontend regression, final build/lint, and focused real HTTPS fixture journey remain pending. No complete pricing-V2 acceptance is claimed.
- Real Stripe sandbox Checkout/portal/webhook acceptance remains pending: no approved sandbox is configured. Local fixtures are authorized; production credentials and payments remain disabled.

No commit, push or deployment. The pre-existing client page edit remains user-owned. Original roadmap history and production gates remain unchanged.

## Final continuation — 21 November 2026

### Implemented behavior

- New workspaces start on permanent Free regardless of a submitted onboarding plan choice. No card, Stripe customer, automatic trial or fabricated expiry is required. Existing trial dates and paid records are retained; expired legacy trials and verified period-end cancellations resolve to writable Free. Administrative suspensions and failed-payment grace/read-only recovery remain enforced.
- Commercial admissions use the workspace lock: DRAFT/ACTIVE/PAUSED project counts, distinct normalized active/unexpired project-contact emails (including reserved pre-invitation contacts), storage used plus reservations, and active/reserved seats. Duplicate contact emails across projects consume one slot. Existing over-limit data/members are retained; new restricted admissions are denied.
- Paid-only templates, Agency template sharing/assignments/delegated review, export formats, analytics tiers, automatic email cadence and AI/SMS allowances are enforced server-side. Queued jobs recheck eligibility; no provider is enabled merely by a commercial allowance. Free owner review and approved JSON/Markdown exports remain available.
- Custom-template writes reuse the existing immutable template-version tables and schema validation. Draft optimistic versions prevent overwrites. Original supplied templates are unchanged.
- Branding is an entitlement flag. The existing logo control is **demo-only**, now unavailable on Free in both the UI and mock mutation handler. No real logo-upload/mutation API existed; this task does not claim a production branding upload service or expose private assets as public logos. Paid demo controls are preserved.
- Paid changes use verified Stripe subscription schedules at the next renewal, with no immediate proration. The current paid plan remains effective until a verified paid provider snapshot activates the target. Downgrades check projects, distinct contacts, storage including reservations, seats, assignments and advanced reminder policies. Pending downgrades reserve lower admission limits to prevent concurrent additions exceeding the target.
- One durable pending operation per workspace, stable provider idempotency keys, a 90-second lease and workspace-scoped transactions protect retries. Unknown outcomes retain the intent; the owner can retry confirmation using the same stored operation. Retries older than 23 hours, ownership changes, or unsupported negotiated Stripe phase terms fail closed for operator reconciliation. Never create a replacement schedule to resolve an unknown outcome blindly.
- Verified cancellations mark pending changes CANCELLED without applying their target. Reconciliation cannot remove members/data or lift administrative suspension. Portal subscription updates remain disabled; payment methods, invoices and period-end cancellation use the existing validated portal.
- Pricing, billing, onboarding, notices, schemas and fixtures now show Free $0 forever, Solo $7/month and Agency $19/month. Historical subscribers keep provider-confirmed prices until changed. No automatic-trial messaging remains for new accounts.

### Contracts and migrations

- Existing Checkout, portal, webhook, subscription and usage routes are retained.
- `POST /api/v1/workspaces/{workspace}/billing/plan-change`: owner/session/CSRF protected; `Idempotency-Key` plus `{planKey: "SOLO" | "AGENCY", effectiveAt: <exact current renewal timestamp>}`. Returns `{planKey, effectiveAt, state}` only after provider confirmation. Free is reached by period-end cancellation, never Checkout or a paid schedule.
- `POST /api/v1/workspaces/{workspace}/billing/plan-change/retry`: owner/session/CSRF protected, JSON `{}`; reuses the stored actor-bound key and intent. No tokens or internal keys are returned.
- Subscription response adds nullable `pendingChange: {planKey, effectiveAt, state}`. Usage adds project/contact counts and nullable unlimited limits. Workspace entitlement flags expose capabilities without replacing live authorization.
- V27 adds FREE plan/state constraints without rewriting historical rows. V28 adds `billing_plan_changes` and its one-pending-operation index. V29 adds CANCELLED to its allowed states. V1–V26 were not edited; V28 was preserved after its initial test application, with cancellation added in V29.
- Populated V26 → V29 upgrade, unchanged legacy row contents, validation, clean startup and restart are covered by the passing tests. No user's live database was reset or migrated manually during verification.

### Final verification evidence

All calls used local fixtures; no paid provider credentials were enabled.

| Verification | Actual result |
| --- | --- |
| Initial full backend regression | 1,108 total: 1,070 passed, 9 failures, 29 errors; obsolete trial/paid fixture and migration/count expectations corrected |
| Corrected focused backend run | 79 total: 77 passed, 2 failed (stale restart migration count and obsolete profile selector) |
| Subsequent billing/restart/browser run | 16 total: 15 passed, 1 failed (obsolete billing heading/refresh selectors) |
| Final full backend `mvnw.cmd verify` | **1,108 passed; 0 failures/errors/skips**, executable JAR packaged; `backend/target-pricing-final-backend.log` |
| Focused real HTTPS `RealAuthenticationBrowserCheck#realHttpsBillingWithoutMocks` | **1 passed**, MSW disabled; new Free workspace → fixture Checkout replay → signed webhook → reconciliation → paid UI/portal; `backend/target-pricing-https.log` |
| Full frontend regression | **262 passed across 24 files**; `frontend/.artifacts/pricing-final-tests.log` |
| Final billing/settings checks after Free demo-logo visibility change | **22 passed**; `frontend/.artifacts/pricing-settings-tests.log` |
| Final TypeScript and production build | Passed; existing >500 kB chunk warning only; `frontend/.artifacts/pricing-final-build.log` |
| Changed-file ESLint / Prettier | Passed; pricing-lint.log / pricing-format.log under frontend/.artifacts; unrelated client-page edit excluded |

The full backend run includes provider price/schedule validation, Free/legacy lifecycle, populated migrations, project/contact concurrency, storage reservation and quota behavior, immutable templates, team authorization, webhook reconciliation, retry persistence and cancellation. The HTTPS check uses a local provider fixture; it does not prove Stripe-hosted Checkout, actual subscription schedule transitions or production webhook delivery.

### Remaining external acceptance and preserved work

- Configure an approved Stripe test account and $7/$19 prices per `STRIPE_SANDBOX_SETUP.md` before real hosted acceptance. Validate schedule transitions, legacy-price reconciliation, payment failures and period-end cancellation in that sandbox. Production payments stay disabled.
- Original production/provider/device/accessibility/staging gates remain open; no roadmap milestone was closed by this pricing work. Unrelated responsive/PWA/device suites were not repeated.
- A provider intent older than the retry window or with unsupported financial phase terms requires explicit operator reconciliation. It is retained, not discarded or replaced.
- Protected SHA-256 values remain unchanged: ClientAnswerController `671023385490849D05B93CA3447F17A7E34D69D7B2CE34494215CE751309331B`; ClientAnswerRepository `33C660007381630D3730E7791FE885FAACD40A0C2B929AB82D68986BEF1FC1B2`; existing ClientProjectPage edit `D10B8E6F20C82A96737AE59CAB6EE6891A7A6676DE9B171931074FBAB759C793`.
- Work remains uncommitted. No push, deployment, secret change or real charge.

## Exact pricing continuation file inventory

Includes preserved pricing changes from the interrupted implementation and this continuation. Excludes the pre-existing, unchanged-by-this-task ClientProjectPage edit. Paths are repository-relative.

- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/src/main/java/com/ayaantrix/collector/ai/security/AiAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/service/AnalyticsService.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/repository/AttachmentRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/controller/BillingController.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/dto/BillingDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/repository/PlanChangeRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/service/BillingProvider.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/service/BillingService.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/service/StripeBillingProvider.java`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientAccessService.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/java/com/ayaantrix/collector/export/service/ExportService.java`
- `backend/src/main/java/com/ayaantrix/collector/export/worker/ExportWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/project/security/ProjectAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectAssignmentService.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectClientService.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectLifecycleService.java`
- `backend/src/main/java/com/ayaantrix/collector/project/service/ProjectService.java`
- `backend/src/main/java/com/ayaantrix/collector/reminder/service/ReminderService.java`
- `backend/src/main/java/com/ayaantrix/collector/sms/repository/SmsRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/template/controller/TemplateWriteController.java`
- `backend/src/main/java/com/ayaantrix/collector/template/dto/TemplateWriteDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/template/repository/TemplateWriteRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/template/service/TemplateCatalogService.java`
- `backend/src/main/java/com/ayaantrix/collector/template/service/TemplateWriteService.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/dto/WorkspaceDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/entity/PlanKey.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/entity/WorkspaceSubscription.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/service/PlanEntitlements.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/service/WorkspaceService.java`
- `backend/src/main/java/com/ayaantrix/collector/workspace/service/WorkspaceTeamPolicy.java`
- `backend/src/main/resources/application.properties`
- `backend/src/main/resources/db/migration/V27__permanent_free_plan.sql`
- `backend/src/main/resources/db/migration/V28__scheduled_plan_changes.sql`
- `backend/src/main/resources/db/migration/V29__cancelled_plan_changes.sql`
- `backend/src/test/java/com/ayaantrix/collector/attachment/AttachmentStorageTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `backend/src/test/java/com/ayaantrix/collector/billing/service/StripeBillingProviderTests.java`
- `backend/src/test/java/com/ayaantrix/collector/clientaccess/ClientAccessTests.java`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectClientPreviewTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectFoundationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/project/ProjectStructureTests.java`
- `backend/src/test/java/com/ayaantrix/collector/submission/SubmissionTests.java`
- `backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/PricingPolicyTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/TeamCollaborationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/PRICING_AND_ENTITLEMENTS_V2.md`
- `docs/STRIPE_SANDBOX_SETUP.md`
- `docs/T32_IMPLEMENTATION.md`
- `docs/T33_IMPLEMENTATION.md`
- `frontend/src/features/billing/api/billingApi.ts`
- `frontend/src/features/billing/components/SubscriptionNotice.tsx`
- `frontend/src/features/billing/components/WorkspaceBillingNotice.tsx`
- `frontend/src/features/billing/pages/BillingPage.tsx`
- `frontend/src/features/billing/types/billing.types.ts`
- `frontend/src/features/public/pages/PricingPage.tsx`
- `frontend/src/features/public/publicPlans.ts`
- `frontend/src/features/settings/pages/SettingsPage.tsx`
- `frontend/src/features/templates/components/TemplateEditor.tsx`
- `frontend/src/features/workspace/pages/OnboardingPage.tsx`
- `frontend/src/features/workspace/types/workspace.types.ts`
- `frontend/src/mocks/collaboration.ts`
- `frontend/src/mocks/commercial.ts`
- `frontend/src/mocks/productDb.ts`
- `frontend/src/mocks/productHandlers.ts`
- `frontend/src/services/api/resourceSchemas.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/billing.test.tsx`
