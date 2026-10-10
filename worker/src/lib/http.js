// لایه پاسخ‌دهی HTTP: JSON، CORS برای مسیرهای عمومی، خطاهای استاندارد
export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
}

export function baseHeaders() {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
  });
}

// CORS فقط برای مسیرهای عمومی (سایت مشتریان روی GitHub Pages). مسیرهای پنل هم‌دامنه‌اند و CORS ندارند.
export function applyCors(headers, request, env) {
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}

export function json(data, status = 200, init = {}) {
  const headers = init.headers instanceof Headers ? init.headers : baseHeaders();
  if (init.setCookie) headers.append("Set-Cookie", init.setCookie);
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(err, headers) {
  if (err instanceof ApiError) {
    const h = headers || baseHeaders();
    if (err.extra.retryAfter) h.set("Retry-After", String(err.extra.retryAfter));
    return json({ ok: false, error: err.code, message: err.message, ...err.extra.body }, err.status, { headers: h });
  }
  // جزئیات داخلی هرگز به کاربر برنمی‌گردد؛ فقط در لاگ Worker ثبت می‌شود
  console.error("unhandled", err && err.stack ? err.stack : err);
  return json({ ok: false, error: "internal_error", message: "خطای داخلی سرور. لطفاً دوباره تلاش کنید." }, 500, { headers: headers || baseHeaders() });
}

export async function readJson(request, maxBytes = 32 * 1024) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > maxBytes) throw new ApiError(413, "payload_too_large", "حجم درخواست بیش از حد مجاز است.");
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) throw new ApiError(415, "unsupported_media_type", "قالب درخواست باید JSON باشد.");
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, "payload_too_large", "حجم درخواست بیش از حد مجاز است.");
  try {
    const v = JSON.parse(text || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not object");
    return v;
  } catch {
    throw new ApiError(400, "invalid_json", "داده ارسال‌شده معتبر نیست.");
  }
}
