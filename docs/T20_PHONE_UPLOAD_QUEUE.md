# M4 / T20 Part 1 — Phone upload queue and original option

1 November 2026. Baseline `dd11d60`. Implementation commit `12292a8`.

**Part 1 software changes implemented and locally verified. T20 remains In progress; M4 remains In progress.** Physical iOS/Android acceptance is pending. No production-readiness or full-MVP claim; no push.

## Original acceptance and scope

The preserved Section 22 roadmap defines T20 as **Phone upload queue and original option**, with acceptance **Real-device photo and error journeys pass**. Guide Sections 13.1–13.3 require actual transfer progress, server-confirmed READY, individual retry/cancel, private unchanged originals by default, an irreversible original discard choice, and secure verification/downloads.

T16–T19 already supply private reservations, idempotent finalization, mandatory scanning, sandboxed JPEG/PNG derivatives, canonical originals, quota accounting, authorized downloads and immutable submitted file retention. This task adds only missing frontend queue/recovery behavior. The existing feature is `features/client/`; it is preserved instead of creating a duplicate `client-portal/` feature. No T21 or later implementation, backend change, API contract change, dependency or migration.

## Queue behavior

- Multiple-file library/file selection, native camera input with `capture="environment"`, field-specific extensions and limits, empty/oversize validation, a 50-row batch bound and at most three in-flight transfer/verification operations. Live image inputs advertise JPEG/PNG; unsupported deployed codecs remain rejected.
- Progress is computed from actual XHR byte events, from 0 to 100. Unknown totals use an indeterminate progress element. Transfer completion and server verification are distinct; a signed PUT or finalize response never makes a file READY.
- Each file captures its original choice at selection, uses a stable reservation idempotency key and a stable finalize key, and retains its File object in memory for deliberate retry. Changing the checkbox affects files selected next.
- A retry checks a known asset before retransferring. READY is reused; UPLOADED/PROCESSING resumes status verification; a lost finalize acknowledgment is reconciled or replayed without sending bytes twice. A lost reservation acknowledgment reuses the original key/body. Explicit new attempts use new keys only after terminal/expired/cancelled state; known unfinalized reservations are released first when needed.
- Network loss aborts active browser transfers and holds queued files. Reconnection resumes queued work; interrupted attempts require per-file Retry. No automatic endless retry. Read-only editors, expired sessions and revoked access block further writes; 401/403/404 and READ_ONLY stop retries with fresh-link guidance. Quota errors retain the file and explain storage recovery.
- Cancel handles queued and active unfinalized transfers. Leaving the component aborts transfers and releases known unfinalized reservations where possible, including late reservation responses. Cancel is unavailable during finalize/verification. An uncertain finalize is never automatically deleted.
- If cancellation cannot reach the server, the UI says it is unconfirmed and relies on existing server expiry/cleanup. Unknown reservation acknowledgments and expiry are reconciled by existing server maintenance; immediate quota release is not promised. Successful uploads are never overwritten or silently removed to recover another file.
- Verification polling is bounded (40 checks, 600 ms intervals); slow jobs offer Refresh file status against the existing asset. Terminal rejection also refreshes persisted metadata so the file badge cannot remain stuck at Processing.
- Clear finished rows removes queue presentation only, not saved files or server quota reservations. It cannot remove an active cancellation before cleanup finishes. Existing explicit unused-file deletion remains separate and respects draft-save and immutable-history restrictions.
- Native labeled controls, non-submit action buttons, labeled progress elements and a polite aggregate announcement preserve accessibility. Existing responsive styles are reused; no shared UI redesign.

Selected files and credentials/URLs are not persisted in browser storage. Files remain available only while this component/page stays open. Uploads do not survive navigation, browser termination or device suspension by promise; returning users reload persisted server assets and may need to select interrupted files again.

## Original-file and security behavior

Keep originals defaults to true. Raster images capture the chosen value; documents always keep originals. Opt-out warns before selection that discarded originals cannot be recovered. The existing worker discards source bytes only after successful scan and derivative creation. Original bytes are not compressed or transformed by this frontend. Existing private canonical originals and separate working/thumbnail variants remain authoritative; all retained variants/history count toward quota.

The normal image Download uses the working PNG with its correct extension; a separate Download original requests the ORIGINAL variant when available. Supporting documents use their original bytes. Both use the existing authorized private download endpoint, never a public object URL. Signed download capabilities retain their existing short lifetime; no immediate revocation of already-issued capabilities is claimed.

Upload commands dispatch existing client-cookie/CSRF or agency RTK Query mutations. The small upload adapter preserves actual error status/code for recovery and resets mutation state afterward; it is not a second HTTP client. XHR remains solely the existing signed private staging PUT transport. Server authorization, tenant/item scope, CSRF/CORS, scan/decoder enforcement, transactional quota, canonical isolation and immutable submitted attachment restrictions are unchanged. UI file hints are not a security validator.

## Exact file manifest

Created:

- `frontend/src/features/client/api/uploadsApi.ts` — existing RTK mutation adapter with error propagation.
- `frontend/src/features/client/hooks/useUploadQueue.ts` — bounded queue, transfer, reconciliation, cancellation and recovery.
- `docs/T20_PHONE_UPLOAD_QUEUE.md` — this report.

Modified:

