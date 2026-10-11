import { live, on as onApi } from "./api.js";
import { html, raw, $, $$, F, time, toast, busy, bindTilt, sheet } from "./ui.js";
import dashboard from "./views/dashboard.js";
import orders from "./views/orders.js";
import menu from "./views/menu.js";
import reviews from "./views/reviews.js";
import leads from "./views/leads.js";
import qr from "./views/qr.js";
import reports from "./views/reports.js";
import settings from "./views/settings.js";

const VIEWS = [dashboard, orders, menu, reviews, leads, qr, reports, settings];
const MOBILE_MAIN = ["dashboard", "orders", "menu", "reviews"];
const root = $("#root");
const POLL_MS = 15000;
const PANEL_APPEARANCE_KEY = "sepidar.panel.appearance.v1";

function readPanelAppearance() {
  try {
    const p = JSON.parse(localStorage.getItem(PANEL_APPEARANCE_KEY) || "{}");
    return {
      theme: ["light", "dark"].includes(p.theme) ? p.theme : "light",
      accent: ["orange", "mint", "violet"].includes(p.accent) ? p.accent : "orange",
    };
  } catch {
    return { theme: "light", accent: "orange" };
  }
}
function applyPanelAppearance() {
  const p = readPanelAppearance();
  document.body.dataset.theme = p.theme;
  document.body.dataset.accent = p.accent;
  document.querySelectorAll("[data-panel-theme]").forEach((b) => {
    b.classList.toggle("active", b.dataset.panelTheme === p.theme);
    b.setAttribute("aria-pressed", String(b.dataset.panelTheme === p.theme));
  });
  document.querySelectorAll("[data-panel-accent]").forEach((b) => {
    b.classList.toggle("active", b.dataset.panelAccent === p.accent);
    b.setAttribute("aria-pressed", String(b.dataset.panelAccent === p.accent));
  });
}
function savePanelAppearance(changes) {
  const p = { ...readPanelAppearance(), ...changes };
  try { localStorage.setItem(PANEL_APPEARANCE_KEY, JSON.stringify(p)); } catch {}
  applyPanelAppearance();
}
applyPanelAppearance();
root.addEventListener("click", (e) => {
  const toggle = e.target.closest("#appearanceToggle");
  if (toggle) {
    const menu = $("#appearanceMenu");
    if (menu) {
      menu.hidden = !menu.hidden;
      toggle.setAttribute("aria-expanded", String(!menu.hidden));
    }
    return;
  }
  const theme = e.target.closest("[data-panel-theme]");
  if (theme) { savePanelAppearance({ theme: theme.dataset.panelTheme }); return; }
  const accent = e.target.closest("[data-panel-accent]");
  if (accent) { savePanelAppearance({ accent: accent.dataset.panelAccent }); return; }
});
document.addEventListener("click", (e) => {
  if (e.target.closest(".appearance-control")) return;
  const menu = $("#appearanceMenu"), toggle = $("#appearanceToggle");
  if (menu && !menu.hidden) menu.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");
});

let api = live, session = null, health = null, cleanup = null, timers = [], badges = {}, lastMaxNo = null, lastSync = null, online = null;
const subs = new Set();

