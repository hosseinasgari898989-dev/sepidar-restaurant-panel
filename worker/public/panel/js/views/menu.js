import { html, esc, F, money, tile, safeColor, skeleton, errorBox, empty, sheet, confirmBox, busy, toast, toEnDigits } from "../ui.js";

const parsePrice = (v) => { const n = Number(toEnDigits(String(v)).replace(/[,\s٬]/g, "")); return Number.isInteger(n) ? n : NaN; };

export default {
  id: "menu", title: "منو و غذاها", short: "منو", icon: "🍔", perm: "menu",
  render(el, ctx) {
    let cats = [], cat = "all", q = "", selectedPriceItemId = "", lastPriceSearchItemId = "";
    el.innerHTML = html`
      <div class="view-h"><div><h2>مدیریت منو</h2><p>یک منوی مشترک: همان چیزی که مشتری در سایت سفارش می‌بیند</p></div>
        <div class="tools"><button class="btn ghost" data-newcat>🗂️ دسته جدید</button><button class="btn" data-new>＋ غذای جدید</button></div></div>
      <div class="note-box">ℹ️ <span>تغییرات پس از ذخیره موفق در سرور، از مسیر عمومی منو برای سایت مشتریان قابل دریافت‌اند. ${ctx.capability("image_upload") && !ctx.demo ? "آپلود تصاویر از طریق ImageKit انجام می‌شود." : "برای آپلود واقعی تصویر، اتصال ImageKit در Worker باید فعال باشد."}</span></div>
      <section class="price-search-workspace" aria-labelledby="priceSearchHeading">
        <div class="price-search-workspace-head">
          <div><h3 id="priceSearchHeading">🔎 جستجوی قیمت روز</h3><p>یک غذای ثبت‌شده را انتخاب کن تا قیمت منوی رستوران‌های دیگر را در منابع وب بررسی کنیم.</p></div>
          <span class="price-search-plan">جستجوی وب · Tavily</span>
        </div>
        <div class="price-search-controls">
          <label class="fld price-search-product"><span>غذای ثبت‌شده در سپیدار</span><select id="priceSearchItem"><option value="">در حال بارگذاری منو…</option></select><small id="priceSearchCurrentPrice" class="mut"></small></label>
          <label class="fld price-search-region"><span>شهر یا منطقه</span><input id="priceSearchRegion" value="ایران" maxlength="80" placeholder="مثلاً تهران یا قم"></label>
          <button type="button" class="btn" id="priceSearchRun" disabled>🔎 جستجوی قیمت</button>
        </div>
        <p class="price-search-hint">نتایج قدیمی و نامرتبط فیلتر می‌شوند. قیمت پیشنهادی فقط وقتی واحد پول مشخص باشد نشان داده می‌شود؛ هیچ قیمتی بدون تأیید تو ذخیره نمی‌شود.</p>
        <div id="priceSearchResults" aria-live="polite"></div>
      </section>
      <div class="tools menu-search-tools" style="margin-bottom:10px"><label class="search"><span class="sr">جستجوی غذا</span><input id="q" type="search" placeholder="جستجوی غذا در منوی خودت…" maxlength="60"></label></div>
      <div class="tools" style="margin-bottom:10px"><label class="search"><span class="sr">جستجوی غذا</span><input id="q" type="search" placeholder="جستجوی غذا…" maxlength="60"></label></div>
      <div class="chips" id="cf"></div>
      <div id="mn">${skeleton(3, 180)}</div>`.s;
    const mn = el.querySelector("#mn");

    async function load() {
      try { cats = (await ctx.api.menu()).categories; draw(); }
      catch (err) { mn.innerHTML = errorBox(err).s; }
    }
    function drawPricePicker() {
      const select = el.querySelector("#priceSearchItem");
      if (!select) return;
      const allItems = cats.flatMap((category) => category.items.map((item) => ({ category, item })));
      if (!allItems.some(({ item }) => item.id === selectedPriceItemId)) selectedPriceItemId = allItems[0]?.item.id || "";
      select.innerHTML = [
        html`<option value="">غذای موردنظر را انتخاب کن…</option>`.s,
        ...allItems.map(({ category, item }) => html`<option value="${item.id}" ${item.id === selectedPriceItemId ? "selected" : ""}>${category.name} · ${item.name} — ${money(item.price)} تومان</option>`.s),
      ].join("");
      select.value = selectedPriceItemId;
      select.disabled = allItems.length === 0;
      const customSelect = select.closest(".sp-select");
      const customValue = customSelect?.querySelector(".sp-select-value");
      const customTrigger = customSelect?.querySelector(".sp-select-trigger");
      if (customValue) customValue.textContent = select.selectedOptions[0]?.textContent?.trim() || "غذای موردنظر را انتخاب کن…";
      if (customTrigger) customTrigger.disabled = allItems.length === 0;
      el.querySelector("#priceSearchRun").disabled = allItems.length === 0;
      const current = allItems.find(({ item }) => item.id === selectedPriceItemId)?.item;
      el.querySelector("#priceSearchCurrentPrice").textContent = current ? `قیمت فعلی در سپیدار: ${money(current.price)} تومان` : "برای جستجو ابتدا یک غذا به منو اضافه کن.";
    }
    function draw() {
      drawPricePicker();
      el.querySelector("#cf").innerHTML = [{ id: "all", name: "همه", emoji: "✨", items: cats.flatMap((c) => c.items) }, ...cats].map((c) => html`<button class="chip ${c.id === cat ? "on" : ""}" data-c="${c.id}">${c.emoji} ${c.name}<span class="ct num">${F(c.items.length)}</span></button>`.s).join("");
      const shown = cats.filter((c) => cat === "all" || c.id === cat);
      let out = "";
      shown.forEach((c) => {
        const items = c.items.filter((i) => !q || (i.name + i.description).includes(q));
        if (q && !items.length) return;
        out += html`<section class="cat-section"><div class="cat-head">
          <div class="cat-head-main">
            <div class="cat-title-row"><h3>${c.emoji} ${c.name}</h3>${c.id === "other" ? html`<span class="badge photo-only-badge">📷 فقط عکس واقعی</span>` : ""}</div>
            <span class="mut num cat-count">${F(c.items.length)} غذا · ${F(c.options.length)} گروه شخصی‌سازی</span>
          </div>
          <div class="cat-head-actions"><button class="btn sm ghost" data-ec="${c.id}">✏️ دسته و گزینه‌ها</button><button class="btn sm soft" data-new="${c.id}">＋ غذا</button></div>
        </div>
        ${items.length ? html`<div class="mgrid">${items.map((i) => card(c, i))}</div>` : empty("🍽️", "این دسته هنوز غذایی ندارد", "با «＋ غذا» اولین غذا را اضافه کنید.")}
        </section>`.s;
      });
      mn.innerHTML = out || (cats.length ? empty("🔎", "غذایی پیدا نشد") : empty("🗂️", "منو خالی است", "ابتدا یک دسته بسازید.")).s;
    }
    const card = (c, i) => html`<article class="mcard ${i.active ? "" : "off"}" style="--c1:${safeColor(c.colors[0])};--c2:${safeColor(c.colors[1])}">
      <button class="ph" data-ei="${i.id}" aria-label="ویرایش ${i.name}">${i.image_url ? html`<img src="${i.image_url}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="fe">${i.emoji}</span>
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
    const priceSearchItem = el.querySelector("#priceSearchItem");
    const priceSearchRegion = el.querySelector("#priceSearchRegion");
    const priceSearchRun = el.querySelector("#priceSearchRun");
    const priceSearchResults = el.querySelector("#priceSearchResults");
    priceSearchItem.onchange = () => { selectedPriceItemId = priceSearchItem.value; lastPriceSearchItemId = ""; priceSearchResults.innerHTML = ""; drawPricePicker(); };
    priceSearchRun.onclick = async () => {
      const selected = cats.flatMap((category) => category.items.map((item) => ({ category, item }))).find(({ item }) => item.id === priceSearchItem.value);
      if (!selected) { priceSearchResults.innerHTML = html`<div class="note-box warn">ابتدا یکی از غذاهای ثبت‌شده را انتخاب کن.</div>`.s; return; }
      if (ctx.demo) { priceSearchResults.innerHTML = html`<div class="note-box warn">در حالت نمایشی، جستجوی زنده فعال نیست.</div>`.s; return; }
      selectedPriceItemId = selected.item.id;
      lastPriceSearchItemId = selected.item.id;
      const region = String(priceSearchRegion.value || "").trim() || "ایران";
      busy(priceSearchRun, async () => {
        priceSearchResults.innerHTML = html`<div class="price-search-loading">🔎 در حال جستجوی «${selected.item.name}» در منابع تازهٔ وب…</div>`.s;
        try {
          const result = await ctx.api.searchPrices({ item_id: selected.item.id, region });
          const results = Array.isArray(result.results) ? result.results : [];
          priceSearchResults.innerHTML = html`
            <div class="price-search-summary">
              <b>نتیجه برای «${result.target_item?.name || selected.item.name}»</b>
              <span>قیمت فعلی سپیدار: ${money(result.target_item?.current_price ?? selected.item.price)} تومان</span>
              <small>عبارت جستجو: <span dir="auto">${result.query || selected.item.name}</span></small>
            </div>
            <div class="price-search-warning">${result.warning || "منبع، شهر، تاریخ و واحد پول را پیش از هر تغییری بررسی کن."}</div>
            ${results.length ? results.map((source) => html`<article class="price-search-result" data-source-title="${source.title}">
              <a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title || "منبع قیمت"} ↗</a>
              <small>${source.published_at ? "تاریخ منبع: " + new Date(source.published_at).toLocaleDateString("fa-IR") : "تاریخ انتشار مشخص نیست"}</small>
              <p>${source.snippet || "برای جزئیات، منبع را باز کن."}</p>
              <div class="price-search-apply">
                ${source.candidate_price ? html`<strong>${money(source.candidate_price)} تومان</strong><button type="button" class="btn sm" data-apply-price="${source.candidate_price}" data-apply-item="${selected.item.id}">اعمال به این غذا</button>` : html`<span class="mut price-search-no-price">قیمت قابل‌اعتماد با واحد مشخص از این منبع استخراج نشد.</span>`}
              </div>
            </article>`).join("") : html`<div class="price-search-empty"><b>منبع مرتبط و به‌روز پیدا نشد.</b><p>این بهتر از نمایش قیمت نامرتبط است. نام دقیق‌تر، شهر دیگری یا غذای مشابهی را انتخاب کن.</p></div>`}
            <small class="mut price-search-time">زمان جستجو: ${new Date(result.fetched_at || Date.now()).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" })}</small>
          `.s;
        } catch (err) {
          priceSearchResults.innerHTML = html`<div class="note-box warn"><b>جستجو انجام نشد</b><span>${err.message || "خطای دریافت قیمت"}؛ اتصال و سهمیهٔ سرویس جستجو را بررسی کن.</span></div>`.s;
        }
      });
    };
    priceSearchResults.onclick = async (event) => {
      const button = event.target.closest("[data-apply-price]");
      if (!button) return;
      const itemId = button.dataset.applyItem;
      const current = cats.flatMap((category) => category.items).find((item) => item.id === itemId);
      const price = Number(button.dataset.applyPrice);
      if (!current || itemId !== lastPriceSearchItemId || !Number.isSafeInteger(price) || price < 1000) { toast("این پیشنهاد دیگر معتبر نیست؛ دوباره جستجو کن.", "err"); return; }
      const source = button.closest("[data-source-title]")?.dataset.sourceTitle || "منبع وب";
      if (!(await confirmBox({ title: "اعمال قیمت پیشنهادی؟", text: `قیمت ${money(price)} تومان از «${source}» برای «${current.name}» جایگزین قیمت فعلی ${money(current.price)} تومان شود؟ قبل از تأیید، واحد و جزئیات منبع را بررسی کن.`, ok: "اعمال قیمت", danger: false }))) return;
      busy(button, async () => {
        try { await ctx.api.updateItem(current.id, { price }); current.price = price; draw(); toast(`قیمت «${current.name}» به‌روزرسانی شد.`); }
        catch (err) { toast(err.message || "ذخیرهٔ قیمت ناموفق بود.", "err"); }
      });
    };
    let tm;
    el.querySelector("#q").oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value.trim(); draw(); }, 150); };
    load();
  },
};

