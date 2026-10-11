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
- Panel `worker/src/routes/public.js`: `789acc2c88cf856c797cb9897b8664476fd86ba8`
- Panel `worker/src/routes/panel.js`: `c47b8b5ac99d0ec8355992600e4410401b1f9fe9`
- Panel `worker/public/panel/js/views/qr.js`: `2218241ba7c7e091acf2da9f4fcc39e39a164f97` (unchanged)
- Panel `worker/public/panel/panel.css`: `9bf3d4e37d44c65389be4799ea89397fc823acbf`
- Panel `worker/public/panel/js/app.js`: `dcf0249240c8bff84aa497d27515ce09242f8a6f`
- Panel `worker/public/panel/js/views/settings.js`: `c8f9859f0d7605ecc094f8ec7475159ca1f3a27e`
- Panel `worker/src/lib/panel-overrides.js`: `8654e9f660f383a7e3b10a26feb789b2cc3c173f`

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
- The upload route is wired: bounded multipart stream (5 MiB + small multipart allowance), MIME + file signature checks, session permission, upload attempt rate-limit, random object name, and fixed media URL. The new `requireR2Photo` verifies same-origin `/media/...` key plus R2 object/type for category `other`.
- The Worker override map is synchronized from matching `worker/public/panel/*` source files; without this, the embedded `/panel/panel.css` and app file would have hidden changes in the public files.

### Public API `worker/src/routes/public.js`
- Has server-side rate limiting for partnership leads, reviews, and orders using hashed anonymous client ID, a recent duplicate-review check, and a review-ban lookup table `review_bans`. Valid and invalid form attempts are now counted after the quota check to stop repeating invalid payloads without consuming quota.
- Verified read-only against the live `sepidar-db` D1 schema: `review_bans`, `access_tokens`, `rate_limits`, `reviews.client_key_hash`, `sessions.bootstrap`, `sessions.access_token_id`, and related indexes exist. No D1 writes/migrations were performed.
- IP is intentionally not used/stored in the current public identity code; don't silently reintroduce IP-based enforcement.

## Work completed in this checkpoint (feature branch only)
- Found the actual config at `worker/wrangler.jsonc`; it has D1 binding `DB`, `SESSION_TTL_HOURS: "8"`, and **no active R2 binding**.
- Verified live `GET /health` and live public site with TinyFish. Live health reported `image_upload:false`; live Pages/Worker are still the production deployment and do not yet include this feature branch.
- Confirmed the customer site supports `?r=`; changed the admin QR API metadata from `customer_reads_param:false` to `true` so the UI no longer warns incorrectly after deployment.
- Patched QR layout at mobile widths (single-column, bounded QR/phone preview, no perspective transform on narrow screens) and disabled accidental selection/long-press highlight on non-editable panel controls while preserving input and token-code selection.
- Hardened image upload with bounded streaming multipart parsing and file-signature checks. Server now checks `other` category photo URLs are same-origin `/media/` objects that exist in R2 and have approved image metadata. This is branch code only.
- Public lead/review/order rate-limit accounting now consumes quota on invalid attempts as well as valid submits, after checking the current limit. Admin routes already have a general 100 mutations/5-min/session limiter; token, item/category, and image-upload paths also have targeted caps.
- Corrected misleading token/session copy in both login and settings screens: current config uses an 8-hour session; token lifetime is independent. Raw access tokens stay out of browser storage; the session is an HttpOnly cookie.
- Synced the static `PANEL_OVERRIDES` map byte-for-byte from the corresponding `worker/public/panel` source files; cache query keys are now `20261011-qr-touch6` so clients do not keep stale copies.
- Customer branch syntax/structure check passed: inline JS parses; CSS braces balance; only light/dark theme options exist, accents are orange/mint/violet, and `other` cards show a photo-required placeholder rather than the 3D canvas when no photo exists.
- MagicPath concept created and built successfully, component `459966707872710656`, revision `459966707872710657`, name `fine-world-9729`. It is a safe design mock only; it is not integrated into the production site.

