import { ApiError, json, readJson } from "../lib/http.js";
import { requireSession, assertSameOrigin, login, logout, audit } from "../lib/auth.js";
import { loadMenu, itemOut, validateOptions, validateRemovables } from "../lib/menu.js";
import { str, int, bool, oneOf, httpUrl, color, parseJson, tehranDayStart, DAY_MS, TEHRAN_OFFSET_MS, randomId, sha256Hex } from "../lib/util.js";
import { checkLimit, hit } from "../lib/ratelimit.js";

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

async function panelMutationLimit(env, session, scope = "mutations", limit = 100, windowMs = 5 * 60 * 1000) {
  const key = "panel:" + scope + ":" + (await sha256Hex(session.idHash + ":" + scope)).slice(0, 36);
  const policy = { limit, windowMs };
  await checkLimit(env.DB, key, policy);
  await hit(env.DB, key, policy);
}

async function restaurantCreateLimit(env, session, scope, limit, windowMs) {
  const key = "panel:restaurant:" + scope + ":" + (await sha256Hex(session.restaurantId + ":" + scope)).slice(0, 36);
  const policy = { limit, windowMs };
  await checkLimit(env.DB, key, policy);
  await hit(env.DB, key, policy);
}

function validImageSignature(bytes, type) {
  const b = [...bytes];
  if (type === "image/png") return b.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (type === "image/jpeg") return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (type === "image/webp") return String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  if (type === "image/avif") {
    const brand = String.fromCharCode(...b.slice(8, 12));
    return String.fromCharCode(...b.slice(4, 8)) === "ftyp" && ["avif", "avis"].includes(brand);
  }
  return false;
}

const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

// پارس multipart با سقف واقعی بدنه؛ به Content-Length به‌تنهایی اعتماد نمی‌کنیم.
async function readBoundedFormData(request, maxBytes) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ApiError(415, "unsupported_media_type", "عکس باید از طریق فرم بارگذاری ارسال شود.");
  }
  if (!request.body) throw new ApiError(400, "invalid_multipart", "محتوای بارگذاری خالی است.");
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new ApiError(413, "image_too_large", "حجم عکس با احتساب فرم باید حداکثر ۵ مگابایت باشد.");
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, "invalid_multipart", "خواندن فرم عکس ناموفق بود.");
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new ApiError(400, "invalid_multipart", "ساختار فرم بارگذاری عکس معتبر نیست.");
  }
}

function r2MediaKey(imageUrl, expectedOrigin) {
  if (typeof imageUrl !== "string" || !imageUrl) return null;
  try {
    const u = new URL(imageUrl);
    if (u.origin !== expectedOrigin || u.search || u.hash) return null;
    const match = u.pathname.match(/^\/media\/([a-z0-9-]{1,40}\/[A-Za-z0-9_-]{20,80}\.(?:jpg|png|webp|avif))$/);
    return match ? match[1] : null;
  } catch { return null; }
}

