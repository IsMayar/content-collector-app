# Backend foundation

Java 21, Spring Boot 4.1.1 (selected 4.1 line), Maven Wrapper 3.3.4 with Maven 3.9.16, PostgreSQL 18. The Boot parent/BOM manages all library versions, including Spring Security, Hibernate, Flyway, JDBC and Testcontainers. T05 Parts 1-3 add identity persistence, registration, email verification and password recovery/reset. T06 Parts 1-2 now add login, signed JWTs, persistent rotating refresh sessions, bootstrap, logout and reset-driven revocation; see the current section below.

## Local setup (PowerShell)

Install a Java 21 JDK and Docker Desktop with Linux containers. The wrapper downloads Maven on first use; a separate Maven installation is unnecessary. Start Docker Desktop and wait for its engine. From the project:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
java -version
docker version
.\scripts\Initialize-Local.ps1
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed.' }
.\mvnw.cmd verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run
```

The initializer creates a Git-ignored `.env` containing a randomly generated password; it preserves an existing file. `.env.example` documents placeholders. The backend imports `.env` as properties when run from `backend/`, while Docker Compose uses it for interpolation. Do not quote its values. Shell environment variables override the file. Required settings: `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`; optional `SERVER_PORT` defaults to 8080. Never commit real credentials.

The isolated Compose database is `collector_dev`, on `127.0.0.1:5433`, in the project-specific `website-content-collector-dev` Compose project and named volume. Existing local PostgreSQL services are not reused or modified. PostgreSQL 18's data volume mounts at `/var/lib/postgresql`. Changing the password in `.env` does not rotate an already initialized database's password; preserve the original local configuration for an existing volume.

Compose and Testcontainers pin the same PostgreSQL 18.6 Alpine image digest through Docker's official-image repository on public ECR. This avoids a Docker Hub download failure observed during setup. First verification also downloads Testcontainers' small cleanup image; registry access is required on a fresh machine.

For normal subsequent starts, run `docker compose up -d --wait` then the `spring-boot:run` command. Stop the backend with Ctrl+C. `docker compose stop` stops this project's database while preserving its volume. Do not remove the volume to solve routine startup problems.

## Health and security

In another PowerShell terminal:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/actuator/health'
```

Expected HTTP 200 JSON: `{"status":"UP"}`. Database health participates; a reachable application with a failed database check returns HTTP 503 and `{"status":"DOWN"}`. No component names, database details or configuration values are exposed. Public routes are exact GET `/actuator/health`, GET `/api/v1/auth/csrf`, POST `/api/v1/auth/register` and POST `/api/v1/auth/verify-email`. The two POST routes still require CSRF. All unrelated requests remain denied with no form login, Basic authentication or generated user. Registration and verification do not authenticate a caller.

## Schema ownership and verification

Flyway alone owns schema changes; SQL initialization is disabled and Hibernate uses `ddl-auto=validate`. V1 creates the empty `collector` schema; Flyway history resides in `public`. Baseline-on-migrate is disabled, checksums validate at startup, and Flyway clean is disabled. Do not run the supplied reference SQL. Add feature-specific V2+ migrations when their tasks begin; never edit an applied migration. A future deployment uses a dedicated Flyway migration step before replicas, as described by the specification.

`./mvnw.cmd verify` compiles and runs the foundation integration test. Docker is required: Testcontainers starts a fresh isolated PostgreSQL 18 database, boots two full HTTP application contexts against it, validates Flyway, verifies the current three-migration history, and checks a test-only data probe survives restart. It also checks health JSON and request denial. The probe never appears in development migrations. Testcontainers removes its disposable resources after the test. No H2 fallback or silently skipped database test is used.

`application-test.properties` supports `TEST_DATABASE_URL`, `TEST_DATABASE_USERNAME` and `TEST_DATABASE_PASSWORD` for test configuration. The foundation integration test explicitly overrides these with its disposable container, so it cannot alter the development database. Hibernate validates the `users` and account-only `access_tokens` entity mappings introduced by V2. Identity persistence/constraint/concurrency tests use a separate disposable PostgreSQL container; a second test database inside it verifies upgrading V1 to V2 without losing existing data.

The guide mentions JUnit 5. The selected Boot 4.1.1 BOM supplies JUnit Jupiter 6.0.3, which runs these Jupiter tests on Java 21; no old JUnit dependency is forced over the BOM. Other resolved versions include Spring Security 7.1.1, Hibernate 7.4.5.Final, Flyway 12.4.0, PostgreSQL JDBC 42.7.13 and Testcontainers 2.0.5.

## API errors and request tracing (T04 Part 5)

Handled MVC and security errors use `application/problem+json` with `type`, `title`, `status`, `detail`, `code`, `traceId` and `errors`. Validation entries contain `fieldPath` and a safe `message`; rejected values and constraint messages are not echoed. MVC protocol headers such as `Allow` are preserved. Unexpected failures return a generic 500 and log only a correlation ID, without exception messages, causes or stack traces. Application-authored `ApiException` messages must be safe for clients.

Every request receives `X-Request-ID`. A single supplied ID is accepted only when it contains 1–64 ASCII letters, digits, underscores or hyphens. Missing, invalid, oversized or duplicate IDs are replaced with a UUID. Error `traceId` matches the response header. The request retains its ID across dispatches; the filter restores the previous logging context on completion or failure.

The current closed security policy returns standardized 403 `ACCESS_DENIED` for anonymous and authenticated product requests, missing/invalid CSRF tokens, and unknown routes. It does not expose route existence. The MVC handler returns standardized 404 `NOT_FOUND` if a request legitimately reaches MVC without a matching handler/resource; isolated test fixtures exercise this without opening production routes. Only the exact health GET is public. Authentication behavior belongs to later tasks.

Run the complete verification with Docker Desktop's Linux engine running:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
```

The suite includes isolated MVC/security/tracing tests and the real PostgreSQL clean-start/restart test. Test-only transport controllers live under `src/test/`; no product endpoints were added. A Docker failure is a failed full verification, not a skipped success. For diagnosis only, the database-independent subset can be run separately:

```powershell
.\mvnw.cmd '-Dtest=ApiProblemFactoryTests,GlobalExceptionHandlerTests,RequestTraceFilterTests,SecurityConfigurationTests' test
```

On 26 October 2026, `clean verify` passed all 32 tests (0 failures, 0 errors, 0 skipped), including PostgreSQL 18.6/Flyway validation, restart preservation and executable JAR packaging. T04 remains In progress for remaining transport/documentation acceptance and remote CI verification.

## Transport and CI (T04 Part 6)

Use one origin: the deployment reverse proxy routes `/api` to this backend, and Vite proxies `/api` to `VITE_API_PROXY_TARGET` in development. No permissive CORS configuration is enabled. Untrusted preflight requests are denied. A separate-origin deployment requires an explicit allowed-origin and credential/cookie review before enabling it.

The session CSRF repository uses `X-XSRF-TOKEN`, matching the frontend contract, while retaining session-backed tokens and default BREACH protection. No CSRF endpoint or authentication was added; `/api/v1/auth/csrf` remains denied in this foundation. Only exact GET `/actuator/health` is public. Controller binding/body validation uses 400; feature semantic validation will use 422. Test-only `ApiException` fixtures verify 401/422 serialization without introducing those endpoints or changing the closed access policy.

On 26 October 2026, the Part 6 `clean verify` run passed **36 tests, 0 failures, 0 errors, 0 skipped**: factory 3, MVC errors 13, tracing 11, security/CSRF/origin policy 8, PostgreSQL clean-start/restart integration 1. Executable JAR packaging passed. A real local Vite proxy smoke check preserved problem JSON and matching request IDs for denied API requests; direct health was UP.

`.github/workflows/backend-ci.yml` uses Java 21, BOM-managed dependencies, Maven Wrapper, Maven caching, a Docker availability check, and `clean verify` on an Ubuntu Docker-capable runner. The frontend has its own locked build/lint/format/test workflow. Official Actions are pinned to release commit SHAs; workflows have read-only repository permissions, push/PR/manual triggers and 20-minute timeouts. Both passed local actionlint 1.7.12 validation. No Git remote is configured, so remote CI execution is pending. Local success is not a GitHub Actions success claim. At the end of Part 6, T04/M0 remained In progress pending remote CI; M1/T05 had not started. Current T05 status is recorded below.

## T05 Part 1 - account identity foundation

`V2__create_identity_schema.sql` creates only `collector.users` and the account subset of `collector.access_tokens`. V1 is unchanged. Names and enum values follow the supplied reference: `UNVERIFIED`/`ACTIVE`/`DISABLED`, `VERIFY_EMAIL` and `RESET_PASSWORD`. The token table deliberately omits future team/client/workspace fields until those migrations. No accounts or credentials are seeded.

Accounts have UUID IDs, canonical unique email, display name, an algorithm-prefixed password hash, verification time, state, optimistic version and timezone-aware creation/update times. `EmailAddresses.normalize` strips surrounding whitespace and uses `Locale.ROOT`; entity Bean Validation rejects malformed email/display names. Database checks require canonical lowercase email, so case variants cannot bypass uniqueness even outside JPA. Future request DTOs must independently validate inputs.

The `PasswordEncoder` bean uses Spring Security Argon2id with `{argon2}` prefix, 16-byte random salt, 32-byte output, 19,456 KiB memory, two iterations and parallelism one (guide Section 8.1). New passwords use Argon2id rather than the task's BCrypt fallback; no existing BCrypt store exists to import. Benchmark these parameters on deployment hardware. The 12-128 character/byte-cap policy and request rate limits belong to later account service/DTO work; no public password workflow exists yet.

**Dependency exception:** the Boot 4.1.1 BOM does not manage `bcprov-jdk18on`, which Spring's Argon2 encoder requires. Only this new provider dependency is explicitly pinned to **1.85**, matching the [Spring Security 7.1.1 version catalog](https://github.com/spring-projects/spring-security/blob/7.1.1/gradle/libs.versions.toml). Existing framework/library versions remain Boot-managed. See [Spring's password-storage documentation](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html). No password algorithm was implemented locally.

`SecureAccountTokens.generate()` returns 32 SecureRandom bytes encoded as 43 URL-safe Base64 characters without padding. Only a trusted future service receives the raw string. `digest(raw)` produces a deterministic 64-character lowercase SHA-256 hex digest; only this digest is stored. Errors never echo supplied tokens. `AccountToken` captures purpose, account, email snapshot and timestamps; verification lasts 24 hours and reset 30 minutes. `isUsableFor` is advisory only and checks purpose, issue/expiry boundaries, consumption and revocation.

Repositories support normalized-email lookup/existence, account ID/save, digest-and-purpose lookup and account/purpose listing. Authoritative `consume` is a conditional transactional update requiring matching purpose, issued/unexpired state and no consumption/revocation. Exactly one concurrent caller can receive update count 1. `revoke` and `revokeUnconsumedForUserAndPurpose` support targeted invalidation. Future verification/reset services must join token consumption and account changes in the same transaction, require account state/email consistency, and serialize token reissuance/invalidation as appropriate. They must not use an in-memory validity check followed by a normal save as proof of one-time use.

Hibernate SQL/bind/extract/vendor-error diagnostic logging is disabled because constraint details can contain hashes or sensitive row values. Application error responses/logs retain the safe T04 trace policy. A captured-output regression verifies duplicate-digest/FK failures do not log the password hash or token digest. No entities are exposed through controllers, and HTTP security/CSRF configuration is unchanged.

Run the existing complete check:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
```

