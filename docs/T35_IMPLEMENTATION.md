# T35 — Rate limits, accessibility and full isolation regression

The original roadmap places T35 in **M7 Public MVP release**. Section 22 requires A01–A31 to pass in staging. Sections 5.5, 8 and 21 define accessibility, security and test expectations. The project owner authorized local verification with the existing fixtures while staging is unavailable. T36 backup and restoration, production model evaluation, deployment and physical-device release checks have separate gates.

## Implementation

- Login now applies the existing configured per-minute limit to both the server-observed remote address and the normalized email. The target check runs before credential verification for every submitted email, including unknown accounts. It reuses the PostgreSQL limiter and its hashed key storage, window rollover and existing 429 problem with Retry-After. This covers attempts spread across addresses and case variants. Authentication, session and tenant authorization continue through the existing checks.
- Shared authentication fields use unique IDs to associate labels, hints and errors with their inputs. Password visibility controls expose their target input and action through accessible attributes. The browser regression checks keyboard activation, focus restoration, modal containment and responsive layouts.
- Acceptance assertions exercise client-only credentials against agency exports, an assigned member’s ability to read and comment without review authority, grant revocation before new download signing, visibility-aware reminder counts and resuming a schedule without replaying its backlog.
- There are no new routes, tables, migrations or dependencies. The existing login route can return its existing 429 response when either budget is exhausted.

## Local A01–A31 evidence

Pass means the named behavior was verified with local PostgreSQL, a provider fixture or a browser check. All rows retain the staging requirement.

| Case | Local result | Evidence |
| --- | --- | --- |
| A01 | Pass | All three project types publish with independent snapshots and use the same exact-revision review workflow. |
| A02 | Pass | Cross-tenant project and attachment requests fail without project data or signed URLs. |
| A03 | Pass | Unassigned members cannot list or read workspace projects. |
| A04 | Pass | Assigned member without review permission can comment and read the thread, and cannot decide a review. |
| A05 | Pass | Client projections omit internal comments and a client cookie cannot authorize agency exports. |
| A06 | Pass | GET at the exchange endpoint leaves the issued invitation unconsumed. |
| A07 | Pass | Concurrent exchanges have one winner. |
| A08 | Pass | Revoked grants fail portal, submission, AI and new download checks. Queued work respects live eligibility. |
| A09 | Pass | PostgreSQL draft race has one winner. Autosave conflict tests preserve local input. |
| A10 | Pass | Pending uploads and stale schema versions block submission. |
| A11 | Pass | Concurrent review decisions have one winner. |
| A12 | Pass | Publishing a new template version leaves existing snapshots intact. |
| A13 | Pass | Hidden answers remain stored but leave progress and reminder counts and are excluded from export. |
| A14 | Pass | Active SVG is rejected, safe SVG is attachment-only and mismatched signatures are rejected. |
| A15 | Pass | Reusing a staging upload capability cannot change canonical bytes. |
| A16 | Pass | Concurrent reservations cannot exceed storage quota. |
| A17 | Pass | Scanner outage leaves the asset unavailable and releases quota after bounded retries. |
| A18 | Partial | Local structured-output validation rejects unsupported fact attribution. Semantic factual grounding of the deployed model remains pending. |
| A19 | Pass | AI acceptance rejects a newer draft version. |
| A20 | Pass | Submitted items alone do not trigger client reminders. |
| A21 | Pass | Resuming the local scheduler does not replay missed occurrences. |
| A22 | Pass | Calendar fixtures verify DST gaps and overlaps, weekends and recipient time zones. |
| A23 | Pass | Signed duplicate STOP callbacks preserve suppression. |
| A24 | Pass | Ambiguous delivery remains UNKNOWN without a blind resend. |
| A25 | Pass | Friction tests account for open windows and sample exclusions. |
| A26 | Pass | Approved exports preserve their manifest across reopening and report older snapshots. |
| A27 | Pass | Expiry and live revocation stop share reads. Share credentials cannot authorize private routes. |
| A28 | Pass | Checkout return parameters and hosted session creation cannot activate entitlements. |
| A29 | Pass | Duplicate and old events reconcile against current provider fixture state with one effect. |
| A30 | Pass | Read-only and quota limits preserve eligible reads, exports and unrelated manual collection. |
| A31 | Pass | Production Edge check verifies logout, cache isolation and safe offline reopening with a synthetic session. |

## Verification

- Focused rate limit run passed 2 tests. Two targeted regression batches passed 65 and 16 tests. Follow-up runs passed 10 tests, all 8 final review permission cases and all 3 final export, download and reminder boundary cases. These counts include reruns of affected cases. The last targeted verify packaged the executable JAR. Backend evidence is in the ignored `backend/target-t35-*.log` files.
- Frontend passed 30 auth tests, 17 autosave tests and the selected A28 billing test. Strict TypeScript, the production build and changed-file lint and formatting passed. The build reported the existing large-chunk warning.
- Nine Playwright checks passed across desktop, tablet and phone using the mock API boundary. One production PWA check passed for A31. Native browser zoom and assistive technology checks remain pending.
- Full backend regression, unrelated responsive tests, live provider suites and real HTTPS workflows were outside these targeted runs. No staging acceptance result is claimed.

## Changed files

- `backend/src/main/java/com/ayaantrix/collector/auth/controller/AgencySessionController.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `backend/src/test/java/com/ayaantrix/collector/submission/SubmissionTests.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/AttachmentStorageTests.java`
- `frontend/src/shared/components/FormFields.tsx`, `frontend/tests/e2e/auth.spec.ts`
- `docs/IMPLEMENTATION_STATUS.md`, this report
