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

## T05 Part 2 implemented backend contracts - 26 October 2026

This supersedes the earlier closed-foundation notes **only** for GET `/api/v1/auth/csrf`, POST `/api/v1/auth/register` and POST `/api/v1/auth/verify-email`. The existing frontend request/response shapes above are implemented unchanged: CSRF `{token}`, generic registration 202 `{message}`, verification 200 `{verified:true}`. Use the same-origin proxy, retain the CSRF session cookie and send the returned BREACH-protected token in `X-XSRF-TOKEN`. The session is anti-CSRF state, not an authenticated identity. Login/refresh/me and other auth routes remain denied; this does not establish a working real-backend sign-in/bootstrap journey.

Registration validates normalized email, trimmed display name 2-100 (matching the frontend), and unchanged password 12-128 characters with a 512-byte safety cap. No composition rules or confirmation field were added to the HTTP contract. Duplicate/active/disabled addresses receive the identical generic body; no existing credential is overwritten and no token is replaced. Missing delivery encryption configuration gives generic 503 `EMAIL_DELIVERY_UNAVAILABLE`, not a token/debug link.

Invalid input uses 400 `VALIDATION_FAILED`/`MALFORMED_REQUEST` with existing safe field errors. Unknown/revoked/wrong-purpose/unusable-account verification links use 400 `TOKEN_INVALID`; expired and consumed links use 410 `TOKEN_EXPIRED`/`TOKEN_CONSUMED`, consistent with the existing mock guidance. Current per-peer limits are registration 5/minute and verification 20/minute, configurable by server environment; 429 includes `Retry-After: 60`. All API errors preserve problem JSON and matching header/body correlation IDs. Successful verification does not authenticate or return credentials.

Resend remains an **unresolved proposal**, not an agreed endpoint: the supplied catalog does not define it and the earlier handoff explicitly requests agreement. POST `/auth/resend-verification` stays protected until route, generic response, replacement and cooldown rules are agreed. No frontend endpoint was changed to hide this gap.

Verification mail is queued transactionally in the PostgreSQL outbox with encrypted raw-token payload and public token/trace metadata only. Links use the trusted `APP_BASE_URL` and a fragment. No token/debug code is returned through APIs or logs. Only the controlled test adapter delivers messages; a real provider and automated worker runner remain pending. See `backend/README.md` for key configuration, leases, reconciliation, retention and current verification evidence. Frontend files and original specifications remain unchanged.


## T05 Part 3 implemented recovery contracts - 26 October 2026

The existing frontend contracts now have real backend implementations: POST `/api/v1/auth/forgot-password` `{email}` returns 202 `{message: "If an eligible account exists, a password reset link will be sent."}`; POST `/api/v1/auth/reset-password` `{token,password}` returns 200 `{message: "Your password has been reset."}`. Both require the CSRF session cookie/header exchange described above and return non-cacheable success JSON. No confirmation field or new frontend endpoint is needed. All unrelated routes remain denied.

Recovery trims/normalizes email and uses generic responses for unknown, unverified, disabled and eligible accounts, with equal Argon2id work and a default 250 ms response floor. Only verified ACTIVE accounts receive a 30-minute RESET_PASSWORD capability through the encrypted outbox. Repeated requests within the usable lifetime coalesce without resend; expiry allows atomic replacement. Global missing-key configuration returns uniform 503 EMAIL_DELIVERY_UNAVAILABLE; validated request limits default to 5 recovery / 20 reset per minute per peer, with 429 and Retry-After: 60. Recipient-specific enqueue failures retain the generic 202 and roll back.

Reset uses the existing password policy and safe 400 TOKEN_INVALID / 410 TOKEN_EXPIRED / 410 TOKEN_CONSUMED guidance. Account mutation, token consumption, revocation of other reset tokens and pending capability cleanup are atomic. Verification state is preserved and no login occurs. Links use trusted APP_BASE_URL plus `/reset-password#token=...`; the frontend already captures the fragment into memory and requires explicit submission. Never expose reset links in API/debug responses.

The earlier reset-contract session revocation requirement remains mandatory for T06: actual account sessions and refresh families must be revoked in the same successful reset transaction once those tables/services exist. Current CSRF session state is not an authenticated session, and no JWT/refresh infrastructure was added. No credential-version schema or implemented session revocation is claimed.

