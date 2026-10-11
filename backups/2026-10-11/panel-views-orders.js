import { html, F, money, time, ago, dateTime, pill, tile, skeleton, errorBox, empty, sheet, confirmBox, busy, toast, STATUS, NEXT_LABEL } from "../ui.js";

const FILTERS = ["all", "new", "preparing", "ready", "delivered", "cancelled"];
const FL = { all: "همه" };
let viewMode = "list";

const isCustom = (l) => l.options.some((o) => !o.d) || l.removed.length || l.note;
const lineTags = (l) => html`${l.options.map((o) => html`<span class="tg ${o.d ? "def" : ""}">${o.n}${o.p && !o.d ? html`<small>${o.p > 0 ? "+" : "−"}${F(Math.abs(o.p))}</small>` : ""}</span>`)}${l.removed.map((r) => html`<span class="tg rd">${r.replace(/^بدون\s*/, "")}</span>`)}${l.note ? html`<div class="nt">📝 ${l.note}</div>` : ""}`;

export async function openOrder(ctx, id, onChange) {
  const s = sheet(skeleton(4, 60), { wide: true, label: "جزئیات سفارش" });
  async function load() {
    try {
      const { order: o } = await ctx.api.order(id);
      const count = o.lines.reduce((a, l) => a + l.qty, 0);
      s.set(html`
        <div class="od-h"><h3 class="num">سفارش #${F(o.number)}</h3>${pill(o.status)}<span class="mut" style="font-size:13px">${ago(o.created_at)}</span></div>
        <div class="od-meta">
          <div>زمان ثبت<b>${dateTime(o.created_at)}</b></div>
          <div>نام یا شماره میز<b>${o.table_label || "ثبت نشده"}</b></div>
          <div>تعداد اقلام<b class="num">${F(count)} عدد</b></div>
        </div>
        <p class="mut" style="font-size:12.5px;margin:0 0 6px">🔒 فقط اطلاعاتی که مشتری هنگام سفارش وارد کرده نمایش داده می‌شود.</p>
        ${o.lines.map((l) => html`<div class="ln">
          ${tile(l.emoji, l.colors, { img: l.image_url })}
          <div style="flex:1;min-width:0"><b>${l.name}</b> <span class="q num">× ${F(l.qty)}</span>${isCustom(l) ? html`<span class="custom-flag">سفارشی</span>` : ""}
            <div>${lineTags(l)}</div></div>
          <div class="lp num"><b>${money(l.line_total)}</b><span class="mut">${l.qty > 1 ? `هر عدد ${F(l.unit_price)}` : ""}</span></div>
        </div>`)}
        <div class="tot"><span>جمع نهایی</span><span class="num">${money(o.total)}</span></div>
        ${o.cancel_reason ? html`<div class="note-box warn">✕ دلیل لغو: ${o.cancel_reason}</div>` : ""}
        ${o.events?.length ? html`<details><summary class="mut" style="cursor:pointer;font-size:13.5px">سابقه وضعیت (${F(o.events.length)})</summary><ul class="timeline">${o.events.map((e) => html`<li>${STATUS[e.to_status]?.label || e.to_status} · ${time(e.created_at)} · ${e.actor === "customer" ? "مشتری" : "رستوران"}</li>`)}</ul></details>` : ""}
        ${o.next.length ? html`<div class="actbar">${o.next.map((to) => html`<button class="btn ${to === "cancelled" ? "danger ghost" : ""}" data-to="${to}">${STATUS[to].icon} ${NEXT_LABEL[to]}</button>`)}</div>` : html`<p class="mut" style="text-align:center;margin-top:14px">این سفارش ${STATUS[o.status].label} است و تغییر دیگری ندارد.</p>`}
      `);
      s.body.querySelectorAll("[data-to]").forEach((b) => (b.onclick = () => change(b, o)));
    } catch (err) {
      s.set(errorBox(err));
      const r = s.body.querySelector("[data-retry]"); if (r) r.onclick = load;
    }
  }
  async function change(btn, o) {
    const to = btn.dataset.to;
    let reason;
    if (to === "cancelled") {
      reason = await confirmBox({ title: `لغو سفارش #${F(o.number)}؟`, text: "این کار قابل بازگشت نیست و در سابقه سفارش ثبت می‌شود.", ok: "بله، لغو شود", danger: true, input: { label: "دلیل لغو", placeholder: "مثلاً: مواد اولیه تمام شده", required: true } });
      if (!reason) return;
    }
    await busy(btn, async () => {
      s.body.querySelectorAll("[data-to]").forEach((b) => (b.disabled = true));
      try {
        await ctx.api.setOrderStatus(o.id, o.status, to, reason);
        toast(`سفارش #${F(o.number)}: ${STATUS[to].label}`);
        onChange && onChange();
        ctx.refresh();
        await load();
      } catch (err) {
        toast(err.message, "err");
        if (err.status === 409) { onChange && onChange(); await load(); }
        else s.body.querySelectorAll("[data-to]").forEach((b) => (b.disabled = false));
      }
    });
  }
  load();
}