Verified 26 October 2026: **71 tests, 0 failures, 0 errors, 0 skipped**; all previous 36 tests plus 35 identity tests. Real PostgreSQL 18.6, clean V1/V2 migration, V1-to-V2 upgrade preservation, Hibernate validation, restart preservation, concurrent single-use consumption, transactional rollback, security/errors and executable JAR packaging passed. Docker was available. Frontend checks were not rerun for this backend-only change; the earlier 68-test evidence is preserved, not claimed as a new run.

T05 and M1 are **In progress**, not complete. Remaining T05 work includes transactional registration/verification/recovery services, request DTO/password policies, generic responses, account-state checks, rate limits, delivery through fakes/sandboxes and later HTTP endpoint tests. Login/JWT/refresh/session revocation belong to their later steps, including T06; no such functionality was introduced. T04/M0 remain In progress because hosted CI is still unverified and no Git remote is configured.

## T05 Part 2 - registration and email verification

| Operation | Request | Response |
| --- | --- | --- |
| GET `/api/v1/auth/csrf` | No body; retain the CSRF session cookie | 200 `{ "token": "..." }`, `Cache-Control: no-store` |
| POST `/api/v1/auth/register` | `{ "email": "alex@example.test", "displayName": "Alex", "password": "a sufficiently long password" }`; `X-XSRF-TOKEN` and the same session | 202 `{ "message": "If this address can be registered, check your inbox for a verification email." }` |
| POST `/api/v1/auth/verify-email` | `{ "token": "43-character URL-safe email token" }`; CSRF header/session | 200 `{ "verified": true }` |

DTOs trim email/display name/token, never passwords. Email is bounded to 254 characters, display name to 2-100 (existing frontend contract), and password to 12-128 with a 512-byte UTF-8 safety cap and no composition rules. Malformed/invalid DTO input returns standard 400 problems. An unknown/revoked/wrong-purpose/disabled-account/email-mismatch token returns 400 `TOKEN_INVALID`; expired and consumed links use 410 `TOKEN_EXPIRED`/`TOKEN_CONSUMED`, matching existing frontend guidance. No secret or identity entity is returned. Success bodies are non-cacheable.

Registration performs Argon2id work for valid duplicate and new requests. Duplicate, active or disabled accounts receive the same generic 202 body without changes to credentials or tokens. The database uniqueness constraint resolves concurrent creation; a losing transaction rolls back safely. New account/token/outbox insertion is one transaction. Verification locks the account, checks purpose/state/email/expiry, conditionally consumes the token, updates the account and revokes remaining verification tokens in one transaction. A failed account update rolls consumption back. A successful verification creates no login, JWT or authentication session.

Validated registration/verification requests have shared PostgreSQL limits of 5/20 per minute per transport peer address by default (`REGISTRATION_PER_MINUTE`, `VERIFICATION_PER_MINUTE`), returning 429 `RATE_LIMITED` and `Retry-After: 60`. Counts cover duplicates/failures and are shared across API instances. Peer addresses are stored only as SHA-256 keys; stale limiter rows are removed after one day during checks. The application does not trust arbitrary forwarded headers. A production reverse proxy must supply client addresses only through a deliberately trusted proxy configuration; edge limits must also protect malformed requests, CSRF acquisition and connection/body volume. These operational limits are not claimed verified here.

`V3__add_account_delivery_outbox.sql` adds the account subset of reference `collector.outbox_jobs` plus `collector.account_request_limits`. V1/V2 are unchanged. Metadata includes token ID and correlation ID, while the raw token is stored only as an AES-256-GCM encrypted payload, bound to job/token IDs with authenticated metadata and a random 12-byte nonce. A separate Base64-encoded 32-byte encryption key and key identifier are required. Missing configuration leaves health available but registration returns safe 503 `EMAIL_DELIVERY_UNAVAILABLE` for all addresses, without creating accounts or invalidating existing tokens. No encryption key is generated silently at application startup.

Generate a persistent **local-only** key once in the ignored `.env` (do not print or commit it):

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\scripts\Initialize-Local.ps1
if (-not (Select-String -LiteralPath '.env' -Pattern '^TOKEN_DELIVERY_ENCRYPTION_KEY=.+' -Quiet)) {
    $deliveryBytes = New-Object byte[] 32
    $deliveryRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $deliveryRandom.GetBytes($deliveryBytes) } finally { $deliveryRandom.Dispose() }
    $deliveryKey = [Convert]::ToBase64String($deliveryBytes)
    Add-Content -LiteralPath '.env' -Value "TOKEN_DELIVERY_ENCRYPTION_KEY=$deliveryKey"
    Add-Content -LiteralPath '.env' -Value 'TOKEN_DELIVERY_ENCRYPTION_KEY_ID=local-v1'
    Remove-Variable deliveryKey, deliveryBytes
}
```

Use a secret manager in deployment. Keep the key stable while queued messages exist. The boundary currently supports one configured key ID; full multi-key rotation/reconciliation operations remain delivery integration work. `APP_BASE_URL` supplies the trusted frontend origin; HTTPS is required for non-loopback hosts. Email links use `/verify-email#token=...` so a passive GET never consumes a token. Never derive links from request Host/forwarded headers.

`VerificationMailSender` is replaceable; its default adapter is disabled and never sends or logs links. Tests use an in-memory controlled adapter with synthetic `.test` recipients. `VerificationDeliveryWorker.dispatchOne()` is an explicit worker entry point, **not an enabled scheduler or public endpoint**. Registration only enqueues. The worker claims committed jobs using `FOR UPDATE SKIP LOCKED`, a 60-second lease/owner and an attempt count, and calls the adapter outside transactions. Acknowledgements require the current lease owner. Definite failures use capped backoff and at most five attempts; final outcomes erase ciphertext. Unknown send outcomes and expired leases are held in FAILED for provider reconciliation, never blind redelivery. Unresolved held payloads are erased after the 24-hour token lifetime when the worker runs again. The adapter must use the job ID for provider idempotency where supported; delivery is not claimed exactly-once.

**Pending delivery:** no production provider, credentials, automated worker runner or operator reconciliation UI is implemented. Durable queueing is verified; real inbox delivery is not. Keep a provider/sandbox adapter and worker scheduling disabled until configured and tested. Local development without an adapter will not deliver email.

**Pending resend contract:** the original endpoint catalog omits resend and the handoff explicitly calls POST `/auth/resend-verification` a proposal. It remains denied (403); this task does not silently approve a contract or invalidate usable tokens. Agree the route, generic response, replacement/cooldown policy and durable delivery behavior before implementing it. Duplicate registration is not a resend shortcut.

Verification on 26 October 2026: `./mvnw.cmd clean verify` passed **104 tests, 0 failures, 0 errors, 0 skipped** (all prior 71 + 30 workflow/PostgreSQL/MockMvc tests + 3 cipher tests). Real CSRF exchange, exact-route denial, validation/errors/traces, concurrent registration/verification/claims, rollback, rate limiting, encrypted durable delivery/failures, clean V1/V2/V3 migration, V2 upgrade preservation, Hibernate validation, restart and JAR packaging passed. The initial invalid-CSRF test appended an invalid value to a valid header; replacing the header fixed that test setup, with CSRF protection unchanged. No frontend tests were rerun or frontend changes made. T05/M1 remain In progress; T04/M0 remain In progress pending hosted CI.