Verification: full backend clean verify passed 142 tests (104 retained + 38 new), zero failures/errors/skips, with PostgreSQL concurrency/rollback/migration and existing registration/verification regressions. No frontend code/tests changed. Production email delivery, an automated worker runner, reconciliation/key rotation and the proposed verification-resend contract remain pending. See backend/README.md for exact configuration and local commands.


## T05 Part 4 contract review and resend decision - 26 October 2026

Actual authApi.ts, baseQuery.ts, token capture/form schemas and backend controllers were reviewed. Existing implemented contracts remain GET auth/csrf 200 {token}; POST auth/register 202 generic {message}; POST auth/verify-email 200 {verified:true}; POST auth/forgot-password 202 generic {message}; POST auth/reset-password 200 {message}. Same-origin credentialed requests, fresh X-XSRF-TOKEN exchange, non-cacheable success bodies, 400 input validation, 410 expired/consumed links, 429 with Retry-After, problem JSON and matching X-Request-ID/traceId remain compatible. Token links use trusted frontend origins and URL fragments with explicit POST consumption. No frontend UI/transport change or new public account route was required. Frontend mock short token codes are synthetic fixtures, not production token formats. Login/bootstrap/refresh/session behavior remains T06.

**Resend approval status: unresolved.** Repository guide, original endpoint catalog and subsequent handoff/status records contain no approval superseding the explicit proposal. The existing frontend sends POST auth/resend-verification, but a frontend mock is not contract approval. The real backend continues to deny that route. This is an acknowledged real-integration gap, not successful resend.

Concrete compatible proposal for product/backend approval (NOT implemented or approved):

| Decision | Proposed behavior |
| --- | --- |
| Route and DTO | POST /api/v1/auth/resend-verification, JSON {email}, trimmed/normalized and bounded to 254 characters; existing CSRF exchange required |
| Public result | 202 {message: "If this address can be verified, check your inbox for a verification email."}; Cache-Control no-store; identical for unknown/active/disabled/unverified addresses and suppressed requests |
| Eligibility | Only UNVERIFIED accounts; never change password, auto-verify, authenticate or resurrect disabled accounts |
| Abuse policy | PostgreSQL 5 validated requests/minute/transport peer with generic 429 + Retry-After: 60; recipient-specific 60-second cooldown and maximum 3 actual deliveries/hour, persisted under hashed recipient keys; suppressed recipient requests still return generic 202; equal expensive work and response floor |
| Queued/unknown work | Coalesce current queued/running/known-retry work; hold unknown outcomes for evidence-based reconciliation rather than creating a second message |
| Explicit resend after confirmed delivery | Once cooldown permits, create a fresh 256-bit VERIFY_EMAIL capability with 24-hour lifetime, revoke previous verification capabilities and cancel their stale pending ciphertext atomically; this is replacement, because successful delivery erases the old raw payload |
| Concurrency | Lock the account and issuance budget; one replacement job per accepted occurrence with stable dedupe key; no unlimited valid tokens or duplicate concurrent jobs |
| Errors/configuration | Existing safe problem JSON for malformed input; uniform global delivery-unavailable response before lookup; recipient suppression/failures must not enumerate accounts |

Approval is still required for the route, precise response text, cooldown/hourly cap, queued/unknown coalescing, and whether replacement renews lifetime to 24 hours. These proposed values do not add environment variables or migrations yet. Existing UI countdowns must respect the agreed server policy when implemented.

Part 4 adds explicitly enabled delivery polling and bounded internal reconciliation only. Defaults remain disabled and there is no raw-token/public operations endpoint. See [account delivery operations](ACCOUNT_DELIVERY_OPERATIONS.md) for configuration, state meanings, worker draining, evidence requirements and controlled test mailboxes. Production provider integration and multi-key/cipher-repair operations remain pending. T06 must revoke account sessions/refresh families in the reset transaction when that infrastructure exists.


Part 4 verification: **175 backend tests passed**, zero failures/errors/skips (142 preserved + 33 new); **46 existing frontend auth/transport tests passed** in two files using the package.json test script with one fork worker. Backend MockMvc verifies actual CSRF/HTTP account journeys; frontend tests still use controlled HTTP mocks and do not prove full browser/provider or T06 bootstrap integration. No frontend files or supplied contracts/specifications were changed.


