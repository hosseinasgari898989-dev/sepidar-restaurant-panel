// لایه ارتباط با سرور. همه بخش‌های پنل فقط از این لایه استفاده می‌کنند؛
// برای اتصال به APIهای تکمیل‌شده، فقط همین فایل باید با مسیرهای سرور هماهنگ بماند.
const BASE = (document.querySelector('meta[name="sepidar-api-base"]')?.content || "").replace(/\/$/, "");
const listeners = {};
export const on = (ev, fn) => ((listeners[ev] ||= []).push(fn));
const emit = (ev, d) => (listeners[ev] || []).forEach((f) => f(d));

// فقط شناسه‌ی ناشناس این مرورگر برای محدودسازی تلاش ورود؛ توکن دسترسی در storage ذخیره نمی‌شود.
function panelDeviceId() {
  const name = "sepidar_admin_device_v1";
  let fromCookie = "";
  try {
    const pair = document.cookie.split(";").map((x) => x.trim()).find((x) => x.startsWith(name + "="));
    fromCookie = pair ? pair.slice(name.length + 1) : "";
  } catch {}
  if (/^[a-f0-9]{32,64}$/i.test(fromCookie)) {
    const id = fromCookie.toLowerCase();
    try { localStorage.setItem(name, id); } catch {}
    return id;
  }
  let id = "";
  try { id = localStorage.getItem(name) || ""; } catch {}
  if (!/^[a-f0-9]{32,64}$/i.test(id)) {
    try { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); id = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join(""); }
    catch { id = (Date.now().toString(16) + Math.random().toString(16).slice(2)).padEnd(32, "0").slice(0, 32); }
  }
  id = id.toLowerCase();
  try { localStorage.setItem(name, id); } catch {}
  try { document.cookie = name + "=" + id + "; Path=/; Max-Age=31536000; SameSite=Strict; Secure"; } catch {}
  return id;
}

export class ApiError extends Error {
  constructor(kind, status, code, message, body = {}) {
    super(message);
    Object.assign(this, { kind, status, code, body });
  }
}

const DEFAULTS = {
  400: "درخواست معتبر نیست.", 401: "برای ادامه وارد شوید.", 403: "به این بخش دسترسی ندارید.",
  404: "این قابلیت هنوز در سرور پیاده‌سازی نشده است.", 409: "این مورد پیش‌تر تغییر کرده است.",
  422: "اطلاعات واردشده معتبر نیست.", 429: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید.",
  500: "خطای داخلی سرور.", 502: "سرور در دسترس نیست.", 503: "سرویس موقتاً در دسترس نیست.",
};

async function req(method, path, body, { timeout = 15000, quiet = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", "X-Sepidar-Panel": "1", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    const err = new ApiError("network", 0, "network", e.name === "AbortError" ? "پاسخ سرور بیش از حد طول کشید." : "اتصال به سرور برقرار نشد. اینترنت یا وضعیت سرور را بررسی کنید.");
    if (!quiet) emit("net", { online: false, error: err });
    throw err;
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* پاسخ غیر JSON */ }
  emit("net", { online: true, at: Date.now() });
  if (!res.ok || !data || data.ok === false) {
    let code = data?.error || `http_${res.status}`;
    let msg = data?.message;
    // پیام‌های انگلیسی اسکلت قدیمی سرور را به وضعیت «در انتظار بک‌اند» تبدیل کن
    if (!msg || /[a-z]{3}/i.test(msg) && !/[\u0600-\u06FF]/.test(msg)) msg = DEFAULTS[res.status] || "خطای ناشناخته از سرور.";
    if ((res.status === 404 || res.status === 405) && (code === "not_found" || code === "method_not_allowed" || code === `http_${res.status}`) && !data?.message?.match(/[\u0600-\u06FF]/)) code = "not_implemented";
    const err = new ApiError("http", res.status, code, msg, data || {});
    if (res.status === 401 && path !== "/api/panel/auth/login") emit("unauth", err);
    throw err;
  }
  return data;
}