## T05 Part 3 - password recovery and reset

| Operation | JSON request | Success response |
| --- | --- | --- |
| POST `/api/v1/auth/forgot-password` | `{ "email": "alex@example.test" }` | 202 `{ "message": "If an eligible account exists, a password reset link will be sent." }` |
| POST `/api/v1/auth/reset-password` | `{ "token": "43-character URL-safe reset token", "password": "a sufficiently long new password" }` | 200 `{ "message": "Your password has been reset." }` |

Both POSTs require a fresh GET `/api/v1/auth/csrf` exchange, its session cookie and `X-XSRF-TOKEN`. Success is `Cache-Control: no-store`. Only these exact additional POST routes are public; GET/child routes and unrelated authentication operations remain denied. Health stays exact GET `/actuator/health`. CORS, problem JSON and matching `X-Request-ID`/`traceId` behavior are preserved.

Recovery normalizes email and accepts only verified ACTIVE accounts for issuance. Unknown, UNVERIFIED, DISABLED and repeated eligible addresses receive the identical generic 202 without exposing identity or tokens. All valid requests perform an Argon2id hash and observe a default 250 ms minimum response budget. This reduces obvious timing differences; it is not a constant-time guarantee under database contention or load. Recipient-specific queue failures roll back, log only a safe correlation ID and retain the generic response. Missing global delivery-key configuration returns the same safe 503 `EMAIL_DELIVERY_UNAVAILABLE` before looking up any address.

The existing secure generator creates 256-bit, purpose-bound `RESET_PASSWORD` tokens with a 30-minute lifetime. Only SHA-256 digests enter the token table. A locked account row serializes recovery issuance: repeated requests reuse the current usable capability without generating more jobs or resending; after expiry a new request revokes previous outstanding reset tokens and queues one replacement atomically. This is bounded issuance, not a resend endpoint. A new request after a successful reset may issue a new capability, subject to limits.

Reset validates the existing 12-128 character / 512-byte UTF-8 password policy, hashes with Argon2id and atomically consumes the exact reset token, updates the password, revokes other outstanding reset tokens and clears unusable queued/held delivery payloads. The account remains ACTIVE and verified with its original verification time. No login or authenticated session is created. Unknown/revoked/wrong-purpose/ineligible/email-mismatched links return 400 `TOKEN_INVALID`; expired or used links return 410 `TOKEN_EXPIRED`/`TOKEN_CONSUMED`. Invalid DTOs/malformed JSON use existing 400 errors. A password persistence failure rolls the token changes back; concurrent resets have one successful consumer.

Required existing server settings remain `TOKEN_DELIVERY_ENCRYPTION_KEY` (Base64 32 bytes), `TOKEN_DELIVERY_ENCRYPTION_KEY_ID` and trusted `APP_BASE_URL`; use the local-only key setup above and ignored `.env`. Additional optional settings, also listed in `.env.example`:

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `RECOVERY_PER_MINUTE` | 5 | Validated recovery requests per transport peer per minute |
| `RESET_PER_MINUTE` | 20 | Validated reset attempts per transport peer per minute |
| `RECOVERY_MIN_RESPONSE_MS` | 250 | Minimum recovery response budget; allowed 100-2000 ms |

The existing PostgreSQL limiter shares counts between API instances; 429 includes `Retry-After: 60`. Invalid input is rejected before the limiter, so edge/body/CSRF acquisition limits and trusted proxy address configuration remain deployment requirements. Never put these server secrets in VITE variables.

The same encrypted outbox, AES-GCM cipher, adapter and worker now handle both purposes. Adapter messages carry purpose so implementations must choose verification versus password-reset email copy/expiry; verification links remain `/verify-email#token=...` and reset links use `/reset-password#token=...`. Existing ciphertext/AAD format is unchanged. Workers suppress unusable tokens and retain the existing lease/idempotency/reconciliation behavior. Unknown outcomes are held without automatic resend; a later worker invocation erases expired/consumed/revoked held capabilities (30 minutes for reset), with the existing 24-hour fallback. Reset/replacement also erases stale reset ciphertext in its database transaction. A send already in flight may deliver an inert link; it cannot restore a revoked/consumed capability. Provider delivery is not exactly-once.

`V4__enable_password_reset_delivery.sql` only widens the existing outbox job-type check to allow `RESET_PASSWORD` alongside `VERIFY_EMAIL`. It creates no tables/columns and preserves queued verification data. V1, V2 and V3 are unchanged. No credential-version column is needed now: the specification requires session revocation, which T06 must implement by joining revocation of every account session/refresh family to the successful reset transaction before commit. Current account `updatedAt` is not an implemented session-invalidation mechanism.

