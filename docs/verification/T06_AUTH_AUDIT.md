# T06 Part 3 authentication audit — 27 October 2026

Scope: final local audit of the existing agency account/session implementation. Baseline commit `8cce18a`; correction/test commit `107a718`; T07, frontend product features, dependencies and supplied specifications were not changed. No migration was required; V1–V5 remain unchanged. This is a focused source/security/regression audit, not a production penetration-test certification.

## Findings and corrections

1. **Logout could report success without revoking the bearer session.** A malformed or unknown refresh cookie caused the service to return before considering a valid bearer token. Both PostgreSQL regressions reproduced the defect before the fix (204 logout followed by 200 identity). Logout now falls back to the valid signed bearer when no cookie capability is located. Known cookie capabilities, including retained rotated tokens, still revoke their own family. No arbitrary token is trusted; the existing user/session binding checks remain. Both cases now reject access and refresh after logout.
2. **An expired-access write retried a stale CSRF nonce.** Refresh changes the CSRF session state. The transport now reacquires CSRF before retrying the original mutation. A focused transport regression verifies the replacement nonce; real-browser DELETE after access expiry now succeeds with exactly one refresh. CSRF was not disabled or exempted.

No additional defect was found in the reviewed JWT/credential/refresh policies. Existing coverage was retained rather than duplicated. The browser harness itself needed corrected asynchronous Redux polling and a direct real-HTTP preflight assertion; failed harness attempts are not counted as passing evidence.

## Security review and evidence

| Area | Reviewed behavior and passing evidence |
| --- | --- |
| Credentials | Existing Argon2id matching/dummy work, generic unknown/wrong/disabled errors, correct-password-only unverified feedback, input bounds, PostgreSQL peer throttling and locked state/hash recheck. Existing credential/workflow regressions pass. |
| JWT | RS256 allowlist; trusted local public-only keys and known kid; signature, issuer, exact audience, UUID subject/session/jti, iat/exp and fixed 300-second lifetime; maximum 30-second skew. Existing 19 JWT/hash tests pass. New signed cross-user/session binding test rejects the token. No sensitive content in issued claims. |
| Refresh | 256-bit random capability, HMAC digest-only persistence, retained replacement chain, transactional user-then-session locking, idle/absolute deadlines and rollback. Concurrent PostgreSQL refresh has one successful rotation and one conflict. |
| Race policy | Within [rotation, rotation+2 seconds), old-token reuse gives 409 without accessToken, refreshToken or Set-Cookie and without revocation. At exactly two seconds and later, reuse commits family revocation then returns 401. Other families survive; no independent credential is issued for the old token. Policy unchanged. |
| Revocation | Every bearer authentication checks live user/session association, account state, revocation and deadlines in PostgreSQL. Logout, logout-all, password reset, explicit revocation and late replay therefore reject already-issued JWTs on subsequent requests, without waiting for five-minute expiry. This cannot cancel a request already authorized and executing. Normal refresh rotation alone does not revoke unexpired JWTs in the same live family. New actual application-restart regression preserves revocation for access and refresh. |
| Cookies | Real HTTPS Edge verifies Secure/HttpOnly/SameSite=Lax refresh cookie, restricted /api/v1/auth path, JavaScript invisibility and logout deletion. Existing backend checks cover remaining absolute Max-Age, duplicate cookies, CSRF session-cookie policy and fail-closed non-dev insecure configuration. No refresh token in JSON. |
| CSRF | Real browser rejects login, refresh, logout, reset and DELETE session mutations without the header (403), even with a bearer; legitimate session survives. Successful UI login/reset and transport refresh/revocation/logout use actual CSRF exchange. Existing backend tests reject old nonce after lifecycle rotation. |
| Origins | Same-origin proxy is the supported deployment. No credentialed CORS allowlist is enabled, wildcard credentials or broad auth permissions were added. Browser fetch from a separate local origin is blocked; a direct real-HTTP OPTIONS preflight to the backend is 403 with no Access-Control-Allow-Origin. Existing MockMvc preflight tests also pass. A separately hosted frontend requires explicit future origin/cookie review. |
| Keys/configuration | Persistent external PKCS#8/JWKS and stable separate refresh pepper, no startup key generation, safe configuration errors. Existing key mismatch/missing/rollover tests pass. Delivery encryption configuration/default-disabled provider behavior stays unchanged. No production secrets used. |

## Actual verification