// ---------------------------------------------------------------- ورود
function loginScreen(notice = "") {
  stopTimers();
  session = null;
  root.innerHTML = html`
  <main class="login">
    <section class="login-art" aria-hidden="true">
      <div class="brand"><span class="mark">🍽️</span><span>سپیدار</span></div>
      <div>
        <div class="scene"><div class="plate">
          <span class="hero-dish">🍔</span>
          ${["🍕", "🥗", "🍢", "🥤", "🍰", "🌯"].map((e, i) => html`<div class="orb" style="--a:${i * 60}deg"><span>${e}</span></div>`)}
        </div></div>
        <h1>آشپزخانه شما،<br>یک نگاه، همه سفارش‌ها.</h1>
        <p>سفارش‌ها، منو، نظرات و گزارش‌های رستوران در یک پنل؛ هم‌زبان با سایت سفارش سپیدار.</p>
      </div>
      <div class="login-foot">© هلدینگ سپیدار — SEPIDAR GROUP</div>
    </section>
    <section class="login-form">
      <form class="login-box" id="lf" autocomplete="off" novalidate>
        <h2>ورود رستوران‌دار</h2>
        <p class="sub">سامانه مدیریت رستوران سپیدار · فقط برای رستوران‌های تأییدشده</p>
        <div class="srv" id="srv" role="status"><span class="dot"></span><span><b>در حال بررسی سرور…</b><span class="mut">چند لحظه صبر کنید</span></span></div>
        <label class="fld"><span>توکن دسترسی</span>
          <div class="pw"><input id="tk" type="password" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="256" aria-describedby="er" required>
          <button type="button" id="eye" aria-label="نمایش توکن" aria-pressed="false">👁️</button></div>
        </label>
        <p class="err" id="er" role="alert">${notice}</p>
        <button class="btn block" id="go" type="submit" disabled>ورود به پنل</button>
        <button class="demo-link" type="button" id="demo">مشاهده نسخه نمایشی با داده‌های ساختگی</button>
        <p class="sec-note"><span>🔒</span><span>توکن فقط در سرور بررسی می‌شود و در مرورگر ذخیره نمی‌شود. پس از ورود، یک نشست محدود ${raw("<b>۸ ساعته</b>")} ساخته می‌شود.</span></p>
      </form>
    </section>
  </main>`;
  const tk = $("#tk"), eye = $("#eye"), er = $("#er"), go = $("#go");
  eye.onclick = () => {
    const show = tk.type === "password";
    tk.type = show ? "text" : "password";
    eye.textContent = show ? "🙈" : "👁️";
    eye.setAttribute("aria-label", show ? "مخفی‌کردن توکن" : "نمایش توکن");
    eye.setAttribute("aria-pressed", String(show));
    tk.focus();
  };
  $("#demo").onclick = async (e) => { await busy(e.currentTarget, async () => { api = (await import("./demo.js")).demo; await enterApp(); }); };
  $("#lf").onsubmit = (e) => {
    e.preventDefault();
    const token = tk.value.trim();
    if (!token) { er.textContent = "توکن دسترسی را وارد کنید."; tk.focus(); return; }
    er.textContent = "";
    busy(go, async () => {
      try {
        await live.login(token);
        tk.value = "";
        api = live;
        await enterApp();
      } catch (err) {
        tk.select();
        if (err.status === 429) er.textContent = `تلاش‌های ناموفق زیاد بود. ${err.body?.retry_after ? `حدود ${F(Math.ceil(err.body.retry_after / 60))} دقیقه دیگر` : "کمی بعد"} دوباره امتحان کنید.`;
        else er.textContent = err.message;
      }
    });
  };
  checkServer();
}

async function checkServer() {
  const srv = $("#srv"), go = $("#go");
  const show = (cls, title, text, enable) => {
    if (!srv) return;
    srv.className = "srv " + cls;
    srv.innerHTML = html`<span class="dot"></span><span><b>${title}</b><span class="mut">${text}</span></span>`.s;
    go.disabled = !enable;
    go.textContent = enable ? "ورود به پنل" : "ورود هنوز فعال نیست";
  };
  try {
    health = await live.health();
    const cap = health.capabilities;
    if (!cap) return show("warn", "سرور فعال است؛ API ورود هنوز وجود ندارد", "نسخه فعلی سرور فقط اسکلت اولیه است. پس از استقرار بک‌اند پنل، ورود فعال می‌شود.", false);
    if (!cap.database) return show("warn", "سرور متصل است؛ پایگاه داده هنوز وصل نشده", "ورود و داده‌های رستوران به پایگاه داده D1 نیاز دارند.", false);
    if (!cap.panel_auth) return show("warn", "سرور متصل است؛ ورود امن پیکربندی نشده", "توکن اولیه هنوز در بخش Secrets ورکر تنظیم نشده است.", false);
    show("ok", "سرور متصل · ورود امن فعال", "توکن شما در سرور بررسی می‌شود.", true);
    // اگر نشست معتبر قبلی (کوکی HttpOnly) وجود دارد، مستقیم وارد شو
    try { await live.session(); api = live; enterApp(); } catch { /* نشست ندارد */ }
  } catch {
    show("bad", "اتصال به سرور برقرار نشد", "اینترنت یا وضعیت Worker را بررسی کنید.", false);
  }
}

