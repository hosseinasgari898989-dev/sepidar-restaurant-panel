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


## Follow-up work added on 2026-10-11 (keep on feature branch)
- Dashboard activity feed now maps known events to Persian labels and uses a Persian safe fallback instead of exposing raw English action identifiers.
- Panel dropdowns are wrapped in in-site custom menus (mobile/dark friendly); validate interaction on the final browser build.
- Access-token list now receives server time to avoid false expired labels caused by a device-clock mismatch. Single-token delete removes non-current rows and revokes their dependent sessions; bulk cleanup protects the token currently authenticating the session, or the newest still-valid token for bootstrap sessions.
- System category `other` is photo-only: UI hides emoji/customization fields, menu serialization strips old customization/model metadata, and API writes force photo-only fields. A valid R2 media URL is still required.
- Admin review screen now supports toggling a highlighted review and cycling styles (`glow`, `shine`, `burst`). Public review vote route and migration `worker/migrations/0005_review_reactions_and_featured.sql` were added for one vote per anonymous browser/review.
- Food editor now has a web-price search panel with selectable source results. The Worker route uses the Tavily API; it stays unavailable until Secret `TAVILY_API_KEY` is configured. Price suggestions are not automatically saved.
- R2 binding `FOOD_IMAGES` is now declared against bucket `sepidar-food-images` in `worker/wrangler.jsonc`, but Cloudflare API returned error 10042 because R2 has not yet been activated from the Dashboard. Create the bucket only after activating R2.
- Static syntax check passed for the changed panel JS modules, Worker routes/menu library, customer inline script, and JSONC (module imports/exports were stripped for parse-only checks). No interactive regression test has been run for these new changes.
- **Before any preview/live deployment:** activate R2 in the Cloudflare Dashboard, create `sepidar-food-images`, configure `TAVILY_API_KEY` as a Worker Secret, apply migration 0005 to the intended D1 environment, deploy only to a controlled preview, then test upload/voting/highlighting/token cleanup/web-price search before merging. Do not deploy unfinished feature branch to production.


## Final continuation update — 2026-10-11
- Category option rows now have a manager-controlled `اثر سه‌بعدی` selector. Supported choices include lettuce, tomato, cheese, mushroom, jalapeño, bacon/ham, egg, onion, pickle, and compatible-model switches for hiding chicken in chicken sandwiches or sausage in hot-dog models. Existing two-field option arrays remain valid; the third array value is optional and validated server-side.
- Customer's existing procedural 3D renderer now consumes these effect codes; compatible model layers update from the selected customization without a code edit. Effects are model-specific and are not an AI understanding of arbitrary text.
- Static parse check passed again after the latest commits for all edited JS modules/routes, customer inline JS, and JSONC. No interactive browser regression was run against these newest changes.
- Current branch-only highlights: single burger hero, no customer display-name/profile area, customer-site settings entry retained, review voting/highlighting, friendly activity labels, styled in-site dropdowns, token cleanup/time correction, photo-only Other category, 3D customization effect selector, and optional live price search.
- Still blocked externally: R2 cannot be activated through the current Cloudflare API connection; the API returns `10042` requesting one-time enablement in the Cloudflare Dashboard. Do not claim image upload works until R2 is enabled, `sepidar-food-images` is created, the Worker is deployed with `FOOD_IMAGES`, and upload/read paths are smoke-tested. Price search also requires the user to add `TAVILY_API_KEY` as a Worker Secret (never place it in Git or chat).
- Migration `0005_review_reactions_and_featured.sql` must be applied to a safe non-production test D1 or a planned release D1 before the vote/highlight endpoints are deployed. No D1 migration was applied here. Do not merge or deploy unfinished branch work.


- Latest 3D-customization follow-up: category option editor stores an optional third field `[label, price, visualEffect]`; backend validates the supported effect codes. The customer renderer maps codes by compatible model family to avoid treating a pickle as pepperoni in a pizza. Latest changed files passed static syntax parsing. These are feature-branch changes only.


