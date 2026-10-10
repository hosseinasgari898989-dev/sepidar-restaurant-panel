// حالت نمایشی: همه داده‌ها ساختگی و فقط در حافظه همین زبانه‌اند.
// هیچ چیزی به سرور ارسال یا در localStorage ذخیره نمی‌شود و با بستن صفحه از بین می‌رود.
import { DEMO_MENU } from "./demo-menu.js";

const clone = (o) => JSON.parse(JSON.stringify(o));
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const wait = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 220 + rnd() * 200));
const fail = (status, code, message) => Promise.reject(Object.assign(new Error(message), { kind: "http", status, code, body: {} }));
const DAY = 86400000, OFF = 3.5 * 3600000;
const dayStart = (t = Date.now()) => Math.floor((t + OFF) / DAY) * DAY - OFF;
const TR = { new: ["preparing", "cancelled"], preparing: ["ready", "cancelled"], ready: ["delivered"], delivered: [], cancelled: [] };

const db = { menu: clone(DEMO_MENU), orders: [], reviews: [], leads: [], activity: [], restaurant: null };
db.restaurant = { id: "demo", name: "رستوران نمونه (نمایشی)", phone: "۰۲۱-۰۰۰۰۰۰۰۰", address: "نشانی نمایشی", hours: "۱۲ تا ۲۳", about: "", status: "open", accepting_orders: true, updated_at: Date.now() };

function line(cat, item, extra = {}) {
  const opts = [];
  let unit = item.price;
  cat.options.forEach((g, gi) => {
    const def = g.type === "one" ? (item.meta.s && item.meta.s[gi]) || 0 : -1;
    if (g.type === "one") {
      const i = rnd() < 0.3 ? Math.floor(rnd() * g.list.length) : def;
      unit += g.list[i][1] - g.list[def][1];
      opts.push({ g: g.t, n: g.list[i][0], p: g.list[i][1], d: i === def ? 1 : 0 });
    } else if (rnd() < 0.45) {
      const x = pick(g.list);
      unit += x[1];
      opts.push({ g: g.t, n: x[0], p: x[1], d: 0 });
    }
  });
  const rems = (item.removables || []).filter(() => rnd() < 0.18).slice(0, 2);
  const qty = rnd() < 0.75 ? 1 : 2;
  return { item_id: item.id, name: item.name, emoji: item.emoji, colors: cat.colors, image_url: "", qty, unit_price: unit, line_total: unit * qty, options: opts, removed: rems, note: rnd() < 0.15 ? pick(["کم‌نمک لطفاً", "سس جدا باشد", "تند نباشد", "خوب پخته شود"]) : "", ...extra };
}

