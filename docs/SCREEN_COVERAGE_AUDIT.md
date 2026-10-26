# Screen coverage and navigation audit

Date: 2026-10-24. Audited against the user-provided 14-board / 76-panel index and navigation map.

**53 implemented panels; 23 partial panels.** All 14 board groups have frontend coverage. Several dedicated subpages and reference states are still absent; they are listed explicitly below.

Implemented means the frontend capability and reachable screen/state exist in opt-in MSW demo mode. It does not certify exact visual matching or a production backend. Partial means a usable portion exists but named reference elements/states are missing. Mobile panels reuse the responsive client implementation; they are not separate native apps.

| Panel | Screen / state | Frontend status | Evidence / remaining gap |
| --- | --- | --- | --- |
| 01.1 | Landing page | Implemented | Public landing and entry actions. |
| 01.2 | Pricing comparison | Implemented | Solo/Agency comparison and entry links; proposed pricing. |
| 01.3 | How it works / help | Partial | Searchable help topics exist; reference contact-message form is absent. |
| 01.4 | Privacy / terms | Implemented | Reading layouts exist; policy content remains a launch draft. |
| 02.1 | Sign in | Implemented | Credential form, validation, error and return destination. |
| 02.2 | Create account | Implemented | Registration and validation. |
| 02.3 | Verify email | Implemented | Verification, resend and invalid/expired states. |
| 02.4 | Forgot password | Implemented | Reset request with generic acknowledgement. |
| 02.5 | Reset password | Implemented | New-password form and invalid/expired link handling. |
| 02.6 | Accept team invitation | Implemented | Invitation survives sign-in; explicit acceptance. |
| 03.1 | Workspace setup | Implemented | Workspace name/logo/work mode/preferences creation. |
| 03.2 | Template gallery | Implemented | Project-type and industry selection. |
| 03.3 | Website template preview | Implemented | Section/item preview and template selection. |
| 03.4 | Project details wizard | Implemented | Project/client/due date/timezone fields. |
| 03.5 | Web/mobile template preview | Implemented | Type-specific template previews. |
| 03.6 | Review and create project | Implemented | Review, draft/create and invitation flow. |
| 04.1 | Owner overview | Implemented | Metrics, recent projects and attention links. |
| 04.2 | Projects search / filters / pagination | Implemented | Search/type/state/sort and page controls. |
| 04.3 | Assigned member overview | Partial | Assigned-project dashboard exists; separate My exports and review-queue dashboard widgets are absent. |
| 04.4 | Empty workspace / switcher | Implemented | Empty state and membership workspace picker. |
| 05.1 | Section and item editor | Implemented | Structure and keyboard ordering controls. |
| 05.2 | Item configuration / eight types | Implemented | Field configuration drawer and validation controls. |
| 05.3 | Repeater builder | Implemented | Column definitions, required flags and row preview. |
| 05.4 | Conditional visibility / conflicts | Partial | Single-condition controls and conflict errors exist; guided schema-conflict resolver is absent. |
| 05.5 | Workspace templates | Implemented | Library, copying, draft editing and version publishing. |
| 05.6 | Application structure | Partial | Web/mobile template content uses generic structure editor; dedicated screen editor and phone-preview workspace are absent. |
| 06.1 | Team and seats | Implemented | Members, pending invitations and seat counts. |
| 06.2 | Team invitation / assignments | Implemented | Invite drawer with project assignments and review/export grants. |
| 06.3 | Project client grants | Implemented | Project-scoped contact/access table. |
| 06.4 | Contact / invitation preview | Partial | Contact drawer and email preview exist; personal invitation message is absent. |
| 06.5 | Read-only preview / revoke | Implemented | Owner preview and revoke-access confirmation. |
| 06.6 | Ownership / member removal | Implemented | Transfer reauthentication and removal guards. |
| 07.1 | Secure link / recovery | Implemented | Explicit link exchange and fresh-link recovery. |
| 07.2 | Client checklist | Implemented | Sections, progress and continue actions. |
| 07.3 | Content editor / save / submit | Implemented | Draft/autosave, comments and explicit immutable submission. |
| 07.4 | Typed answers / repeating rows | Implemented | All supported answer types and repeaters. |
| 08.1 | Mobile invitation | Implemented | Responsive invitation/exchange view. |
| 08.2 | Mobile checklist | Implemented | Responsive checklist/progress. |
| 08.3 | Mobile editor | Implemented | Responsive editor and save/submit actions. |
| 08.4 | Camera / photo selection | Implemented | File picker and camera capture input; physical-device behavior unverified. |
| 08.5 | Upload queue / retry | Implemented | Progress, processing, retry/cancel and per-file errors. |
| 08.6 | Changes requested / session recovery | Partial | Feedback editing/resubmission and fresh-link recovery exist; complete board-specific expired-session recovery with restored unsaved input is unverified. |
| 09.1 | AI fact input | Implemented | Facts, tone and length input; no automatic submission. |
| 09.2 | AI preview / acceptance | Implemented | Draft comparison, explicit acceptance/discard/retry. |
| 09.3 | Review queue | Partial | Per-project queue exists; workspace-wide queue with all-project/assignee/status filters is absent. |
| 09.4 | Revision / discussion | Implemented | Immutable revision review and public/internal comments. |
| 09.5 | Request changes / approval / reopen | Implemented | Exact-revision decisions and confirmations. |
| 09.6 | Revision comparison / stale decision | Partial | Two-version comparison and stale decision guards exist; full reference decision/activity comparison timeline is absent. |
| 10.1 | File library | Implemented | Gallery/list, filtering and linked content. |
| 10.2 | File detail / preview / original | Partial | Drawer, preview/download/delete exist; version lineage, dimensions and original/current version selector are absent. |
| 10.3 | Upload errors / quota / rejection | Implemented | Shared upload queue handles failed reservation, expiration, rejection and retry. |
| 10.4 | Approved export options | Implemented | Two-step format/section selection and approved snapshot rules. |
| 10.5 | Export history / downloads | Implemented | Job states, download/refresh/retry actions. |
| 10.6 | Completion / archive / restore | Implemented | Completion progress and lifecycle actions. |
| 11.1 | Reminder policy / pause | Implemented | Policy enable/pause and channel summaries. |
| 11.2 | Cadence / timezone / quiet window | Partial | Relative day/time/weekday/channel/timezone editing exists; quiet-window controls and next-send timestamps are absent. |
| 11.3 | Email preview | Partial | Recipient/channel eligibility preview exists; editable subject/body/variables and sandbox test-email action are absent. |
| 11.4 | SMS consent / verification / opt-out | Implemented | Client-only consent, code verification and opt-out. |
| 11.5 | Delivery / unknown outcome | Implemented | Delivery metrics/table/filter and unknown-outcome reconciliation explanation. |
| 11.6 | Suppression / recovery | Partial | Reason explanations exist; live issue-specific status and resolution commands are absent. |
| 12.1 | Project analytics | Partial | Current metrics/section chart exist; historical daily series, date/assignee filters and period comparisons are absent. |
| 12.2 | Item friction safeguards | Implemented | Friction observations, incomplete windows and insufficient-data indicators. |
| 12.3 | Counts-only sharing / embed | Implemented | Create/copy/embed/revoke and public counts exchange. |
| 12.4 | Digest settings / preview | Partial | Daily enable/timezone/preview exist; recipients/send-time/test-digest controls are absent. |
| 13.1 | Workspace identity / deletion | Partial | Name/timezone/logo/owner/deletion guard exist; default language and distinct workspace archive flow are absent. |
| 13.2 | Account / password / sessions | Partial | Profile/password/session revocation exist; account photo and sign-out-all-others control are absent. |
| 13.3 | Resource usage | Partial | Storage/seats/AI/SMS totals and meters exist; detailed storage categories and usage-detail subpages are absent. |
| 13.4 | Plans / hosted billing | Implemented | Plans and hosted checkout/portal entry with demo disclosure. |
| 13.5 | Checkout return / subscription | Implemented | Latest actual subscription state and refresh; no false payment success. |
| 13.6 | Limits / upgrades / data requests | Partial | Usage limits, plan links and deletion request exist; dedicated seat-adjustment and data-export request UI are absent. |
| 14.1 | Components / state system | Partial | Shared styles/components exist; standalone design-system showcase page is absent. |
| 14.2 | Loading / empty / error / permission | Partial | Functional states exist; 404 and permission views do not fully reproduce the illustrated board layouts. |
| 14.3 | Autosave conflict / offline | Partial | Retained local input, copy/retry and offline banner exist; comparison labels last-retrieved data, not a freshly fetched latest server draft. |
| 14.4 | Session expiry / unsaved changes | Partial | Reauthentication/fresh-link and native navigation guards exist; dedicated illustrated dialogs and end-to-end draft restoration are incomplete. |
| 14.5 | Responsive navigation / tablet | Partial | Responsive layouts and auto-closing mobile menu exist; reference navigation sheet and user motion-preference control are absent. |
| 14.6 | PWA / offline / feedback | Implemented | Conditional install prompt, public offline fallback, confirmations and feedback; physical installation unverified. |

