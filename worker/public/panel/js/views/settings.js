import { html, time, dateTime, skeleton, errorBox, busy, toast, confirmBox } from "../ui.js";

export default {
  id: "settings", title: "تنظیمات رستوران", short: "تنظیمات", icon: "⚙️", perm: "settings",
  render(el, ctx) {
    const canManageTokens = ctx.api.mode === "live" && ctx.session.role === "platform_admin" && (ctx.session.permissions || []).includes("platform_settings");
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
              <dl class="kv"><dt>شناسه رستوران</dt><dd dir="ltr" style="text-align:right">${r.id}</dd><dt>نقش</dt><dd>${ctx.session.role === "platform_admin" ? (ctx.session.bootstrap ? "مدیر سپیدار (توکن اولیه)" : "مدیر سپیدار") : "رستوران‌دار"}</dd><dt>اعتبار نشست</dt><dd>تا ${time(ctx.session.expires_at)}</dd><dt>آخرین به‌روزرسانی</dt><dd>${r.updated_at ? dateTime(r.updated_at) : "—"}</dd></dl>
              ${ctx.session.bootstrap ? html`<div class="note-box warn" style="margin:12px 0 0">⚠️ <span>ورود با توکن اولیه آزمایشی انجام شده است. پیش از استفاده واقعی، توکن را عوض کنید و حساب‌های مدیریتی جداگانه بسازید.</span></div>` : ""}
              <div class="row-btns"><button class="btn danger ghost" id="all">خروج از همه دستگاه‌ها</button></div></section>
            <section class="card"><div class="card-h"><h3>🌐 سایت مشتریان</h3></div>
              <p style="margin:0;font-size:14px">${public_site_url ? html`<a href="${public_site_url}" target="_blank" rel="noopener noreferrer" dir="ltr">${public_site_url}</a>` : "هنوز تنظیم نشده"}</p>
              <p class="mut" style="font-size:12.5px;margin:6px 0 0">این آدرس فقط از تنظیمات سرور (PUBLIC_SITE_URL) تغییر می‌کند.</p></section>
          </div></div>
          ${canManageTokens ? html`
            <section class="card token-manager" id="tokenManager" aria-labelledby="tokenManagerTitle">
              <div class="card-h token-manager-head">
                <div><h3 id="tokenManagerTitle">🔑 مدیریت توکن‌های ورود</h3><p>توکن بساز، اعتبارش را انتخاب کن و هر زمان لازم بود دسترسی‌اش را لغو کن.</p></div>
              </div>
              <div class="token-create-grid">
                <form id="tokenForm" class="token-create-form" novalidate>
                  <label class="fld"><span>نام توکن</span><input name="label" maxlength="80" minlength="2" required placeholder="مثلاً مدیریت اصلی یا گوشی من"></label>
                  <label class="fld"><span>سطح دسترسی</span><select name="role"><option value="platform_admin">مدیر سپیدار — دسترسی کامل</option><option value="owner">رستوران‌دار — دسترسی محدود</option></select></label>
                  <label class="fld"><span>مدت اعتبار توکن</span><select name="duration"><option value="1h">۱ ساعت</option><option value="1d">۱ روز</option><option value="1y">۱ سال</option><option value="never" selected>دائمی — تا زمان لغو</option></select></label>
                  <button class="btn" id="createAccessToken" type="submit">＋ افزودن توکن</button>
                  <p class="token-help">مقدار کامل توکن فقط یک بار پس از ساخت نشان داده می‌شود. آن را در جای امن نگه دار. نشست ورود توکن‌های مدیریتی حداکثر ۳۰ روزه است، اما خود توکن تا پایان اعتبار انتخابی باقی می‌ماند.</p>
                  <p class="err" id="tokenFormError" role="alert"></p>
                </form>
                <div class="token-created" id="tokenCreated" hidden role="status" aria-live="polite">
                  <strong>توکن ساخته شد — فقط همین‌بار نمایش داده می‌شود</strong>
                  <code id="newAccessToken" dir="ltr"></code>
                  <div class="row-btns"><button class="btn" type="button" id="copyAccessToken">کپی توکن</button><button class="btn ghost" type="button" id="hideAccessToken">پنهان کردن</button></div>
                  <small>اگر این صفحه را ببندی یا دوباره بارگذاری کنی، مقدار کامل قابل بازیابی نیست؛ در صورت گم شدن، یک توکن جدید بساز.</small>
                </div>
              </div>
              <div class="token-list-head"><h4>توکن‌های ثبت‌شده</h4><button type="button" class="btn ghost sm" id="reloadAccessTokens">↻ تازه‌سازی</button></div>
              <div id="accessTokenRows"><p class="mut">در حال دریافت توکن‌ها…</p></div>
              <p class="token-help token-bottom-note">لغو توکن فوراً ورودهای فعلی وابسته به آن را هم باطل می‌کند. توکن جاری را نمی‌توانی از همان نشست لغو کنی؛ ابتدا با توکن دیگری وارد شو.</p>
            </section>` : ""}
          `.s;
        if (canManageTokens) setupTokenManager();
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

    function setupTokenManager() {
      const box = el.querySelector("#tokenManager");
      if (!box) return;
      const form = box.querySelector("#tokenForm");
      const rows = box.querySelector("#accessTokenRows");
      const once = box.querySelector("#tokenCreated");
      const rawToken = box.querySelector("#newAccessToken");
      const error = box.querySelector("#tokenFormError");

      const fmtExpiry = (t) => !t.expires_at ? "دائمی" : t.expires_at <= Date.now() ? "منقضی‌شده" : dateTime(t.expires_at);
      const status = (t) => t.revoked_at
        ? ["لغوشده", "revoked"]
        : t.expires_at && t.expires_at <= Date.now()
          ? ["منقضی‌شده", "expired"]
          : t.is_current
            ? ["در حال استفاده", "current"]
            : ["فعال", "active"];

      async function refreshTokens() {
        rows.innerHTML = '<p class="mut">در حال دریافت توکن‌ها…</p>';
        try {
          const data = await ctx.api.accessTokens();
          if (!data.tokens?.length) {
            rows.innerHTML = '<div class="token-empty">هنوز توکنی ساخته نشده است. از فرم بالا اولین توکن را بساز.</div>';
            return;
          }
          rows.innerHTML = html`${data.tokens.map((t) => {
            const st = status(t);
            const roleLabel = t.role === "platform_admin" ? "مدیر سپیدار" : "رستوران‌دار";
            const canRevoke = !t.revoked_at && !(t.expires_at && t.expires_at <= Date.now()) && !t.is_current;
            return html`<article class="token-row">
              <div class="token-row-main">
                <div class="token-row-title"><strong>${t.label}</strong><span class="token-state ${st[1]}">${st[0]}</span></div>
                <code class="token-prefix" dir="ltr">${t.token_prefix}</code>
                <div class="token-metadata"><span>${roleLabel}</span><span>اعتبار: ${fmtExpiry(t)}</span><span>ساخته‌شده: ${dateTime(t.created_at)}</span><span>آخرین استفاده: ${t.last_used_at ? dateTime(t.last_used_at) : "هنوز استفاده نشده"}</span></div>
                ${t.is_current ? html`<small class="token-current-note">این توکن، نشست فعلی را ایجاد کرده است.</small>` : ""}
              </div>
              <button type="button" class="btn danger ghost sm token-revoke" data-revoke-token="${t.id}" ${canRevoke ? "" : "disabled"}>${t.revoked_at ? "لغو شده" : canRevoke ? "لغو توکن" : t.is_current ? "توکن جاری" : "منقضی‌شده"}</button>
            </article>`;
          })}`.s;
          rows.querySelectorAll("[data-revoke-token]").forEach((button) => {
            button.onclick = async () => {
              const id = button.dataset.revokeToken;
              if (!(await confirmBox({ title: "لغو این توکن؟", text: "این توکن دیگر برای ورود کار نمی‌کند و نشست‌های فعال وابسته به آن هم فوراً باطل می‌شوند. این عمل برگشت‌پذیر نیست.", ok: "بله، لغو کن", danger: true }))) return;
              busy(button, async () => {
                try { await ctx.api.revokeAccessToken(id); toast("توکن لغو شد"); await refreshTokens(); }
                catch (err) { toast(err.message, "err"); }
              });
            };
          });
        } catch (err) {
          rows.innerHTML = '<p class="err" role="alert"></p>';
          rows.querySelector(".err").textContent = err.message || "دریافت توکن‌ها ناموفق بود.";
        }
      }

      form.onsubmit = (e) => {
        e.preventDefault();
        error.textContent = "";
        const label = form.querySelector('[name="label"]').value.trim();
        const role = form.querySelector('[name="role"]').value;
        const duration = form.querySelector('[name="duration"]').value;
        if (label.length < 2) { error.textContent = "برای توکن یک نام حداقل دو حرفی بنویس."; return; }
        const btn = form.querySelector("#createAccessToken");
        busy(btn, async () => {
          try {
            const data = await ctx.api.createAccessToken({ label, role, duration });
            rawToken.textContent = data.token.token;
            once.hidden = false;
            form.querySelector('[name="label"]').value = "";
            toast("توکن ساخته شد؛ همین حالا آن را کپی کن.");
            await refreshTokens();
          } catch (err) { error.textContent = err.message || "ساخت توکن ناموفق بود."; }
        });
      };

      box.querySelector("#copyAccessToken").onclick = async () => {
        const value = rawToken.textContent || "";
        if (!value) return;
        try { await navigator.clipboard.writeText(value); toast("توکن کپی شد"); }
        catch {
          const range = document.createRange(); range.selectNodeContents(rawToken);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
          toast("توکن انتخاب شد؛ گزینه کپی را بزن.", "info");
        }
      };
      box.querySelector("#hideAccessToken").onclick = () => { rawToken.textContent = ""; once.hidden = true; };
      box.querySelector("#reloadAccessTokens").onclick = refreshTokens;
      refreshTokens();
    }

    load();
  },
};
