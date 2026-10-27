# Agency account sessions - T06 Parts 1–3

Implemented 27 October 2026. Repository inspection found no existing T06 Part 1 code; the two authorized requests were completed together. Part 1 supplied credential/JWT foundations; Part 2 supplied real persistent sessions before public login activation. No fake refresh cookie, workspace creation or T07 business endpoint was introduced.

## Public and authenticated contracts

All paths below are relative to /api/v1. JSON POST requests use Content-Type application/json. Every mutation, including bearer-authenticated writes, requires the existing GET auth/csrf exchange, its HTTP session cookie and X-XSRF-TOKEN. Successful responses are non-cacheable.

| Operation | Request | Success |
| --- | --- | --- |
| POST auth/login | {email,password} | 200 {accessToken,expiresIn:300,user:{id,email,displayName,verified}} and refresh cookie |
| POST auth/refresh | {} and refresh cookie | 200 {accessToken,expiresIn:300} and rotated cookie |
| GET me | Bearer access token | 200 {user,memberships:MembershipSummary[]} |
| GET me/sessions | Bearer access token | 200 {data:[{id,createdAt,lastSeenAt,expiresAt,current,label}]} |
| DELETE me/sessions/{sessionId} | Bearer and CSRF | 204; only own sessions; cross-user identifiers return 404 |
| POST auth/logout | {} and refresh cookie, or valid bearer if the cookie is absent or unusable; CSRF | 204; revoke current session and clear cookie; repeated logout is idempotent |
| POST auth/logout-all | {} with valid bearer and CSRF | 204; revoke every session of that user and clear cookie |

T07 Parts 1–2 now provide real workspace tables and live active membership projection; no workspace is fabricated or seeded by authentication. Business routes remain denied even with a valid JWT. The full frontend onboarding/product journey still needs its backend tasks. Existing frontend login/refresh/me DTOs and request paths are unchanged. Session listing follows the original catalog's data envelope and label field, with a generic Browser session label; no raw User-Agent, IP/device fingerprint or invented location is collected. Listing is bounded to 100 recent active sessions.

Unknown email, wrong password and disabled accounts use identical 401 INVALID_CREDENTIALS login errors. Password matching performs Argon2id work for unknown accounts using an in-memory random dummy hash. EMAIL_NOT_VERIFIED is disclosed only after a correct password matches an unverified account, as the frontend contract expects. Login accepts a required, untrimmed password up to 128 characters/512 UTF-8 bytes and does not impose new-registration composition/minimum rules on credential matching. The stored hash/state are rechecked under the account lock before session issuance, preventing reset/login races. Email uses existing canonical normalization. DTO/malformed JSON errors remain safe 400 problems.

Validated login requests use the existing shared PostgreSQL peer-address limiter: LOGIN_PER_MINUTE defaults to 10. Refresh is bounded to 60 validated requests/minute/peer. The server does not trust arbitrary X-Forwarded-For headers. 429 includes Retry-After: 60. Edge/body/CSRF-acquisition limits and trusted reverse-proxy peer configuration remain deployment work. Peer limits are an abuse control, not a substitute for those controls.

## JWT signing and validation

Spring Security OAuth2 JOSE/resource-server modules resolve to **7.1.1**, Nimbus JOSE JWT **10.9.1**, through the unchanged Boot 4.1.1 parent/BOM. No independent JWT library version was pinned or signature algorithm implemented. The existing justified Bouncy Castle Argon2 provider remains unchanged.

AccessTokens issues RS256-signed access JWTs lasting exactly 300 seconds. Claims contain only iss, aud, sub (immutable user UUID), sid (persisted session UUID), jti (unique UUID), iat and exp. Header includes alg, typ and kid. Public-only local JWKS select trusted RSA keys by kid; keys must be at least 2048 bits, duplicate/unknown IDs and private public-set material are rejected, and the configured PKCS#8 private key must match its selected public key. The local generator uses 3072-bit RSA. There is no request-derived issuer, remote jku/jwks discovery or implicit network key fetch.

Decoding pins RS256 and validates signature, issuer, exact audience, required IDs/timestamps, five-minute lifetime and a maximum 30-second clock skew. Future-issued, expired, unsigned, malformed, unsupported-algorithm, wrong-issuer/audience/signature and unknown-key tokens fail safely. Expiry has only the documented 30-second validation tolerance; database session expiry/revocation is not extended by JWT clock skew.

Spring's standard bearer filter/JwtAuthenticationProvider performs validation. Its converter checks live account verification/state and the JWT's own user/session association, revocation and deadlines in PostgreSQL on every authenticated request. JWT authentication is stored only in a request attribute, never in the anti-CSRF HttpSession. Standard problem JSON and matching X-Request-ID/traceId are preserved; identity failures return 401 with a Bearer challenge, while CSRF and closed business-route denials remain 403. Cookie login/refresh/logout ignore an optional stale bearer header so an expired access token cannot block secure cookie lifecycle operations. Bearer-only logout requires a valid signed, unexpired access token.

