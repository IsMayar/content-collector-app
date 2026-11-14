# Local development with the real backend

Run the backend and frontend in separate PowerShell windows. Use Java 21, Node 22 or newer as specified by the frontend package, Docker Desktop with Linux containers, and Edge for the browser smoke. Use synthetic records in a disposable development database.

## Database and backend

The repository's Compose service runs PostgreSQL 18 at `127.0.0.1:5433/collector_dev`. It uses a named volume. These commands preserve the volume and any existing `backend/.env`. If that file points at a different database, confirm the target before startup. To use an existing PostgreSQL instance such as `content_collector` on port 5432, supply its JDBC URL and credentials privately through `DATABASE_URL`, `DATABASE_USERNAME`, and `DATABASE_PASSWORD` in the backend shell and skip Compose. Never point these commands at production.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\scripts\Initialize-Local.ps1
.\scripts\Initialize-Auth.ps1
.\scripts\Initialize-DevInbox.ps1
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not become healthy.' }
$env:APP_BASE_URL = 'http://127.0.0.1:5173'
$env:ACCOUNT_DELIVERY_DEV_INBOX = 'true'
$env:ACCOUNT_DELIVERY_WORKER_ENABLED = 'true'
.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run
```

If Java is installed but unavailable by name, run `.\scripts\Initialize-Auth.ps1 -Java "$env:JAVA_HOME\bin\java.exe"` with a valid `JAVA_HOME`. If Docker cannot discover Compose, call the existing Docker Desktop executable `C:\Program Files\Docker\Docker\resources\cli-plugins\docker-compose.exe` with the same arguments after omitting `docker compose`.

The initializer uses persistent RSA PKCS#8 and JWKS files and a random refresh-token pepper. It imports a complete generated set into the ignored environment file and stops on a partial set. Keep the key files and pepper together across restarts. The inbox initializer adds a separate delivery encryption key when missing. The backend writes real one-time links to ignored `backend/.local/auth/inbox/` under the current user's private Windows ACL. It uses the existing encrypted outbox, so verification and invitation authorization still run normally. Each file contains a purpose, recipient and link. Open the matching file in a local editor, copy the link into the appropriate browser profile and remove the file after use. Treat the files as credentials. They do not send email to recipients.

The `dev` profile binds to loopback and permits local HTTP cookies for this setup. Keep both browser and proxy on `127.0.0.1`. Production retains Secure cookies. The existing isolated HTTPS acceptance harness tests Secure cookies with a disposable PostgreSQL container and a browser-only certificate exception.

## Frontend and smoke

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm ci
$env:VITE_ENABLE_MOCKS = 'false'
$env:VITE_API_BASE_URL = '/api/v1/'
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8080'
npm run dev -- --strictPort
```

