# FE01 frontend/backend handoff

For FE02–FE07, see [the product integration handoff](FRONTEND_PRODUCT_HANDOFF.md): product routes, actual HTTP operations/DTO envelopes, versioning, uploads/exports, mock scenarios, environment switching and remaining backend responsibilities. Authentication details below remain applicable. Frontend mock checks do not establish backend or production acceptance.

Updated 22 October 2026. The owner implements the backend manually. FE01 delivers frontend architecture and authentication UI; it does **not** validate server authentication, tenant isolation, cryptography, email delivery or full-stack roadmap acceptance. `backend/` and the supplied specifications are unchanged by FE01.

## One HTTP path

React components use `features/auth/authApi.ts`, injected into the agency RTK Query API. `api/baseQuery.ts` supplies the configurable base URL, credentialed requests, fresh CSRF tokens before mutations, agency bearer headers and coordinated refresh. The separate client API never performs agency refresh. MSW intercepts these same HTTP requests in explicitly enabled development and test modes. Components do not branch between real and mock services.

All paths below are relative to `/api/v1/`. Shapes follow `docs/spec/api_catalog.json` and `api_contracts.ts`, except the explicitly proposed resend operation. Responses are JSON unless noted.

| Method / operation | Request | Success response |
| --- | --- | --- |
| GET `auth/csrf` | None | 200 `{token: string}` |
| POST `auth/login` | `{email, password}` | 200 `{accessToken, expiresIn: 300, user: UserSummary}` plus server refresh cookie |
| POST `auth/refresh` | `{}` and cookie | 200 `{accessToken, expiresIn: 300}` plus rotated server refresh cookie |
| GET `me` | Bearer header | 200 `{user: UserSummary, memberships: MembershipSummary[]}` |
| POST `auth/register` | `{email, displayName, password}` | 202 `{message: string}` with generic verification guidance |
| POST `auth/verify-email` | `{token}` | 200 `{verified: true}` |
| POST `auth/resend-verification` | `{email}` | Proposed 202 `{message: string}`; generic response |
| POST `auth/forgot-password` | `{email}` | 202 `{message: string}`; generic response |
| POST `auth/reset-password` | `{token, password}` | 200 `{message: string}`; backend revokes previous sessions |
| POST `team-invitations/accept` | `{token}`; `Idempotency-Key` header | 200 `{membership: MembershipSummary}` |
| POST `auth/logout` | `{}` and cookie/bearer/CSRF | 204 with no body; backend revokes session and clears refresh cookie |

`UserSummary = {id, email, displayName, verified}`. `MembershipSummary = {memberId, workspaceId, workspaceName, role: "OWNER" | "MEMBER"}`. IDs are UUID strings. Login, `/me` and refresh-response payloads are runtime-validated with Zod; refresh cookies are never read by frontend code. Workspace selection currently uses `/me.memberships`; it does not require an additional workspace-list call. The mock includes GET `workspaces` for compatibility but FE01 does not call it.

**Contract addition to agree before real integration:** the guide requires verification resend but the supplied endpoint inventory does not name it. FE01 proposes POST `auth/resend-verification`; change the single endpoint/handler if the owner's backend chooses a different route. Existing specification files were not edited.

## Cookies, CSRF and session lifecycle

