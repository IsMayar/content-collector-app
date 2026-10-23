# Reference boards 06–10 verification

Date: 2026-10-23. Frontend-only redesign; MSW opt-in mode, synthetic data, installed Edge.

- Build (strict TypeScript + Vite): passed.
- ESLint: passed.
- Vitest: 45 passed with one thread worker. Earlier concurrent runs timed out on two auth tests; isolated rerun passed. Ownership transfer regression also caught fixture membership aliasing, fixed by replacing membership records instead of mutating shared fixture objects.
- Browser full run: 30/33 passed; the three new workflow cases initially failed due to an ambiguous test selector. Subsequent runs found a real stale asset-list state, fixed with refetch after READY.
- Final focused run: 9/9 passed, at desktop, tablet and phone widths. Covers client draft/submission/approval/export; client upload and explicit AI acceptance; team invitation permissions, agency upload/download, gallery/list and completion eligibility. No horizontal page overflow in those journeys.
- Existing keyboard sign-in and item-drawer focus tests passed in the full run. Native dialogs support Escape, focus wrapping and focus restoration. Screen-reader testing and real-device camera selection were not performed.

Visual evidence includes team invitation, file details, completion, client editor/upload and export at desktop/tablet/phone widths. Reviewed desktop invitation and mobile file/editor renders. Fixed inherited generic dialog max-width that squeezed reference drawers. Layouts use actual content/permissions; empty and unavailable-data states are intentional. This is not a measured pixel-perfect certification.

See `../FRONTEND_BACKEND_HANDOFF.md` for API extensions and missing metadata. Production services, real file scanning/storage, emails and full MVP acceptance are not verified by this run.
