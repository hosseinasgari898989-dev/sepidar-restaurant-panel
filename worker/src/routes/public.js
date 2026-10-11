import { ApiError, json, readJson } from "../lib/http.js";
import { loadMenu, toCustomerCats, priceLine } from "../lib/menu.js";
import { checkLimit, hit } from "../lib/ratelimit.js";
import { str, int, randomId, sha256Hex, DAY_MS } from "../lib/util.js";
import { audit } from "../lib/auth.js";

// شناسه‌ی ناشناس و پایدار مرورگر؛ IP در محدودسازی و بن عمومی استفاده/ذخیره نمی‌شود.
async function clientIdentity(body) {
  const id = str(body.client_id, { min: 32, max: 64, field: "شناسه ناشناس مرورگر" });
  if (!/^[a-f0-9]{32,64}$/i.test(id)) throw new ApiError(422, "invalid_client_id", "شناسه مرورگر معتبر نیست؛ صفحه را تازه‌سازی کنید.");
  return sha256Hex("sepidar-client-v1:" + id.toLowerCase());
}
const limitKey = (name, clientHash, window = "") => `pub:${name}:${clientHash.slice(0, 36)}${window ? ":" + window : ""}`;
async function enforceClientLimits(db, name, clientHash, policies) {
  for (const policy of policies) await checkLimit(db, limitKey(name, clientHash, policy.key), policy);
}
async function recordClientLimits(db, name, clientHash, policies) {
  for (const policy of policies) await hit(db, limitKey(name, clientHash, policy.key), policy);
}
async function assertReviewNotBanned(db, restaurantId, clientHash) {
  const now = Date.now();
  const ban = await db.prepare("SELECT reason, expires_at FROM review_bans WHERE restaurant_id = ? AND client_key_hash = ? AND (expires_at IS NULL OR expires_at > ?)")
    .bind(restaurantId, clientHash, now).first();
  if (ban) throw new ApiError(403, "review_banned", ban.reason ? `امکان ثبت نظر برای این مرورگر مسدود شده است: ${ban.reason}` : "امکان ثبت نظر از این مرورگر فعلاً مسدود شده است.", { body: { banned: true, expires_at: ban.expires_at || null } });
}
async function restaurantOr404(db, id) {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new ApiError(404, "not_found", "رستوران پیدا نشد.");
  const r = await db.prepare("SELECT id, name, phone, address, hours, about, status, accepting_orders FROM restaurants WHERE id = ?").bind(id).first();
  if (!r) throw new ApiError(404, "not_found", "رستوران پیدا نشد.");
  return r;
}

