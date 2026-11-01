# M4 / T19 — Scanner, canonical copy and image variants

1 November 2026. Baseline: `02c793f`. **T19 Complete for original-roadmap local acceptance. M3 and M4 remain In progress.** No remote push, later workflow or production-readiness claim.

## Original scope and findings

Section22 names milestone **M4 Files review and exports**, task **T19 Scanner, canonical copy and image variants**, and acceptance **Unsafe staging bytes never become public READY content**. Findings were recorded in this report before production edits. Guide Sections11.4,13.1–13.3 and acceptance A17 require actual-byte validation, mandatory fail-closed scanning, isolated bounded image processing, private canonical writes independent of mutable staging, READY-only references/downloads and quota-safe failure/recovery.

T16 already implemented the upload/scanning pipeline; T17 retained exact immutable submitted files; T18 verified reservations/quota. These implementations were preserved. Inspection identified incomplete ClamAV response framing and insufficient independent validation of decoder output headers/metadata. No new persistence model, API or duplicate feature was needed.

T20 owns physical phone upload acceptance; T21 owns comments/review decisions; T22 owns lifecycle/reopening. WebP/HEIC/HEIF stay rejected until deployed decoder smoke tests pass. No T20/T21/later feature was added.

## Implementation

- **Scanner:** ClamAvScanner now requires a complete NUL-framed response and accepts only the exact clean verdict. EOF-truncated, wrong-delimiter, oversized and unexpected responses fail closed. Scanner contents are not logged/exposed. Existing network timeouts, bounded worker retries and FAILED handling remain.
- **Image output:** SandboxedImageProcessor checks bounded regular non-symlink PNG files, chunk lengths/CRCs, first/single IHDR, legal header fields, positive dimensions, separate2560/480 maximum edges, image-data presence, terminal IEND and no trailing payload. A small display-related chunk allowlist rejects EXIF, text, animation and unknown metadata. Existing32MiB aggregate derivative budget remains. This is bounded container/header validation; pixel decoding remains inside the sandbox.
- **Actual worker:** after auto-orient normalizes pixels, process.sh sets orientation Undefined so ImageMagick does not serialize private orNT metadata. The networkless pinned decoder retains read-only root, dropped capabilities, nonroot user, CPU/memory/PID/pixel/time limits and no delegates. Current local source/setup/fixtures use `collector-image-worker:t19`; original t16 image/history are preserved.
- **Canonical/history:** AttachmentWorker still scans a bounded byte snapshot, derives images, writes fresh random private canonical keys from those bytes, then repeats live eligibility/lease checks before atomically publishing READY. It never copies a still-mutable staging object. Finalization only queues work. Original-choice behavior, exact retained-byte accounting, cancellation/expiry, crash recovery, audit/idempotency and immutable submitted asset references remain unchanged.
- **Regression repair:** full responsive verification exposed an initial agency-bootstrap/client-exchange race. A401 with no agency identity had dispatched signedOut, resetting both API slices and canceling the independent client command. A narrowly scoped anonymousBootstrap transition now clears only agency queries during initial anonymous bootstrap (loading, no user/token/memberships). Explicit sign-out and authenticated-session loss still clear both caches. Server authorization/CSRF/JWT/client cookies remain unchanged. One deterministic network-gated test confirms the race fails against original source and passes after the fix.
- **Test reliability:** catalog authorization fixtures now use a fixed Clock, matching existing project fixtures, after a fresh-session setup failure in a complete run. All assertions and production session checks remain. Real HTTPS diagnostics now include a bounded first-line failure reason with URLs/token-shaped strings redacted.

## Architecture

