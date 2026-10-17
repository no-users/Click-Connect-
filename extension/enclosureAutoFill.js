/**
 * enclosureAutoFill.js  (v3.1 rewrite)
 * ------------------------------------------------------------
 * Adds "🕊️ Update Page" (and "👁 Check") buttons on the portal's
 * "Attach Enclosure(s)" step. Nothing runs silently - the operator
 * clicks it. For every enclosure row it:
 *   1. picks the right option in the row's document dropdown
 *      (smart matching: enclosureMatch.js - NCL "Form-XI/XIII/IV/XVI",
 *      spelling variants, Aadhaar-first for identity, Caste vs Residence),
 *   2. waits for the portal's own script to enable the file input,
 *   3. attaches the saved PDF of the ACTIVE customer.
 * NCL: if some NCL documents are ticked in the profile's checklist, only
 * ticked NCL documents are attached (none ticked -> everything available).
 * If "Save Annexure bhi karo" is on for that profile, the portal's own
 * "Save Annexure" button is pressed after a clean run.
 * Never touches I Agree / CAPTCHA / Proceed.
 * ------------------------------------------------------------
 */
(function () {
  const EM = window.SaathiEnclosureMatch;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const digitsOf = (m) => String(m || "").replace(/\D/g, "");

  // ---------- finding rows ----------
  function findEnclosureSelects() {
    const seen = new Set();
    const out = [];
    const push = (el) => { if (el && !seen.has(el)) { seen.add(el); out.push(el); } };
    document.querySelectorAll('select[id$="_enclDoc_cb"]').forEach(push);
    if (!out.length) document.querySelectorAll('select[id*="enclDoc"], select[name*="enclDoc"]').forEach(push);
    return out;
  }

  function fileInputFor(selectEl) {
    const fieldId = selectEl.id.replace(/_enclDoc_cb$/, "");
    const byId = document.getElementById(fieldId + "_attach");
    if (byId) return byId;
    const row = selectEl.closest("tr, .row, .form-group, li, fieldset") || selectEl.parentElement;
    return row ? row.querySelector('input[type="file"]') : null;
  }

  // The portal's limit differs per row (e.g. 200 KB for the oath letter) and its hidden field is NOT always
  // bytes - it can hold "200" (KB). Reading it as bytes made every row look like "0.0 MB" and blocked every upload.
  // Order: the limit the row itself prints ("less than 200 KB") -> hidden field (unit guessed) -> 1 MB.
  function maxBytesFor(fileInput, selectEl) {
    const unit = (u) => (/^m/i.test(u) ? 1024 * 1024 : 1024);
    const scopes = [];
    const row = (selectEl || fileInput).closest ? (selectEl || fileInput).closest("tr, .row, .form-group, li, fieldset") : null;
    if (row) scopes.push(row);
    if (fileInput.parentElement) scopes.push(fileInput.parentElement);
    for (const sc of scopes) {
      const m = /(?:less than|upto|up to|max(?:imum)?|से\s*कम)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(kb|mb)/i.exec(sc.textContent || "");
      if (m) return Math.round(parseFloat(m[1]) * unit(m[2]));
    }
    const hidden = document.getElementById(fileInput.id + "_enclMaxSizeInBytes");
    const n = hidden ? parseFloat(hidden.value) : NaN;
    if (Number.isFinite(n) && n > 0) {
      if (n >= 10240) return Math.round(n);        // really bytes
      if (n <= 10) return Math.round(n * 1024 * 1024);   // 1..10 -> MB
      return Math.round(n * 1024);                 // 11..10239 -> KB
    }
    return 1024 * 1024;
  }

  const sizeText = (b) => (b >= 1024 * 1024 ? (b / (1024 * 1024)).toFixed(1) + " MB" : Math.round(b / 1024) + " KB");

  function waitForEnabled(inputEl, timeoutMs) {
    return new Promise((resolve) => {
      if (!inputEl.disabled) return resolve(true);
      const start = Date.now();
      const timer = setInterval(() => {
        if (!inputEl.disabled) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start > timeoutMs) { clearInterval(timer); resolve(false); }
      }, 120);
    });
  }

  function attachFileToInput(fileInput, file) {
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (err) {
      console.warn("[Click & Continue] attach failed", err);
      return false;
    }
  }

  function selectOption(selectEl, option) {
    // selectedIndex is safer than .value when two options share a value
    const idx = Array.from(selectEl.options).findIndex((o) => o === option || (o.value === option.value && o.text === option.text));
    if (idx >= 0) selectEl.selectedIndex = idx; else selectEl.value = option.value;
    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---------- active customer + checklist ticks ----------
  async function getActiveContext() {
    const ctx = { avail: new Set(), ticks: null, autoSave: false, label: null };
    if (typeof DocStore === "undefined") return ctx;
    try {
      ctx.label = await DocStore.getActiveProfileLabel();
      const id = await DocStore.getActiveProfileId();
      ctx.avail = new Set(await DocStore.listDocTypes(id));
      const cust = await DocStore.getCustomer(id);
      const entries = await new Promise((r) => chrome.storage.local.get(["formEntries"], (res) => r((res && res.formEntries) || [])));
      let entry = null;
      if (cust && cust.mobile) {
        const same = entries.filter((e) => digitsOf(e.mobile) === cust.mobile);
        entry = same.find((e) => cust.name && DocStore.sameName(e.name, cust.name)) || (same.length === 1 ? same[0] : null);
      }
      if (entry) {
        const t = new Set();
        let any = false;
        Object.keys(entry).forEach((k) => {
          if (/^doc_ncl_/.test(k) && (entry[k] === true || entry[k] === "true" || entry[k] === "1")) { t.add(k.slice(4)); any = true; }
        });
        if (any) ctx.ticks = t;                       // only filter when the operator ticked something
        ctx.autoSave = entry.doc_autoSave === true || entry.doc_autoSave === "true" || entry.doc_autoSave === "1";
      }
    } catch (e) { console.warn("[Click & Continue] context read failed", e); }
    return ctx;
  }

  function optionList(selectEl) {
    return Array.from(selectEl.options || []).map((o) => ({ value: o.value, text: o.textContent, disabled: o.disabled, el: o }));
  }

  function injectUpStyles() {
    if (document.getElementById("saathiUpStyle")) return;
    const st = document.createElement("style");
    st.id = "saathiUpStyle";
    st.textContent = `
      .saathi-up{display:flex;gap:11px;align-items:center;margin:8px 0 2px;padding:9px 13px;border-radius:14px;max-width:440px;border:1px solid;
        font:600 12.5px/1.4 system-ui,"Segoe UI",Roboto,Arial,sans-serif;animation:saathi-up-pop .38s cubic-bezier(.2,.9,.3,1.3);}
      .saathi-up .su-ico{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;}
      .saathi-up .su-t{font-size:13.5px;font-weight:800;} .saathi-up .su-s{font-weight:600;opacity:.85;word-break:break-word;margin-top:1px;}
      .saathi-up .su-h{margin-top:3px;font-size:11.5px;font-weight:600;color:#92400e;}
      .saathi-up-ok{background:#ECFDF3;border-color:#A6E9C4;color:#14633D;} .saathi-up-ok .su-ico{background:linear-gradient(135deg,#22c55e,#15803d);animation:saathi-up-tick .5s ease .1s both;}
      .saathi-up-warn{background:#FFF7E6;border-color:#F5D9A3;color:#92400e;} .saathi-up-warn .su-ico{background:linear-gradient(135deg,#f59e0b,#d97706);}
      .saathi-up-bad{background:#FEECEC;border-color:#F5B5B5;color:#991b1b;} .saathi-up-bad .su-ico{background:linear-gradient(135deg,#ef4444,#b91c1c);}
      .saathi-up-info{background:#EEF4FF;border-color:#C9DAFB;color:#1e3a8a;} .saathi-up-info .su-ico{background:linear-gradient(135deg,#3b82f6,#1d4ed8);}
      .saathi-up-busy{background:#F4F6FA;border-color:#DDE3EC;color:#334155;} .saathi-up-busy .su-ico{background:#94a3b8;}
      .saathi-up-busy .su-spin{width:15px;height:15px;border:2.5px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:saathi-up-rot .8s linear infinite;}
      .saathi-sum{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px;}
      .saathi-sum span{padding:5px 12px;border-radius:999px;font:700 12px system-ui,"Segoe UI",Arial,sans-serif;border:1px solid;}
      .saathi-sum .c-ok{background:#ECFDF3;border-color:#A6E9C4;color:#14633D;} .saathi-sum .c-warn{background:#FFF7E6;border-color:#F5D9A3;color:#92400e;}
      .saathi-sum .c-bad{background:#FEECEC;border-color:#F5B5B5;color:#991b1b;} .saathi-sum .c-info{background:#EEF4FF;border-color:#C9DAFB;color:#1e3a8a;}
      @keyframes saathi-up-pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
      @keyframes saathi-up-tick{from{transform:scale(0) rotate(-40deg)}to{transform:scale(1) rotate(0)}}
      @keyframes saathi-up-rot{to{transform:rotate(360deg)}}`;
    (document.head || document.documentElement).appendChild(st);
  }

  // One consistent status card under every enclosure row: ✓ Document Uploaded / ⚠ / ✕ / ⓘ / spinner.
  function showRowNote(anchorEl, title, kind, sub, hint) {
    try {
      injectUpStyles();
      const host = anchorEl.parentElement || anchorEl;
      const key = anchorEl.id || "x";
      const old = host.querySelector(".saathi-up[data-for='" + key + "']");
      if (old) old.remove();
      const k = kind === "ok" ? "ok" : kind === "warn" ? "warn" : kind === "bad" ? "bad" : kind === "busy" ? "busy" : "info";
      const card = document.createElement("div");
      card.className = "saathi-up saathi-up-" + k;
      card.setAttribute("data-for", key);
      const ico = document.createElement("div");
      ico.className = "su-ico";
      if (k === "busy") { const sp = document.createElement("div"); sp.className = "su-spin"; ico.appendChild(sp); }
      else ico.textContent = k === "ok" ? "✓" : k === "warn" ? "!" : k === "bad" ? "✕" : "i";
      const tx = document.createElement("div");
      const t = document.createElement("div"); t.className = "su-t"; t.textContent = title; tx.appendChild(t);
      if (sub) { const e = document.createElement("div"); e.className = "su-s"; e.textContent = sub; tx.appendChild(e); }
      if (hint) { const h = document.createElement("div"); h.className = "su-h"; h.textContent = hint; tx.appendChild(h); }
      card.appendChild(ico); card.appendChild(tx);
      anchorEl.insertAdjacentElement("afterend", card);
    } catch (e) { /* a cosmetic note must never break the fill */ }
  }

  // ---------- one row ----------
  // dryRun: only report what WOULD happen.  returns {state: ok|missing|big|nomatch|stuck|fail|blocked, ...}
  async function fillOneRow(selectEl, ctx, dryRun) {
    const fileInput = fileInputFor(selectEl);
    if (!fileInput) return { state: "fail" };
    const options = optionList(selectEl);
    const plan = EM.planRow(options, ctx.avail, {
      service: ctx.service,
      allowed: ctx.ticks ? (t) => !/^ncl_/.test(t) || ctx.ticks.has(t) : null,
    });

    if (!plan.pick) {
      const want = plan.accepted.slice(0, 4).map(EM.labelFor).join(" / ");
      if (!plan.accepted.length) { showRowNote(fileInput, "Option pehchana nahi gaya", "info", "Is row me document haath se chunein."); return { state: "nomatch" }; }
      if (plan.blocked.length) { showRowNote(fileInput, "Checklist me tick nahi", "info", plan.blocked.map(EM.labelFor).join(", ")); return { state: "blocked" }; }
      showRowNote(fileInput, "Vault me nahi hai", "warn", "Chahiye: " + want);
      return { state: "missing", want };
    }

    const { type, option } = plan.pick;
    const name = EM.labelFor(type);
    const file = await DocStore.getDocAsFile(type).catch(() => null);
    if (!file) { showRowNote(fileInput, "File padhi nahi gayi", "warn", name); return { state: "fail" }; }

    // The limit is only a HINT now: our reading of the portal's limit can be wrong (the same file uploaded by hand
    // was accepted), so we never block on it - we attach and let the portal's own check decide.
    const limit = maxBytesFor(fileInput, selectEl);
    const over = file.size > limit;
    if (dryRun) { showRowNote(fileInput, "Ye document lagega", "info", `${name} · ${sizeText(file.size)}`); return { state: "ok", name, dry: true }; }

    showRowNote(fileInput, "Upload ho raha hai…", "busy", name);
    const sel = document.getElementById(selectEl.id) || selectEl;     // portal may re-render the node
    selectOption(sel, option.el || option);
    const enabled = await waitForEnabled(fileInput, 4500);
    if (!enabled) {
      showRowNote(fileInput, "Portal ne file box nahi khola", "warn", name, "Dropdown haath se ek baar chunkar Update Page dobara dabayein.");
      return { state: "stuck", name };
    }
    if (!attachFileToInput(fileInput, file)) { showRowNote(fileInput, "Attach nahi hua", "warn", name); return { state: "fail", name }; }
    const detail = `${name} · ${file.name} · ${sizeText(file.size)}`;
    if (over) {
      showRowNote(fileInput, "Document Uploaded", "ok", detail, `Portal ki limit ${sizeText(limit)} dikh rahi hai - reject ho to Vault me 📉 se chhota karein.`);
      return { state: "ok", name, over: true };
    }
    showRowNote(fileInput, "Document Uploaded", "ok", detail);
    return { state: "ok", name };
  }

  function summarize(results) {
    const c = (s) => results.filter((r) => r.state === s).length;
    const parts = [];
    if (c("ok")) parts.push("✅ " + c("ok") + " lage");
    const overN = results.filter((r) => r.over).length;
    if (overN) parts.push("ⓘ " + overN + " limit se bade (portal check karega)");
    if (c("missing")) parts.push("⚠ " + c("missing") + " vault me nahi");
    if (c("big")) parts.push("⛔ " + c("big") + " bade");
    if (c("stuck") + c("fail")) parts.push("⚠ " + (c("stuck") + c("fail")) + " nahi lage");
    if (c("blocked")) parts.push("☐ " + c("blocked") + " tick nahi");
    if (c("nomatch")) parts.push("ⓘ " + c("nomatch") + " pehchane nahi");
    return parts.join(" · ") || "koi row nahi mili";
  }

  const SAVE_RE = /save\s*annexure|annexure\s*save|अनुलग्नक\s*(?:को\s*)?(?:सुरक्षित|सेव|सहेज)/i;
  function findSaveAnnexure() {
    const cands = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], a.btn, a"));
    return cands.find((el) => SAVE_RE.test((el.value || el.textContent || el.title || "").trim())) || null;
  }

  async function run(button, dryRun) {
    const selects = findEnclosureSelects();
    const statusEl = document.getElementById("saathiEnclosureStatus");
    const setStatus = (t, results2) => {
      if (!statusEl) return;
      statusEl.textContent = t;                         // plain text first (also the fallback)
      if (!results2) return;
      try {                                             // then the pretty version
        injectUpStyles();
        const box = document.createElement("div");
        box.className = "saathi-sum";
        const chip = (cls, txt) => { const c = document.createElement("span"); c.className = cls; c.textContent = txt; box.appendChild(c); };
        const n = (st) => results2.filter((r) => r.state === st).length;
        const overN = results2.filter((r) => r.over).length;
        if (n("ok")) chip("c-ok", "✓ " + n("ok") + (dryRun ? " lagenge" : " Documents Uploaded"));
        if (overN) chip("c-info", "ⓘ " + overN + " limit se bade");
        if (n("missing")) chip("c-warn", "⚠ " + n("missing") + " vault me nahi");
        if (n("stuck") + n("fail")) chip("c-bad", "✕ " + (n("stuck") + n("fail")) + " nahi lage");
        if (n("blocked")) chip("c-info", "☐ " + n("blocked") + " tick nahi");
        if (n("nomatch")) chip("c-info", "ⓘ " + n("nomatch") + " pehchane nahi");
        if (extra) chip("c-info", extra);
        statusEl.textContent = "";
        statusEl.appendChild(box);
      } catch (e) { statusEl.textContent = t; /* keep plain text */ }
    };
    let extra = "";
    if (!selects.length) { setStatus("ⓘ Is page par enclosure row nahi mili."); return; }
    if (typeof DocStore === "undefined" || !EM) { setStatus("⚠ Extension ka document module load nahi hua - page reload karein."); return; }
    const btns = document.querySelectorAll("#saathiEnclosureFillBtn, #saathiEnclosureCheckBtn");
    btns.forEach((b) => { b.disabled = true; });
    const old = button.textContent;
    button.textContent = "⏳ Ho raha hai...";
    const ctx = await getActiveContext();
    ctx.service = EM.pageService(document);
    const results = [];
    for (const sel of selects) {
      try { results.push(await fillOneRow(sel, ctx, dryRun)); } catch (e) { console.warn(e); results.push({ state: "fail" }); }
    }
    setStatus((dryRun ? "👁 Check: " : "") + summarize(results), results);
    button.textContent = old;
    btns.forEach((b) => { b.disabled = false; });

    const clean = results.every((r) => r.state === "ok" || r.state === "blocked" || r.state === "missing" || r.state === "nomatch");
    if (!dryRun && ctx.autoSave && results.some((r) => r.state === "ok") && clean && !results.some((r) => r.over)) {
      await sleep(900);
      const save = findSaveAnnexure();
      if (save) { extra = "💾 Save Annexure dab raha hai"; setStatus(summarize(results) + " · " + extra, results); save.click(); }
      else { extra = "Save Annexure button nahi mila - haath se dabayein"; setStatus(summarize(results) + " · " + extra, results); }
    }
  }

  // Same shared pill look as activeProfileBadge.js's "Active: <name>"
  // badge — duplicated here (not imported) since content scripts can't
  // share modules, but guarded by id so only one copy of the stylesheet
  // ever lands on the page regardless of which script runs first.
  function injectBadgeStyles() {
    if (document.getElementById("saathiOnPageBadgeStyles")) return;
    const style = document.createElement("style");
    style.id = "saathiOnPageBadgeStyles";
    style.textContent = `
      @keyframes saathiBadgeIn {
        from { opacity: 0; transform: translateY(6px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes saathiDotPulse {
        0%   { box-shadow: 0 0 0 0 rgba(76, 217, 123, 0.55); }
        70%  { box-shadow: 0 0 0 7px rgba(76, 217, 123, 0); }
        100% { box-shadow: 0 0 0 0 rgba(76, 217, 123, 0); }
      }
      @keyframes saathiValueShimmer { to { background-position: -200% center; } }
      .saathi-onpage-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-family: Arial, sans-serif;
        background: linear-gradient(135deg, #24365c 0%, #14203a 100%);
        color: #fff;
        border: 1px solid rgba(217, 164, 78, 0.55);
        border-radius: 999px;
        box-shadow: 0 8px 20px -6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
        animation: saathiBadgeIn 0.35s cubic-bezier(0.16,1,0.3,1);
      }
      .saathi-onpage-badge .saathi-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #4cd97b;
        flex-shrink: 0;
        animation: saathiDotPulse 1.8s ease-out infinite;
      }
      .saathi-onpage-badge .saathi-value {
        font-weight: 700;
        background: linear-gradient(90deg, #eabd6a 0%, #fff5da 50%, #eabd6a 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: saathiValueShimmer 2.5s linear infinite;
      }
    `;
    document.documentElement.appendChild(style);
  }

  injectBadgeStyles();

  let injectInProgress = false;

  async function injectButton() {
    if (document.getElementById("saathiEnclosureFillBtn")) return;
    if (injectInProgress) return;
    injectInProgress = true;
    try {
      const selects = findEnclosureSelects();
      if (selects.length === 0) return;
      const anchor = selects[0].closest(".box") || selects[0].closest("form") || document.body;
      const wrap = document.createElement("div");
      wrap.style.cssText = "margin:10px 0;";
      const profileLabel = typeof DocStore !== "undefined" ? await DocStore.getActiveProfileLabel() : null;
      if (document.getElementById("saathiEnclosureFillBtn")) return;

      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;font-weight:700;margin-bottom:6px;padding:6px 10px;border-radius:8px;" +
        (profileLabel ? "background:#EAF9F1;color:#1c6b46;" : "background:#FFF4E5;color:#9A6400;");
      const mark = document.createElement("img");
      mark.src = window.SAATHI_LOGO_URI || ""; mark.alt = "";
      mark.style.cssText = "width:16px;height:16px;border-radius:4px;vertical-align:-3px;margin-right:7px;";
      note.appendChild(mark);
      note.appendChild(document.createTextNode(profileLabel || "Koi active profile nahi - popup me profile Load/Update karein"));
      wrap.appendChild(note);

      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";
      const mk = (id, text, grad) => {
        const b = document.createElement("button");
        b.type = "button"; b.id = id; b.textContent = text;
        b.style.cssText = "display:inline-block;padding:10px 18px;font-size:13.5px;font-weight:700;color:#fff;border:none;border-radius:10px;cursor:pointer;" +
          "background:" + grad + ";box-shadow:0 8px 18px -8px rgba(254,40,175,.75);";
        return b;
      };
      const fill = mk("saathiEnclosureFillBtn", "🕊️ Update Page", "linear-gradient(135deg,#9B00D2,#FE28AF 60%,#DD603E)");
      const check = mk("saathiEnclosureCheckBtn", "👁 Check", "linear-gradient(135deg,#6b7a99,#3b4763)");
      fill.addEventListener("click", () => run(fill, false));
      check.addEventListener("click", () => run(check, true));
      row.appendChild(fill); row.appendChild(check);
      wrap.appendChild(row);

      const status = document.createElement("div");
      status.id = "saathiEnclosureStatus";
      status.style.cssText = "margin-top:6px;font-size:12px;font-weight:700;color:#24365c;";
      wrap.appendChild(status);

      anchor.parentElement ? anchor.parentElement.insertBefore(wrap, anchor) : document.body.insertBefore(wrap, document.body.firstChild);
    } finally {
      injectInProgress = false;
    }
  }

  let debounce = null;
  const observer = new MutationObserver(() => { clearTimeout(debounce); debounce = setTimeout(injectButton, 120); });
  observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectButton);
  else injectButton();

  // exposed for the popup Health Check ("ping" in content.js)
  window.__saathiEnclosureRows = () => findEnclosureSelects().length;
})();
