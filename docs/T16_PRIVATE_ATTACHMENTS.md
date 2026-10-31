# T16 Part 1 — private attachments

Status: Part 1 implemented and locally verified; T16 and M3 remain In progress (2026-10-31). M3 remains In progress. This is the explicitly requested T16 secure-upload batch; the supplied Section 22 roadmap still calls T16 autosave, T18 uploads and T19 scanning. No roadmap task was renamed. No submissions, immutable revisions, approvals or exports were added.

## Implementation

`attachment/controller`, `service`, `repository`, `entity`, `dto`, `security` and `storage` own HTTP contracts, lifecycle transactions, scoped SQL metadata, internal records, safe DTOs, live authorization and private provider operations respectively. Existing `clientaccess`, `collection` and project permissions remain authoritative. No second identity or HTTP transport was introduced.

V14__attachment_storage.sql creates `file_assets` and `upload_reservations`, scoped foreign keys to project items and contacts, unique random storage keys, state/size/lease checks, processing and cleanup indexes. It does not modify V1–V13 or supplied specifications. File bytes stay out of PostgreSQL. The existing workspace storage counters are reused.

The frontend keeps the established `features/client/` ownership, rather than duplicating it into `client-portal/`. UploadQueue is shared with existing mock demonstrations but real collection explicitly supplies live rules, idempotency, metadata refresh, current draft values and save-before-delete coordination. RTK Query carries client cookies and CSRF; only signed object transfer uses XHR for byte progress. Access tokens remain in memory, and client calls carry no agency bearer.

## Feature trees

```text
backend/src/main/java/com/ayaantrix/collector/attachment/
  controller/  ClientAttachmentController, AgencyAttachmentController
  service/     AttachmentService, AttachmentValidationService, AttachmentWorker, AttachmentWorkerRunner
  repository/  AttachmentRepository
  entity/      Attachment
  dto/         AttachmentDtos
  security/    AttachmentAuthorization
  storage/     PrivateObjectStorage, S3PrivateObjectStorage, MalwareScanner, ClamAvScanner, SandboxedImageProcessor

frontend/src/
  app/store/store.ts
  features/client/
    components/ClientDraftField.tsx
    components/CollectionPortal.tsx
    components/TypedValue.tsx
    components/UploadQueue.tsx
    schemas/collectionSchema.ts
frontend/tests/
  unit/attachments.test.tsx
  integration/real-auth/browser-check.mjs
```

## API inventory

All paths start `/api/v1`. All application responses use no-store.

| Method | Path | Result |
| --- | --- | --- |
| POST | `/client/projects/{project}/uploads` | 201 private upload reservation; Idempotency-Key required |
| POST | `/client/projects/{project}/uploads/{upload}/finalize` | 202 PROCESSING or existing state; Idempotency-Key required |
| DELETE | `/client/projects/{project}/uploads/{upload}` | 204 cancel eligible unreferenced upload |
| GET | `/client/projects/{project}/assets/{asset}` | safe metadata envelope |
| DELETE | `/client/projects/{project}/assets/{asset}` | 204 remove eligible unreferenced draft attachment |
| POST | `/client/projects/{project}/assets/{asset}/download` | 60-second signed GET for requested eligible variant |
| POST | `/workspaces/{workspace}/projects/{project}/assets/{asset}/download` | same, after live agency project-read authorization |

Reserve body: `{itemId, originalName, contentType, bytes, keepOriginal}`. Result: `{assetId, uploadId, putUrl, requiredHeaders, expiresAt}`. Download body: `{variant: ORIGINAL|WORKING|THUMBNAIL}`. Storage keys, credentials, leases and provider responses are never public metadata. The catalog has no agency file-list endpoint; this batch implements the specified agency download contract rather than inventing one.

## Lifecycle and invariants

A ten-minute signed PUT writes only a random staging key. Reservation locks the workspace before project, enforces quota/count limits in PostgreSQL and marks the item DRAFT so T11 protects collected work. Intent replay reuses the same reservation without double charging; changed input conflicts. The replay record stores an asset ID, not signed URLs. Finalize checks actual object size outside the transaction, then repeats authorization/state checks under database locks before queuing work. Repeated finalize cannot duplicate the job.

