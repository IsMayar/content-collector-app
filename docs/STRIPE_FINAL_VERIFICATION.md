# Stripe billing — verification ledger (updated 26 November 2026)

This ledger prevents repeating Stripe Checkout or payment-failure work already performed in the sandbox. It distinguishes **real sandbox checks**, **disposable automated regressions**, and **release gates**.

## Previously exercised in the sandbox

The November Stripe testing sessions covered Solo and Agency Checkout, Stripe webhook delivery, Customer Portal, scheduled cancellation, plan-change scheduling, a simulated failed invoice and recovery reconciliation. Do **not** restart from Checkout merely to establish those routes again.

The most recent real local PostgreSQL observation was:

| Field | Observed value |
| --- | --- |
| Workspace | `9c48f67b-beaf-4a5d-82ea-885b092333d0` |
| Local DB clock | `2026-11-25 17:51:21 +04:30` |
| Workspace/subscription states | `ACTIVE` / `ACTIVE` |
| Period start | `2026-12-23 17:46:36 +04:30` |
| Period end | `2027-01-23 17:46:36 +04:30` |

The subscription starts **after** the server clock. Its effective state is read-only and project reads are denied until the period starts. The cause of Stripe's future period (for example, an advanced test clock) still requires inspecting the actual test customer. The database's `ACTIVE` label alone is not proof of current access.

**Never force the PostgreSQL period dates, change the operating-system clock, or bypass authorization to resolve this mismatch.** Reconciliation would also overwrite local-only period changes.

## Verified locally on 26 November 2026

- **Stripe CLI → Spring Boot webhook delivery passed.** The Stripe sandbox generated `invoice.paid` event `evt_1Ug2Yu8afTGwDbZqeUQOEru0` at 17:48:12 local time. The running `stripe listen` forwarding to `http://127.0.0.1:8080/api/v1/webhooks/stripe` reported **HTTP 200**. This verifies one *real sandbox-to-local* forwarded event, **not** a hosted Dashboard webhook endpoint or comprehensive retry behavior. No `invoice.payment_succeeded` status was provided for that delivery.
- **Synthetic signed webhook diagnostics passed:** `Diagnose-StripeWebhook.ps1` returned **HTTP 200** for both ignored `charge.refunded` (signature verification/transport) and a synthetic `invoice.paid` (local database event acceptance). The synthetic invoice is not a real Stripe invoice.
- **Cause of the earlier repeat HTTP 400s:** Spring Boot had been started independently of the current Stripe CLI signing-secret configuration. `Start-DevBackendWithStripe.ps1` now obtains the CLI secret in memory and supplies it to Spring Boot on startup. Also, the webhook code now distinguishes malformed/invalid requests (400) from persistence failures (server error, suitable for retry) and logs safe rejection categories.
- **Approved private export download passed:** with local private object storage initialized and the export worker enabled, the user downloaded and opened the approved-content ZIP and confirmed the approved answer `hello sir` was present. No repeat export is required just to re-prove a successful download.

Local CLI signing secrets have appeared in earlier chat/screenshots. Treat exposed sandbox signing secrets as compromised and replace them as part of security hardening; never commit or paste secrets.

## Verified by the disposable regression suite

The dedicated GitHub Actions job `Stripe and project-access regression` tests:

- Signed Stripe webhook validation, duplicate/replayed notifications, out-of-order notifications, unsupported events and id/hash conflicts.
- Price and owner validation, end-of-period subscription change scheduling in **both** paid directions, and no proration.
- PostgreSQL reconciliation of `ACTIVE → PAST_DUE → READ_ONLY → ACTIVE`, including cleared delinquency and access-lock fields on recovery.
- PostgreSQL processing of scheduled **Agency ↔ Solo** renewal changes and `APPLIED` change records.
- Cancellation retaining the paid period and then transitioning to permanent `FREE`.
- Exact seven-day grace/30-day access-cutoff policies, read-only project/export-list access, and denied reads after expiration.
- A failed provider reconciliation retaining the previous subscription state, releasing its lease and retrying before applying a verified snapshot.
- Future-dated paid periods never granting early project access.

These are **automated tests with synthetic provider data**, not claims of fresh real Stripe API acceptance. No real payment, new customer, local workspace or production billing account is touched.

## Outstanding real-world gates

1. **Existing test customer recovery:** inspect the Stripe sandbox customer's test clock and current subscription schedule, then verify application access with a paid period that actually includes the server date. Preserve historical test evidence. No new initial Checkout is required merely to repeat a prior test.
2. **Access cutoff:** an actual approved private ZIP download inside an authorized period is verified. The deadline/cutoff refusal remains verified by synthetic authorization tests, not an intentionally expired real signed URL test.
3. **Stripe sandbox end-state acceptance:** confirm the real Stripe subscription's effective plan and the app's entitlements agree after a scheduled renewal and after a final cancellation; local regression tests cover the corresponding state-machine behavior.
4. **Hosted webhook/retries:** one real Stripe CLI-forwarded `invoice.paid` delivery is verified (HTTP 200). A publicly hosted HTTPS webhook destination, Stripe Dashboard delivery history, and real retry/replay monitoring remain unverified; this local listener is not a production endpoint.
5. **Production launch:** the present `StripeBillingProvider` intentionally rejects live secret keys. Live-mode payment readiness requires a separate, explicit security and deployment review, production Price IDs, approved portal settings, an HTTPS webhook endpoint, monitoring, and a controlled launch. Do not substitute live credentials into the test-only build.

The pre-existing CI failures in `AttachmentStorageTests` are a **separate backend issue**, not a Stripe lifecycle failure.

## Practical continuation

Next inspect the existing Stripe **test customer** and its test-clock association, then check the scheduled Agency → Solo renewal when actually due. Do not repeat Solo/Agency Checkout, payment-failure simulation, approved ZIP download, or the now-successful local webhook delivery. Prepare hosted HTTPS delivery and rotate previously exposed sandbox signing secrets before a production launch. Keep sandbox and production credentials outside git and outside chats.
