/**
 * healthCheck.js  (v3.1, new)
 * ------------------------------------------------------------
 * "🩺 Health check" - self-diagnosis for the extension. Open it with
 * Ctrl+K -> "Health check" (or window.SaathiHealth.show()).
 *
 * It checks the things that actually broke in the past:
 *   - modules the popup depends on really loaded,
 *   - the NCL / EWS save hooks really save their fields
 *     (a typo once made every NCL field silently vanish on save),
 *   - storage can be written/read, and how full it is,
 *   - documents without a customer / customers without documents,
 *   - the open RTPS tab: is the content script alive, which form was
 *     detected, how many enclosure rows are visible.
 * Read-only apart from one temporary storage key that it removes again.
 * ------------------------------------------------------------
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const get = (keys) => new Promise((r) => chrome.storage.local.get(keys, (res) => r(res || {})));

  const ok = (name, detail) => ({ level: "ok", name, detail: detail || "" });
  const warn = (name, detail) => ({ level: "warn", name, detail: detail || "" });
  const bad = (name, detail) => ({ level: "bad", name, detail: detail || "" });

  async function checkModules() {
    const need = [
      ["DocStore", typeof DocStore !== "undefined"],
      ["DocumentParser", typeof DocumentParser !== "undefined"],
      ["OcrEngine", typeof OcrEngine !== "undefined"],
      ["SaathiEnclosureMatch", !!window.SaathiEnclosureMatch],
      ["SaathiSignatureCore", !!window.SaathiSignatureCore],
      ["SaathiSignature (editor)", !!window.SaathiSignature],
      ["saathiToast", typeof window.saathiToast === "function"],
      ["saathiGetProfileCards", typeof window.saathiGetProfileCards === "function"],
    ];
    const missing = need.filter((n) => !n[1]).map((n) => n[0]);
    return missing.length ? bad("Core modules", "load nahi hue: " + missing.join(", ")) : ok("Core modules", need.length + " / " + need.length + " loaded");
  }

  async function checkFormDom() {
    const ids = ["dataForm", "savedList", "enclosureDocsSection"];
    const missing = ids.filter((i) => !$(i));
    return missing.length ? warn("Popup form", "elements nahi mile: " + missing.join(", ")) : ok("Popup form", "form / saved list / enclosure panel present");
  }

  // Runs the real save pipeline (readForm) and verifies the NCL/EWS keys come out.
  async function checkSaveHooks() {
    const res = [];
    try {
      if (typeof window.readForm !== "function") return [bad("Save pipeline", "readForm() nahi mila")];
      const o = window.readForm();
      if (!o || typeof o !== "object") return [bad("Save pipeline", "readForm() ne data nahi diya")];
      const base = ["name", "mobile"].filter((k) => !(k in o));
      res.push(base.length ? bad("Save pipeline", "basic fields missing: " + base.join(", ")) : ok("Save pipeline", Object.keys(o).length + " fields collect hui"));
      if ($("f_ncl_dob") || $("f_ncl_aadhaar")) {
        const need = ["ncl_dob", "ncl_aadhaar", "doc_ncl_form13_residence", "doc_autoSave"].filter((k) => !(k in o));
        res.push(need.length ? bad("NCL fields save", "ye keys save nahi ho rahi: " + need.join(", ")) : ok("NCL fields save", "DOB / Aadhaar / document ticks save hote hain"));
      } else {
        res.push(warn("NCL fields save", "NCL section popup me nahi mila"));
      }
    } catch (e) {
      res.push(bad("Save pipeline", "error: " + (e && e.message)));
    }
    return res;
  }

  async function checkStorage() {
    const res = [];
    const key = "saathiHealthProbe";
    try {
      await new Promise((r) => chrome.storage.local.set({ [key]: Date.now() }, r));
      const back = await get([key]);
      await new Promise((r) => chrome.storage.local.remove([key], r));
      res.push(back[key] ? ok("Storage read/write", "theek chal raha hai") : bad("Storage read/write", "likha hua wapas nahi mila"));
    } catch (e) {
      res.push(bad("Storage read/write", e && e.message));
    }
    try {
      const bytes = await new Promise((r) => chrome.storage.local.getBytesInUse(null, r));
      const mb = (bytes / (1024 * 1024)).toFixed(1);
      res.push(bytes > 150 * 1024 * 1024 ? warn("Storage use", mb + " MB - purane documents hata dein / backup lein") : ok("Storage use", mb + " MB"));
    } catch (e) { /* not supported */ }
    return res;
  }

  async function checkData() {
    const res = [];
    const d = await get(["formEntries", "saathiCustomers", "saathiDocStoreByProfile"]);
    const entries = Array.isArray(d.formEntries) ? d.formEntries : [];
    const customers = Array.isArray(d.saathiCustomers) ? d.saathiCustomers : [];
    const docs = d.saathiDocStoreByProfile && typeof d.saathiDocStoreByProfile === "object" ? d.saathiDocStoreByProfile : {};
    res.push(ok("Saved profiles", entries.length + " profile · " + customers.length + " customer · " + Object.keys(docs).length + " vault"));

    const noId = entries.filter((e) => !e || !e.id).length;
    if (noId) res.push(bad("Profile ids", noId + " profile ki id missing hai (load/delete nahi hoga)"));

    const custIds = new Set(customers.map((c) => c.id));
    const orphan = Object.keys(docs).filter((id) => !custIds.has(id) && !/^profile_/.test(id) && Object.keys(docs[id] || {}).length);
    if (orphan.length) res.push(warn("Orphan documents", orphan.length + " customer ke docs bina customer record ke hain"));

    const nameMob = new Map();
    entries.forEach((e) => {
      const k = String(e.mobile || "").replace(/\D/g, "") + "|" + String(e.name || "").trim().toLowerCase();
      if (k.length > 2) nameMob.set(k, (nameMob.get(k) || 0) + 1);
    });
    const dup = Array.from(nameMob.values()).filter((n) => n > 1).length;
    if (dup) res.push(warn("Duplicate profiles", dup + " naam+mobile ke duplicate hain"));
    return res;
  }

  function checkVersion() {
    try { return ok("Extension version", chrome.runtime.getManifest().version); } catch (e) { return warn("Extension version", "padh nahi paya"); }
  }

  async function checkPage() {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          if (!tab || !tab.url || !/^https:\/\/serviceonline\.bihar\.gov\.in\//.test(tab.url)) {
            return resolve([warn("RTPS page", "active tab RTPS site par nahi hai (is check ke liye portal page kholein)")]);
          }
          let done = false;
          const t = setTimeout(() => { if (!done) { done = true; resolve([bad("RTPS page", "content script jawab nahi de raha - portal page reload karein")]); } }, 1800);
          chrome.tabs.sendMessage(tab.id, { action: "ping" }, (r) => {
            if (done) return;
            done = true; clearTimeout(t);
            if (chrome.runtime.lastError || !r) return resolve([bad("RTPS page", "content script nahi mila - page reload karein")]);
            const out = [ok("RTPS page", "content script active")];
            const form = r.ncl ? "NCL (" + r.ncl + ")" : r.ews ? "EWS" : "";
            out.push(form ? ok("Form detected", form) : warn("Form detected", "NCL/EWS form pehchana nahi gaya (ya ye alag page hai)"));
            out.push(r.enclosureRows ? ok("Enclosure rows", r.enclosureRows + " row dikh rahi hain") : warn("Enclosure rows", "is page par enclosure row nahi hai"));
            const m = r.modules || {};
            const dead = Object.keys(m).filter((k) => !m[k]);
            if (dead.length) out.push(bad("Page modules", "load nahi hue: " + dead.join(", ")));
            resolve(out);
          });
        });
      } catch (e) { resolve([warn("RTPS page", "check nahi ho paya")]); }
    });
  }

  async function run() {
    const out = [];
    const steps = [checkVersion, checkModules, checkFormDom, checkSaveHooks, checkStorage, checkData, checkPage];
    for (const step of steps) {
      try {
        const r = await step();
        (Array.isArray(r) ? r : [r]).forEach((x) => out.push(x));
      } catch (e) {
        out.push(bad(step.name.replace(/^check/, ""), "check crash: " + (e && e.message)));
      }
    }
    return out;
  }

  // ---------- UI ----------
  function injectStyle() {
    if ($("saathiHealthStyle")) return;
    const st = document.createElement("style");
    st.id = "saathiHealthStyle";
    st.textContent = `
      #saathiHealthModal{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:14px;}
      #saathiHealthModal .sh-box{background:var(--surface,#fff);color:var(--text,#1e293b);border-radius:16px;width:100%;max-width:420px;max-height:88vh;overflow:auto;padding:16px 16px 12px;box-shadow:0 20px 50px -12px rgba(0,0,0,.4);}
      #saathiHealthModal h3{margin:0 0 4px;font-size:16px;} #saathiHealthModal .sh-sub{font-size:12px;opacity:.7;margin-bottom:10px;}
      #saathiHealthModal .sh-row{display:flex;gap:9px;padding:8px 10px;border-radius:10px;margin-bottom:6px;font-size:12.5px;align-items:flex-start;}
      #saathiHealthModal .sh-ok{background:rgba(31,157,99,.12);} #saathiHealthModal .sh-warn{background:rgba(217,154,31,.16);} #saathiHealthModal .sh-bad{background:rgba(220,38,38,.13);}
      #saathiHealthModal .sh-name{font-weight:700;} #saathiHealthModal .sh-detail{opacity:.85;word-break:break-word;}
      #saathiHealthModal .sh-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;}
      #saathiHealthModal button{border:none;border-radius:9px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:12.5px;}`;
    document.head.appendChild(st);
  }

  const ICON = { ok: "✅", warn: "⚠️", bad: "❌" };
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function show() {
    injectStyle();
    let m = $("saathiHealthModal");
    if (m) m.remove();
    m = document.createElement("div");
    m.id = "saathiHealthModal";
    m.innerHTML = `<div class="sh-box"><h3>🩺 Health check</h3><div class="sh-sub">Jaanch ho rahi hai…</div><div class="sh-list"></div>
      <div class="sh-actions"><button type="button" id="shCopy">Copy report</button><button type="button" id="shClose">Band karein</button></div></div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    $("shClose").addEventListener("click", () => m.remove());

    const results = await run();
    const nBad = results.filter((r) => r.level === "bad").length;
    const nWarn = results.filter((r) => r.level === "warn").length;
    m.querySelector(".sh-sub").textContent = nBad ? nBad + " problem mili" : nWarn ? "Sab theek, " + nWarn + " cheez dhyaan dene layak" : "Sab kuch theek hai";
    m.querySelector(".sh-list").innerHTML = results.map((r) =>
      `<div class="sh-row sh-${r.level}"><span>${ICON[r.level]}</span><div><div class="sh-name">${esc(r.name)}</div><div class="sh-detail">${esc(r.detail)}</div></div></div>`).join("");
    $("shCopy").addEventListener("click", async () => {
      const text = "Digital Saathi health check\n" + results.map((r) => ICON[r.level] + " " + r.name + ": " + r.detail).join("\n");
      try { await navigator.clipboard.writeText(text); window.saathiToast && window.saathiToast("Report copy ho gayi.", "success"); } catch (e) { /* ignore */ }
    });
    return results;
  }

  window.SaathiHealth = { run, show };
  window.saathiExtraActions = window.saathiExtraActions || [];
  window.saathiExtraActions.push({ icon: "🩺", label: "Health check (extension ki jaanch)", keys: "health check diagnose error problem jaanch debug", run: show });
})();
