import { ApiError } from "./http.js";

// محدودسازی ساده مبتنی بر D1. کلیدها باید از شناسه‌ی ناشناس/نشست مشتق شوند؛ داده‌ی شناسایی خام ذخیره نکنید.
export async function checkLimit(db, key, { limit, windowMs, lockMs = 0 }) {
  const t = Date.now();
  const row = await db.prepare("SELECT count, window_start, locked_until FROM rate_limits WHERE key = ?").bind(key).first();
  if (row && row.locked_until && row.locked_until > t) {
    const retry = Math.ceil((row.locked_until - t) / 1000);
    throw new ApiError(429, "too_many_attempts", "تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره امتحان کنید.", { retryAfter: retry, body: { retry_after: retry } });
  }
  if (row && t - row.window_start < windowMs && row.count >= limit) {
    const retry = Math.ceil((row.window_start + windowMs - t) / 1000);
    throw new ApiError(429, "too_many_attempts", "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره امتحان کنید.", { retryAfter: retry, body: { retry_after: retry } });
  }
}

export async function hit(db, key, { limit, windowMs, lockMs = 0 }) {
  const t = Date.now();
  const row = await db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first();
  if (!row || t - row.window_start >= windowMs) {
    await db.prepare("INSERT INTO rate_limits (key, count, window_start, locked_until) VALUES (?, 1, ?, NULL) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start, locked_until = NULL").bind(key, t).run();
    return 1;
  }
  const c = row.count + 1;
  const locked = lockMs && c >= limit ? t + lockMs : null;
  await db.prepare("UPDATE rate_limits SET count = ?, locked_until = ? WHERE key = ?").bind(c, locked, key).run();
  return c;
}

export async function clear(db, key) {
  await db.prepare("DELETE FROM rate_limits WHERE key = ?").bind(key).run();
}
