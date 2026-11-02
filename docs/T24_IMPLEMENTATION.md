# T24 — AI adapter, allowance reservation and job

## Original scope

The supplied roadmap places T24 in **M5 Assistance and reminders**, not M4. Its title is **AI adapter, allowance reservation and job**; acceptance is **Provider failures preserve ordinary writing**. Guide §14 defines the provider, structured result, privacy, cost and durable-job boundary. T25 exclusively owns suggestion preview/acceptance; no acceptance endpoint, answer mutation, auto-submit or approval was added.

Existing client sessions, visibility, draft versions, subscription allowances, scoped locks, audit, idempotency and RTK transport were reused. No previous review/submission/export implementation was rebuilt.

## Implemented contracts

- POST `/api/v1/client/projects/{projectId}/items/{itemId}/ai-drafts`: client cookie + CSRF + required `Idempotency-Key`; `{facts,tone,targetWords,baseAnswerVersion,consent:true}` →202 `{jobId,state:"QUEUED"}`.
- GET `/api/v1/client/projects/{projectId}/ai-drafts/{jobId}` →200 `{job:{id,itemId,state,baseAnswerVersion,result,failureCode}}`. Only the same creating contact with an active grant can read a visible item's job.
- No `/accept` route: default deny remains, with a regression assertion.

Requests require an ACTIVE writable workspace/project, project AI opt-in, visible enabled LONG_TEXT item with item AI opt-in, editable item state and exact current answer version. Facts are1–10 nonblank bullets, at most1000 characters each and5000 total; tone matches the existing UI's three choices; target30–500 words. Consent, stale versions, exhausted allowance/budget and provider availability have explicit problems. Provider availability never gates ordinary answer saving/submission.

Job outcomes are the specified QUEUED/RUNNING/SUCCEEDED/REFUSED/FAILED/EXPIRED subset. ACCEPTED belongs to T25. Results contain `draft,factsUsed,missingFacts,warnings`; schema, lengths, arrays, supplied-fact attribution and token usage are checked locally. Refusals, incomplete/invalid output, timeout, exhausted provider credit and provider errors remain explicit safe failure codes.

## Provider and privacy

`AiDraftProvider` has a concrete `OpenAiResponsesProvider` adapter using Java21's existing JDK HTTP client; **no external provider SDK/dependency was added** (SDK version: not applicable). Request schema checked against [official OpenAI structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs) and the [Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create).

The adapter sends only selected facts, selected item label/instructions, project type, tone and word target. It uses strict `text.format` JSON schema, bounded `max_output_tokens`, `store:false`, no tools, no redirects, no project/file/contact/comment history, and a fixed HTTPS Responses endpoint. System instructions treat supplied text as data and prohibit invented claims or external actions. Provider bodies are bounded128 KiB; the30-second budget includes reading the response body. At most one controlled retry follows explicit transient HTTP responses and uses the remaining same30-second budget. Timeouts/network ambiguity are not automatically resent. Provider refusals and incomplete outputs are parsed separately. This is not a promise of zero provider retention or automatic factual correctness.

No paid API call was made. Tests use a synthetic model string, a primary provider fake, and an isolated local HTTP protocol fixture. No real model name, price or account availability was guessed. Before production, configure/record an account-available strict-output `AI_MODEL`, its reviewed per-token ceilings, account privacy/credit settings and a fixed factual-grounding evaluation. The exact deployed model remains an explicit pending production setup gate.

## Persistence, allowance and durability

**V19 only** creates `usage_periods` (AI accounting columns only) and `ai_draft_jobs`, scoped FKs, constraints and dispatch/contact indexes. V1–V18 and supplied specifications are unchanged. Strict schema expectations advance to19 migrations/35 tables without weakening their assertions.

A short request transaction revalidates the live client grant and visibility, reserves one monthly draft plus worst-case cost, inserts the snapshot/job, audit and idempotent response atomically. UTC calendar-month counters use the existing plan's monthly allowance (or configured reduced trial allowance). Conditional SQL includes used+reserved drafts and cost, preventing parallel over-reservation.

Integer micro-USD/token configuration is a conservative cost ceiling, not a live price feed or customer charge. The reservation covers a UTF-8 byte upper bound plus fixed prompt/schema overhead, bounded output, and two potential calls. Successful single-call known usage releases unused reservation; attempted failures/retries/unknown outcomes conservatively retain the full cost ceiling. An attempted job consumes one draft allowance regardless of outcome; a definite cancellation before calling releases it. This can deliberately overestimate provider billing and requires operator reconciliation, never fabricated exact spend.

