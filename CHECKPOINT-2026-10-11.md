# Sepidar handoff checkpoint — 2026-10-11

## Working rule
Continue only on `feat/release-hardening-2026-10-11`. Do not merge/deploy to production or change/delete D1 data until the changes are audited and tested. Never report a feature as live just because a branch contains code. Keep edits incremental; fetch the current file and its SHA immediately before editing.

## Repositories / live surfaces
- Customer site repo: `hosseinasgari898989-dev/sepidar-restaurant-platform`
- Admin/API repo: `hosseinasgari898989-dev/sepidar-restaurant-panel`
- Customer Pages URL: https://hosseinasgari898989-dev.github.io/sepidar-restaurant-platform/
- Admin panel URL: https://sepidar-restaurant-panel.willow-poppy-10df.workers.dev/panel/
- Worker root is the health endpoint; panel is under `/panel/`.
- D1 database name previously recorded: `sepidar-db`. Never run destructive migrations or mutate production data without first checking the actual schema and backing up.

## Confirmed branch/file state (GitHub content SHA, not commit SHA)
- Customer `index.html`: `89ab04d7a991793f217b7eae486878347deacc06`
- Panel `worker/src/index.js`: `234e52a9a7fbfb181526054ca97a3592f33a34ce`
- Panel `worker/public/panel/js/api.js`: `18d3d6b65e836409611a190a846c1b36066a6047`
- Panel `worker/public/panel/js/views/menu.js`: `d9b66aa5ef7758f807207261fd79a61acf6a151c`
- Panel `worker/src/routes/public.js`: `1084f0fe318f9cd58b5505810a91c358932cc332`
- Panel `worker/src/routes/panel.js`: `5ea69349c0e8fd5a66eecef4399ac8874d85b515`
- Panel `worker/public/panel/js/views/qr.js`: `2218241ba7c7e091acf2da9f4fcc39e39a164f97`

## Already present on the working branch
### Customer `index.html`
- Anonymous browser ID sent with review, partnership lead, and order requests. It is a moderation/rate-limit signal, not strong identity: users can remove cookies too.
- Text-selection/context-menu suppression outside editable controls.
- Cart item snapshot fallback and rendering of uploaded food photos.
- For product cards/customization sheet, a real photo can replace the 3D emoji canvas; category `other` has no 3D fallback.
- CSS viewport bounds/rounded modal styling and reduced selection/tap highlight.
- A prior quick JavaScript syntax check passed; CSS brace balance was zero. This is not a full browser or production verification.

### Admin `worker/src/index.js`, `worker/public/panel/js/api.js`, `worker/public/panel/js/views/menu.js`
- `/media/{key}` GET/HEAD path checks an R2 binding named `FOOD_IMAGES`, constrains key/content type and sets defensive headers.
- API client has `uploadImage(file)`, sends `device_id` on login (device ID is not the session token), and exposes review ban/unban/delete API methods.
- Food editor already contains a file-picker/upload button UI, URL field, and explanatory “Other = real photo only” label. Previous attempt to re-add that markup was unnecessary; the editor file already had it.
- `worker/src/routes/panel.js` contains image-signature validation helper and panel/restaurant rate-limit helpers. Need inspect actual upload route and ensure it is wired correctly.

### Public API `worker/src/routes/public.js`
- Has server-side rate limiting for partnership leads and reviews using hashed anonymous client ID, a recent duplicate-review check, and a review-ban lookup table `review_bans`.
- This code references schema fields/tables `review_bans`, `reviews.client_key_hash`, and rate-limit storage. Verify migrations/schema exist and match before assuming it works.
- IP is intentionally not used/stored in the current public identity code; don't silently reintroduce IP-based enforcement.

## Outstanding work (continue in this order)
1. Finish checkpoint then inspect actual migrations/schema, `worker/wrangler.toml` (the guessed path was 404; discover correct config path), `worker/src/index.js`, and panel/public routes.
2. Verify food-image upload route, content validation/size cap, authorization, R2 binding/bucket config, and how deployment secrets/bindings are configured. Do not claim R2 is production-ready until the binding and bucket are confirmed.
3. Complete category `other` server-side validation (uploaded photo required); ensure other-category items cannot silently use 3D fallback; dynamic categories are admin-managed and customer menu reads them from API.
4. Review admin token lifecycle UI/backend: create/revoke/expiry (hour/day/year/permanent), hashing/secure storage, no raw access token in localStorage, correct session expiry/revocation. The user mentioned a limited 8-hour session; verify actual auth code before relying on that claim.
5. Implement or verify server-side review delete/ban/unban routes and moderation UI. Ensure only authorized admin sessions can invoke them, and ban identity works as far as browser IDs allow; disclose that cleared cookies/another device can evade a browser-only identity.
6. Inspect QR page layout and responsive CSS; prevent QR preview/iframe/cards from overflowing on mobile; keep safe sandbox and avoid production mutations.
7. Audit dark mode across customer + admin, remove customer “warm/mild” option if still present, make selected accent color consistent, check notifications/modals/sheets/footer management panel.
8. Verify no-select behavior keeps inputs/textareas/selects/contenteditable and accessibility interactions usable.
9. Rate-limit order spam, admin add/edit menu operations and token actions. Confirm rate-limit errors are clear and fail closed where security matters.
10. Demo/preview must be clearly non-production and must not mutate real menu/orders/reviews/tokens.
11. Use TinyFish for live public-page inspection and MagicPath for design exploration, but do not treat MagicPath output as deployed code. Run safe read-only smoke tests; do not submit fake real orders/reviews to production.
12. Perform JS/build checks and mobile/desktop smoke tests, review diff, then open draft PRs; do not merge until all critical checks pass.

## Prior known result
Customer API integration had previously been merged at commit `e022c20760ef1025086a97f77b6fd8f0522dbbad`; current feature work was created after that. Do not assume the latest branch has reached production. Prior customer account/tracking/theme updates had a live smoke-test mismatch, so verify actual deployed surfaces.

## Immediate next file to inspect
Continue with a single-file fetch of `worker/src/routes/panel.js` around `menu/images`, `review-bans`, `tokens`, and migration paths; then inspect the full `menu.js` upload handler. Earlier fetches were too large when several full pages were returned together, so extract only relevant sections.
