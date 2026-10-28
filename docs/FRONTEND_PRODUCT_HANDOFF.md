# Product frontend integration — FE02–FE07

This supplements [the authentication handoff](FRONTEND_BACKEND_HANDOFF.md). The frontend is a development implementation against stateful MSW HTTP fixtures. It does not establish production authorization, persistence, scanning, provider delivery, database concurrency or payment correctness. Backend and original specification files are preserved.

## Run and switch environments

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
# Stop this project's existing Vite/preview process with Ctrl+C before reinstalling.
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Installation failed.' }
npm run dev:mock
```

Open `http://127.0.0.1:5173/`. Owner `owner@studio.example`, freelancer `solo@studio.example`, member `member@studio.example`; all use `ContentDemo!2026`. The owner has Northstar owner access and Juniper member access. The member has one assigned Northstar project, review permission and no export permission. These are synthetic identities only.

To integrate the owner's backend, stop Vite, set `VITE_ENABLE_MOCKS=false` in ignored `frontend/.env.local` (or remove its local true override), then:

```powershell
$env:VITE_ENABLE_MOCKS = 'false'
$env:VITE_API_BASE_URL = '/api/v1/'
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8080'
npm run dev
```

The existing Vite proxy uses `VITE_API_PROXY_TARGET`. Check `frontend/.env.example` for supported configuration. No server secrets belong in `VITE_` variables. Implement the API operations below and FE01 auth contracts before expecting this frontend to work with the preserved T03 backend, which currently denies product/auth requests. For a separate API origin configure exact credentialed CORS and CSRF/cookies; do not use wildcard origins. Production builds never enable mocks, including when the development flag is true.

## Routes and state

- Public `/`, `/pricing`, `/about`, `/status/:shareId`, existing authentication routes.
- Agency `/app` selects a workspace, `/app/onboarding` creates one when allowed.
- Under `/app/w/:workspaceId`: `/overview`, `/projects`, `/projects/new`, `/projects/:projectId`, `/templates`, `/team`, `/insights`, `/billing`, `/settings`.
- Project tabs use `?tab=checklist|preview|access|assignments|reminders|review|activity|exports|analytics|details`.
- Client `/client/access#token=…`, then `/client/projects/:projectId`. Explicit POST exchange only; a passive GET never consumes an invitation. The fragment is removed before exchange. The client uses a separate project session, not an agency bearer token.

Mock records, private answers, file Blobs, tokens and session state are memory-only. Full reload resets fixtures and signs users out. Stay in the same SPA tab for the end-to-end demo. Browser tabs do not share a fake database; real multi-tab/server concurrency must be tested against PostgreSQL. No localStorage/sessionStorage persistence is introduced.

Use the development-only **Demo scenarios** disclosure at the bottom right: normal, empty, list-failure, quota, read-only, grace, limit-reached, ai-failure, export-failure, conflict, expired-client. Apply before the relevant action. Conflict advances server answer versions while retaining client input. Normal restores entitlement writes but does not undo record changes. Reload fully resets the demo.

## HTTP conventions

All operations use `/api/v1/` through the existing agency/client RTK Query bases. Agency requests require the current bearer and live membership/assignment. Client requests require their own HttpOnly session cookie. Mutations acquire fresh CSRF protection and send `X-XSRF-TOKEN`; commands add an `Idempotency-Key` UUID. Implement server-side idempotency for creation, invites, submit, upload reservation, billing and jobs. Broad Product/ClientProduct RTK tags refresh dependent views after writes; workspace switch/logout clears both private caches.

Errors are RFC-style problem objects: `status`, `code`, `detail`, `currentVersion?`, `errors`, `traceId`. Expected codes include VERSION_CONFLICT, STRUCTURE_CONFLICT, STALE_REVISION, STALE_SUGGESTION, ITEM_LOCKED, READ_ONLY, ACCESS_REVOKED, CLIENT_SESSION_EXPIRED, LINK_UNAVAILABLE, STORAGE_LIMIT, SEAT_LIMIT, AI_ALLOWANCE, PARTIAL_ACK_REQUIRED, FILE_TYPE, FILE_SIZE and URL_EXPIRED. Do not include customer answers/tokens in messages or logs. GET failures expose retry controls. Conflict input remains in the current editor until the user resolves/discards it.

## Operations and actual envelopes

The copied `frontend/src/api/contracts.ts` supplies domain DTOs. `productTypes.ts` adds frontend aggregate responses. Original supplied contracts are unchanged. Lists of projects/clients use `{data, page:{page,size,totalElements}}`; page is zero based, default size 12, maximum 100. Other compact collections use `{data}`. Dates are ISO date-only; instants are ISO UTC; timezone values are IANA identifiers.

