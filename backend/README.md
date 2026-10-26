# Backend foundation

Java 21, Spring Boot 4.1.1 (selected 4.1 line), Maven Wrapper 3.3.4 with Maven 3.9.16, PostgreSQL 18. The Boot parent/BOM manages all library versions, including Spring Security, Hibernate, Flyway, JDBC and Testcontainers. No feature tables or authentication have been implemented.

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

`./mvnw.cmd verify` compiles and runs the foundation integration test. Docker is required: Testcontainers starts a fresh isolated PostgreSQL 18 database, boots two full HTTP application contexts against it, validates Flyway, verifies exactly one migration, and checks a test-only data probe survives restart. It also checks health JSON and request denial. The probe never appears in development migrations. Testcontainers removes its disposable resources after the test. No H2 fallback or silently skipped database test is used.

`application-test.properties` supports `TEST_DATABASE_URL`, `TEST_DATABASE_USERNAME` and `TEST_DATABASE_PASSWORD` for test configuration. The foundation integration test explicitly overrides these with its disposable container, so it cannot alter the development database. Hibernate validation currently has no feature entities to validate; entity/table regression coverage belongs with future migrations.

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

`.github/workflows/backend-ci.yml` uses Java 21, BOM-managed dependencies, Maven Wrapper, Maven caching, a Docker availability check, and `clean verify` on an Ubuntu Docker-capable runner. The frontend has its own locked build/lint/format/test workflow. Official Actions are pinned to release commit SHAs; workflows have read-only repository permissions, push/PR/manual triggers and 20-minute timeouts. Both passed local actionlint 1.7.12 validation. No Git remote is configured, so remote CI execution is pending. Local success is not a GitHub Actions success claim. T04/M0 remain In progress pending remote CI; M1/T05 remain Not started.

## Official setup references (checked 21 October 2026)

- [Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html)
- [BOM-managed dependency coordinates](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html)
- [Single schema initialization mechanism / Flyway](https://docs.spring.io/spring-boot/how-to/data-initialization.html)
- [Actuator exposure and health](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [Official PostgreSQL container image](https://hub.docker.com/_/postgres)
- [Maven Wrapper](https://maven.apache.org/tools/wrapper/)