## T06 Parts 1-2 - live agency session contracts - 27 October 2026

This supersedes earlier statements that login/refresh/me are denied and session revocation is deferred. The actual existing login, refresh and /me frontend DTOs are now implemented: login {email,password} -> 200 {accessToken,expiresIn:300,user}; refresh {} with HttpOnly cookie -> 200 {accessToken,expiresIn:300}; GET me with Bearer -> 200 {user,memberships:[]}. The empty membership array is truthful until T07 and does not represent working workspace onboarding. No frontend UI or mock changes were necessary.

Logout {} with CSRF/cookie (or valid bearer when the cookie is absent or unusable) -> 204 persistently revokes the current session and clears the cookie; repeated logout remains 204. POST auth/logout-all and DELETE me/sessions/{sessionId} require bearer plus CSRF and revoke only authorized account sessions. GET me/sessions returns the original catalog's {data:SessionSummary[]} envelope, bounded to 100, with current flag and generic label. Existing product settings commands/mock screens are not claimed fully integrated with those routes by this change.

Use a fresh GET auth/csrf token/session cookie before every mutation, as baseQuery already does. Login/refresh/logout change the CSRF session ID and remove the old token. Bearer identity is not stored in that HTTP session. Production refresh cookie is __Secure-collector_refresh, Secure/HttpOnly/SameSite=Lax, host-only, Path=/api/v1/auth; loopback dev HTTP uses collector_refresh with the explicit restricted dev exception. Do not read/persist refresh credentials in frontend JavaScript. The access token remains memory-only.

The refresh race contract is implemented exactly: during [rotation,rotation+2s), an old token gets 409 REFRESH_ALREADY_ROTATED, without issuing credentials, clearing/replacing cookies or revoking the family. At two seconds or later, confirmed reuse commits family revocation and returns 401. Other families remain usable. The existing frontend mutex/Web Locks and retry guidance remain applicable. Unknown/expired/revoked sessions give safe 401 INVALID_CREDENTIALS; failed refresh clears the refresh cookie, except conflicts preserve it. Expired optional bearer headers do not prevent cookie refresh/logout.

Password reset now revokes all actual account sessions in the same transaction as password/token changes; both current access JWTs and refresh credentials become unusable through live database checks. Rollback and reset/refresh races are tested. No password hash, raw refresh credential, digest or internal entity is exposed through JSON. Only the documented access JWT is returned. Missing identity returns 401; CSRF/closed business actions remain 403. Existing problem JSON and X-Request-ID correlation stay unchanged.

See [session architecture](AGENCY_SESSION_ARCHITECTURE.md) for persistent key/pepper configuration, exact setup commands, signing-key rollover, security decisions and remaining deployment checks. Full backend clean verify: **229 tests passed**, zero failures/errors/skips; existing frontend auth/transport: **46 passed** after a successful one-thread rerun of an initial fork startup failure. Mock frontend tests do not prove a live browser/provider/TLS journey. T06/M1 remain In progress, T05 resend/provider gaps and T04/M0 hosted CI remain pending. No T07 or full MVP completion is claimed.

### T06 Part 3 transport correction — 27 October 2026

No route/DTO changes. Logout now honors an otherwise valid bearer if the refresh cookie is malformed/unknown. A mutation retried after refresh must reacquire CSRF: refresh changes its server-side state. baseQuery now does so. The real HTTPS Edge/Vite/Spring/PostgreSQL lifecycle passed with MSW off, including expired-access DELETE, bootstrap, reset invalidation and logout-all. Backend 233 tests, explicit browser 1 test, frontend auth/transport 47 tests passed. [Audit evidence and remaining deployment limits](verification/T06_AUTH_AUDIT.md). Product settings/session UI integration remains separate from this transport verification; no workspace/backend product completion claim is made.

## T07 Part 1 — workspace backend foundation — 27 October 2026

New real endpoints match the existing workspace DTOs: GET `/workspaces` -> 200 `{data:MembershipSummary[]}`; POST `/workspaces` -> 201 `{workspace}`; GET `/workspaces/{id}` -> 200 `{workspace,entitlements}`; PATCH `/workspaces/{id}` -> 200 `{workspace}` with required expectedVersion. Name max 150, timezone must be a Java-supported IANA ID. The product handoff's optional initial planKey extension is now supported for SOLO/AGENCY **trial selection only**; omit it for SOLO. Optional timezone defaults America/Chicago. Original supplied specifications remain unchanged.