(function build() {
  const t0 = Date.now();
  let n = 100;
  const tables = ["میز ۳", "میز ۷", "علی", "میز ۱۲", "", "سارا", "میز ۵", "بیرون‌بر", ""];
  for (let d = 20; d >= 0; d--) {
    const count = d === 0 ? 9 : 5 + Math.floor(rnd() * 9);
    for (let k = 0; k < count; k++) {
      const created = d === 0 ? t0 - (count - k) * 13 * 60000 : dayStart(t0) - d * DAY + (11 + rnd() * 11) * 3600000;
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => { const c = pick(db.menu); return line(c, pick(c.items)); });
      let status = "delivered";
      if (d === 0) status = k >= count - 3 ? "new" : k >= count - 5 ? "preparing" : k >= count - 6 ? "ready" : "delivered";
      if (d > 0 && rnd() < 0.06) status = "cancelled";
      n++;
      db.orders.push({ id: "demo-" + n, number: n, table_label: pick(tables), status, total: lines.reduce((a, l) => a + l.line_total, 0), cancel_reason: status === "cancelled" ? "درخواست مشتری" : null, created_at: created, updated_at: created, lines, events: [{ from_status: null, to_status: "new", actor: "customer", created_at: created }] });
    }
  }
  const comments = [
    [5, "برگر عالی بود، پنیر چدارش فوق‌العاده!", "چیزبرگر"], [4, "کیفیت خوب، فقط کمی دیر رسید.", "پیتزا پپرونی"], [5, "جوجه کباب نرم و خوش‌طعم.", "جوجه کباب"],
    [3, "سیب‌زمینی سرد بود.", "سیب‌زمینی سرخ‌کرده"], [5, "بسته‌بندی تمیز و سفارش دقیق بود.", null], [2, "سس اضافه که خواستم نیامد.", "برگر کلاسیک"],
    [4, "لیموناد خیلی خوب بود.", "لیموناد"], [5, "بهترین چیزکیک شهر.", "چیزکیک"], [1, "سفارشم لغو شد و کسی خبر نداد.", null], [4, "", "فلافل"],
  ];
  comments.forEach(([r, c, item], i) => db.reviews.push({ id: "rv" + i, rating: r, comment: c, item_name: item, author_name: pick(["مریم", "رضا", "", "نیلوفر", "امیر"]), order_number: 100 + 10 * i, visibility: i === 8 ? "hidden" : "published", flagged: i === 8, flag_reason: i === 8 ? "نیاز به پیگیری" : null, reply: i === 1 ? "از صبوری شما ممنونیم؛ پیگیری کردیم." : null, reply_at: i === 1 ? t0 - 2 * DAY : null, created_at: t0 - i * 0.7 * DAY - 3600000 }));
  [["فست‌فود نمونه یک", "new"], ["کافه نمونه", "reviewing"], ["رستوران نمونه سه", "approved"]].forEach(([nm, st], i) =>
    db.leads.push({ id: "ld" + i, restaurant_name: nm, phone: "۰۹۱۲۰۰۰۰۰" + (10 + i), note: i === 0 ? "برای دو شعبه می‌خواهیم." : "", status: st, internal_note: null, created_at: t0 - (i + 1) * 1.3 * DAY, updated_at: t0 }));
  const t1 = Date.now();
  db.activity.push(
    { action: "menu.item_update", detail: { name: "چیزبرگر", price_from: 200000, price_to: 210000 }, actor: "demo", created_at: t1 - 50 * 60000 },
    { action: "order.status", detail: { number: n - 5, from: "ready", to: "delivered" }, actor: "demo", created_at: t1 - 70 * 60000 },
    { action: "menu.item_update", detail: { name: "میلک‌شیک شکلات", available: false }, actor: "demo", created_at: t1 - 2 * 3600000 },
    { action: "settings.update", detail: {}, actor: "demo", created_at: t1 - 5 * 3600000 });
  db.activity.unshift({ action: "order.create", detail: { number: n, total: db.orders[db.orders.length - 1].total }, actor: "customer", created_at: db.orders[db.orders.length - 1].created_at });
})();

const log = (action, detail) => db.activity.unshift({ action, detail, actor: "demo", created_at: Date.now() });
const strip = (o) => { const { lines, events, ...rest } = o; return { ...rest, item_count: lines.reduce((a, l) => a + l.qty, 0), next: TR[o.status] }; };
const sortedOrders = () => [...db.orders].sort((a, b) => b.created_at - a.created_at);
const allItems = () => db.menu.flatMap((c) => c.items);
const reviewSummary = (rows) => {
  const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rows.forEach((r) => d[r.rating]++);
  return { count: rows.length, avg: rows.length ? Math.round((rows.reduce((a, r) => a + r.rating, 0) / rows.length) * 10) / 10 : null, distribution: d, hidden: rows.filter((r) => r.visibility === "hidden").length, flagged: rows.filter((r) => r.flagged).length, replied: rows.filter((r) => r.reply).length };
};

