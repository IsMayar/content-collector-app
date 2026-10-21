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

## Official setup references (checked 21 October 2026)

- [Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html)
- [BOM-managed dependency coordinates](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html)
- [Single schema initialization mechanism / Flyway](https://docs.spring.io/spring-boot/how-to/data-initialization.html)
- [Actuator exposure and health](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [Official PostgreSQL container image](https://hub.docker.com/_/postgres)
- [Maven Wrapper](https://maven.apache.org/tools/wrapper/)
