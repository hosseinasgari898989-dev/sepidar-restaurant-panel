import { ApiError, baseHeaders, applyCors, json, errorResponse } from "./lib/http.js";
import { authConfigured } from "./lib/auth.js";
import { handlePanel } from "./routes/panel.js";
import { handlePublic } from "./routes/public.js";

const SERVICE_NAME = "sepidar-restaurant-api";
const API_VERSION = "2026-10-panel-1";

function health(env) {
  const db = Boolean(env.DB);
  return {
    ok: true,
    service: SERVICE_NAME,
    version: API_VERSION,
    status: db ? "ready" : "awaiting_database",
    businessApiReady: db,
    capabilities: {
      database: db,
      panel_auth: authConfigured(env),          // فقط بله/خیر؛ هیچ مقداری از Secret افشا نمی‌شود
      orders: db, menu: db, reviews: db, review_reply: db, leads: db, reports: db,
      realtime: false,                          // دریافت سفارش فعلاً دوره‌ای (polling) است
      image_upload: false,                      // آپلود فایل نیازمند R2 است؛ فعلاً فقط آدرس عکس
      qr: Boolean(env.PUBLIC_SITE_URL),
    },
    timestamp: new Date().toISOString(),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const isPublic = url.pathname.startsWith("/api/public/");
    const headers = baseHeaders();
    if (isPublic || url.pathname === "/" || url.pathname === "/health") applyCors(headers, request, env);

    if (method === "OPTIONS") return new Response(null, { status: 204, headers });

    try {
      if (method === "GET" && (url.pathname === "/" || url.pathname === "/health")) return json(health(env), 200, { headers });
      if (url.pathname.startsWith("/api/panel/")) return await handlePanel(request, env, url);
      if (isPublic) return await handlePublic(request, env, url, headers);
      if (url.pathname === "/panel") return Response.redirect(url.origin + "/panel/", 301);
      throw new ApiError(404, "not_found", "این مسیر وجود ندارد.");
    } catch (err) {
      return errorResponse(err, headers);
    }
  },
};