// ---------------------------------------------------------------- قاب اصلی
async function enterApp() {
  try {
    session = (await api.session()).session;
  } catch (err) {
    if (api.mode === "live") return loginScreen(err.message);
    throw err;
  }
  const can = (p) => !p || session.permissions.includes(p);
  const views = VIEWS.filter((v) => can(v.perm));
  root.innerHTML = html`
  <div class="app">
    <aside class="side" aria-label="منوی اصلی">
      <div class="brand"><span class="mark">🍽️</span><span>سپیدار<small>پنل رستوران‌دار</small></span></div>
      <nav class="nav">${views.map((v) => html`<a href="#/${v.id}" data-v="${v.id}"><span class="ni">${v.icon}</span><span>${v.title}</span><span class="nb" data-b="${v.id}" hidden></span></a>`)}</nav>
      <div class="side-foot">${api.mode === "demo"
        ? html`<b>🧪 حالت نمایشی</b>داده‌ها ساختگی‌اند و ذخیره نمی‌شوند.`
        : html`<b>🔐 نشست امن</b>اعتبار تا ساعت ${time(session.expires_at)}${session.bootstrap ? html`<br><span>ورود با توکن اولیه آزمایشی</span>` : ""}`}</div>
    </aside>
    <div class="main">
      ${api.mode === "demo" ? html`<div class="demo-bar" role="note"><span>🧪 نسخه نمایشی — همه اعداد و سفارش‌ها ساختگی‌اند و هیچ تغییری روی سرور ذخیره نمی‌شود.</span><button class="btn sm ghost" id="exitDemo">خروج</button></div>` : ""}
      <header class="top">
        <div class="rest"><h1 id="rname">${session.restaurant?.name || "رستوران"}</h1><small id="vtitle"></small></div>
        <div class="sp"></div>
        <div class="conn">
          <span class="cpill" id="cSrv" title="وضعیت اتصال سرور"><i></i><span>در حال اتصال…</span></span>
          <span class="cpill opt" id="cRest"><i></i><span></span></span>
        </div>
        <div class="appearance-control">
          <button class="icon-btn appearance-toggle" type="button" id="appearanceToggle" aria-label="تنظیم ظاهر پنل" title="تنظیم ظاهر پنل" aria-expanded="false" aria-controls="appearanceMenu">🎨</button>
          <div class="appearance-menu" id="appearanceMenu" hidden>
            <b class="appearance-title">ظاهر پنل مدیریت</b>
            <span class="appearance-label">حالت نمایش</span>
            <div class="appearance-options" role="group" aria-label="حالت نمایش">
              <button type="button" data-panel-theme="light">☀️ روشن</button>
              <button type="button" data-panel-theme="dark">🌙 تاریک</button>
            </div>
            <span class="appearance-label">رنگ سراسری</span>
            <div class="appearance-colors" role="group" aria-label="رنگ سراسری">
              <button type="button" data-panel-accent="orange"><i></i> نارنجی</button>
              <button type="button" data-panel-accent="mint"><i></i> سبز نعنایی</button>
              <button type="button" data-panel-accent="violet"><i></i> بنفش</button>
            </div>
            <p>انتخاب رنگ روی پس‌زمینه، کارت‌ها، منو و دکمه‌های پنل اعمال می‌شود.</p>
          </div>
        </div>
        <button class="icon-btn" id="out" aria-label="خروج از حساب" title="خروج">⎋</button>
      </header>
      <main class="view" id="view" tabindex="-1"></main>
    </div>
    <nav class="bnav" aria-label="ناوبری">
      ${views.filter((v) => MOBILE_MAIN.includes(v.id)).map((v) => html`<a href="#/${v.id}" data-v="${v.id}"><span class="ni">${v.icon}</span>${v.short || v.title}<span class="nb" data-b="${v.id}" hidden></span></a>`)}
      <button id="more" data-v="more"><span class="ni">☰</span>بیشتر</button>
    </nav>
  </div>`;
  applyPanelAppearance();
  const ctx = makeCtx(views, can);
  $("#out").onclick = (e) => busy(e.currentTarget, logout);
  $("#exitDemo") && ($("#exitDemo").onclick = () => { location.hash = ""; location.reload(); });
  $("#more").onclick = () => {
    const s = sheet(html`<h3 style="margin-bottom:12px">بخش‌های دیگر</h3><div class="nav more-nav">${views.filter((v) => !MOBILE_MAIN.includes(v.id)).map((v) => html`<a href="#/${v.id}" data-v="${v.id}" class="chip" style="justify-content:flex-start;min-height:52px;font-size:15px"><span class="ni">${v.icon}</span>${v.title}</a>`)}</div>`, { label: "بخش‌های دیگر" });
    s.body.onclick = (e) => e.target.closest("a") && s.close();
  };
  bindTilt(root);
  window.onhashchange = () => route(views, ctx);
  route(views, ctx);
  setRestPill(session.restaurant);
  startTimers(ctx);
}

