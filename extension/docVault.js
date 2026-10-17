/**
 * docVault.js  (popup — "Doc Vault" tab)
 * ------------------------------------------------------------
 * The customer-wise document locker, as its own tab.
 *
 *  - CUSTOMERS: every customer is a separate entry (name + mobile).
 *    Several customers may share ONE mobile number — each keeps their
 *    own documents (see docStore.js).
 *  - EACH DOCUMENT carries its own holder name and document number
 *    (Aadhaar / EPIC / PAN …) with format checks.
 *  - SMART ADD: drop up to 10 files (PDF or photo). Each is read with
 *    OCR to guess the type, holder name and number; photos are turned
 *    into PDF and squeezed under the portal's 2MB limit.
 *  - Checklist by certificate (पहचान / जाति / निवास / आय), view /
 *    download / replace / copy-to-customer / delete with undo, ZIP.
 *
 * The active customer here is the same one the Form tab and the portal's
 * "Attach Enclosure(s)" button use.
 * ------------------------------------------------------------
 */
(function () {
  const MAX_BATCH = 10;
  const MAX_BYTES = 2 * 1024 * 1024;
  const GROUP_SHORT = ["पहचान", "जाति", "निवास", "आय", "NCL"];

  let customers = [];
  let counts = {};
  let activeId = "";
  let query = "";
  let groupFilter = "all";       // "all" | group index
  let showMissing = false;       // checklist of missing documents is opt-in (keeps the list short)
  let editing = null;            // null | "new" | customer id
  let queue = [];                // rows waiting to be saved
  let docs = {};                 // active customer's documents { type: entry }
  let undo = null;
  let undoTimer = null;
  let busy = false;
  let pendingType = "";          // type chosen by a "+ Add" button on a missing row

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, k) => window.saathiToast && window.saathiToast(m, k || "info");
  const groups = () => window.SaathiDocGroups || [];
  const allTypes = () => [].concat(...groups().map((g) => g.items));
  const labelFor = (key) => { const t = allTypes().find((x) => x.key === key); return t ? t.label : key; };
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name);
  const rid = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sizeText = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1) + " MB");

  function initials(name) {
    const w = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!w.length) return "?";
    return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
  }
  function hue(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function dateText(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toDateString() === new Date().toDateString()
      ? "Aaj " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }
  const active = () => customers.find((c) => c.id === activeId) || null;

  // ====================================================================
  //  Document-number rules (per type)
  // ====================================================================

  const NUMBER_RULES = {
    aadhaar: { hint: "12 digit", norm: (v) => { const d = digits(v).slice(0, 12); return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim(); },
      check: (v) => { const d = digits(v); return d.length === 12 && typeof DocumentParser !== "undefined" ? DocumentParser.verhoeffValid(d) : d.length === 12; } },
    voter_id: { hint: "ABC1234567", norm: (v) => String(v).toUpperCase().replace(/\s+/g, ""), check: (v) => /^[A-Z]{3}\d{7}$/.test(String(v).toUpperCase().replace(/\s+/g, "")) },
    election_id: { hint: "ABC1234567", norm: (v) => String(v).toUpperCase().replace(/\s+/g, ""), check: (v) => /^[A-Z]{3}\d{7}$/.test(String(v).toUpperCase().replace(/\s+/g, "")) },
    pan_card: { hint: "ABCDE1234F", norm: (v) => String(v).toUpperCase().replace(/\s+/g, ""), check: (v) => /^[A-Z]{5}\d{4}[A-Z]$/.test(String(v).toUpperCase().replace(/\s+/g, "")) },
    passport: { hint: "A1234567", norm: (v) => String(v).toUpperCase().replace(/\s+/g, ""), check: (v) => /^[A-Z]\d{7}$/.test(String(v).toUpperCase().replace(/\s+/g, "")) },
  };

  function numberState(type, value) {
    const v = String(value || "").trim();
    if (!v) return { cls: "", text: "" };
    const rule = NUMBER_RULES[type];
    if (!rule) return { cls: "dv-n-neutral", text: "" };
    return rule.check(v) ? { cls: "dv-n-ok", text: "✓ correct" } : { cls: "dv-n-bad", text: "⚠ " + rule.hint };
  }
  const normNumber = (type, v) => (NUMBER_RULES[type] ? NUMBER_RULES[type].norm(v) : String(v || "").trim());

  function typeOptions(selected) {
    return `<option value="">— Type chunein —</option>` + groups().map((g, i) =>
      `<optgroup label="${esc(GROUP_SHORT[i] ? GROUP_SHORT[i] + " — " : "")}${esc(g.title.replace(/^➦\s*/, ""))}">` +
      g.items.map((t) => `<option value="${t.key}"${t.key === selected ? " selected" : ""}>${esc(t.label)}</option>`).join("") + `</optgroup>`).join("");
  }

  // ====================================================================
  //  Layout
  // ====================================================================

  function build() {
    if (typeof SaathiExtraTabs === "undefined" || $("tab-vault")) return false;
    const box = document.createElement("div");
    box.id = "content-vault";
    box.innerHTML = `
    <div class="dv-wrap">
      <div class="dv-hero">
        <div class="dv-hero-icon">🗂️</div>
        <div>
          <div class="dv-hero-title">Document Section</div>
          
        </div>
      </div>

      <section class="dv-card">
        <div class="dv-card-title"><span class="dv-num">1</span> Customer<small id="dvCustCount"></small></div>
        <div class="dv-row">
          <input type="text" id="dvSearch" class="dv-in" placeholder="Enter Name Or Number" spellcheck="false">
          <button type="button" id="dvNew" class="dv-btn dv-btn-blue">+ New Profiles</button>
        </div>
        <div id="dvRegBanner"></div>
        <div id="dvCustForm"></div>
        <div id="dvCustList" class="dv-cust-list"></div>
        <div class="dv-row dv-row-end"><button type="button" id="dvSync" class="dv-btn dv-btn-sm" title="Profile tab ke saare saved profiles customers me jod do">Add From List</button></div>
      </section>

      <section class="dv-card" id="dvActiveCard"></section>

      <section class="dv-card" id="dvAddCard">
        <div class="dv-card-title"><span class="dv-num">2</span> Documents <small></small></div>
        <div id="dvDrop" class="dv-drop"><div class="dv-drop-ico">📎</div><div><b>Choose Files</b> </div><small></small></div>
        <input type="file" id="dvFile" accept="application/pdf,.pdf,image/*" multiple style="display:none;">
        <label class="dv-switch"><input type="checkbox" id="dvSmart" checked><span>Verifying</span></label>
        <div id="dvQueue"></div>
      </section>

      <section class="dv-card">
        <div class="dv-card-title"><span class="dv-num">3</span>Document List </div>
        <div class="dv-chips" id="dvFilters"></div>
        <div id="dvDocs"></div>
        <div id="dvUndo" class="dv-undo" style="display:none;"></div>
      </section>

      <div class="dv-foot" id="dvStorage"></div>
    </div>`;
    return SaathiExtraTabs.add({ id: "tab-vault", label: "Doc", box, onShow: refreshAll });
  }

  // ====================================================================
  //  Data
  // ====================================================================

  async function loadData() {
    customers = await DocStore.getCustomers();
    counts = await DocStore.getDocCounts();
    activeId = await DocStore.getActiveProfileId();
    docs = await DocStore.getCustomerDocs(activeId);
  }

  async function refreshAll() {
    if (typeof DocStore === "undefined") return;
    await loadData();
    renderCustomers();
    renderActive();
    renderFilters();
    renderDocs();
    renderQueue();
    renderStorage();
    renderFormBar();
  }

  async function afterChange() {
    await refreshAll();
    if (window.SaathiEnclosureDocsPanel && window.SaathiEnclosureDocsPanel.refresh) window.SaathiEnclosureDocsPanel.refresh();
    if (window.SaathiProfileBadges && window.SaathiProfileBadges.refreshActive) window.SaathiProfileBadges.refreshActive();
  }

  // ====================================================================
  //  Customers
  // ====================================================================

  function renderCustomers() {
    const q = query.trim().toLowerCase();
    const list = customers.filter((c) => !q || (c.name || "").toLowerCase().includes(q) || c.mobile.includes(digits(q) || "§") || (c.note || "").toLowerCase().includes(q));
    const byMobile = {};
    customers.forEach((c) => { if (c.mobile) byMobile[c.mobile] = (byMobile[c.mobile] || 0) + 1; });
    $("dvCustCount").textContent = `(${customers.length})`;

    const el = $("dvCustList");
    if (!customers.length) {
      el.innerHTML = `<div class="dv-empty"><div class="dv-empty-ico">👥</div><b>Abhi koi customer nahi</b><small>"Naya customer" dabayein ya saved profiles se jodein</small></div>`;
    } else if (!list.length) {
      el.innerHTML = `<div class="dv-empty"><small>"${esc(query)}" se koi customer nahi mila</small></div>`;
    } else {
      el.innerHTML = list.map((c) => {
        const dup = c.mobile && byMobile[c.mobile] > 1;
        const n = counts[c.id] || 0;
        return `
        <div class="dv-cust${c.id === activeId ? " is-active" : ""}" data-id="${c.id}">
          <div class="dv-avatar" style="--h:${hue(c.id)}">${esc(initials(c.name))}</div>
          <div class="dv-cust-main">
            <div class="dv-cust-name">${esc(c.name || "(naam nahi)")}${c.id === activeId ? ' <span class="dv-now">● Active</span>' : ""}</div>
            <div class="dv-cust-sub"><span>📱 ${esc(c.mobile || "number nahi")}</span>${dup ? `<span class="dv-dup" title="Is number par ${byMobile[c.mobile]} customer hain — docs alag-alag hain">⚠ same number ×${byMobile[c.mobile]}</span>` : ""}${c.note ? `<span class="dv-note">📝 ${esc(c.note)}</span>` : ""}</div>
          </div>
          <div class="dv-cust-side">
            <span class="dv-count${n ? " has" : ""}">📄 ${n}</span>
            <button type="button" class="dv-mini" data-act="edit" data-id="${c.id}" title="Naam / number badlo">✏️</button>
            <button type="button" class="dv-mini dv-mini-red" data-act="delcust" data-id="${c.id}" title="Customer aur uske docs hatao">🗑</button>
          </div>
        </div>`;
      }).join("");
    }
    renderCustForm();
    renderRegBanner();
  }

  let formFor = null; // which form is currently on screen ("new" | customer id)
  function renderCustForm() {
    const el = $("dvCustForm");
    if (editing === null) { el.innerHTML = ""; formFor = null; return; }
    // A background refresh must never redraw a form the operator is typing in.
    if (formFor === editing && $("dvfName")) return;
    formFor = editing;
    const c = editing === "new" ? { name: "", mobile: "", note: "" } : customers.find((x) => x.id === editing) || { name: "", mobile: "", note: "" };
    el.innerHTML = `
      <div class="dv-form">
        <div class="dv-form-title">${editing === "new" ? "➕ Naya customer" : "✏️ Customer badlein"}</div>
        <div class="dv-form-grid">
          <label>Naam<input type="text" id="dvfName" class="dv-in" value="${esc(c.name)}" spellcheck="false"></label>
          <label>Mobile<input type="text" id="dvfMobile" class="dv-in" value="${esc(c.mobile)}" inputmode="numeric" maxlength="10" spellcheck="false"></label>
          <label class="dv-span2">Note <small></small><input type="text" id="dvfNote" class="dv-in" value="${esc(c.note || "")}" spellcheck="false"></label>
        </div>
        <div id="dvfWarn" class="dv-warn"></div>
        <div class="dv-row">
          <button type="button" id="dvfSave" class="dv-btn dv-btn-green dv-grow"> Save</button>
          <button type="button" id="dvfCancel" class="dv-btn">Cancel</button>
        </div>
      </div>`;
    const warn = () => {
      const m = digits($("dvfMobile").value);
      const others = m.length === 10 ? customers.filter((x) => x.mobile === m && x.id !== editing) : [];
      $("dvfWarn").innerHTML = others.length
        ? `ℹ️ Is number par pehle se <b>${others.map((o) => esc(o.name || "(naam nahi)")).join(", ")}</b> hain. Yeh <b>alag customer</b> banega — documents mix nahi honge.` : "";
    };
    $("dvfMobile").addEventListener("input", warn);
    warn();
    $("dvfCancel").addEventListener("click", () => { editing = null; renderCustForm(); });
    $("dvfSave").addEventListener("click", saveCustomerForm);
    setTimeout(() => $("dvfName") && $("dvfName").focus(), 30);
  }

  async function saveCustomerForm() {
    const name = $("dvfName").value.trim();
    const mobile = digits($("dvfMobile").value);
    const note = $("dvfNote").value.trim();
    if (!name) { toast("Naam likhna zaroori hai.", "warn"); return; }
    if (mobile && mobile.length !== 10) { toast("Mobile 10 digit ka hona chahiye (ya khaali chhod do).", "warn"); return; }
    if (editing === "new") {
      const c = await DocStore.registerCustomer({ name, mobile, note });
      await DocStore.setActiveCustomer(c.id);
      toast(`${name} jud gaye — ab unke documents jodein.`, "success");
    } else {
      await DocStore.updateCustomer(editing, { name, mobile, note });
      toast("Customer update ho gaya.", "success");
    }
    editing = null;
    await afterChange();
  }

  /** The Form tab's brand-new profile has no customer yet — offer to register it with what is typed there. */
  async function renderRegBanner() {
    const el = $("dvRegBanner");
    const isReg = customers.some((c) => c.id === activeId);
    if (isReg) { el.innerHTML = ""; return; }
    const fName = ($("name") && $("name").value.trim()) || "";
    const fMob = digits($("mobile") && $("mobile").value);
    el.innerHTML = `
      <div class="dv-banner">
        <div><b>🆕  Register New Profile</b> ${fName || fMob ? ` <span class="dv-muted">(${esc([fName, fMob].filter(Boolean).join(" · "))})</span>` : ""}</div>
        <button type="button" id="dvRegister" class="dv-btn dv-btn-sm dv-btn-blue">+ Register</button>
      </div>`;
    $("dvRegister").addEventListener("click", async () => {
      if (!fName && fMob.length !== 10) { editing = "new"; renderCustForm(); return; }
      const c = await DocStore.registerCustomer({ name: fName, mobile: fMob.length === 10 ? fMob : "" });
      // keep any documents already uploaded in this temporary session
      const tmp = await DocStore.getCustomerDocs(activeId);
      for (const t of Object.keys(tmp)) await DocStore.restoreDoc(t, tmp[t], c.id);
      await DocStore.setActiveCustomer(c.id);
      await afterChange();
    });
  }

  async function selectCustomer(id) {
    await DocStore.setActiveCustomer(id);
    queue = [];
    await afterChange();
  }

  // ====================================================================
  //  Active customer header
  // ====================================================================

  function renderActive() {
    const c = active();
    const el = $("dvActiveCard");
    const have = Object.keys(docs);
    const gi = groups().map((g) => g.items.filter((t) => docs[t.key]).length);
    const chips = groups().map((g, i) => `<span class="dv-cert ${gi[i] ? "ok" : ""}">${gi[i] ? "✓" : "○"} ${GROUP_SHORT[i] || g.title} <i>${gi[i]}/${g.items.length}</i></span>`).join("");
    el.innerHTML = c
      ? `<div class="dv-active">
           <div class="dv-avatar dv-avatar-lg" style="--h:${hue(c.id)}">${esc(initials(c.name))}</div>
           <div class="dv-active-main">
             <div class="dv-active-name">${esc(c.name || "(naam nahi)")}</div>
             <div class="dv-active-sub">📱 ${esc(c.mobile || "number nahi")} · 📄 ${have.length} document${have.length === 1 ? "" : "s"}</div>
             <div class="dv-certs">${chips}</div>
           </div>
           <div class="dv-active-actions">
             <button type="button" class="dv-btn dv-btn-sm" data-act="shrinkall" ${have.length ? "" : "disabled"} title="Jo docs 200 KB se bade hain unhe chhota karo">📉 ≤200 KB</button>
             <button type="button" class="dv-btn dv-btn-sm" data-act="zip" ${have.length ? "" : "disabled"}>📦 ZIP</button>
             <button type="button" class="dv-btn dv-btn-sm dv-btn-red" data-act="clearall" ${have.length ? "" : "disabled"}>🗑 Remove All</button>
           </div>
         </div>`
      : `<div class="dv-empty"><div class="dv-empty-ico">👆</div><b>Select Profiles</b><small></small></div>`;
    $("dvAddCard").style.display = c ? "" : "none";
  }

  // ====================================================================
  //  Smart add (queue)
  // ====================================================================

  function askPassword(file, wasWrong) {
    return window.prompt((wasWrong ? "❌ Galat password.\n\n" : "") + `"${file.name}" password-protected hai. Password daalein (skip: Cancel):`, "");
  }

  /** OCR the file and guess type / holder name / document number. Never throws. */
  async function smartGuess(file) {
    try {
      const res = await OcrEngine.extractTextFromFile(file, null, { askPassword, maxPages: 3 });
      const text = res.text || "";
      const parsed = DocumentParser.extractFields(text);
      let type = parsed.docType === "aadhaar" ? "aadhaar" : parsed.docType === "voter_id" ? "voter_id" : parsed.docType === "ration_card" ? "ration_card" : "";
      const pan = text.toUpperCase().match(/\b[A-Z]{5}\d{4}[A-Z]\b/);
      if (!type && pan) type = "pan_card";
      if (!type && window.SaathiEnclosureMatch) type = window.SaathiEnclosureMatch.guessFromText(text);   // NCL forms, bills, passbook, DL...
      let number = "";
      if (type === "aadhaar" && parsed.fields.info_aadhaar) number = parsed.fields.info_aadhaar.replace(/\s*\(\?\)/, "");
      else if (type === "voter_id" && parsed.fields.info_epic) number = parsed.fields.info_epic;
      else if (type === "pan_card") number = pan[0];
      const holder = type === "aadhaar" || type === "voter_id" ? parsed.fields.name || "" : "";
      return { type, number, holder, ocr: true };
    } catch (e) {
      return { type: "", number: "", holder: "", ocr: false };
    }
  }

  function addFiles(files, presetType) {
    const c = active();
    if (!c) { toast("Pehle customer chunein.", "warn"); return; }
    if (busy) return;
    let skipped = 0;
    files.forEach((f) => {
      if ((!isPdf(f) && !isImg(f)) || f.size > 25 * 1024 * 1024 || queue.length >= MAX_BATCH) { skipped++; return; }
      queue.push({ id: rid(), file: f, type: presetType || "", holder: c.name || "", number: "", status: "wait", msg: "", guessed: false });
    });
    if (skipped) toast(`${skipped} file chhoot gayi (max ${MAX_BATCH}, sirf PDF/photo, 25MB tak).`, "warn");
    renderQueue();
    if ($("dvSmart").checked) runGuesses();
  }

  async function runGuesses() {
    const todo = queue.filter((r) => r.status === "wait" && !r.guessed);
    todo.forEach((r) => { r.status = "guess"; r.msg = ""; });
    renderQueue(true);
    const limit = Math.max(1, OcrEngine.getPoolSize ? OcrEngine.getPoolSize() : 1);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(limit, todo.length) }, async () => {
      while (cursor < todo.length) {
        const r = todo[cursor++];
        const g = await smartGuess(r.file);
        if (!queue.includes(r)) continue;
        r.guessed = true;
        r.status = "wait";
        if (!r.type && g.type) r.type = g.type;
        if (g.number) r.number = normNumber(r.type, g.number);
        if (g.holder) r.holder = g.holder;
        r.msg = g.type ? "" : g.ocr ? "" : "";
        renderQueue(true);
      }
    }));
  }

  // A background OCR finishing used to rebuild the whole queue (innerHTML) while the operator had a
  // document-type dropdown open or was typing a number - the dropdown snapped shut and the choice was lost
  // ("doc list par select nahi hota"). `soft` renders are now postponed until the control loses focus.
  let queueRenderPending = false;
  function renderQueue(soft) {
    const el = $("dvQueue");
    if (!el) return;
    const ae = document.activeElement;
    if (soft && ae && el.contains(ae) && (ae.tagName === "SELECT" || ae.tagName === "INPUT")) {
      queueRenderPending = true;
      if (!el.dataset.softFlush) {
        el.dataset.softFlush = "1";
        el.addEventListener("focusout", () => {
          setTimeout(() => { if (queueRenderPending) { queueRenderPending = false; renderQueue(); } }, 60);
        });
      }
      return;
    }
    queueRenderPending = false;
    if (!queue.length) { el.innerHTML = ""; return; }
    const rows = queue.map((r) => {
      const ns = numberState(r.type, r.number);
      const exists = r.type && docs[r.type];
      return `
      <div class="dv-q dv-q-${r.status}" data-id="${r.id}">
        <div class="dv-q-head">
          <span class="dv-q-ico">${isPdf(r.file) ? "📕" : "🖼️"}</span>
          <span class="dv-q-name" title="${esc(r.file.name)}">${esc(r.file.name)} <small>${sizeText(r.file.size)}</small></span>
          <span class="dv-q-msg">${r.status === "guess" ? '<span class="saathi-mini-spinner"></span>' : ""}${esc(r.msg)}</span>
          
        </div>
        <div class="dv-q-fields">
          <select class="dv-in dv-q-type" data-id="${r.id}">${typeOptions(r.type)}</select>
          <input type="text" class="dv-in dv-q-holder" data-id="${r.id}" placeholder="Naam (kiska document)" value="${esc(r.holder)}" spellcheck="false">
          <div class="dv-numwrap"><input type="text" class="dv-in dv-q-number" data-id="${r.id}" placeholder="Document number" value="${esc(r.number)}" spellcheck="false"><span class="dv-nchip ${ns.cls}">${esc(ns.text)}</span></div>
        </div>
        ${exists ? `<div class="dv-q-warn">⚠️ ${esc(labelFor(r.type))} (${esc(docs[r.type].name)}) - Already Added Replace It</div>` : ""}
      </div>`;
    }).join("");
    const ready = queue.filter((r) => r.type).length;
    el.innerHTML = rows + `
      <div class="dv-row">
        <button type="button" id="dvSaveAll" class="dv-btn dv-btn-green dv-grow" ${busy || !ready ? "disabled" : ""}> ${ready} SAVE</button>
        <button type="button" id="dvClearQ" class="dv-btn" ${busy ? "disabled" : ""}>REMOVE</button>
      </div>`;
    $("dvSaveAll").addEventListener("click", saveQueue);
    $("dvClearQ").addEventListener("click", () => { queue = []; renderQueue(); });
  }

  /** Photo -> PDF; anything over 2MB is squeezed. Returns a PDF File or null. */
  async function toPdfFile(file) {
    const base = file.name.replace(/\.[^.]+$/, "");
    if (isImg(file)) {
      if (!window.SaathiPdfTools) return null;
      let bmp;
      try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { try { bmp = await createImageBitmap(file); } catch (e2) { return null; } }
      const presets = [[1800, 0.85], [1500, 0.75], [1250, 0.65], [1000, 0.55], [800, 0.45]];
      for (const [maxSide, quality] of presets) {
        const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
        const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
        const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", quality));
        if (!blob) continue;
        const pdf = await window.SaathiPdfTools.imagesToPdf([{ bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h }]);
        if (pdf && pdf.size <= MAX_BYTES) { if (bmp.close) bmp.close(); return new File([pdf], base + ".pdf", { type: "application/pdf" }); }
      }
      if (bmp.close) bmp.close();
      return null;
    }
    if (file.size <= MAX_BYTES) return file;
    const squeezed = window.SaathiPdfTools ? await window.SaathiPdfTools.compressPdfFile(file, MAX_BYTES) : null;
    return squeezed && squeezed.size <= MAX_BYTES ? squeezed : null;
  }

  async function saveQueue() {
    const c = active();
    if (!c || busy) return;
    busy = true;
    renderQueue();
    let saved = 0;
    const failed = [];
    const seenTypes = new Set();
    for (const r of queue.slice()) {
      if (!r.type) { failed.push(r); r.msg = "Type chunein"; continue; }
      if (seenTypes.has(r.type)) { r.msg = "Isi batch me yeh type dobara hai"; failed.push(r); continue; }
      seenTypes.add(r.type);
      r.status = "guess"; r.msg = "save ho raha hai…"; renderQueue();
      const pdf = await toPdfFile(r.file);
      if (!pdf) { r.status = "wait"; r.msg = "2MB tak chhoti nahi ho payi"; failed.push(r); continue; }
      const prev = await DocStore.getDoc(r.type, c.id);
      const ok = await DocStore.saveDoc(r.type, pdf, c.id, { holderName: r.holder, docNumber: normNumber(r.type, r.number) });
      if (ok) {
        saved++;
        queue = queue.filter((x) => x !== r);
        if (prev) setUndo(`"${labelFor(r.type)}" replace hua`, async () => { await DocStore.restoreDoc(r.type, prev, c.id); });
      } else { r.status = "wait"; r.msg = "save nahi hua"; failed.push(r); }
    }
    busy = false;
    toast(saved ? `${saved} document save ho gaye${failed.length ? ` · ${failed.length} baaki` : ""}.` : "Koi document save nahi hua.", saved ? "success" : "warn");
    await afterChange();
  }

  // ====================================================================
  //  Document list
  // ====================================================================

  function renderFilters() {
    const el = $("dvFilters");
    if (!el) return;
    const chips = [["all", "All"]].concat(groups().map((g, i) => [i, GROUP_SHORT[i] || g.title]));
    el.innerHTML = chips.map(([k, l]) => `<button type="button" class="dv-chip${groupFilter === k ? " on" : ""}" data-act="gfilter" data-k="${k}">${l}</button>`).join("") +
      `<label class="dv-switch dv-switch-sm"><input type="checkbox" id="dvMissing" ${showMissing ? "checked" : ""}><span>All</span></label>`;
    $("dvMissing").addEventListener("change", (e) => { showMissing = e.target.checked; renderDocs(); });
  }

  function numberChip(type, value) {
    const s = numberState(type, value);
    return `<span class="dv-nchip ${s.cls}">${esc(s.text)}</span>`;
  }

  function renderDocs() {
    const el = $("dvDocs");
    if (!el) return;
    const c = active();
    if (!c) { el.innerHTML = ""; return; }
    let html = "";
    groups().forEach((g, i) => {
      if (groupFilter !== "all" && groupFilter !== i) return;
      const have = g.items.filter((t) => docs[t.key]);
      const items = showMissing ? g.items : have;
      if (!items.length) return;
      html += `<div class="dv-group"><div class="dv-group-title">${esc(GROUP_SHORT[i] || "")} <small>${esc(g.title.replace(/^➦\s*/, ""))}</small><span class="dv-gcount">${have.length}/${g.items.length}</span></div>`;
      items.forEach((t) => {
        const d = docs[t.key];
        if (d) {
          html += `
          <div class="dv-doc" data-type="${t.key}">
            <div class="dv-doc-ico">${/pdf/i.test(d.type) ? "📕" : "🖼️"}</div>
            <div class="dv-doc-main">
              <div class="dv-doc-title">${esc(t.label)} <span class="dv-ok">✓</span></div>
              <div class="dv-doc-fields">
                <input type="text" class="dv-in dv-holder" data-type="${t.key}" placeholder="Naam (kiska document)" value="${esc(d.holderName || "")}" spellcheck="false">
                <div class="dv-numwrap"><input type="text" class="dv-in dv-number" data-type="${t.key}" placeholder="Document number" value="${esc(d.docNumber || "")}" spellcheck="false">${numberChip(t.key, d.docNumber)}
                  <button type="button" class="dv-mini" data-act="copynum" data-type="${t.key}" title="Number copy karo">📋</button></div>
              </div>
              <div class="dv-doc-meta">${esc(sizeText(d.size))} · ${esc(dateText(d.savedAt))} · ${esc(d.name)}</div>
            </div>
            <div class="dv-doc-actions">
              <button type="button" class="dv-mini" data-act="view" data-type="${t.key}" title="Dekho">👁</button>
              <button type="button" class="dv-mini" data-act="dl" data-type="${t.key}" title="Download">⬇</button>
              <button type="button" class="dv-mini" data-act="shrink" data-type="${t.key}" title="Portal ke liye chhota karo (200 KB tak)">📉</button>
              <button type="button" class="dv-mini" data-act="replace" data-type="${t.key}" title="Nayi file se badlo">♻</button>
              <button type="button" class="dv-mini" data-act="copyto" data-type="${t.key}" title="Doosre customer ko copy karo">📑</button>
              <button type="button" class="dv-mini dv-mini-red" data-act="del" data-type="${t.key}" title="Hatao">🗑</button>
            </div>
          </div>`;
        } else {
          html += `
          <div class="dv-doc dv-missing" data-type="${t.key}">
            <div class="dv-doc-ico">○</div>
            <div class="dv-doc-main"><div class="dv-doc-title">${esc(t.label)}</div></div>
            <div class="dv-doc-actions"><button type="button" class="dv-btn dv-btn-sm" data-act="addtype" data-type="${t.key}">＋ Add</button></div>
          </div>`;
        }
      });
      html += `</div>`;
    });
    el.innerHTML = html || `<div class="dv-empty"><div class="dv-empty-ico">📭</div><b>Koi document nahi</b><small></small></div>`;
  }

  function setUndo(text, fn) {
    undo = fn;
    const el = $("dvUndo");
    el.innerHTML = `<span>${esc(text)}</span><button type="button" data-act="undo">↩ Undo</button>`;
    el.style.display = "flex";
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { el.style.display = "none"; undo = null; }, 9000);
  }

  async function renderStorage() {
    const el = $("dvStorage");
    if (!el) return;
    const bytes = await DocStore.getStorageBytesInUse();
    el.textContent = `Used ${sizeText(bytes)}`;
  }

  // ====================================================================
  //  Actions
  // ====================================================================

  function chooseFile(presetType, replaceType) {
    const inp = $("dvFile");
    inp.dataset.preset = presetType || "";
    inp.dataset.replace = replaceType || "";
    inp.value = "";
    inp.click();
  }

  async function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  }

  const safe = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

  async function zipAll() {
    const c = active();
    if (!c || !window.SaathiPdfTools) return;
    const entries = [];
    const lines = [`Customer: ${c.name || "-"}`, `Mobile: ${c.mobile || "-"}`, ""];
    for (const t of allTypes()) {
      const d = docs[t.key];
      if (!d) continue;
      const file = await DocStore.getDocAsFile(t.key, c.id);
      if (!file) continue;
      entries.push({ name: `${safe(t.label)}${d.docNumber ? " - " + safe(d.docNumber) : ""}.pdf`, bytes: new Uint8Array(await file.arrayBuffer()) });
      lines.push(`${t.label} | ${d.holderName || "-"} | ${d.docNumber || "-"}`);
    }
    if (!entries.length) { toast("Is customer ke koi documents nahi hain.", "warn"); return; }
    entries.push({ name: "details.txt", bytes: new TextEncoder().encode(lines.join("\r\n")) });
    const zip = await window.SaathiPdfTools.zipFiles(entries);
    if (!zip) { toast("ZIP nahi ban paaya.", "error"); return; }
    downloadBlob(zip, `${safe(c.name) || "customer"}_${c.mobile || "docs"}_documents.zip`);
  }

  // Portal rows can allow as little as 200 KB (e.g. the oath letter) while the vault keeps up to 2 MB.
  // Re-renders the stored PDF smaller; the old copy is restorable via Undo.
  const PORTAL_KB = 190;
  async function shrinkDocs(types) {
    const c = active();
    if (!c) return;
    const todo = types.filter((t) => docs[t] && docs[t].size > PORTAL_KB * 1024);
    if (!todo.length) { toast("Koi doc " + PORTAL_KB + " KB se bada nahi hai.", "info"); return; }
    if (!window.SaathiPdfTools) { toast("PDF tool load nahi hua.", "warn"); return; }
    const presets = [{ scale: 1.1, quality: 0.6 }, { scale: 0.9, quality: 0.5 }, { scale: 0.75, quality: 0.38 }, { scale: 0.6, quality: 0.3 }, { scale: 0.5, quality: 0.25 }];
    let done = 0, failed = 0;
    const backups = [];
    toast(todo.length + " doc chhota ho raha hai…", "info");
    for (const t of todo) {
      const prev = await DocStore.getDoc(t, c.id);
      const file = await DocStore.getDocAsFile(t, c.id);
      let small = null;
      if (file) {
        try { small = await window.SaathiPdfTools.compressPdfFile(file, PORTAL_KB * 1024, { presets }); } catch (e) { small = null; }
      }
      if (small && await DocStore.saveDoc(t, small, c.id)) { done++; if (prev) backups.push([t, prev]); } else failed++;
    }
    if (backups.length) setUndo(done + " doc chhote kiye", async () => { for (const [t, e] of backups) await DocStore.restoreDoc(t, e, c.id); });
    toast(done ? done + " doc ≤" + PORTAL_KB + " KB ho gaye" + (failed ? " · " + failed + " nahi ho paye" : "") + "." : "Chhota nahi ho paya (page zyada ya scan bahut bhaari).", done ? "success" : "warn");
    await afterChange();
  }

  async function onAction(act, el) {
    const c = active();
    const type = el.dataset.type;
    switch (act) {
      case "edit": editing = el.dataset.id; renderCustForm(); break;
      case "delcust": {
        const cu = customers.find((x) => x.id === el.dataset.id);
        if (!cu || !window.confirm(`"${cu.name || cu.mobile}" aur unke ${counts[cu.id] || 0} document hamesha ke liye hata dein?`)) break;
        await DocStore.deleteCustomer(cu.id);
        await afterChange();
        break;
      }
      case "zip": await zipAll(); break;
      case "shrink": await shrinkDocs([type]); break;
      case "shrinkall": await shrinkDocs(Object.keys(docs).filter((k) => docs[k] && docs[k].size > PORTAL_KB * 1024)); break;
      case "clearall":
        if (!c || !window.confirm(`${c.name || "Is customer"} ke saare documents hata dein?`)) break;
        await DocStore.clearActiveProfileDocs();
        await afterChange();
        break;
      case "qdel": queue = queue.filter((r) => r.id !== el.dataset.id); renderQueue(); break;
      case "gfilter": groupFilter = el.dataset.k === "all" ? "all" : Number(el.dataset.k); renderFilters(); renderDocs(); break;
      case "addtype": pendingType = type; chooseFile(type, ""); break;
      case "replace": chooseFile(type, type); break;
      case "view": {
        const f = await DocStore.getDocAsFile(type, c.id);
        if (f) { const u = URL.createObjectURL(f); if (!window.open(u, "_blank")) URL.revokeObjectURL(u); else setTimeout(() => URL.revokeObjectURL(u), 60000); }
        break;
      }
      case "dl": {
        const f = await DocStore.getDocAsFile(type, c.id), d = docs[type];
        if (f) downloadBlob(f, `${safe(labelFor(type))} - ${safe((d && d.holderName) || c.name) || "doc"}.pdf`);
        break;
      }
      case "copynum": {
        const d = docs[type];
        if (d && d.docNumber) { try { await navigator.clipboard.writeText(d.docNumber); toast("Number copy ho gaya.", "success"); } catch (e) { toast(d.docNumber, "info"); } }
        else toast("Is document ka number likha nahi hai.", "warn");
        break;
      }
      case "del": {
        const entry = docs[type];
        if (!entry) break;
        await DocStore.removeDoc(type, c.id);
        setUndo(`"${labelFor(type)}" hata diya`, async () => { await DocStore.restoreDoc(type, entry, c.id); });
        await afterChange();
        break;
      }
      case "copyto": openCopyPicker(el); break;
      case "undo": if (undo) { const f = undo; undo = null; $("dvUndo").style.display = "none"; await f(); await afterChange(); } break;
      default: break;
    }
  }

  function openCopyPicker(btn) {
    const row = btn.closest(".dv-doc");
    if (!row || row.querySelector(".dv-copy")) return;
    const others = customers.filter((x) => x.id !== activeId);
    if (!others.length) { toast("Copy karne ke liye koi doosra customer nahi hai.", "warn"); return; }
    const type = btn.dataset.type;
    const box = document.createElement("div");
    box.className = "dv-copy";
    box.innerHTML = `<select class="dv-in">${others.map((o) => `<option value="${o.id}">${esc(o.name || "(naam nahi)")} · ${esc(o.mobile || "—")}</option>`).join("")}</select>
      <button type="button" class="dv-btn dv-btn-sm dv-btn-green" data-ok>Copy</button><button type="button" class="dv-btn dv-btn-sm" data-no>✕</button>`;
    row.appendChild(box);
    box.querySelector("[data-no]").addEventListener("click", () => box.remove());
    box.querySelector("[data-ok]").addEventListener("click", async () => {
      const target = box.querySelector("select").value;
      const ok = await DocStore.copyDocBetween(type, activeId, target);
      box.remove();
      toast(ok ? "Document copy ho gaya." : "Copy nahi hua.", ok ? "success" : "error");
      await afterChange();
    });
  }

  // ====================================================================
  //  Form tab: the big embedded uploader is replaced by a short bar
  // ====================================================================

  function renderFormBar() {
    const sec = $("enclosureDocsSection");
    if (!sec) return;
    sec.classList.add("dv-collapsed");
    let bar = $("dvFormBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "dvFormBar";
      bar.className = "dv-formbar";
      sec.insertAdjacentElement("beforebegin", bar);
      bar.style.gridColumn = "span 3";
      bar.addEventListener("click", (e) => { if (e.target.closest("button")) SaathiExtraTabs.show("tab-vault"); });
    }
    const c = active();
    const n = Object.keys(docs).length;
    bar.innerHTML = `
      <div class="dv-formbar-main"><span class="dv-formbar-ico">🗂️</span>
        <div><b>Document Section</b>
        <small>${c ? `${esc(c.name || "(naam nahi)")} · ${esc(c.mobile || "—")} — 📄 ${n} document${n === 1 ? "" : "s"}` : "No Profiles"}</small></div></div>
      <button type="button" class="dv-btn dv-btn-blue dv-btn-sm">UPLODE DOC ➜</button>`;
  }

  // ====================================================================
  //  Wiring
  // ====================================================================

  function init() {
    if (typeof DocStore === "undefined" || !build()) return;

    $("dvSearch").addEventListener("input", (e) => { query = e.target.value; renderCustomers(); });
    $("dvNew").addEventListener("click", () => { editing = "new"; renderCustForm(); });
    $("dvSync").addEventListener("click", async () => { await DocStore.syncRegistry(); toast("Saved profiles customers me jud gaye.", "success"); await afterChange(); });

    const root = $("content-vault");
    root.addEventListener("click", (e) => {
      const cust = e.target.closest(".dv-cust");
      const actEl = e.target.closest("[data-act]");
      if (actEl) { onAction(actEl.dataset.act, actEl); return; }
      if (cust) selectCustomer(cust.dataset.id);
    });

    // inline edits: queue rows
    root.addEventListener("input", (e) => {
      const t = e.target;
      const r = t.dataset && t.dataset.id ? queue.find((x) => x.id === t.dataset.id) : null;
      if (r && t.classList.contains("dv-q-holder")) r.holder = t.value;
      if (r && t.classList.contains("dv-q-number")) {
        r.number = t.value;
        const chip = t.parentElement.querySelector(".dv-nchip");
        const s = numberState(r.type, r.number);
        if (chip) { chip.className = "dv-nchip " + s.cls; chip.textContent = s.text; }
      }
    });
    root.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.classList.contains("dv-q-type")) {
        const r = queue.find((x) => x.id === t.dataset.id);
        if (r) { r.type = t.value; if (r.number) r.number = normNumber(r.type, r.number); renderQueue(); }
      } else if (t.classList.contains("dv-q-number")) {
        const r = queue.find((x) => x.id === t.dataset.id);
        if (r) { r.number = normNumber(r.type, t.value); renderQueue(); }
      } else if (t.classList.contains("dv-holder") || t.classList.contains("dv-number")) {
        const type = t.dataset.type, patch = {};
        if (t.classList.contains("dv-holder")) patch.holderName = t.value;
        else { patch.docNumber = normNumber(type, t.value); t.value = patch.docNumber; }
        await DocStore.updateDocMeta(type, patch, activeId);
        docs = await DocStore.getCustomerDocs(activeId);
        const chip = t.parentElement.querySelector(".dv-nchip");
        if (chip && patch.docNumber !== undefined) { const s = numberState(type, patch.docNumber); chip.className = "dv-nchip " + s.cls; chip.textContent = s.text; }
      }
    });

    // dropzone + file input
    const drop = $("dvDrop");
    drop.addEventListener("click", () => chooseFile("", ""));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); addFiles(Array.from(e.dataTransfer.files || []), ""); });
    $("dvFile").addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      const preset = e.target.dataset.preset || "";
      const replace = e.target.dataset.replace || "";
      e.target.value = "";
      if (!files.length) return;
      if (replace) {
        // "♻" on an existing document: swap the file, keep its name + number.
        const c = active(), prev = docs[replace];
        const pdf = await toPdfFile(files[0]);
        if (!pdf) { toast("File 2MB tak chhoti nahi ho payi / padhi nahi gayi.", "error"); return; }
        await DocStore.saveDoc(replace, pdf, c.id);
        if (prev) setUndo(`"${labelFor(replace)}" badal diya`, async () => { await DocStore.restoreDoc(replace, prev, c.id); });
        await afterChange();
        return;
      }
      addFiles(files, preset);
    });

    // keep in sync with changes made elsewhere (Form tab, portal, Profile tab)
    let t = null;
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== "local" || !(ch.saathiCustomers || ch.saathiDocStoreByProfile || ch.saathiActiveProfileId)) return;
      const box = $("content-vault");
      if (!box || box.style.display === "none") { renderFormBarSoon(); return; }
      if (box.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      clearTimeout(t); t = setTimeout(refreshAll, 150);
    });
    function renderFormBarSoon() { clearTimeout(t); t = setTimeout(async () => { await loadData(); renderFormBar(); }, 200); }

    setTimeout(async () => { await DocStore.syncRegistry(); await loadData(); renderFormBar(); }, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init(); // synchronous so this tab sits BEFORE Certificates
})();
