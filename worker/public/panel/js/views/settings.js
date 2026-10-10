import { html, time, dateTime, skeleton, errorBox, busy, toast, confirmBox } from "../ui.js";

export default {
  id: "settings", title: "تنظیمات رستوران", short: "تنظیمات", icon: "⚙️", perm: "settings",
  render(el, ctx) {
    el.innerHTML = html`<div class="view-h"><div><h2>تنظیمات رستوران</h2><p>اطلاعات متعلق به رستورانی که با آن وارد شده‌اید</p></div></div><div id="sb">${skeleton(2, 200)}</div>`.s;
    async function load() {
      const sb = el.querySelector("#sb");
      try {
        const { restaurant: r, public_site_url } = await ctx.api.settings();
        sb.innerHTML = html`<div class="grid g2">
          <form class="card" id="f" novalidate><div class="card-h"><h3>🏪 اطلاعات عمومی</h3></div>
            <div class="form-grid">
              <label class="fld"><span>نام رستوران</span><input name="name" value="${r.name}" maxlength="60" required></label>
              <label class="fld"><span>شماره تماس عمومی</span><input name="phone" value="${r.phone || ""}" maxlength="30" inputmode="tel"></label>
              <label class="fld full"><span>نشانی</span><input name="address" value="${r.address || ""}" maxlength="200"></label>
              <label class="fld"><span>ساعات کاری</span><input name="hours" value="${r.hours || ""}" maxlength="120" placeholder="مثلاً ۱۲ تا ۲۳"></label>
              <label class="fld"><span>معرفی کوتاه <small>(اختیاری)</small></span><input name="about" value="${r.about || ""}" maxlength="300"></label>
            </div>
            <div class="section-t">🚦 وضعیت فعالیت</div>
            <div class="stat-seg">${[["open", "🟢 باز"], ["paused", "⏸️ توقف موقت"], ["closed", "🔴 بسته"]].map(([v, l]) => html`<label><input type="radio" name="status" value="${v}" ${r.status === v ? "checked" : ""}>${l}</label>`)}</div>
            <div style="margin-top:12px"><button type="button" class="tog" role="switch" aria-checked="${!!r.accepting_orders}" id="acc"><i></i>پذیرش سفارش آنلاین</button></div>
            <p class="err" id="fe"></p>
            <div class="row-btns"><button class="btn" id="sv">ذخیره تنظیمات</button></div>
          </form>
          <div class="grid" style="align-content:start">
            <section class="card"><div class="card-h"><h3>🔐 نشست و دسترسی</h3></div>
              <dl class="kv"><dt>شناسه رستوران</dt><dd dir="ltr" style="text-align:right">${r.id}</dd><dt>نقش</dt><dd>${ctx.session.role === "platform_admin" ? "مدیر سپیدار (توکن اولیه)" : "رستوران‌دار"}</dd><dt>اعتبار نشست</dt><dd>تا ${time(ctx.session.expires_at)}</dd><dt>آخرین به‌روزرسانی</dt><dd>${r.updated_at ? dateTime(r.updated_at) : "—"}</dd></dl>
              ${ctx.session.bootstrap ? html`<div class="note-box warn" style="margin:12px 0 0">⚠️ <span>ورود با توکن اولیه آزمایشی انجام شده است. پیش از استفاده واقعی، توکن را عوض کنید و حساب‌های مدیریتی جداگانه بسازید.</span></div>` : ""}
              <div class="row-btns"><button class="btn danger ghost" id="all">خروج از همه دستگاه‌ها</button></div></section>
            <section class="card"><div class="card-h"><h3>🌐 سایت مشتریان</h3></div>
              <p style="margin:0;font-size:14px">${public_site_url ? html`<a href="${public_site_url}" target="_blank" rel="noopener noreferrer" dir="ltr">${public_site_url}</a>` : "هنوز تنظیم نشده"}</p>
              <p class="mut" style="font-size:12.5px;margin:6px 0 0">این آدرس فقط از تنظیمات سرور (PUBLIC_SITE_URL) تغییر می‌کند.</p></section>
          </div></div>`.s;
        let acc = !!r.accepting_orders;
        const accBtn = el.querySelector("#acc");
        accBtn.onclick = () => { acc = !acc; accBtn.setAttribute("aria-checked", acc); };
        el.querySelector("#f").onsubmit = (e) => {
          e.preventDefault();
          const f = e.target, fe = el.querySelector("#fe");
          if (f.name.value.trim().length < 2) return (fe.textContent = "نام رستوران الزامی است.");
          const body = { name: f.name.value.trim(), phone: f.phone.value.trim(), address: f.address.value.trim(), hours: f.hours.value.trim(), about: f.about.value.trim(), status: f.status.value, accepting_orders: acc };
          busy(el.querySelector("#sv"), async () => {
            try {
              if (body.status !== r.status && body.status !== "open" && !(await confirmBox({ title: "تغییر وضعیت رستوران؟", text: "با بستن یا توقف موقت، سایت مشتریان سفارش جدید نمی‌پذیرد.", ok: "تأیید" }))) return;
              const d = await ctx.api.updateSettings(body);
              fe.textContent = "";
              toast("تنظیمات ذخیره شد");
              ctx.setRestPill(d.restaurant);
              Object.assign(r, d.restaurant);
            } catch (err) { fe.textContent = err.message; }
          });
        };
        el.querySelector("#all").onclick = async (e) => {
          const btn = e.currentTarget;
          if (!(await confirmBox({ title: "خروج از همه دستگاه‌ها؟", text: "همه نشست‌های فعال این رستوران، از جمله همین نشست، فوراً در سرور باطل می‌شوند.", ok: "بله، همه خارج شوند", danger: true }))) return;
          busy(btn, async () => { try { await ctx.api.logoutAll(); toast("همه نشست‌ها لغو شد"); setTimeout(() => location.reload(), 600); } catch (err) { toast(err.message, "err"); } });
        };
      } catch (err) { sb.innerHTML = errorBox(err).s; sb.querySelector("[data-retry]")?.addEventListener("click", load); }
    }
    load();
  },
};