## Image storage provider switch — ImageKit (feature branch only)
- User's ImageKit delivery URL established endpoint base: `https://ik.imagekit.io/amup8gp0i`. The given filename was `default-image.jpg`, so it is treated as a default/sample asset, not proof of a successful food-photo upload.
- Panel Worker now uploads validated JPEG/PNG/WebP/AVIF files (max 5 MiB) to ImageKit's server-side Upload API using Basic auth from secret `IMAGEKIT_PRIVATE_KEY`. Endpoint is configured as non-secret `IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/amup8gp0i`.
- Added strict validation for public ImageKit URLs in the per-restaurant `/sepidar/{restaurantId}/` folder and a server-side HEAD/content-type check before accepting an image for the system `other` category.
- Removed the R2 bucket binding from `worker/wrangler.jsonc`; health capability now depends on ImageKit endpoint + private-key secret. Old `/media/*` R2 URLs now return HTTP 410; new uploads return direct ImageKit URLs. Existing public/external image URLs for ordinary categories remain supported by the existing data flow.
- Updated panel UI messages/placeholders from R2 to ImageKit.
- **Not deployed or interactively tested.** Static JavaScript parsing passed, and the JSONC parses. The private key is not present in Git and has not been configured in Cloudflare. Before controlled preview, add Worker Secret `IMAGEKIT_PRIVATE_KEY`; then test actual upload, response URL, image display in panel/customer site, and `other` category save. Do not merge/deploy until verified.
- Current ImageKit endpoint in `worker/wrangler.jsonc` is `https://ik.imagekit.io/amup8gp0i`; the default-image URL supplied during setup is not an uploaded asset to use as the restaurant's actual food photo.


## Hotfixes deployed — 2026-10-11 13:58 UTC
- Worker redeployed from current `main` sources with API version `2026-10-panel-3`; Cloudflare health returned `ready`, all expected bindings present, and latest version assigned 100% traffic.
- Rebuilt `PANEL_OVERRIDES` to pin the current 17 admin UI assets (including menu editor and panel.css) instead of serving stale embedded menu/CSS. This addresses the prior mismatch where live UI still contained old R2 text/validation despite the ImageKit backend.
- Main menu editor now validates the category `other` image against a full ImageKit file URL under `/amup8gp0i/sepidar/{restaurantId}/...`, not the R2 `/media/` path. Category `other` hides emoji/model/customization/removal fields and saves empty metadata/removables.
- Added responsive category header/category badge layout and mobile price-search result styles; current main menu JS and all Worker modules passed static syntax checks.
- Customer main now has a floating burger without plate markup; category row is non-sticky; instruction hint is compact; long-press text selection/callout is disabled except in edit fields; optional 3D-effect values are retained during menu normalization. Latest customer inline JS passed static syntax parsing and public GitHub Pages serves the updated hint.
- Review vote POST now accepts `text/plain` JSON to avoid CORS preflight, validates Origin if present, and the customer frontend sends the simple request. GET reviews live API was verified; **no interactive POST vote test was possible**, so the vote error still needs the owner to tap 👍 after refresh.
- Live `/health` returned `2026-10-panel-3`, `ready`, with `image_upload: true`; review GET endpoint returns expected rows/counts. No authenticated ImageKit upload was exercised in this verification, so ask the owner to upload a real file from the panel and save the Other item to confirm end-to-end.
- AI price-search UI is included in the pinned menu JS and the backend route exists, but secret `TAVILY_API_KEY` is absent; real web search will return a setup warning until owner adds that Worker Secret.
- TinyFish browser wallet balance was negative at check time, so visual browser automation could not be run. Static checks and HTTP GET tests are not a substitute for tap-through mobile regression tests.


## AI price search relocation + relevance hardening — 2026-10-11 17:32 UTC
- Moved the AI price-search workflow out of the “New food” editor and onto the main “Menu management” screen. The manager selects an existing registered menu item, optionally enters a city/region, sees its current Sepidar price, and gets linked web results in one place.
- Applying a source price explicitly requires confirmation and updates only the selected existing menu item's price. Switching the selected item clears previous results to prevent applying a stale result to a different food.
- Fixed why previous output was noisy: prior route sent a broad free-text query with no date/country guard, requested an AI-generated answer and accepted raw results even when unrelated. That allowed an old IRNA item about chicken in Qom, references to poultry feed and conflicting rial/toman figures to appear together.
- New server search resolves `item_id` from the current restaurant's own D1 menu, queries the exact registered food name, sets Tavily's `time_range: "year"` and `country: "iran"`, disables the generic generated answer, removes dated results older than a year, filters result text by tokens from the selected food name, and proposes a price only when the source has an explicit currency and a parseable recent publication date. Rial values are converted to tomans. Unrelated results are not shown.
- Updated and pinned Worker assets `/panel/js/views/menu.js`, `/panel/js/api.js`, and `/panel/panel.css` so the deployed panel receives the relocated interface rather than stale static overrides.
- Static JavaScript checks passed for Worker route, menu view, API client, index, public route and override map. Cloudflare reports the latest Worker version `2026-10-panel-5`, `ready`, with 100% traffic on the latest deployment; ImageKit and Tavily secret bindings remain present.
- The live public Worker returned version `2026-10-panel-5` and health `ready`. The live panel menu asset contains the new “جستجوی قیمت روز” section.
- An authenticated end-to-end search click was not automated; owner should test by opening the panel, selecting an existing food, setting a region (e.g. Tehran/Qom), and searching. An empty result list is intentional when no recent, food-name-relevant sources are found; do not apply a price unless the source matches the exact product/portion and currency.