Every creation atomically uses trusted JWT subject for owner + ACTIVE OWNER membership + 14-day local TRIALING record. Request userId, ownerId, subscription state, provider fields or PATCH planKey never grant privileges. No payment activation occurs. Trial AI/SMS budgets default zero because reduced values are unspecified; aiEnabled/smsEnabled remain false. Missing/expired entitlement denies writes. Cross-tenant/inactive membership -> safe 404; non-owner write ->403; stale version ->409; missing identity ->401 and missing CSRF ->403. Existing no-store/problem/tracing/CSRF transport is retained. No frontend source changed.

Part 1 deliberately leaves `/me.memberships` at its existing empty projection; GET workspaces is the tested real discovery API. The frontend bootstrap currently relies on `/me`, so do not claim complete real onboarding/workspace selection yet. Live projection and real backend onboarding acceptance remain T07 follow-up; frontend session lifecycle/switch/cache work remains T08. No member invitation/transfer/project endpoints were opened (T13/later). [Full foundation decisions, tests and exact manifest](WORKSPACE_FOUNDATION.md).

## T07 Part 2 — live `/me` memberships — 27 October 2026

Supersedes the Part 1 empty-projection caveat: existing GET `/api/v1/me` now returns `{user,memberships:MembershipSummary[]}`, with unchanged user fields and exactly `{memberId,workspaceId,workspaceName,role:"OWNER"|"MEMBER"}` for each current ACTIVE membership. No extra status or project permission fields required by the frontend schema. DISABLED/removed memberships are excluded. Reads derive from live PostgreSQL membership rows scoped to the trusted JWT subject, after live account/session validation, not JWT-embedded roles. The task's `/auth/me` spelling is not the agreed path; no duplicate endpoint added.

Creation followed by `/me`, role/name changes, disablement/removal, refresh and restart all return current membership data without new role claims. Workspace create/list/detail/PATCH contracts, initial local trial, version conflicts, errors/tracing and CSRF remain unchanged. Existing login/onboarding/bootstrap/selection flows already use these DTOs. A minimal store listener clears both private API caches when an existing identity's memberships or user ID change; existing route guards and selection fallback then handle revocation. Backend requests independently enforce access. No T08 UI/session redesign or new polling introduced.

Verified: **290 backend tests**, **70 frontend tests**, build/strict TypeScript/lint/format, and **2 real HTTPS Edge lifecycles with MSW off**. New real onboarding uses UI registration, encrypted outbox and test-only in-memory mailbox, explicit UI verification, login, real workspace/trial, reload/selection and two-tenant/member revocation checks. Project/template requests remain denied and are not mocked into success. T07 Complete; M1/T05/T06 and T04 pending gates remain separate. [Full current evidence and manifest](WORKSPACE_FOUNDATION.md).

## T08 Part 1 — package organization and agency lifecycle

No HTTP path, DTO, cookie, CSRF, role or entitlement contract change. Workspace classes now follow controller/service/repository/entity/dto/security subpackages; [exact package map](../backend/ARCHITECTURE.md). Default-deny product routes and live tenant checks remain.

Existing session integration was preserved. Minimal corrections align the active workspace to an authorized direct/reloaded route and ignore unknown/already-selected switch requests before cache clearing. Actual HTTPS acceptance now includes member-workspace reload, private-cache separation, expired workspace access, rejected external return destinations and two-tab UI logout clearing both identities/caches. No UI redesign or project/template backend added. Final evidence: 291 backend tests, 72 frontend tests, 2 real HTTPS lifecycles, strict TypeScript/production build, lint and format passed. T08 Complete; M1/T05/T06 and T04 pending gates remain independent. Detailed results are recorded in IMPLEMENTATION_STATUS.md.


## T11 Part 1 — real structure editing — 28 October 2026

The five existing workspace/project-scoped section create/PATCH, item create/schema-PATCH and structure/reorder operations now have real backend implementations. GET project detail supplies current edited structure/version. Removal is enabled:false; no DELETE or alternate GET structure route. POST section supports an explicit key or generates one when the existing UI omits it. Item keys remain immutable; schema PATCH replaces the complete definition. Reorder preserves the exact current item set per section (including disabled records), never cross-section moves.

