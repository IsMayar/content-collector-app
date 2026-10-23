# Reference redesign verification

Updated 23 October 2026. Synthetic HTTP-mock data, installed Microsoft Edge.

## Screen evidence

| Reference | Implemented view | Capture |
| --- | --- | --- |
| 01 public | Landing with product preview and three-feature strip | [Desktop](reference-public-desktop.png) |
| 01 public | Pricing, comparison and FAQ | [Desktop](reference-pricing-desktop.png) |
| 01 public | Searchable help topics | [Desktop](reference-help-desktop.png) |
| 01 public | Legal article navigation; policy explicitly draft | [Desktop](reference-privacy-desktop.png) |
| 02 authentication | Form and contextual illustration panels | [Desktop](reference-auth-desktop.png), [phone](reference-auth-phone.png) |
| 03 project setup | Template tiles, preview, details and review | [Templates](reference-wizard-templates-desktop.png), [preview](reference-template-preview-desktop.png), [details](reference-wizard-details-desktop.png), [review](reference-wizard-review-desktop.png), [phone review](reference-wizard-review-phone.png) |
| 04 workspace | Metrics, recent-project table and attention panel | [Desktop](reference-overview-desktop.png), [phone](reference-overview-phone.png) |
| 05 structure | Section navigation and item table | [Desktop](reference-structure-desktop.png), [phone](reference-structure-phone.png) |
| 05 settings | Item settings and repeater configuration | [Drawer](reference-drawer-desktop.png), [repeater](reference-repeater-desktop.png) |

Full-page screenshots of dialogs may include the background above the current viewport. The live dialog is modal and fixed to the right edge; focus trapping, Escape and focus restoration are verified by browser tests.

## Checks performed

- Production Vite build and strict TypeScript: pass.
- ESLint, zero warnings: pass.
- Prettier check: pass.
- Vitest/Testing Library/HTTP regression: 42 pass with one thread-pool worker. Default process workers initially timed out during startup.
- Browser suite: 27/30 initially pass; three failures addressed by two fixes. Six targeted reruns across all three viewport configurations pass, covering every previously failed case.
- Phone overflow fixed by giving the scrollable table wrapper a positioning context, so its screen-reader-only column heading stays within the scroll container.
- Accessible password toggle restored to text labels while retaining eye icons. Drawer now explicitly wraps forward/reverse keyboard focus.

## Scope and intentional differences

The supplied images are multi-panel boards rather than individual viewport exports. The application uses their layout, palette, navigation, forms, tables and editor patterns, adapted to full-size responsive pages. Presentation board numbers, navy board title bars and board footers are not application chrome.

Actual project data, counts, template names and permission rules are retained. The guide's password requirements, required due dates and supported logo formats remain authoritative. No mock image text is used to pretend a successful email, upload, payment or approval. The development demo banner remains visible in mock mode. Legal text is an explicit draft, and Help does not pretend to send a message to an unavailable support service.

The navigation map references boards 06–14, but their detailed screen images were not attached. Their existing routes use the shared visual system; exact visual matching of those unprovided boards is not claimed. No backend, provider, physical-device or screen-reader validation was performed in this UI change.

## Start the preview

```powershell
Set-Location -LiteralPath 'D:\F drive data\Website Content Collector\frontend'
npm run dev:mock
```

Open the local URL printed by Vite. Use the existing dependencies; do not run `npm ci` while another frontend development server is using the native CSS module.
