import { html, skeleton, errorBox, empty, toast } from "../ui.js";
import { drawQr } from "../qr.js";

export default {
  id: "qr", title: "QR Code رستوران", short: "QR", icon: "🔳", perm: "restaurant",
  render(el, ctx) {
    el.innerHTML = html`<div class="view-h"><div><h2>QR Code اختصاصی</h2><p>برای میزها، ویترین و منوی چاپی</p></div></div><div id="qb">${skeleton(1, 360)}</div>`.s;
    async function load() {
      const qb = el.querySelector("#qb");
      try {
        const d = await ctx.api.qr();
        if (!d.configured) {
          qb.innerHTML = empty("🧩", "آدرس عمومی سایت مشتریان هنوز تنظیم نشده", "تا وقتی آدرس نهایی و شناسه رستوران در سرور مشخص نشود، QR ساخته نمی‌شود تا به مقصد نامعتبر نرود.").s;
          return;
        }
        qb.innerHTML = html`<div class="qr-wrap">
          <div><div class="qr-card" data-tilt><canvas id="cv" aria-label="QR Code منوی رستوران" role="img"></canvas><div class="cap">برای سفارش اسکن کنید</div><div class="mut" style="font-size:12.5px">${ctx.session.restaurant?.name || ""}</div></div></div>
          <div class="grid" style="align-content:start">
            ${d.demo ? html`<div class="note-box warn">🧪 <span>این QR در حالت نمایشی ساخته شده است؛ برای چاپ از نسخه واقعی پس از ورود استفاده کنید.</span></div>` : ""}
            <section class="card"><div class="card-h"><h3>🔗 آدرس مقصد</h3></div>
              <div class="urlbox"><code id="u">${d.target_url}</code><button class="btn sm soft" id="cp">کپی لینک</button></div>
              <p class="mut" style="font-size:13px;margin:10px 0 0">شناسه رستوران <b dir="ltr">${d.restaurant_id}</b> توسط سرور و براساس نشست شما تعیین شده است.</p>
              ${d.customer_reads_param === false ? html`<div class="note-box warn" style="margin:10px 0 0">⚠️ <span>سایت مشتریان هنوز پارامتر <code dir="ltr">?r=</code> را نمی‌خواند و منوی داخل خودش را نشان می‌دهد. پس از اتصال سایت مشتری به منوی سرور، QR بدون تغییر کار می‌کند.</span></div>` : ""}
              <div class="row-btns" style="justify-content:flex-start"><button class="btn" id="dl">⬇️ دریافت تصویر PNG</button>${d.demo ? html`<button class="btn ghost" type="button" disabled>باز کردن صفحه در نسخه نمایشی غیرفعال است</button>` : html`<a class="btn ghost" href="${d.target_url}" target="_blank" rel="noopener noreferrer">باز کردن صفحه</a>`}</div>
            </section>
            <section class="card"><div class="card-h"><h3>📱 پیش‌نمایش صفحه پس از اسکن</h3></div><div class="phone">${d.demo ? html`<div class="demo-phone-content" dir="rtl"><div class="demo-phone-top"><span>نمونه نمایشی</span><b>سپیدار</b><small>منوی ساختگی؛ سفارش ثبت نمی‌شود</small></div><div class="demo-phone-cats"><span>همه</span><span>غذاها</span><span>نوشیدنی</span></div><div class="demo-phone-product"><span>🍔</span><div><b>برگر مخصوص</b><small>نمونه ساختگی</small></div><strong>۱۸۰٬۰۰۰ تومان</strong></div><div class="demo-phone-product"><span>🍕</span><div><b>پیتزای سبزیجات</b><small>نمونه ساختگی</small></div><strong>۲۱۰٬۰۰۰ تومان</strong></div><div class="demo-phone-disabled">سفارش در پیش‌نمایش خاموش است</div></div>` : html`<iframe src="${d.target_url}" title="پیش‌نمایش سایت مشتری" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>`}</div></section>
          </div></div>`.s;
        const cv = el.querySelector("#cv");
        drawQr(cv, d.target_url, { scale: 10 });
        el.querySelector("#cp").onclick = async () => {
          try { await navigator.clipboard.writeText(d.target_url); toast("لینک کپی شد"); }
          catch { const r = document.createRange(); r.selectNodeContents(el.querySelector("#u")); getSelection().removeAllRanges(); getSelection().addRange(r); toast("لینک را انتخاب کردیم؛ کپی کنید", "info"); }
        };
        el.querySelector("#dl").onclick = () => {
          const big = document.createElement("canvas");
          drawQr(big, d.target_url, { scale: 24 });
          const a = Object.assign(document.createElement("a"), { href: big.toDataURL("image/png"), download: `sepidar-qr-${d.restaurant_id}.png` });
          document.body.appendChild(a); a.click(); a.remove();
        };
      } catch (err) {
        qb.innerHTML = errorBox(err).s;
        qb.querySelector("[data-retry]")?.addEventListener("click", load);
      }
    }
    load();
  },
};