export default {
  id: "orders", title: "سفارش‌ها", icon: "🧾", perm: "orders",
  render(el, ctx) {
    const pre = (location.hash.match(/^#\/orders\/(\w+)/) || [])[1];
    let status = FILTERS.includes(pre) ? pre : "all", q = "", timer, seen = new Set(), first = true;
    el.innerHTML = html`
      <div class="view-h"><div><h2>مدیریت سفارش‌ها</h2><p id="sub">سفارش‌های سایت مشتریان با همه جزئیات شخصی‌سازی</p></div>
        <div class="tools"><div class="seg" role="tablist" aria-label="نوع نمایش"><button data-mode="list" class="${viewMode === "list" ? "on" : ""}">☰ فهرست</button><button data-mode="board" class="${viewMode === "board" ? "on" : ""}">▦ تخته آشپزخانه</button></div></div></div>
      <div class="tools" style="margin-bottom:12px"><label class="search"><span class="sr">جستجو</span><input id="q" type="search" placeholder="جستجو: شماره سفارش، نام/میز، نام غذا…" maxlength="60"></label></div>
      <div class="chips" id="fl" role="tablist" aria-label="فیلتر وضعیت"></div>
      <div id="ls" style="margin-top:8px">${skeleton(5, 64)}</div>`.s;
    const ls = el.querySelector("#ls"), fl = el.querySelector("#fl");
    const chips = (counts = {}) => {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      fl.innerHTML = FILTERS.map((f) => html`<button class="chip ${f === status ? "on" : ""}" data-f="${f}" role="tab" aria-selected="${f === status}">${FL[f] || STATUS[f].label}<span class="ct num">${F(f === "all" ? total : counts[f] || 0)}</span></button>`.s).join("");
    };
    chips();
    async function load() {
      try {
        const d = await ctx.api.orders({ status: viewMode === "board" ? "all" : status, q });
        chips(d.counts);
        el.querySelector("#sub").textContent = `آخرین دریافت از سرور: ${time(d.server_time)} · به‌روزرسانی خودکار هر ۱۵ ثانیه`;
        const fresh = (o) => !first && !seen.has(o.id);
        if (viewMode === "board") {
          const cols = ["new", "preparing", "ready"];
          ls.innerHTML = html`<div class="board">${cols.map((c) => {
            const rows = d.orders.filter((o) => o.status === c);
            return html`<section class="col"><h4>${pill(c)}<span class="num mut">${F(rows.length)}</span></h4>
              ${rows.length ? rows.map((o) => html`<button class="ticket ${fresh(o) ? "fresh" : ""}" data-o="${o.id}"><div class="th"><span class="num">#${F(o.number)}</span><span class="mut num" style="font-size:12.5px;font-weight:600">${time(o.created_at)}</span></div>
                <ul><li><span>${o.table_label || "بدون نام/میز"}</span><span class="num">${F(o.item_count || 0)} قلم</span></li></ul>
                <div class="th"><span class="num" style="color:var(--or-ink)">${money(o.total)}</span>${o.next[0] && o.next[0] !== "cancelled" ? html`<span class="btn sm soft" data-q="${o.id}" data-from="${o.status}" data-to="${o.next[0]}" role="button">${NEXT_LABEL[o.next[0]]}</span>` : ""}</div></button>`) : html`<p class="mut" style="text-align:center;font-size:13.5px;padding:20px 0">خالی</p>`}</section>`;
          })}</div>`.s;
        } else {
          ls.innerHTML = (d.orders.length ? html`<div class="olist">${d.orders.map((o) => html`
            <button class="orow ${fresh(o) ? "fresh" : ""}" data-o="${o.id}">
              <span class="no num">#${F(o.number)}<small>${time(o.created_at)}</small></span>
              <span class="what"><span>${o.table_label || "بدون نام/میز"} · ${F(o.item_count || 0)} قلم · ${ago(o.created_at)}</span></span>
              <span class="amt num">${money(o.total)}</span>${pill(o.status)}
              <span class="qa">${o.next[0] && o.next[0] !== "cancelled" ? html`<span class="btn sm soft" data-q="${o.id}" data-from="${o.status}" data-to="${o.next[0]}" role="button">${NEXT_LABEL[o.next[0]]}</span>` : html`<span class="mut" style="font-size:12.5px">جزئیات ←</span>`}</span>
            </button>`)}</div>`
            : q || status !== "all" ? empty("🔎", "سفارشی با این فیلتر پیدا نشد", "فیلتر یا عبارت جستجو را تغییر دهید.") : empty("🍽️", "هنوز سفارشی ثبت نشده", "به‌محض ثبت سفارش در سایت مشتریان، اینجا نمایش داده می‌شود.")).s;
        }
        d.orders.forEach((o) => seen.add(o.id));
        first = false;
      } catch (err) {
        ls.innerHTML = errorBox(err).s;
      }
    }
    el.onclick = async (e) => {
      const m = e.target.closest("[data-mode]");
      if (m) { viewMode = m.dataset.mode; el.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b === m)); fl.hidden = viewMode === "board"; ls.innerHTML = skeleton(4, 64).s; return load(); }
      const f = e.target.closest("[data-f]");
      if (f) { status = f.dataset.f; history.replaceState(null, "", "#/orders" + (status === "all" ? "" : "/" + status)); ls.innerHTML = skeleton(4, 64).s; return load(); }
      const qb = e.target.closest("[data-q]");
      if (qb) {
        e.stopPropagation();
        if (qb.dataset.busy) return;
        qb.dataset.busy = "1"; qb.classList.add("loading");
        try { await ctx.api.setOrderStatus(qb.dataset.q, qb.dataset.from, qb.dataset.to); toast(STATUS[qb.dataset.to].label + " ✓"); ctx.refresh(); }
        catch (err) { toast(err.message, "err"); }
        return load();
      }
      const o = e.target.closest("[data-o]");
      if (o) return openOrder(ctx, o.dataset.o, load);
      if (e.target.closest("[data-retry]")) load();
    };
    el.querySelector("#q").oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); load(); }, 300); };
    fl.hidden = viewMode === "board";
    load();
    const off = ctx.onOrders(() => load());
    return () => { off(); clearTimeout(timer); };
  },
};