## Menu search + AI selected-item lookup hotfix — 2026-10-11 17:55 UTC
- User reported AI price search failure: `menu_item_not_found` despite selecting a food from the panel dropdown. The route previously relied only on the selected ID. It now first looks up the item by ID within the authenticated restaurant and, if that ID is stale/mismatched, safely falls back to an exact item-name + category match in the same restaurant. Ambiguous exact matches return a clear 409 instead of selecting an arbitrary item. Frontend now sends `item_id`, `item_name`, and `category_id`; applying a proposed price uses the server-resolved database ID.
- Restored exactly one ordinary menu-filter search input (`id=q`) that filters menu food cards, while keeping the separate AI price-search section. The worker-pinned live asset map was updated, so the fix is included in the served panel JS.
- Removed duplicated “تومان تومان” labels because the shared `money()` formatter already includes the currency suffix.
- Static syntax check passed for the modified menu view and panel route; source/pinned asset checks confirmed one ordinary food search and one AI price search.
- Worker version `2026-10-panel-8` deployed with 100% traffic. Live `/health` returned `ready`; required DB/ImageKit/Tavily secrets remained bound.
- Authenticated click-through of the search could not be automated. Owner should reload the panel, confirm the regular food-search box is back, then try selecting a saved food and running AI price search again.


## Cloudflare AI price agent + menu ID recovery — 2026-10-11 18:13 UTC
- Worker deployed and live health verified as `2026-10-panel-11`, `ready`, latest version has 100% traffic. Cloudflare Settings confirms `AI` binding plus existing D1, ImageKit and `TAVILY_API_KEY` secrets; no secret values were read.
- Enabled the Cloudflare Workers AI binding in both live Worker settings and `worker/wrangler.jsonc`. The menu price route now uses `@cf/meta/llama-3.2-3b-instruct` to classify the sources into compact `relevant_indices`; that model was directly tested against synthetic restaurant-menu/social/ingredient-price evidence and returned only the menu source.
- Tavily search query now uses explicit last-180-day `start_date/end_date`, excludes major social/video domains, disables generated answers and passes retrieved snippets to the Cloudflare model. Unsupported `language/filter_by_language` request fields were removed according to Tavily API docs.
- Prices are no longer taken from model-generated price text. Server code extracts a candidate only if the exact selected food name and an explicit تومان/ریال amount appear together in the retrieved page text, date is recent or the source is clearly a live menu/ordering page, and the AI classifier marks the page as an actual menu/order source. Anything else is displayed without a candidate price or filtered out. This can yield zero results when reliable menu evidence is absent; do not guess or apply an unverified price.
- Fixed stale item ID failures by resolving a missing ID only through exact item-name + category match inside the authenticated restaurant's own D1; ambiguous matches are rejected. Frontend now sends ID, name, and category; price updates use the resolved target ID.
- Pinned menu UI has exactly one ordinary food search field plus the separate AI price search; the duplicate new-food-modal search is absent. The search displays the source's evidence/freshness note. Syntax checks passed for Worker source modules, menu JS, and pinned-asset serialization.
- Remaining verification: no authenticated end-to-end Tavily search was run through the owner's current browser session. Owner should reload the panel, select a food, specify a city (e.g. Tehran), and click “جستجوی قیمت”. If no reliable menu source exists, the agent should now prefer an explicit no-reliable-result state over Instagram/YouTube/news noise.
