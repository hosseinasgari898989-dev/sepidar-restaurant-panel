import { ApiError } from "./http.js";

export const now = () => Date.now();
// منطقه زمانی ایران (UTC+03:30، بدون ساعت تابستانی)
export const TEHRAN_OFFSET_MS = 3.5 * 3600 * 1000;
export const DAY_MS = 86400000;
export function tehranDayStart(ts = Date.now()) {
  return Math.floor((ts + TEHRAN_OFFSET_MS) / DAY_MS) * DAY_MS - TEHRAN_OFFSET_MS;
}

export function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a);
}
export function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- اعتبارسنجی ورودی ----
const CTRL = /[-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export function str(v, { max = 200, min = 0, field = "مقدار", optional = false } = {}) {
  if (v == null || v === "") {
    if (optional) return null;
    if (min > 0) throw new ApiError(422, "validation_error", `${field} الزامی است.`);
    return "";
  }
  if (typeof v !== "string" && typeof v !== "number") throw new ApiError(422, "validation_error", `${field} معتبر نیست.`);
  const s = String(v).replace(CTRL, "").trim();
  if (s.length < min) throw new ApiError(422, "validation_error", `${field} الزامی است.`);
  if (s.length > max) throw new ApiError(422, "validation_error", `${field} حداکثر ${max} نویسه می‌تواند باشد.`);
  return s;
}
export function int(v, { min = -Infinity, max = Infinity, field = "عدد" } = {}) {
  const n = typeof v === "string" ? Number(v.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))) : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(422, "validation_error", `${field} معتبر نیست.`);
  return n;
}
export function bool(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}
export function oneOf(v, list, field = "مقدار") {
  if (!list.includes(v)) throw new ApiError(422, "validation_error", `${field} معتبر نیست.`);
  return v;
}
export function httpUrl(v, field = "آدرس") {
  const s = str(v, { max: 500, field, optional: true });
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw 0;
    return u.toString();
  } catch {
    throw new ApiError(422, "validation_error", `${field} باید یک آدرس اینترنتی معتبر باشد.`);
  }
}
export function color(v, field = "رنگ") {
  const s = str(v, { max: 9, field, optional: true });
  if (!s) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new ApiError(422, "validation_error", `${field} باید به‌صورت #RRGGBB باشد.`);
  return s.toLowerCase();
}
export function parseJson(s, fallback) {
  try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; }
}