## Where to navigate

Use `/app` after signing in; it selects the current workspace or opens onboarding. In the paths below, `w` means `/app/w/{workspaceId}` and `p` means `w/projects/{projectId}`.

| Area | Destination |
| --- | --- |
| Public | `/`, `/pricing`, `/about`, `/privacy`, `/terms` |
| Authentication | `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password`, `/team-invite` |
| Setup / templates / projects | `/app/onboarding`, `w/templates`, `w/projects/new`, `w/projects` |
| Owner / assigned overview | `w/overview`; role determines the view |
| Project content / activity / analytics | `p?tab=checklist`, `p?tab=activity`, `p?tab=analytics` |
| Access / assignments / preview | `p?tab=access`, `p?tab=assignments`, `p?tab=preview` |
| Review / files / export / completion | `p?tab=review`, `p?tab=files`, `p?tab=exports`, `p?tab=completion` |
| Reminders | `p?tab=reminders`, then Policy / Cadence / Preview / Delivery / Issues |
| Team / account / workspace | `w/team`, `w/settings?view=account`, `w/settings` |
| Digest / privacy / billing / usage | `w/settings?view=digest`, `w/settings?view=privacy`, `w/billing`, `w/billing?view=usage` |
| Subscription / workspace analytics | `w/billing?view=status`, `w/insights` |
| Private client | `/client/access#token=…` → `/client/projects/{projectId}`; Checklist / Files / Activity / Notifications |
| Public counts-only share | `/status/{shareId}#token=…` |

