# Account delivery operations - T05 Part 4

This runbook covers only registration verification and password-reset jobs. It does not implement T06 authentication or later project reminders. There is no delivery administration HTTP endpoint, Actuator extension, development token endpoint or production provider adapter.

## Defaults and deployment prerequisites

| Environment setting | Default | Allowed values / behavior |
| --- | --- | --- |
| ACCOUNT_DELIVERY_WORKER_ENABLED | false | Explicit true creates the runner; otherwise there is no polling thread |
| ACCOUNT_DELIVERY_BATCH_SIZE | 10 | 1-50 claims per poll, sequentially in each process |
| ACCOUNT_DELIVERY_POLL_MS | 1000 | Fixed delay 100-60000 milliseconds after the previous poll completes |
| ACCOUNT_DELIVERY_SHUTDOWN_SECONDS | 10 | 1-30 seconds to drain in-flight work before interruption |

An enabled runner requires both the existing configured AES-256-GCM delivery key and an available, explicitly registered VerificationMailSender adapter. The disabled fallback advertises unavailable and causes enabled-worker startup to fail closed. Setting the flag alone cannot activate a mailbox or real provider. No new dependencies, database migration or public route were added.

The adapter must select purpose-specific verification/reset text and expiry, treat deliveryId as a stable provider idempotency key where supported, and return success only after confirmed provider acceptance. It must distinguish definite pre-send failure from potentially accepted/unknown outcomes using DeliveryFailure. Configure bounded connection/read/request timeouts shorter than the 60-second lease (for example, 20 seconds) and shorter than the chosen graceful drain interval where possible. Never log Message, recipient, link, raw token, key or provider exception content. Production/sandbox credentials and provider-specific integration remain unimplemented.

Use the stable ignored TOKEN_DELIVERY_ENCRYPTION_KEY and matching TOKEN_DELIVERY_ENCRYPTION_KEY_ID across restarts; use a secret manager outside development. Do not generate a fresh key on every launch. Key rotation with multiple simultaneously readable key IDs remains pending: retain the current key until its queued/held payloads are resolved or expire. Do not alter the key ID in stored jobs to bypass cipher checks.

## Execution and shutdown

AccountDeliveryRunner uses Spring SmartLifecycle and a private single-thread fixed-delay executor. Startup/stop are idempotent. It starts late and stops before dependencies, stops claiming immediately on shutdown, cancels future polling, allows the configured drain interval and then interrupts. A crashed or unacknowledged delivery is conservatively held after lease expiry; shutdown never resets it to QUEUED. A provider that ignores interrupts can remain in flight, so shutdown is not evidence that delivery failed.

Each dispatch reuses PostgreSQL FOR UPDATE SKIP LOCKED and the existing 60-second owner lease. Multiple processes can poll; they cannot concurrently claim the same queued job. Acknowledgements require the owning RUNNING lease. Definite failures use existing capped backoff and a maximum of five attempts. Polling exceptions log only a fixed safe message and do not terminate future polling. No exactly-once provider delivery is claimed.

Each dispatch performs at most 100 expired-lease transitions and 100 held-capability expiry cleanups, using row locks/SKIP LOCKED. Large backlogs progress over later polls. Ready/expired/revoked/consumed and account/email/purpose eligibility are checked before send. Expired held reset capabilities are erased after 30 minutes; verification uses 24 hours, on a subsequent poll. Business reset cleanup remains atomic with password changes. A send already in flight can deliver an inert link; nothing can reactivate a consumed/revoked token.

## State interpretation

| State / outcome code | Interpretation | Allowed next action |
| --- | --- | --- |
| QUEUED / initial or DELIVERY_UNAVAILABLE | Unsent or definite failed attempt; known retry scheduled | Automatic due claim, within five-attempt cap |
| RUNNING | A claimed job may be contacting its provider | Wait; do not reconcile or force requeue |
| FAILED / DELIVERY_OUTCOME_UNKNOWN | A timeout/crashed lease may have been accepted | Hold; inspect provider evidence; never automatically retry |
| FAILED / DELIVERY_CIPHER_UNAVAILABLE | No send occurred because payload/key was unavailable | Repair deployment configuration; no unproven retry through the unknown-outcome operation; abandon only if appropriate |
| SUCCEEDED / null or RECONCILED_SENT | Confirmed accepted by adapter/provider | No repeat; ciphertext erased |
| SUCCEEDED / TOKEN_NOT_USABLE | Suppressed, not a claim of email delivery | No repeat; ciphertext erased |
| DEAD / DELIVERY_EXHAUSTED, DELIVERY_EXPIRED or RECONCILED_CLOSED | Terminal delivery work | No retry through this service; ciphertext erased |