function isImageKitFoodPhoto(value) {
  try {
    const u = new URL(String(value || ""));
    if (u.protocol !== "https:" || u.hostname !== "ik.imagekit.io" || u.hash) return false;
    if (!/^\/amup8gp0i\/sepidar\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_-]{20,90}\.(?:jpg|png|webp|avif)$/i.test(u.pathname)) return false;
    const params = [...u.searchParams.entries()];
    return !params.length || (params.length === 1 && params[0][0] === "updatedAt" && /^\d{1,16}$/.test(params[0][1]));
  } catch { return false; }
}
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
      <div class="preview-card" id="pv">${tile(it.emoji, c.colors, { size: "lg", img: it.image_url })}<div><b id="pvn">${it.name || "نام غذا"}</b><div class="mut" style="font-size:13px" id="pvd">${it.description || "توضیح کوتاه"}</div><b class="num" style="color:var(--or)" id="pvp">${Number.isInteger(parsePrice(it.price)) ? money(parsePrice(it.price)) : "—"}</b></div></div>
      <form id="f" novalidate><div class="form-grid">
        <label class="fld"><span>نام غذا</span><input name="name" value="${it.name}" maxlength="60" required></label>
        <label class="fld"><span>دسته</span><select name="category_id">${cats.map((x) => html`<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${x.emoji} ${x.name}${x.id === "other" ? " · فقط عکس واقعی" : ""}</option>`)}</select></label>
        <label class="fld"><span>قیمت پایه <small>(تومان)</small></span><input name="price" value="${it.price === "" ? "" : F(it.price).replace(/٬/g, "")}" inputmode="numeric" required></label>
        ${c.id !== "other" ? html`<label class="fld"><span>ایموجی / نماد غذا</span><input name="emoji" value="${it.emoji}" maxlength="8"></label>` : html`<div class="note-box warn full">📷 دسته «سایر» فقط عکس واقعی می‌پذیرد؛ مدل سه‌بعدی، ایموجی و شخصی‌سازی برای این دسته خاموش است.</div>`}
        <label class="fld full"><span>توضیحات</span><input name="description" value="${it.description}" maxlength="200"></label>
        <label class="fld full"><span>آدرس عکس <small>(بعد از آپلود در ImageKit خودکار پر می‌شود)</small></span><input name="image_url" value="${it.image_url}" maxlength="500" inputmode="url" dir="ltr" placeholder="https://ik.imagekit.io/amup8gp0i/sepidar/main/…"></label>
        <label class="fld full"><span>بارگذاری عکس محصول <small>JPEG / PNG / WebP / AVIF · حداکثر ۵ مگابایت</small></span><input name="image_file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"></label>
        <small id="imageUploadHelp" class="mut full"></small><div class="full image-upload-actions"><button class="btn soft" type="button" id="uploadImage">📷 بارگذاری عکس</button><span class="mut" id="imageUploadStatus" aria-live="polite"></span></div>
        ${c.id === "other" ? html`<div class="note-box warn full">دسته «سایر» مدل سه‌بعدی خودکار ندارد؛ برای این دسته باید عکس واقعی محصول را بارگذاری کنی.</div>` : ""}
      </div>
      ${c.id !== "other" && c.options.some((g) => g.type === "one") ? html`<div class="section-t">⚙️ گزینه پیش‌فرض این غذا</div><p class="mut" style="font-size:13px;margin:0 0 8px">قیمت پایه برای همین گزینه‌هاست؛ تغییر آن توسط مشتری، اختلاف قیمت را اعمال می‌کند (مثل برگر مرغ با پروتئین مرغ).</p>
        <div class="form-grid">${c.options.map((g, gi) => g.type === "one" ? html`<label class="fld"><span>${g.t}</span><select data-def="${gi}">${g.list.map((o, oi) => html`<option value="${oi}" ${((it.meta.s || {})[gi] || 0) === oi ? "selected" : ""}>${o[0]}${o[1] ? ` (${o[1] > 0 ? "+" : "−"}${F(Math.abs(o[1]))})` : ""}</option>`)}</select></label>` : "")}</div>` : ""}
      ${c.id !== "other" && c.removables.length ? html`<div class="section-t">✂️ مواد قابل حذف برای این غذا</div><p class="mut" style="font-size:13px;margin:0 0 8px">فقط موارد انتخاب‌شده به مشتری نمایش داده می‌شوند. فهرست کلی را در «دسته و گزینه‌ها» مدیریت کنید.</p>
        <div class="checks">${c.removables.map((r) => html`<label><input type="checkbox" data-rm value="${r}" ${rem.includes(r) ? "checked" : ""}>${r}</label>`)}</div>` : ""}
      <div class="section-t">👁️ وضعیت</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap"><button type="button" class="tog" role="switch" aria-checked="${it.active}" data-sw="active"><i></i>نمایش در منو</button><button type="button" class="tog" role="switch" aria-checked="${it.available}" data-sw="available"><i></i>موجود است</button></div>
      <p class="err" id="fe"></p>
      <div class="actbar"><button class="btn" type="submit" id="sv">${isNew ? "افزودن به منو" : "ذخیره تغییرات"}</button>${!isNew ? html`<button class="btn danger ghost" type="button" id="del" style="flex:0 0 auto">🗑️ حذف</button>` : ""}</div>
      </form>`);
    const f = s.body.querySelector("#f");
    const uploadButton = s.body.querySelector("#uploadImage");
    const uploadHelp = s.body.querySelector("#imageUploadHelp");
    uploadHelp.textContent = ctx.demo ? "حالت نمایشی: عکس فقط پیش‌نمایش محلی است و در سرور ذخیره نمی‌شود." : ctx.capability("image_upload") ? "پس از آپلود، عکس در ImageKit ذخیره و در منوی مشترک مشتری/مدیریت نمایش داده می‌شود." : "ImageKit هنوز در Cloudflare فعال نشده؛ آپلود واقعی تا زمان اتصال فضای ذخیره‌سازی در دسترس نیست.";
    if (!ctx.demo && !ctx.capability("image_upload")) uploadButton.disabled = true;
    const sync = () => {
      it.name = f.name.value; it.description = f.description.value; it.emoji = c.id === "other" ? "📷" : (f.querySelector('[name="emoji"]')?.value || "🍽️"); it.image_url = f.image_url.value.trim(); it.price = f.price.value;
      s.body.querySelector("#pvn").textContent = it.name || "نام غذا";
      s.body.querySelector("#pvd").textContent = it.description || "توضیح کوتاه";
      const p = parsePrice(it.price);
      s.body.querySelector("#pvp").textContent = Number.isInteger(p) ? money(p) : "—";
      const emoji = s.body.querySelector("#pv .fe"); if (emoji) emoji.textContent = it.emoji;
    };
    f.oninput = (e) => { if (e.target.name === "category_id") return; sync(); };
    f.image_url.onchange = () => { sync(); render(); };
    f.category_id.onchange = () => { const next = f.category_id.value; sync(); it.category_id = next; if (next === "other") { it.emoji = "📷"; it.model_url = ""; it.meta = {}; it.removables = []; } else { it.meta = { ...it.meta, s: {} }; it.removables = null; if (it.emoji === "📷") it.emoji = "🍽️"; } render(); };
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
      if (!ctx.capability("image_upload")) { status.textContent = "برای آپلود واقعی باید ImageKit به Worker متصل شود."; return; }
      busy(uploadButton, async () => {
        try { const out = await ctx.api.uploadImage(file); it.image_url = out.image_url; render(); s.body.querySelector("#imageUploadStatus").textContent = "عکس در ImageKit ذخیره شد."; }
        catch (err) { const el = s.body.querySelector("#imageUploadStatus"); if (el) el.textContent = err.message || "آپلود عکس ناموفق بود."; }
      });
    };
    f.onsubmit = (e) => {
      e.preventDefault(); sync();
      const fe = s.body.querySelector("#fe"), price = parsePrice(it.price);
      if (!it.name.trim()) return (fe.textContent = "نام غذا الزامی است.");
      if (!Number.isInteger(price) || price < 0) return (fe.textContent = "قیمت باید یک عدد صحیح (تومان) باشد.");
      if (it.image_url && !/^https?:\/\//i.test(it.image_url) && !(ctx.demo && it.image_url.startsWith("data:image/"))) return (fe.textContent = "آدرس عکس باید با https:// شروع شود.");
      if (f.category_id.value === "other" && (!it.image_url || !isImageKitFoodPhoto(it.image_url)) && !ctx.demo) return (fe.textContent = "برای دسته «سایر» عکس واقعی را با دکمه «بارگذاری عکس» در ImageKit آپلود کن؛ نشانی ناقص یا قدیمی پذیرفته نیست.");
      const sdef = {};
      s.body.querySelectorAll("[data-def]").forEach((x) => { if (+x.value) sdef[x.dataset.def] = +x.value; });
      const removables = c.removables.length ? [...s.body.querySelectorAll("[data-rm]:checked")].map((x) => x.value) : null;
      const body = { name: it.name.trim(), category_id: f.category_id.value, price, emoji: c.id === "other" ? "📷" : it.emoji, description: it.description.trim(), image_url: it.image_url || null, model_url: c.id === "other" ? null : (it.model_url || null), active: it.active, available: it.available, meta: c.id === "other" ? {} : { ...it.meta, s: sdef }, removables: c.id === "other" ? [] : removables };
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
    c.name = b.querySelector("[name=name]").value; c.emoji = c.id === "other" ? "📷" : (b.querySelector("[name=emoji]")?.value || "🍽️");
    c.colors = [b.querySelector("[name=c1]").value, b.querySelector("[name=c2]").value];
    c.options = c.id === "other" ? [] : [...b.querySelectorAll(".optg")].map((g) => ({ t: g.querySelector("[data-gt]").value, type: g.querySelector("[data-gy]").value, list: [...g.querySelectorAll(".optrow")].map((r) => [r.querySelector("[data-on]").value, r.querySelector("[data-op]").value, r.querySelector("[data-visual]")?.value || ""]) }));
  };
  const render = () => {
    s.set(html`
      <h3 style="font-size:20px;margin-bottom:12px">${isNew ? "دسته جدید" : `ویرایش «${c.name}»`}</h3>
      <div class="preview-card">${tile(c.emoji, c.colors, { size: "lg" })}<div><b>${c.name || "نام دسته"}</b><div class="mut" style="font-size:13px">گزینه‌ها و مواد قابل حذف این دسته، دقیقاً همان‌هایی‌اند که مشتری در پنجره شخصی‌سازی می‌بیند.</div></div></div>
      <div class="form-grid">
        ${isNew ? html`<label class="fld"><span>شناسه لاتین <small>(مثل pasta)</small></span><input name="id" value="${c.id}" dir="ltr" maxlength="32" pattern="[a-z][a-z0-9-]+"></label>` : html`<input type="hidden" name="id" value="${c.id}">`}
        <label class="fld"><span>نام دسته</span><input name="name" value="${c.name}" maxlength="40" ${c.id === "other" ? "readonly" : ""}></label>
        ${c.id !== "other" ? html`<label class="fld"><span>ایموجی دسته</span><input name="emoji" value="${c.emoji}" maxlength="8"></label>` : html`<div class="note-box warn full">📷 «سایر» برای عکس واقعی است؛ تنظیمات ظاهری آن ثابت می‌ماند.</div>`}
        <label class="fld"><span>رنگ‌های پس‌زمینه کاشی</span><span style="display:flex;gap:8px"><input type="color" name="c1" value="${safeColor(c.colors[0])}" style="padding:4px;height:46px"><input type="color" name="c2" value="${safeColor(c.colors[1])}" style="padding:4px;height:46px"></span></label>
      </div>
      ${c.id === "other" ? html`<div class="note-box warn">در «سایر» فقط عکس واقعی پذیرفته می‌شود؛ گروه‌های شخصی‌سازی و مواد قابل حذف غیرفعال‌اند.</div>` : html`
      <div class="section-t">⚙️ گروه‌های شخصی‌سازی</div>
      <p class="mut" style="font-size:13px;margin:0 0 10px">«تک‌انتخابی» مثل سایز یا نوع خمیر؛ «چندانتخابی» مثل افزودنی‌ها. قیمت مثبت = گران‌تر، منفی = ارزان‌تر. در گروه تک‌انتخابی اولین گزینه پیش‌فرض است.</p>
      <div id="groups">${c.options.map((g, gi) => html`<div class="optg" data-g="${gi}">
        <div class="gh"><input data-gt value="${g.t}" placeholder="عنوان گروه (مثلاً سایز)" maxlength="60"><select data-gy><option value="one" ${g.type === "one" ? "selected" : ""}>تک‌انتخابی</option><option value="many" ${g.type === "many" ? "selected" : ""}>چندانتخابی</option></select><button class="icon-btn" data-dg="${gi}" aria-label="حذف گروه">🗑️</button></div>
        ${g.list.map((o, oi) => html`<div class="optrow"><input data-on value="${o[0]}" placeholder="نام گزینه" maxlength="60" aria-label="نام گزینه"><input data-op value="${o[1]}" inputmode="numeric" dir="ltr" aria-label="قیمت اضافه (تومان)" placeholder="0"><select data-visual aria-label="اثر سه‌بعدی"><option value="" ${!o[2] ? "selected" : ""}>بدون تغییر مدل</option><option value="add_lettuce" ${o[2] === "add_lettuce" ? "selected" : ""}>＋ کاهو</option><option value="add_tomato" ${o[2] === "add_tomato" ? "selected" : ""}>＋ گوجه</option><option value="add_cheese" ${o[2] === "add_cheese" ? "selected" : ""}>＋ پنیر</option><option value="add_mushroom" ${o[2] === "add_mushroom" ? "selected" : ""}>＋ قارچ</option><option value="add_jalapeno" ${o[2] === "add_jalapeno" ? "selected" : ""}>＋ هالوپینو</option><option value="add_bacon" ${o[2] === "add_bacon" ? "selected" : ""}>＋ ژامبون</option><option value="add_egg" ${o[2] === "add_egg" ? "selected" : ""}>＋ تخم‌مرغ</option><option value="add_onion" ${o[2] === "add_onion" ? "selected" : ""}>＋ پیاز</option><option value="add_pickle" ${o[2] === "add_pickle" ? "selected" : ""}>＋ خیارشور</option><option value="remove_chicken" ${o[2] === "remove_chicken" ? "selected" : ""}>− مرغ (مدل مرغی)</option><option value="remove_sausage" ${o[2] === "remove_sausage" ? "selected" : ""}>− سوسیس (هات‌داگ)</option></select><button class="icon-btn" data-do="${gi}:${oi}" aria-label="حذف گزینه">✕</button></div>`)}
        <button class="btn sm ghost" data-ao="${gi}">＋ گزینه</button></div>`)}</div>
      <button class="btn sm soft" data-ag>＋ گروه شخصی‌سازی</button>
      <div class="section-t">✂️ مواد قابل حذف</div>
      <div class="checks" id="rms">${c.removables.map((r, i) => html`<span class="chip">${r}<button class="x" data-dr="${i}" aria-label="حذف ${r}" style="border:0;background:none;color:#b00">✕</button></span>`)}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><input class="inp" id="nr" placeholder="مثلاً: بدون پیاز" maxlength="40"><button class="btn sm ghost" data-ar>افزودن</button></div>
      `}
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
        const list = g.list.filter((o) => o[0].trim()).map((o) => { const option = [o[0].trim(), parsePrice(o[1] === "" ? 0 : String(o[1]).replace("−", "-"))]; if (o[2]) option.push(o[2]); return option; });
        if (!list.length) return (fe.textContent = `گروه «${g.t}» حداقل یک گزینه لازم دارد.`);
        if (list.some((o) => !Number.isInteger(o[1]))) return (fe.textContent = `قیمت‌های گروه «${g.t}» باید عدد صحیح باشند.`);
        options.push({ t: g.t.trim(), type: g.type, list });
      }
      const body = { name: c.id === "other" ? "سایر" : c.name.trim(), emoji: c.id === "other" ? "📷" : (c.emoji || "🍽️"), colors: c.colors, options: c.id === "other" ? [] : options, removables: c.id === "other" ? [] : c.removables };
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