Every write requires expectedStructureVersion, live owner membership, allowed project/workspace/plan state, JWT and CSRF. Stale writes return standard 409 STRUCTURE_CONFLICT with currentVersion, traceId and X-Request-ID. Frontend runtime parsing/types retain that optional version; entered item form values stay intact during refresh/retry. New URL and multi-select payload defaults now satisfy strict schemas, and AI targetWords survives unrelated edits. A 422 VALIDATION_FAILED reports invalid resulting structure; clear safe UI copy avoids mislabeling it as a network error.

Collected-work semantic changes are deliberately guarded with REOPEN_REQUIRED even with reopenAffected=true, until real immutable submissions/draft revalidation exist. No member-wide project permission, owner preview/client session, answer, invitation, review or provider workflow is added. All conditional items without answers remain initially hidden; disabled sections hide their items. Original mock-driven later workflows remain frontend-only.

[Exact contracts, validation and limits, persistence/security, real HTTPS two-tab/keyboard acceptance, final evidence and manifest](T11_STRUCTURE_EDITOR.md). T11 remains In progress for submitted-content reopening integration; M2 In progress. Existing T04/T05/T06 pending gates remain independent.


## T11 Part 1 resume and frontend tooling organization — 28 October 2026

The prior T11 implementation and evidence were already committed and were preserved. Authorization/limit/concurrency/rollback tests were inspected; one combined malformed-JSON fixture was separated into two intended cases. No backend production behavior, original specifications/templates, security policy or applied migration changed. The focused suite now has 85 cases; M2/T11 status and deferred submitted-content reopening boundary remain unchanged.

Browser suites now live under frontend/tests/{e2e,pwa,integration/real-auth}; the Java HTTPS launcher and Vite-relative paths follow the move. Browser results/logs/compiler caches use ignored frontend/.artifacts. Required root configurations and the resolved dependency lockfile are retained. The new frontend/scripts/Verify-Frontend.ps1 runs checks sequentially with optional -Browser -Pwa. [Exact cleanup/file inventory, commands, current verification and remaining gates](T11_RESUME_AND_FRONTEND_ORGANIZATION.md).

Final resume evidence: **85 focused T11 cases**, **555 backend clean-verify tests** (original 470 + 85), **74 frontend tests**, **2 real HTTPS tests with MSW off**, and **1 production PWA test** passed. TypeScript/build/lint/format and the final Windows PowerShell 5.1 core verification wrapper passed. Responsive mock browser coverage exercised 57 scenarios: latest full run 54 passed/3 timing failures, followed by all 3 passing unchanged on isolated rerun; this is not a clean single-run 57/57 claim. No assertions/timeouts were weakened. T11 Part 1 is verified; full T11/M2 remain In progress for the existing submitted-content reopening boundary. No T12/T13, security, application source, applied migration, original specification/template or dependency-resolution change. Commits: `ec3f44d` test correction, `a07808e` organization/HTTPS paths. No push.


## 29 October — frontend organization and T11 Part 2

HTTP paths/DTOs and agency/client reducer identities are unchanged. Source locations now follow frontend/ARCHITECTURE.md: app/router/AppRouter.tsx, app/store/store.ts, services/api/{baseApi,baseQuery,resourceApi,resourceSchemas}, feature-owned api/components/pages/schemas/types and tests/unit. Mocks remain explicit and separate. T11 semantic mutation safety now evaluates the entire structure, including collected visibility dependents; 409 REOPEN_REQUIRED also applies to affected drafts and section enable transitions even with reopenAffected=true. No reopen/submission endpoint exists. [Current rules and future T17/T22 transaction boundary](T11_PART2.md).


## T12 Part 1 — real customer/contact and owner-preview integration

Customer GET/POST contracts are unchanged; PATCH clients/{id} accepts businessName/expectedVersion only. Project contact GET/POST follows api_catalog.json, including required clientId matching the project's existing customer and a future expiry no later than 90 days. A saved contact issues no invitation/session; real invite/revoke UI remains disabled until the later workflow. Duplicate project email returns CONTACT_EXISTS; stale customer name returns VERSION_CONFLICT/currentVersion.