The durable PROCESSING row is leased for ten minutes. Both caught failures and expired leases after process crashes have a three-attempt ceiling; exhausted work fails closed and releases its reservation. No provider call is held inside the database transaction. The worker reads a bounded byte snapshot, verifies format, requires ClamAV INSTREAM success, transforms images in a separate restricted container and writes new private canonical keys. It never copies the mutable staging object after scanning. Candidate keys are recorded before external writes. The final transaction repeats grant, workspace, project, writable subscription, item and lease eligibility before READY and swaps reserved bytes for actual retained bytes exactly once. Failures retry with bounded backoff, then FAILED; infected/invalid files become REJECTED. Quarantined content cannot be downloaded or referenced in answers.

Workspace/project locks serialize access with existing grant revocation, assignment/membership changes, project lifecycle changes and structure/draft mutations. A stale or cancelled lease cannot publish READY. Live permissions are checked for every signed download request. Existing plan read-only/grace rules block new upload writes and worker publication; already READY downloads remain readable. The real collection canUpload capability reflects this restriction. An already-issued signed capability can remain usable until its 60-second expiry; revocation prevents new capabilities. Objects have attachment/octet-stream metadata as a safe fallback even for compatible providers that ignore response-header overrides.

Draft values contain UUID assetIds, including IMAGE cells in repeater rows. References must be READY and belong to the exact workspace/project/item. Save-before-delete prevents removing a file while its persisted draft still references it. Replacement means uploading a new asset, explicitly selecting it and saving, then unselecting/removing the old asset. Original IDs are never regenerated. Hidden answers/files are retained and become inaccessible through hidden item routes. Semantic structure edits remain REOPEN_REQUIRED under existing T11 rules; no fake reopening/revision implementation exists.

Expired intents release quota once. Cleanup deletes abandoned staging and failed-attempt objects after the 24-hour retention window; READY canonical variants are retained. Physical bytes remain charged until deletion succeeds. Deleted READY rows reset cleanup eligibility. Daily reconciliation recomputes counters from the durable ledger. Cleanup is retriable and candidate objects survive worker/process failures in the ledger.

## Validation and deployment restrictions

- Raster formats currently verified: JPEG and PNG. Images <=50 MiB, <=50 million pixels. A bounded 32 MiB derivative budget is reserved in addition to source bytes. Working PNG <=2560px long edge and thumbnail <=480px; no upscale, orientation normalized, metadata stripped, alpha preserved. keepOriginal defaults true in the UI; false discards the staging original only after successful private derivatives.
- Documents <=100 MiB: UTF-8 TXT, parsed nonencrypted PDF, constrained DOCX and SVG attachment. Extension/MIME agreement and actual content checks are server enforced. Empty, executable, script, archive, password-protected and malformed files are rejected. DOCX ZIP entries have count/expanded/XML-part limits and macro/embedded executable restrictions. Streaming XML parsing disables DTD/external entities, bounds nesting and checks required DOCX part roots/namespaces. SVG parsing rejects scripts/events, including namespaced script elements and external href references; SVG is never rendered inline.
- WebP/HEIC/HEIF remain rejected until deployed decoders and representative smoke tests pass. They are not advertised in real upload inputs. Physical mobile camera/HEIC device acceptance remains a deployment gate.
- Mandatory ClamAV must return exact clean status. Missing/unavailable scanner fails closed. Production must monitor fresh definitions and isolate scanner access. The small test signature database is test-only, never a production configuration.
- ImageMagick 7.1.2.34-r0 runs in a pinned container base with no network, read-only root, dropped capabilities, nonroot UID, 512 MiB/one CPU/PID limits and 45-second host timeout. Only PNG/JPEG coders are allowed. Output reads require bounded regular PNG files, reject malformed/oversized results and do not follow symbolic links. Generated container names are forcibly removed on failure; only a verified task temporary path is recursively cleaned.
- Application limits are not a substitute for provider-side lifecycle policies, request-size controls, least-privilege bucket IAM, storage monitoring or scanner definition monitoring. No production provider credentials were supplied. Actual R2/S3 deployment remains unverified.

