import { html, raw, F, money, date, skeleton, errorBox, empty, STATUS, stars } from "../ui.js";

const DAY = 86400000, OFF = 3.5 * 3600000;
const isoTehran = (t) => new Date(t + OFF).toISOString().slice(0, 10);
const todayStart = () => Math.floor((Date.now() + OFF) / DAY) * DAY - OFF;
const COLORS = { new: "#e6a100", preparing: "#ff6a00", ready: "#16a34a", delivered: "#64748b", cancelled: "#e11d48" };

function delta(cur, prev) {
  if (!prev) return html`<span class="delta flat">بدون داده دوره قبل</span>`;
  const p = Math.round(((cur - prev) / prev) * 100);
  return html`<span class="delta ${p > 0 ? "up" : p < 0 ? "down" : "flat"}">${p > 0 ? "▲" : p < 0 ? "▼" : "="} ${F(Math.abs(p))}٪ نسبت به دوره قبل</span>`;
}

function barChart(days, key, fmt) {
  const W = 640, H = 220, P = 28, max = Math.max(1, ...days.map((d) => d[key]));
  const bw = (W - P * 2) / days.length, step = Math.ceil(days.length / 10);
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="نمودار">
    <defs><linearGradient id="gOr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a3d"/><stop offset="1" stop-color="#ff6a00"/></linearGradient></defs>
    ${[0, 0.5, 1].map((g) => `<line x1="${P}" x2="${W - P}" y1="${P + (H - P * 2) * (1 - g)}" y2="${P + (H - P * 2) * (1 - g)}" stroke="#f0e6dc" stroke-dasharray="4 4"/><text x="${W - P + 4}" y="${P + (H - P * 2) * (1 - g) + 4}" text-anchor="start">${F(Math.round(max * g))}</text>`).join("")}
    ${days.map((d, i) => {
      const h = ((H - P * 2) * d[key]) / max, x = W - P - (i + 1) * bw + bw * 0.18, y = H - P - h;
      return `<rect class="b" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(h, d[key] ? 2 : 0).toFixed(1)}" rx="5"><title>${date(d.day_start)}: ${fmt(d[key])}</title></rect>` +
        (i % step === 0 ? `<text x="${(x + bw * 0.32).toFixed(1)}" y="${H - P + 18}" text-anchor="middle">${date(d.day_start, { month: "short" })}</text>` : "");
    }).join("")}
  </svg>`);
}

function donut(by) {
  const entries = Object.entries(by).filter(([, n]) => n), total = entries.reduce((a, [, n]) => a + n, 0);
  if (!total) return empty("📭", "سفارشی در این بازه نیست");
  let acc = 0;
  const R = 70, C = 2 * Math.PI * R;
  const arcs = entries.map(([k, n]) => { const len = (n / total) * C, s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${COLORS[k]}" stroke-width="26" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 90 90)"><title>${STATUS[k].label}: ${F(n)}</title></circle>`; acc += len; return s; }).join("");
  return html`<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">${raw(`<svg viewBox="0 0 180 180" width="160" height="160" role="img" aria-label="سفارش‌ها براساس وضعیت">${arcs}<text x="90" y="88" text-anchor="middle" style="font:800 26px Vazirmatn;fill:#1f2430">${F(total)}</text><text x="90" y="110" text-anchor="middle" style="font:12px Vazirmatn;fill:#6b7280">سفارش</text></svg>`)}
    <div class="legend" style="flex-direction:column">${entries.map(([k, n]) => html`<span><i style="background:${COLORS[k]}"></i>${STATUS[k].label}: <b class="num">${F(n)}</b> <span class="mut num">(${F(Math.round((n / total) * 100))}٪)</span></span>`)}</div></div>`;
}