GET projects/{id}/client-preview now returns the catalog's {preview: ...} envelope. It is owner-only and uses the independent project structure and shared ItemDefinition renderer. The explicit preview variant has answer=null, canEdit=false, empty assets/comments, no revision pointer, AI off and empty-preview counts; no Answer record/savedAt is fabricated. Disabled and unanswered conditional items are omitted until real draft visibility exists. This is not the authenticated client checklist/session contract. Source lives under features/clients and the project preview api/schemas/types/components; shared RTK transport/cache remains unchanged. [Complete contracts, rules and evidence](T12_CLIENT_CONTACTS_AND_PREVIEW.md).


## T13 collaboration integration — 29 October 2026

The team UI now uses real GET/POST /workspaces/{w}/members ({data,pendingInvites} / 202 {invitation}), DELETE /member-invitations/{i}, PATCH/DELETE /members/{m}, POST /ownership-transfer, and project assignment GET/PUT/DELETE routes. See [T13 contract inventory](T13_TEAM_COLLABORATION.md). Invitation acceptance remains authenticated, verified matching email, explicit and single-use; it refreshes /me and opens the returned workspace overview. Tokens remain memory-only.

The catalog invitation body contains email only (MEMBER); staged project assignments in old mock UI were undocumented and removed. Configure project access after acceptance in the project Team tab. Independent review/export booleans never grant structure, client-contact or preview management. Seat usage is active memberships plus unexpired pending invitations, with limits from the real workspace entitlements. No unsupported usage API is required to invite a teammate. Invitation history exposes lifecycle states, not raw credentials. No team resend API is fabricated; revoke/reissue explicitly.

Feature APIs/schemas own team and assignment contracts and share the existing RTK transport. Identity changes clear private caches; access denials reconcile live /me; focus/reconnect refetch current reads. Bootstrap waits for an in-flight identity reconciliation so stale snapshots cannot overwrite a newer restored session. This is request-driven reconciliation, not a push channel. Production authorization always rechecks live account/session/membership/assignment state. Unimplemented T14 client exchange and T15–T17 collection/review remain deferred; preview is still read-only and owner-only.

T13 local acceptance is complete: backend 657, frontend unit 97, real HTTPS 2 (MSW off), responsive 75/75 and PWA 1/1; strict typing/build/lint/format pass. Actual API contracts above are implemented; later client/review/provider/deployment gates remain separate. Full evidence and exact file manifest are in T13_TEAM_COLLABORATION.md.


## T14 Part 1 — independent project client access

Owner invitation/revocation, explicit fragment exchange, generic fresh links, separate opaque cookie sessions and a read-only real portal are implemented. V12 is additive; V1–V11 and existing agency/team identities remain intact. Shared safe structure projection excludes private content; all client reads revalidate the live scoped grant/session. No answer/upload/submission APIs or T22 publication are added. DRAFT invitation issuance remains closed pending publication. See [T14 contracts, architecture, lifecycle, migration, exact manifest and verification](T14_CLIENT_ACCESS.md). T11 and T04–T06 gates remain independent.


## T15 Part 1 — persistent client drafts

The collection feature reuses T14 client session authorization for exact item GET/answer PUT routes. V13 adds project-shared mutable answers with contact attribution and independent answer versions. Existing project locks serialize writes, audit/state/version updates roll back together, and ProjectDraftVisibility drives portal/progress visibility without deleting hidden drafts. The existing client frontend feature adds server-confirmed serialized autosave, bounded retries, conflict comparison and volatile recovery; uploads/submissions remain deferred. T11 semantic changes to DRAFT collected items still fail closed pending revalidation/reopening. [Detailed contracts, feature trees, migration, file manifest, commands and final evidence](T15_CLIENT_DRAFTS.md). Original roadmap and T04–T06/T11/T22 gates remain independent.

## T16 attachment integration

Real collection now consumes safe `assets` metadata and optional `capabilities.canUpload` (defaults false for older servers). File/IMAGE/repeater IMAGE values save READY asset UUIDs through the existing T15 answer contract. Signed transfer and finalize reuse the catalog routes and Idempotency-Key. No internal storage keys are returned. Download variants must exist; unverified or unavailable assets fail closed. WebP/HEIC/HEIF remain unavailable pending deployed decoder tests. See [T16 report](T16_PRIVATE_ATTACHMENTS.md) for the complete API inventory, quarantine, replacement and permission rules.

