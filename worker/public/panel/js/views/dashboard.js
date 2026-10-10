import { html, F, money, time, ago, pill, tile, skeleton, errorBox, empty, STATUS } from "../ui.js";
import { openOrder } from "./orders.js";

const ACT = {
  "order.create": (d) => ["🛎️", `سفارش جدید #${F(d?.number)} ثبت شد`, d?.total ? money(d.total) : ""],
  "order.status": (d) => [STATUS[d?.to]?.icon || "🔁", `سفارش #${F(d?.number)} ← ${STATUS[d?.to]?.label || ""}`, d?.reason ? `دلیل: ${d.reason}` : ""],
  "menu.item_update": (d) => ["🍔", `«${d?.name || "غذا"}» ویرایش شد`, d?.price_to != null && d?.price_from != null ? `قیمت: ${F(d.price_from)} ← ${F(d.price_to)}` : d?.available === false ? "ناموجود شد" : d?.available === true ? "موجود شد" : d?.active === false ? "غیرفعال شد" : ""],
  "menu.item_create": (d) => ["➕", `غذای «${d?.name}» اضافه شد`, d?.price ? money(d.price) : ""],
  "menu.item_delete": () => ["🗑️", "یک غذا از منو حذف شد", ""],
  "menu.category_create": (d) => ["🗂️", `دسته «${d?.name}» ساخته شد`, ""],
  "menu.category_update": () => ["🗂️", "یک دسته منو ویرایش شد", ""],
  "review.update": () => ["⭐", "وضعیت یک نظر تغییر کرد", ""],
  "settings.update": () => ["⚙️", "تنظیمات رستوران به‌روزرسانی شد", ""],
  "auth.login": () => ["🔐", "ورود به پنل", ""],
  "auth.logout": () => ["🚪", "خروج از پنل", ""],
  "auth.logout_all": () => ["🚪", "لغو همه نشست‌ها", ""],
  "lead.update": () => ["🤝", "وضعیت درخواست همکاری تغییر کرد", ""],
  "lead.view": () => ["👁️", "جزئیات درخواست همکاری مشاهده شد", ""],
};

export default {
  id: "dashboard", title: "داشبورد", icon: "📊", perm: "orders",
  render(el, ctx) {
    el.innerHTML = html`
      <div class="view-h"><div><h2>سلام، خسته نباشید 👋</h2><p>${new Date().toLocaleDateString("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Tehran" })} · وضعیت لحظه‌ای آشپزخانه</p></div>
      <div class="tools"><button class="btn ghost sm" data-go="orders">همه سفارش‌ها ←</button></div></div>
      <div id="st">${skeleton(1, 132)}</div>
      <div class="grid g2">
        <section class="card"><div class="card-h"><h3>🧾 سفارش‌های اخیر</h3><span class="mut" id="sync" style="font-size:12.5px"></span></div><div id="rc">${skeleton(4, 64)}</div></section>
        <section class="card"><div class="card-h"><h3>⚡ فعالیت‌های مهم</h3></div><div id="ac">${skeleton(5, 40)}</div></section>
      </div>`.s;
    el.onclick = (e) => {
      const g = e.target.closest("[data-go]"); if (g) return g.dataset.st ? (location.hash = "#/orders/" + g.dataset.st) : ctx.go(g.dataset.go);
      const o = e.target.closest("[data-o]"); if (o) return openOrder(ctx, o.dataset.o, load);
      if (e.target.closest("[data-retry]")) load();
    };
    async function load() {
      try {
        const d = await ctx.api.dashboard();
        const s = d.stats;
        el.querySelector("#st").innerHTML = html`<div class="stats">
          ${[
            ["new", "سفارش‌های جدید", s.new, "🛎️", ["#fff3cd", "#ffd36b"], "منتظر تأیید", true],
            ["preparing", "در حال آماده‌سازی", s.preparing, "🔥", ["#ffe0c2", "#ffb36b"], "روی اجاق"],
            ["ready", "آماده تحویل", s.ready, "🛍️", ["#d9f5e3", "#8fdcaa"], "منتظر تحویل"],
          ].map(([k, l, v, e, c, f, hot]) => html`<button class="stat ${hot && v ? "hot" : ""}" data-tilt data-go="orders" data-st="${k}"><span class="pop">${tile(e, c, { size: "sm" })}</span><span class="lbl">${l}</span><span class="val num">${F(v)}</span><span class="foot">${f}</span></button>`)}
          <div class="stat" data-tilt><span class="pop">${tile("📅", ["#e8eefc", "#a9bdf5"], { size: "sm" })}</span><span class="lbl">سفارش‌های امروز</span><span class="val num">${F(s.today_count)}</span><span class="foot">${s.today_cancelled ? `${F(s.today_cancelled)} لغوشده` : "بدون لغو"}</span></div>
          <div class="stat" data-tilt><span class="pop">${tile("💰", ["#fff0c9", "#ffd36b"], { size: "sm" })}</span><span class="lbl">مبلغ ثبت‌شده امروز</span><span class="val num">${F(s.today_amount)} <small>تومان</small></span><span class="foot">بدون سفارش‌های لغوشده</span></div>
          <button class="stat" data-tilt data-go="reviews"><span class="pop">${tile("⭐", ["#ffe3ee", "#ff9fc2"], { size: "sm" })}</span><span class="lbl">میانگین امتیاز</span><span class="val num">${s.rating_avg != null ? F(s.rating_avg) : "—"} <small>از ۵</small></span><span class="foot">${s.rating_count ? `از ${F(s.rating_count)} نظر` : "هنوز نظری ثبت نشده"}</span></button>
        </div>`.s;
        el.querySelector("#sync").textContent = `به‌روز تا ${time(d.server_time)}`;
        el.querySelector("#rc").innerHTML = (d.recent.length ? html`<div class="olist">${d.recent.map((o) => html`
          <button class="orow" data-o="${o.id}"><span class="no num">#${F(o.number)}<small>${time(o.created_at)}</small></span>
          <span class="what"><span>${o.table_label || "بدون نام/میز"} · ${F(o.item_count || 0)} قلم</span></span>
          <span class="amt num">${money(o.total)}</span>${pill(o.status)}<span class="qa mut" style="font-size:12.5px">${ago(o.created_at)}</span></button>`)}</div>`
          : empty("🍽️", "هنوز سفارشی ثبت نشده", "سفارش‌های سایت مشتریان اینجا نمایش داده می‌شوند.")).s;
      } catch (err) {
        el.querySelector("#st").innerHTML = errorBox(err).s;
        el.querySelector("#rc").innerHTML = "";
      }
      try {
        const a = await ctx.api.activity();
        el.querySelector("#ac").innerHTML = (a.activity.length ? html`<div class="feed">${a.activity.slice(0, 8).map((x) => {
          const [ic, t, sub] = (ACT[x.action] || (() => ["•", x.action, ""]))(x.detail);
          return html`<div class="it"><span class="ic">${ic}</span><div><b style="font-weight:600">${t}</b>${sub ? html`<div class="mut" style="font-size:13px">${sub}</div>` : ""}<time>${ago(x.created_at)}</time></div></div>`;
        })}</div>` : empty("🌱", "فعالیتی ثبت نشده", "تغییر وضعیت سفارش‌ها و منو اینجا ثبت می‌شود.")).s;
      } catch (err) {
        el.querySelector("#ac").innerHTML = errorBox(err, false).s;
      }
    }
    load();
    return ctx.onOrders(({ changed }) => changed && load());
  },
};