| Scope | Operations |
| --- | --- |
| Workspace | POST `workspaces`; GET/PATCH `workspaces/:w`; GET `workspaces/:w/settings` |
| Projects/customers | GET/POST `workspaces/:w/projects`, GET/PATCH `…/projects/:p`; GET/POST `workspaces/:w/clients` |
| Project lifecycle | POST `…/projects/:p/publish`, pause, resume, complete, reopen, archive, restore, delete-request |
| Templates | GET/POST `workspaces/:w/templates`; GET `workspaces/:w/template-versions/:v`; PUT `…/templates/:t/draft`; POST `…/templates/:t/versions` |
| Structure | POST `…/projects/:p/sections`; PATCH `…/sections/:s`; POST `…/sections/:s/items`; PATCH `…/items/:i/schema`; POST `…/structure/reorder` |
| Team/grants | GET `workspaces/:w/members`; POST `…/members/invite`; DELETE `…/members/:m`; GET/PUT/DELETE project assignments; GET/POST contacts; POST contact invite; DELETE contact access |
| Preview/reminders | GET project client-preview, progress, reminder-policy; PUT reminder-policy; POST reminders/preview and reminders/send; GET reminders/deliveries |
| Client access | POST `client-access/exchange`, request-link, logout |
| Client answers | GET `client/projects/:p/checklist`, `…/items/:i`; PUT item answer; POST submit/withdraw; GET/POST comments; POST events |
| Uploads | POST client project uploads; PUT returned signed URL; POST `…/uploads/:u/finalize`; DELETE upload; GET/DELETE assets; POST asset download |
| Review | GET agency project review-queue; GET item revisions, exact revision; POST review-decisions/reopen; GET/POST comments; GET activity |
| Exports | GET/POST agency project exports; GET export job; POST export download |
| Assistance | POST client item ai-drafts; GET client project ai-drafts/:job; POST job accept |
| Reporting/share | GET agency project analytics and workspace digest-preview; POST/DELETE project status-shares; POST public status-shares/:s/exchange; GET status-shares/:s/counts with `X-Status-Token` |
| Preferences/commercial | GET/PUT client notification-preferences; POST sms/verification, sms/confirm; DELETE sms/consent; GET workspace usage/subscription; POST billing/checkout, billing/portal; POST deletion-request; GET/DELETE me/sessions |

Projects accept `search`, `projectType`, `state`, `sort=updatedAt|title|dueDate`, `page`, `size`. Creation sends customer ID, title, project type, due date, timezone and optional template version ID. Detail returns `{project,progress,structure}`. Workspace detail returns `{workspace,entitlements}`. A template summary includes `versionId`; version detail is `{definition}`. Project creation copies the definition into independent section/item IDs.

Versioned changes send `expectedVersion`, or `expectedStructureVersion` for structure. Reorder sends every section exactly once plus `itemOrderBySection`. Schema changes require explicit `reopenAffected` for submitted/approved items. Server validation must reject invalid dependencies and reorder cycles atomically. Answers use `{value,expectedVersion,expectedStructureVersion,saveOperationId}`; response `{answer,itemVersion}`. Submit uses expected answer/structure versions; revision values, schema and asset references become immutable. Review requires the current revision ID plus expected item version; request changes requires a client-visible reason. Progress, reminder eligibility, review/export visibility and completion must all use the same evaluator.

## Uploads and exports

Reservation returns asset/upload IDs, signed PUT URL, required headers and expiry. Browser transfers at most three files concurrently, finalizes, polls processing, and selects only READY files. It shows original retention, quota/size/type errors, progress, retry/cancel and rejection. The server owns extension/MIME validation, decompression/image limits, malware/password scanning, canonical derivatives, transactionally reserved quota, signed URL scope and historical reference retention. HEIC/HEIF support is a backend decoder responsibility. SVG is download-only.

Mock bytes stay in memory. Names containing `reject`, `virus` or `password` simulate rejection; `failed` simulates processing failure. These names are scenario triggers, not scanning. No image decoding, AV scanning or canonical transcoding is claimed. Signed URLs are short-lived synthetic URLs and are not production signing. Downloads fetch the signed URL and save a Blob; response URLs must be safe HTTP(S), with Content-Disposition and no-store. Configure object-storage CORS for the frontend origin.

Export creation captures visible approved exact revisions and approved asset references, excludes drafts/internal notes and requires partial acknowledgement if required approvals remain. Formats are APPROVED_ZIP, APPROVED_JSON, APPROVED_MARKDOWN. Job states queue/run/ready/fail/expired; expiry 24h, fresh download links, stale project-version notices. Mock ZIPs use fflate and contain manifest JSON, Markdown and transferred fixture file bytes. JSON and Markdown are valid standalone downloads. The backend must enforce the 2 GB package cap, atomic snapshot consistency, durable jobs, retention and signed private downloads. Existing snapshots never change when an answer changes.

