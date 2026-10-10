# پنل رستوران‌دار سپیدار — راهنمای استقرار و وضعیت

## آدرس پنل
پنل از همان Worker سرو می‌شود (هم‌دامنه با API، برای امنیت کوکی نشست):

`https://<آدرس-worker>/panel/`

> ⚠️ آدرس فعلی `sepidar-restaurant-platform.willow-poppy-10df.workers.dev` در حال حاضر **همان صفحه مشتریان** را نشان می‌دهد و `/health` پاسخ نمی‌دهد؛ یعنی Worker مستقرشده، کد پوشه `worker/` نیست. باید در Cloudflare مقدار **Root directory = `worker`** تنظیم و دوباره مستقر شود (نام Worker در `wrangler.jsonc`: `sepidar-restaurant-api`).

## فایل‌ها
| مسیر | نقش |
|---|---|
| `worker/src/index.js` | مسیریاب اصلی؛ `/` و `/health` حفظ شده‌اند و قابلیت‌ها را اعلام می‌کنند |
| `worker/src/lib/auth.js` | ورود با توکن، نشست سمت سرور، نقش‌ها، CSRF، سابقه عملیات |
| `worker/src/lib/ratelimit.js` | محدودسازی تلاش ورود و درخواست‌های عمومی |
| `worker/src/lib/menu.js` | منوی مشترک، خروجی هم‌شکل `CATS`، محاسبه قیمت سمت سرور |
| `worker/src/routes/panel.js` | APIهای پنل (`/api/panel/*`) |
| `worker/src/routes/public.js` | APIهای سایت مشتریان (`/api/public/*`) |
| `worker/migrations/0001_init.sql` | ساختار پایگاه داده D1 |
| `worker/seed/0001_seed_main.sql` | منوی فعلی index.html (۷ دسته، ۲۸ غذا) برای رستوران `main` |
| `worker/public/panel/` | رابط پنل (HTML/CSS/JS بدون نیاز به build) |
| `worker/public/_headers` | CSP و هدرهای امنیتی پنل |

`index.html` سایت مشتریان **تغییر نکرده است**.

## راه‌اندازی (یک‌بار)
```bash
cd worker
npx wrangler d1 create sepidar-db            # شناسه را در wrangler.jsonc بخش d1_databases بگذارید (کامنت را باز کنید)
npx wrangler d1 migrations apply sepidar-db --remote
npx wrangler d1 execute sepidar-db --remote --file=seed/0001_seed_main.sql
npx wrangler secret put SEPIDAR_PANEL_BOOTSTRAP_TOKEN   # مقدار را فقط اینجا وارد کنید
npx wrangler deploy
```
یا از داشبورد: **Workers & Pages → sepidar-restaurant-api → Settings → Variables and Secrets → Add → Type: Secret**، نام `SEPIDAR_PANEL_BOOTSTRAP_TOKEN`.

بعد از استقرار، `/health` باید `capabilities.database: true` و `capabilities.panel_auth: true` برگرداند؛ صفحه ورود پنل همین را بررسی می‌کند و تا آن موقع دکمه ورود غیرفعال است.

## امنیت
- توکن فقط از `env` خوانده می‌شود؛ در هیچ فایل عمومی نیست. مقایسه با زمان ثابت.
- ورود موفق ← نشست تصادفی ۲۵۶ بیتی؛ فقط **هش** آن در D1. کوکی `__Host-sp_panel`: `HttpOnly; Secure; SameSite=Strict`، عمر ۸ ساعت (`SESSION_TTL_HOURS`).
- هیچ توکن/نشستی در localStorage یا sessionStorage ذخیره نمی‌شود.
- ۵ تلاش ناموفق از یک IP ← ۱۵ دقیقه قفل؛ سقف کلی ۴۰ تلاش در ۱۵ دقیقه. پیام خطا عمومی است.
- خروج، و «خروج از همه دستگاه‌ها» نشست را در سرور باطل می‌کند.
- درخواست‌های تغییردهنده: بررسی Origin + هدر `X-Sepidar-Panel`.
- شناسه رستوران فقط از نشست سرور؛ هر `id` در بدنه نادیده گرفته می‌شود.
- امتیاز نظرها غیرقابل‌ویرایش؛ میانگین از همه امتیازها (حتی نظر پنهان) محاسبه می‌شود.
- قیمت سفارش فقط در سرور و از منوی ذخیره‌شده محاسبه می‌شود (همان فرمول `calc` سایت).
- ⚠️ توکن آزمایشی پیش از استفاده واقعی باید عوض شود و حساب‌های جداگانه رستوران‌دار ساخته شوند (نقش `owner` در کد آماده است، صدور حساب هنوز نه).

## APIها
پنل (نیازمند نشست): `POST auth/login|logout|logout-all` · `GET session|dashboard|activity` · `GET orders` · `GET orders/:id` · `POST orders/:id/status` · `GET menu` · `POST/PATCH/DELETE menu/categories[/:id]` · `POST/PATCH/DELETE menu/items[/:id]` · `GET reviews` · `PATCH reviews/:id` · `GET leads[/:id]` · `PATCH leads/:id` · `GET/PATCH settings` · `GET qr` · `GET reports?from&to` (همه با پیشوند `/api/panel/`).

عمومی (CORS برای `ALLOWED_ORIGINS`): `GET /api/public/restaurants/:id` · `GET …/menu` (هم‌شکل `CATS`) · `POST …/orders` · `GET/POST …/reviews` · `POST /api/public/leads`.

قواعد وضعیت سفارش: جدید ← آماده‌سازی ← آماده تحویل ← تحویل‌شده؛ لغو فقط از «جدید» یا «آماده‌سازی» و با دلیل.

## باقی‌مانده برای اتصال کامل
1. ساخت D1 و تنظیم Secret (بالا) و استقرار از پوشه `worker`.
2. اتصال **سایت مشتریان** به سرور (فعلاً سفارش‌ها را در localStorage مرورگر خودش نگه می‌دارد و منو را داخل فایل دارد):
   - `CATS = (await fetch(API+'/api/public/restaurants/main/menu').then(r=>r.json())).cats`
   - در `send()`: ارسال `{table_label, lines:[{item_id: it[6].id, qty, selection:{[عنوان گروه]:[نام گزینه‌ها]}, removed:[...], note}]}` به `…/orders`
   - فرم همکاری ← `POST /api/public/leads`؛ فرم نظر ← `…/reviews`
   - خواندن `?r=` برای QR؛ نمایش `meta.na` به‌عنوان ناموجود.
   - حذف `OWNER_CODES` و پنل داخل index.html (کد دسترسی در فایل عمومی امن نیست).
3. آپلود عکس (R2) — فعلاً فقط آدرس عکس.
4. دریافت زنده (WebSocket/Durable Objects) — فعلاً دریافت دوره‌ای هر ۱۵ ثانیه.
5. صدور حساب/کد دسترسی رستوران‌دار پس از تأیید درخواست همکاری.
6. اگر دامنه سایت مشتریان عوض شد: `PUBLIC_SITE_URL` و `ALLOWED_ORIGINS`.