export const demo = {
  mode: "demo",
  health: () => wait({ ok: true, status: "demo", capabilities: { database: true, panel_auth: true, realtime: false, image_upload: false, qr: true } }),
  login: () => wait({ ok: true }),
  logout: () => wait({ ok: true }),
  logoutAll: () => wait({ ok: true }),
  session: () => wait({ ok: true, session: { role: "platform_admin", permissions: ["restaurant", "orders", "menu", "reviews", "reports", "settings", "leads", "platform_settings"], expires_at: Date.now() + 8 * 3600000, bootstrap: true, restaurant: db.restaurant } }),
  dashboard() {
    const today = dayStart(), o = db.orders.filter((x) => x.created_at >= today);
    const c = (s) => db.orders.filter((x) => x.status === s).length;
    const rs = reviewSummary(db.reviews);
    return wait({ ok: true, stats: { new: c("new"), preparing: c("preparing"), ready: c("ready"), today_count: o.length, today_amount: o.filter((x) => x.status !== "cancelled").reduce((a, x) => a + x.total, 0), today_cancelled: o.filter((x) => x.status === "cancelled").length, rating_avg: rs.avg, rating_count: rs.count }, recent: sortedOrders().slice(0, 6).map(strip), server_time: Date.now() });
  },
  activity: () => wait({ ok: true, activity: db.activity.slice(0, 15) }),
  orders({ status, q } = {}) {
    let rows = sortedOrders();
    if (status && status !== "all") rows = rows.filter((o) => o.status === status);
    if (q) rows = rows.filter((o) => String(o.number).includes(q.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))) || (o.table_label || "").includes(q) || o.lines.some((l) => l.name.includes(q)));
    const counts = {};
    db.orders.forEach((o) => (counts[o.status] = (counts[o.status] || 0) + 1));
    return wait({ ok: true, orders: rows.slice(0, 50).map(strip), counts, server_time: Date.now() });
  },
  order(id) {
    const o = db.orders.find((x) => x.id === id);
    return o ? wait({ ok: true, order: { ...o, next: TR[o.status] } }) : fail(404, "not_found", "سفارش پیدا نشد.");
  },
  setOrderStatus(id, from, to, reason) {
    const o = db.orders.find((x) => x.id === id);
    if (!o) return fail(404, "not_found", "سفارش پیدا نشد.");
    if (o.status !== from) return fail(409, "status_conflict", "وضعیت این سفارش پیش‌تر تغییر کرده است.");
    if (!TR[from].includes(to)) return fail(422, "invalid_transition", "این تغییر وضعیت مجاز نیست.");
    o.status = to; o.updated_at = Date.now(); if (reason) o.cancel_reason = reason;
    o.events.push({ from_status: from, to_status: to, actor: "demo", created_at: Date.now() });
    log("order.status", { number: o.number, from, to });
    return wait({ ok: true, status: to, next: TR[to] });
  },
  menu: () => wait({ ok: true, categories: db.menu }),
  createCategory(b) {
    if (db.menu.some((c) => c.id === b.id)) return fail(409, "duplicate", "دسته‌ای با این شناسه وجود دارد.");
    db.menu.push({ ...b, sort: db.menu.length, items: [] }); log("menu.category_create", { name: b.name });
    return wait({ ok: true, id: b.id });
  },
  updateCategory(id, b) { const c = db.menu.find((x) => x.id === id); Object.assign(c, b); log("menu.category_update", { name: c.name }); return wait({ ok: true }); },
  deleteCategory(id) {
    const c = db.menu.find((x) => x.id === id);
    if (c.items.length) return fail(409, "category_not_empty", "این دسته هنوز غذا دارد. ابتدا غذاها را جابه‌جا یا حذف کنید.");
    db.menu = db.menu.filter((x) => x.id !== id); return wait({ ok: true });
  },
  createItem(b) {
    const c = db.menu.find((x) => x.id === b.category_id);
    const it = { id: b.category_id + "-d" + Date.now(), meta: {}, removables: null, model_url: "", sort: c.items.length, ...b };
    c.items.push(it); log("menu.item_create", { name: it.name, price: it.price });
    return wait({ ok: true, item: it });
  },
  updateItem(id, b) {
    const it = allItems().find((x) => x.id === id);
    const before = { ...it };
    if (b.category_id && b.category_id !== it.category_id) {
      const from = db.menu.find((c) => c.id === it.category_id), to = db.menu.find((c) => c.id === b.category_id);
      from.items = from.items.filter((x) => x.id !== id); to.items.push(it);
    }
    Object.assign(it, b);
    log("menu.item_update", { name: it.name, price_from: b.price != null && b.price !== before.price ? before.price : undefined, price_to: b.price !== before.price ? b.price : undefined, available: "available" in b ? b.available : undefined, active: "active" in b ? b.active : undefined });
    return wait({ ok: true, item: it });
  },
  deleteItem(id) { db.menu.forEach((c) => (c.items = c.items.filter((x) => x.id !== id))); log("menu.item_delete", {}); return wait({ ok: true }); },
  reviews({ rating, visibility, flagged, q } = {}) {
    let rows = [...db.reviews];
    if (rating && rating !== "all") rows = rows.filter((r) => r.rating === +rating);
    if (visibility && visibility !== "all") rows = rows.filter((r) => r.visibility === visibility);
    if (flagged === "1") rows = rows.filter((r) => r.flagged);
    if (q) rows = rows.filter((r) => (r.comment + (r.item_name || "") + (r.author_name || "")).includes(q));
    return wait({ ok: true, reviews: rows, summary: reviewSummary(db.reviews), reply_supported: true });
  },
  updateReview(id, b) {
    if ("rating" in b) return fail(403, "rating_immutable", "امتیاز ثبت‌شده توسط مشتری قابل تغییر نیست.");
    const r = db.reviews.find((x) => x.id === id);
    if ("reply" in b) { r.reply = b.reply || null; r.reply_at = b.reply ? Date.now() : null; }
    if ("visibility" in b) r.visibility = b.visibility;
    if ("flagged" in b) { r.flagged = !!b.flagged; r.flag_reason = b.flagged ? b.flag_reason || "نامناسب" : null; }
    log("review.update", {});
    return wait({ ok: true, review: r });
  },
  leads({ status } = {}) {
    const rows = db.leads.filter((l) => !status || status === "all" || l.status === status);
    const counts = {};
    db.leads.forEach((l) => (counts[l.status] = (counts[l.status] || 0) + 1));
    return wait({ ok: true, leads: rows.map((l) => ({ id: l.id, restaurant_name: l.restaurant_name, phone_masked: l.phone.slice(0, 4) + "•••••" + l.phone.slice(-2), status: l.status, created_at: l.created_at, has_note: !!l.note })), counts });
  },
  lead: (id) => wait({ ok: true, lead: db.leads.find((l) => l.id === id) }),
  updateLead(id, b) { Object.assign(db.leads.find((l) => l.id === id), b); return wait({ ok: true }); },
  settings: () => wait({ ok: true, restaurant: db.restaurant, public_site_url: "https://hosseinasgari898989-dev.github.io/sepidar-restaurant-platform/" }),
  updateSettings(b) { Object.assign(db.restaurant, b); log("settings.update", { fields: Object.keys(b) }); return wait({ ok: true, restaurant: db.restaurant }); },
  qr: () => wait({ ok: true, configured: true, demo: true, restaurant_id: "demo", target_url: "https://hosseinasgari898989-dev.github.io/sepidar-restaurant-platform/?r=demo", customer_reads_param: false }),
  reports({ from, to } = {}) {
    const today = dayStart();
    const f = from ? Date.parse(from + "T00:00:00Z") - OFF : today - 6 * DAY;
    const t = (to ? Date.parse(to + "T00:00:00Z") - OFF : today) + DAY;
    const inR = (o, a, b) => o.created_at >= a && o.created_at < b;
    const rows = db.orders.filter((o) => inR(o, f, t)), prev = db.orders.filter((o) => inR(o, f - (t - f), f));
    const ok = (o) => o.status !== "cancelled";
    const days = [];
    for (let d = f; d < t; d += DAY) { const x = rows.filter((o) => inR(o, d, d + DAY)); days.push({ day_start: d, count: x.length, amount: x.filter(ok).reduce((a, o) => a + o.total, 0) }); }
    const by = {}; rows.forEach((o) => (by[o.status] = (by[o.status] || 0) + 1));
    const top = {}; rows.filter(ok).forEach((o) => o.lines.forEach((l) => { const k = l.name; top[k] ||= { name: l.name, emoji: l.emoji, qty: 0, amount: 0 }; top[k].qty += l.qty; top[k].amount += l.line_total; }));
    const rv = db.reviews.filter((r) => r.created_at >= f && r.created_at < t);
    return wait({ ok: true, range: { from: f, to: t }, totals: { count: rows.length, amount: rows.filter(ok).reduce((a, o) => a + o.total, 0), prev_count: prev.length, prev_amount: prev.filter(ok).reduce((a, o) => a + o.total, 0) }, days, by_status: by, top_items: Object.values(top).sort((a, b) => b.qty - a.qty).slice(0, 8), rating: reviewSummary(rv) });
  },
};
