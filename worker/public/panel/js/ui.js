// ابزارهای رابط کاربری: قالب امن HTML، قالب‌بندی فارسی، اعلان، پنجره، تأیید
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
// همه مقادیر درون‌گذاری‌شده به‌صورت پیش‌فرض escape می‌شوند (در برابر XSS از داده‌های مشتری)
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    out += Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("") : v instanceof Raw ? v.s : v === false || v == null ? "" : esc(v);
    out += strings[i + 1];
  });
  return raw(out);
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---- قالب‌بندی ----
const nf = new Intl.NumberFormat("fa-IR");
export const F = (n) => nf.format(n ?? 0);
export const money = (n) => `${F(n)} تومان`;
export const time = (ts) => new Date(ts).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" });
export const date = (ts, o = {}) => new Date(ts).toLocaleDateString("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "long", day: "numeric", ...o });
export const dateTime = (ts) => `${date(ts, { year: "numeric" })} · ${time(ts)}`;
export function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return "همین حالا";
  const m = Math.round(s / 60);
  if (m < 60) return `${F(m)} دقیقه پیش`;
  const h = Math.round(m / 60);
  if (h < 24) return `${F(h)} ساعت پیش`;
  return date(ts);
}
export const toEnDigits = (s) => String(s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

export const STATUS = {
  new: { label: "جدید", icon: "🛎️", cls: "s-new" },
  preparing: { label: "در حال آماده‌سازی", icon: "🔥", cls: "s-prep" },
  ready: { label: "آماده تحویل", icon: "✅", cls: "s-ready" },
  delivered: { label: "تحویل‌داده‌شده", icon: "📦", cls: "s-done" },
  cancelled: { label: "لغوشده", icon: "✕", cls: "s-cancel" },
};
export const NEXT_LABEL = { preparing: "شروع آماده‌سازی", ready: "آماده شد", delivered: "تحویل داده شد", cancelled: "لغو سفارش" };
export const pill = (st) => html`<span class="pill ${STATUS[st]?.cls || ""}">${STATUS[st]?.label || st}</span>`;

// کاشی سه‌بعدی غذا (هم‌زبان با .ph/.fe سایت مشتری)
export const tile = (emoji, colors = ["#ffe0c2", "#ffb36b"], { size = "", img = "" } = {}) =>
  html`<span class="tile3d ${size}" style="--c1:${safeColor(colors[0])};--c2:${safeColor(colors[1])}">${img ? html`<img src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="fe">${emoji || "🍽️"}</span></span>`;
export const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : "#ffd9bf");

export function stars(n, max = 5) {
  return html`<span class="stars" role="img" aria-label="${F(n)} از ${F(max)} ستاره">${Array.from({ length: max }, (_, i) => html`<i class="${i < n ? "on" : ""}">★</i>`)}</span>`;
}

// ---- اعلان ----
let toastWrap;
export function toast(msg, kind = "ok", ms = 3200) {
  toastWrap ||= document.body.appendChild(Object.assign(document.createElement("div"), { className: "toasts", role: "status", ariaLive: "polite" }));
  const t = document.createElement("div");
  t.className = `toast t-${kind}`;
  t.innerHTML = html`<span class="ti">${kind === "err" ? "⚠️" : kind === "info" ? "ℹ️" : "✓"}</span><span>${msg}</span>`.s;
  toastWrap.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, ms);
}

// ---- پنجره (sheet) ----
const stack = [];
export function sheet(content, { wide = false, label = "پنجره", onClose } = {}) {
  const ov = document.createElement("div");
  ov.className = "ov";
  ov.innerHTML = `<div class="sh${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1"><button class="sh-x" data-close aria-label="بستن">✕</button><div class="sh-body"></div></div>`;
  const body = ov.querySelector(".sh-body");
  const prevFocus = document.activeElement;
  const api = {
    el: ov, body,
    set(c) { body.innerHTML = String(c); },
    close() {
      if (!ov.isConnected) return;
      ov.classList.add("closing");
      setTimeout(() => ov.remove(), 180);
      stack.splice(stack.indexOf(api), 1);
      document.removeEventListener("keydown", onKey);
      if (!stack.length) document.body.classList.remove("locked");
      prevFocus && prevFocus.focus && prevFocus.focus();
      onClose && onClose();
    },
  };
  const onKey = (e) => { if (e.key === "Escape" && stack[stack.length - 1] === api) api.close(); };
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) api.close(); });
  document.addEventListener("keydown", onKey);
  api.set(content);
  document.body.appendChild(ov);
  document.body.classList.add("locked");
  stack.push(api);
  requestAnimationFrame(() => { ov.classList.add("on"); ov.querySelector(".sh").focus(); });
  return api;
}

export function confirmBox({ title, text, ok = "تأیید", danger = false, input = null }) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet(html`<div class="confirm">
      <div class="cf-ic ${danger ? "danger" : ""}">${danger ? "⚠️" : "❓"}</div>
      <h3>${title}</h3><p class="mut">${text}</p>
      ${input ? html`<label class="fld"><span>${input.label}</span><textarea rows="2" maxlength="${input.max || 200}" data-in placeholder="${input.placeholder || ""}"></textarea></label><p class="err" data-err></p>` : ""}
      <div class="row-btns"><button class="btn ${danger ? "danger" : ""}" data-ok>${ok}</button><button class="btn ghost" data-close>انصراف</button></div>
    </div>`, { label: title, onClose: () => !done && resolve(null) });
    s.body.querySelector("[data-ok]").onclick = () => {
      let v = true;
      if (input) {
        v = s.body.querySelector("[data-in]").value.trim();
        if (input.required && v.length < 2) { s.body.querySelector("[data-err]").textContent = "این بخش الزامی است."; return; }
      }
      done = true; resolve(v); s.close();
    };
  });
}

// جلوگیری از ارسال تکراری: دکمه تا پایان عملیات قفل می‌شود
export async function busy(btn, fn) {
  if (!btn || btn.dataset.busy) return;
  btn.dataset.busy = "1";
  btn.disabled = true;
  btn.classList.add("loading");
  try { return await fn(); } finally { delete btn.dataset.busy; btn.disabled = false; btn.classList.remove("loading"); }
}

export const skeleton = (n = 3, h = 72) => html`<div class="skel-wrap">${Array.from({ length: n }, () => html`<div class="skel" style="height:${h}px"></div>`)}</div>`;
export const empty = (icon, title, text = "") => html`<div class="empty"><div class="empty-ic">${icon}</div><b>${title}</b>${text ? html`<p>${text}</p>` : ""}</div>`;
export function errorBox(err, retry = true) {
  const pending = err && (err.code === "not_implemented" || err.code === "db_not_configured" || err.code === "auth_not_configured");
  return html`<div class="errbox ${pending ? "pending" : ""}">
    <div class="empty-ic">${pending ? "🧩" : "📡"}</div>
    <b>${pending ? "در انتظار تکمیل بک‌اند" : "دریافت اطلاعات انجام نشد"}</b>
    <p>${err?.message || "خطای ناشناخته"}</p>
    ${retry ? html`<button class="btn ghost sm" data-retry>تلاش دوباره</button>` : ""}
  </div>`;
}

// کج‌شدن سه‌بعدی کارت‌ها با حرکت اشاره‌گر
export function bindTilt(root) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(hover: none)").matches) return;
  root.addEventListener("pointermove", (e) => {
    const c = e.target.closest("[data-tilt]");
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    c.style.setProperty("--ty", `${(-x * 10).toFixed(2)}deg`);
    c.style.setProperty("--tx", `${(y * 8).toFixed(2)}deg`);
  });
  root.addEventListener("pointerout", (e) => {
    const c = e.target.closest("[data-tilt]");
    if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty("--tx"); c.style.removeProperty("--ty"); }
  });
}
