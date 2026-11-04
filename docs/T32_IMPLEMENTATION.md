# T32 — Hosted checkout, webhook processing and portal

Original M6 acceptance (guide Section 22): **Sandbox subscription is source of entitlements**. Sections 18.1–18.2 and the supplied API catalog control the implementation. Local provider fixtures are explicitly authorized; an actual Stripe account and public paid launch are separate operational gates.

## Contracts and implementation

- Owner-only `GET /api/v1/workspaces/{workspace}/subscription` returns `{ subscription, entitlements }` with `Cache-Control: no-store`.
- Owner-only, CSRF-protected `POST .../billing/checkout` accepts only `{ planKey: "SOLO" | "AGENCY" }`; `POST .../billing/portal` accepts no payment/customer/return configuration. Both require `Idempotency-Key` and return 201 `{ url }`.
- `POST /api/v1/webhooks/stripe` verifies `Stripe-Signature` against exact raw bytes before parsing, with a five-minute tolerance and multiple v1 signatures. Only this exact POST is exempted from CSRF. Verified, relevant event IDs and body hashes are persisted before `{ accepted: true }`; conflicting reuse returns `BILLING_EVENT_CONFLICT`.
- Customer, configured price, quantity, portal configuration and fixed HTTPS return URL are server-owned. Checkout return parameters never grant entitlements. Portal configuration must disable unchecked subscription updates and allow cancellation only at period end. Extra active/reserved seats block Solo; collaborators are never removed automatically.
- The existing subscription record remains the single source used by workspace/project/client write authorization, AI and reminder allowances. Provider reconciliation verifies the server-created checkout identity, workspace/customer binding, one subscription/item, configured USD monthly price and paid invoice before paid activation. Browser destinations are limited to exact Stripe HTTPS hosts; demo redirects require explicit mock mode.

## Persistence, concurrency and failure behavior

New V26 adds billing accounts, encrypted hosted-operation intents and a minimal provider event inbox. V1–V25 and supplied specifications remain unchanged. Existing `WorkspaceSubscription` is reused; no duplicate subscription entity. A narrowly constrained SYSTEM audit actor records subscription effects transactionally without attributing provider changes to a human.

Durable account claims use expiring UUID leases. Stripe GET runs outside database transactions; applying the result locks workspace/account, rechecks the lease and uses a sequence watermark so later webhooks remain queued. A superseded worker cannot overwrite newer work. Duplicate/out-of-order notifications trigger a current-provider read, never direct event-state application; fingerprints avoid duplicate effects/audits. Periodic fifteen-minute reconciliation repairs missed events, with five-minute failure backoff. Restart preserves customers, operations and queued notifications.

Hosted mutation intents commit before provider calls. Stripe idempotency keys derive from stable server IDs; owner/session/seat scope is rechecked before returning encrypted capabilities. Failed/uncertain operations retry with the same key within 23 hours, then fail closed for operator reconciliation. One checkout intent reserves the workspace for 24 hours to prevent parallel paid subscriptions; a different plan/key receives `BILLING_CHECKOUT_PENDING`. The frontend retains retry keys in memory. Checkout URL replay lasts at most 23 hours from intent creation; portal replay lasts three minutes. Expired URLs are erased; event metadata is retained for 30 days. Operation metadata remains to authenticate subscription provenance; it contains no raw hosted URLs or payment details.

Paid periods and grace use server time. Repeated failures cannot extend the seven-day grace anchor. Expired trial/paid/grace labels are reported as READ_ONLY even if a cleanup worker is late. Remaining read-only usage presentation/enforcement belongs to T33; no T34+ work is included here.

## Configuration

Both `BILLING_ENABLED` and `BILLING_WORKER_ENABLED` default false. See `backend/.env.example`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SOLO_PRICE_ID`, `STRIPE_AGENCY_PRICE_ID`, `STRIPE_PORTAL_CONFIGURATION_ID`, and existing `APP_BASE_URL`. The adapter rejects live keys. Existing delivery encryption protects stored hosted capabilities; no dependency or frontend secret was added. Do not enable production payments without approved account/prices/configuration.

The HTTP adapter pins `Stripe-Version: 2026-10-28.endive`, uses fixed Stripe API origins, bounded responses/timeouts and no automatic POST retry or redirects. Official references checked: [subscription retrieval](https://docs.stripe.com/api/subscriptions/retrieve), [hosted checkout](https://docs.stripe.com/api/checkout/sessions/create), [portal configuration](https://docs.stripe.com/api/customer_portal/configurations/retrieve), and [webhook verification](https://docs.stripe.com/webhooks/signature).

## Verification

T32 is Complete for the explicitly approved local provider-fixture acceptance. Actual Stripe-account testing and production activation remain pending; M6 is In progress. Early verification exposed assertion compilation issues, an ambiguous browser heading selector, and PostgreSQL CASE parameter typing; these were corrected without weakening authorization or assertions.

Real Stripe sandbox checkout/payment, production providers, unrelated responsive/PWA/device suites and public-host configuration are intentionally outside this local-fixture run. All pre-existing release gates remain open.

- Focused backend: `./mvnw.cmd '-Dtest=SubmissionTests#billing*,StripeBillingProviderTests,RealAuthenticationBrowserCheck#realHttpsBillingWithoutMocks' test`: **11 PostgreSQL billing + 5 adapter tests + 1 HTTPS test passed**, no failures/errors/skips.
- Full backend: `./mvnw.cmd clean verify`: **1,080 passed**, zero failures/errors/skips; 26 migrations/50 tables, existing fresh/upgrade/restart/Hibernate checks and executable JAR packaging succeeded. This is a new full run after T31's separately verified correction.
- Frontend: `npm test -- tests/unit/billing.test.tsx`: **6 passed**. `npm run build` includes strict TypeScript and succeeded; existing large-chunk warning remains informational. Changed-file ESLint and Prettier checks passed.
- Real HTTPS: Edge + Vite + actual backend/PostgreSQL, MSW disabled. Registration/owner workspace, fake success return, idempotent hosted API, actual signed webhook ingress, reconciliation, status refresh and portal URL passed. No actual Stripe page or payment was exercised; hosted API actions used the real browser transport with a deterministic backend provider fixture.
- Evidence logs are ignored under backend/target-t32-*.log and frontend/.artifacts/t32-*.log. Neither original collection-file edit was staged or committed.

## Files changed

- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/billing/controller/BillingController.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/dto/BillingDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/repository/BillingRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/security/StripeWebhook.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/service/BillingProvider.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/service/BillingService.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/service/StripeBillingProvider.java`
- `backend/src/main/java/com/ayaantrix/collector/billing/worker/BillingWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/main/resources/application.properties`
- `backend/src/main/resources/db/migration/V26__hosted_billing.sql`
- `backend/src/test/java/com/ayaantrix/collector/CollectorApplicationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountDeliveryOperationsTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AccountRegistrationWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/IdentityPersistenceTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/PasswordRecoveryWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `backend/src/test/java/com/ayaantrix/collector/billing/service/StripeBillingProviderTests.java`
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
- `docs/T32_IMPLEMENTATION.md`
- `frontend/src/features/billing/api/billingApi.ts`
- `frontend/src/features/billing/pages/BillingPage.tsx`
- `frontend/src/mocks/commercial.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/billing.test.tsx`
