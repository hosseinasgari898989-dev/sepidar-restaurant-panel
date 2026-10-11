

## HANDOVER — AI price search + admin review visibility (2026-10-11)
- Current main Worker source marker: `2026-10-panel-14`. Latest Cloudflare deployment observed: `c4b20290-adab-4463-bdc3-6d4ac00cf7c5`, 100% traffic to version `2a61dadf-ba18-496d-b49d-12ed21569272`. Cloudflare bindings include `AI`, `DB`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`, `TAVILY_API_KEY`, and bootstrap/session secrets. Do not expose secret values.
- Live customer URL: https://hosseinasgari898989-dev.github.io/sepidar-restaurant-platform/ ; admin panel: https://sepidar-restaurant-panel.willow-poppy-10df.workers.dev/panel/ ; health: https://sepidar-restaurant-panel.willow-poppy-10df.workers.dev/health . Direct fetch via tool environment recently returned 403 network restriction, but Cloudflare control-plane deployment/settings API was readable; do not assume this is site downtime.
- User still reported the AI price-search error `عامل هوشمند نتوانست منابع را درست ارزیابی کند؛ دوباره تلاش کن`. Current code uses Tavily + Cloudflare Workers AI `env.AI.run('@cf/meta/llama-3.2-3b-instruct')`, parses structured `response.relevant_indices`, blocks social/video/news/recipe/raw-ingredient/poultry-feed sources, requires exact-food/menu-order evidence and parses only explicit currency/price. A real authenticated search tap after the latest panel-14 deployment still needs confirmation. Next: reproduce from fresh authenticated panel session and read Worker telemetry/log at exact timestamp; don't relax evidence guardrails just to force results.
- Review manager view currently renders featured review effect status/style, explains effect is visible on customer site, and shows 👍/👎 totals. User's requirement that review decoration/effects be visible directly in admin is still awaiting visual confirmation on their live browser; inspect the CSS delivered through Worker-pinned asset map as well as `worker/public/panel/js/views/reviews.js`.
- Main menu UI must retain exactly one original food search `id="q"` and a separate AI price search workspace, placed on the main Menu management screen (not New Food). Current source `worker/public/panel/js/views/menu.js` has one regular food search and AI price search. Admin assets are statically pinned in `worker/src/lib/panel-overrides.js`; every UI edit must update both source file and pinned Map entry before deploying.
- User confirmed ImageKit upload works and thumbs up/down on customer reviews work. D1 schema has `reviews.featured/feature_style` and `review_votes`; votes SQL aggregates worked.
- Current D1 database ID `3ba9f865-95b7-4a5a-b8f6-c256601f1b3a`. Backups: panel/customer branches `backup/pre-sepidar-ux-bugfix-2026-10-11`, plus `backup/pre-imagekit-release-2026-10-11`.
- Resume with this checkpoint; do not start over. User prefers Persian, concise explanations, and wants the exact issues fixed and verified, not assurances based only on syntax checks. Cloud AI coding route was cancelled for taking too long; continue with current GitHub/Cloudflare integrations and TinyFish/MagicPath when available.


## 🔴 HANDOFF CHECKPOINT — continue from here, do not restart (2026-10-11)

### Project and live links
- Customer site: https://hosseinasgari898989-dev.github.io/sepidar-restaurant-platform/
- Admin panel: https://sepidar-restaurant-panel.willow-poppy-10df.workers.dev/panel/
- Worker health: https://sepidar-restaurant-panel.willow-poppy-10df.workers.dev/health
- Customer repo: `hosseinasgari898989-dev/sepidar-restaurant-platform`
- Panel/Worker repo: `hosseinasgari898989-dev/sepidar-restaurant-panel`
- Work on current `main` branches. Panel source reports Worker API version `2026-10-panel-14`. Latest Cloudflare deployment seen in API: `c4b20290-adab-4463-bdc3-6d4ac00cf7c5`, active version `2a61dadf-ba18-496d-b49d-12ed21569272` at 100% traffic. Live health response captured separately during this checkpoint.

### Confirmed working / user-confirmed
- ImageKit upload works in the real admin panel. Keep existing secret; never ask the user to paste it.
- Customer review 👍 / 👎 finally work after fixing a missing `oneOf` import in `worker/src/routes/public.js`; user confirmed both buttons now work.
- D1 database is `sepidar-db` (ID `3ba9f865-95b7-4a5a-b8f6-c256601f1b3a`). Table `review_votes` exists. Do not run migrations from scratch or delete data.
- Tavily secret `TAVILY_API_KEY` was confirmed present in Cloudflare settings earlier; do not ask for it to be pasted in chat.
- AI price search belongs on the main menu-management screen, not inside “New food” modal. Its UI is pinned into `PANEL_OVERRIDES`.
- Exactly one regular filter for finding food in the admin menu must remain, plus the separate AI “price search” section. Current main menu source and pinned Worker menu asset each have one `id="q"` food-search field and the AI picker/search remains.
- Customer hero is a floating CSS-built burger without plate markup; menu category bar is not sticky; long-press text selection is blocked except editable controls.

### Immediate unresolved bug #1 — AI Search food lookup
User still gets:
`جستجو انجام نشد — غذای انتخاب‌شده در منوی فعلی پیدا نشد؛ منو را تازه‌سازی کن.`
They also previously saw:
`عامل هوشمند نتوانست منابع را درست ارزیابی کند؛ دوباره تلاش کن.؛ اتصال و سهمیهٔ سرویس جستجو را بررسی کن.`
Older search output included unrelated/old results and duplicated wording like `"چیزبرگر" قیمت منوی رستوران ایران ایران تومان`.

Current source has been adjusted:
- `worker/public/panel/js/views/menu.js` sends `item_id`, `item_name`, `category_id`, and `region`.
- `worker/src/routes/panel.js` tries item ID lookup and then exact item-name/category fallback within `s.restaurantId`.
- Search query filters unrelated results, restricts Tavily to Iran and a one-year window, disables generated generic answer, and only offers a numeric price candidate if the source has an explicit currency and a parseable publication date. Rial is converted to toman.
- The latest Worker deployment seen in API is above. **Do not claim the lookup bug is fixed until a live authenticated search succeeds.** Next: inspect live Worker request/error logs and compare `s.restaurantId`, incoming payload values, actual D1 `menu_items` columns/data, archived flags, and live deployed version. Test the real authenticated request without exposing tokens/secrets. Then adjust and deploy; verify in panel.

### Immediate unresolved bug #2 — review decorations visible on customer site but not panel
User says a customer review can get its visual “featured / cool animation” effect on the customer site, but management cannot see which effects/reactions were applied. Requirement: actions/decoration/reactions performed by customers must also be observable from the admin panel.
Next inspect `worker/public/panel/js/views/reviews.js`, admin review GET route and public review rows. Ensure API returns `featured`, `feature_style`, vote counts (likes/dislikes), and any necessary reaction metadata; render badges/counts/effect preview in the admin panel. Keep moderation controls secured and review tenant isolation intact. Do not merely alter front-end styling without checking route payload and D1 columns.

### Last known file state / important refs
- Panel Worker API version in current source: `2026-10-panel-14`.
- Current pinned menu asset exists in `worker/src/lib/panel-overrides.js`; confirm it matches `worker/public/panel/js/views/menu.js` after every change. The static pin can otherwise cause old UI to reappear.
- Check current files before editing; there have been several quick fixes and version bumps. Do not blindly replay earlier changes.
- Preserve current backup branches:
  - Panel: `backup/pre-sepidar-ux-bugfix-2026-10-11`
  - Customer: `backup/pre-sepidar-ux-bugfix-2026-10-11`
  - Earlier base backups: `backup/pre-imagekit-release-2026-10-11`.
- User preferences: Persian, informal concise responses; do all repo/Cloudflare changes through connected tools when possible; be honest about what was actually tested. Do not restart project or change unrelated features.

### State when checkpoint written
- Main menu source SHA: `febba4ed7c44e8eb90015ea64505a19f70814e37`
- Panel route SHA: `acf95641387dd22d35143f55302905cf11160270`
- Worker index SHA: `c39ef16fddc17bb2534d669aec1118da116677ed`
- Worker asset override SHA: `70f1f2fbddf4644dc3674cf8aa93102d7fb05ae5`
- Current pinned menu search-count: `1`; AI price picker exists: `true`.
- Continue by fixing AI search item lookup first, then exposing customer review decoration/reaction details in management, deploying and testing both before claiming completion.