- Requests use `credentials: include`. Use one origin in production. Vite proxies `/api` to `VITE_API_PROXY_TARGET` during real-backend development. For a separately hosted API, the backend must allow exact origins with credentials, configure cookies appropriately and retain browser CSRF protection; wildcard credentialed CORS is invalid.
- The backend must set opaque rotating refresh credentials in a Secure, HttpOnly, SameSite=Lax cookie with an appropriate path. FE01 never reads that cookie. Production HTTPS, trusted origins, token rotation/reuse detection, revocation and cookie expiry are backend responsibilities.
- GET `auth/csrf` must return a fresh usable token; every mutation fetches it and sends `X-XSRF-TOKEN`. This also obtains a fresh token after authentication changes. Do not return a refresh credential through this endpoint.
- On bootstrap, the frontend obtains CSRF, attempts refresh, then fetches `/me`. A 401 refresh means signed out; transport/server/contract failures show a retry state. Agency calls may refresh once after a 401 and retry the original call. Authentication mutations are not automatically retried. An in-tab promise serializes refresh; Web Locks coordinate tabs where supported. A refresh conflict (409) is surfaced safely for retry; the frontend does not revoke a token family or claim success. Older browsers without Web Locks have only in-tab coordination.
- Access tokens, identity, active workspace and token-link codes are memory-only. Redux DevTools are disabled to avoid exposing request credentials there. No localStorage/sessionStorage/IndexedDB persistence is used. Logout and session expiry reset private API caches; workspace changes reset both API caches. A BroadcastChannel propagates logout without transmitting bearer tokens.
- Logout clears local identity only after server acknowledgement, or a 401 indicating the session is already gone. Network/server failures keep a visible retryable error rather than claiming server revocation.
- Email token links may use `#token=...`; FE01 captures a token into memory, strips it from history and waits for explicit submission. Query `token` is accepted for compatibility and removed too, but use fragments to avoid sending tokens in initial requests. An invitation survives a sign-in round trip in the same tab, never a full reload after its fragment is removed. Reopen the email link after reload. No email link is automatically consumed by rendering a screen.
- Sign-in redirects accept only same-origin `/app...` or `/team-invite` destinations, with traversal/escape/control-character checks. All other destinations fall back to `/app`. Frontend membership guards and owner navigation are UX only; the backend must enforce live permissions on every operation. Team invitation acceptance must enforce verified email match and idempotent single-use consumption.

## Errors and validation

Use `application/problem+json` with `{type, title, status, code, detail, traceId, errors: [{fieldPath, message}]}`. FE01 maps safe known codes to UI messages and displays generic transport errors. Recognized codes include `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_CONSUMED`, `INVITATION_EMAIL_MISMATCH`; 429 shows a wait message. Field errors attach only to known form fields. Do not send secrets, stack traces, SQL or raw tokens in error messages.

Passwords for registration/reset require 12–128 characters with confirmation and no arbitrary composition rule. Sign-in only requires a nonempty password so existing accounts are not blocked by registration rules. Forms use React Hook Form and Zod; the backend must independently validate every input. Recovery and registration confirmations deliberately avoid disclosing whether an account exists.

## Environment and startup

| Setting | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | HTTP base URL, default `/api/v1/`; relative or absolute |
| `VITE_API_PROXY_TARGET` | Vite-only real API target, default `http://127.0.0.1:8080` |
| `VITE_ENABLE_MOCKS` | Explicit development opt-in, default false; ignored in production |

Use `.env.local` (Git ignored) with the names in `frontend/.env.example` when overriding defaults. Never put backend secrets in VITE variables.

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm run dev:mock
```

Open `http://127.0.0.1:5173/sign-in`. The top label identifies synthetic development mode. No backend or database is required. Use `npm run dev` with mocks disabled to connect to the owner's API; T03's closed backend does not yet implement FE01 authentication contracts. Stop Vite with Ctrl+C before reinstalling dependencies on Windows.

Production: `npm run build`, then `npm run preview` to inspect the build. Production bundles do not enable MSW regardless of the mock flag; serve the API under the configured URL and rewrite application routes to `index.html`. The generated MSW worker asset is a development interception tool, not the FE07 PWA cache. No private content is cached by FE01.

## Synthetic accounts and scenarios

All demo accounts use `ContentDemo!2026`. Domains ending `.example` are synthetic.

| Email | Scenario |
| --- | --- |
| `owner@studio.example` | Alex, owner of Northstar Studio; member of Juniper Creative, to test workspace/role switching |
| `solo@studio.example` | Sam, freelancer owner of Juniper Creative |
| `member@studio.example` | Jamie, assigned team-member fixture in Northstar Studio; owner navigation unavailable |
| `unverified@studio.example` | Email verification required before sign-in |
| `offline@studio.example` | Simulated network failure |
| `busy@studio.example` | Simulated rate limit |
| Any wrong password | Generic invalid credentials |

Routes: `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password`, `/team-invite`, protected `/app`, and client foundation `/client/access`.

Token codes: `verify-valid`, `reset-valid`, `invite-valid`. Replace `valid` with `expired` or `consumed` for those errors; any other code is invalid. For example `/verify-email#token=verify-expired`. `verify-valid` targets the last registered account in this page session, defaulting to `unverified@studio.example`. `reset-valid` targets the last recognized recovery email, defaulting to the owner. `invite-valid` requires `member@studio.example`. Valid codes are consumed once per page session.

