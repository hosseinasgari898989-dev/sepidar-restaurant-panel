import { ApiError } from "./http.js";
import { parseJson } from "./util.js";

export async function loadMenu(db, restaurantId, { includeInactive = false } = {}) {
  const cats = (await db.prepare("SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort, name").bind(restaurantId).all()).results;
  const items = (await db.prepare(
    `SELECT * FROM menu_items WHERE restaurant_id = ? AND archived = 0 ${includeInactive ? "" : "AND active = 1"} ORDER BY sort, name`
  ).bind(restaurantId).all()).results;
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    colors: [c.color1 || "#ffe0c2", c.color2 || "#ffb36b"],
    options: parseJson(c.options, []),
    removables: parseJson(c.removables, []),
    sort: c.sort,
    items: items.filter((i) => i.category_id === c.id).map(itemOut),
  }));
}

export function itemOut(i) {
  return {
    id: i.id,
    category_id: i.category_id,
    name: i.name,
    description: i.description || "",
    price: i.price,
    emoji: i.emoji || "🍽️",
    image_url: i.image_url || "",
    model_url: i.model_url || "",
    meta: parseJson(i.meta, {}),
    removables: parseJson(i.removables, null),
    active: !!i.active,
    available: !!i.available,
    sort: i.sort,
    updated_at: i.updated_at,
  };
}

// خروجی دقیقاً هم‌شکل آرایه CATS در index.html تا سایت مشتریان بدون بازنویسی از آن استفاده کند.
// هر غذا: [نام, توضیح, قیمت, ایموجی, عکس, مدل, meta] ؛ meta.id شناسه سرور و meta.na یعنی ناموجود
export function toCustomerCats(menu) {
  return menu.map((c) => ({
    id: c.id,
    n: c.name,
    e: c.emoji,
    c: c.colors,
    opts: c.options,
    rem: c.removables,
    items: c.items.map((i) => [i.name, i.description, i.price, i.emoji, i.image_url, i.model_url, { ...i.meta, id: i.id, ...(i.available ? {} : { na: 1 }), ...(i.removables ? { rm: i.removables } : {}) }]),
  })).filter((c) => c.items.length);
}

// همان فرمول calc در سایت مشتری: قیمت پایه + گزینه‌های انتخاب‌شده − گزینه‌های پیش‌فرض
export function priceLine(category, item, selection, removed) {
  const opts = category.options || [];
  const defaults = opts.map((g, gi) => (g.type === "one" ? [(item.meta && item.meta.s && item.meta.s[gi]) || 0] : []));
  const chosen = opts.map((g, gi) => {
    const want = selection && Array.isArray(selection[g.t]) ? selection[g.t] : null;
    if (!want) return defaults[gi];
    const idx = [...new Set(want.map((n) => g.list.findIndex((x) => x[0] === n)))];
    if (idx.some((i) => i < 0)) throw new ApiError(422, "invalid_option", `گزینه انتخاب‌شده برای «${g.t}» معتبر نیست.`);
    if (g.type === "one" && idx.length !== 1) throw new ApiError(422, "invalid_option", `برای «${g.t}» دقیقاً یک گزینه انتخاب کنید.`);
    return idx;
  });
  const sum = (sel) => opts.reduce((a, g, gi) => a + sel[gi].reduce((b, i) => b + (g.list[i] ? g.list[i][1] : 0), 0), 0);
  const unit = item.price + sum(chosen) - sum(defaults);
  const options = [];
  opts.forEach((g, gi) => chosen[gi].forEach((i) => {
    // گزینه پیش‌فرض رایگان گروه تک‌انتخابی برچسب نمی‌خورد (مثل سایت مشتری فقط تغییرات مهم‌اند)
    const isDefault = g.type === "one" && defaults[gi][0] === i;
    options.push({ g: g.t, n: g.list[i][0], p: g.list[i][1], d: isDefault ? 1 : 0 });
  }));
  const allowedRem = item.removables || category.removables || [];
  const rem = [...new Set((removed || []).map(String))];
  if (rem.some((r) => !allowedRem.includes(r))) throw new ApiError(422, "invalid_removal", "یکی از مواد حذف‌شده برای این غذا مجاز نیست.");
  return { unit: Math.max(0, unit), options, removed: rem };
}

export function validateOptions(groups) {
  if (!Array.isArray(groups) || groups.length > 12) throw new ApiError(422, "validation_error", "گروه‌های شخصی‌سازی معتبر نیستند.");
  return groups.map((g) => {
    const t = typeof g.t === "string" ? g.t.trim().slice(0, 60) : "";
    if (!t) throw new ApiError(422, "validation_error", "عنوان گروه شخصی‌سازی الزامی است.");
    if (g.type !== "one" && g.type !== "many") throw new ApiError(422, "validation_error", `نوع گروه «${t}» معتبر نیست.`);
    if (!Array.isArray(g.list) || !g.list.length || g.list.length > 20) throw new ApiError(422, "validation_error", `گزینه‌های گروه «${t}» معتبر نیستند.`);
    const names = new Set();
    const list = g.list.map((x) => {
      const n = Array.isArray(x) && typeof x[0] === "string" ? x[0].trim().slice(0, 60) : "";
      const p = Array.isArray(x) ? Number(x[1]) : NaN;
      if (!n || !Number.isInteger(p) || Math.abs(p) > 100000000) throw new ApiError(422, "validation_error", `یکی از گزینه‌های «${t}» نام یا قیمت معتبر ندارد.`);
      if (names.has(n)) throw new ApiError(422, "validation_error", `گزینه «${n}» در «${t}» تکراری است.`);
      names.add(n);
      return [n, p];
    });
    return { t, type: g.type, list };
  });
}

export function validateRemovables(list) {
  if (!Array.isArray(list) || list.length > 30) throw new ApiError(422, "validation_error", "فهرست مواد قابل حذف معتبر نیست.");
  return [...new Set(list.map((s) => String(s).trim().slice(0, 40)).filter(Boolean))];
}