ABANDON terminates delivery work; it does not assert that a possibly sent message was never sent and does not itself revoke a still-valid account token. Provider delivery events arriving later must be interpreted against current token validity. Known cipher failures can be abandoned; safe key-repair retry tooling/multi-key rotation is still pending, and must not be implemented with an unreviewed SQL state flip.

## Bounded inspection and reconciliation

Only a trusted in-process maintenance caller with deployment/database access may obtain AccountDeliveryOperations. Do not expose it through a controller, Actuator, public shell, arbitrary-script endpoint or frontend. A restricted maintenance harness can call the service using the same application configuration and worker flag false. No operator command/API is automatically enabled by this task.

1. Pause and drain **all** worker instances before reconciling. Verify old processes/requests cannot still send. Keep the worker flag false in the maintenance context. A shutdown timeout alone is insufficient: consult provider idempotency/status records using the job UUID and wait out unresolved requests.
2. Call inspectHeld(25), with a maximum of 100. Results contain only job UUID, purpose, state, attempt count, outcome code and updatedAt. They omit recipient, token ID, token digest, raw token and encrypted payload. This is an age-ordered bounded queue inspection; resolve old rows before inspecting later ones.
3. Open a restricted operational evidence case. Store provider request/acceptance evidence there, without raw capabilities. Its service reference must match CASE- followed by 1-12 digits, for example CASE-123; arbitrary provider messages and secrets are rejected.
4. If provider evidence confirms acceptance, choose CONFIRMED_SENT. If evidence proves **not accepted and no in-flight send remains**, choose CONFIRMED_NOT_SENT. If evidence is inconclusive, leave UNKNOWN held. If delivery should be abandoned, choose ABANDON.
5. Pass the inspected id, exact updatedAt, attempts, resolution and case reference. Example trusted Java invocation:

```java
var held = operations.inspectHeld(25);
// Select a job only after reviewing the case and draining all workers.
boolean changed = operations.reconcile(job.id(), job.updatedAt(), job.attempts(),
    AccountDeliveryOperations.Resolution.CONFIRMED_SENT, "CASE-123");
```

The service locks one held row and checks expected timestamp **and attempt count**, so stale and concurrent operator decisions cannot resolve a later attempt, even when clock values repeat. Only UNKNOWN can be confirmed sent/not sent. CONFIRMED_NOT_SENT requeues only a still-eligible, unexpired, unconsumed, unrevoked purpose/email-matching token below five attempts. It retains the ciphertext and attempt count. Otherwise it closes DEAD. CONFIRMED_SENT closes SUCCEEDED; ABANDON closes DEAD. Both erase ciphertext. Existing payload metadata gains only resolution, evidence reference and decision time in the same transaction. An exception rolls all changes back. false means stale/inapplicable state: inspect again, never force the update.

6. Preserve approver identity and evidence in the restricted case system; the stored reference is not an implemented authenticated operator audit system. Restart workers only after unresolved jobs remain safely held and confirmed decisions are committed. No state-change operation should run while an old provider request can still complete.

Optional read-only SQL for trusted database diagnosis (bounded and without payloads):

```sql
SELECT id, job_type, state, attempt_count, last_error_code, updated_at
FROM collector.outbox_jobs
WHERE job_type IN ('VERIFY_EMAIL','RESET_PASSWORD') AND state = 'FAILED'
ORDER BY updated_at, id
LIMIT 25;
```

## Isolated development and verification

The controlled FakeMail/Mailbox fixtures under src/test are the development delivery strategy. They use synthetic .test recipients, keep raw links in test-process memory only, send no network mail, and are excluded from production component scanning. They are not a browser-accessible mailbox. Test fixture values are not production keys or capabilities.

With Docker Desktop's Linux engine running:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=AccountDeliveryOperationsTests,AccountDeliveryRunnerTests' test
if ($LASTEXITCODE -ne 0) { throw 'Delivery checks failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
```

The account journey exchanges real CSRF, registers through MockMvc, receives verification in the test mailbox through scheduled polling, verifies, requests recovery, receives a reset link through polling and changes the password through HTTP. It checks old/new password hashes, safe logs, state and encrypted-payload cleanup. Other tests cover restart with stable keys, held/crashed jobs, concurrent operators/pollers, stale decisions, expiry/revocation/account changes, attempt caps, rollback and bounded maintenance. These are backend/test-fake results, not live inbox or browser/provider acceptance.

Spring lifecycle reference: [SmartLifecycle](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/context/SmartLifecycle.html). The documented start/stop phase and stop-callback lifecycle is used without adding a second outbox framework or enabling global scheduling for unrelated jobs.