## Verification evidence

Final local verification completed on 2026-10-31. All runs below passed; no failed or skipped case is counted as a pass:

| Check | Actual result |
| --- | --- |
| Focused attachment checks | 80 passed, zero failures/errors/skips: 36 PostgreSQL/private S3/clamd lifecycle cases, 41 format cases, three image-output boundary cases |
| Backend clean verify | 808 passed: 728 preserved + 80 attachment checks; zero failures/errors/skips; clean migration/restart/Hibernate checks and executable JAR packaging passed |
| Frontend unit | 144 passed: 133 preserved + 11 attachment cases |
| TypeScript / production build / lint / formatting | Passed with current frontend; existing >500 kB bundle warning remains |
| Real HTTPS, MSW disabled | 2 passed with actual providers and current code; zero failures/errors/skips |
| Responsive browsers | 75 passed in the complete current-code run: desktop 25, tablet 25, phone 25; no isolated reruns substituted for the complete result |
| Production PWA | 1 passed against a fresh production build; public-only cache/offline checks passed |
| Full-definition ClamAV rejection | Existing EICAR lifecycle rerun passed against actual full-definition ClamAV 1.5.4/daily 28169; not counted as a new test |
| Local setup tooling | PowerShell initialization ran twice against an isolated copied project; its temporary .env was unchanged on repeat. Private gateway health and Java bucket/CORS initialization passed twice with newly generated credentials. Compose validation and Java compilation passed. Existing user .env was never modified; disposable containers/volumes removed |

The real browser lifecycle exercises upload progress, server-confirmed READY, draft UUID persistence, reload, an actual client browser download with byte/filename checks, owner download, a revoked member's 404, denied unsigned object access, unselect/save/delete, rejected-content feedback and uploads denied after grant revocation. It runs with actual PostgreSQL, isolated authenticated S3 and clamd; no MSW/request interception is used. Client requests carry no agency bearer, and private persistence/cache checks remain active. The live client upload journey runs at 360px after the existing responsive client lifecycle.

The fixture's early S3 volume allocation and wildcard-port CORS failures were corrected with adequate volume slots and the exact browser origin. JPEG smoke testing exposed a missing Alpine codec package; the pinned JPEG package is now installed. A safe-header assertion exposed compatible-provider response override behavior, fixed by canonical attachment/octet-stream metadata. V14's two tables required updating the bootstrap table-count assertion from 23 to 25. A fake-timer unit driver was corrected to dispatch the file-change event and assert request readiness before advancing the clock; no timeout/assertion was relaxed.

One timed provider-outage run failed because the Windows host suspended for about 90 minutes. Its 55-second assertion remains unchanged. The subsequent focused 80-case run passed with a temporary process-scoped execution wake guard. No persistent power setting was changed. The final complete run then passed 80 focused checks, 808 backend tests, 144 frontend tests, two HTTPS lifecycles, 75 responsive cases and one PWA case. The late local-setup launcher failure was a PowerShell dotted-argument quoting issue; the launcher was corrected to an argument array and the full setup smoke passed. The Compose file already uses an argument array.

## Remaining gates

T16 stays In progress. Live production R2/S3 IAM/CORS/lifecycle configuration, monitored scanner-definition freshness, the deployed WebP/HEIC/HEIF decoder matrix and physical camera acceptance remain unverified. The supplied catalog provides agency download but no agency file-library listing endpoint; a real gallery data-list/detail contract still needs agreement. No undocumented public endpoint or production mock fallback was invented. Current marker/draft guards must be extended to immutable asset retention when T17/T22 introduce real revisions and deletion/publication workflows. T04 hosted CI, T05 provider/resend, T06 deployment/TLS, T11 reopening, and T22 publication dependencies remain pending. M3 remains In progress. No T17 workflow is included. Production provider/decoder/device verification is distinct from local automated evidence.

The tested local worker image is `collector-image-worker:t16`, image ID `sha256:b4ed381a90c6450881e8f2c6d5c6c9fee7bdb567d4d74b0b05bf45c0ea627a77`. Use an immutable verified image in deployment; the source Dockerfile pins its base and ImageMagick/JPEG package versions.