- Backend `clean verify`: **233 tests; 0 failures, 0 errors, 0 skipped**. All previous 229 retained plus four new cases: two invalid-cookie variants, revocation after restart, signed cross-user/session binding. AgencySessionWorkflowTests now has 37 cases. Flyway V1–V5, upgrade preservation, Hibernate validation, PostgreSQL concurrency/restart, registration/verification/recovery/reset and executable JAR packaging pass.
- Separate explicit `RealAuthenticationBrowserCheck`: **1 test; 0 failures, 0 errors, 0 skipped**. Uses actual Spring HTTP server, disposable PostgreSQL 18.6, generated test signing keys, verified synthetic account, real Vite HTTPS frontend and installed headless Edge. No MSW, network interception, provider credentials or seeded development account. UI sign-in/invalid credentials/reset use real forms; expiry/concurrency/session commands exercise the actual Redux/RTK Query transport directly in the browser, not settings-page UI.
- Browser stages: login, Secure cookie checks, identity, missing-CSRF attacks, untrusted origin, reload bootstrap, expired-access DELETE retry, concurrent identity/session requests sharing one refresh, logout/deletion, invalid password, reset invalidating the old session, two-device logout-all, seven-day idle expiry and empty browser storage/no service worker interception. Backend clock advances deterministically; browser time is not altered.
- Frontend auth/transport: **47 tests in 2 files**, all previous 46 plus the CSRF-after-refresh write regression. Strict TypeScript/production build, ESLint (zero warnings), package formatting and explicit browser-runner formatting pass. No broad product/PWA regression or visual redesign is claimed by this task.

## Reproduce

Prerequisites: Java 21 JDK/keytool and Node on PATH, running Docker Desktop Linux engine with image access, existing locked frontend dependencies (`npm ci` once if absent), installed Microsoft Edge. The Windows integration check generates a temporary self-signed HTTPS certificate and ignores its trust error only in its isolated browser contexts; production Secure cookies remain enabled. It does not prove public TLS/proxy deployment. It owns random loopback ports, disposable database and browser processes and cleans them up. Its machine protocol passes synthetic fixture secrets through stdin; diagnostic output contains only stage and HTTP method/path/status, never cookies, JWTs, passwords or response bodies. No traces/HAR/screenshots are recorded.

The browser class is deliberately an explicit `*Check`, outside backend-only Surefire default naming: ordinary backend CI does not silently acquire frontend/Edge prerequisites. No test is disabled/skipped. Run both commands for complete local evidence:

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\backend'
.\mvnw.cmd clean verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed.' }
.\mvnw.cmd '-Dtest=RealAuthenticationBrowserCheck' test
if ($LASTEXITCODE -ne 0) { throw 'Real browser authentication check failed.' }
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm test -- src/test/auth.test.tsx src/test/transport.test.ts --maxWorkers=1 --pool=threads
if ($LASTEXITCODE -ne 0) { throw 'Authentication transport tests failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
npm run format:check
if ($LASTEXITCODE -ne 0) { throw 'Formatting failed.' }
npx prettier --check real-auth/browser-check.mjs
if ($LASTEXITCODE -ne 0) { throw 'Browser runner formatting failed.' }
```

## Remaining acceptance

T06/M1 remain **In progress**: verify real deployment TLS/forwarded peer configuration, proxy cookie behavior, persistent secret mounts/key rollout, edge/body/rate limits and bounded expired-session/token retention operations. No local tool blocker remains. T05 remains In progress for approved resend workflow and real sandbox/provider/operational acceptance. T04/M0 remain In progress pending hosted CI; no remote is configured. No full inbox onboarding, production delivery, T07 or full MVP completion is claimed. No push performed.

## Exact change manifest

Created:

- `backend/src/test/java/com/ayaantrix/collector/auth/RealAuthenticationBrowserCheck.java`
- `frontend/real-auth/browser-check.mjs`
- `docs/verification/T06_AUTH_AUDIT.md`

Modified:

- `backend/src/main/java/com/ayaantrix/collector/auth/service/AgencySessions.java`
- `backend/src/test/java/com/ayaantrix/collector/auth/AgencySessionWorkflowTests.java`
- `frontend/src/api/baseQuery.ts`
- `frontend/src/test/transport.test.ts`
- `frontend/eslint.config.js`
- `backend/README.md`
- `docs/AGENCY_SESSION_ARCHITECTURE.md`
- `docs/FRONTEND_BACKEND_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