Workers claim with PostgreSQL SKIP LOCKED and a75-second fenced lease; calls occur outside transactions. Live grant/project/item/plan eligibility is checked before calls and before publishing a result. Already-sent external calls cannot be recalled on revocation; the result is discarded if access changes. Restart preserves QUEUED work. Abandoned RUNNING jobs settle as FAILED/AI_OUTCOME_UNKNOWN and retain the reserved ceiling, **without blind provider resubmission**. Settlement and counter reconciliation commit together and are fenced against duplicates. Model, usage, safe outcome and latency are retained as job metadata; prompts/raw results are never general-log payloads. Input/result content is purged after30 days; accounting metadata remains. No answer, immutable submission, approval or export snapshot is modified.

## Packages and setup

Backend: `com.ayaantrix.collector.ai/{controller,dto,config,provider,repository,security,service,worker}`. Only concrete responsibilities were created; the provider interface represents a real external boundary. JDBC job records are internal projections, not duplicate domain entities.

Frontend runtime code is unchanged: T25 will connect the existing mock preview/acceptance UI to the real queue shape and acceptance contract. The focused browser test uses the existing RTK transport with MSW disabled. No new HTTP client, UI redesign or frontend package reshuffle.

Server-only placeholders in `backend/.env.example` remain disabled:

```text
AI_ENABLED=false
AI_WORKER_ENABLED=false
OPENAI_API_KEY=
AI_MODEL=
AI_INPUT_MICROUSD_PER_TOKEN=0
AI_OUTPUT_MICROUSD_PER_TOKEN=0
AI_MONTHLY_BUDGET_MICROUSD=0
AI_MAX_OUTPUT_TOKENS=2048
```

Enabling AI requires nonblank model/key and positive reviewed prices/budget; invalid enabled configuration fails closed. Trial allowance remains the existing `TRIAL_AI_DRAFTS`. Existing project/item opt-ins must also be configured; no undocumented project-setting route was invented. The worker can perform retention/unknown-outcome maintenance while the provider is disabled. Secrets never belong in VITE_ variables.

## Verification

- Initial focused suite:15 passed, zero failures/errors/skips after correcting test fixture/compiler issues. This includes all three project types, ordinary writing after refusal/timeout/invalid/provider failure, atomic allowance races, idempotency, rollback, budget exhaustion, live grant/contact/tenant isolation, restart, unknown leases, retention, CSRF and explicit deny of T25 acceptance.
- Follow-up provider/ordinary-writing subset:8 passed, including exhausted provider credit; the final distinct T24 addition is16 cases.
- Local HTTP adapter tests inspect strict JSON/store=false/no-tools request shape, hostile supplied facts, unsupported fact attribution, invalid/refused/oversized/slow responses and controlled retry classification. Synthetic fixtures do not establish real-model grounding quality.
- Real HTTPS lifecycle with MSW disabled: **1 passed, zero failures/errors/skips**. It demonstrated an unchanged answer after AI_TIMEOUT, a successful subsequent manual save, and preserved review/reopening/export flows. Earlier enclosing runs failed because an unrelated working-tree edit removed the committed restoreSubmission method and generated an unresolved-compilation ReviewService class. The missing method was restored from HEAD without discarding concurrent formatting; clean compilation and the complete HTTPS rerun passed. Content-free test-only diagnostics identify root exception class/frames without logging payloads.
- Full backend `clean verify`: **971 passed, 0 failures, 0 errors, 0 skipped** in one complete regression, preserving955 baseline cases plus16 T24 additions. Fresh/upgrade/restart Flyway V1–V19, Hibernate validation and executable JAR packaging passed. Shared security/persistence changes justified this one full regression.
- The changed browser runner passed zero-warning ESLint and Prettier. Frontend application source/dependencies are unchanged, so TypeScript/build, unrelated frontend unit/responsive/PWA suites are intentionally not rerun.

Production provider/model/pricing/privacy/grounding acceptance and existing T04–T06, T16 production/storage/codec/device and T20 physical-device gates remain pending. No T25+ feature or full-MVP completion is claimed.

## Files and final status

- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
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
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `backend/src/main/java/com/ayaantrix/collector/ai/config/AiSettings.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/controller/AiController.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/dto/AiDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/provider/AiDraftProvider.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/provider/OpenAiResponsesProvider.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/repository/AiRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/security/AiAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/service/AiService.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/worker/AiWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/ai/worker/AiWorkerRunner.java`
- `backend/src/main/resources/db/migration/V19__ai_draft_jobs.sql`
- `backend/src/test/java/com/ayaantrix/collector/ai/provider/OpenAiResponsesProviderTests.java`
- `docs/T24_IMPLEMENTATION.md`

Unrelated concurrent collection-controller/repository formatting is preserved outside the T24 commit. The repository's accidentally missing committed restoreSubmission method was restored; this is preservation of T21/T22 behavior, not new T24 functionality. These two files remain unstaged.

T24: **Complete for original-roadmap local acceptance.** M5: In progress. M4 and all prior task records are preserved.