Mocks simulate latency, basic CSRF/bearer checks and in-memory account changes. They send no emails, set no real HttpOnly cookie, sign no JWT, persist nothing across reloads and prove no server security. Reload resets demo accounts/tokens/session; sign in again. The member is a role fixture; project assignments and project data belong to FE02+. Unknown mocked API operations return 501 instead of falling through to a real backend. Robust server idempotency, reminder delivery, billing and password security remain backend work.

## Verification commands

```powershell
npm run typecheck
npm run build
npm run lint
npm test
npm run test:browser
npm run format:check
```

The 24-test Vitest suite uses MSW's Node interceptor and fresh synthetic state. The 12-scenario Playwright suite uses installed Edge and an automatically managed mock server on port 5174. Browser regression instructions/results are recorded with FE01 in `IMPLEMENTATION_STATUS.md`. No backend tests or full-stack acceptance completion are implied.

## Boards 06–10 UI contract additions (2026-10-23)

Frontend uses the existing authenticated RTK paths. The following MSW additions require backend agreement/implementation; they do not constitute backend completion:

- Team invitation command accepts `assignments: [{projectId, canReview, canExport}]`. Validate every project before reserving a seat. Apply assignments only when the matching invited account accepts; reject expired/revoked/used invitations. The demo returns a synthetic `/team-invite#token=...` URL.
- Ownership transfer accepts `{targetMemberId,currentPassword}` at `POST /workspaces/{wid}/ownership-transfer`. Owner reauthentication and an active target member are required; refresh the signed-in identity after the role change.
- `GET /workspaces/{wid}/projects/{pid}/assets` returns `{data: AssetSummary[]}` with `itemLabel` and optional short-lived `previewUrl`. List/download requires live project access. Delete requires owner access and refuses immutable submission references. Signed demo download grants recheck live scope and expiration.
- Owner upload reservation/finalization/cancellation uses the corresponding project `/uploads` routes and `GET /assets/{id}` for processing. Shared reservation/type/size/quota/scan-state logic is reused without creating a client identity. Uploaded files are linked to a content item but never create a client submission.
- Export creation accepts optional `sectionIds`; validate against this project and snapshot only visible approved content in those sections. Existing version/partial-approval checks remain.

Reference details not supplied by current contracts: asset version lineage, dimensions, uploader/timestamps, member join dates, client last-access timestamps, and a client personal invitation message. These are not fabricated in the UI. File cards show real synthetic uploads, not the reference board’s sample clinic photographs. The service’s actual supported file types/limits and password rules take precedence over illustrative board text. Board frames, screen numbers and phone hardware are not application UI.

Still requires live backend/storage/email integration, actual camera/device testing, and visual acceptance against the supplied boards. No 100% pixel-match claim is made.


## Boards 11–14 UI contracts and gaps (2026-10-24)

- `PATCH /me/profile` accepts `{displayName}` for the authenticated account only. The mock validates non-empty names up to 100 characters and updates displayed workspace memberships. Refresh `/auth/me` after saving.
- `POST /me/password` accepts `{currentPassword,newPassword}`. The mock requires the current password, accepts 12–128 characters and revokes the synthetic other-device session. Production needs established password policy, secure hashing, rate limits, audit events and actual other-session revocation.
- Project analytics GET allows assigned members with live read access. Status share management remains owner-only. Optional `ProjectAnalytics.sections` contains `{id,title,progress}` using the same enabled/visibility/required rules as global progress. Server results must preserve those rules.
- Subscription status view refetches every 10 seconds while open; hosted checkout/portal remain the billing source of truth. The demo never marks a purchase paid merely because the browser returns.
- Workspace `digestEnabled` is daily, not weekly. Existing settings update persists enabled/timezone; digest preview is aggregate synthetic data and sends nothing. Delivery scheduling, authorized recipient selection and configurable send time need backend contracts.