```text
backend/src/main/java/com/ayaantrix/collector/attachment/
  controller/  ClientAttachmentController, AgencyAttachmentController (reused)
  service/     AttachmentService, AttachmentWorker, AttachmentValidationService (reused)
  repository/  AttachmentRepository (T18 quota preserved)
  entity/      Attachment (reused)
  dto/         AttachmentDtos (unchanged safe responses)
  security/    AttachmentAuthorization (unchanged live scope checks)
  storage/     ClamAvScanner, SandboxedImageProcessor (hardened)
               PrivateObjectStorage, S3PrivateObjectStorage (reused)
backend/storage/image-worker/
  Dockerfile, policy.xml (unchanged pinned dependencies/sandbox)
  process.sh (orientation metadata removal)
backend/src/test/java/com/ayaantrix/collector/
  attachment/AttachmentStorageTests.java, StorageFixture.java
  attachment/storage/ClamAvScannerTests.java, SandboxedImageProcessorTests.java
  template/TemplateCatalogTests.java
frontend/src/
  app/store/store.ts                     # agency-only initial-anonymous cache transition
  features/auth/store/authSlice.ts       # anonymousBootstrap action
  services/api/baseQuery.ts              # distinguish initial absence from authenticated expiry
  features/client/components/           # existing UploadQueue/ClientDraftField/CollectionPortal
  features/client/api/clientApi.ts       # existing transport; no second HTTP client
frontend/tests/
  unit/auth.test.tsx                     # deterministic race plus existing logout/expiry assertions
  integration/real-auth/browser-check.mjs # bounded redacted diagnostics
```

No empty package, new root-level Java feature class, duplicate entity or speculative service interface. Existing controllers remain thin, SQL remains in scoped repositories and transactions stay in services. No upload UI redesign or new identity model.

## API and database

No new endpoint, DTO contract, dependency, lockfile or migration. **V1–V15 and supplied specifications/templates are unchanged.** V14 owns assets/reservations; V15 protects immutable submitted versions and retained file references. API prefixes remain `/api/v1`:

| Method | Existing route | Behavior |
| --- | --- | --- |
| POST | `/client/projects/{p}/uploads` |201 private reservation; CSRF/client cookie/Idempotency-Key |
| POST | `/client/projects/{p}/uploads/{u}/finalize` |202 processing; repeated finalize is idempotent, never unscanned READY |
| DELETE | `/client/projects/{p}/uploads/{u}` |204 eligible staging cancellation and one-time release |
| GET | `/client/projects/{p}/assets/{a}` | Safe state/variant metadata; no keys/leases/scanner contents |
| DELETE | `/client/projects/{p}/assets/{a}` |204 eligible unreferenced draft removal; retained revisions protected |
| POST | `/client/projects/{p}/assets/{a}/download` | Live scoped READY/private download authorization |
| POST | `/workspaces/{w}/projects/{p}/assets/{a}/download` | Existing live agency project-read authorization |

Downloads retain safe attachment/no-store headers and60-second signed capability expiry; an already issued capability may survive revocation until expiry. Unsigned private reads remain denied. Clients cannot choose storage keys. Historical schema/value/assets are never reinterpreted or rewritten by these changes. Review/export permissions, tenant isolation, restricted CORS, default-deny, standard problems and request correlation are preserved. There is no real agency file-list/detail endpoint added; that existing contract gap remains tracked under T16. API contracts are unchanged, so no handoff contract rewrite was required.

## Acceptance evidence

All final checks below passed on current source. Complete runs are distinguished from earlier failures and targeted diagnostics.

| Check | Actual final result | Ignored evidence |
| --- | --- | --- |
| Focused T19 |110 passed,0 failures/errors/skips:44 storage lifecycle,41 format,17 image-boundary,8 scanner-protocol | backend/target-t19-focused-final.log |
| Backend clean verify |889 passed,0 failures/errors/skips;865 baseline +24 new | backend/target-t19-clean-verify-final.log |
| Frontend unit |162 passed /9 files;161 baseline +1 race case | frontend/.artifacts/t19-unit-final.log |
| Strict TypeScript / production build | Passed; existing >500kB advisory remains nonfatal | frontend/.artifacts/t19-build-final.log |
| Zero-warning lint / formatting | Passed | frontend/.artifacts/t19-lint-final.log, t19-format-final.log |
| Real HTTPS, MSW disabled |2 complete lifecycles passed,0 failures/errors/skips after final frontend fix | backend/target-t19-https-final.log |
| Complete responsive run |75/75 passed:25 desktop,25 tablet,25 phone; no isolated reruns substituted | frontend/.artifacts/t19-responsive-final.log |
| Fresh production PWA |1/1 passed; fixed public assets only and honest offline navigation | frontend/.artifacts/t19-pwa-final.log |
| Worker/setup smoke | Rebuilt actual t19 image; direct output inspection; initializer repeat preserved environment | backend/target-t19-image-build.log and isolated setup smoke |

