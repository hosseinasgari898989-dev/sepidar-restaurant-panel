import { ApiError, baseHeaders, applyCors, json, errorResponse } from "./lib/http.js";
import { authConfigured } from "./lib/auth.js";
import { handlePanel } from "./routes/panel.js";
import { handlePublic } from "./routes/public.js";
import { PANEL_OVERRIDES } from "./lib/panel-overrides.js";

const PANEL_SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-src https://hosseinasgari898989-dev.github.io; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cache-Control": "no-cache",
};

const SERVICE_NAME = "sepidar-restaurant-panel";
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
      if (method === "GET" && url.pathname.startsWith("/panel/")) {
        const override = PANEL_OVERRIDES.get(url.pathname);
        if (override) {
          const panelHeaders = new Headers(PANEL_SECURITY_HEADERS);
          panelHeaders.set("Content-Type", override.contentType);
          return new Response(override.body, { status: 200, headers: panelHeaders });
        }
        if (env.ASSETS) return env.ASSETS.fetch(request);
      }
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