The real canUpload flag includes live subscription write eligibility. Finalized jobs that exceed browser polling remain PROCESSING and refresh the same asset; they do not allocate duplicate uploads. Working PNG downloads use a matching .png filename. Agency download authorization is implemented; the supplied catalog has no agency file-list endpoint, so real gallery listing/detail data is an explicit contract gap rather than an invented API. Future T17/T22 persistence must extend retention checks across immutable revisions before enabling reopening/deletion flows.


## T17 immutable item submissions

Catalog submit/withdraw routes are implemented with required Idempotency-Key, existing CSRF/client cookie, answer/structure/item version checks and standard problems. Existing item GET adds own immutable revisions; checklist adds canSubmit (defaults false on an older server). Agency revision summaries/detail require project read; review queue additionally requires canReview. No review-decision API or project reopening is implied. Submitted asset references extend T16 retention; canonical objects remain private and retained downloads still reauthorize live access. T11 semantic changes remain409 REOPEN_REQUIRED. [Complete states, contracts, package ownership, limits and actual evidence](T17_CLIENT_SUBMISSIONS.md).


## T18 original-roadmap quota contract — 1 November 2026

POST /api/v1/client/projects/{projectId}/uploads retains its existing client-cookie/CSRF/idempotency contract. Its 409 STORAGE_QUOTA_EXCEEDED problem additionally returns usedBytes and availableBytes, as required by guide Section 10.3. Available means max(0, allowance - retained bytes - outstanding reservations), read under the reservation's workspace lock. The existing frontend transport handles the unchanged problem code/detail; no second client, route, schema or UI redesign is needed. No supplied contract/specification file is edited. The task attachment's agency-review description is deferred under its explicit original-roadmap precedence rule; existing T17 revision and queue reads remain unchanged. [Full scope and evidence](T18_AGENCY_REVIEW.md).


## T21 real review and comment contracts — 1 November 2026

POST /workspaces/{w}/projects/{p}/items/{i}/review-decisions now accepts the catalog revisionId/expectedItemVersion/APPROVE-or-REQUEST_CHANGES/reason contract with required Idempotency-Key and201 {item,decision}. It checks live independent canReview and exact current SUBMITTED revision/version under PostgreSQL locks. Change requests require nonblank feedback, atomically restore a separate editable answer and create CLIENT feedback. Approval/history remains immutable. Stale operations return409 ITEM_VERSION_CONFLICT/currentVersion; unavailable review action403 REVIEW_FORBIDDEN; inaccessible resources404. Existing standard problems, X-Request-ID, CSRF/cookies/bearer separation and no-store remain.

Catalog GET/POST item comments work for agency and client principals. Agency assigned readers can use CLIENT/INTERNAL, independently of review/export permission; client request {body} always produces CLIENT. Client response DTOs have id/body/authorDisplayName/createdAt/revisionId only, never visibility or private author/contact fields. Checklist/item comments use the same SQL-filtered projection. Bodies and change-request reasons are bounded to5000 characters. Existing agency revision detail adds decisions[] beside revision; the historical revision schema/value/file payload is unchanged.

Live frontend Review navigation now uses actual summary/detail responses, explicit confirmation and stable per-payload retry keys; compatible server acknowledgment precedes success. Client collection schemas accept safe comments while read-only owner preview remains unchanged. Mock handlers remain explicitly opt-in and are not a production fallback. No new reopen, completion, export or workspace-wide queue endpoint is invented. [Full T21 contracts/manifest/verification](T21_REVIEW_DECISIONS.md). T04/T05/T06/T11/T16/T20-device/T22 gates remain pending.


## T22 lifecycle integration — 2 November 2026

ProjectLifecycleController/Service/Repository implement catalog publish/pause/resume/complete/reopen/archive/restore with expectedVersion and required Idempotency-Key. ProjectReopeningService implements exact approved-item reopen with expectedItemVersion and reason. ProjectCollectedWorkService consumes T11 impact, verifies real persisted reopening/collected state and validates candidate drafts/files before atomic mutation; no permissive flag bypass. Inline ItemPatch adds optional reason when reopenAffected is requested. Completion shares existing visibility-aware progress; project reopen preserves approvals until selective item commands. PAUSED blocks client writes while agency review remains permitted. V17 adds publication metadata and immutable reopening/lifecycle records; previous migrations are unchanged. Existing auth, scoped repositories, audit/idempotency, snapshots/private files and one RTK transport remain authoritative.