Backend verification includes fresh/upgrade/restart Flyway, Hibernate validate, quota/concurrency/rollback, live authorization, stable structure/snapshot and immutable submission regressions. Boot JAR packaging and resource/class inspection passed. All865 existing backend and161 frontend cases remain enabled. Actual storage/scanning use disposable PostgreSQL/private S3-compatible/clamd fixtures; the small deterministic scanner signature database is test-only. No production-provider credentials or delivery are used.

Actual image tests verify maximum bounds, alpha, JPEG support, EXIF rotation, stripped metadata, unchanged originals and no upscaling. Scanner tests verify real protocol frames plus actual clamd clean/EICAR/outage behavior. Existing staging-overwrite and private-download tests ensure mutable untrusted bytes cannot replace canonical content. Actual HTTPS covers uploads, immutable revisions, retained downloads and separate client/agency sessions. Responsive browser tests explicitly use development HTTP mocks; their later-workflow screens do not prove backend acceptance. Production PWA uses a fresh non-mock build.

## Failed stages and practical limits

1. First focused run:110 executed,105 passed/5 failed. The stricter output boundary rejected ImageMagick orNT; four image expectations failed and their queued retries affected a scanner-outage dispatch test. An exclude-chunk option did not remove orNT in the pinned image; documented `-orient Undefined` did. The actual worker was rebuilt and all110 focused cases passed. No assertion/timeout/retry limit was weakened. Earlier evidence:backend/target-t19-focused.log.
2. First full backend run:889 executed,888 passed/1 error,0 skipped. A new catalog fixture session was unavailable during tenant creation. The exact host clock/precision event was not captured, so a clock adjustment is not claimed as proven. Fixed test time removed wall-clock dependence from that non-time-related suite; all27 catalog tests and the full889 rerun passed. Production security was unchanged. Earlier evidence:target-t19-clean-verify.log; focused catalog evidence:target-t19-template-regression.log.
3. First HTTPS run:2 executed,1 passed/1 failed at cross-tab logout after upload/submission/retention steps passed. The original generic Error did not reveal its cause. Redacted diagnostics were added; both the complete diagnostic rerun and final-source complete run passed. Its exact earlier cause remains unconfirmed; no claim that the diagnostic change fixed it. Earlier evidence:target-t19-https.log; intermediate:target-t19-https-diagnostic.log; final:target-t19-https-final.log.
4. First responsive run:74 passed/1 desktop failure at invitation exchange, not75 passed. Earlier log-tail progress updates incorrectly described all desktop cases as passing; the final report corrects that. A deterministic network-gated race reproduced the production cache-reset problem, and the original source still failed after the unit selector was corrected for multiple checklist buttons. The fix passed all162 unit cases, both real HTTPS lifecycles and a fresh full75-case responsive run. No sleep, timeout inflation or automatic invitation retry. Failure trace/log:.artifacts/playwright/e2e/ and t19-responsive.log; confirmed red:t19-client-race-confirmed-red.log. Explicitly filtered diagnostic unit runs are not full acceptance and no test.skip was added.
5. The new test's initial single-button query was ambiguous; it now checks the first visible checklist button, matching the existing journey. An old1px base64 PNG fixture also had a bad IDAT CRC; it was replaced with a generated valid PNG rather than loosening validation. Source restoration for the red test changed line endings in3 files; Prettier fixed them and build/lint/format passed again.