Unimplemented API capabilities reflected by the reference boards: historical/day-grouped analytics and date/assignee filters, editable reminder templates/variables and sandbox test email, next eligible send times and live issue resolution commands, usage category breakdown, paid seat adjustment, personal photo upload, and data export job lifecycle. Avoid inventing these values or presenting nonfunctional controls. Current reminder channel summaries show the policy's actual configured steps; only clients can consent to SMS.

See `verification/BOARDS_11_14.md` for checks and visual limits. Backend files were not edited for this batch, and their pre-existing working-tree changes remain outside these UI commits.

## T04 transport alignment - 26 October 2026

This foundation review preserves the existing RTK Query architecture and future auth contracts. It does **not** implement or verify real login, JWT validation, refresh, registration, or client sessions. The current backend exposes only GET `/actuator/health`; `/api/v1/auth/csrf` and all product routes intentionally return 403 until their tasks.

| Concern | Agreed transport behavior and current evidence |
| --- | --- |
| Base path | Product JSON uses `/api/v1/`; agency and client API slices share `baseQuery.ts`. Health stays outside this versioned product path. |
| Origin | Production reverse proxy routes `/api` to Spring under the frontend origin. Vite uses `VITE_API_PROXY_TARGET` locally. No backend CORS allowlist is needed for this design. Untrusted cross-origin preflight remains denied; no wildcard origins or credentialed CORS were added. Separate-origin deployment requires an explicit future configuration review. |
| Content | Default Accept is `application/json, application/problem+json`; JSON request bodies use `application/json`. RTK Query parses JSON/problem JSON and empty 204 responses; non-JSON gateway bodies become parsing errors. |
| Errors | HTTP status is authoritative. The shared error helper runtime-validates optional envelope fields and field-error arrays before forms consume them. Invalid envelopes fall back safely. Backend body binding/Bean Validation uses 400; future semantic/domain validation uses 422. Application-authored 401 and 422 are transport-tested using test-only fixtures, not public endpoints. Current anonymous access remains 403 under the closed foundation policy. |
| Correlation | Backend generates or validates `X-Request-ID`; caller-supplied IDs are preserved by frontend transport. Backend `traceId` matches the header, available through typed RTK Query response metadata. Same-origin proxy forwards it without CORS exposure rules. |
| Identity | Only the agency API attaches its memory-only `Authorization: Bearer ...` credential. Client API does not inherit it. `credentials: include` retains the cookie contract; real authentication remains T05/T06 and later client tasks. |
| CSRF | Backend session token repository explicitly names `X-XSRF-TOKEN`, matching the frontend. Mutation methods are normalized before CSRF checks. The existing frontend obtains a token before mutations and stops if acquisition fails. Session repository/BREACH protection remains enabled; the token endpoint and auth lifecycle are not implemented in T04. |
| Failures | Default timeout is 15 seconds per HTTP request, including a separate CSRF acquisition request when needed. Request cancellation/timeout, fetch failures and parsing failures remain RTK Query errors, not successful data. No new automatic retries were added. Existing coordinated agency refresh is a future-auth transport contract and is not evidence of real backend authentication. |

Verification: `npm ci`, strict TypeScript/production build, lint and formatting passed; all 68 frontend tests passed, including 21 focused transport cases. Backend `clean verify` passed 36 tests including real PostgreSQL/Flyway restart checks. A real Vite proxy with mocks disabled returned standardized 403 problems for `/api/v1/auth/csrf` and an unknown API path, preserving supplied `X-Request-ID` and matching `traceId`; direct health returned 200. The proxy test verifies transport through the closed foundation, not authentication.

CI workflows use pinned official action commits, Java 21/Maven Wrapper and Node 24.3.0/npm lockfile installation, dependency caches, read-only repository permissions, push/PR/manual triggers, and bounded job times. Both workflows passed actionlint 1.7.12 locally. No Git remote is configured (`git remote -v` is empty); no remote GitHub Actions run can be identified. Remote CI remains pending and must not be reported as passed.

Official references reviewed: [RTK Query fetchBaseQuery](https://redux-toolkit.js.org/rtk-query/api/fetchBaseQuery), [Spring CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html), [checkout releases](https://github.com/actions/checkout/releases), [setup-java releases](https://github.com/actions/setup-java/releases), [setup-node releases](https://github.com/actions/setup-node/releases), and [actionlint](https://github.com/rhysd/actionlint).