## Navigation corrections in this audit

- Assigned members now see the project Analytics link, consistent with existing scoped read permission. Counts-share management stays owner-only.
- Unknown or disallowed project tabs show an unavailable-view state with Back to content instead of a blank content area. Review and export remain permission-gated.
- Unknown settings/billing views render a valid default screen.
- A workspace URL outside current memberships shows the permission-recovery page before rendering its workspace content.
- Mobile workspace navigation closes after choosing a link.
- Client Checklist stays highlighted while editing a checklist item.

## Evidence

Source inspection: `frontend/src/app/router.tsx`, `components/Layouts.tsx`, `features/projects/*`, `features/client/ClientPages.tsx`, `features/review/ReviewPanels.tsx`, `features/settings/*`, public/auth screens and previous verification records. New checks live in `frontend/e2e/navigation.spec.ts`. Browser results are recorded in IMPLEMENTATION_STATUS.md after execution.

Source audit found no completely absent board group. Missing dedicated views include the application screen/phone preview editor, workspace-wide review queue, design-system showcase, detailed usage views and data-export request flow. These are not counted as fully implemented just because their parent route exists.

## Final verification

Completed 2026-10-25. Production build/strict TypeScript, ESLint, Prettier and 47 unit tests passed. Six new owner/member navigation cases passed at 1440×1000, 768×1024 and 360×800. Nine additional browser regressions passed at the same sizes: keyboard sign-in/logout, client draft → submission → agency review → approved export, and administration settings/reminders/analytics/share navigation. This audit did not rerun every previous browser case or certify exact visual fidelity. Backend/provider integration is outside these frontend results.

The first navigation run used hard reloads into protected demo URLs, which reset the deliberately in-memory MSW session. The tests were corrected to exercise in-app history navigation; all six then passed. Production session persistence is not proven by synthetic tests.


## Navigation update — 2026-10-26

Billing and Usage are reached through Settings tabs; the duplicate primary-sidebar Billing & usage entry was removed. Existing billing/usage route URLs still work. Choosing Use template in the library/preview now starts at Project details with that template selected; ordinary Create project keeps the chooser, and Change template is an explicit optional action.
