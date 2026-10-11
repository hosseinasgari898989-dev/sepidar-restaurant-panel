# Sepidar checkpoint — 2026-10-11

This is a continuation checkpoint for ChatGPT after a conversation/app crash. Work must continue from this branch, not from scratch.

## Repositories and branches
- Admin/API repo: `hosseinasgari898989-dev/sepidar-restaurant-panel`
- Customer Pages repo: `hosseinasgari898989-dev/sepidar-restaurant-platform`
- Working branch in both: `feat/release-hardening-2026-10-11`
- Production MUST NOT be changed or merged until the feature branch is reviewed and tested.

## Confirmed state recorded in conversation
- Customer `index.html` changes committed earlier: `e3fab6e5514cb2b190d71a4aa13a526f960edcfe`
  - Visitor client ID + request payload fields for review/lead/order; selection prevention outside editable controls; image_url photo rendering; modal sizing/mobile styling; other-category photo-only customization; cart image snapshot fix.
- Admin `worker/public/panel/js/api.js` commit: `ba2836e28ab6fe59065028454743c565d821783c`
  - Device identifier sent at login (not the access token); image upload client method; ban/unban/delete review API client methods.
- Admin `worker/src/index.js` was updated on the branch to expose guarded R2 `/media/{key}` GET/HEAD handling and set `image_upload` capability based on the `FOOD_IMAGES` binding. Re-fetch and inspect its current branch content before relying on it.
- Current admin menu editor `worker/public/panel/js/views/menu.js` at blob SHA `6d70127edfdb88be497f31bf13cc34884bdab5c6` already contains upload-photo UI, category “other” photo-only messaging, and image_url preview. This must be verified against server route and actual binding. A prior attempted patch for this file failed to apply; DO NOT assume that exact attempted patch landed.
- Some JS/CSS syntax checks previously passed for the customer page and admin API client, but the entire application is not yet validated.

## User requirements still to finish/check
1. Create a safe checkpoint before further work (this file is the durable checkpoint).
2. Inspect server routes and schema before editing, then implement authenticated R2 image upload with type/size checks and a stable public media URL; confirm R2 binding in wrangler and deployment config.
3. Inspect and add persistent server-side abuse controls for reviews, partnership leads, and orders; client-side IDs are hints only, not trusted authorization. Do not claim a cookie survives if the user clears all cookies/storage.
4. Implement backend + admin UI for delete reviews and ban/unban reviewer; client API methods currently exist but backend routes need verification.
5. Check token management UI/backend for add/revoke and expiry options (hour/day/year/permanent), and make sure bearer/session secrets are never stored in browser localStorage.
6. Fix customer and admin dark mode across modal/sheets/notifications/footer management panel; remove customer “warm/mild” theme if present; ensure accent color is applied consistently.
7. Fix admin QR section layout; mobile sheets/cards must fit viewport and remain rounded; prevent long-press text highlighting outside form fields.
8. Dynamic categories and mandatory real uploaded photo for “other”; other category must not use the 3D emoji/canvas renderer.
9. Review safe admin demo/preview so it cannot mutate production data.
10. Use MagicPath for visual design review and TinyFish/browser testing where appropriate, then run syntax/static checks and live read-only smoke tests. Do not create real orders or spam public APIs during tests.
11. Keep backups, report exactly what was and was not tested. No destructive D1 operations. Do not merge/deploy unfinished work.

## Immediate next step
Fetch and inspect the current files individually (avoid huge parallel responses): 
- admin `worker/src/routes/public.js`, `worker/src/routes/panel.js`, `worker/src/index.js`, `worker/wrangler.toml`
- admin review/token/QR/theme views and CSS
- customer `index.html`
Then continue from the first unresolved issue with tests and small commits.