Local verification (Docker Desktop Linux engine must be running):

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
```

Verified 26 October 2026: **142 tests, 0 failures, 0 errors, 0 skipped**, executable JAR packaged. All previous 104 tests remain, plus 38 recovery/reset cases. PostgreSQL 18.6 tests cover clean V1-V4 startup/Hibernate validation/restart, V3 upgrade preserving queued ciphertext, normalized/generic recovery, ineligible accounts, timing work/budget, rate windows, issuance/consumption/worker concurrency, rollback, token/password/error/CSRF behavior and held-delivery expiry. The existing test fixture was explicitly marked test-only so its fake mail and clock cannot leak into unrelated application contexts. Existing public-route assertions now recognize the two new POSTs; wrong methods and CSRF remain tested. No tests were skipped and no dependency versions changed.

Remaining T05: resend route/replacement/cooldown agreement and workflow, configured sandbox/provider and worker runner, reconciliation/key rotation operations, deployment abuse controls and full account acceptance. Production email credentials remain disabled; this task delivers through a controlled test fake only. Real inbox delivery and the full browser-to-backend recovery journey were not verified. Session revocation/login/JWT/refresh remain T06 integration work; no frontend files changed or frontend checks rerun. T05/M1 remain In progress; T04/M0 remain In progress because no Git remote is configured and hosted CI is unverified. No local tool blocker affected this verification.

## T05 Part 4 - delivery execution and operations

AccountDeliveryRunner now provides explicit opt-in fixed-delay polling of the existing worker. It starts only when ACCOUNT_DELIVERY_WORKER_ENABLED=true, the delivery encryption key is configured and an available adapter is explicitly supplied. The default adapter remains unavailable and cannot send real mail. No production credentials, HTTP administration endpoint or Actuator token inspection was added.

Optional settings are listed in .env.example: ACCOUNT_DELIVERY_BATCH_SIZE=10 (1-50), ACCOUNT_DELIVERY_POLL_MS=1000 (100-60000), and ACCOUNT_DELIVERY_SHUTDOWN_SECONDS=10 (1-30). One thread per process polls sequentially; database claims support concurrent processes. Stale-lease recovery and held-expiry maintenance are bounded to 100 rows each per dispatch. Shutdown stops new claims, drains to the configured deadline then interrupts; uncertain sends remain held after lease expiry, never blindly retried. Adapter timeouts/idempotency must be configured and verified before using a real provider.

AccountDeliveryOperations provides bounded redacted inspection and transactional, stale-safe reconciliation to trusted in-process callers only. Confirmed sent closes/erases, confirmed not sent requeues only eligible usable capabilities below the attempt cap, and abandon closes/erases. UNKNOWN stays held unless provider evidence justifies a decision. Pause/drain all workers first, use the inspected timestamp and attempt count plus a CASE-number evidence reference, and never force QUEUED through SQL. There is no implemented authenticated operator console; deployment access and the restricted evidence case are operational prerequisites.

Read the [full operations runbook](../docs/ACCOUNT_DELIVERY_OPERATIONS.md) for states, shutdown/restart behavior, evidence workflow, test commands and safe SQL inspection. Existing test-only FakeMail/Mailbox fixtures already supply isolated controlled delivery; no second development mailbox or token-exposure mechanism was introduced. Live inbox delivery remains unverified. Stable key configuration is required across restarts; multi-key rotation and safe cipher-repair retry tooling remain pending.

Verification resend is still unapproved and denied. The [handoff](../docs/FRONTEND_BACKEND_HANDOFF.md#t05-part-4-contract-review-and-resend-decision---26-october-2026) records a concrete proposal for approval; it is not silently treated as an agreed endpoint. No Flyway migration or dependency update was required; V1-V4 remain unchanged. T05/M1 remain In progress for resend/provider/end-to-end acceptance; T04/M0 remain In progress for hosted CI. T06 login/JWT/refresh and transactional session revocation are not implemented.

Part 4 verification on 26 October 2026: full `.\mvnw.cmd clean verify` passed **175 tests, 0 failures, 0 errors, 0 skipped** (all previous 142 plus 21 operations/workflow PostgreSQL cases and 12 runner lifecycle/configuration cases). Flyway V1-V4, Hibernate validation, real-context restart with the same key, concurrent polling/reconciliation, rollback and executable JAR packaging passed. Frontend `npm test -- src/test/auth.test.tsx src/test/transport.test.ts --maxWorkers=1 --pool=forks` passed **46 tests in 2 files**; no frontend files changed. Live inbox/provider or browser-to-backend journeys and hosted CI were not performed. No local tool blocker remains.

## T06 Parts 1-2 - secure login and rotating agency sessions

The repository had no Part 1 implementation when the Part 2 request arrived. Both authorized parts are now implemented together: actual credential/JWT foundations and complete public login/refresh contracts backed by PostgreSQL sessions. No T07 workspaces or frontend screens changed.

Read [the agency session architecture and setup guide](../docs/AGENCY_SESSION_ARCHITECTURE.md) for exact API contracts, PowerShell setup/startup commands, key generation/rotation, cookie attributes, CSRF lifecycle and acceptance limits. Run .\scripts\Initialize-Auth.ps1 explicitly once after Initialize-Local.ps1; it preserves existing local signing configuration and does not print secrets or generate keys at server startup. New variables are listed in .env.example. Real login requires a verified ACTIVE account and all signing/pepper settings; there are no seeded credentials.

Current endpoints: POST /api/v1/auth/login -> 200 {accessToken,expiresIn:300,user} plus HttpOnly refresh cookie; POST /api/v1/auth/refresh -> 200 {accessToken,expiresIn:300} plus rotated cookie; GET /api/v1/me -> {user,memberships:[]}; GET /api/v1/me/sessions -> {data:[SessionSummary]}; DELETE /api/v1/me/sessions/{id}, POST /api/v1/auth/logout and POST /api/v1/auth/logout-all -> 204. Existing T05 routes stay available. All mutations retain CSRF, and unrelated business routes remain denied. Empty memberships reflect T07 not being implemented.

RS256/issuer/audience/kid/subject/session/time checks and 30-second maximum skew use BOM-managed Spring Security 7.1.1/Nimbus 10.9.1. Access lifetime is five minutes. Refresh secrets contain 256 random bits; only keyed digests are stored. Sessions expire after 14 days or seven inactive days. Rotation is atomic. Used refresh tokens get 409 REFRESH_ALREADY_ROTATED within the two-second race window, with no cookie/credential changes; later reuse commits family revocation then returns 401. Live database checks invalidate existing JWTs on revocation/account disablement. Password reset now atomically revokes all sessions; it is no longer deferred to a future T06 step.

V5 adds only agency auth_sessions/session_tokens, indexes and constraints; V1-V4 are unchanged. The disabled-mail/default worker policy and T05 resend/provider gaps are preserved. Production refresh/CSRF cookies are Secure/HttpOnly/SameSite=Lax; the loopback dev profile has an explicit local HTTP exception. A standard bearer filter is installed without granting bearer mutations a CSRF exemption or persisting bearer identity in the CSRF session.

Verified 27 October 2026: full .\mvnw.cmd clean verify passed **229 tests, 0 failures, 0 errors, 0 skipped**: all previous 175 plus 33 session workflow/PostgreSQL cases, 19 JWT/hash cases and 2 cookie-policy cases. Clean V1-V5/Hibernate validation, V4 upgrade preservation, real context restart with stable keys, session concurrency/reuse/rollback, reset revocation/races, security regressions and executable JAR packaging passed. Frontend auth/transport tests passed **46 tests in 2 files** with one thread worker; an earlier fork worker failed to start and was rerun successfully, not counted as a pass. Local key generation was checked in an isolated ignored directory, with valid public JWKS and no secret output. No frontend code or original specifications changed.

T06/M1 remain In progress pending live browser/TLS-cookie deployment acceptance and operational hardening/retention checks; local implementation/tests do not prove deployment acceptance. T05 remains In progress for resend/provider requirements; T04/M0 remain In progress for hosted CI (no remote configured). No local verification blocker remains.

## Official setup references (checked 21 October 2026)

- [Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html)
- [BOM-managed dependency coordinates](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html)
- [Single schema initialization mechanism / Flyway](https://docs.spring.io/spring-boot/how-to/data-initialization.html)
- [Actuator exposure and health](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [Official PostgreSQL container image](https://hub.docker.com/_/postgres)
- [Maven Wrapper](https://maven.apache.org/tools/wrapper/)

## T06 Part 3 — authentication audit and real browser verification

Fixed two defects: malformed/unknown refresh cookies no longer prevent valid-bearer logout revocation; frontend mutation retries reacquire CSRF after refresh rotates server CSRF state. No V1–V5 or API DTO changes. JWTs are checked against live account/session state on each authenticated request: revocation rejects already-issued access tokens on subsequent requests, including after restart. The two-second 409/no-credentials race policy remains unchanged.

Verified 27 October 2026: backend clean verify **233 tests**, separate real HTTPS browser lifecycle **1 test**, frontend auth/transport **47 tests in 2 files**, with zero test failures/errors/skips in the final runs. Executable JAR, Flyway/Hibernate validation, TypeScript production build, lint and formatting passed. [Detailed evidence and security matrix](../docs/verification/T06_AUTH_AUDIT.md).

Real browser prerequisites: Java 21/keytool and Node on PATH, Docker Desktop Linux engine running, existing frontend dependencies installed from the lockfile and Microsoft Edge installed. The explicit Windows integration check starts its own disposable PostgreSQL, real Spring server and real Vite HTTPS server on random loopback ports; MSW is disabled. It creates a verified synthetic account and temporary keys/certificate, cleans up owned resources and does not modify your development database. Self-signed certificate trust is bypassed only in the isolated test browser. This does not verify public deployment TLS.

Run the explicit check after normal backend verification (it is separate from default backend-only CI; it is not silently skipped):

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real browser authentication check failed.' }
```

T06/M1 remain In progress for deployment proxy/TLS, persistent key rollout, abuse controls and retention operations; local browser acceptance now passes. T05 resend/provider and T04/M0 hosted CI remain pending. No T07 implemented or push performed.

## T07 Part 1 — workspace foundation

[Workspace schema, ownership, API contracts, locks, trial defaults and evidence](../docs/WORKSPACE_FOUNDATION.md). V6 creates workspaces, workspace_members and the local-trial-only subset of reference subscriptions; V1–V5 unchanged. No payment provider/checkout or later feature tables. A verified authenticated account can own one workspace and join others; creation commits owner membership and 14-day trial atomically. Package-private scoped repositories and centralized live JWT/session/membership checks reject unrelated tenant IDs. Owner settings PATCH requires expectedVersion and writable entitlements. No generic global repository endpoint is exposed.

Available authenticated routes: GET/POST `/api/v1/workspaces`, GET/PATCH `/api/v1/workspaces/{workspaceId}`. Mutations require the existing CSRF exchange. Creation accepts name, optional IANA timezone (default America/Chicago) and optional SOLO/AGENCY planKey (default SOLO); always local TRIALING, never paid activation. GET returns workspace and entitlements; PATCH changes name/timezone only. Missing/expired entitlement denies writes. Section 18 defines seats/storage/paid allowances; undefined reduced trial budgets default zero (`TRIAL_AI_DRAFTS=0`, `TRIAL_SMS_SEGMENTS=0`), bounded at startup to 0–100/0–25. AI/SMS activation stays false until later integrations.

Verification 27 October 2026: full `.\mvnw.cmd clean verify` passed **278 tests, zero failures/errors/skips**, preserving all 233 prior cases and adding 45 workspace/PostgreSQL/MockMvc cases. V5 upgrade, Hibernate validation, restart, database constraints, transactional rollback, two-tenant isolation, concurrent creation/versioning/membership change and executable JAR passed. Separate real HTTPS authentication browser regression passed **1 test**; final strengthened PostgreSQL lock-wait checks passed **2 cases**. Frontend focused auth/transport/product tests passed **69 tests in 3 files**; no frontend source changed.

Use the existing local setup/key initialization/database/start commands above; Flyway applies V6 automatically. No new dependency installation or database reset is required. Do not edit applied migrations or run schema_reference.sql. For full reproduction including the separate real HTTPS authentication regression, see the workspace guide.

T07/M1 remain In progress: Part 1 uses GET workspaces for discovery; wiring existing `/me` membership projection and real owner onboarding acceptance remain. T08 frontend session lifecycle, T13 member invitations/transfer and T32/T33 billing are separate. Existing T04 hosted CI, T05 delivery/resend and T06 deployment/retention limits remain pending; no production credentials/push.

## T07 Part 2 — live session memberships and onboarding acceptance

GET `/api/v1/me` now returns the existing user object plus live active `{memberId,workspaceId,workspaceName,role}` summaries. The documented path is `/me`, not `/auth/me`; no alias added. Identity comes from validated JWT/session context; inactive/removed memberships are excluded, no entities or cached JWT roles returned. An internal projection port reuses one scoped workspace/member join. Existing create/list/detail/update endpoints and 14-day local trial remain unchanged. No migration/dependency change.

Existing frontend login/onboarding/reload bootstrap works with these live memberships. A minimal identity-change listener clears private API caches when memberships/user change. No T08 UI redesign or later backend feature introduced. [Current contract, tests, exact files and reproduction commands](../docs/WORKSPACE_FOUNDATION.md).

Verified 27 October 2026: `.\mvnw.cmd clean verify` passed **290 tests**, preserving all previous 278 and adding 12 membership cases; JAR/Flyway V1–V6/Hibernate/upgrade/restart and security regressions pass. Frontend **70 tests**, strict TypeScript/production build/lint/format pass. Separate `.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test` now runs **2 passing real HTTPS Edge lifecycles**, authentication and workspace onboarding. Test-only in-memory delivery receives the actual encrypted-outbox message; no real email/MSW/provider used. Second-tenant changes are isolated fixtures, not T13 APIs. New owner registration/verification/login/create/trial/read/list/reload/selection, tenant denial and disabled-member cache/navigation recovery pass. Later project routes remain denied.