## Privacy, commercial and PWA boundaries

AI suggestions are deterministic joins of supplied synthetic facts. They never mutate answers until explicit acceptance, and never submit or approve. Acceptance rejects newer answer versions. Real provider moderation, durable jobs, facts policy and monthly reservation/refund accounting remain backend responsibilities.

Friction observations in the demo are labeled synthetic, with a 7-day completed window and minimum 10 eligible starts plus 10 completed windows. Do not interpret open windows as abandonment. Shares contain an alias, state, type, progress counts and update timestamp only; a share token must never authorize content/files. Enforce allowed embed origins at the response/CSP layer as well as token scope.

Checkout and portal redirect to an explicit mock return page. They never collect payment or silently change a plan. Prices ($19 Solo/$49 Agency) are proposed. Hosted production URLs and webhook-verified subscriptions/entitlements are backend responsibilities. SMS verification uses synthetic `123456`; no messages are sent. Consent, STOP suppression, quiet times, frequency limits, UNKNOWN outcome reconciliation and provider delivery require real integration tests.

The production service worker caches only a fixed public asset allowlist (offline page, manifest, icons). It never caches navigation responses or APIs, answers, files or tokens. Offline navigation shows an honest reconnect page. In-memory offline inputs are not guaranteed saved; no offline editing promise is made. Service-worker registration errors do not block the app. Development MSW and production PWA workers are never registered together.

## Contract decisions requiring backend agreement

- `GET workspaces/:w/settings` aggregates identity/logo/digest; PATCH workspace includes `logo` and `digestEnabled`. Logo is a validated small data URL in the mock; production should use private upload/reference DTOs. Confirm a dedicated logo operation before integration.
- `GET workspaces/:w/digest-preview` returns `{workspaceName,activeProjects,required,submitted,approved,clientAction}` from active projects. Confirm this preview envelope with the backend owner.
- Onboarding includes `planKey` alongside name/timezone. Template summaries need `versionId` to create an immutable snapshot.
- `demoUrl` and `demoCode` are development-only responses. Production must never return raw invitation/verification secrets in ordinary API responses.
- Client checklist embeds each answer, READY/processing asset metadata and client-visible comments. Exact DTO envelopes should be confirmed by the backend owner rather than serializing entities.
- Review queue returns `{data:[{item,revision}]}`. `POST …/review-decisions` returns `{item,decision}`. Export and AI responses use `{export}` and `{job}`.
- Counts-only reads use `X-Status-Token` after explicit fragment exchange. Add appropriate CSP frame-ancestors for allowed origins.
- The original `me/sessions` inventory has no profile-name change operation, so no unsupported profile mutation is invented.
- Rich provider behavior, real concurrency, persistence across reloads and production security cannot be verified through MSW. Run full backend contract/isolation tests before rollout.

## Dependency references

Pinned lucide-react icons use documented standalone, tree-shakable React components ([official guide](https://lucide.dev/guide/react/)). Mock ZIPs use the documented fflate API ([official zipSync reference](https://github.com/101arrowz/fflate/blob/master/docs/functions/zipSync.md)). The lockfile records the resolved versions. Existing React/Vite/HeroUI/RTK setup references remain in the frontend README.


## T09 Part 1 — real template catalog backend (28 October 2026)

The two existing GET catalog operations are now implemented: `workspaces/:w/templates` returns `{data: TemplateCardData[]}` including versionId, and `workspaces/:w/template-versions/:v` returns `{definition}`. They use the ordinary bearer transport and live URL-workspace membership checks, including MEMBER reads and immediate membership/session revocation. Optional projectType/industry filters combine on the server. Listing returns built-ins plus only the current workspace's published entries, latest immutable version per identity; drafts stay private. Definitions/array ordering and original developer keys are unchanged. Production IDs are deterministic source-key/version UUIDs; the synthetic 4444/5555 mock IDs are not production identifiers. Use IDs from each actual response.

No new frontend API path, UI, source fixture or contract type is required. The original summary's version field remains the selected version number; versionId is the already-documented frontend extension. Unknown/missing/inaccessible resources use safe 404 problem responses; anonymous reads use 401. Unsupported writes remain 403 default-denied. Catalog availability does not implement project creation, customer lookup, template copy/edit/publish or the rest of the mock-backed product. Those calls remain closed until their tasks. T10 must copy a version definition into independent structure; it must never use mutable catalog state as live project structure. See backend/README.md for schema validation boundaries and current status evidence.
