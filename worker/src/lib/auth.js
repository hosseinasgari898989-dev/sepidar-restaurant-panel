import { ApiError, readJson } from "./http.js";
import { randomId, sha256Hex } from "./util.js";
import { checkLimit, hit, clear } from "./ratelimit.js";

export const COOKIE = "__Host-sp_panel";
const LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };   // هر مرورگر مدیریتی
const GLOBAL_LIMIT = { limit: 40, windowMs: 15 * 60 * 1000, lockMs: 10 * 60 * 1000 }; // کل سامانه، برای محدودکردن حمله توزیع‌شده

// نقش‌ها و مجوزها؛ مجوز فقط از نشست سمت سرور خوانده می‌شود
const ROLE_PERMS = {
  platform_admin: ["restaurant", "orders", "menu", "reviews", "reports", "settings", "leads", "platform_settings"],
  owner: ["restaurant", "orders", "menu", "reviews", "reports", "settings"],
};

export function authConfigured(env) {
  return Boolean(env.SEPIDAR_PANEL_BOOTSTRAP_TOKEN && env.SEPIDAR_PANEL_BOOTSTRAP_TOKEN.length >= 24 && env.DB);
}

async function deviceKey(body) {
  const id = typeof body.device_id === "string" ? body.device_id.trim() : "";
  if (!/^[a-f0-9]{32,64}$/i.test(id)) throw new ApiError(422, "invalid_device_id", "شناسه امن دستگاه معتبر نیست؛ صفحه ورود را تازه‌سازی کنید.");
  return "login:device:" + (await sha256Hex("sepidar-admin-device-v1:" + id.toLowerCase())).slice(0, 32);
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(ha, hb);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

function ttlMs(env) {
  const h = Number(env.SESSION_TTL_HOURS || 8);
  return Math.min(Math.max(h, 1), 24) * 3600 * 1000;
}

function cookieHeader(value, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

function readCookie(request) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
}

// درخواست‌های تغییردهنده پنل: فقط هم‌دامنه + هدر اختصاصی (در برابر CSRF)
export function assertSameOrigin(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const extra = (env.PANEL_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && origin !== url.origin && !extra.includes(origin)) {
    throw new ApiError(403, "forbidden_origin", "این درخواست از مبدأ مجاز ارسال نشده است.");
  }
  if (request.headers.get("X-Sepidar-Panel") !== "1") {
    throw new ApiError(403, "forbidden", "درخواست نامعتبر است.");
  }
}

export async function login(request, env) {
  if (!authConfigured(env)) {
    throw new ApiError(503, "auth_not_configured", "ورود امن هنوز روی سرور پیکربندی نشده است.");
  }
  assertSameOrigin(request, env);
  const db = env.DB;
  const body = await readJson(request, 2048);
  const key = await deviceKey(body);
  await checkLimit(db, key, LOGIN_LIMIT);
  await checkLimit(db, "login:global", GLOBAL_LIMIT);

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const tokenWellFormed = token.length > 0 && token.length <= 256;
  const t = Date.now();
  const tokenHash = tokenWellFormed ? await sha256Hex(token) : "";
  const accessToken = tokenWellFormed
    ? await db.prepare("SELECT id, token_prefix, restaurant_id, role, expires_at FROM access_tokens WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)").bind(tokenHash, t).first()
    : null;
  const bootstrapOk = !accessToken && tokenWellFormed && await safeEqual(token, env.SEPIDAR_PANEL_BOOTSTRAP_TOKEN);
  const ok = Boolean(accessToken || bootstrapOk);

  if (!ok) {
    await hit(db, key, LOGIN_LIMIT);
    await hit(db, "login:global", GLOBAL_LIMIT);
    await audit(db, null, "anonymous", "auth.login_failed", null, null, null);
    // پیام عمومی؛ هیچ جزئیاتی از دلیل رد شدن افشا نمی‌شود
    throw new ApiError(401, "invalid_credentials", "توکن معتبر نیست، منقضی شده یا دسترسی آن لغو شده است.");
  }
  await clear(db, key);

  const restaurantId = accessToken?.restaurant_id || env.PANEL_RESTAURANT_ID || "main";
  const role = accessToken?.role || "platform_admin";
  const restaurant = await db.prepare("SELECT id, name FROM restaurants WHERE id = ?").bind(restaurantId).first();
  if (!restaurant) throw new ApiError(503, "restaurant_not_provisioned", "اطلاعات رستوران هنوز در پایگاه داده ثبت نشده است.");

  if (accessToken) {
    await db.prepare("UPDATE access_tokens SET last_used_at = ? WHERE id = ?").bind(t, accessToken.id).run();
  }
  const sid = randomId(32);
  // خود توکن می‌تواند اعتبار طولانی‌تری داشته باشد، اما نشست مرورگر کوتاه‌عمر است.
  // همهٔ روش‌های ورود از سقف تنظیم‌شده (۸ ساعت به‌طور پیش‌فرض) پیروی می‌کنند؛
  // اگر توکن زودتر منقضی شود، نشست هم بیشتر از آن زنده نمی‌ماند.
  const configuredSessionTtl = ttlMs(env);
  const sessionTtl = accessToken && accessToken.expires_at != null
    ? Math.max(1, Math.min(configuredSessionTtl, accessToken.expires_at - t))
    : configuredSessionTtl;
  const exp = t + sessionTtl;
  const isBootstrap = !accessToken;
  await db.prepare("INSERT INTO sessions (id_hash, restaurant_id, role, created_at, expires_at, last_seen_at, ip_hash, user_agent, bootstrap, access_token_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(await sha256Hex(sid), restaurantId, role, t, exp, t, null, (request.headers.get("User-Agent") || "").slice(0, 160), isBootstrap ? 1 : 0, accessToken?.id || null)
    .run();
  // نشست‌های منقضی‌شده‌ی قدیمی را پاک کن؛ نشست‌های توکن لغوشده نیز دیگر قابل استفاده نیستند.
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t - 7 * 86400000).run();
  await audit(db, restaurantId, isBootstrap ? "bootstrap_admin" : role, "auth.login", null, null, { token_id: accessToken?.id || null, token_prefix: accessToken?.token_prefix || null });

  const perms = ROLE_PERMS[role] || [];
  return {
    cookie: cookieHeader(sid, Math.floor(sessionTtl / 1000)),
    session: { role, permissions: perms, expires_at: exp, restaurant: { id: restaurant.id, name: restaurant.name }, bootstrap: isBootstrap, access_token_prefix: accessToken?.token_prefix || null },
  };
}

export async function requireSession(request, env, perm) {
  if (!env.DB) throw new ApiError(503, "db_not_configured", "پایگاه داده هنوز به سرور متصل نشده است.");
  const sid = readCookie(request);
  if (!sid || sid.length > 100) throw new ApiError(401, "unauthenticated", "برای ادامه وارد شوید.");
  const t = Date.now();
  const row = await env.DB.prepare("SELECT s.id_hash, s.restaurant_id, s.role, s.expires_at, s.last_seen_at, s.bootstrap, s.access_token_id FROM sessions s LEFT JOIN access_tokens a ON a.id = s.access_token_id WHERE s.id_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND (s.access_token_id IS NULL OR (a.id IS NOT NULL AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at > ?)))")
    .bind(await sha256Hex(sid), t, t).first();
  if (!row) throw new ApiError(401, "session_expired", "نشست شما به پایان رسیده است. دوباره وارد شوید.");
  const perms = ROLE_PERMS[row.role] || [];
  if (perm && !perms.includes(perm)) throw new ApiError(403, "forbidden", "شما به این بخش دسترسی ندارید.");
  if (!row.last_seen_at || t - row.last_seen_at > 60000) {
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?").bind(t, row.id_hash).run();
  }
  return { idHash: row.id_hash, restaurantId: row.restaurant_id, role: row.role, permissions: perms, expiresAt: row.expires_at, bootstrap: Boolean(row.bootstrap), accessTokenId: row.access_token_id || null, actor: row.bootstrap ? "bootstrap_admin" : row.role === "platform_admin" ? "platform_admin" : "owner" };
}

export async function logout(request, env, all = false) {
  const s = await requireSession(request, env);
  const t = Date.now();
  if (all) {
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE restaurant_id = ? AND revoked_at IS NULL").bind(t, s.restaurantId).run();
  } else {
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id_hash = ?").bind(t, s.idHash).run();
  }
  await audit(env.DB, s.restaurantId, s.actor, all ? "auth.logout_all" : "auth.logout", null, null, null);
  return cookieHeader("", 0);
}

export async function audit(db, restaurantId, actor, action, entity, entityId, detail) {
  try {
    await db.prepare("INSERT INTO audit_log (restaurant_id, actor, action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(restaurantId, actor, action, entity, entityId, detail ? JSON.stringify(detail) : null, Date.now()).run();
  } catch (e) {
    console.error("audit failed", e);
  }
}
