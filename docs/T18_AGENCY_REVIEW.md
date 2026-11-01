# T18 — private upload reservations and quota

Date: 1 November 2026. Baseline: `d040a3a`. **T18 Complete for original-roadmap private upload/quota acceptance. M4 remains In progress.**

## Scope correction

The task attachment calls T18 agency review, but explicitly directs the implementation to follow the original roadmap if it differs. Section 22 defines T18 as **Private upload reservations and quota**, accepted when **Concurrent reservations remain within allowance**. Acceptance A16 covers two uploads at the last available quota. Comments and review decisions belong to T21; project reopening belongs to T22, and approved exports to T23. The original specification and roadmap are unchanged. This requested report filename is retained to explain the discrepancy; it does not imply a new agency-review feature.

The earlier T16 private-attachment batch already implemented the reservation foundation. This task reuses it rather than creating duplicate upload persistence, routes, authentication, or a review subsystem. T17's existing agency revision reads and permission-protected project queue remain unchanged. No workspace-wide queue, search API, review decision, comment, notification, approval, reopening or export workflow is added.

## Implementation and contracts

Existing `attachment/controller`, `service`, `repository`, `entity`, `dto`, `security`, and `storage` retain their responsibilities. Reservation authorization uses the independent client session, live grant/workspace/project/item checks, ACTIVE state and writable subscription. Controllers remain thin, SQL remains in AttachmentRepository, and scoped authorization remains in AttachmentAuthorization/ClientAccessAuthorization.

Under the workspace-before-project lock, the repository conditionally increments reserved bytes only when used + reserved + requested capacity fits the workspace allowance. Source size plus bounded image derivative capacity is reserved. Asset/reservation rows, item collection state, audit and idempotency commit together. Replays do not charge twice. Finalization verifies actual private-object size; processing exchanges reserved for actual retained bytes. Cancellation/expiry release once. Retained submission files remain charged and cannot be deleted to evade quota.

The corrected standard 409 `STORAGE_QUOTA_EXCEEDED` problem adds `usedBytes` and `availableBytes`, as required by guide Section 10.3. Used means retained bytes; available is max(0, allowance - retained - outstanding reservations), measured under the same workspace lock as the failed decision. No storage keys, filenames, other tenant usage, signed URLs, provider failures or secrets enter the problem. Existing code, traceId, no-store and CSRF behavior are preserved. Unauthorized requests fail before usage is read.

All routes retain prefix `/api/v1`:

| Method | Existing route | Purpose |
| --- | --- | --- |
| POST | `/client/projects/{p}/uploads` | Scoped, CSRF/idempotency-protected reservation; 201 assetId/uploadId/private putUrl/requiredHeaders/expiresAt |
| POST | `/client/projects/{p}/uploads/{u}/finalize` | Idempotent processing request; never declares unscanned content READY |
| DELETE | `/client/projects/{p}/uploads/{u}` | Cancel an eligible unsubmitted staging upload; release once |

Other existing metadata/download/removal contracts are documented in [T16](T16_PRIVATE_ATTACHMENTS.md). No new public endpoint or response entity is introduced. The existing frontend upload queue and RTK Query transport continue to handle quota failures; no UI or frontend package change is required.

## Persistence and history

No migration is required. V1–V15 remain unchanged. V14 owns private asset/reservation tables and scoped constraints/indexes; V15 protects immutable submitted revisions and retained files. Current draft replacement never rewrites historical schema, answers, IDs or attachment bytes. Download requests continue live authorization and READY/retention checks through the existing private-download subsystem; an already issued signed GET retains its documented 60-second expiry boundary.

## Focused regression

The 40 pre-existing AttachmentStorageTests passed before changes. A new parameterized HTTP/PostgreSQL regression exercises a quota rejection with and without outstanding reservations: correct 409/code/used/available/traceId, no extra reservation, unchanged existing reserved bytes. Existing simultaneous quota and file-slot races, idempotency, cancellation/expiry, rollback, tenant/grant/session denial, processing, scanning, retention and private-download tests remain enabled.

## Verification evidence

Current-code checks on 1 November 2026:

