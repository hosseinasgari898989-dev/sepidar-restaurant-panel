import { html, F, date, ago, stars, skeleton, errorBox, empty, confirmBox, busy, toast } from "../ui.js";

export default {
  id: "reviews", title: "نظرات و امتیازها", short: "نظرات", icon: "⭐", perm: "reviews",
  render(el, ctx) {
    const f = { rating: "all", visibility: "all", flagged: "", q: "" };
    el.innerHTML = html`
      <div class="view-h"><div><h2>نظرات مشتریان</h2><p>نظرها در سایت مشتریان ثبت می‌شوند؛ اینجا فقط مشاهده و مدیریت انتشار است.</p></div></div>
      <section class="card" id="sum" style="margin-bottom:14px">${skeleton(1, 120)}</section>
      <div class="tools" style="margin-bottom:10px"><label class="search"><span class="sr">جستجوی نظر</span><input id="q" type="search" placeholder="جستجو در متن، نام غذا یا نام مشتری…" maxlength="60"></label></div>
      <div class="chips" id="fl"></div>
      <div id="ls" class="grid" style="margin-top:8px">${skeleton(3, 110)}</div>`.s;
    const chips = () => {
      el.querySelector("#fl").innerHTML = html`
        ${["all", 5, 4, 3, 2, 1].map((r) => html`<button class="chip ${String(f.rating) === String(r) ? "on" : ""}" data-r="${r}">${r === "all" ? "همه امتیازها" : `${F(r)} ★`}</button>`)}
        <span style="width:1px;background:var(--line);margin:0 4px"></span>
        <button class="chip ${f.visibility === "hidden" ? "on" : ""}" data-vis="hidden">🙈 پنهان‌شده</button>
        <button class="chip ${f.flagged ? "on" : ""}" data-fg>🚩 علامت‌خورده</button>`.s;
    };
    chips();
    async function load() {
      try {
        const d = await ctx.api.reviews(f);
        const s = d.summary, max = Math.max(1, ...Object.values(s.distribution));
        el.querySelector("#sum").innerHTML = html`<div class="rv-sum">
          <div class="big-avg"><b class="num">${s.avg != null ? F(s.avg) : "—"}</b>${stars(Math.round(s.avg || 0))}<div class="mut" style="font-size:13px">${F(s.count)} نظر</div></div>
          <div><div class="dist">${[5, 4, 3, 2, 1].map((r) => html`<div><span class="num">${F(r)} ★</span><span class="bar"><span style="width:${(s.distribution[r] / max) * 100}%"></span></span><span class="num mut">${F(s.distribution[r])}</span></div>`)}</div>
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">🔒 امتیازها توسط مشتری ثبت شده‌اند و قابل ویرایش نیستند. میانگین از همه امتیازها (حتی نظرهای پنهان‌شده) محاسبه می‌شود. ${F(s.hidden)} پنهان · ${F(s.flagged)} علامت‌خورده · ${F(s.replied)} پاسخ‌داده‌شده</p></div></div>`.s;
        el.querySelector("#ls").innerHTML = (d.reviews.length ? html`${d.reviews.map((r) => html`<article class="rv ${r.visibility === "hidden" ? "hid" : ""} ${r.featured ? "rv-featured rv-feature-" + (["glow", "shine", "burst"].includes(r.feature_style) ? r.feature_style : "glow") : ""}" data-id="${r.id}">
          <div class="rv-h">${stars(r.rating)}<b>${r.author_name || "مشتری"}</b><span class="mut" style="font-size:12.5px">${date(r.created_at, { year: "numeric" })} · ${ago(r.created_at)}</span>
            ${r.item_name ? html`<span class="tg">🍽️ ${r.item_name}</span>` : ""}${r.order_number ? html`<span class="badge num">سفارش #${F(r.order_number)}</span>` : ""}
            ${r.visibility === "hidden" ? html`<span class="badge">پنهان از سایت</span>` : ""}${r.flagged ? html`<span class="badge" style="background:#fff0f0;color:#b00">🚩 ${r.flag_reason || "نامناسب"}</span>` : ""}${r.author_banned ? html`<span class="badge" style="background:#fff0f0;color:#b00">⛔ نویسنده مسدود است</span>` : ""}</div>
          ${r.featured ? html`<div class="rv-featured-status"><span class="rv-featured-mark">✦</span><div><b>جلوه ویژه فعال است</b><small>این ظاهر در سایت مشتریان هم نمایش داده می‌شود.</small></div><span class="rv-feature-style-tag">${({ glow: "درخشش", shine: "تابش نور", burst: "ستاره‌باران" })[r.feature_style] || "درخشش"}</span></div>` : ""}
          ${r.comment ? html`<p class="rv-review-text ${r.featured ? "rv-review-featured-text" : ""}">${r.comment}</p>` : html`<p class="mut rv-review-text">بدون متن؛ فقط امتیاز ثبت شده.</p>`}
          <div class="rv-vote-summary"><span>👍 پسندیدند: <b>${F(r.likes || 0)}</b></span><span>👎 نپسندیدند: <b>${F(r.dislikes || 0)}</b></span></div>
          ${r.reply ? html`<div class="reply"><b>پاسخ رستوران</b> <span class="mut" style="font-size:12px">${r.reply_at ? ago(r.reply_at) : ""}</span><div>${r.reply}</div></div>` : ""}
          <div class="rv-act">
            <button class="btn sm ghost" data-a="vis">${r.visibility === "hidden" ? "👁️ انتشار دوباره" : "🙈 پنهان‌کردن"}</button>
            <button class="btn sm ghost" data-a="flag">${r.flagged ? "برداشتن علامت" : "🚩 گزارش نامناسب"}</button>
            <button class="btn sm ghost" data-a="${r.author_banned ? "unban" : "ban"}" ${r.client_key_hash ? "" : "disabled"}>${r.author_banned ? "🔓 رفع مسدودی نویسنده" : "⛔ مسدودکردن نویسنده"}</button>
            <button class="btn sm ${r.featured ? "soft" : "ghost"}" data-a="feature">${r.featured ? "✨ برداشتن جلوه ویژه" : "✨ ویژه‌کردن نظر"}</button>
            ${r.featured ? html`<button class="btn sm ghost" data-a="style">🎨 تغییر جلوه</button>` : ""}
            <button class="btn sm danger ghost" data-a="delete">🗑️ حذف نظر</button>
            ${d.reply_supported ? html`<button class="btn sm soft" data-a="reply">💬 ${r.reply ? "ویرایش پاسخ" : "پاسخ رسمی"}</button>` : html`<span class="badge wait">پاسخ رسمی: در انتظار API</span>`}
          </div></article>`)}`
          : empty("⭐", f.q || f.rating !== "all" || f.visibility !== "all" || f.flagged ? "نظری با این فیلتر نیست" : "هنوز نظری ثبت نشده", "نظرهایی که مشتریان در سایت ثبت می‌کنند اینجا نمایش داده می‌شوند.")).s;
        el._rows = d.reviews;
      } catch (err) {
        el.querySelector("#sum").innerHTML = "";
        el.querySelector("#ls").innerHTML = errorBox(err).s;
      }
    }
    el.onclick = async (e) => {
      const r = e.target.closest("[data-r]"); if (r) { f.rating = r.dataset.r; chips(); return load(); }
      if (e.target.closest("[data-vis]")) { f.visibility = f.visibility === "hidden" ? "all" : "hidden"; chips(); return load(); }
      if (e.target.closest("[data-fg]")) { f.flagged = f.flagged ? "" : "1"; chips(); return load(); }
      if (e.target.closest("[data-retry]")) return load();
      const a = e.target.closest("[data-a]"); if (!a) return;
      const rv = el._rows.find((x) => x.id === a.closest("[data-id]").dataset.id);
      let body;
      if (a.dataset.a === "feature") {
        body = {
          featured: !rv.featured,
          feature_style: rv.featured ? (rv.feature_style || "glow") : "glow",
        };
      } else if (a.dataset.a === "style") {
        const styles = ["glow", "shine", "burst"];
        const current = styles.includes(rv.feature_style) ? rv.feature_style : "glow";
        body = { featured: true, feature_style: styles[(styles.indexOf(current) + 1) % styles.length] };
      } else if (a.dataset.a === "vis") {
        const hide = rv.visibility !== "hidden";
        if (!(await confirmBox({ title: hide ? "پنهان‌کردن این نظر؟" : "انتشار دوباره نظر؟", text: hide ? "متن نظر از سایت مشتریان پنهان می‌شود؛ امتیاز آن همچنان در میانگین حساب می‌شود و این عملیات در سابقه ثبت می‌شود." : "نظر دوباره در سایت مشتریان نمایش داده می‌شود.", ok: hide ? "پنهان شود" : "منتشر شود", danger: hide }))) return;
        body = { visibility: hide ? "hidden" : "published" };
      } else if (a.dataset.a === "flag") {
        if (rv.flagged) body = { flagged: false };
        else {
          const reason = await confirmBox({ title: "گزارش نظر نامناسب", text: "نظر برای بررسی علامت می‌خورد.", ok: "ثبت گزارش", input: { label: "دلیل (اختیاری)", placeholder: "مثلاً: توهین‌آمیز، تبلیغاتی" } });
          if (reason == null) return;
          body = { flagged: true, flag_reason: reason || "نامناسب" };
        }
      } else if (a.dataset.a === "reply") {
        const reply = await confirmBox({ title: "پاسخ رسمی رستوران", text: "این پاسخ زیر نظر مشتری در سایت نمایش داده می‌شود. برای حذف پاسخ، متن را خالی بگذارید.", ok: "ثبت پاسخ", input: { label: "متن پاسخ", max: 500, placeholder: "از بازخورد شما ممنونیم…" } });
        if (reply == null) return;
        body = { reply: reply || "" };
      } else if (a.dataset.a === "ban") {
        if (!rv.client_key_hash) return toast("این نظر قدیمی است و شناسه امن نویسنده ندارد؛ بن مستقیم ممکن نیست.", "err");
        const reason = await confirmBox({ title: "مسدودکردن نویسنده برای ۳۰ روز؟", text: "بن در سرور ذخیره می‌شود و با پاک‌کردن localStorage معمولی از بین نمی‌رود. مرورگر باید شناسه ناشناس قبلی خود را نگه داشته باشد.", ok: "مسدودکردن ۳۰ روزه", danger: true, input: { label: "دلیل (اختیاری)", max: 160, placeholder: "اسپم یا رفتار نامناسب" } });
        if (reason == null) return;
        busy(a, async () => {
          try { await ctx.api.banReviewAuthor(rv.id, { duration: "30d", reason }); toast("نویسنده برای ۳۰ روز مسدود شد"); await load(); }
          catch (err) { toast(err.message, "err"); }
        });
        return;
      } else if (a.dataset.a === "unban") {
        if (!(await confirmBox({ title: "رفع مسدودی نویسنده؟", text: "از این پس همان شناسه ناشناس مرورگر می‌تواند دوباره نظر ارسال کند.", ok: "رفع مسدودی" }))) return;
        busy(a, async () => { try { await ctx.api.unbanReviewAuthor(rv.id); toast("مسدودی برداشته شد"); await load(); } catch (err) { toast(err.message, "err"); } });
        return;
      } else if (a.dataset.a === "delete") {
        if (!(await confirmBox({ title: "حذف نظر مشتری؟", text: "این نظر به‌طور دائمی حذف می‌شود. این کار امتیاز را هم از میانگین خارج می‌کند.", ok: "حذف نظر", danger: true }))) return;
        busy(a, async () => { try { await ctx.api.deleteReview(rv.id); toast("نظر حذف شد"); await load(); } catch (err) { toast(err.message, "err"); } });
        return;
      }
      busy(a, async () => {
        try { await ctx.api.updateReview(rv.id, body); toast("ذخیره شد"); await load(); }
        catch (err) { toast(err.message, "err"); }
      });
    };
    let tm;
    el.querySelector("#q").oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { f.q = e.target.value.trim(); load(); }, 300); };
    load();
  },
};
