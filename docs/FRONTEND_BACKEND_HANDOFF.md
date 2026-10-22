# FE01 frontend/backend handoff

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
