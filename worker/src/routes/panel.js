import { ApiError, json, readJson } from "../lib/http.js";
import { requireSession, assertSameOrigin, login, logout, audit } from "../lib/auth.js";
import { loadMenu, itemOut, validateOptions, validateRemovables } from "../lib/menu.js";
import { str, int, bool, oneOf, httpUrl, color, parseJson, tehranDayStart, DAY_MS, TEHRAN_OFFSET_MS, randomId, sha256Hex } from "../lib/util.js";

export const ORDER_STATUSES = ["new", "preparing", "ready", "delivered", "cancelled"];
// قواعد مجاز تغییر وضعیت؛ فقط سرور تصمیم می‌گیرد
export const TRANSITIONS = { new: ["preparing", "cancelled"], preparing: ["ready", "cancelled"], ready: ["delivered"], delivered: [], cancelled: [] };

function orderOut(o, lines) {
  const out = {
    id: o.id, number: o.number, table_label: o.table_label || "", status: o.status, total: o.total,
    cancel_reason: o.cancel_reason || null, created_at: o.created_at, updated_at: o.updated_at,
    accepted_at: o.accepted_at || null, estimated_ready_at: o.estimated_ready_at || null,
    item_count: o.item_count != null ? o.item_count : undefined,
    next: TRANSITIONS[o.status] || [],
  };
  if (lines) {
    out.lines = lines.map((l) => ({
      item_id: l.item_id, name: l.name, emoji: l.emoji || "🍽️", colors: [l.color1 || "#ffe0c2", l.color2 || "#ffb36b"],
      image_url: l.image_url || "", qty: l.qty, unit_price: l.unit_price, line_total: l.line_total,
      options: parseJson(l.options, []), removed: parseJson(l.removed, []), note: l.note || "",
    }));
  }
  return out;
}

const routes = [];
const on = (method, pattern, perm, handler) => routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), perm, handler });

// ---------- احراز هویت ----------
on("POST", "/api/panel/auth/login", null, async ({ request, env }) => {
  const r = await login(request, env);
  return json({ ok: true, session: r.session }, 200, { setCookie: r.cookie });
});
on("POST", "/api/panel/auth/logout", "auth", async ({ request, env }) => json({ ok: true }, 200, { setCookie: await logout(request, env, false) }));
on("POST", "/api/panel/auth/logout-all", "auth", async ({ request, env }) => json({ ok: true }, 200, { setCookie: await logout(request, env, true) }));
on("GET", "/api/panel/session", "restaurant", async ({ env, s }) => {
  const r = await env.DB.prepare("SELECT id, name, status, accepting_orders FROM restaurants WHERE id = ?").bind(s.restaurantId).first();
  return json({ ok: true, session: { role: s.role, permissions: s.permissions, expires_at: s.expiresAt, bootstrap: s.bootstrap, restaurant: r } });
});

// ---------- داشبورد ----------
on("GET", "/api/panel/dashboard", "orders", async ({ env, s }) => {
  const db = env.DB, rid = s.restaurantId, today = tehranDayStart();
  const [counts, todayRow, rating, recent] = await Promise.all([
    db.prepare("SELECT status, COUNT(*) n FROM orders WHERE restaurant_id = ? AND status IN ('new','preparing','ready') GROUP BY status").bind(rid).all(),
    db.prepare("SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total END), 0) amount, SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) cancelled FROM orders WHERE restaurant_id = ? AND created_at >= ?").bind(rid, today).first(),
    db.prepare("SELECT COUNT(*) n, AVG(rating) avg FROM reviews WHERE restaurant_id = ?").bind(rid).first(),
    db.prepare("SELECT o.*, (SELECT SUM(qty) FROM order_items oi WHERE oi.order_id = o.id) item_count FROM orders o WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 6").bind(rid).all(),
  ]);
  const c = Object.fromEntries(counts.results.map((r) => [r.status, r.n]));
  return json({
    ok: true,
    stats: {
      new: c.new || 0, preparing: c.preparing || 0, ready: c.ready || 0,
      today_count: todayRow.n || 0, today_amount: todayRow.amount || 0, today_cancelled: todayRow.cancelled || 0,
      rating_avg: rating.n ? Math.round(rating.avg * 10) / 10 : null, rating_count: rating.n || 0,
    },
    recent: recent.results.map((o) => orderOut(o)),
    server_time: Date.now(),
  });
});

