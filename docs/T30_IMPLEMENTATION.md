# M6 / T30 — Friction views and sample safeguards

## Original scope and implementation

Section 22 acceptance: **Incomplete observation windows are not called abandonment**. Guide Sections 16.1–16.3 and the supplied ProjectAnalytics/FrictionMetric/TemplateMetric contracts require current visibility-aware progress, server-timed starts, seven-day windows, minimum samples, observed first-submission duration with counts, and separate template-version/item-key/project-type comparisons. T31 sharing/digests and later features are excluded. Existing server activity, submissions, authorizations and frontend components are reused.

New read-only analytics repository/service/controller and a pure FrictionCalculator live under `com.ayaantrix.collector.analytics.repository/service/controller/dto`. Existing ProjectAuthorization and ProjectStructureRepository.progress remain authoritative. No domain entity, worker, job, persistence write or migration is added. V24 remains latest; V1–V24 and supplied specifications are unchanged.

## Contracts and metric semantics

- `GET /api/v1/workspaces/{workspaceId}/projects/{projectId}/analytics` returns **200** `{ "metrics": ProjectAnalytics }` with progress, friction[] and generatedAt. Owners or live assigned members can read it, independently of review/export flags. Missing/foreign/unassigned resources retain existing404 denial.
- `GET /api/v1/workspaces/{workspaceId}/analytics/templates` returns **200** `{ "data": TemplateMetric[] }`; workspace owners only. Assigned members receive existing403 ACCESS_DENIED. Template groups never combine different template version UUIDs, stable item keys or project types.
- Both routes require agency JWT/live session and no-store responses; client cookies alone cannot authorize them. Existing standard problem JSON/X-Request-ID, CSRF/CORS/default-deny and workspace/member/assignment locking remain unchanged. No new error state or write API.

Observations use T29's retained **rolling90-day server-receive-time cohort**, never reported client time. Only item_started events enter the calculation; test projects flagged analytics_excluded and agency preview are excluded. Starts after an item's first immutable submission are excluded from first-submission observations, so later revisions/reopens/agency approval delay are not treated as initial client delay. Historical eligible starts remain observations even if the current structure subsequently changes; current progress still follows the shared visibility evaluator.

A window closes exactly seven days after the eligible start. Open windows contribute only eligible/pending counts, never startsWithoutSubmission. A closed window counts as without submission if its first immutable submission is absent or later than the seven-day boundary; a late submission does not erase the historical seven-day signal. Percentages require at least10 eligible starts **and10 closed windows**, and divide only by closed windows. Otherwise rate=null and insufficientData=true. Durations use the earliest retained eligible start per project/item through its first immutable submission, counted once per item; median includes completed observations only and exposes completedSubmissions. No observed completion yields null, never an invented zero duration. This is an observed retained-cohort metric, not an all-time or abandonment claim.

Progress is current immediately on read and reuses the existing required/enabled/visible evaluator; zero required items are labeled No required items without division. Queries project only IDs/context and timestamps, never immutable answer/schema payloads, emails, session pseudonyms or tokens. No submissions or audit history are modified.

No aggregate history is persisted: projections are generated on read from the90-day retained source and are not archived beyond it. Raw retention remains90 days; no extra personal-data retention or aggregate store extending past the guide's12-month ceiling is introduced. This endpoint does not promise twelve-month charts or recover purged observations.

## Frontend

Feature-owned RTK Query endpoints validate the documented envelopes and metric invariants with Zod; existing Product invalidation/refetch behavior is reused. Project overview/friction use the real endpoint. FrictionTable explicitly shows closed/open counts, guarded rates and completed duration samples; empty and zero-required states are explicit. Insights adds an owner-only template comparison panel grouped by version/type, with item keys kept separate. Unavailable optional per-section breakdowns are not rendered as empty charts. No unrelated screen is redesigned, no new HTTP client is introduced, and existing T31 mock-only share controls are not implemented server-side.

Mock project analytics now use the same metrics envelope and consistent synthetic counts; the owner-only mock template route returns an empty retained-history dataset instead of inventing comparisons. Existing demo data remains explicitly synthetic.

## Verification

- Initial focused backend: **8 cases,7 passed/1 failed**, solely an expected revoked-session error name; corrected to existing INVALID_CREDENTIALS without changing security. Targeted rerun of that case passed. Thus **8 distinct T30 cases verified**:5 calculator boundary/group/median cases plus3 PostgreSQL/live-permission/immutable-submission/API cases.
- **4 affected frontend tests passed**, covering open-window suppression, denominator/sample display, invalid server metrics, empty/zero contracts. The affected existing mock analytics test passed **1 case**, with24 unrelated cases intentionally filtered out.
- Strict TypeScript/production build passed; existing bundle-size warning remains. All10 changed frontend/test files passed zero-warning ESLint. Prettier initially flagged the browser runner; formatting-only correction and its check passed, with the other9 files passing the original check. No assertions were weakened.
- **1 real HTTPS/MSW-disabled friction journey and8 shared SecurityConfigurationTests passed** in a focused Maven verify (9 tests,0 failures/errors/skips), including executable JAR packaging. The browser verified11 starts/9 closed windows produce no percentage and2 still observing, then loaded the owner-only template comparison. Existing real onboarding/client-cookie fixture steps established the test context; unrelated later lifecycle cases were not run. Log: backend/target-t30-browser.log (ignored).
- Full1041-case backend regression deliberately not rerun: production behavior is additive read-only scoped projections with no schema, persistence, transaction-framework, provider or existing authorization-rule changes. Existing SecurityConfigurationTests are included with the focused HTTPS verification for additive GET wiring. No claim that the baseline suite was executed again.
- Unrelated frontend/responsive/PWA/provider suites and unchanged infrastructure rebuilds/restarts were skipped. No paid service enabled. Earlier release/device/provider gates and all previous verification history remain open/preserved.

## Files

- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/src/main/java/com/ayaantrix/collector/analytics/controller/AnalyticsController.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/dto/AnalyticsDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/repository/AnalyticsRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/service/AnalyticsService.java`
- `backend/src/main/java/com/ayaantrix/collector/analytics/service/FrictionCalculator.java`
- `backend/src/main/java/com/ayaantrix/collector/common/SecurityConfiguration.java`
- `backend/src/test/java/com/ayaantrix/collector/analytics/FrictionCalculatorTests.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `backend/src/test/java/com/ayaantrix/collector/submission/SubmissionTests.java`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/T30_IMPLEMENTATION.md`
- `frontend/src/features/analytics/api/analyticsApi.ts`
- `frontend/src/features/analytics/components/AnalyticsPanel.tsx`
- `frontend/src/features/analytics/components/FrictionTable.tsx`
- `frontend/src/features/analytics/components/TemplateFrictionPanel.tsx`
- `frontend/src/features/analytics/pages/InsightsPage.tsx`
- `frontend/src/features/analytics/schemas/analyticsSchema.ts`
- `frontend/src/mocks/commercial.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/tests/unit/friction.test.tsx`
- `frontend/tests/unit/product.test.ts`

## Status

**T30 Complete for original-roadmap local acceptance; M6 In progress.** No outstanding local T30 blocker. Reporting is limited to retained90-day observations, not an all-time or12-month archive. Existing production/device release gates remain separate.

The original ClientAnswerController.java/ClientAnswerRepository.java edits remain byte-for-byte untouched and outside this commit. DeliveryReconciliationRepository.java had no pending edit and remains unchanged. No push.