// مسیرهای عمومی سایت مشتریان؛ CORS در index.js اعمال می‌شود
export async function handlePublic(request, env, url, headers) {
  if (!env.DB) throw new ApiError(503, "db_not_configured", "پایگاه داده هنوز به سرور متصل نشده است.");
  const db = env.DB;
  const method = request.method.toUpperCase();
  const parts = url.pathname.split("/").filter(Boolean); // api, public, ...

  if (method === "POST" && parts.length === 3 && parts[2] === "leads") {
    const b = await readJson(request, 4096);
    const clientHash = await clientIdentity(b);
    const limits = [
      { key: "hour", limit: 3, windowMs: 60 * 60 * 1000 },
      { key: "day", limit: 6, windowMs: DAY_MS },
    ];
    await enforceClientLimits(db, "lead", clientHash, limits);
    const name = str(b.restaurant_name, { max: 60, min: 2, field: "نام رستوران" });
    const phone = str(b.phone, { max: 20, min: 7, field: "شماره تماس" });
    if (!/^[0-9۰-۹+\-\s]{7,20}$/.test(phone)) throw new ApiError(422, "validation_error", "شماره تماس معتبر نیست.");
    const note = str(b.note, { max: 400, field: "توضیحات" });
    const t = Date.now(), id = randomId(10);
    await db.prepare("INSERT INTO leads (id, restaurant_name, phone, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'new', ?, ?)").bind(id, name, phone, note || null, t, t).run();
    await recordClientLimits(db, "lead", clientHash, limits);
    return json({ ok: true }, 201, { headers });
  }

  if (parts[2] !== "restaurants" || !parts[3]) throw new ApiError(404, "not_implemented", "این مسیر هنوز در سرور پیاده‌سازی نشده است.");
  const r = await restaurantOr404(db, parts[3]);
  const sub = parts[4] || "";

  // پیگیری امن سفارش مشتری؛ دسترسی فقط با توکن محرمانه‌ای که هنگام ثبت سفارش صادر شده است.
  if (method === "GET" && sub === "orders" && parts.length === 6) {
    const token = (url.searchParams.get("token") || "").trim();
    if (token.length < 40 || token.length > 128) throw new ApiError(404, "order_not_found", "سفارش پیدا نشد.");
    const tokenHash = await sha256Hex("sepidar-order-track:" + token);
    const key = "pub:track:" + tokenHash.slice(0, 32);
    const lim = { limit: 120, windowMs: 60 * 60 * 1000 };
    await checkLimit(db, key, lim);
    const order = await db.prepare(
      "SELECT id, number, status, total, cancel_reason, created_at, updated_at, estimated_ready_at FROM orders WHERE id = ? AND restaurant_id = ? AND tracking_token_hash = ?"
    ).bind(parts[5], r.id, tokenHash).first();
    if (!order) throw new ApiError(404, "order_not_found", "سفارش پیدا نشد.");
    const events = await db.prepare(
      "SELECT from_status, to_status, created_at FROM order_events WHERE order_id = ? AND restaurant_id = ? ORDER BY id"
    ).bind(order.id, r.id).all();
    await hit(db, key, lim);
    return json({ ok: true, order, events: events.results }, 200, { headers });
  }

  if (method === "GET" && !sub) return json({ ok: true, restaurant: { ...r, accepting_orders: !!r.accepting_orders } }, 200, { headers });

  if (method === "GET" && sub === "menu" && parts.length === 5) {
    const menu = await loadMenu(db, r.id);
    headers.set("Cache-Control", "public, max-age=30");
    return json({ ok: true, restaurant: { id: r.id, name: r.name, phone: r.phone, status: r.status }, cats: toCustomerCats(menu) }, 200, { headers });
  }

  if (method === "GET" && sub === "reviews" && parts.length === 5) {
    const [rows, sum] = await Promise.all([
      db.prepare("SELECT id, item_name, rating, comment, author_name, reply, reply_at, created_at FROM reviews WHERE restaurant_id = ? AND visibility = 'published' ORDER BY created_at DESC LIMIT 50").bind(r.id).all(),
      // میانگین از همه امتیازها محاسبه می‌شود؛ پنهان‌کردن متن نظر، میانگین را دست‌کاری نمی‌کند
      db.prepare("SELECT COUNT(*) n, AVG(rating) avg FROM reviews WHERE restaurant_id = ?").bind(r.id).first(),
    ]);
    return json({ ok: true, reviews: rows.results, summary: { count: sum.n || 0, avg: sum.n ? Math.round(sum.avg * 10) / 10 : null } }, 200, { headers });
  }

  if (method === "POST" && sub === "reviews" && parts.length === 5) {
    const b = await readJson(request, 4096);
    const clientHash = await clientIdentity(b);
    await assertReviewNotBanned(db, r.id, clientHash);
    const limits = [
      { key: "hour", limit: 3, windowMs: 60 * 60 * 1000 },
      { key: "day", limit: 8, windowMs: DAY_MS },
    ];
    await enforceClientLimits(db, "review", clientHash, limits);
    const rating = int(b.rating, { min: 1, max: 5, field: "امتیاز" });
    let itemName = null, itemId = null;
    if (b.item_id) {
      const it = await db.prepare("SELECT id, name FROM menu_items WHERE id = ? AND restaurant_id = ?").bind(String(b.item_id).slice(0, 60), r.id).first();
      if (it) { itemId = it.id; itemName = it.name; }
    }
    const t = Date.now();
    // چند ارسال تکراری در چند ثانیه‌ی متوالی معمولاً اسپم است.
    const recent = await db.prepare("SELECT 1 FROM reviews WHERE restaurant_id = ? AND client_key_hash = ? AND created_at > ? LIMIT 1")
      .bind(r.id, clientHash, t - 30 * 1000).first();
    if (recent) throw new ApiError(429, "review_duplicate", "نظر تازه‌ای همین چند لحظه پیش ثبت شده است؛ کمی صبر کنید.");
    await db.prepare("INSERT INTO reviews (id, restaurant_id, order_number, item_id, item_name, rating, comment, author_name, client_key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(randomId(10), r.id, b.order_number ? int(b.order_number, { min: 1, max: 1e9, field: "شماره سفارش" }) : null, itemId, itemName, rating,
        str(b.comment, { max: 600, field: "متن نظر" }) || null, str(b.author_name, { max: 40, field: "نام" }) || null, clientHash, t).run();
    await recordClientLimits(db, "review", clientHash, limits);
    return json({ ok: true }, 201, { headers });
  }

  if (method === "POST" && sub === "orders" && parts.length === 5) {
    if (r.status !== "open" || !r.accepting_orders) throw new ApiError(409, "not_accepting", "رستوران در حال حاضر سفارش نمی‌پذیرد.");
    const b = await readJson(request, 24 * 1024);
    const clientHash = await clientIdentity(b);
    const limits = [
      { key: "ten-minutes", limit: 10, windowMs: 10 * 60 * 1000 },
      { key: "day", limit: 40, windowMs: DAY_MS },
    ];
    await enforceClientLimits(db, "order", clientHash, limits);
    if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 30) throw new ApiError(422, "validation_error", "سبد خرید معتبر نیست.");
    const menu = await loadMenu(db, r.id);
    const lines = b.lines.map((l) => {
      const cat = menu.find((c) => c.items.some((i) => i.id === l.item_id));
      const item = cat && cat.items.find((i) => i.id === l.item_id);
      if (!item) throw new ApiError(422, "item_unavailable", "یکی از غذاهای سبد دیگر در منو نیست.");
      if (!item.available) throw new ApiError(422, "item_unavailable", `«${item.name}» در حال حاضر موجود نیست.`);
      const qty = int(l.qty, { min: 1, max: 50, field: "تعداد" });
      // قیمت فقط در سرور و از منوی ذخیره‌شده محاسبه می‌شود؛ قیمت ارسالی مرورگر نادیده گرفته می‌شود
      const pr = priceLine(cat, item, l.selection || {}, l.removed || []);
      return { cat, item, qty, ...pr, note: str(l.note, { max: 200, field: "توضیحات آشپز" }) };
    });
    const total = lines.reduce((a, l) => a + l.unit * l.qty, 0);
    const t = Date.now(), id = randomId(12), trackingToken = randomId(32);
    const trackingTokenHash = await sha256Hex("sepidar-order-track:" + trackingToken);
    const table = str(b.table_label, { max: 40, field: "نام یا شماره میز" });
    await db.prepare("INSERT INTO orders (id, restaurant_id, number, table_label, status, total, tracking_token_hash, created_at, updated_at) SELECT ?, ?, COALESCE(MAX(number), 100) + 1, ?, 'new', ?, ?, ?, ? FROM orders WHERE restaurant_id = ?")
      .bind(id, r.id, table || null, total, trackingTokenHash, t, t, r.id).run();
    await db.batch(lines.map((l) => db.prepare("INSERT INTO order_items (order_id, restaurant_id, item_id, category_id, name, emoji, color1, color2, image_url, qty, unit_price, line_total, options, removed, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, r.id, l.item.id, l.cat.id, l.item.name, l.item.emoji, l.cat.colors[0], l.cat.colors[1], l.item.image_url || null, l.qty, l.unit, l.unit * l.qty, JSON.stringify(l.options), JSON.stringify(l.removed), l.note || null)));
    await db.prepare("INSERT INTO order_events (order_id, restaurant_id, from_status, to_status, actor, created_at) VALUES (?, ?, NULL, 'new', 'customer', ?)").bind(id, r.id, t).run();
    await recordClientLimits(db, "order", clientHash, limits);
    const o = await db.prepare("SELECT number FROM orders WHERE id = ?").bind(id).first();
    await audit(db, r.id, "customer", "order.create", "order", id, { number: o.number, total });
    return json({ ok: true, order: { id, number: o.number, total, status: "new", created_at: t, estimated_ready_at: null, tracking_token: trackingToken } }, 201, { headers });
  }

  throw new ApiError(404, "not_implemented", "این مسیر هنوز در سرور پیاده‌سازی نشده است.");
}
