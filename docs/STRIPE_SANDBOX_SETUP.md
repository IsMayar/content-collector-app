# Stripe sandbox setup — pricing V2

Real-account acceptance is **pending**. The user authorized local fixtures; no Stripe credentials or new Price IDs are currently configured for this task. Do not enable billing or paid providers merely to run fixture tests.

After an approved sandbox is available, keep configuration in ignored `backend/.env`:

- `STRIPE_SECRET_KEY`: approved test-mode key only.
- `STRIPE_WEBHOOK_SECRET`: the sandbox endpoint's signing secret.
- `STRIPE_SOLO_PRICE_ID`: active USD 700-cent monthly recurring licensed/per-unit price.
- `STRIPE_AGENCY_PRICE_ID`: active USD 1900-cent monthly recurring licensed/per-unit price.
- Optional `STRIPE_LEGACY_SOLO_PRICE_ID` / `STRIPE_LEGACY_AGENCY_PRICE_ID`: historical 1900/4900-cent USD monthly licensed prices, for reconciliation only. All IDs must be distinct. Leave unused mappings empty.
- `STRIPE_PORTAL_CONFIGURATION_ID`: sandbox configuration with subscription updates disabled and cancellation only at period end.
- `APP_BASE_URL`: the approved fixed HTTPS frontend origin.

Do not modify an old price or replace its historical mapping with a new price. New Checkout retrieves and validates its configured price before creating a session. Invalid price configuration produces the existing safe `BILLING_UNAVAILABLE` response; no price details or secrets are exposed to clients.

Fixture verification (no provider calls):

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=StripeBillingProviderTests' test
```

The adapter retains the existing pinned Stripe API version. Price fields are documented by Stripe's [Price API](https://docs.stripe.com/api/prices/object) and [retrieve-price endpoint](https://docs.stripe.com/api/prices/retrieve). Local pricing V2 fixture acceptance passed; real-account response compatibility, hosted flows, subscription schedules and webhook delivery still require sandbox acceptance. See `PRICING_AND_ENTITLEMENTS_V2.md` before enabling it. Direct portal subscription updates must remain disabled; the application schedules validated paid changes at renewal. Unsupported negotiated phase terms require operator review rather than silent replacement.
