# Reference boards 11–14 verification

Recorded: 2026-10-24. Frontend and opt-in synthetic MSW mode; installed Microsoft Edge.

## Updated surfaces

- Reminder policy/channel summary, numbered cadence editor, email/SMS eligibility preview, delivery filters/counts and issue explanations. Changing recipient/channel clears the previous preview. SMS remains client-controlled and verification-gated.
- Analytics overview with visibility-aware required-item counts and section chart/table, friction search and observation/sample safeguards, owner-only counts share with link/embed copying and revocation.
- Daily digest settings and preview in a dedicated settings view. Corrected the old weekly wording to the guide's daily digest.
- Workspace general settings/logo removal/ownership link; personal profile/password and session revocation; billing, usage and subscription status views. Assigned members can open their own account and scoped project analytics.
- Responsive client SMS enrolment and verification, draft comparison/recovery, shared error/empty/loading icons and skeleton, offline banner, conditional browser PWA installation prompt and feedback styling.

## Executed verification

| Check | Result |
| --- | --- |
| Strict TypeScript and production Vite build | Passed |
| ESLint | Passed |
| Prettier check | Passed |
| Vitest | 47 passed, one worker |
| Complete browser regression before final analytics loading adjustment | 36 passed at desktop 1440×1000, tablet 768×1024 and phone 360×800 |
| Final targeted browser regression after loading adjustment | 6 passed: administration journey and daily digest/deletion cancellation/offline recovery at all three widths |
| Production PWA cache isolation/offline navigation | 1 passed on 2026-10-24 |

The PWA test initially failed on an outdated landing-page heading selector; updated the selector and offline heading, rebuilt and reran successfully. The public cache contains only the manifest, three fixed icons and offline HTML; private API/client navigation is not cached. An old private cache canary is cleared.

Browser checks cover profile saving, settings navigation, usage, reminder policy saving and preview invalidation, friction safeguards, status share creation/revocation by keyboard, digest saving, deletion-dialog Escape cancellation, and offline/online banner recovery. Existing suite covers all three project types, client draft/submission/review/export, upload processing, AI acceptance, role navigation and focus trapping/restoration. No horizontal page overflow was found in the exercised journeys.

27 screenshots named `boards11-14-{desktop|tablet|phone}-board*.png` accompany this record. Desktop reminders/analytics and phone account screenshots were inspected. Analytics loading previously flashed zero counts; it now uses QueryState before displaying metrics.

## Fidelity and integration limits

These are responsive implementations of the supplied boards, not a measured 100% pixel-match certification. Actual synthetic identities, dates, values, supported limits and guide rules are retained. Board labels, footer annotations and device hardware are excluded.

The API does not yet provide daily historical analytics, period comparisons, editable reminder email templates, next eligible delivery timestamps, detailed storage categories, adjustable seat purchases, recipient/time controls for the digest, account photo upload or data export jobs. Those controls/data are not fabricated. Reminder issues currently explain possible causes rather than claiming they are live incidents. The current chart uses real current section counts rather than invented daily bars.

Native browser unsaved-navigation protection and the existing mobile navigation remain in use; this pass does not certify all board 14 state panels as individually reproduced. Real-device installation, camera behavior, screen-reader testing, provider deliveries/payments, and live backend acceptance were not performed. See FRONTEND_BACKEND_HANDOFF.md for integration details. Original full-stack roadmap statuses remain unchanged.