export default {
  id: "reports", title: "گزارش‌ها و آمار", short: "گزارش", icon: "📈", perm: "reports",
  render(el, ctx) {
    let range = 7, from = "", to = "";
    el.innerHTML = html`<div class="view-h"><div><h2>گزارش‌ها</h2><p>همه اعداد از داده‌های ثبت‌شده در سرور محاسبه می‌شوند</p></div>
      <div class="tools"><div class="seg" id="rg">${[[7, "۷ روز"], [30, "۳۰ روز"], [90, "۹۰ روز"], ["c", "بازه دلخواه"]].map(([v, l]) => html`<button data-rg="${v}" class="${v === 7 ? "on" : ""}">${l}</button>`)}</div></div></div>
      <div id="cus" class="tools" hidden style="margin-bottom:12px"><label class="fld" style="margin:0"><span>از</span><input type="date" id="df"></label><label class="fld" style="margin:0"><span>تا</span><input type="date" id="dt"></label><button class="btn sm" id="ap" style="align-self:end">اعمال</button></div>
      <div id="rp">${skeleton(2, 160)}</div>`.s;
    async function load() {
      const rp = el.querySelector("#rp");
      rp.innerHTML = skeleton(2, 160).s;
      const p = range === "c" ? { from, to } : { from: isoTehran(todayStart() - (range - 1) * DAY), to: isoTehran(todayStart()) };
      try {
        const d = await ctx.api.reports(p);
        const t = d.totals, avgTicket = t.count ? Math.round(t.amount / Math.max(1, t.count - (d.by_status.cancelled || 0))) : 0;
        const topMax = Math.max(1, ...d.top_items.map((x) => x.qty));
        rp.innerHTML = html`
          <div class="kpis">
            <div class="kpi"><div class="mut">تعداد سفارش‌ها</div><div class="val num">${F(t.count)}</div>${delta(t.count, t.prev_count)}</div>
            <div class="kpi"><div class="mut">مبلغ سفارش‌های ثبت‌شده</div><div class="val num">${F(t.amount)} <small class="mut" style="font-size:13px">تومان</small></div>${delta(t.amount, t.prev_amount)}</div>
            <div class="kpi"><div class="mut">میانگین هر سفارش</div><div class="val num">${F(avgTicket)} <small class="mut" style="font-size:13px">تومان</small></div><span class="delta flat">بدون سفارش‌های لغوشده</span></div>
            <div class="kpi"><div class="mut">میانگین امتیاز این بازه</div><div class="val num">${d.rating.avg != null ? F(d.rating.avg) : "—"}</div>${stars(Math.round(d.rating.avg || 0))}</div>
          </div>
          <div class="grid g2">
            <section class="card"><div class="card-h"><h3>📦 تعداد سفارش روزانه</h3></div>${t.count ? barChart(d.days, "count", (v) => `${F(v)} سفارش`) : empty("📭", "سفارشی در این بازه ثبت نشده")}</section>
            <section class="card"><div class="card-h"><h3>🧭 سفارش‌ها براساس وضعیت</h3></div>${donut(d.by_status)}</section>
            <section class="card"><div class="card-h"><h3>💰 مبلغ روزانه</h3><span class="mut" style="font-size:12.5px">تومان</span></div>${t.amount ? barChart(d.days, "amount", (v) => money(v)) : empty("💤", "مبلغی ثبت نشده")}</section>
            <section class="card"><div class="card-h"><h3>🔥 غذاهای پرتقاضا</h3></div>${d.top_items.length ? html`<div class="toplist">${d.top_items.map((x) => html`<div><span style="font-size:22px">${x.emoji || "🍽️"}</span><span><b style="font-weight:600">${x.name}</b><span class="bar" style="display:block;margin-top:4px"><span style="width:${(x.qty / topMax) * 100}%"></span></span></span><span class="num mut" style="text-align:left">${F(x.qty)} عدد<br><small>${money(x.amount)}</small></span></div>`)}</div>` : empty("🍽️", "داده‌ای نیست")}</section>
          </div>`.s;
      } catch (err) { rp.innerHTML = errorBox(err).s; rp.querySelector("[data-retry]")?.addEventListener("click", load); }
    }
    el.querySelector("#rg").onclick = (e) => {
      const b = e.target.closest("[data-rg]"); if (!b) return;
      el.querySelectorAll("[data-rg]").forEach((x) => x.classList.toggle("on", x === b));
      range = b.dataset.rg === "c" ? "c" : +b.dataset.rg;
      el.querySelector("#cus").hidden = range !== "c";
      if (range === "c") { el.querySelector("#df").value ||= isoTehran(todayStart() - 13 * DAY); el.querySelector("#dt").value ||= isoTehran(todayStart()); return; }
      load();
    };
    el.querySelector("#ap").onclick = () => { from = el.querySelector("#df").value; to = el.querySelector("#dt").value; if (from && to) load(); };
    load();
  },
};