on("GET", "/api/panel/activity", "orders", async ({ env, s }) => {
  const rows = (await env.DB.prepare("SELECT action, entity, entity_id, detail, actor, created_at FROM audit_log WHERE restaurant_id = ? AND action NOT LIKE 'auth.login_failed' ORDER BY created_at DESC LIMIT 15").bind(s.restaurantId).all()).results;
  return json({ ok: true, activity: rows.map((r) => ({ ...r, detail: parseJson(r.detail, null) })) });
});

// ---------- سفارش‌ها ----------
on("GET", "/api/panel/orders", "orders", async ({ env, s, url }) => {
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") || "").trim().slice(0, 60);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const where = ["o.restaurant_id = ?"], args = [s.restaurantId];
  if (status && status !== "all") { oneOf(status, ORDER_STATUSES, "وضعیت"); where.push("o.status = ?"); args.push(status); }
  if (q) {
    const digits = q.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/\D/g, "");
    where.push("(o.table_label LIKE ? OR CAST(o.number AS TEXT) = ? OR EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.name LIKE ?))");
    args.push(`%${q}%`, digits || "-", `%${q}%`);
  }
  const rows = (await env.DB.prepare(`SELECT o.*, (SELECT SUM(qty) FROM order_items oi WHERE oi.order_id = o.id) item_count FROM orders o WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT ?`).bind(...args, limit).all()).results;
  const counts = (await env.DB.prepare("SELECT status, COUNT(*) n FROM orders WHERE restaurant_id = ? GROUP BY status").bind(s.restaurantId).all()).results;
  return json({ ok: true, orders: rows.map((o) => orderOut(o)), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), server_time: Date.now() });
});

on("GET", "/api/panel/orders/:id", "orders", async ({ env, s, p }) => {
  const o = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND restaurant_id = ?").bind(p.id, s.restaurantId).first();
  if (!o) throw new ApiError(404, "not_found", "سفارش پیدا نشد.");
  const [lines, events] = await Promise.all([
    env.DB.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").bind(o.id).all(),
    env.DB.prepare("SELECT from_status, to_status, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id").bind(o.id).all(),
  ]);
  return json({ ok: true, order: { ...orderOut(o, lines.results), events: events.results } });
});