## Persistent refresh lifecycle and atomicity

V5__create_agency_sessions.sql adds only the USER subset of reference auth_sessions and session_tokens. Each session has a UUID ID/family ID, immutable user association, absolute/idle deadlines, activity and revocation times. Each refresh token has a UUID row, session link, unique 64-character HMAC-SHA-256 digest, absolute expiry, rotation time and replacement link. Foreign keys, digest/state/timestamp checks and user/session indexes enforce integrity. Existing migrations V1-V4 are unchanged; clean and upgrade paths preserve accounts and encrypted jobs.

Existing SecureAccountTokens generates 32 random bytes per refresh capability (43 URL-safe characters). Raw values are returned only through HttpOnly cookies, never JSON, database rows, normal logs or session summaries. TOKEN_HASH_PEPPER is a separately configured Base64 32-byte HMAC key, stable across restarts. Existing email/reset SHA-256 token digests remain unchanged. Do not rotate the pepper while sessions should remain usable: coordinate explicit revocation and sign-in again; a multi-pepper migration facility is not implemented.

Absolute session lifetime is 14 days; inactivity limit is seven days. Successful refresh advances lastSeenAt and the idle deadline, capped by the original absolute deadline. It cannot extend the absolute lifetime. Normal access reads do not write session activity; an active frontend refreshes access as needed. Refresh-token rows are retained for replay detection through the family lifetime. A bounded archival/purge operational policy for expired sessions/retained tokens remains a follow-up; this task does not delete replay evidence prematurely.

Refresh uses a database transaction with consistent user -> session row locking, followed by reading the current token state. Replacement insertion, old-token rotation/link, activity update and JWT issuance commit together. Failed persistence/signing rolls all mutations back and emits no new cookie. Concurrent requests for the same token yield one rotation and a safe conflict.

A used token is never accepted for new credentials. During [rotationTime, rotationTime+2 seconds), reuse yields 409 REFRESH_ALREADY_ROTATED without credentials, cookie changes or family revocation. At two seconds or later, reuse revokes that session/family, commits, and only then returns 401. This avoids rolling revocation back with an exception. Old and new access tokens for that family then fail live checks immediately. Other session families remain valid. Normal rotation alone does not invalidate still-unexpired access tokens in the same live family.

Logout revokes persistent state, including when the presented cookie is an already-rotated retained capability; it does not rely solely on clearing the cookie. Logout-all is scoped to the authenticated user. Account disablement immediately fails live JWT/refresh eligibility checks. Successful password reset locks the same user and revokes all account sessions **inside the existing password/token/outbox transaction**. Failure of revocation rolls back password update and token consumption; concurrent refresh cannot leave an old-credential session active. Future password-change services must use this same transactional revocation pattern.

## Cookies, CSRF and origin rules

Production refresh cookie: **__Secure-collector_refresh**, Secure, HttpOnly, SameSite=Lax, Path=/api/v1/auth, no Domain. Max-Age is the remaining absolute session lifetime and does not restart at 14 days on rotation. Clearing uses the same name/path/attributes. Ambiguous duplicate cookie names are rejected. The anti-CSRF session cookie is also explicitly HttpOnly/Secure/SameSite=Lax, with cookie-only session tracking; URL session IDs are disabled.

The dev profile binds to 127.0.0.1 and permits the non-Secure **collector_refresh** name for local HTTP, plus non-Secure CSRF session cookies. Insecure refresh configuration is rejected outside the dev profile or on a non-loopback binding. Never deploy the dev profile publicly. Production HTTPS and trusted proxy/TLS termination must be verified before deployment.

