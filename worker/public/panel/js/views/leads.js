import { html, F, date, ago, dateTime, skeleton, errorBox, empty, sheet, busy, toast } from "../ui.js";

const ST = { new: ["جدید", "s-new"], reviewing: ["در حال بررسی", "s-prep"], approved: ["تأییدشده", "s-ready"], rejected: ["ردشده", "s-cancel"] };

export default {
  id: "leads", title: "درخواست‌های همکاری", short: "همکاری", icon: "🤝", perm: "leads",
  render(el, ctx) {
    let status = "all";
    el.innerHTML = html`
      <div class="view-h"><div><h2>درخواست‌های همکاری</h2><p>فرم «درخواست مشاوره و دریافت کد دسترسی» سایت مشتریان</p></div></div>
      <div class="note-box">🔒 <span>این بخش فقط برای مدیر سپیدار است. شماره‌ها در فهرست پوشیده‌اند و مشاهده کامل هر درخواست در سابقه ثبت می‌شود. از این اطلاعات فقط برای پاسخ به همان درخواست استفاده کنید.</span></div>
      <div class="chips" id="fl"></div><div id="ls" style="margin-top:8px">${skeleton(3, 64)}</div>`.s;
    async function load() {
      try {
        const d = await ctx.api.leads({ status });
        const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
        el.querySelector("#fl").innerHTML = [["all", "همه", total], ...Object.entries(ST).map(([k, v]) => [k, v[0], d.counts[k] || 0])].map(([k, l, n]) => html`<button class="chip ${k === status ? "on" : ""}" data-f="${k}">${l}<span class="ct num">${F(n)}</span></button>`.s).join("");
        el.querySelector("#ls").innerHTML = (d.leads.length ? html`<div class="olist">${d.leads.map((l) => html`<button class="orow" data-id="${l.id}" style="grid-template-columns:auto 1fr auto auto">
          <span class="tile3d sm" style="--c1:#fff3e8;--c2:#ffd0a8"><span class="fe">🏪</span></span>
          <span class="what"><span><b>${l.restaurant_name}</b> · <span dir="ltr" class="num">${l.phone_masked}</span>${l.has_note ? " · 📝" : ""}</span></span>
          <span class="mut" style="font-size:12.5px">${ago(l.created_at)}</span><span class="pill ${ST[l.status][1]}">${ST[l.status][0]}</span></button>`)}</div>`
          : empty("🤝", "درخواستی ثبت نشده", "درخواست‌های فرم همکاری سایت مشتریان اینجا نمایش داده می‌شوند.")).s;
      } catch (err) { el.querySelector("#ls").innerHTML = errorBox(err).s; }
    }
    el.onclick = (e) => {
      const f = e.target.closest("[data-f]"); if (f) { status = f.dataset.f; return load(); }
      if (e.target.closest("[data-retry]")) return load();
      const r = e.target.closest("[data-id]"); if (r) open(r.dataset.id);
    };
    async function open(id) {
      const s = sheet(skeleton(3, 50), { label: "جزئیات درخواست" });
      try {
        const { lead: l } = await ctx.api.lead(id);
        s.set(html`<h3 style="font-size:20px;padding-left:44px">🏪 ${l.restaurant_name}</h3>
          <dl class="kv" style="margin:14px 0"><dt>شماره تماس</dt><dd dir="ltr" style="text-align:right"><a href="tel:${l.phone}">${l.phone}</a></dd><dt>زمان ثبت</dt><dd>${dateTime(l.created_at)}</dd><dt>توضیحات</dt><dd>${l.note || "—"}</dd></dl>
          <label class="fld"><span>وضعیت بررسی</span><select id="st">${Object.entries(ST).map(([k, v]) => html`<option value="${k}" ${k === l.status ? "selected" : ""}>${v[0]}</option>`)}</select></label>
          <label class="fld"><span>یادداشت داخلی <small>(فقط در پنل دیده می‌شود)</small></span><textarea id="nt" rows="3" maxlength="500">${l.internal_note || ""}</textarea></label>
          <p class="mut" style="font-size:12.5px">پس از تأیید، کد/حساب دسترسی رستوران باید از مسیر امن سرور صادر شود؛ این قابلیت هنوز در بک‌اند پیاده‌سازی نشده است.</p>
          <div class="actbar"><button class="btn" id="sv">ذخیره</button></div>`);
        s.body.querySelector("#sv").onclick = (e) => busy(e.currentTarget, async () => {
          try { await ctx.api.updateLead(id, { status: s.body.querySelector("#st").value, internal_note: s.body.querySelector("#nt").value }); toast("ذخیره شد"); s.close(); load(); }
          catch (err) { toast(err.message, "err"); }
        });
      } catch (err) { s.set(errorBox(err, false)); }
    }
    load();
  },
};