on("POST", "/api/panel/orders/:id/status", "orders", async ({ request, env, s, p }) => {
  const b = await readJson(request);
  const to = oneOf(b.to, ORDER_STATUSES, "وضعیت");
  const from = oneOf(b.from, ORDER_STATUSES, "وضعیت فعلی");
  if (!TRANSITIONS[from].includes(to)) throw new ApiError(422, "invalid_transition", "این تغییر وضعیت مجاز نیست.");
  const reason = to === "cancelled" ? str(b.reason, { max: 200, min: 2, field: "دلیل لغو" }) : null;
  const estimateMinutes = to === "preparing" ? int(b.estimated_minutes, { min: 5, max: 240, field: "زمان تقریبی آماده‌سازی (دقیقه)" }) : null;
  const t = Date.now();
  const estimatedReadyAt = estimateMinutes == null ? null : t + estimateMinutes * 60 * 1000;
  const acceptedAt = to === "preparing" ? t : null;
  // پذیرش سفارش بدون زمان تخمینی مجاز نیست؛ زمان و وضعیت در یک به‌روزرسانی شرطی ثبت می‌شوند.
  const r = await env.DB.prepare("UPDATE orders SET status = ?, cancel_reason = COALESCE(?, cancel_reason), accepted_at = CASE WHEN ? IS NOT NULL THEN ? ELSE accepted_at END, estimated_ready_at = CASE WHEN ? IS NOT NULL THEN ? ELSE estimated_ready_at END, updated_at = ? WHERE id = ? AND restaurant_id = ? AND status = ?")
    .bind(to, reason, acceptedAt, acceptedAt, estimatedReadyAt, estimatedReadyAt, t, p.id, s.restaurantId, from).run();
  if (!r.meta || !r.meta.changes) {
    const cur = await env.DB.prepare("SELECT status FROM orders WHERE id = ? AND restaurant_id = ?").bind(p.id, s.restaurantId).first();
    if (!cur) throw new ApiError(404, "not_found", "سفارش پیدا نشد.");
    throw new ApiError(409, "status_conflict", "وضعیت این سفارش پیش‌تر تغییر کرده است. فهرست به‌روزرسانی شد.", { body: { current: cur.status } });
  }
  const o = await env.DB.prepare("SELECT number FROM orders WHERE id = ?").bind(p.id).first();
  await env.DB.prepare("INSERT INTO order_events (order_id, restaurant_id, from_status, to_status, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(p.id, s.restaurantId, from, to, s.actor, t).run();
  await audit(env.DB, s.restaurantId, s.actor, "order.status", "order", p.id, { number: o.number, from, to, reason, estimated_minutes: estimateMinutes, estimated_ready_at: estimatedReadyAt });
  return json({ ok: true, status: to, next: TRANSITIONS[to], estimated_ready_at: estimatedReadyAt });
});

// ---------- منو ----------
on("GET", "/api/panel/menu", "menu", async ({ env, s }) => json({ ok: true, categories: await loadMenu(env.DB, s.restaurantId, { includeInactive: true }) }));

function catFields(b, partial) {
  const f = {};
  if (!partial || "name" in b) f.name = str(b.name, { max: 40, min: 1, field: "نام دسته" });
  if (!partial || "emoji" in b) f.emoji = str(b.emoji, { max: 8, field: "ایموجی" }) || "🍽️";
  if (!partial || "colors" in b) {
    const c = Array.isArray(b.colors) ? b.colors : [];
    f.color1 = color(c[0], "رنگ اول") || "#ffe0c2";
    f.color2 = color(c[1], "رنگ دوم") || "#ffb36b";
  }
  if (!partial || "options" in b) f.options = JSON.stringify(validateOptions(b.options || []));
  if (!partial || "removables" in b) f.removables = JSON.stringify(validateRemovables(b.removables || []));
  if ("sort" in b) f.sort = int(b.sort, { min: 0, max: 9999, field: "ترتیب" });
  return f;
}

on("POST", "/api/panel/menu/categories", "menu", async ({ request, env, s }) => {
  const b = await readJson(request);
  const id = str(b.id, { max: 32, min: 1, field: "شناسه دسته" }).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(id)) throw new ApiError(422, "validation_error", "شناسه دسته باید با حروف لاتین کوچک، عدد یا خط تیره باشد.");
  const f = catFields(b, false);
  const exists = await env.DB.prepare("SELECT 1 FROM categories WHERE restaurant_id = ? AND id = ?").bind(s.restaurantId, id).first();
  if (exists) throw new ApiError(409, "duplicate", "دسته‌ای با این شناسه وجود دارد.");
  const max = await env.DB.prepare("SELECT COALESCE(MAX(sort), -1) m FROM categories WHERE restaurant_id = ?").bind(s.restaurantId).first();
  await env.DB.prepare("INSERT INTO categories (restaurant_id, id, name, emoji, color1, color2, options, removables, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(s.restaurantId, id, f.name, f.emoji, f.color1, f.color2, f.options, f.removables, f.sort ?? max.m + 1, Date.now()).run();
  await audit(env.DB, s.restaurantId, s.actor, "menu.category_create", "category", id, { name: f.name });
  return json({ ok: true, id }, 201);
});

on("PATCH", "/api/panel/menu/categories/:id", "menu", async ({ request, env, s, p }) => {
  const b = await readJson(request);
  const f = catFields(b, true);
  const keys = Object.keys(f);
  if (!keys.length) throw new ApiError(422, "validation_error", "تغییری ارسال نشده است.");
  const r = await env.DB.prepare(`UPDATE categories SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE restaurant_id = ? AND id = ?`)
    .bind(...keys.map((k) => f[k]), Date.now(), s.restaurantId, p.id).run();
  if (!r.meta.changes) throw new ApiError(404, "not_found", "دسته پیدا نشد.");
  await audit(env.DB, s.restaurantId, s.actor, "menu.category_update", "category", p.id, { fields: keys });
  return json({ ok: true });
});

on("DELETE", "/api/panel/menu/categories/:id", "menu", async ({ request, env, s, p }) => {
  const n = await env.DB.prepare("SELECT COUNT(*) n FROM menu_items WHERE restaurant_id = ? AND category_id = ? AND archived = 0").bind(s.restaurantId, p.id).first();
  if (n.n) throw new ApiError(409, "category_not_empty", "این دسته هنوز غذا دارد. ابتدا غذاها را جابه‌جا یا حذف کنید.");
  const r = await env.DB.prepare("DELETE FROM categories WHERE restaurant_id = ? AND id = ?").bind(s.restaurantId, p.id).run();
  if (!r.meta.changes) throw new ApiError(404, "not_found", "دسته پیدا نشد.");
  await audit(env.DB, s.restaurantId, s.actor, "menu.category_delete", "category", p.id, null);
  return json({ ok: true });
});

async function itemFields(env, s, b, partial) {
  const f = {};
  if (!partial || "category_id" in b) {
    const cid = str(b.category_id, { max: 32, min: 1, field: "دسته" });
    const c = await env.DB.prepare("SELECT 1 FROM categories WHERE restaurant_id = ? AND id = ?").bind(s.restaurantId, cid).first();
    if (!c) throw new ApiError(422, "validation_error", "دسته انتخاب‌شده وجود ندارد.");
    f.category_id = cid;
  }
  if (!partial || "name" in b) f.name = str(b.name, { max: 60, min: 1, field: "نام غذا" });
  if (!partial || "description" in b) f.description = str(b.description, { max: 200, field: "توضیحات" });
  if (!partial || "price" in b) f.price = int(b.price, { min: 0, max: 1000000000, field: "قیمت" });
  if (!partial || "emoji" in b) f.emoji = str(b.emoji, { max: 8, field: "ایموجی" }) || "🍽️";
  if (!partial || "image_url" in b) f.image_url = httpUrl(b.image_url, "آدرس عکس");
  if ("model_url" in b) f.model_url = httpUrl(b.model_url, "آدرس مدل سه‌بعدی");
  if ("meta" in b) {
    if (!b.meta || typeof b.meta !== "object" || Array.isArray(b.meta)) throw new ApiError(422, "validation_error", "تنظیمات نمایش غذا معتبر نیست.");
    const m = {};
    if (typeof b.meta.b === "string") m.b = b.meta.b.slice(0, 20);
    if (typeof b.meta.f === "string") m.f = b.meta.f.slice(0, 4);
    if (b.meta.d) m.d = 1;
    if (b.meta.s && typeof b.meta.s === "object") {
      m.s = {};
      for (const [k, v] of Object.entries(b.meta.s)) if (/^\d{1,2}$/.test(k) && Number.isInteger(v) && v >= 0 && v < 20) m.s[k] = v;
    }
    f.meta = JSON.stringify(m);
  }
  if ("removables" in b) f.removables = b.removables == null ? null : JSON.stringify(validateRemovables(b.removables));
  if (!partial || "active" in b) f.active = bool(b.active ?? true) ? 1 : 0;
  if (!partial || "available" in b) f.available = bool(b.available ?? true) ? 1 : 0;
  if ("sort" in b) f.sort = int(b.sort, { min: 0, max: 9999, field: "ترتیب" });
  return f;
}

on("POST", "/api/panel/menu/items", "menu", async ({ request, env, s }) => {
  const b = await readJson(request);
  const f = await itemFields(env, s, b, false);
  const id = f.category_id + "-" + randomId(6).toLowerCase().replace(/[^a-z0-9]/g, "x");
  const max = await env.DB.prepare("SELECT COALESCE(MAX(sort), -1) m FROM menu_items WHERE restaurant_id = ? AND category_id = ?").bind(s.restaurantId, f.category_id).first();
  await env.DB.prepare("INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, emoji, image_url, model_url, meta, removables, active, available, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, s.restaurantId, f.category_id, f.name, f.description, f.price, f.emoji, f.image_url, f.model_url || null, f.meta || "{}", f.removables ?? null, f.active, f.available, f.sort ?? max.m + 1, Date.now()).run();
  await audit(env.DB, s.restaurantId, s.actor, "menu.item_create", "item", id, { name: f.name, price: f.price });
  const row = await env.DB.prepare("SELECT * FROM menu_items WHERE id = ?").bind(id).first();
  return json({ ok: true, item: itemOut(row) }, 201);
});

on("PATCH", "/api/panel/menu/items/:id", "menu", async ({ request, env, s, p }) => {
  const b = await readJson(request);
  const before = await env.DB.prepare("SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ? AND archived = 0").bind(p.id, s.restaurantId).first();
  if (!before) throw new ApiError(404, "not_found", "غذا پیدا نشد.");
  const f = await itemFields(env, s, b, true);
  const keys = Object.keys(f);
  if (!keys.length) throw new ApiError(422, "validation_error", "تغییری ارسال نشده است.");
  await env.DB.prepare(`UPDATE menu_items SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND restaurant_id = ?`)
    .bind(...keys.map((k) => f[k]), Date.now(), p.id, s.restaurantId).run();
  const detail = { name: before.name, fields: keys };
  if ("price" in f && f.price !== before.price) { detail.price_from = before.price; detail.price_to = f.price; }
  if ("available" in f) detail.available = !!f.available;
  if ("active" in f) detail.active = !!f.active;
  await audit(env.DB, s.restaurantId, s.actor, "menu.item_update", "item", p.id, detail);
  const row = await env.DB.prepare("SELECT * FROM menu_items WHERE id = ?").bind(p.id).first();
  return json({ ok: true, item: itemOut(row) });
});

on("DELETE", "/api/panel/menu/items/:id", "menu", async ({ env, s, p }) => {
  // حذف نرم: سفارش‌های قبلی همچنان به نام غذا ارجاع دارند
  const r = await env.DB.prepare("UPDATE menu_items SET archived = 1, active = 0, updated_at = ? WHERE id = ? AND restaurant_id = ? AND archived = 0").bind(Date.now(), p.id, s.restaurantId).run();
  if (!r.meta.changes) throw new ApiError(404, "not_found", "غذا پیدا نشد.");
  await audit(env.DB, s.restaurantId, s.actor, "menu.item_delete", "item", p.id, null);
  return json({ ok: true });
});

// ---------- نظرات ----------
on("GET", "/api/panel/reviews", "reviews", async ({ env, s, url }) => {
  const where = ["restaurant_id = ?"], args = [s.restaurantId];
  const rating = url.searchParams.get("rating");
  if (rating && rating !== "all") { where.push("rating = ?"); args.push(int(rating, { min: 1, max: 5 })); }
  const vis = url.searchParams.get("visibility");
  if (vis && vis !== "all") { where.push("visibility = ?"); args.push(oneOf(vis, ["published", "hidden"])); }
  if (url.searchParams.get("flagged") === "1") where.push("flagged = 1");
  const q = (url.searchParams.get("q") || "").trim().slice(0, 60);
  if (q) { where.push("(comment LIKE ? OR item_name LIKE ? OR author_name LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const [rows, summary, dist] = await Promise.all([
    env.DB.prepare(`SELECT * FROM reviews WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 100`).bind(...args).all(),
    env.DB.prepare("SELECT COUNT(*) n, AVG(rating) avg, SUM(CASE WHEN visibility = 'hidden' THEN 1 ELSE 0 END) hidden, SUM(flagged) flagged, SUM(CASE WHEN reply IS NOT NULL THEN 1 ELSE 0 END) replied FROM reviews WHERE restaurant_id = ?").bind(s.restaurantId).first(),
    env.DB.prepare("SELECT rating, COUNT(*) n FROM reviews WHERE restaurant_id = ? GROUP BY rating").bind(s.restaurantId).all(),
  ]);
  const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  dist.results.forEach((r) => (d[r.rating] = r.n));
  return json({
    ok: true,
    reviews: rows.results.map((r) => ({ ...r, flagged: !!r.flagged })),
    summary: { count: summary.n || 0, avg: summary.n ? Math.round(summary.avg * 10) / 10 : null, hidden: summary.hidden || 0, flagged: summary.flagged || 0, replied: summary.replied || 0, distribution: d },
    reply_supported: true,
  });
});

on("PATCH", "/api/panel/reviews/:id", "reviews", async ({ request, env, s, p }) => {
  const b = await readJson(request);
  if ("rating" in b) throw new ApiError(403, "rating_immutable", "امتیاز ثبت‌شده توسط مشتری قابل تغییر نیست.");
  const f = {};
  if ("visibility" in b) f.visibility = oneOf(b.visibility, ["published", "hidden"], "وضعیت انتشار");
  if ("flagged" in b) { f.flagged = bool(b.flagged) ? 1 : 0; f.flag_reason = f.flagged ? str(b.flag_reason, { max: 120, field: "دلیل گزارش" }) || "نامناسب" : null; }
  if ("reply" in b) { f.reply = str(b.reply, { max: 500, field: "پاسخ" }) || null; f.reply_at = f.reply ? Date.now() : null; }
  const keys = Object.keys(f);
  if (!keys.length) throw new ApiError(422, "validation_error", "تغییری ارسال نشده است.");
  const r = await env.DB.prepare(`UPDATE reviews SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND restaurant_id = ?`).bind(...keys.map((k) => f[k]), p.id, s.restaurantId).run();
  if (!r.meta.changes) throw new ApiError(404, "not_found", "نظر پیدا نشد.");
  await audit(env.DB, s.restaurantId, s.actor, "review.update", "review", p.id, { visibility: f.visibility, flagged: f.flagged, replied: "reply" in f ? !!f.reply : undefined });
  const row = await env.DB.prepare("SELECT * FROM reviews WHERE id = ?").bind(p.id).first();
  return json({ ok: true, review: { ...row, flagged: !!row.flagged } });
});

// ---------- درخواست‌های همکاری (فقط مدیر سپیدار) ----------
const maskPhone = (ph) => (ph || "").replace(/^(.{4}).*(.{2})$/, (m, a, b) => a + "•".repeat(Math.max(0, ph.length - 6)) + b);
on("GET", "/api/panel/leads", "leads", async ({ env, url }) => {
  const st = url.searchParams.get("status");
  const rows = st && st !== "all"
    ? await env.DB.prepare("SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC LIMIT 200").bind(oneOf(st, ["new", "reviewing", "approved", "rejected"])).all()
    : await env.DB.prepare("SELECT * FROM leads ORDER BY created_at DESC LIMIT 200").all();
  const counts = (await env.DB.prepare("SELECT status, COUNT(*) n FROM leads GROUP BY status").all()).results;
  return json({ ok: true, leads: rows.results.map((l) => ({ id: l.id, restaurant_name: l.restaurant_name, phone_masked: maskPhone(l.phone), status: l.status, created_at: l.created_at, has_note: !!l.note })), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});
on("GET", "/api/panel/leads/:id", "leads", async ({ env, s, p }) => {
  const l = await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(p.id).first();
  if (!l) throw new ApiError(404, "not_found", "درخواست پیدا نشد.");
  // مشاهده اطلاعات تماس کامل در سابقه ثبت می‌شود
  await audit(env.DB, s.restaurantId, s.actor, "lead.view", "lead", p.id, null);
  return json({ ok: true, lead: l });
});
on("PATCH", "/api/panel/leads/:id", "leads", async ({ request, env, s, p }) => {
  const b = await readJson(request);
  const f = {};
  if ("status" in b) f.status = oneOf(b.status, ["new", "reviewing", "approved", "rejected"], "وضعیت");
  if ("internal_note" in b) f.internal_note = str(b.internal_note, { max: 500, field: "یادداشت" }) || null;
  const keys = Object.keys(f);
  if (!keys.length) throw new ApiError(422, "validation_error", "تغییری ارسال نشده است.");
  const r = await env.DB.prepare(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => f[k]), Date.now(), p.id).run();
  if (!r.meta.changes) throw new ApiError(404, "not_found", "درخواست پیدا نشد.");
  await audit(env.DB, s.restaurantId, s.actor, "lead.update", "lead", p.id, { status: f.status });
  return json({ ok: true });
});

// ---------- تنظیمات و QR ----------
on("GET", "/api/panel/settings", "settings", async ({ env, s }) => {
  const r = await env.DB.prepare("SELECT * FROM restaurants WHERE id = ?").bind(s.restaurantId).first();
  return json({ ok: true, restaurant: { ...r, accepting_orders: !!r.accepting_orders }, public_site_url: env.PUBLIC_SITE_URL || null });
});
on("PATCH", "/api/panel/settings", "settings", async ({ request, env, s }) => {
  const b = await readJson(request);
  const f = {};
  if ("name" in b) f.name = str(b.name, { max: 60, min: 2, field: "نام رستوران" });
  if ("phone" in b) f.phone = str(b.phone, { max: 30, field: "شماره تماس" });
  if ("address" in b) f.address = str(b.address, { max: 200, field: "نشانی" });
  if ("hours" in b) f.hours = str(b.hours, { max: 120, field: "ساعات کاری" });
  if ("about" in b) f.about = str(b.about, { max: 300, field: "معرفی" });
  if ("status" in b) f.status = oneOf(b.status, ["open", "closed", "paused"], "وضعیت فعالیت");
  if ("accepting_orders" in b) f.accepting_orders = bool(b.accepting_orders) ? 1 : 0;
  const keys = Object.keys(f);
  if (!keys.length) throw new ApiError(422, "validation_error", "تغییری ارسال نشده است.");
  // شناسه رستوران فقط از نشست سرور می‌آید، نه از بدنه درخواست
  await env.DB.prepare(`UPDATE restaurants SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => f[k]), Date.now(), s.restaurantId).run();
  await audit(env.DB, s.restaurantId, s.actor, "settings.update", "restaurant", s.restaurantId, { fields: keys, status: f.status });
  const r = await env.DB.prepare("SELECT * FROM restaurants WHERE id = ?").bind(s.restaurantId).first();
  return json({ ok: true, restaurant: { ...r, accepting_orders: !!r.accepting_orders } });
});

// ---------- مدیریت توکن‌های ورود (فقط مدیر سپیدار) ----------
on("GET", "/api/panel/access-tokens", "platform_settings", async ({ env, s }) => {
  const rows = (await env.DB.prepare("SELECT id, token_prefix, label, role, created_at, expires_at, revoked_at, last_used_at FROM access_tokens WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 100")
    .bind(s.restaurantId).all()).results;
  return json({ ok: true, tokens: rows.map((row) => ({ ...row, is_current: row.id === s.accessTokenId })) });
});

on("POST", "/api/panel/access-tokens", "platform_settings", async ({ request, env, s }) => {
  const b = await readJson(request, 4096);
  const label = str(b.label, { max: 80, min: 2, field: "نام توکن" });
  const role = oneOf(b.role, ["platform_admin", "owner"], "نوع دسترسی");
  const duration = oneOf(b.duration, ["1h", "1d", "1y", "never"], "مدت اعتبار");
  const now = Date.now();
  const expiresAt = duration === "never" ? null : now + ({
    "1h": 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "1y": 365 * 24 * 60 * 60 * 1000,
  })[duration];
  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM access_tokens WHERE restaurant_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)")
    .bind(s.restaurantId, now).first();
  if ((active?.n || 0) >= 100) throw new ApiError(429, "token_limit", "حداکثر ۱۰۰ توکن فعال مجاز است؛ ابتدا یکی از توکن‌ها را لغو کنید.");

  // مقدار خام فقط همین یک بار به پنل برگردانده می‌شود؛ در D1 فقط هش ذخیره می‌گردد.
  const token = "spd_" + randomId(32);
  const id = randomId(12);
  const prefix = token.slice(0, 12);
  await env.DB.prepare("INSERT INTO access_tokens (id, token_hash, token_prefix, label, restaurant_id, role, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, await sha256Hex(token), prefix, label, s.restaurantId, role, now, expiresAt, s.actor).run();
  await audit(env.DB, s.restaurantId, s.actor, "access_token.create", "access_token", id, { label, role, duration, token_prefix: prefix, expires_at: expiresAt });
  return json({ ok: true, token: { id, token, token_prefix: prefix, label, role, created_at: now, expires_at: expiresAt, revoked_at: null, last_used_at: null, is_current: false } });
});

on("DELETE", "/api/panel/access-tokens/:id", "platform_settings", async ({ env, s, p }) => {
  const target = await env.DB.prepare("SELECT id, label, role, revoked_at FROM access_tokens WHERE id = ? AND restaurant_id = ?")
    .bind(p.id, s.restaurantId).first();
  if (!target) throw new ApiError(404, "not_found", "توکن پیدا نشد.");
  if (s.accessTokenId === target.id) throw new ApiError(409, "current_token", "این توکن برای نشست فعلی استفاده شده؛ ابتدا با توکن دیگری وارد شوید و سپس آن را لغو کنید.");
  if (target.revoked_at) return json({ ok: true, already_revoked: true });
  const now = Date.now();
  await env.DB.prepare("UPDATE access_tokens SET revoked_at = ? WHERE id = ? AND restaurant_id = ? AND revoked_at IS NULL")
    .bind(now, target.id, s.restaurantId).run();
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE access_token_id = ? AND revoked_at IS NULL")
    .bind(now, target.id).run();
  await audit(env.DB, s.restaurantId, s.actor, "access_token.revoke", "access_token", target.id, { label: target.label, role: target.role });
  return json({ ok: true });
});

on("GET", "/api/panel/qr", "restaurant", async ({ env, s }) => {
  const base = env.PUBLIC_SITE_URL;
  if (!base) return json({ ok: true, configured: false, reason: "public_site_url_missing", restaurant_id: s.restaurantId });
  const u = new URL(base);
  u.searchParams.set("r", s.restaurantId);
  return json({ ok: true, configured: true, restaurant_id: s.restaurantId, target_url: u.toString(), customer_reads_param: false });
});

// ---------- گزارش‌ها ----------
on("GET", "/api/panel/reports", "reports", async ({ env, s, url }) => {
  const parseDay = (v, fb) => { if (!v) return fb; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ApiError(422, "validation_error", "تاریخ معتبر نیست."); return Date.parse(v + "T00:00:00Z") - TEHRAN_OFFSET_MS; };
  const today = tehranDayStart();
  const to = parseDay(url.searchParams.get("to"), today) + DAY_MS;
  const from = parseDay(url.searchParams.get("from"), today - 6 * DAY_MS);
  if (to <= from || to - from > 92 * DAY_MS) throw new ApiError(422, "validation_error", "بازه زمانی باید بین ۱ تا ۹۲ روز باشد.");
  const span = to - from, rid = s.restaurantId, db = env.DB;
  const dayExpr = `CAST((created_at + ${TEHRAN_OFFSET_MS}) / ${DAY_MS} AS INTEGER)`;
  const [daily, byStatus, top, prev, rating, ratingDist] = await Promise.all([
    db.prepare(`SELECT ${dayExpr} d, COUNT(*) n, COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total END), 0) amount FROM orders WHERE restaurant_id = ? AND created_at >= ? AND created_at < ? GROUP BY d ORDER BY d`).bind(rid, from, to).all(),
    db.prepare("SELECT status, COUNT(*) n FROM orders WHERE restaurant_id = ? AND created_at >= ? AND created_at < ? GROUP BY status").bind(rid, from, to).all(),
    db.prepare("SELECT oi.name, oi.emoji, SUM(oi.qty) qty, SUM(oi.line_total) amount FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.restaurant_id = ? AND o.created_at >= ? AND o.created_at < ? AND o.status != 'cancelled' GROUP BY oi.name, oi.emoji ORDER BY qty DESC LIMIT 8").bind(rid, from, to).all(),
    db.prepare("SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total END), 0) amount FROM orders WHERE restaurant_id = ? AND created_at >= ? AND created_at < ?").bind(rid, from - span, from).first(),
    db.prepare("SELECT COUNT(*) n, AVG(rating) avg FROM reviews WHERE restaurant_id = ? AND created_at >= ? AND created_at < ?").bind(rid, from, to).first(),
    db.prepare("SELECT rating, COUNT(*) n FROM reviews WHERE restaurant_id = ? AND created_at >= ? AND created_at < ? GROUP BY rating").bind(rid, from, to).all(),
  ]);
  const map = Object.fromEntries(daily.results.map((r) => [r.d, r]));
  const days = [];
  for (let t = from; t < to; t += DAY_MS) {
    const d = Math.floor((t + TEHRAN_OFFSET_MS) / DAY_MS);
    days.push({ day_start: t, count: map[d] ? map[d].n : 0, amount: map[d] ? map[d].amount : 0 });
  }
  const total = days.reduce((a, d) => a + d.count, 0), amount = days.reduce((a, d) => a + d.amount, 0);
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratingDist.results.forEach((r) => (dist[r.rating] = r.n));
  return json({
    ok: true, range: { from, to },
    totals: { count: total, amount, prev_count: prev.n || 0, prev_amount: prev.amount || 0 },
    days, by_status: Object.fromEntries(byStatus.results.map((r) => [r.status, r.n])),
    top_items: top.results, rating: { count: rating.n || 0, avg: rating.n ? Math.round(rating.avg * 10) / 10 : null, distribution: dist },
  });
});

export async function handlePanel(request, env, url) {
  const method = request.method.toUpperCase();
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = url.pathname.match(r.re);
    if (!m) continue;
    let s = null;
    if (r.perm) {
      s = await requireSession(request, env, r.perm === "auth" ? null : r.perm);
      if (method !== "GET") assertSameOrigin(request, env);
    }
    return r.handler({ request, env, url, s, p: m.groups || {} });
  }
  const known = routes.some((r) => url.pathname.match(r.re));
  if (known) throw new ApiError(405, "method_not_allowed", "این روش درخواست پشتیبانی نمی‌شود.");
  throw new ApiError(404, "not_implemented", "این مسیر هنوز در سرور پیاده‌سازی نشده است.");
}