Login, refresh and logout rotate the anti-CSRF HTTP-session ID and remove the old CSRF token; the frontend fetches a fresh one before each mutation, including the original write retry after a successful refresh. No Spring resource-server CSRF bypass is enabled: all bearer writes still require CSRF. Broad auth/** permissions and permissive credentialed CORS were not added. Use the existing same-origin Vite/reverse proxy arrangement.

## Local setup and verification

Run from a Java 21 PowerShell with Docker Desktop Linux containers running:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\scripts\Initialize-Local.ps1
.\scripts\Initialize-Auth.ps1
if ($LASTEXITCODE -ne 0) { throw 'Auth key setup failed.' }
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Database startup failed.' }
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dspring-boot.run.profiles=dev' spring-boot:run
```

Initialize-Auth.ps1 explicitly generates persistent local private/public files and a separate refresh pepper once under ignored backend/.local/auth. It restricts that directory to the current Windows user before writing secrets, appends UTF-8 configuration to ignored backend/.env without printing values and preserves an existing configured key. Existing/partial key files are never overwritten silently. The Java single-file helper needs Java 21; there is no extra dependency installation. Keep the files and matching configuration across restarts. No key is generated automatically on application startup. Use a deployment secret manager/restricted mounts instead of the local script for production.

Required configuration to activate authentication: JWT_PRIVATE_KEY (PKCS#8 PEM file path), JWT_PUBLIC_KEYS (public-only JWKS file path), JWT_KEY_ID, JWT_ISSUER, JWT_AUDIENCE, and TOKEN_HASH_PEPPER (Base64 32 bytes). File paths in .env use forward slashes; no server secrets belong in VITE variables. Empty auth settings leave T05/health available, but login returns safe 503 AUTH_UNAVAILABLE; partial/invalid key configuration fails startup safely. The initializer is separate from the existing delivery key/provider settings and does not enable email sending or seed verified users.

In a separate frontend PowerShell:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
$env:VITE_ENABLE_MOCKS = 'false'
$env:VITE_API_BASE_URL = '/api/v1/'
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8080'
npm run dev
```

A real login requires an existing verified ACTIVE account. Automated tests create isolated synthetic users and controlled mail fixtures; no real developer account/password is seeded. T05 real email delivery/resend is still pending, so this does not claim a working public inbox onboarding journey. Workspace onboarding is T07.

For JWT rotation, distribute a public JWKS containing old and new public keys to every instance first. Then change the private file/key ID to the new matching pair and restart/redeploy. Retain the old verification key for at least the access lifetime plus skew after the last old-key issuance; retire it in another rollout. Do not remove an old public key while another instance still signs with it. Automated secret-manager rollout/production validation remains deployment work.

Verification evidence is recorded in IMPLEMENTATION_STATUS.md. Local real HTTPS browser acceptance now passes (Part 3 below). Not verified: public TLS/proxy deployment, external providers, hosted CI, operational token archival or full product/workspace journeys. No T06 Complete or full MVP claim is made.

Official references checked for this change: [Boot BOM/build system](https://docs.spring.io/spring-boot/reference/using/build-systems.html), [Spring JWT validation and algorithm selection](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html), and [NimbusJwtEncoder](https://docs.spring.io/spring-security/site/docs/7.0.0/api/org/springframework/security/oauth2/jwt/NimbusJwtEncoder.html).

## Part 3 audit and browser acceptance — 27 October 2026

[Full audit findings, matrix, commands and exact manifest](verification/T06_AUTH_AUDIT.md). Fixed valid-bearer logout fallback when a cookie is malformed/unknown and frontend CSRF reacquisition on an expired-access write retry. No endpoint, DTO, race-window or migration change was required. Issued JWTs are rejected by live database validation on the next request after revocation; this does not cancel requests already executing.

Backend clean verify passed 233 tests (all previous 229 plus four); the separate actual Edge/Vite/Spring/PostgreSQL HTTPS lifecycle passed one test with MSW off. Frontend auth/transport passed 47 tests; TypeScript/production build, lint and formatting passed. Tests include safe 409 without credentials, exact two-second reuse revocation, post-restart revocation and cross-user JWT/session binding. Browser evidence includes Secure cookie/deletion, CSRF rejection, untrusted-origin rejection, bootstrap, expired writes/concurrent refresh, reset invalidation and multi-device logout-all.

The isolated browser trusts its generated local test certificate only; public deployment TLS/proxy/key rollout and retention acceptance remain pending. T06 stays In progress. T05 provider/resend and T04 hosted CI gaps remain unchanged.

## T07 Part 2 identity projection integration — 27 October 2026

GET `/api/v1/me` preserves user fields and now returns current ACTIVE memberships with memberId/workspaceId/workspaceName/OWNER-or-MEMBER role through one scoped database join. No JWT role claims, inactive memberships or unrelated tenant data are added. AgencySessions locks/revalidates the trusted account/session before projection; password reset/disablement/revocation still reject access immediately on subsequent requests. There is no `/auth/me` alias. Existing frontend bootstrap/login/onboarding consumes the same DTO; private caches clear on changed membership identity. See [workspace acceptance and exact manifest](WORKSPACE_FOUNDATION.md).

Current evidence: 290 backend tests; 70 frontend tests; 2 separate real HTTPS browser lifecycles passed. The new browser lifecycle uses UI registration, isolated encrypted-outbox delivery fake, verification, login and actual workspace onboarding with MSW off. T07 Complete; T06's deployment TLS/proxy/key/abuse/retention and T05/T04 gates remain pending. No T08 or full M1/MVP completion implied.
