import { html, esc, F, money, tile, safeColor, skeleton, errorBox, empty, sheet, confirmBox, busy, toast, toEnDigits } from "../ui.js";

const parsePrice = (v) => { const n = Number(toEnDigits(String(v)).replace(/[,\s٬]/g, "")); return Number.isInteger(n) ? n : NaN; };

export default {
  id: "menu", title: "منو و غذاها", short: "منو", icon: "🍔", perm: "menu",
  render(el, ctx) {
    let cats = [], cat = "all", q = "";
    el.innerHTML = html`
      <div class="view-h"><div><h2>مدیریت منو</h2><p>یک منوی مشترک: همان چیزی که مشتری در سایت سفارش می‌بیند</p></div>
        <div class="tools"><button class="btn ghost" data-newcat>🗂️ دسته جدید</button><button class="btn" data-new>＋ غذای جدید</button></div></div>
      <div class="note-box">ℹ️ <span>تغییرات پس از ذخیره موفق در سرور، از مسیر عمومی منو برای سایت مشتریان قابل دریافت‌اند. ${ctx.capability("image_upload") && !ctx.demo ? "" : "R2 هنوز فعال نشده؛ در دسته‌های عادی می‌توان آدرس HTTPS عکس را وارد کرد، اما دسته «سایر» تا اتصال R2 فقط در حالت نمایشی قابل پیش‌نمایش است."}</span></div>
      <div class="tools" style="margin-bottom:10px"><label class="search"><span class="sr">جستجوی غذا</span><input id="q" type="search" placeholder="جستجوی غذا…" maxlength="60"></label></div>
      <div class="chips" id="cf"></div>
      <div id="mn">${skeleton(3, 180)}</div>`.s;
    const mn = el.querySelector("#mn");

    async function load() {
      try { cats = (await ctx.api.menu()).categories; draw(); }
      catch (err) { mn.innerHTML = errorBox(err).s; }
    }
    function draw() {
      el.querySelector("#cf").innerHTML = [{ id: "all", name: "همه", emoji: "✨", items: cats.flatMap((c) => c.items) }, ...cats].map((c) => html`<button class="chip ${c.id === cat ? "on" : ""}" data-c="${c.id}">${c.emoji} ${c.name}<span class="ct num">${F(c.items.length)}</span></button>`.s).join("");
      const shown = cats.filter((c) => cat === "all" || c.id === cat);
      let out = "";
      shown.forEach((c) => {
        const items = c.items.filter((i) => !q || (i.name + i.description).includes(q));
        if (q && !items.length) return;
        out += html`<div class="cat-head"><h3>${c.emoji} ${c.name}</h3>${c.id === "other" ? html`<span class="badge">📷 عکس واقعی الزامی · بدون مدل سه‌بعدی</span>` : ""}<span class="mut num" style="font-size:13px">${F(c.items.length)} غذا · ${F(c.options.length)} گروه شخصی‌سازی</span><span class="sp"></span><button class="btn sm ghost" data-ec="${c.id}">✏️ دسته و گزینه‌ها</button><button class="btn sm soft" data-new="${c.id}">＋ غذا</button></div>
          ${items.length ? html`<div class="mgrid">${items.map((i) => card(c, i))}</div>` : empty("🍽️", "این دسته هنوز غذایی ندارد", "با «＋ غذا» اولین غذا را اضافه کنید.")}`.s;
      });
      mn.innerHTML = out || (cats.length ? empty("🔎", "غذایی پیدا نشد") : empty("🗂️", "منو خالی است", "ابتدا یک دسته بسازید.")).s;
    }
    const card = (c, i) => html`<article class="mcard ${i.active ? "" : "off"}" style="--c1:${safeColor(c.colors[0])};--c2:${safeColor(c.colors[1])}">
      <button class="ph" data-ei="${i.id}" aria-label="ویرایش ${i.name}">${i.image_url ? html`<img src="${i.image_url}" alt="${i.name}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : c.id === "other" ? html`<span class="other-photo-empty"><span class="icon">📷</span><small>عکس واقعی الزامی</small></span>` : html`<span class="fe">${i.emoji}</span>`}
        <span class="flags">${!i.active ? html`<span class="badge">غیرفعال</span>` : ""}${!i.available ? html`<span class="badge" style="background:#fff0f0;color:#b00">ناموجود</span>` : ""}</span></button>
      <div class="bd"><b>${i.name}</b><small>${i.description}</small><span class="pr num">${money(i.price)}</span></div>
      <div class="sw">
        <button class="tog" role="switch" aria-checked="${i.active}" data-t="active" data-id="${i.id}"><i></i>در منو</button>
        <button class="tog" role="switch" aria-checked="${i.available}" data-t="available" data-id="${i.id}"><i></i>موجود</button>
      </div></article>`;

    el.onclick = async (e) => {
      const t = e.target.closest("[data-t]");
      if (t) {
        if (t.disabled) return;
        const it = cats.flatMap((c) => c.items).find((x) => x.id === t.dataset.id), k = t.dataset.t, v = !it[k];
        t.disabled = true;
        try { await ctx.api.updateItem(it.id, { [k]: v }); it[k] = v; toast(`«${it.name}» ${k === "active" ? (v ? "در منو نمایش داده می‌شود" : "از منو پنهان شد") : v ? "موجود شد" : "ناموجود شد"}`); draw(); }
        catch (err) { toast(err.message, "err"); t.disabled = false; }
        return;
      }
      const c = e.target.closest("[data-c]"); if (c) { cat = c.dataset.c; return draw(); }
      const ei = e.target.closest("[data-ei]"); if (ei) return itemEditor(ctx, cats, cats.flatMap((x) => x.items).find((x) => x.id === ei.dataset.ei), load);
      const n = e.target.closest("[data-new]"); if (n) { if (!cats.length) return toast("ابتدا یک دسته بسازید.", "info"); return itemEditor(ctx, cats, null, load, n.dataset.new || (cat !== "all" ? cat : cats[0].id)); }
      const ec = e.target.closest("[data-ec]"); if (ec) return catEditor(ctx, cats.find((x) => x.id === ec.dataset.ec), load);
      if (e.target.closest("[data-newcat]")) return catEditor(ctx, null, load);
      if (e.target.closest("[data-retry]")) load();
    };
    let tm;
    el.querySelector("#q").oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value.trim(); draw(); }, 150); };
    load();
  },
};

// ---------------------------------------------------------------- ویرایش غذا
function itemEditor(ctx, cats, item, onSaved, catId) {
  const isNew = !item;
  const it = item ? JSON.parse(JSON.stringify(item)) : { name: "", description: "", price: "", emoji: "🍽️", image_url: "", category_id: catId, meta: {}, removables: null, active: true, available: true };
  const s = sheet("", { wide: true, label: isNew ? "غذای جدید" : "ویرایش غذا" });
  const render = () => {
    const c = cats.find((x) => x.id === it.category_id) || cats[0];
    const rem = it.removables ?? c.removables;
    s.set(html`
      <h3 style="font-size:20px;margin-bottom:12px">${isNew ? "غذای جدید" : "ویرایش غذا"}</h3>
      <div class="preview-card" id="pv">${c.id === "other" && !it.image_url ? html`<div class="other-photo-empty editor-photo-empty"><span class="icon">📷</span><small>برای پیش‌نمایش، عکس واقعی را بارگذاری کن</small></div>` : tile(it.emoji, c.colors, { size: "lg", img: it.image_url })}<div><b id="pvn">${it.name || "نام غذا"}</b><div class="mut" style="font-size:13px" id="pvd">${it.description || "توضیح کوتاه"}</div><b class="num" style="color:var(--or)" id="pvp">${Number.isInteger(parsePrice(it.price)) ? money(parsePrice(it.price)) : "—"}</b></div></div>
      <form id="f" novalidate><div class="form-grid">
        <label class="fld"><span>نام غذا</span><input name="name" value="${it.name}" maxlength="60" required></label>
        <label class="fld"><span>دسته</span><select name="category_id">${cats.map((x) => html`<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${x.emoji} ${x.name}${x.id === "other" ? " · فقط عکس واقعی" : ""}</option>`)}</select></label>
        <label class="fld"><span>قیمت پایه <small>(تومان)</small></span><input name="price" value="${it.price === "" ? "" : F(it.price).replace(/٬/g, "")}" inputmode="numeric" required></label>
        <label class="fld"><span>ایموجی <small>(دسته‌های عادی بدون عکس، مدل سه‌بعدی دارند؛ «سایر» فقط عکس واقعی می‌پذیرد)</small></span><input name="emoji" value="${it.emoji}" maxlength="8"></label>
        <label class="fld full"><span>توضیحات</span><input name="description" value="${it.description}" maxlength="200"></label>
        <label class="fld full"><span>آدرس عکس <small>(در صورت آپلود R2، خودکار پر می‌شود)</small></span><input name="image_url" value="${it.image_url}" maxlength="500" inputmode="url" dir="ltr" placeholder="https://…/media/main/…"></label>
        <label class="fld full"><span>بارگذاری عکس محصول <small>JPEG / PNG / WebP / AVIF · حداکثر ۵ مگابایت</small></span><input name="image_file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"></label>
        <small id="imageUploadHelp" class="mut full"></small><div class="full image-upload-actions"><button class="btn soft" type="button" id="uploadImage">📷 بارگذاری عکس</button><span class="mut" id="imageUploadStatus" aria-live="polite"></span></div>
        ${c.id === "other" ? html`<div class="note-box warn full">دسته «سایر» مدل سه‌بعدی خودکار ندارد؛ برای این دسته باید عکس واقعی محصول را بارگذاری کنی.</div>` : ""}
      </div>
      ${c.options.some((g) => g.type === "one") ? html`<div class="section-t">⚙️ گزینه پیش‌فرض این غذا</div><p class="mut" style="font-size:13px;margin:0 0 8px">قیمت پایه برای همین گزینه‌هاست؛ تغییر آن توسط مشتری، اختلاف قیمت را اعمال می‌کند (مثل برگر مرغ با پروتئین مرغ).</p>
        <div class="form-grid">${c.options.map((g, gi) => g.type === "one" ? html`<label class="fld"><span>${g.t}</span><select data-def="${gi}">${g.list.map((o, oi) => html`<option value="${oi}" ${((it.meta.s || {})[gi] || 0) === oi ? "selected" : ""}>${o[0]}${o[1] ? ` (${o[1] > 0 ? "+" : "−"}${F(Math.abs(o[1]))})` : ""}</option>`)}</select></label>` : "")}</div>` : ""}
      ${c.removables.length ? html`<div class="section-t">✂️ مواد قابل حذف برای این غذا</div><p class="mut" style="font-size:13px;margin:0 0 8px">فقط موارد انتخاب‌شده به مشتری نمایش داده می‌شوند. فهرست کلی را در «دسته و گزینه‌ها» مدیریت کنید.</p>
        <div class="checks">${c.removables.map((r) => html`<label><input type="checkbox" data-rm value="${r}" ${rem.includes(r) ? "checked" : ""}>${r}</label>`)}</div>` : ""}
      <div class="section-t">👁️ وضعیت</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap"><button type="button" class="tog" role="switch" aria-checked="${it.active}" data-sw="active"><i></i>نمایش در منو</button><button type="button" class="tog" role="switch" aria-checked="${it.available}" data-sw="available"><i></i>موجود است</button></div>
      <p class="err" id="fe"></p>
      <div class="actbar"><button class="btn" type="submit" id="sv">${isNew ? "افزودن به منو" : "ذخیره تغییرات"}</button>${!isNew ? html`<button class="btn danger ghost" type="button" id="del" style="flex:0 0 auto">🗑️ حذف</button>` : ""}</div>
      </form>`);
    const f = s.body.querySelector("#f");
    const uploadButton = s.body.querySelector("#uploadImage");
    const uploadHelp = s.body.querySelector("#imageUploadHelp");
    uploadHelp.textContent = ctx.demo ? "حالت نمایشی: عکس فقط پیش‌نمایش محلی است و در سرور ذخیره نمی‌شود." : ctx.capability("image_upload") ? "پس از آپلود، عکس در R2 ذخیره و در منوی مشترک مشتری/مدیریت نمایش داده می‌شود." : "R2 هنوز در Cloudflare فعال نشده؛ آپلود واقعی تا زمان اتصال فضای ذخیره‌سازی در دسترس نیست.";
    if (!ctx.demo && !ctx.capability("image_upload")) uploadButton.disabled = true;
    const sync = () => {
      it.name = f.name.value; it.description = f.description.value; it.emoji = f.emoji.value || "🍽️"; it.image_url = f.image_url.value.trim(); it.price = f.price.value;
      s.body.querySelector("#pvn").textContent = it.name || "نام غذا";
      s.body.querySelector("#pvd").textContent = it.description || "توضیح کوتاه";
      const p = parsePrice(it.price);
      s.body.querySelector("#pvp").textContent = Number.isInteger(p) ? money(p) : "—";
      const emoji = s.body.querySelector("#pv .fe"); if (emoji) emoji.textContent = it.emoji;
    };
    f.oninput = (e) => { if (e.target.name === "category_id") return; sync(); };
    f.image_url.onchange = () => { sync(); render(); };
    f.category_id.onchange = () => { sync(); it.category_id = f.category_id.value; it.meta = { ...it.meta, s: {} }; it.removables = null; render(); };
    s.body.querySelectorAll("[data-sw]").forEach((b) => (b.onclick = () => { it[b.dataset.sw] = !it[b.dataset.sw]; b.setAttribute("aria-checked", it[b.dataset.sw]); }));
    uploadButton.onclick = async () => {
      const file = f.querySelector('[name="image_file"]').files?.[0];
      const status = s.body.querySelector("#imageUploadStatus");
      if (!file) { status.textContent = "ابتدا یک فایل عکس انتخاب کن."; return; }
      if (!["image/jpeg","image/png","image/webp","image/avif"].includes(file.type) || file.size < 16 || file.size > 5*1024*1024) { status.textContent = "فقط JPEG/PNG/WebP/AVIF با حداکثر ۵ مگابایت مجاز است."; return; }
      if (ctx.demo) {
        const reader = new FileReader();
        reader.onload = () => { it.image_url = String(reader.result || ""); render(); s.body.querySelector("#imageUploadStatus").textContent = "پیش‌نمایش محلی آماده شد؛ در سرور ذخیره نشده است."; };
        reader.onerror = () => { status.textContent = "خواندن فایل عکس ناموفق بود."; };
        reader.readAsDataURL(file); return;
      }
      if (!ctx.capability("image_upload")) { status.textContent = "برای آپلود واقعی باید R2 به Worker متصل شود."; return; }
      busy(uploadButton, async () => {
        try { const out = await ctx.api.uploadImage(file); it.image_url = out.image_url; render(); s.body.querySelector("#imageUploadStatus").textContent = "عکس در R2 ذخیره شد."; }
        catch (err) { const el = s.body.querySelector("#imageUploadStatus"); if (el) el.textContent = err.message || "آپلود عکس ناموفق بود."; }
      });
    };
    f.onsubmit = (e) => {
      e.preventDefault(); sync();
      const fe = s.body.querySelector("#fe"), price = parsePrice(it.price);
      if (!it.name.trim()) return (fe.textContent = "نام غذا الزامی است.");
      if (!Number.isInteger(price) || price < 0) return (fe.textContent = "قیمت باید یک عدد صحیح (تومان) باشد.");
      if (it.image_url && !/^https?:\/\//i.test(it.image_url) && !(ctx.demo && it.image_url.startsWith("data:image/"))) return (fe.textContent = "آدرس عکس باید با https:// شروع شود.");
      if (f.category_id.value === "other" && (!it.image_url || !it.image_url.includes("/media/")) && !ctx.demo) return (fe.textContent = "برای دسته «سایر» باید عکس واقعی را در R2 بارگذاری کنید.");
      const sdef = {};
      s.body.querySelectorAll("[data-def]").forEach((x) => { if (+x.value) sdef[x.dataset.def] = +x.value; });
      const removables = c.removables.length ? [...s.body.querySelectorAll("[data-rm]:checked")].map((x) => x.value) : null;
      const body = { name: it.name.trim(), category_id: f.category_id.value, price, emoji: it.emoji, description: it.description.trim(), image_url: it.image_url || null, active: it.active, available: it.available, meta: { ...it.meta, s: sdef }, removables };
      busy(s.body.querySelector("#sv"), async () => {
        try {
          isNew ? await ctx.api.createItem(body) : await ctx.api.updateItem(item.id, body);
          toast(isNew ? `«${body.name}» به منو اضافه شد` : "تغییرات ذخیره شد");
          s.close(); onSaved();
        } catch (err) { fe.textContent = err.message; }
      });
    };
    const del = s.body.querySelector("#del");
    if (del) del.onclick = async () => {
      if (!(await confirmBox({ title: `حذف «${item.name}»؟`, text: "غذا از منوی مشتریان حذف می‌شود. سفارش‌های قبلی دست‌نخورده می‌مانند.", ok: "حذف شود", danger: true }))) return;
      busy(del, async () => { try { await ctx.api.deleteItem(item.id); toast("غذا حذف شد"); s.close(); onSaved(); } catch (err) { toast(err.message, "err"); } });
    };
  };
  render();
}

// ---------------------------------------------------------------- دسته و گزینه‌های شخصی‌سازی
function catEditor(ctx, cat, onSaved) {
  const isNew = !cat;
  const c = cat ? JSON.parse(JSON.stringify(cat)) : { id: "", name: "", emoji: "🍽️", colors: ["#ffe0c2", "#ffb36b"], options: [], removables: [] };
  const s = sheet("", { wide: true, label: isNew ? "دسته جدید" : "ویرایش دسته" });
  const collect = () => {
    const b = s.body;
    if (isNew) c.id = b.querySelector("[name=id]").value.trim().toLowerCase();
    c.name = b.querySelector("[name=name]").value; c.emoji = b.querySelector("[name=emoji]").value;
    c.colors = [b.querySelector("[name=c1]").value, b.querySelector("[name=c2]").value];
    c.options = [...b.querySelectorAll(".optg")].map((g) => ({ t: g.querySelector("[data-gt]").value, type: g.querySelector("[data-gy]").value, list: [...g.querySelectorAll(".optrow")].map((r) => [r.querySelector("[data-on]").value, r.querySelector("[data-op]").value]) }));
  };
  const render = () => {
    s.set(html`
      <h3 style="font-size:20px;margin-bottom:12px">${isNew ? "دسته جدید" : `ویرایش «${c.name}»`}</h3>
      <div class="preview-card">${tile(c.emoji, c.colors, { size: "lg" })}<div><b>${c.name || "نام دسته"}</b><div class="mut" style="font-size:13px">گزینه‌ها و مواد قابل حذف این دسته، دقیقاً همان‌هایی‌اند که مشتری در پنجره شخصی‌سازی می‌بیند.</div></div></div>
      <div class="form-grid">
        ${isNew ? html`<label class="fld"><span>شناسه لاتین <small>(مثل pasta)</small></span><input name="id" value="${c.id}" dir="ltr" maxlength="32" pattern="[a-z][a-z0-9-]+"></label>` : html`<input type="hidden" name="id" value="${c.id}">`}
        <label class="fld"><span>نام دسته</span><input name="name" value="${c.name}" maxlength="40"></label>
        <label class="fld"><span>ایموجی</span><input name="emoji" value="${c.emoji}" maxlength="8"></label>
        <label class="fld"><span>رنگ‌های پس‌زمینه کاشی</span><span style="display:flex;gap:8px"><input type="color" name="c1" value="${safeColor(c.colors[0])}" style="padding:4px;height:46px"><input type="color" name="c2" value="${safeColor(c.colors[1])}" style="padding:4px;height:46px"></span></label>
      </div>
      <div class="section-t">⚙️ گروه‌های شخصی‌سازی</div>
      <p class="mut" style="font-size:13px;margin:0 0 10px">«تک‌انتخابی» مثل سایز یا نوع خمیر؛ «چندانتخابی» مثل افزودنی‌ها. قیمت مثبت = گران‌تر، منفی = ارزان‌تر. در گروه تک‌انتخابی اولین گزینه پیش‌فرض است.</p>
      <div id="groups">${c.options.map((g, gi) => html`<div class="optg" data-g="${gi}">
        <div class="gh"><input data-gt value="${g.t}" placeholder="عنوان گروه (مثلاً سایز)" maxlength="60"><select data-gy><option value="one" ${g.type === "one" ? "selected" : ""}>تک‌انتخابی</option><option value="many" ${g.type === "many" ? "selected" : ""}>چندانتخابی</option></select><button class="icon-btn" data-dg="${gi}" aria-label="حذف گروه">🗑️</button></div>
        ${g.list.map((o, oi) => html`<div class="optrow"><input data-on value="${o[0]}" placeholder="نام گزینه" maxlength="60" aria-label="نام گزینه"><input data-op value="${o[1]}" inputmode="numeric" dir="ltr" aria-label="قیمت اضافه (تومان)" placeholder="0"><button class="icon-btn" data-do="${gi}:${oi}" aria-label="حذف گزینه">✕</button></div>`)}
        <button class="btn sm ghost" data-ao="${gi}">＋ گزینه</button></div>`)}</div>
      <button class="btn sm soft" data-ag>＋ گروه شخصی‌سازی</button>
      <div class="section-t">✂️ مواد قابل حذف</div>
      <div class="checks" id="rms">${c.removables.map((r, i) => html`<span class="chip">${r}<button class="x" data-dr="${i}" aria-label="حذف ${r}" style="border:0;background:none;color:#b00">✕</button></span>`)}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><input class="inp" id="nr" placeholder="مثلاً: بدون پیاز" maxlength="40"><button class="btn sm ghost" data-ar>افزودن</button></div>
      <p class="err" id="fe"></p>
      <div class="actbar"><button class="btn" id="sv">${isNew ? "ساخت دسته" : "ذخیره دسته"}</button>${!isNew ? html`<button class="btn danger ghost" id="del" style="flex:0 0 auto">🗑️ حذف دسته</button>` : ""}</div>`);
  };
  s.body.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (d.ag != null) { collect(); c.options.push({ t: "", type: "one", list: [["", 0]] }); return render(); }
    if (d.ao != null) { collect(); c.options[+d.ao].list.push(["", 0]); return render(); }
    if (d.dg != null) { collect(); c.options.splice(+d.dg, 1); return render(); }
    if (d.do != null) { collect(); const [g, o] = d.do.split(":").map(Number); c.options[g].list.splice(o, 1); return render(); }
    if (d.dr != null) { collect(); c.removables.splice(+d.dr, 1); return render(); }
    if (d.ar != null) { collect(); const v = s.body.querySelector("#nr").value.trim(); if (v && !c.removables.includes(v)) c.removables.push(v); return render(); }
    if (b.id === "sv") {
      collect();
      const fe = s.body.querySelector("#fe");
      if (isNew && !/^[a-z][a-z0-9-]{1,31}$/.test(c.id)) return (fe.textContent = "شناسه باید با حروف لاتین کوچک شروع شود (مثل pasta).");
      if (!c.name.trim()) return (fe.textContent = "نام دسته الزامی است.");
      const options = [];
      for (const g of c.options) {
        if (!g.t.trim()) return (fe.textContent = "عنوان همه گروه‌ها را وارد کنید.");
        const list = g.list.filter((o) => o[0].trim()).map((o) => [o[0].trim(), parsePrice(o[1] === "" ? 0 : String(o[1]).replace("−", "-"))]);
        if (!list.length) return (fe.textContent = `گروه «${g.t}» حداقل یک گزینه لازم دارد.`);
        if (list.some((o) => !Number.isInteger(o[1]))) return (fe.textContent = `قیمت‌های گروه «${g.t}» باید عدد صحیح باشند.`);
        options.push({ t: g.t.trim(), type: g.type, list });
      }
      const body = { name: c.name.trim(), emoji: c.emoji || "🍽️", colors: c.colors, options, removables: c.removables };
      return busy(b, async () => {
        try { isNew ? await ctx.api.createCategory({ id: c.id, ...body }) : await ctx.api.updateCategory(cat.id, body); toast("دسته ذخیره شد"); s.close(); onSaved(); }
        catch (err) { fe.textContent = err.message; }
      });
    }
    if (b.id === "del") {
      if (!(await confirmBox({ title: `حذف دسته «${cat.name}»؟`, text: cat.items.length ? "این دسته هنوز غذا دارد؛ سرور اجازه حذف نمی‌دهد مگر غذاها جابه‌جا یا حذف شوند." : "دسته از منو حذف می‌شود.", ok: "حذف شود", danger: true }))) return;
      return busy(b, async () => { try { await ctx.api.deleteCategory(cat.id); toast("دسته حذف شد"); s.close(); onSaved(); } catch (err) { toast(err.message, "err"); } });
    }
  };
  render();
}