## Official references

- [AWS SDK Java presigned requests](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/examples-s3-presign.html)
- [AWS checksum configuration](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/s3-checksums.html): canonical writes use explicit SHA-256 headers, avoiding reliance on compatible-provider streaming trailer support.
- [ClamAV INSTREAM protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [ClamAV Docker deployment](https://docs.clamav.net/manual/Installing/Docker.html)
- [SeaweedFS](https://github.com/seaweedfs/seaweedfs/blob/master/README.md) is isolated local test/development storage, not a claim of production R2 acceptance.

## Files and commits

Implementation commits:

- `72efba8` — private storage, quarantine, metadata, scoped downloads and initial tests.
- `b0083fc` — real file fields integrated with serialized draft autosave.
- `3076e86` — processing/entitlement/XML/output boundaries and actual HTTPS acceptance.
- `222aed6` — pending-status reconciliation, read-only Retry and correct working-copy download naming.

The final local-readiness/documentation commit hash is reported in the final response. All test containers are stopped/removed; the verified worker image and stopped full-definition scanner/definition cache remain available locally. No push is authorized.


## Exact files created

31 created; 34 modified; no deletions. Paths are relative to the project root.

- `backend/compose.storage.yaml`
- `backend/scripts/Initialize-PrivateStorage.ps1`
- `backend/src/main/java/com/ayaantrix/collector/attachment/controller/AgencyAttachmentController.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/controller/ClientAttachmentController.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/dto/AttachmentDtos.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/entity/Attachment.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/repository/AttachmentRepository.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/security/AttachmentAuthorization.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/service/AttachmentService.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/service/AttachmentValidationService.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/service/AttachmentWorker.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/service/AttachmentWorkerRunner.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/ClamAvScanner.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/MalwareScanner.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/PrivateObjectStorage.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/S3PrivateObjectStorage.java`
- `backend/src/main/java/com/ayaantrix/collector/attachment/storage/SandboxedImageProcessor.java`
- `backend/src/main/resources/db/migration/V14__attachment_storage.sql`
- `backend/src/test/java/com/ayaantrix/collector/attachment/AttachmentStorageTests.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/AttachmentValidationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/StorageFixture.java`
- `backend/src/test/java/com/ayaantrix/collector/attachment/storage/SandboxedImageProcessorTests.java`
- `backend/src/test/resources/attachment/clamd.conf`
- `backend/src/test/resources/attachment/s3.json`
- `backend/src/test/resources/attachment/test.hdb`
- `backend/storage/InitializeBuckets.java`
- `backend/storage/image-worker/Dockerfile`
- `backend/storage/image-worker/policy.xml`
- `backend/storage/image-worker/process.sh`
- `docs/T16_PRIVATE_ATTACHMENTS.md`
- `frontend/tests/unit/attachments.test.tsx`

## Exact files modified

- `.gitattributes`
- `backend/.env.example`
- `backend/ARCHITECTURE.md`
- `backend/README.md`
- `backend/pom.xml`
- `backend/src/main/java/com/ayaantrix/collector/clientaccess/service/ClientPortalService.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/service/ClientAnswerService.java`
- `backend/src/main/java/com/ayaantrix/collector/collection/validation/ClientFieldValidator.java`
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
- `backend/src/test/java/com/ayaantrix/collector/template/TemplateCatalogTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/TeamCollaborationTests.java`
- `backend/src/test/java/com/ayaantrix/collector/workspace/WorkspaceFoundationTests.java`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `frontend/ARCHITECTURE.md`
- `frontend/src/app/store/store.ts`
- `frontend/src/features/client/components/ClientDraftField.tsx`
- `frontend/src/features/client/components/CollectionPortal.tsx`
- `frontend/src/features/client/components/TypedValue.tsx`
- `frontend/src/features/client/components/UploadQueue.tsx`
- `frontend/src/features/client/schemas/collectionSchema.ts`
- `frontend/tests/integration/real-auth/browser-check.mjs`
