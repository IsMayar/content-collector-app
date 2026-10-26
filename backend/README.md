# Backend foundation

Java 21, Spring Boot 4.1.1 (selected 4.1 line), Maven Wrapper 3.3.4 with Maven 3.9.16, PostgreSQL 18. The Boot parent/BOM manages all library versions, including Spring Security, Hibernate, Flyway, JDBC and Testcontainers. T05 Part 1 adds account identity tables and security utilities; account HTTP workflows and authentication are not implemented.

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

Expected HTTP 200 JSON: `{"status":"UP"}`. Database health participates; a reachable application with a failed database check returns HTTP 503 and `{"status":"DOWN"}`. No component names, database details or configuration values are exposed. Only GET on that exact health path is permitted. Other requests return 403, with no form login, Basic authentication or generated user; CSRF stays enabled. This is an intentionally closed foundation until authentication tasks.

## Schema ownership and verification

Flyway alone owns schema changes; SQL initialization is disabled and Hibernate uses `ddl-auto=validate`. V1 creates the empty `collector` schema; Flyway history resides in `public`. Baseline-on-migrate is disabled, checksums validate at startup, and Flyway clean is disabled. Do not run the supplied reference SQL. Add feature-specific V2+ migrations when their tasks begin; never edit an applied migration. A future deployment uses a dedicated Flyway migration step before replicas, as described by the specification.

`./mvnw.cmd verify` compiles and runs the foundation integration test. Docker is required: Testcontainers starts a fresh isolated PostgreSQL 18 database, boots two full HTTP application contexts against it, validates Flyway, verifies the current two-migration history, and checks a test-only data probe survives restart. It also checks health JSON and request denial. The probe never appears in development migrations. Testcontainers removes its disposable resources after the test. No H2 fallback or silently skipped database test is used.

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

## Official setup references (checked 21 October 2026)

- [Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html)
- [BOM-managed dependency coordinates](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html)
- [Single schema initialization mechanism / Flyway](https://docs.spring.io/spring-boot/how-to/data-initialization.html)
- [Actuator exposure and health](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [Official PostgreSQL container image](https://hub.docker.com/_/postgres)
- [Maven Wrapper](https://maven.apache.org/tools/wrapper/)