**T07 Complete; M1 remains In progress.** No T07/local tool blocker remains; T04 hosted CI, T05 resend/provider and T06 deployment/retention acceptance remain pending. T08 and later tasks remain Not started. No production deployment or full MVP claim.

## T08 Part 1 — package organization and agency session acceptance

[Backend architecture, responsibilities, exact 13 old-to-new workspace moves, visibility rationale, future convention and reproduction commands](ARCHITECTURE.md). Auth/common structure and global framework configuration are intentionally preserved; no empty packages, duplicate classes, service-interface proliferation, API/DTO or migration changes. Workspace now uses controller/service/repository/entity/dto/security subpackages. Scoped repository ports remain narrow; production cross-package access does not grant HTTP access. Nullable version detection and numeric optimistic-version comparison are covered by regression.

Existing agency session features were reused. Minimal frontend fixes align the active workspace with its authorized direct/reloaded URL and ignore unknown/already-selected switch requests before clearing caches. Server JWT/session/membership checks remain authoritative; no role JWT cache or UI redesign. Actual HTTPS checks include no-workspace onboarding/profile, OWNER/MEMBER selection/reload, expired access, membership/session expiry, safe redirects and UI cross-tab logout with both tabs' private caches cleared. Project/template backend routes stay denied.

Baseline and refactor-only clean verify both passed 290 tests before lifecycle extension. Final clean verify passed **291 tests**, preserving baseline 290 plus the version-range regression; zero failures/errors/skips. JAR/Flyway V1–V6/Hibernate/upgrade/restart/security/tenant regressions pass. JAR inspection confirms no stale flat workspace classes. **72 frontend tests**, strict TypeScript/production build, zero-warning lint and format checks passed. Full final real HTTPS rerun passed **2 tests**, zero failures/errors/skips. **T08 Complete; M1 In progress**. No T08/local tool blocker remains; [implementation status](../docs/IMPLEMENTATION_STATUS.md) preserves independent pending gates. Browser checks run explicitly with `.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test`, using real PostgreSQL/Edge/Vite/Spring, MSW off, isolated test mail/certificates and no production providers. T04 hosted CI, T05 resend/provider and T06 deployment/retention gates remain pending; no full M1/MVP claim.


## T09 Part 1 — validated template catalog (28 October 2026)

T09 adds catalog reads only. There is no project creation, cloning persistence, template editing/publishing endpoint, billing change or frontend UI change. Dependencies remain on the existing Boot BOM/Jackson 3 stack, with no dependency additions. See [package responsibilities](ARCHITECTURE.md) and [current acceptance results](../docs/IMPLEMENTATION_STATUS.md).

### Original source and schema boundary

`src/main/resources/templates/starter_templates.json` is a **byte-identical copy** of `../docs/spec/starter_templates.json`, not a regenerated fixture. SHA-256 of both: `75f33a836337b5de3f0b122c955e1e8c24ffe7fa85c50a27ac95369c23e44cef`. The supplied reference remains unchanged. An explicit -text Git attribute protects the packaged copy on fresh Windows checkouts. Tests compare the bytes and every stored/retrieved definition, not just row counts.

Catalog version 1 contains **10 definitions, 68 sections, 220 items**: `website.plumber`, `website.electrician`, `website.dentist`, `website.restaurant`, `website.law-firm`, `website.real-estate`, `website.salon`, `website.saas-startup`, `web_app.starter`, `mobile_app.starter`. All have schemaVersion 1 and source version 1. Eight are WEBSITE, one WEB_APP and one MOBILE_APP. Source keys, titles, industry, instructions, examples, required flags, validation, AI metadata and array order remain intact. The actual source contains MULTI_SELECT and NUMBER repeater columns; it contains no SINGLE_SELECT items, visibility conditions or default values. Synthetic validator tests cover supported select/visibility configurations and their failures; they do not replace any original definition. Undocumented default-value properties are rejected rather than discarded.

`TemplateSchemaValidator` uses the installed Jackson 3 parser with duplicate-property and trailing-token rejection. It returns a fresh independent tree, or a safe `InvalidTemplate` diagnostic containing an index-based fieldPath and fixed code, without rejected values/parser causes. No public validation endpoint is added.

- Schema version exactly 1; optional definition version is a positive integer (the supplied schema example omits it). Every built-in seed explicitly requires version 1. Required top-level key/projectType/industry/title/sections; exact JSON types and schema vocabulary. Unknown properties, invalid/null metadata, unsafe key shapes and unsupported types fail without normalization. Template key/title lengths follow the reference's 160-character columns; industry 80, section key/title 160/200 and item key/label 200/250.
- 1–30 sections, 1–50 items per section and at most 300 items overall. Section keys are unique per definition, item keys across the definition, column keys within their repeater, option keys within their select. Array position is the source's order; no sortOrder/id/default field is invented. Forward references caused by reordering are rejected.
- SHORT_TEXT up to 200 characters, LONG_TEXT up to 10,000, nonnegative minima no greater than maxima, optional SHORT_TEXT email format. URL schemes are a nonempty unique subset of http/https. Selects require unique keyed/labeled options; MULTI_SELECT bounds must fit its option set. IMAGE/FILE count bounds are consistent, and extension lists are nonempty, unique plain extension tokens.
- REPEATER maxRows 1–20, 1–8 unique columns, exact column types SHORT_TEXT/LONG_TEXT/URL/NUMBER/SINGLE_SELECT/IMAGE, required flags and select options when applicable. Nested repeaters and irrelevant constraints are rejected. AI metadata has boolean enabled and a positive targetWords on LONG_TEXT only; this neither calls AI nor modifies/submits an answer.
- A visibleWhen rule has exactly dependsOnItemKey/operator/optionKey; EQUALS only, referring to an earlier SINGLE_SELECT in the same section and an existing option. This ordering excludes self, forward, cross-section and circular dependencies.
- Implementation guardrails bound definition JSON to 1 MiB, text instructions/examples to 10,000 characters each, select/extension lists to 100 entries, option keys/labels to 160/250, file selections to 50 and AI targetWords to 10,000. These bounds reject oversized schema configuration; they do not invent customer values.

This validates **schema configuration**, not client answers. Later tasks enforce answer text/URL/email values, finite decimal NUMBER values, selected option uniqueness, actual row/file counts, asset ownership/READY state, visibility evaluation/retention of hidden answers, project permissions, concurrency and immutable submissions. Examples are illustrative metadata, never default customer answers.

### Storage, startup and immutable snapshots

Additive `V7__create_template_catalog.sql` creates only collector.templates and collector.template_versions, using the reference column names and nullable workspace scope. It adds built-in/workspace key uniqueness, project-type/scope/version/JSON checks, a catalog filter index, version identity uniqueness and a trigger rejecting UPDATE or DELETE of published versions. JPA mappings are read-only; there are no repository save/delete commands. Flyway remains the sole schema owner and Hibernate still validates. V1–V6 are untouched.

After Flyway/Hibernate initialization, the ApplicationRunner validates the whole immutable classpath catalog before starting one seed transaction. A PostgreSQL transaction advisory lock serializes seeding across application instances. Database IDs use UUID.nameUUIDFromBytes over UTF-8 `com.ayaantrix.collector:builtin:template:<key>` and `com.ayaantrix.collector:builtin:version:<key>:<version>`. Original developer keys are separate and unchanged; synthetic frontend fixture UUIDs are not production IDs.

INSERT ON CONFLICT DO NOTHING is followed by exact identity/metadata/schema/version/JSONB equality checks. A conflict **fails startup and rolls back the complete seed transaction**; it never overwrites a published definition or silently accepts conflicting content. Repeated/concurrent starts leave existing IDs, definitions and timestamps intact. Workspace entries and later published versions are not removed or overwritten. A future built-in update must be an explicit new immutable version; replacing the packaged v1 content is rejected. JSONB preserves semantic object data and array order, not original whitespace/object property order. The exact original bytes remain in the packaged resource.

Consumers receive fresh definition trees, never mutable managed entities or a shared cached JSON tree. Catalog summaries identify both template and selected immutable version. Existing version reads stay stable even after a later version is present. T10 must copy that definition into independent project section/item identities; T09 creates no project/snapshot tables.

### Exact catalog HTTP contracts

Both routes require a valid agency JWT, live account/session eligibility and current ACTIVE membership in the URL workspace. An active MEMBER can read the workspace catalog without project access; this grants no project, review or export permission. Cross-tenant/missing workspace and foreign/missing version IDs return indistinguishable 404s. No client/public catalog is opened. Read-only workspace access remains readable.

| Method/path (prefix /api/v1) | Response |
| --- | --- |
| GET /workspaces/{workspaceId}/templates?projectType=WEBSITE&industry=PLUMBER | `{data:[{id,title,projectType,industry,isBuiltin,version,versionId}]}` |
| GET /workspaces/{workspaceId}/template-versions/{versionId} | `{definition:TemplateDefinition}` |

Filters are optional and combined, industry matches exactly; unknown industries yield an empty list. Listing includes built-ins plus that workspace's published versions only, takes the latest immutable version per identity and orders by stable template key. It never exposes drafts or another tenant's template. `versionId` is the existing frontend handoff extension to the original summary contract. Detail uses exactly the original inventory's `{definition}` envelope.