Final936 backend tests passed in one clean verify;31 distinct focused frontend checks and1 real HTTPS lifecycle passed. T11 local reopening dependency is closed; T20 real-device and independent release/T16/T23+ gates remain pending. Full contracts, failure history and manifest: [T22 report](T22_PROJECT_PUBLICATION_REOPENING.md).


## T23 real approved exports — 2 November 2026

The existing `.../projects/{project}/exports` list/create/detail/download routes are now implemented. Creation requires Idempotency-Key and returns HTTP202 `{jobId,state:"QUEUED"}`, replacing the preliminary mock-only `{export:...}` response. ExportPanel now owns this journey under `features/exports`, validates responses with Zod and reuses RTK Query/shared controls. Optional `sectionIds` is an additive bounded project-scoped filter for the guide's split-by-section option; omission selects all visible approved revisions. Partial acknowledgment never permits unapproved values. Summary responses contain the catalog fields plus optional safe failureCode. Downloads are private signed attachment capabilities lasting at most60 seconds, capped by the24-hour job expiry. No client export route or review-permission shortcut. Stale snapshots report olderThanCurrentProject. Mocks return the queue response shape but use synthetic artifact generation; real ZIP/JSON/Markdown snapshot parity was verified through HTTPS without MSW. See [T23 contracts and evidence](T23_IMPLEMENTATION.md).


## T24 backend AI queue boundary

POST `client/projects/{p}/items/{i}/ai-drafts` returns202 `{jobId,state:"QUEUED"}` with required Idempotency-Key, client cookie, CSRF and explicit facts consent. GET `client/projects/{p}/ai-drafts/{id}` returns the catalog `{job:AiDraftJob}` only to its creating contact with live scoped access. Results never mutate ordinary answers. Failure codes include AI_TIMEOUT, AI_REFUSED, AI_INVALID_OUTPUT, AI_CREDIT_UNAVAILABLE, AI_PROVIDER_ERROR, AI_ACCESS_CHANGED and AI_OUTCOME_UNKNOWN; request-side availability/allowance failures explain that manual writing remains available. Existing frontend preview/acceptance still uses synthetic mocks and remains T25; its preliminary create `{job:...}` assumption must be replaced with `{jobId,state}` during that task, alongside the not-yet-implemented accept endpoint. Do not enable the live acceptance UX prematurely. [T24 scope and evidence](T24_IMPLEMENTATION.md).


## T25 real client AI preview/acceptance

This supersedes T24's preview/acceptance gap: the existing AI/client features now use202 `{jobId,state:"QUEUED"}`, validated GET `{job:AiDraftJob}`, and POST `client/projects/{p}/ai-drafts/{id}/accept` with Idempotency-Key and `{expectedAnswerVersion}` →200 `{answer:Answer}`. The answer must still equal the generation base version; newer-version forcing or changed/legacy question schemas are rejected, preserving manual work. Acceptance saves DRAFT only and does not consume more AI allowance. Same-key retries reconcile uncertain confirmations without a second write. Local discard/copy does not mutate a draft; no undocumented reject API. The live collection's project.aiEnabled is a boolean and item.ai is validated; owner preview remains literal false/read-only. Existing autosave safely adopts a confirmed answer or preserves concurrent local work for comparison. [T25 migration, errors, original-content retention and verification](T25_IMPLEMENTATION.md).


## T26 real email reminder integration

Reminder policy GET/PUT now use `{policy}`; preview uses `{preview}`; send returns202 `{jobId}`. History is catalog `/deliveries` (not the old mock `/reminders/deliveries`). The existing reminders feature and mock handlers use these same shapes. Owner policies support up to five email rules and expectedVersion conflict handling. The live client collection now exposes cookie/CSRF reminder preferences; invitation `preferences=1` fragment selects them after explicit single-use exchange. SMS controls stay unavailable in this live integration. Queuing/ACCEPTED/DELIVERED/UNKNOWN remain distinct; uncertain outcomes are never offered as safe retry. [T26 full contracts, configuration and evidence](T26_IMPLEMENTATION.md).