function makeCtx(views, can) {
  return {
    get api() { return api; }, get session() { return session; }, get health() { return health; }, can,
    demo: api.mode === "demo",
    go: (id) => (location.hash = "#/" + id),
    onOrders: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    setBadge, setRestPill, refresh: () => poll(true),
    capability: (k) => api.mode === "demo" ? true : Boolean(health?.capabilities?.[k]),
  };
}

function route(views, ctx) {
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const v = views.find((x) => x.id === id) || views[0];
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  $$("[data-v]").forEach((a) => a.classList.toggle("on", a.dataset.v === v.id));
  $("#vtitle").textContent = v.title;
  document.title = `${v.title} | پنل سپیدار`;
  const el = $("#view");
  el.innerHTML = "";
  el.scrollTop = 0;
  window.scrollTo(0, 0);
  cleanup = v.render(el, ctx) || null;
}

function setBadge(id, n) {
  badges[id] = n;
  $$(`[data-b="${id}"]`).forEach((b) => { b.hidden = !n; b.textContent = F(n); });
}
function setRestPill(r) {
  const el = $("#cRest");
  if (!el || !r) return;
  const st = r.status === "open" && r.accepting_orders !== false && r.accepting_orders !== 0 ? ["ok", "رستوران باز است"] : r.status === "paused" ? ["warn", "پذیرش موقتاً متوقف"] : r.status === "open" ? ["warn", "باز · بدون پذیرش سفارش"] : ["bad", "رستوران بسته است"];
  el.className = "cpill opt " + st[0];
  el.querySelector("span").textContent = st[1];
  if (r.name) $("#rname").textContent = r.name;
}
function setConn(ok, msg) {
  const el = $("#cSrv");
  if (!el) return;
  el.className = "cpill " + (ok ? "ok" : "bad");
  el.querySelector("span").textContent = msg;
}

// ---------------------------------------------------------------- دریافت دوره‌ای
async function poll(force) {
  if (!session || (!force && document.hidden)) return;
  try {
    const d = await api.dashboard();
    lastSync = Date.now();
    setBadge("orders", d.stats.new);
    const maxNo = Math.max(0, ...d.recent.map((o) => o.number));
    if (lastMaxNo != null && maxNo > lastMaxNo) {
      const fresh = d.recent.filter((o) => o.number > lastMaxNo);
      toast(`🛎️ ${fresh.length > 1 ? `${F(fresh.length)} سفارش جدید` : `سفارش جدید #${F(fresh[0].number)}`} رسید`, "info", 5000);
    }
    const changed = lastMaxNo != null && maxNo !== lastMaxNo;
    lastMaxNo = maxNo;
    setConn(true, api.mode === "demo" ? `نمایشی · ${time(lastSync)}` : `متصل · آخرین دریافت ${time(lastSync)}`);
    subs.forEach((fn) => fn({ changed, stats: d.stats }));
  } catch (err) {
    if (err.status === 401) return;
    setConn(false, err.kind === "network" ? `قطع اتصال${lastSync ? ` · آخرین دریافت ${time(lastSync)}` : ""}` : "خطای سرور");
  }
}
function startTimers() {
  stopTimers();
  poll(true);
  timers.push(setInterval(poll, POLL_MS));
  document.addEventListener("visibilitychange", onVis);
}
const onVis = () => !document.hidden && poll(true);
function stopTimers() {
  timers.forEach(clearInterval);
  timers = [];
  lastMaxNo = null;
  subs.clear();
  document.removeEventListener("visibilitychange", onVis);
}

async function logout() {
  try { await api.logout(); } catch { /* حتی اگر سرور در دسترس نبود، رابط پاک می‌شود */ }
  if (api.mode === "demo") { location.hash = ""; location.reload(); return; }
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  api = live;
  location.hash = "";
  loginScreen();
  toast("از حساب خارج شدید.");
}

onApi("unauth", () => { if (session && api.mode === "live") { if (cleanup) { try { cleanup(); } catch {} cleanup = null; } loginScreen("نشست شما به پایان رسید. دوباره وارد شوید."); } });
onApi("net", (e) => { if (!e.online && session) setConn(false, `قطع اتصال${lastSync ? ` · آخرین دریافت ${time(lastSync)}` : ""}`); });
window.addEventListener("offline", () => session && setConn(false, "اینترنت دستگاه قطع است"));
window.addEventListener("online", () => session && poll(true));

loginScreen();