The setup helper was exercised twice in a disposable OS-temp project copy, including byte-for-byte preservation on repeat. User .env was untouched. Synthetic temporary setup files are left to normal OS-temp cleanup; no running service uses them.

## Required worker upgrade and reproduction

Verified local image:`collector-image-worker:t19`, image ID `sha256:fbf8e3fb33ebc77d48e72d0c2783b7bc799162e4544e52e750726704466377b2`. Base/codec pins are unchanged. New example/initializer defaults use t19; existing .env values are deliberately preserved. Existing environments must explicitly select the rebuilt worker. Do not erase .env or database volumes.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
docker build -t collector-image-worker:t19 .\storage\image-worker
if ($LASTEXITCODE -ne 0) { throw 'Image worker build failed.' }
$env:IMAGE_WORKER_IMAGE = 'collector-image-worker:t19'
# Use the existing database/private storage/scanner setup in backend/README.md.
.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run
```

Verification, with Java21, Docker Linux engine, installed frontend dependencies and Edge; run serially and stop on failure:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=AttachmentStorageTests,AttachmentValidationTests,SandboxedImageProcessorTests,ClamAvScannerTests' test
if ($LASTEXITCODE -ne 0) { throw 'Focused T19 checks failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real HTTPS checks failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test -- --maxWorkers=1 --pool=threads
if ($LASTEXITCODE -ne 0) { throw 'Frontend unit failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
npm run format:check
if ($LASTEXITCODE -ne 0) { throw 'Formatting failed.' }
npm run test:browser
if ($LASTEXITCODE -ne 0) { throw 'Complete responsive suite failed.' }
npm run test:pwa
if ($LASTEXITCODE -ne 0) { throw 'Production PWA failed.' }
```

## Exact file manifest

Created2:

- `backend/src/test/java/com/ayaantrix/collector/attachment/storage/ClamAvScannerTests.java`
- `docs/T19_IMPLEMENTATION.md`

Modified17:

- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/scripts/Initialize-PrivateStorage.ps1`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/ClamAvScanner.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/SandboxedImageProcessor.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/AttachmentStorageTests.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/StorageFixture.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/storage/SandboxedImageProcessorTests.java`
- `backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java`
- `backend/storage/image-worker/process.sh`
- `docs/IMPLEMENTATION_STATUS.md`
- `frontend/tests/integration/real-auth/browser-check.mjs`
- `frontend/src/app/store/store.ts`
- `frontend/src/features/auth/store/authSlice.ts`
- `frontend/src/services/api/baseQuery.ts`
- `frontend/tests/unit/auth.test.tsx`

No deletions, applied-migration/specification/template changes, dependency/lock changes or security relaxation. Implementation commits:`cab063b` (scanner/variants/worker/tests/setup), `7bd34a1` (catalog fixture clock), `74f277d` (redacted diagnostics), `a6b7a3b` (client-bootstrap isolation). Final documentation commit and post-commit clean-tree check are reported in the final response. Nothing pushed.

## Remaining gates

No remaining local T19 scanner/canonical/variant acceptance blocker was found. T04 hosted CI, T05 provider/delivery, T06 deployed TLS/key/retention, T11 collected-content reopening, T16 production storage/IAM/scanner monitoring/device acceptance and T22 publication remain open. WebP/HEIC/HEIF remain rejected until verified in deployment. Physical camera/native picker acceptance belongs to T20. Local synthetic fixtures cannot prove production scanner-definition freshness, bucket IAM, backups/retention or real devices. The earlier unreproduced HTTPS logout error remains a diagnostic risk; final complete runs passed, not a claim that every historical intermittent cause is solved. M3/M4 remain In progress; the next original task is T20 Phone upload queue and original option.

## Official references checked

- [ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html): z-command framing and INSTREAM behavior.
- [W3C PNG specification](https://www.w3.org/TR/png/): container/chunk/header/CRC rules.
- [ImageMagick command options](https://imagemagick.org/command-line-options/): orientation Undefined removes orNT after pixel auto-orientation.