| Check | Actual result | Ignored evidence |
| --- | --- | --- |
| Focused storage | 42 passed, zero failures/errors/skips; all 40 baseline cases plus 2 quota cases | backend/target-t18-focused-final.log |
| Backend clean verify | 865 passed, zero failures/errors/skips; all 863 baseline cases preserved | backend/target-t18-clean-verify.log |
| Frontend unit | 161 passed across 9 files; unchanged test suite | frontend/.artifacts/t18-unit.log |
| Strict TypeScript / production build | Passed; existing >500 kB bundle advisory remains nonfatal | frontend/.artifacts/t18-build.log |
| Zero-warning lint / formatting | Passed | frontend/.artifacts/t18-lint.log, t18-format.log |
| Real HTTPS, MSW disabled | 2 passed, zero failures/errors/skips; actual PostgreSQL/private S3-compatible provider/clamd fixtures | backend/target-t18-https.log |
| Complete responsive suite | 75/75 passed in one complete run: desktop25, tablet25, phone25; no isolated reruns substituted | frontend/.artifacts/t18-responsive.log |
| Fresh production PWA | 1/1 passed against a fresh production build; public-only caching/offline checks | frontend/.artifacts/t18-pwa.log |

Backend verification includes clean/upgrade/restart Flyway and Hibernate validation, scoped security/concurrency regressions, retained attachment history and executable Boot JAR packaging. JAR inspection confirms StorageQuotaException, AttachmentRepository and V15 resources. Real HTTPS preserves both existing lifecycle tests; no new review-queue browser acceptance is claimed. Test fixtures use synthetic accounts/content, not production provider credentials. No physical-device or production IAM acceptance is claimed.

## Remaining dependencies

M4 remains In progress. T04 hosted CI, T05 real provider/resend, T06 deployment/TLS/retention, T11 reason-bearing reopening, T16 production IAM/scanner/device/codec acceptance and T22 publication remain open. Physical camera/HEIC acceptance belongs to T20 and deployment, not viewport emulation. The agency file-library list/detail contract remains unresolved. T18 local quota acceptance does not establish production storage/provider or full MVP acceptance.


## Exact change manifest

Created (2):

- `backend/src/main/java/com/ayaantrix/collector/common/error/StorageQuotaException.java`
- `docs/T18_AGENCY_REVIEW.md`

Modified (7):

- `backend/src/main/java/com/ayaantrix/collector/attachment/repository/AttachmentRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/common/error/GlobalExceptionHandler.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/AttachmentStorageTests.java`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`

No frontend source/package move, dependency/lock change, source deletion, applied migration edit or supplied specification/template modification. Backend remains attachment plus existing common error infrastructure; frontend remains the existing feature tree. Implementation commit: `68a7d35` (quota problem and two regression cases). Documentation is committed separately; its hash is reported in the final response. No push is authorized or performed.

## Reproduce

Start Docker Desktop's Linux engine first. Java21, existing Node dependencies and Edge are required. Run commands serially and stop on any nonzero exit:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd '-Dtest=AttachmentStorageTests' test
if ($LASTEXITCODE -ne 0) { throw 'Focused tests failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'HTTPS verification failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test -- --maxWorkers=1 --pool=threads
if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'TypeScript/build failed.' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
npm run format:check
if ($LASTEXITCODE -ne 0) { throw 'Formatting failed.' }
npm run test:browser
if ($LASTEXITCODE -ne 0) { throw 'Responsive tests failed.' }
npm run test:pwa
if ($LASTEXITCODE -ne 0) { throw 'PWA tests failed.' }
```


## Package inventory and status

```text
backend/src/main/java/com/ayaantrix/collector/
  attachment/
    controller/ClientAttachmentController.java    # reused; unchanged
    service/AttachmentService.java                 # reused; unchanged
    repository/AttachmentRepository.java           # quota figures under existing lock
    dto/AttachmentDtos.java                        # reused; unchanged
    security/AttachmentAuthorization.java          # reused; unchanged
    entity/Attachment.java                         # reused; unchanged
    storage/                                       # existing private providers; unchanged
  common/error/
    StorageQuotaException.java                     # new safe numeric quota context
    GlobalExceptionHandler.java                    # serializes quota fields
frontend/src/features/client/
  components/UploadQueue.tsx                       # unchanged existing integration
  components/ClientDraftField.tsx                  # unchanged existing integration
  api/clientApi.ts                                # unchanged existing transport
```

All current local checks passed. T18 is Complete only for its original private-reservation/quota acceptance; M4 remains In progress and later review workflows are not complete. No new review/detail contracts or reviewer permission changes are claimed. Existing T17 historical schema/value/asset snapshots, agency project-read versus canReview/canExport distinctions, tenant isolation and immutable reads remain unchanged and their regressions passed. Real HTTPS results cover the existing lifecycles, not the attachment's deferred workspace review/search functionality. All disposable test containers were removed; Docker Desktop may remain running. Working-tree/commit status is checked after the documentation commit and reported in the final answer.