async function requireR2Photo(env, origin, imageUrl) {
  if (!env.FOOD_IMAGES) throw new ApiError(503, "image_storage_unavailable", "فضای ذخیره‌سازی عکس (R2) هنوز برای این Worker فعال نشده است.");
  const key = r2MediaKey(imageUrl, origin);
  if (!key) throw new ApiError(422, "image_required_for_other", "برای دسته «سایر» باید عکس واقعی را از همین پنل در R2 بارگذاری کنید.");
  const object = await env.FOOD_IMAGES.head(key);
  if (!object || !IMAGE_CONTENT_TYPES.has(object.httpMetadata?.contentType)) {
    throw new ApiError(422, "image_required_for_other", "عکس بارگذاری‌شده در R2 پیدا نشد؛ دوباره عکس را بارگذاری کنید.");
  }
}

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
// بارگذاری عکس واقعی غذا روی R2؛ فقط کاربران احراز هویت‌شده با مجوز منو.
on("POST", "/api/panel/menu/images", "menu", async ({ request, env, url, s }) => {
  if (!env.FOOD_IMAGES) throw new ApiError(503, "image_storage_unavailable", "فضای ذخیره‌سازی عکس (R2) هنوز برای این Worker فعال نشده است.");
  const policy = { limit: 10, windowMs: 60 * 60 * 1000 };
  const keyHash = await sha256Hex("panel:image-upload:" + s.idHash);
  const key = "panel:image-upload:" + keyHash.slice(0, 36);
  await checkLimit(env.DB, key, policy);
  // هر تلاش آپلود، از جمله فایل نامعتبر، برای جلوگیری از آزمون مکرر شمرده می‌شود.
  await hit(env.DB, key, policy);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 5 * 1024 * 1024 + 64 * 1024) throw new ApiError(413, "image_too_large", "حجم هر عکس حداکثر ۵ مگابایت است.");
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("multipart/form-data")) throw new ApiError(415, "unsupported_media_type", "عکس باید از طریق فرم بارگذاری ارسال شود.");
  const form = await readBoundedFormData(request, 5 * 1024 * 1024 + 64 * 1024);
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function" || typeof file.size !== "number") throw new ApiError(422, "image_required", "ابتدا یک فایل عکس انتخاب کنید.");
  if (file.size < 16 || file.size > 5 * 1024 * 1024) throw new ApiError(413, "image_too_large", "حجم عکس باید بین ۱۶ بایت و ۵ مگابایت باشد.");
  const type = String(file.type || "").toLowerCase();
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[type];
  if (!ext) throw new ApiError(415, "invalid_image_type", "فقط JPEG، PNG، WebP یا AVIF مجاز است؛ SVG و فایل‌های اجرایی پذیرفته نمی‌شوند.");
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!validImageSignature(header, type)) throw new ApiError(415, "invalid_image_signature", "محتوای فایل با نوع عکس اعلام‌شده سازگار نیست.");
  const objectKey = `${s.restaurantId}/${randomId(18)}.${ext}`;
  await env.FOOD_IMAGES.put(objectKey, file, {
    httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { restaurant_id: s.restaurantId, uploaded_by: s.actor, uploaded_at: String(Date.now()) },
  });
  const imageUrl = url.origin + "/media/" + objectKey.split("/").map(encodeURIComponent).join("/");
  await audit(env.DB, s.restaurantId, s.actor, "menu.image_upload", "image", objectKey, { type, size: file.size });
  return json({ ok: true, image_url: imageUrl, key: objectKey, type, size: file.size }, 201);
});

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
  await restaurantCreateLimit(env, s, "menu-category-create", 20, DAY_MS);
  const b = await readJson(request);
  const id = str(b.id, { max: 32, min: 1, field: "شناسه دسته" }).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(id)) throw new ApiError(422, "validation_error", "شناسه دسته باید با حروف لاتین کوچک، عدد یا خط تیره باشد.");
  const f = catFields(b, false);
  if (f.name === "سایر" && id !== "other") throw new ApiError(409, "reserved_category", "نام «سایر» متعلق به دسته‌ی سیستمی است؛ برای این رفتار از شناسه‌ی other استفاده کنید.");
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
  if (p.id === "other" && "name" in f && f.name !== "سایر") throw new ApiError(409, "reserved_category", "نام دسته «سایر» برای رفتار ویژه‌ی محصولات تصویری ثابت است؛ برای نام دیگر «دسته جدید» بسازید.");
  const keys = Object.keys(f);
  if (!keys.length) throw new ApiError(422, "validation_error", "تغییری ارسال نشده است.");
  const r = await env.DB.prepare(`UPDATE categories SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE restaurant_id = ? AND id = ?`)
    .bind(...keys.map((k) => f[k]), Date.now(), s.restaurantId, p.id).run();
  if (!r.meta.changes) throw new ApiError(404, "not_found", "دسته پیدا نشد.");
  await audit(env.DB, s.restaurantId, s.actor, "menu.category_update", "category", p.id, { fields: keys });
  return json({ ok: true });
});

