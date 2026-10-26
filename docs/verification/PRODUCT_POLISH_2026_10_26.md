# Product UI polish — 2026-10-26

## Changes

- All six agency authentication routes use a teal welcome pane and a white form pane inspired by the user-supplied Diprella screenshot and https://uxplanet.org/9-inspiring-website-login-form-pages-a71cd06a5db. Rounded actions, subdued fields, geometric background accents and responsive stacking replace the old blue split layout. Existing validation, verification, recovery and invitation exchange are retained. No unsupported social sign-in controls were added.
- Decorative directional glyphs and standalone arrow/chevron action icons were removed across public pages, auth, projects, client portal, templates, review and settings. Functional reorder actions retain accessible names and now display Up / Down text. Standard dropdown and file actions remain usable.
- Projects and Templates are retained as different entities: a project holds one client's live work, drafts, submissions, assets and review; a template is a reusable starting structure copied into an independent project snapshot. Page descriptions now state that distinction. Using a template still opens project details directly; selecting another template remains optional.
- Project details show a two-column customer choice: Add a new customer with name/contact/email fields on the left, Select an existing customer on the right. Radio selection enables only the chosen path, keeps entered values when switching and preserves normal customer creation.
- Team invitation uses a correctly sized search field with focus treatment, selected-project count, bounded project list, selected row styling, no-match state and a separate permissions panel. Review/export toggles are disabled until a project is selected.
- Insights now opens with actual loaded-project totals, a project selector and default selected-project analytics. Empty/error states remain available; historical series and trends are not fabricated.

## Verification

Production build with strict TypeScript, ESLint and Prettier passed. Unit suite: 47 passed with one fork worker; an initial thread worker timed out during startup, so it was rerun separately. Seven focused desktop browser cases passed before the full responsive run. Full responsive browser suite: 57 passed across desktop 1440×1000, tablet 768×1024 and phone 360×800. After this full run, four purely visual file/install icon substitutions removed the remaining arrow-shaped pictograms; final production build/code checks and PWA verification were run again.

New tests exercise all six auth layouts, create a new customer through the new selector, verify existing/new paths stay separate, check invitation search sizing/no-match/selection, and switch projects in Insights. Existing keyboard, validation, invitation, owner/member, project-type, upload, review and export tests remain in the suite.

Visual review: desktop account creation, invitation drawer and Insights inspected. Tablet signup plus phone sign-in, customer selection and invitation screenshots were also inspected. No horizontal page overflow was found in the new exercised journeys. Screenshot evidence is saved as `product-polish-{desktop|tablet|phone}-*.png`. This is frontend/MSW verification; live provider/backend completion is not implied.

Final production PWA cache-isolation/offline navigation check: 1 passed. Final build/TypeScript, lint and formatting checks passed after the last icon changes.
