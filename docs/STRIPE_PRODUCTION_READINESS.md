# Stripe production readiness — 27 November 2026

Sandbox flows and the existing December 23 scheduled change are preserved. No Stripe customer, subscription, schedule, test clock, runtime secret or deployment was changed by this task. Production activation remains blocked by external launch resources.

## Runtime contract

- Default `BILLING_MODE=SANDBOX`, `BILLING_LIVE_ACTIVATION=false`. Existing `STRIPE_SECRET_KEY` must be a test key; `STRIPE_WEBHOOK_SECRET` belongs only to the sandbox endpoint/CLI.
- Live deployments require `BILLING_MODE=LIVE`, `BILLING_LIVE_ACTIVATION=true`, `BILLING_ENABLED=true`, `BILLING_WORKER_ENABLED=true`, separate `STRIPE_LIVE_SECRET_KEY=sk_live_...` and `STRIPE_LIVE_WEBHOOK_SECRET=whsec_...`. The live signing secret must differ from the sandbox signing secret. Never put secrets in Git, image layers, command arguments, frontend variables or logs.
- Supply environment-specific `STRIPE_SOLO_PRICE_ID`, `STRIPE_AGENCY_PRICE_ID`, `STRIPE_PORTAL_CONFIGURATION_ID` and optional legacy price mappings through the deployment secret/config store. Live startup retrieves both prices and the portal configuration: prices must be active USD monthly licensed per-unit $7/$19 in the selected mode; portal must permit payment updates, invoice history and period-end cancellation, with subscription updates disabled. Bad credentials, unavailable Stripe, incorrect mode/resources or unsafe origin fail startup. Legacy mappings remain reconciliation-only and are validated when used.
- `APP_BASE_URL` must be the single approved HTTPS frontend origin, without credentials, path, query or fragment. Live rejects loopback, IP literals and local/test domains. Domain ownership, DNS and TLS validity require deployment verification.
- Keep only the selected environment's configuration in each deployment. Never reuse a database with sandbox billing bindings for live customers. Back up the database and reconcile a deliberate environment migration before activation; switching modes is not a data migration.

## Webhooks and reconciliation

Configure the hosted HTTPS `/api/v1/webhooks/stripe` endpoint in the same Stripe environment with Checkout completion, subscription lifecycle and invoice paid/payment-failed events. Retain raw bytes through the proxy; do not transform or log request bodies, signatures or credentials. Match the adapter's pinned API version (`2026-10-28.endive`) when provisioning the endpoint and verify compatibility before version upgrades.

The webhook verifies HMAC and timestamp tolerance, requires explicit matching boolean `livemode`, commits its durable event record before acknowledgment, and never grants entitlements from payload claims. Malformed/signature/mode failures return 400; persistence failures remain 5xx for retry. Duplicate events and stale delivery order use existing persistence and current-provider reconciliation. Existing account leases expire after restart; failed reads retain the previous state and retry after five minutes. Successful reads also reconcile periodically. Do not cap retries by discarding billing accounts.

Monitor `billing_accounts.failure_code`, overdue `next_reconcile_at`, expired leases, event arrival and reconciliation lag, unexpected 4xx/5xx counts, provider API failures, and stale REQUESTED plan changes. Alert when lag exceeds two retry intervals. Diagnose using request correlation IDs and safe error categories, not payloads. Confirm the worker is running after each deployment; live startup refuses a disabled worker. Sandbox workers remain an explicit opt-in.

## Deployment and rollback

No hosted deployment provider is configured. Use the existing executable Spring Boot JAR and built frontend behind an approved HTTPS ingress; no new infrastructure framework is required. Route `/api` to the backend and preserve raw webhook bytes. Restrict direct backend access to the ingress, sanitize forwarded headers at that boundary, and enable the application's secure cookie/CORS settings for the approved origin. Do not trust arbitrary forwarded hosts or derive billing return URLs from requests. Keep management endpoints private and health responses minimal.

Before release: provision production PostgreSQL and private storage, verify backups with an actual isolated restore, retain encryption/signing keys, validate migrations against a restored copy, and take a recoverable backup before migration. Never edit applied migrations or automatically roll schemas back. Deploy one compatible artifact with the required worker enabled. Check readiness and reconciliation before admitting traffic. Roll back only to a schema-compatible artifact; if incompatible, stop mutations and follow the tested restore/recovery procedure. Never restore stale subscription state as a substitute for provider reconciliation.

Rotate the previously exposed local signing secret: stop the old CLI listener and revoke/re-authorize its CLI credential/session in Stripe, obtain the replacement listener secret privately, update ignored runtime configuration and restart the backend. Verify that the old secret is rejected and a newly signed event succeeds. This task did not rotate it because invalidating an active shared CLI credential could disrupt ongoing work. For hosted endpoints use Stripe's controlled secret rollover, update the secret store and deploy coherently; this application accepts one selected secret, so coordinate cutover/retries rather than assuming dual-secret support. Never print either secret.

## Functional audit and evidence

Existing owner authorization, CSRF, fixed allowlisted hosted redirects, durable idempotent operations, exact-renewal schedules, quotas and provider-confirmed grants are unchanged. The billing status return view now polls every five seconds and refreshes on focus so reconciliation can update the displayed plan; redirects alone still grant nothing.

Focused verification: mode/provider/webhook suite 22 passed; two later live-provider cases passed after their origin fixture was corrected; frontend billing 23 passed, TypeScript and changed-file ESLint passed. The ledger preserves the intervening JVM attachment and fixture failures. No Checkout repetition, new customers, clock changes, migration runs, full regression or paid transaction was required for these changes.

## External launch gates

- Approved live account, distinct live keys/prices/portal and secret-store provisioning; billing remains sandbox locally.
- Verified production domain, HTTPS ingress/public webhook endpoint and actual Stripe-hosted delivery/retry evidence.
- Monitoring/alerts, tested backup restore, operational secret rotation and controlled activation approval.
- The existing December 23, 2026 renewal has not occurred; verify post-renewal provider/application agreement when due without advancing its clock.

Sandbox implementation is preserved. Production mode code is prepared but has only synthetic verification; hosted deployment and live activation are not complete.