## Blocking configuration
Cloudflare API returned error `10042: Please enable R2 through the Cloudflare Dashboard` when attempting a read-only bucket list. R2 is not enabled for the account, so no bucket could be listed or created. Do not add an active `FOOD_IMAGES` binding until the owner enables R2 in the dashboard and creates/confirms bucket `sepidar-food-images`. No D1 data was changed.

## Remaining work (continue in this order)
1. Run smaller-batch final syntax/consistency checks for all changed JS and verify `PANEL_OVERRIDES` strings match source assets; avoid oversized multi-file returns.
2. Review `worker/public/panel/js/views/qr.js`, `panel.css`, the QR API response, and customer menu route together for QR/mobile consistency.
3. Recheck demo paths and ensure all mutations in demo mode remain synthetic/local only.
4. Inspect any remaining dark surfaces with a focused list (modals, alerts, review form, customer bottom cart bar, admin bottom navigation and cards); do not rewrite whole theme CSS unnecessarily.
5. If/when R2 is enabled, create/confirm bucket and add `r2_buckets` binding to `worker/wrangler.jsonc`, then test upload → saved image URL → media GET/HEAD → category `other` validation. Until then `image_upload` must stay false and upload UI must stay disabled.
6. Make read-only production smoke tests again, review branch diff/build, then open draft PRs and wait for full validation; do not merge/deploy yet.

## Prior known result
Customer API integration had previously been merged at commit `e022c20760ef1025086a97f77b6fd8f0522dbbad`; current feature work was created after that. Do not assume the latest branch has reached production. Prior customer account/tracking/theme updates had a live smoke-test mismatch, so verify actual deployed surfaces.

## Immediate next file to inspect
Continue with a single-file fetch of `worker/src/routes/panel.js` around `menu/images`, `review-bans`, `tokens`, and migration paths; then inspect the full `menu.js` upload handler. Earlier fetches were too large when several full pages were returned together, so extract only relevant sections.


## Continuation update after mobile-app crash (2026-10-11)
- The checkpoint was re-opened and read; work resumed from the existing branch rather than restarting.
- Before changing admin panel selection CSS, saved the exact previous CSS at `backups/2026-10-11/panel-css-before-selection-scope-fix.css` (backup commit `ac4cb6c039f2c71907c20680afe504ee3ad7c256`).
- Fixed an over-broad selection rule in `worker/public/panel/panel.css`: selection suppression is now limited to controls/cards/navigation and QR elements, not every element on the page. Input fields, contenteditable, code/pre, token prefix, QR URL code and explicitly selectable text remain selectable. Source blob SHA is now `8513ee2b3b060dc1e3b10648f13e48b024d01ea3`.
- Bumped panel asset query versions in `worker/public/panel/index.html` from `20261011-demo-qr8` to `20261011-selection9` (two references); source blob SHA `f6ff14f566328647c1b325509d5bd3874accf37c`.
- Regenerated `worker/src/lib/panel-overrides.js` from its nine mapped public assets. All nine override bodies are now byte-for-byte equal to their corresponding source assets. New map blob SHA `dffe7e96f048c6faf430b7c2c3228e4c8f85b538`.
- Post-edit static validation passed: JavaScript parse-only checks for Worker entry/routes, override map and panel modules including menu, QR, reviews and settings; CSS brace balance is zero; the old cache version no longer exists in panel HTML. This is static validation only, not a production deployment/visual browser test.
- Latest branch head at this point: `c9f65764a3511e217d935f6fe7d14f4daf49db39`.
- Reminder: current `worker/wrangler.jsonc` still has no active `FOOD_IMAGES` R2 binding; do not mark uploads ready or deploy the photo feature until R2 is enabled in Cloudflare and the binding is configured.
- Next: finish focused theme/grid audit, check API/UI route alignment, re-run validation after any edit, inspect branch diff/CI, then open draft PRs only after checks. Do not merge/deploy or write to production D1.