- `frontend/src/features/client/api/clientApi.ts` — optional asset-read error propagation; default caller behavior preserved.
- `frontend/src/features/client/components/UploadQueue.tsx` — use queue hook, per-file choice/progress/recovery controls and separate original download.
- `frontend/src/features/client/types/upload.types.ts` — reservation, intent, phase and recovery state.
- `frontend/tests/unit/attachments.test.tsx` — preserve 11 existing tests; add 10 focused queue/original/recovery tests and terminal refresh assertion.
- `frontend/tests/integration/real-auth/browser-check.mjs` — select the attachment checkbox by filename now that original choice is also available for FILE fields.
- `docs/IMPLEMENTATION_STATUS.md` — T20 In progress and current evidence.

Backend production/test files, architecture/API contracts, V1–V15 migrations, supplied specifications/templates and package manifests/lockfiles are unchanged.

## Verification actually executed

| Check                                  | Final current-source result                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Focused upload/attachment unit tests   | **21 passed / 1 file**, zero failures; 11 preserved + 10 new                                    |
| Strict TypeScript and production build | Passed via `npm run build` (includes `typecheck`); existing large-chunk advisory remains        |
| Changed-file ESLint                    | Passed, zero warnings                                                                           |
| Changed-file Prettier                  | Passed                                                                                          |
| Real HTTPS / MSW disabled              | **1 passed, 0 failures/errors/skips**: selected existing onboarding/client-attachment lifecycle |
| Focused responsive upload case         | **3 passed, 0 failures**: desktop 1440, tablet 768, phone 360, one complete selected run        |
| Visual inspection                      | Desktop and phone upload screenshots inspected; no horizontal overflow assertion failures       |
| Git whitespace check                   | Passed                                                                                          |

Unit coverage includes actual/indeterminate progress, three-transfer bound, pending/active cancellation, unmount release, slow verification, terminal rejection, lost reservation/transfer/finalize responses, stable retry intent/choice, offline holds, authorization stops, quota feedback, original opt-out, document retention and separate original download.

The selected HTTPS lifecycle uses a real local backend/PostgreSQL/private storage, scanner/worker fixture and actual browser requests with MSW disabled. It verifies READY-only saving/reload, unchanged private document bytes/download filename, denied unauthorized agency download and unsigned access, deletion, invalid-file rejection, retained immutable submission history/withdrawal/resubmission, and existing session/access regression steps. It is one JUnit lifecycle, not 889 backend regression tests. Synthetic mail/storage/scanner test fixtures do not establish production provider or physical-device acceptance. Current image byte integrity was reused from T19's verified backend, not newly re-proven by the frontend unit mocks.

Two earlier HTTPS runs failed and were corrected: first an ambiguous checkbox selector, then a genuine missing metadata refresh after verification rejection. The final entire selected lifecycle passed. Initial lint caught an effect cleanup ref warning; corrected without suppressing the rule. Build/tests were repeated only after these actual corrections; preliminary successes are not added to final counts.

Commands from project root (PowerShell):

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test -- tests/unit/attachments.test.tsx --maxWorkers=1 --pool=threads
npm run build
npx eslint src/features/client/api/clientApi.ts src/features/client/api/uploadsApi.ts src/features/client/components/UploadQueue.tsx src/features/client/hooks/useUploadQueue.ts src/features/client/types/upload.types.ts tests/unit/attachments.test.tsx tests/integration/real-auth/browser-check.mjs --max-warnings 0
npx prettier --check src/features/client/api/clientApi.ts src/features/client/api/uploadsApi.ts src/features/client/components/UploadQueue.tsx src/features/client/hooks/useUploadQueue.ts src/features/client/types/upload.types.ts tests/unit/attachments.test.tsx tests/integration/real-auth/browser-check.mjs
Set-Location -LiteralPath '..\backend'
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck#realHttpsWorkspaceOnboardingWithoutMocks' test
Set-Location -LiteralPath '..\frontend'
.\node_modules\.bin\playwright.cmd test tests/e2e/product.spec.ts --grep 'client upload processing'
```

Ignored evidence: `frontend/.artifacts/t20-targeted-final.log`, `t20-build-final.log`, `t20-lint-final.log`, `t20-format.log`, `t20-responsive.log`; screenshots under `.artifacts/playwright/e2e/`. Backend integration evidence: `backend/target-t20-https-verified.log`; the earlier `target-t20-https.log` and `target-t20-https-final.log` retain failures. No raw customer data or credentials were committed.

Intentionally not executed: all 889 backend tests/backend clean verify, focused backend scanner/codec suites, all frontend unit tests, unrelated auth-only HTTPS lifecycle, full 75-case responsive suite, production PWA suite, new migration/JAR verification. Backend, shared styles/navigation, PWA, migrations and dependencies did not change. Existing T19 historical results remain historical, not current T20 reruns.

## Remaining acceptance

Physical iOS and Android devices are unavailable in this environment. Both remain **pending** for camera permission/capture, library multi-selection, orientation/photo formats and original/working downloads, large-photo progress, airplane-mode/interruption/retry/cancel, quota/session expiry/revocation, and re-entry without losing saved server work. Mobile viewport testing does not replace these checks. Native HEIC/HEIF/WebP still require deployed decoder smoke/device acceptance; no new codec support is claimed.

T20 stays In progress until its real-device photo/error acceptance passes. T04 hosted CI, T05 live providers/resend, T06 deployment, T11 reopening, T16 production storage/scanner/codec/device gates and T22 publication remain pending. No original roadmap task or release gate is silently closed.