const qs = (o = {}) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "" && v !== "all"));
  const s = p.toString();
  return s ? "?" + s : "";
};

export const live = {
  mode: "live",
  health: () => req("GET", "/health", null, { timeout: 8000, quiet: true }),
  login: (token) => req("POST", "/api/panel/auth/login", { token, device_id: panelDeviceId() }),
  logout: () => req("POST", "/api/panel/auth/logout", {}),
  logoutAll: () => req("POST", "/api/panel/auth/logout-all", {}),
  session: () => req("GET", "/api/panel/session"),
  dashboard: () => req("GET", "/api/panel/dashboard"),
  activity: () => req("GET", "/api/panel/activity"),
  orders: (p) => req("GET", "/api/panel/orders" + qs(p)),
  order: (id) => req("GET", `/api/panel/orders/${encodeURIComponent(id)}`),
  setOrderStatus: (id, from, to, reason, estimatedMinutes) => req("POST", `/api/panel/orders/${encodeURIComponent(id)}/status`, { from, to, reason, ...(estimatedMinutes != null ? { estimated_minutes: estimatedMinutes } : {}) }),
  menu: () => req("GET", "/api/panel/menu"),
  createCategory: (b) => req("POST", "/api/panel/menu/categories", b),
  updateCategory: (id, b) => req("PATCH", `/api/panel/menu/categories/${encodeURIComponent(id)}`, b),
  deleteCategory: (id) => req("DELETE", `/api/panel/menu/categories/${encodeURIComponent(id)}`),
  createItem: (b) => req("POST", "/api/panel/menu/items", b),
  uploadImage: async (file) => {
    const form = new FormData();
    form.append("file", file, file.name || "food-image");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(BASE + "/api/panel/menu/images", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "X-Sepidar-Panel": "1" },
        body: form, signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false) {
        const err = new ApiError("http", res.status, data?.error || "image_upload_failed", data?.message || DEFAULTS[res.status] || "آپلود عکس ناموفق بود.", data || {});
        if (res.status === 401) emit("unauth", err);
        throw err;
      }
      return data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError("network", 0, "image_upload_failed", e.name === "AbortError" ? "آپلود عکس بیش از حد طول کشید." : "اتصال هنگام آپلود عکس قطع شد.");
    } finally { clearTimeout(timer); }
  },
  updateItem: (id, b) => req("PATCH", `/api/panel/menu/items/${encodeURIComponent(id)}`, b),
  deleteItem: (id) => req("DELETE", `/api/panel/menu/items/${encodeURIComponent(id)}`),
  reviews: (p) => req("GET", "/api/panel/reviews" + qs(p)),
  updateReview: (id, b) => req("PATCH", `/api/panel/reviews/${encodeURIComponent(id)}`, b),
  banReviewAuthor: (id, b) => req("POST", `/api/panel/reviews/${encodeURIComponent(id)}/ban`, b),
  unbanReviewAuthor: (id) => req("DELETE", `/api/panel/reviews/${encodeURIComponent(id)}/ban`),
  deleteReview: (id) => req("DELETE", `/api/panel/reviews/${encodeURIComponent(id)}`),
  leads: (p) => req("GET", "/api/panel/leads" + qs(p)),
  lead: (id) => req("GET", `/api/panel/leads/${encodeURIComponent(id)}`),
  updateLead: (id, b) => req("PATCH", `/api/panel/leads/${encodeURIComponent(id)}`, b),
  settings: () => req("GET", "/api/panel/settings"),
  updateSettings: (b) => req("PATCH", "/api/panel/settings", b),
  accessTokens: () => req("GET", "/api/panel/access-tokens"),
  createAccessToken: (b) => req("POST", "/api/panel/access-tokens", b),
  revokeAccessToken: (id) => req("DELETE", `/api/panel/access-tokens/${encodeURIComponent(id)}`),
  qr: () => req("GET", "/api/panel/qr"),
  reports: (p) => req("GET", "/api/panel/reports" + qs(p)),
};