on("DELETE", "/api/panel/menu/categories/:id", "menu", async ({ request, env, s, p }) => {
  if (p.id === "other") throw new ApiError(409, "reserved_category", "دسته‌ی «سایر» سیستمی است و قابل حذف نیست.");
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

on("POST", "/api/panel/menu/items", "menu", async ({ request, env, s, url }) => {
  const b = await readJson(request);
  const f = await itemFields(env, s, b, false);
  if (f.category_id === "other") await requireR2Photo(env, url.origin, f.image_url);
  await restaurantCreateLimit(env, s, "menu-item-create", 50, DAY_MS);
  const id = f.category_id + "-" + randomId(6).toLowerCase().replace(/[^a-z0-9]/g, "x");
  const max = await env.DB.prepare("SELECT COALESCE(MAX(sort), -1) m FROM menu_items WHERE restaurant_id = ? AND category_id = ?").bind(s.restaurantId, f.category_id).first();
  await env.DB.prepare("INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, emoji, image_url, model_url, meta, removables, active, available, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, s.restaurantId, f.category_id, f.name, f.description, f.price, f.emoji, f.image_url, f.model_url || null, f.meta || "{}", f.removables ?? null, f.active, f.available, f.sort ?? max.m + 1, Date.now()).run();
  await audit(env.DB, s.restaurantId, s.actor, "menu.item_create", "item", id, { name: f.name, price: f.price });
  const row = await env.DB.prepare("SELECT * FROM menu_items WHERE id = ?").bind(id).first();
  return json({ ok: true, item: itemOut(row) }, 201);
});

on("PATCH", "/api/panel/menu/items/:id", "menu", async ({ request, env, s, p, url }) => {
  const b = await readJson(request);
  const before = await env.DB.prepare("SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ? AND archived = 0").bind(p.id, s.restaurantId).first();
  if (!before) throw new ApiError(404, "not_found", "غذا پیدا نشد.");
  const f = await itemFields(env, s, b, true);
  const finalCategoryId = f.category_id || before.category_id;
  const finalImageUrl = Object.prototype.hasOwnProperty.call(f, "image_url") ? f.image_url : before.image_url;
  if (finalCategoryId === "other") await requireR2Photo(env, url.origin, finalImageUrl);
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
  const where = ["r.restaurant_id = ?"], args = [s.restaurantId];
  const rating = url.searchParams.get("rating");
  if (rating && rating !== "all") { where.push("r.rating = ?"); args.push(int(rating, { min: 1, max: 5 })); }
  const vis = url.searchParams.get("visibility");
  if (vis && vis !== "all") { where.push("r.visibility = ?"); args.push(oneOf(vis, ["published", "hidden"])); }
  if (url.searchParams.get("flagged") === "1") where.push("r.flagged = 1");
  const q = (url.searchParams.get("q") || "").trim().slice(0, 60);
  if (q) { where.push("(r.comment LIKE ? OR r.item_name LIKE ? OR r.author_name LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const [rows, summary, dist] = await Promise.all([
    env.DB.prepare(`SELECT r.*,
      CASE WHEN EXISTS (SELECT 1 FROM review_bans b WHERE b.restaurant_id = r.restaurant_id AND b.client_key_hash = r.client_key_hash AND (b.expires_at IS NULL OR b.expires_at > ${Date.now()})) THEN 1 ELSE 0 END AS author_banned,
      (SELECT b.expires_at FROM review_bans b WHERE b.restaurant_id = r.restaurant_id AND b.client_key_hash = r.client_key_hash AND (b.expires_at IS NULL OR b.expires_at > ${Date.now()}) LIMIT 1) AS ban_expires_at,
      (SELECT b.reason FROM review_bans b WHERE b.restaurant_id = r.restaurant_id AND b.client_key_hash = r.client_key_hash AND (b.expires_at IS NULL OR b.expires_at > ${Date.now()}) LIMIT 1) AS ban_reason
      FROM reviews r WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC LIMIT 100`).bind(...args).all(),
    env.DB.prepare("SELECT COUNT(*) n, AVG(rating) avg, SUM(CASE WHEN visibility = 'hidden' THEN 1 ELSE 0 END) hidden, SUM(flagged) flagged, SUM(CASE WHEN reply IS NOT NULL THEN 1 ELSE 0 END) replied FROM reviews WHERE restaurant_id = ?").bind(s.restaurantId).first(),
    env.DB.prepare("SELECT rating, COUNT(*) n FROM reviews WHERE restaurant_id = ? GROUP BY rating").bind(s.restaurantId).all(),
  ]);
  const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  dist.results.forEach((r) => (d[r.rating] = r.n));
  return json({
    ok: true,
    reviews: rows.results.map((r) => ({ ...r, flagged: !!r.flagged, author_banned: !!r.author_banned })),
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

// بن کردن یا رفع بن نویسنده‌ی نظر؛ بن به شناسه‌ی ناشناس مرورگر وصل است نه localStorage.
on("POST", "/api/panel/reviews/:id/ban", "reviews", async ({ request, env, s, p }) => {
  const review = await env.DB.prepare("SELECT id, client_key_hash FROM reviews WHERE id = ? AND restaurant_id = ?").bind(p.id, s.restaurantId).first();
  if (!review) throw new ApiError(404, "not_found", "نظر پیدا نشد.");
  if (!review.client_key_hash) throw new ApiError(409, "review_identity_unavailable", "این نظر پیش از فعال‌شدن شناسه‌ی امن مرورگر ثبت شده و قابل بن مستقیم نیست.");
  const b = await readJson(request, 2048);
  const duration = oneOf(b.duration || "30d", ["1d", "7d", "30d", "never"], "مدت بن");
  const reason = str(b.reason, { max: 160, field: "دلیل بن" }) || "تکرار اسپم یا رفتار نامناسب";
  const now = Date.now();
  const expires = duration === "never" ? null : now + ({ "1d": DAY_MS, "7d": 7 * DAY_MS, "30d": 30 * DAY_MS })[duration];
  await env.DB.prepare("INSERT INTO review_bans (restaurant_id, client_key_hash, reason, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(restaurant_id, client_key_hash) DO UPDATE SET reason=excluded.reason, created_at=excluded.created_at, expires_at=excluded.expires_at, created_by=excluded.created_by")
    .bind(s.restaurantId, review.client_key_hash, reason, now, expires, s.actor).run();
  await audit(env.DB, s.restaurantId, s.actor, "review.author_ban", "review", review.id, { duration, reason, expires_at: expires });
  return json({ ok: true, author_banned: true, expires_at: expires });
});

on("DELETE", "/api/panel/reviews/:id/ban", "reviews", async ({ env, s, p }) => {
  const review = await env.DB.prepare("SELECT id, client_key_hash FROM reviews WHERE id = ? AND restaurant_id = ?").bind(p.id, s.restaurantId).first();
  if (!review) throw new ApiError(404, "not_found", "نظر پیدا نشد.");
  if (!review.client_key_hash) throw new ApiError(409, "review_identity_unavailable", "برای این نظر شناسه‌ی نویسنده ثبت نشده است.");
  await env.DB.prepare("DELETE FROM review_bans WHERE restaurant_id = ? AND client_key_hash = ?").bind(s.restaurantId, review.client_key_hash).run();
  await audit(env.DB, s.restaurantId, s.actor, "review.author_unban", "review", review.id, null);
  return json({ ok: true, author_banned: false });
});

on("DELETE", "/api/panel/reviews/:id", "reviews", async ({ env, s, p }) => {
  const review = await env.DB.prepare("SELECT id FROM reviews WHERE id = ? AND restaurant_id = ?").bind(p.id, s.restaurantId).first();
  if (!review) throw new ApiError(404, "not_found", "نظر پیدا نشد.");
  await env.DB.prepare("DELETE FROM reviews WHERE id = ? AND restaurant_id = ?").bind(p.id, s.restaurantId).run();
  await audit(env.DB, s.restaurantId, s.actor, "review.delete", "review", review.id, null);
  return json({ ok: true });
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
  // The browser can have an incorrect system clock; return server time so the UI
  // can show expiry consistently with the server-side authentication checks.
  const serverTime = Date.now();
  const asMilliseconds = (value) => value != null && Number(value) > 0 && Number(value) < 100000000000 ? Number(value) * 1000 : value;
  return json({
    ok: true,
    server_time: serverTime,
    tokens: rows.map((row) => ({
      ...row,
      created_at: asMilliseconds(row.created_at),
      expires_at: asMilliseconds(row.expires_at),
      revoked_at: asMilliseconds(row.revoked_at),
      last_used_at: asMilliseconds(row.last_used_at),
      is_current: row.id === s.accessTokenId,
    })),
  });
});

on("POST", "/api/panel/access-tokens", "platform_settings", async ({ request, env, s }) => {
  await restaurantCreateLimit(env, s, "access-token-create", 10, 60 * 60 * 1000);
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

on("DELETE", "/api/panel/access-tokens/cleanup", "platform_settings", async ({ env, s }) => {
  const now = Date.now();
  const rows = (await env.DB.prepare("SELECT id, label, role, revoked_at, expires_at FROM access_tokens WHERE restaurant_id = ?")
    .bind(s.restaurantId).all()).results;
  const asMilliseconds = (value) => value != null && Number(value) > 0 && Number(value) < 100000000000 ? Number(value) * 1000 : value;
  // Keep the token that authenticated this session. For bootstrap sessions,
  // keep the newest currently-valid token so cleanup cannot strand the manager.
  const active = rows
    .filter((row) => !row.revoked_at && (row.expires_at == null || asMilliseconds(row.expires_at) > now))
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
  const protectedId = s.accessTokenId || active[0]?.id || null;
  let deleted = 0;
  for (const row of rows) {
    if (row.id === protectedId) continue;
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE access_token_id = ? AND revoked_at IS NULL")
      .bind(now, row.id).run();
    await env.DB.prepare("DELETE FROM access_tokens WHERE id = ? AND restaurant_id = ?")
      .bind(row.id, s.restaurantId).run();
    deleted++;
  }
  await audit(env.DB, s.restaurantId, s.actor, "access_token.cleanup", "access_token", protectedId, { deleted, protected_token_kept: Boolean(protectedId) });
  return json({ ok: true, deleted, protected_token_id: protectedId, active_token_kept: Boolean(protectedId) });
});

on("DELETE", "/api/panel/access-tokens/:id", "platform_settings", async ({ env, s, p }) => {
  const target = await env.DB.prepare("SELECT id, label, role, revoked_at FROM access_tokens WHERE id = ? AND restaurant_id = ?")
    .bind(p.id, s.restaurantId).first();
  if (!target) throw new ApiError(404, "not_found", "توکن پیدا نشد.");
  if (s.accessTokenId === target.id) throw new ApiError(409, "current_token", "این توکن برای نشست فعلی استفاده شده؛ ابتدا با توکن دیگری وارد شوید و سپس آن را حذف کنید.");
  const now = Date.now();
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE access_token_id = ? AND revoked_at IS NULL")
    .bind(now, target.id).run();
  await env.DB.prepare("DELETE FROM access_tokens WHERE id = ? AND restaurant_id = ?")
    .bind(target.id, s.restaurantId).run();
  await audit(env.DB, s.restaurantId, s.actor, "access_token.delete", "access_token", target.id, { label: target.label, role: target.role });
  return json({ ok: true, deleted: true });
});

on("GET", "/api/panel/qr", "restaurant", async ({ env, s }) => {
  const base = env.PUBLIC_SITE_URL;
  if (!base) return json({ ok: true, configured: false, reason: "public_site_url_missing", restaurant_id: s.restaurantId });
  const u = new URL(base);
  u.searchParams.set("r", s.restaurantId);
  return json({ ok: true, configured: true, restaurant_id: s.restaurantId, target_url: u.toString(), customer_reads_param: true });
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
      if (method !== "GET") {
        assertSameOrigin(request, env);
        await panelMutationLimit(env, s, "all-writes", 100, 5 * 60 * 1000);
      }
    }
    return r.handler({ request, env, url, s, p: m.groups || {} });
  }
  const known = routes.some((r) => url.pathname.match(r.re));
  if (known) throw new ApiError(405, "method_not_allowed", "این روش درخواست پشتیبانی نمی‌شود.");
  throw new ApiError(404, "not_implemented", "این مسیر هنوز در سرور پیاده‌سازی نشده است.");
}