Responses use Cache-Control no-store. Unknown projectType/invalid UUID input produces the existing safe 400 problem response; invalid industry bounds produce 400 VALIDATION_FAILED. Missing identity is 401. Unsupported write methods and unimplemented descendants stay **403 default-denied**, including with valid identity/CSRF, rather than opening mutation mappings solely to return 405. Existing problem JSON, X-Request-ID, restricted CORS and CSRF protections remain. Only these two exact GET path patterns are newly authenticated; no /api/v1/** permit rule.

### Reproduce verification and startup

With Java 21 and Docker Desktop Linux engine running:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test -- --maxWorkers=1 --pool=threads
if ($LASTEXITCODE -ne 0) { throw 'Frontend verification failed.' }
```

Normal startup reuses the existing backend .env and signing-key configuration; no new environment variable or external provider is required:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\scripts\Initialize-Local.ps1
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed.' }
.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run
```

After signing in and obtaining a workspace with the existing account/workspace flows, the frontend's existing Templates requests can use the real catalog with mocks disabled. New project submission and workspace-template modification remain unavailable until their later tasks; catalog completion does not imply those features or full-stack project acceptance. Existing T04/T05/T06 deployment/provider/hosted CI gates remain independent. Final test counts and blockers are recorded in IMPLEMENTATION_STATUS.md.

Final local result: **406 backend tests, 0 failures/errors/skips**, executable JAR packaged with the original resource and V7; **72 frontend tests across 3 files passed**. T09 Complete for validator/catalog-seed acceptance and this Part 1 scope, M2 In progress. No local T09 blocker; T10 remains Not started.


## T10 Part 1 — project creation and independent initial snapshots

This section supersedes earlier statements that all project/customer routes are closed. Only the five routes below are added. T11 structure edits, T12 preview/grants, T13 assignments/invitations, lifecycle transitions, answers/submissions and provider/billing operations remain closed. There is no frontend application/UI change or dependency change; the existing explicit HTTPS test runner is extended for the real wizard flow.

### Contracts and prerequisites

All paths are prefixed `/api/v1`; responses have Cache-Control no-store. New customer records are the guide's `clients` business-customer prerequisite, not project contact grants or agency accounts. The wizard can create one or select an existing same-workspace customer.

| Method/path | Request/query | Response |
| --- | --- | --- |
| POST /workspaces/{w}/clients | `{businessName,contactName?,email?}` plus existing CSRF | 201 `{client:{id,businessName,contactName,email,version}}` |
| GET /workspaces/{w}/clients | page=0, size=12 (max 100) | 200 `{data:Client[],page:{page,size,totalElements}}` |
| POST /workspaces/{w}/projects | `{clientId,title,projectType,dueDate,timezone,templateVersionId}`; required Idempotency-Key and CSRF | 201 `{project:Project}` |
| GET /workspaces/{w}/projects | search, projectType, state, sort=updatedAt/title/dueDate, page=0, size=12 (max 100) | 200 `{data:ProjectSummary[],page:{page,size,totalElements}}` |
| GET /workspaces/{w}/projects/{p} | None | 200 `{project:Project,progress:Progress,structure:Section[]}` |

Title is required, nonblank and at most 200 characters, with surrounding whitespace removed. Types reuse the existing catalog enum WEBSITE/WEB_APP/MOBILE_APP; no duplicate Java ProjectType enum. dueDate is an ISO date with year 1–9999 (historical dates are allowed); timezone must be an exact supported IANA ID. Client and published version are mandatory, must be visible under this workspace and must have compatible projectType. For **this explicit-version T10 path**, the optional version in the original broad inventory is required by the current task; no implicit/latest-template fallback or unagreed override field is invented. Owner-defined schema overrides remain for the structure/editor contract. UUID source fields are resolved server-side; request owner/user/workspace fields never confer authority.

Project has the original ProjectSummary fields plus clientId/version/structureVersion/aiEnabled/permissions, using the existing frontend contract. Summaries contain exactly the summary fields. Sections/items have independent UUIDs, developer keys, zero-based sortOrder, enabled/state/version/currentRevisionId/visible and the complete item metadata/validation. New projects are DRAFT; project/item/structure wire versions start at **1** as required by existing frontend schemas (customer optimistic version starts at 0). JPA keeps a nullable new project version until @PrePersist assigns 1; there is no boxed-reference version comparison or explicit entity serialization. No update/version-conflict endpoint is added; unsupported PATCH and lifecycle routes remain 403 default-denied.

Listing searches title/customer name case-insensitively with a 200-character bound. SQL wildcard characters are escaped and treated literally. Type/state combine with search; title/dueDate sort ascending, updatedAt descending, with stable UUID tie-breaks. Invalid sort/type/state/page/size returns the existing safe 400 problem. Default size 12 matches the agreed product handoff; maximum 100 follows the guide. No undocumented deadline-range parameter is introduced; the documented dueDate sort is supported. Lists batch-load customer names and aggregate item counts without querying the source template. API row limits affect pagination, never a commercial project-count cap.

### Persistence and snapshot independence

Additive V8 creates exactly six required tables: clients, projects, project_snapshots, sections, items and the reference idempotency_records. It creates no answers, submissions, project contacts, project members or later provider tables. V1–V7 remain unchanged; Flyway owns schema and Hibernate continues ddl-auto=validate for the JPA mappings. Schema now has 17 collector tables and 8 migrations.

This is a documented **hybrid** of the guide's relational section/item structure and JSONB template-snapshot allowance: project_snapshots retains the complete immutable initial definition, while sections/items are the independent operational copy with their own identities and sort orders for future T11. Snapshot identity/source version/structure version/time are stored separately from project identity. Full item definitions are retained in schema_json, including repeater columns, AI metadata, optional enabled flags and visibleWhen keys. T11 must update operational columns/schema together and increment structureVersion; it must never rewrite the initial snapshot. Snapshot UPDATE/DELETE is rejected by PostgreSQL and the JPA mapping is immutable.

One transaction locks the live actor/account, workspace/member and subscription; resolves the scoped customer and published version; validates exact template shape/type; inserts project, initial snapshot, ordered sections/items and idempotency result. A failure at any stage rolls everything back. No original template, other project structure or provider usage row is updated. Reads use the project's stored rows, not a live catalog lookup. A newer catalog publication affects only projects explicitly choosing that version. Returned JSON trees are independent between reads and consumers.

Composite foreign keys enforce workspace/customer, snapshot/project/source-version, section/project and item/section/project relationships. A database trigger additionally rejects a source version from another workspace or of a different project type; global built-ins remain usable. UUID/key/order uniqueness and positive versions/state/type checks guard persistence. Creator is the trusted authenticated membership user, with a users FK for historical attribution. No client-provided creator IDs or global project-ID repository shortcut.

Creation idempotency follows the reference: bounded opaque Idempotency-Key, trusted actor + URL-workspace route scope, canonical normalized request SHA-256, 24-hour result retention. A retry with identical input returns the exact original 201 DTO, not another project; different input returns 409 IDEMPOTENCY_KEY_REUSED. Expired records for this actor/route are removed transactionally before reuse. Access/ownership/write policy is rechecked before replay. Existing database workspace/account locks and uniqueness serialize same-key concurrent creation across processes; there is no JVM/global in-memory lock. No raw request/content is logged. Periodic general idempotency retention operations beyond the route's expiry cleanup are not introduced in this foundation.

### Authorization, plans and initial progress

Existing WorkspaceAuthorization resolves JWT subject, rechecks live account/session eligibility, then locks/rechecks current membership. Owner-only customer/project creation also uses the existing WorkspaceSubscription.writable(serverClock) policy with a pessimistic subscription read lock, and requires ACTIVE workspace state. Missing/expired plan, cancelled grace or read-only/suspended workspace rejects new writes with 403 WORKSPACE_READ_ONLY. Concurrent membership disablement/demotion or workspace/plan change while creation waits is rechecked before any insert. No purchased plan, usage allowance, AI/SMS activation or project cap is invented.

Owner reads stay available under the existing read policy when writes are disabled, with mutation permission flags false. A MEMBER is not implicitly assigned to every project: until T13 introduces assignment persistence/commands, member project/customer lists are empty and guessed detail IDs return 404. Member creation is 403; unrelated workspace/inactive membership is 404; missing/revoked agency identity is 401. No owner preview/client identity is created. Later T13 must add live scoped assignment lookup before enabling assigned-member reads; this task does not claim that deferred workflow.

Required total and remaining client-action count are calculated from actual copied, enabled, initially visible required items; submitted/approved counts are genuinely zero without submissions. All items start NOT_STARTED; examples are metadata and never client answers. A conditional item is initially hidden because there are no answers to its earlier SINGLE_SELECT dependency. T15's answer-aware shared visibility evaluator must replace that initial-only observation when answer persistence exists. No fabricated activity, submission statistics, revision IDs or provider use. AI stays disabled.

### Verification and reproduction

Focused project tests cover all ten source copies (68 sections/220 items), all three creation types, exact DTOs, validation, independent versions/IDs/order/configuration, visibleWhen/repeaters, tenant/owner/member/session isolation, idempotency/reuse/expiry, concurrency with actual observed PostgreSQL lock waiters, rollback at snapshot/section/item/idempotency stages, constraints, V7 upgrade and restart. Final clean/full and HTTPS/frontend results are recorded in IMPLEMENTATION_STATUS.md. Existing 406 cases remain enabled; only latest schema counts and the newly opened project-list route's obsolete denial expectation change.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'HTTPS acceptance failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test -- --maxWorkers=1 --pool=threads
if ($LASTEXITCODE -ne 0) { throw 'Frontend regression failed.' }
```

Existing backend .env, Java 21, Docker Desktop Linux engine, local signing keys and startup commands above are reused. HTTPS checks additionally require existing frontend dependencies, Node, Edge and keytool. They use disposable PostgreSQL, isolated self-signed test certificates and synthetic accounts, with no production email/provider credentials. Start the normal backend with `.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run`; run the existing frontend with mocks off. Choose a template and Save as draft. Publishing/inviting/editing remains unavailable until its later task.

Final local acceptance: **470 backend tests** (prior 406 + 64 project cases), **72 frontend tests/3 files**, and **2 explicit real HTTPS browser tests** passed, all with zero failures/errors/skips. The extended onboarding browser test creates/reloads all three project types through the real wizard/customer/catalog/API and validates frontend response schemas. Executable JAR verified. T10 Complete for creation/independent-snapshot acceptance; M2 In progress, no local T10 blocker. No later feature or production deployment acceptance claimed.


## T11 Part 1 — independent project structure editing

The existing project structure repository now supports the five agreed section/item/reorder write endpoints, stable IDs, full-result shared schema validation, soft removal, database version conflicts and safe transactional auditing. Existing GET project detail returns the edited structure and current structureVersion. V9 adds only the required audit_logs subset; V1–V8 and initial snapshots/catalog definitions are unchanged. No new dependencies or runtimes.

Owner writes require a current live session/membership, writable ACTIVE workspace/plan and DRAFT/ACTIVE/PAUSED project. Stale writes return 409 STRUCTURE_CONFLICT with currentVersion; rejected writes leave all state intact. Submitted/drafted content is never reset: semantic changes requiring future immutable-revision reopening fail with 409 REOPEN_REQUIRED. T11 remains In progress for that later integration; Part 1 implements the fresh editor/keyboard/conflict flow. T12/T13 are not implemented.

[Exact API bodies, validation/visibility/repeater/version rules, migration rationale, package tree, PowerShell startup/check commands, verification and full changed-file inventory](../docs/T11_STRUCTURE_EDITOR.md). Real UI: verified owner, active local trial, an existing draft project, Content editor, mocks off. The HTTPS runner additionally requires installed Node/Edge and existing frontend dependencies and uses disposable synthetic test infrastructure.

Final verification: **554 backend tests** (all original 470 + 84 T11 cases), **74 frontend tests/3 files**, and **2 explicit real HTTPS browser tests**, all zero failures/errors/skips. Strict TypeScript, production build, lint, formatting, Flyway V1–V9/Hibernate/restart/upgrade and executable JAR checks passed. Original specifications, V1–V8, catalog bytes and dependency lockfiles are unchanged. Full mocked visual/PWA/deployment/provider suites were not rerun. Implementation/regression commit `995728c`; frontend/HTTPS integration commit `2ca9345`. No push. Detailed verification and corrections are recorded in docs/T11_STRUCTURE_EDITOR.md.


## T11 Part 1 resume and frontend tooling organization — 28 October 2026

The prior T11 implementation and evidence were already committed and were preserved. Authorization/limit/concurrency/rollback tests were inspected; one combined malformed-JSON fixture was separated into two intended cases. No backend production behavior, original specifications/templates, security policy or applied migration changed. The focused suite now has 85 cases; M2/T11 status and deferred submitted-content reopening boundary remain unchanged.

Browser suites now live under frontend/tests/{e2e,pwa,integration/real-auth}; the Java HTTPS launcher and Vite-relative paths follow the move. Browser results/logs/compiler caches use ignored frontend/.artifacts. Required root configurations and the resolved dependency lockfile are retained. The new frontend/scripts/Verify-Frontend.ps1 runs checks sequentially with optional -Browser -Pwa. [Exact cleanup/file inventory, commands, current verification and remaining gates](../docs/T11_RESUME_AND_FRONTEND_ORGANIZATION.md).

Final resume evidence: **85 focused T11 cases**, **555 backend clean-verify tests** (original 470 + 85), **74 frontend tests**, **2 real HTTPS tests with MSW off**, and **1 production PWA test** passed. TypeScript/build/lint/format and the final Windows PowerShell 5.1 core verification wrapper passed. Responsive mock browser coverage exercised 57 scenarios: latest full run 54 passed/3 timing failures, followed by all 3 passing unchanged on isolated rerun; this is not a clean single-run 57/57 claim. No assertions/timeouts were weakened. T11 Part 1 is verified; full T11/M2 remain In progress for the existing submitted-content reopening boundary. No T12/T13, security, application source, applied migration, original specification/template or dependency-resolution change. Commits: `ec3f44d` test correction, `a07808e` organization/HTTPS paths. No push.


## T11 Part 2 — current structure mutation restrictions

All five T11 endpoints retain their existing contracts. Full-candidate impact assessment protects both directly edited requests and their transitive visibility dependents. Metadata and valid reorder preserve state/revision markers; independent new requests are allowed. Semantic changes affecting DRAFT/collected/revision-marked items reject with 409 REOPEN_REQUIRED, including reopenAffected=true, until real revalidation and reopening are available. Section disable/re-enable is subject to the same protection. Hard deletion/identity changes are rejected; closed projects remain 409 READ_ONLY.

No new database migration or local setup is needed: existing V1–V9, Flyway ownership, Hibernate validation and isolated PostgreSQL configuration remain. Future T17/T22 must integrate actual draft/submission/approval persistence within the existing locked transaction. [Complete Part 2 rules, package design, test counts and exact PowerShell reproduction](../docs/T11_PART2.md). T11/M2 remain In progress for that dependency; no submission/review API was added.


## T12 Part 1 — customer/contact APIs and owner preview

Existing GET/POST /api/v1/workspaces/{workspaceId}/clients are preserved. Added PATCH /clients/{clientId} with businessName/expectedVersion, GET/POST /projects/{projectId}/contacts, and owner-only GET /projects/{projectId}/client-preview returning {preview: ...}. All use authenticated agency access and no-store; writes require CSRF and live owner/write entitlement. Preview returns no client session/capability and performs no content/audit write.

Contact POST requires the project's existing clientId, name, email and accessExpiresAt in the next 90 days. Same project/normalized email duplicates return 409 CONTACT_EXISTS; foreign/unrelated association is hidden. Customer PATCH preserves contact/email/project relationships and returns 409 VERSION_CONFLICT/currentVersion when stale. No undocumented read/delete/update contact endpoints, invitation sending or client-session API. V10 is additive and applies through Flyway; retain existing isolated database/env/signing-key setup and Hibernate validate.

Exact PowerShell verification commands, response/error shapes, package design and scope are in [T12 acceptance documentation](../docs/T12_CLIENT_CONTACTS_AND_PREVIEW.md). Normal startup remains .\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run after Initialize-Local.ps1 and docker compose up -d --wait. Do not put credentials in source or VITE_ variables.


## T13 Part 1 — team collaboration

The agency API now supports owner team invitations, verified-email acceptance, reserved seats, member disable/restore/removal, password-reauthenticated ownership transfer and project assignments. Members read only assigned projects and associated customers; independent review/export flags never grant owner administration. Existing auth/session/CSRF/CORS and encrypted delivery infrastructure are reused. No real provider mail is sent by tests. V11 is additive; V1–V10 remain unchanged.

Run from the project root in PowerShell:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=TeamCollaborationTests' test
if ($LASTEXITCODE -ne 0) { throw 'T13 verification failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS verification failed.' }
```

These tests require the existing Java 21/Maven wrapper, Docker Linux engine/PostgreSQL Testcontainers, and (for HTTPS tests) Node/frontend dependencies and Edge. Test credentials/keys/mailboxes/certificates are synthetic and isolated. Local app setup remains the existing Initialize-Local.ps1 / docker compose flow documented above. Configure the existing delivery encryption/provider environment outside version control for development delivery; never use production credentials in automated tests. Invitation links use /team-invite#token=..., expire after seven days and require the matching verified account. Revoke then reissue rather than calling an undocumented team resend route.

[Complete T13 API inventory, package tree, migration/security/delivery details, exact file manifest and verification](../docs/T13_TEAM_COLLABORATION.md). T04 hosted CI, T05 provider/resend, T06 deployment and T11 collected-work reopening remain independent gates. No full MVP claim.

T13 final verification (30 October 2026): **657 backend tests** (620 preserved + 37 T13), **97 frontend unit tests**, **2 real HTTPS lifecycles**, **75 responsive cases** and **1 production PWA case** passed; zero final failures/errors/skips. Strict TypeScript/build/lint/format, Flyway V1–V11, Hibernate validation, restart/concurrency/rollback and executable JAR packaging passed. T13 Part 1 Complete; M2/T11 and release gates retain their separate status. Commits: backend `aca9494`, frontend `01f06ff`; no push.


## T14 Part 1 — independent project client access

Owner invitation/revocation, explicit fragment exchange, generic fresh links, separate opaque cookie sessions and a read-only real portal are implemented. V12 is additive; V1–V11 and existing agency/team identities remain intact. Shared safe structure projection excludes private content; all client reads revalidate the live scoped grant/session. No answer/upload/submission APIs or T22 publication are added. DRAFT invitation issuance remains closed pending publication. See [T14 contracts, architecture, lifecycle, migration, exact manifest and verification](../docs/T14_CLIENT_ACCESS.md). T11 and T04–T06 gates remain independent.


## T15 Part 1 — persistent client drafts

The collection feature reuses T14 client session authorization for exact item GET/answer PUT routes. V13 adds project-shared mutable answers with contact attribution and independent answer versions. Existing project locks serialize writes, audit/state/version updates roll back together, and ProjectDraftVisibility drives portal/progress visibility without deleting hidden drafts. The existing client frontend feature adds server-confirmed serialized autosave, bounded retries, conflict comparison and volatile recovery; uploads/submissions remain deferred. T11 semantic changes to DRAFT collected items still fail closed pending revalidation/reopening. [Detailed contracts, feature trees, migration, file manifest, commands and final evidence](../docs/T15_CLIENT_DRAFTS.md). Original roadmap and T04–T06/T11/T22 gates remain independent.

## T16 private storage: isolated local setup

Java 21, Docker Desktop Linux containers and the existing Maven wrapper are required. Existing PostgreSQL, JWT keys and auth setup remain required. No frontend secret/VITE variable is added. The development service is SeaweedFS with authenticated S3 access; production may supply private S3-compatible endpoints and least-privilege credentials. No production provider verification is claimed.

Run from a fresh PowerShell session. Keep Docker running. The helper preserves existing `.env` values and writes its generated S3 identity only under ignored `.local/storage/`.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\scripts\Initialize-Local.ps1
.\scripts\Initialize-PrivateStorage.ps1
docker compose -f compose.yaml -f compose.storage.yaml up -d --wait --wait-timeout 600
if ($LASTEXITCODE -ne 0) { throw 'Local services failed to start.' }
docker compose -f compose.yaml -f compose.storage.yaml ps
# The wait above requires a healthy scanner; first startup downloads definitions.
docker compose -f compose.yaml -f compose.storage.yaml logs --tail 30 scanner
docker build -t collector-image-worker:t19 .\storage\image-worker
if ($LASTEXITCODE -ne 0) { throw 'Image sandbox build failed.' }
.\mvnw.cmd dependency:build-classpath '-Dmdep.outputFile=target/storage-classpath.txt'
if ($LASTEXITCODE -ne 0) { throw 'Storage tool classpath failed.' }
$storageClasspath = (Get-Content -LiteralPath '.\target\storage-classpath.txt' -Raw).Trim()
java -cp $storageClasspath .\storage\InitializeBuckets.java
if ($LASTEXITCODE -ne 0) { throw 'Private bucket initialization failed.' }
# Explicitly enable only after bucket initialization and healthy scanner.
$env:PRIVATE_STORAGE_ENABLED = 'true'
$env:PRIVATE_STORAGE_WORKER_ENABLED = 'true'
.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run
```

Bucket initialization restricts CORS to `APP_BASE_URL`'s exact origin (default `http://127.0.0.1:5173`). Set the existing property to the actual local HTTPS frontend origin when using the secure-cookie harness, then rerun bucket initialization. Never use production customer data with these development credentials. The test fixture uses random isolated ports and exact loopback origins; those are not the production bucket policy.

Do not start a second scanner on port 13310 if another local scanner already occupies it. Use that compatible isolated scanner or stop only your known development container first. Keep ClamAV definitions updated; scanner failure blocks READY. Rebuild and rerun decoder smoke tests before changing the worker image. The API can start with storage disabled; no unconfigured upload becomes available.

```powershell
# Focused real PostgreSQL/S3/clamd checks (test-only tiny signature DB by default):
.\mvnw.cmd '-Dtest=AttachmentStorageTests,AttachmentValidationTests,SandboxedImageProcessorTests' test
if ($LASTEXITCODE -ne 0) { throw 'Attachment verification failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
# Full-definition local scanner at loopback 13310; real HTTPS and MSW disabled:
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' '-Dcollector.test.clam-port=13310' test
```

See [T16 implementation and evidence](../docs/T16_PRIVATE_ATTACHMENTS.md) for APIs, migration, state machine, quarantine, draft integration, restrictions and current acceptance status. Existing T04/T05/T06/T11/T22 gates are unchanged. Final submissions/reviews/exports are unavailable in this task.


## T17 client submission and withdrawal

Run the existing backend/private-storage setup above; Flyway applies V15 automatically and Hibernate remains validate. Clients submit one saved visible item using expectedAnswerVersion and expectedStructureVersion, then can explicitly withdraw the current submitted version. Immutable history and retained private files survive later draft edits. Assigned readers can use the Submitted versions project tab; the review queue separately requires review permission. No approval/export/project-reopen workflow is enabled. [API inventory, local commands, focused tests and actual evidence](../docs/T17_CLIENT_SUBMISSIONS.md).


## T18 private upload quota — 1 November 2026

Original Section 22 T18 is private upload reservations/quota, not agency review. Existing private-upload setup above is reused; no new environment variable, dependency or migration. Quota rejection remains HTTP409 STORAGE_QUOTA_EXCEEDED and now includes usedBytes (retained content) and availableBytes (capacity after retained bytes and outstanding reservations), with the standard safe problem/correlation envelope. Requests are authorized before usage is inspected. [Scope correction, contracts and evidence](../docs/T18_AGENCY_REVIEW.md).

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
docker info
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and wait for the Linux engine.' }
.\mvnw.cmd '-Dtest=AttachmentStorageTests' test
if ($LASTEXITCODE -ne 0) { throw 'Private upload checks failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS checks failed.' }
```

These use isolated disposable PostgreSQL/private-storage/scanner fixtures; they do not reuse or erase the development database. Production IAM/scanner/device acceptance remains separate.

T18 final local acceptance:42 focused storage,865 backend,161 frontend unit,2 real HTTPS (MSW off),75/75 responsive and1/1 production PWA passed; TypeScript/build/lint/format passed. Executable JAR and Flyway/Hibernate checks passed. M4 and independent release gates remain In progress; see the T18 report for scope and exact evidence.


## T19 scanner and image variants — 1 November 2026

Rebuild the worker from current source as `collector-image-worker:t19`. Existing .env files are preserved by initialization; explicitly set `$env:IMAGE_WORKER_IMAGE = 'collector-image-worker:t19'` before starting the backend, or deliberately update that single local property. The previous t16 image emits orientation metadata rejected by the hardened output boundary. Scanning fails closed on incomplete replies; derivatives enforce separate working/thumbnail bounds, CRC/container integrity and stripped metadata. No migration, API, dependency or frontend change. Production provider/scanner/device gates remain independent. [Report and acceptance evidence](../docs/T19_IMPLEMENTATION.md).

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
docker build -t collector-image-worker:t19 .\storage\image-worker
if ($LASTEXITCODE -ne 0) { throw 'Worker image build failed.' }
.\mvnw.cmd '-Dtest=AttachmentStorageTests,AttachmentValidationTests,SandboxedImageProcessorTests,ClamAvScannerTests' test
if ($LASTEXITCODE -ne 0) { throw 'T19 focused checks failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS checks failed.' }
```

T19 final local evidence:110 focused attachment,889 backend,162 frontend unit,2 real HTTPS (MSW off),75/75 complete responsive and1/1 fresh production PWA passed; TypeScript/build/lint/format and Flyway/Hibernate/JAR checks passed. A reproduced frontend regression now separates initial anonymous agency bootstrap from explicit sign-out so an independent client exchange is not canceled; confirmed logout/authenticated expiry still clear both caches. T19 is Complete locally; M3/M4 and independent release gates remain In progress. Earlier failed stages and unresolved diagnostic risk are recorded in the T19 report.


## T21 review decisions and comments

V16 adds scoped append-only decisions/comments automatically through Flyway; never edit V1–V15. Owners and live assigned canReview members can decide the current SUBMITTED revision of an ACTIVE/writable project. Assigned readers can comment without review/export permission; client comments always have CLIENT visibility. REQUEST_CHANGES requires feedback and restores a separate editable draft. APPROVE records the exact revision; history is immutable. T22 publication/reopening/completion/archive remains unavailable. Existing trusted ACTIVE test fixtures are not a publication API.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
# Requires Java21 and a running Docker Desktop Linux engine for PostgreSQL tests.
.\mvnw.cmd '-Dtest=SubmissionTests#review*' test
if ($LASTEXITCODE -ne 0) { throw 'Review checks failed.' }
# Optional full CI/release regression; do not repeat it unnecessarily during focused work.
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck#realHttpsWorkspaceOnboardingWithoutMocks' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS review acceptance failed.' }
```

The HTTPS command requires existing frontend dependencies/Edge and local private storage/scanner/image-worker fixtures documented above; MSW remains disabled. [Full T21 contract inventory, exact evidence and blockers](../docs/T21_REVIEW_DECISIONS.md). Recorded backend evidence is896 passing full-run cases plus17 corrected migration checks passing on focused verify (913 distinct cases covered), not a claimed subsequent full green run. Final44 targeted frontend tests and1 real HTTPS lifecycle passed. T20 real-device and existing hosted/provider/deployment gates remain open.