Open [the local sign-in page](http://127.0.0.1:5173/sign-in). From another PowerShell window, check health and proxied CSRF without printing the token.

```powershell
(Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8080/actuator/health').StatusCode
(Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5173/api/v1/auth/csrf').StatusCode
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
node scripts/Smoke-Local.mjs
```

The browser smoke creates a disposable account and workspace in the configured database. It checks registration, real inbox delivery, verification, sign-in, persistence after reload and logout. It suppresses failure details that could contain credentials. Use a fresh browser profile if an old mock worker is registered. In Edge DevTools, open **Application → Service Workers** and unregister the worker for this local origin only, then reload. Clear storage for this origin only if needed. This signs out the local session.

## Manual walkthrough

1. Open [Create account](http://127.0.0.1:5173/sign-up), register a new test email and check the inbox for `VERIFY_EMAIL`. Open its link and select **Verify email**. A reused link should be rejected.
2. Sign in and create a workspace. Reload and confirm the workspace selector still shows it. Update its name or timezone in **Settings → Workspace & Team**.
3. In **Team**, invite a second verified test account. Check **Pending invitations**, then open the matching `TEAM_INVITE` link in a separate profile signed in as that member. Verify membership and check that owner-only actions are absent.
4. In **Projects**, create one project each of Website, Web app and Mobile app. Choose the corresponding template, add a test customer and save. Open each project and reload to check its type and structure. Edit a section and reload to verify persistence.
5. In a project's **Client access** tab, add a test contact and send the invitation. Open the matching `CLIENT_INVITE` link in a separate profile and continue. Confirm the portal shows only that project. Try an invalid or previously consumed link in a fresh profile.
6. In the portal, complete required fields, save a draft, reload to confirm it, then submit. Try an upload only after storage setup below. Verify that agency project progress reflects submission.
7. Return to the agency project and open **Content**. Expand the submitted question, request changes with feedback, resubmit as the client, then approve the exact revision. Confirm an authorized reviewer sees the new decision and the client sees the correct status.
8. Use the project export controls to generate and download the approved export. Confirm it contains approved content only. Test this after enabling storage and the export worker.
9. Sign out, reload a protected URL, and confirm sign-in is required. Sign back in and verify the workspace and projects remain. Exercise recovery using [Forgot password](http://127.0.0.1:5173/forgot-password) and the matching `RESET_PASSWORD` file.

## Storage and provider boundaries

SeaweedFS and ClamAV bind only to loopback. Spring streams each quarantined object to ClamAV and releases it only after a clean verdict. Use the named volume for signatures across restarts. See [the backend private storage setup](../backend/README.md) for more detail.

### Start storage and ClamAV

Run these in PowerShell from the backend directory. Use Docker Desktop in Linux-container mode. The helper preserves existing environment values. Use an existing t19 image if present.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\scripts\Initialize-Local.ps1
.\scripts\Initialize-Auth.ps1
.\scripts\Initialize-DevInbox.ps1
.\scripts\Initialize-PrivateStorage.ps1

function Invoke-CollectorCompose {
    docker compose version *> $null
    if ($LASTEXITCODE -eq 0) {
        docker compose -f compose.yaml -f compose.storage.yaml @args
    } else {
        & 'C:\Program Files\Docker\Docker\resources\cli-plugins\docker-compose.exe' -f compose.yaml -f compose.storage.yaml @args
    }
}

Invoke-CollectorCompose up -d --wait postgres storage
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL or private storage is unavailable.' }
Invoke-CollectorCompose up -d --wait --wait-timeout 600 scanner
if ($LASTEXITCODE -ne 0) { throw 'ClamAV did not become ready. Check the scanner logs below.' }
Invoke-CollectorCompose ps
Invoke-CollectorCompose exec -T scanner clamdscan --version
Test-NetConnection -ComputerName 127.0.0.1 -Port 13310

docker image inspect collector-image-worker:t19 *> $null
if ($LASTEXITCODE -ne 0) {
    docker build -t collector-image-worker:t19 .\storage\image-worker
    if ($LASTEXITCODE -ne 0) { throw 'Image worker build failed.' }
}
```

### Start an isolated upload and export sandbox

This uses a separate database and buckets in the existing containers. It keeps the default development database and buckets available. Confirm ports 8081 and 5176 are free. Use a Java 21 executable on PATH or set JAVA_HOME and use its bin directory.

In the same backend PowerShell window:

```powershell
docker exec website-content-collector-dev-postgres-1 sh -ec 'if ! psql -X -U "$POSTGRES_USER" -d postgres -Atc "SELECT datname FROM pg_database" | grep -qx collector_storage_p0; then createdb -U "$POSTGRES_USER" collector_storage_p0; fi'
if ($LASTEXITCODE -ne 0) { throw 'The isolated database could not be prepared.' }

$env:DATABASE_URL = 'jdbc:postgresql://127.0.0.1:5433/collector_storage_p0'
$env:SERVER_PORT = '8081'
$env:APP_BASE_URL = 'http://127.0.0.1:5176'
$env:S3_BUCKET_STAGING = 'collector-p0-staging'
$env:S3_BUCKET_PRIVATE = 'collector-p0-private'
$env:ACCOUNT_DELIVERY_DEV_INBOX = 'true'
$env:ACCOUNT_DELIVERY_WORKER_ENABLED = 'true'
$env:IMAGE_WORKER_IMAGE = 'collector-image-worker:t19'

.\mvnw.cmd dependency:build-classpath '-Dmdep.outputFile=target/storage-classpath.txt'
if ($LASTEXITCODE -ne 0) { throw 'Could not build the bucket initializer classpath.' }
$storageClasspath = (Get-Content -LiteralPath '.\target\storage-classpath.txt' -Raw).Trim()
java -cp $storageClasspath .\storage\InitializeBuckets.java
if ($LASTEXITCODE -ne 0) { throw 'Private bucket initialization failed.' }

$env:PRIVATE_STORAGE_ENABLED = 'true'
$env:PRIVATE_STORAGE_WORKER_ENABLED = 'true'
$env:EXPORT_WORKER_ENABLED = 'true'
.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run
```

In a second PowerShell window:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
$env:VITE_ENABLE_MOCKS = 'false'
$env:VITE_API_BASE_URL = '/api/v1/'
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8081'
npm run dev -- --port 5176 --strictPort
```

In a third PowerShell window:

```powershell
(Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8081/actuator/health').StatusCode
(Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5176/api/v1/auth/csrf').StatusCode
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
node scripts/Smoke-LocalStorage.mjs
```

Open [the isolated sign-in page](http://127.0.0.1:5176/sign-in) for a manual run. Use a synthetic project with a File question that allows TXT. Publish and invite a test contact, then open the local inbox link in a separate browser profile. Upload a small text file, wait for READY, download it, and submit. Expand the submitted question in **Content** and approve the exact revision, then choose **More → Exports → New export**. Acknowledge a partial export if prompted. Inspect the ZIP manifest and attachment. Use **Settings → Billing & Usage** to see the storage counter.

### Troubleshoot Docker DNS and ClamAV signatures

```powershell
docker info --format '{{.OSType}}'
Resolve-DnsName database.clamav.net
Resolve-DnsName current.cvd.clamav.net -Type TXT
Invoke-CollectorCompose logs --tail 50 scanner
Invoke-CollectorCompose run --rm --no-deps --entrypoint sh scanner -c 'nslookup database.clamav.net; nslookup -type=TXT current.cvd.clamav.net'
Invoke-CollectorCompose run --rm --no-deps --entrypoint sh scanner -c 'ls -lh /var/lib/clamav'
```

If Windows resolves the names and the container fails, check Docker Desktop's DNS forwarding, proxy, VPN, and firewall settings. Ask the network administrator to restore Docker's access if policy blocks it. If names resolve but FreshClam fails, distinguish download timeouts from HTTP 403 or 429 using its logs. Keep the signature volume and use FreshClam or an approved signature mirror. A generic curl download does not exercise the supported update path. See [ClamAV's FreshClam troubleshooting](https://docs.clamav.net/faq/faq-freshclam.html).

For a partially initialized volume, an approved local cache can supply missing official CVD files. Compare the cached versions with the upstream TXT record, verify each CVD with sigtool, copy only the missing files while the target scanner is stopped, then start the scanner and let FreshClam update the persisted set. Use the original detached signature files alongside the CVDs when present. Keep the cache read-only and do not remove existing volumes. Keep the app's storage workers disabled while the scanner is unavailable.

On this machine the initial bootstrap failed on main.cvd after an HTTPS timeout and DNS failure. Docker DNS later resolved both records. The existing verified main v63 and bytecode v339 databases were reused, and FreshClam advanced daily v28177 to v28178. ClamAV 1.5.4 loaded daily v28178 and retained it across restart. The isolated app stayed on loopback and used the actual scanner, private buckets, and PostgreSQL. Both the clean-file and malware cases were exercised through the live browser.

The private inbox handles verification, password resets, team invitations, and client invitations through the existing worker. Email reminders and digest delivery use a separate provider boundary. SMS requires an approved sender and callbacks. AI requires approved model and budget configuration. Hosted billing requires an approved Stripe test account, prices, and webhooks. Leave these workers disabled unless you have their sandbox credentials and intend to test those integrations. Profile edits, inline password changes, workspace logo and deletion controls remain limited to demo mode under the current backend contract. The frontend resend screen is present, but the live backend has no resend endpoint. Use a fresh synthetic account for another registration exercise.

## Verification on 9 November 2026

The working local stack used the Compose `collector_dev` database on port 5433. The host PostgreSQL 16 service on port 5432 was detected. Its `content_collector` database was not accessed because the active environment file was configured for Compose. Both backend health and the Vite-proxied CSRF endpoint returned 200. The browser smoke passed registration, actual local inbox delivery, verification, login, workspace persistence after reload, and logout. Clean key initialization and an unchanged second run passed.

| Command | Result |
| --- | --- |
| `mvnw.cmd -DskipTests package -B` | Passed |
| `npm run build` | TypeScript and production build passed |
| `node scripts/Smoke-Local.mjs` | Passed on the local application with MSW off |
| `mvnw.cmd '-Dtest=AccountRegistrationWorkflowTests,PasswordRecoveryWorkflowTests,AgencySessionWorkflowTests,RealAuthenticationBrowserCheck#realHttpsWorkspaceOnboardingWithoutMocks' test -B` | 106 tests passed in these classes during the focused run. The HTTPS harness initially failed to find Edge and passed on the next run with system Edge discovery. |
| `mvnw.cmd '-Dtest=WorkspaceFoundationTests,ProjectFoundationTests,ProjectStructureTests,ClientAccessTests,SubmissionTests,AttachmentStorageTests,RealAuthenticationBrowserCheck#realHttpsWorkspaceOnboardingWithoutMocks' test -B` | 517 passed, including one real HTTPS browser journey with all three project types, team and client access, draft collection, attachments, review, and approved exports. The browser harness uses isolated delivery, provider, and scanner test fixtures. |
| `mvnw.cmd verify -B` | 1,088 tests ran. 29 attachment assertions failed when the local S3 public endpoint leaked into the test fixture. The fixture now pins both S3 endpoints. |
| `mvnw.cmd '-Dtest=AttachmentStorageTests' test -B` | 46 passed after the fixture fix. The entire backend suite was run once. |
| `npm test -- --maxWorkers=2` | 207 passed, one auth case timed out, and one product test worker did not start. |
| `npm test -- --maxWorkers=1 tests/unit/transport.test.ts tests/unit/product.test.ts` and `npm test -- --maxWorkers=1 tests/unit/auth.test.tsx` | 48 and 30 passed in the focused reruns. |

At that earlier checkpoint, the manual scanner could not finish downloading definitions and the upload and export workers were disabled. The current P0 setup and passing live workflow are described above. Live payment, email, SMS and AI provider acceptance remains separate.

## Client invitation diagnosis — 11 November 2026

Investigation of a reported CLIENT_ACCESS_UNAVAILABLE response used safe PostgreSQL metadata and one synthetic invitation on the default 127.0.0.1:5173 → 127.0.0.1:8080 stack. The supplied candidate inbox filename matched a successfully delivered invitation in collector_dev. Its token was unconsumed, unrevoked, within its validity period, and had no newer invitation for the same contact. The project/contact/workspace associations, initialized contact grant, and trial period were valid. No existing private invitation was exchanged during diagnosis. The candidate has not been matched to the failed browser request, so the original rejection cause remains unconfirmed.

Fresh synthetic client access succeeded in a separate browser context with service workers blocked. The correct project opened, a client draft was saved, and it persisted after reload. The exchange accepts the token from the URL fragment; projectId in the URL supports navigation/recovery, while the server derives the authorized project from the stored token. HTTP 401 alone cannot distinguish a malformed, unknown, expired, consumed, revoked, or otherwise unavailable capability.

Focused commands from their respective directories:

```powershell
# backend
.\mvnw.cmd '-Dtest=ClientAccessTests' test -B
# frontend, with the documented real 5173/8080 stack already running
node scripts/Smoke-ClientInvitation.mjs
```

The client-access suite passed 44 tests, including valid single-use exchange, wrong-project session denial, and four added rejection cases for superseded, revoked-contact, expired, and not-yet-valid invitations. The smoke script creates only synthetic account/workspace/project/contact records and reads the inbox link for its own generated recipient. It prints no links or tokens. Authentication behavior and startup settings were unchanged by this investigation.

For manual diagnosis, identify a file by its delivery-job filename and creation time. The private inbox may contain files from more than one local test database, and older files remain after an invitation is superseded. A 43-character token length confirms only its shape. Do not infer validity solely from file recency, resend repeatedly, or share private links. To establish the cause of a past failure, the failed request must first be correlated to its actual invitation. Keep public errors generic.

### Follow-up correlation — 11 November 2026

The subsequently supplied failed-request JSON was compared locally with persisted token digests without printing either value and without exchanging the link. It matched the earlier synthetic invitation smoke: that token had already been consumed at 10:04:50 Kabul time on 11 November. A successful CLIENT_ACCESS_EXCHANGED audit record and one client session confirmed its first exchange. Replaying it correctly returns CLIENT_ACCESS_UNAVAILABLE. It did not match the previously supplied candidate inbox filename.

The earlier candidate invitation was separately superseded at 15:07:56 Kabul time when a replacement was issued. These are different records. Resending replaces earlier unused invitation tokens for that contact, while existing sessions retain their normal validity. The confirmation dialog now explains replacement so clients can choose the newest invitation.

No authentication behavior changed. For manual verification, send one invitation for the intended contact, copy the complete URL from its corresponding inbox file, and open it once in the desired browser profile. Continue using the resulting client session. In a different profile, request or send a new invitation instead of reusing the consumed link. Do not resend again between copying and opening.

The supplied diagnostic JSON was moved intact from backend.local into the Git-ignored backend/.local directory. It remains private local diagnostic material. No real invitation was exchanged during this follow-up.
