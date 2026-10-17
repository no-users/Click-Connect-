/**
 * enclosureDocsPanel.js
 * ------------------------------------------------------------
 * "Documents" section embedded directly INSIDE the Create/Edit
 * Profile form (#dataForm).
 *
 * Every document type is picked from ONE combined dropdown (grouped
 * with <optgroup>, matching the real government page's own
 * document-type pickers) followed by either a file picker or
 * drag-and-drop — instead of a separate upload button per document
 * type.
 *
 * Documents are tied to the ACTUAL customer (by mobile number, via
 * docStore.js's switchToProfile / migrateActiveSessionTo) so that:
 *   - opening a saved profile (Load/Update on the Profile tab) shows
 *     THAT customer's documents here, not whoever was last active;
 *   - documents uploaded while creating a brand-new profile (before
 *     the mobile number is even typed in) automatically attach
 *     themselves to that profile the moment the mobile is entered.
 * See docProfileLink.js for the Load/Update/Delete button wiring and
 * the doc-completion badge on each saved-profile card.
 *
 * Extra features in this file:
 *   - 🗜️ auto-compress an oversized PDF before rejecting it
 *   - 🖱️ drag-and-drop upload
 *   - 📤 copy one document to another saved customer (shared
 *     household proofs like ration card / electricity bill)
 *   - 📋 "poori list" checklist view — shows missing document types
 *     too, not just uploaded ones (a visual reminder)
 *   - ↩️ undo right after removing a document
 *   - 📦 download everything for this customer as one ZIP
 *   - 💾 total extension storage usage
 *
 * PDF only, 2MB max per file (auto-compress is tried first on PDFs
 * over the limit before it's rejected).
 *
 * 100% additive — separate file, does not touch docsTab.js's OCR
 * queue, content.js, or popup.js.
 * ------------------------------------------------------------
 */

(function () {
  // Every known document type, grouped the way the real "Jati Aay
  // Niwas" application's own "Attach Enclosure(s)" step groups them —
  // taken directly off the actual government form's evidence-document
  // dropdowns for each certificate.
  const GROUPS = [
    {
      title: "➦ आवेदक का पहचान दस्तावेज",
      icon: "",
      items: [
        { key: "election_id", label: "निर्वाचन पहचान पत्र" },
        { key: "voter_id", label: "मतदाता पहचान पत्र" },
        { key: "pension_doc", label: "पेंशन दस्तावेज (फोटो सहित)" },
        { key: "driving_license", label: "ड्राइविंग लाइसेंस" },
        { key: "aadhaar", label: "आधार कार्ड" },
        { key: "passbook", label: "पासबुक (फोटो सहित बैंक/डाकघर द्वारा जारी)" },
        { key: "passport", label: "पासपोर्ट" },
        { key: "smart_card_labour", label: "स्मार्ट कार्ड (श्रम मंत्रालय की योजना के अंतर्गत जारी)" },
        { key: "health_insurance_card", label: "स्वास्थ्य बीमा स्मार्ट कार्ड (श्रम मंत्रालय की योजना के अंतर्गत जारी)" },
        { key: "pan_card", label: "पैन कार्ड" },
        { key: "govt_id", label: "सरकारी पहचान पत्र (सांसद, विधायक और विधान परिषद सदस्यों को जारी)" },
        { key: "service_id", label: "सर्विस पहचान पत्र (केंद्र, राज्य, सार्वजानिक)" },
      ],
    },
    {
      title: "➦ जाति प्रमाण पत्र ",
      icon: "",
      items: [
        { key: "caste_khatiyan", label: "राजस्व अभिलेख - खतियान" },
        { key: "caste_danpatra", label: "राजस्व अभिलेख - दानपत्र" },
        { key: "caste_land_doc", label: "राजस्व अभिलेख - भूमि संबंधी दस्तावेज" },
        { key: "caste_landless_allotment", label: "राजस्व अभिलेख - भूमिहीनों को आवंटित जमीन से संबंधित अभिलेख" },
        { key: "caste_other_revenue", label: "अन्य राजस्व अभिलेख" },
        { key: "caste_site_inspection_request", label: "राजस्व अभिलेखों की अनुपलब्धता की स्थिति में स्थल निरीक्षण हेतु आग्रह" },
      ],
    },
    {
      title: "➦ निवास प्रमाण पत्र ",
      icon: "",
      items: [
        { key: "revenue_khatiyan", label: "राजस्व अभिलेख - खतियान" },
        { key: "revenue_danpatra", label: "राजस्व अभिलेख - दानपत्र" },
        { key: "revenue_land_doc", label: "राजस्व अभिलेख - भूमि संबंधी दस्तावेज" },
        { key: "revenue_landless_allotment", label: "राजस्व अभिलेख - भूमिहीनों को आवंटित जमीन से संबंधित अभिलेख" },
        { key: "revenue_other", label: "अन्य राजस्व अभिलेख" },
        { key: "ration_card", label: "राशन कार्ड" },
        { key: "electricity_bill", label: "विद्युत विपत्र" },
        { key: "telephone_bill", label: "दूरभाष विपत्र" },
      ],
    },
    {
      title: "➦ आय प्रमाण पत्र ",
      icon: "",
      items: [
        { key: "salary_pension_slip", label: "वेतन / पेंशन पर्ची" },
        { key: "income_tax_return", label: "आयकर रिटर्न" },
        { key: "income_other", label: "अन्यान्य अभिलेख" },
      ],
    },
      {
    title: "➦ NCL (बिहार-केंद्र)",
    icon: "",
    items: [
      { key: "ncl_b_affidavit_form11", label: "NCL बिहार — Form-XI आवेदक का स्वयं शपथ पत्र" },
      { key: "ncl_c_affidavit_form8", label: "NCL केंद्र — Form-VIII आवेदक का स्वयं शपथ पत्र" },
      { key: "ncl_form13_residence", label: "Form-XIII निवास / आवास प्रमाण पत्र" },
      { key: "ncl_form4_caste", label: "Form-IV जाति प्रमाण पत्र" },
      { key: "ncl_form16_income", label: "Form-XVI आय प्रमाण पत्र" },
      { key: "ncl_b_irrigated_land_pct", label: "सिंचित जमीन का प्रतिशत (बिहार सरकार के सिलिंग कानून के अंतर्गत)" },
    ],
  },
  ];

  const ALL_TYPES = [].concat(...GROUPS.map((g) => g.items));
  window.SaathiDocGroups = GROUPS; // shared with the Doc Vault tab (docVault.js)

  const MAX_MB = 2;
  const STYLE_ID = "saathiEnclosureStyle";

  // Transient (non-persisted) UI state.
  let viewMode = "uploaded"; // "uploaded" | "checklist"
  let lastDeleted = null; // { docType, entry }
  let undoTimer = null;

  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // Every colour here is one of the extension's own CSS variables,
    // so this automatically follows the light/dark theme toggle.
    style.textContent = `
      .saathi-doc-body {
        background: var(--card-bg);
        border: 1.5px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 10px 12px 12px;
        margin-top: 8px;
        box-shadow: var(--shadow-card);
      }
      .saathi-doc-profile {
        font-size: 10.5px; font-weight: 700; margin: 0 0 10px; padding: 6px 10px;
        border-radius: var(--radius-md); border: 1.5px solid var(--border-color);
      }
      .saathi-doc-picker { margin-bottom: 10px; }
      .saathi-doc-picker-label {
        font-size: 10px; font-weight: 700; color: var(--accent-navy);
        margin-bottom: 5px; display:flex; align-items:center; gap:5px;
      }
      .saathi-doc-row { display:flex; gap:8px; align-items:flex-start; margin-bottom:6px; flex-wrap:wrap; }
      .saathi-doc-row select { flex: 1; min-width: 160px; }
      .saathi-doc-filewrap { flex: 1; }
      .saathi-doc-filewrap input[type="file"] { margin: 0; width: 100%; }
      .saathi-doc-hint { font-size: 9.5px; color: var(--text-muted); margin: 6px 0 0; }
      .saathi-doc-error {
        font-size:10.5px; font-weight:600; color:#fff; background: var(--danger);
        border-radius: var(--radius-md); padding:6px 9px; margin-bottom:8px;
      }
      .saathi-doc-error-success { background: #1c8a5a; }
      .saathi-doc-error-info { background: var(--accent-navy, #2b4f81); }
      .saathi-doc-uploaded-title {
        font-size: 10px; font-weight: 700; color: var(--accent-navy);
        margin: 12px 0 5px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;
      }
      .saathi-quick-row {
        display:flex; align-items:center; gap:8px; padding:7px 9px;
        border-radius: var(--radius-md); background: var(--input-bg);
        border: 1px solid var(--border-color); margin-bottom: 5px; position: relative;
      }
      .saathi-quick-row-missing { opacity: 0.6; border-style: dashed; }
      .saathi-quick-row .lbl { flex:1; font-size:10.5px; color: var(--text-primary); font-weight:600; }
      .saathi-quick-row .status { font-size:9px; color: var(--text-muted); max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .saathi-quick-row .chk {
        width:16px; height:16px; border-radius:50%; background:#1c8a5a; color:#fff;
        display:flex; align-items:center; justify-content:center; font-size:9px; flex-shrink:0;
      }
      .saathi-quick-row .chk-missing { background: transparent; border: 1.5px dashed var(--text-muted); color: var(--text-muted); }
      .saathi-quick-row .rm, .saathi-quick-row .view, .saathi-quick-row .copy {
        border:none; background:none; font-size:12px; cursor:pointer; padding:2px 4px;
      }
      .saathi-quick-row .rm { color: var(--danger); }
      .saathi-quick-row .view, .saathi-quick-row .copy { color: var(--accent-navy); }
      .saathi-doc-empty { font-size: 9.5px; color: var(--text-muted); }
      .saathi-doc-group { margin-bottom: 8px; }
      .saathi-doc-group-title {
        font-size: 9.5px; font-weight: 700; color: var(--text-muted);
        margin-bottom: 4px; display:flex; align-items:center; gap:5px;
      }
      .saathi-doc-group-count {
        background: var(--accent-navy); color:#fff; border-radius: 999px;
        font-size: 8.5px; padding: 0 5px; min-width: 14px; text-align:center;
      }
      .saathi-doc-clearall {
        border:none; background:none; color: var(--text-muted); font-size:9px;
        font-weight:700; cursor:pointer; padding:2px 6px; border:1px solid var(--border-color);
        border-radius: var(--radius-md);
      }
      .saathi-doc-clearall.danger { color: var(--danger); }
      #saathiDocCountBadge {
        display:none; align-items:center; justify-content:center;
        background: #1c8a5a; color:#fff; font-size: 9px; font-weight:700;
        border-radius: 999px; min-width: 15px; height: 15px; padding: 0 4px;
        margin-left: 4px;
      }
      .saathi-dropzone {
        flex: 1; border: 1.5px dashed var(--border-color); border-radius: var(--radius-md);
        padding: 6px; transition: border-color .15s, background .15s;
      }
      .saathi-dropzone.dragging { border-color: var(--accent-navy); background: var(--input-bg); }
      .saathi-dropzone-hint { font-size: 9px; color: var(--text-muted); margin-top: 3px; }
      .saathi-copy-picker {
        position:absolute; right:6px; top:100%; margin-top:4px; z-index:5;
        background: var(--card-bg); border:1.5px solid var(--border-color);
        border-radius: var(--radius-md); padding:6px; display:flex; gap:5px; align-items:center;
        box-shadow: var(--shadow-card);
      }
      .saathi-copy-picker select { font-size: 9.5px; max-width: 160px; }
      .saathi-copy-picker button { border:none; background:none; cursor:pointer; font-size:12px; }
      #saathiUndoToast {
        display:none; align-items:center; justify-content:space-between; gap:8px;
        background: var(--text-primary); color: var(--card-bg); font-size: 10px;
        border-radius: var(--radius-md); padding: 7px 10px; margin-top: 6px;
      }
      #saathiUndoToast button {
        background: var(--accent-navy); color:#fff; border:none; border-radius: var(--radius-md);
        padding: 4px 9px; font-size: 9.5px; font-weight:700; cursor:pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function labelFor(key) {
    const t = ALL_TYPES.find((x) => x.key === key);
    return t ? t.label : key;
  }

  function isPdf(file) {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday
      ? "Aaj, " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }

  function showStatus(msg, kind) {
    const box = document.getElementById("saathiDocError");
    if (!box) return;
    const icon = kind === "error" ? "⚠️ " : kind === "success" ? "✅ " : "ℹ️ ";
    box.textContent = icon + msg;
    box.classList.toggle("saathi-doc-error-success", kind === "success");
    box.classList.toggle("saathi-doc-error-info", kind === "info");
    box.style.display = "block";
    clearTimeout(box._hideTimer);
    box._hideTimer = setTimeout(() => { box.style.display = "none"; }, 4800);
  }
  const showError = (msg) => showStatus(msg, "error");

  async function refreshProfileLine() {
    const el = document.getElementById("saathiDocProfileLine");
    if (!el || typeof DocStore === "undefined") return;
    const label = await DocStore.getActiveProfileLabel();
    el.textContent = label
      ? "🍀 " + label + ""
      : "Name - Phone Number";
  }

  async function refreshStorageLine() {
    const el = document.getElementById("saathiStorageLine");
    if (!el) return;
    el.textContent = "";
    el.style.display = "none"; // no text to show — collapse instead of leaving a blank gap
  }

  async function handleUpload(docType, file) {
    if (!isPdf(file)) {
      showError(`${labelFor(docType)} — sirf PDF file upload karein.`);
      return false;
    }
    let toSave = file;
    if (file.size > MAX_MB * 1024 * 1024) {
      showStatus(`${labelFor(docType)} — ${(file.size / (1024 * 1024)).toFixed(1)}MB hai, ${MAX_MB}MB se badi. Auto-compress try kar rahe hain...`, "info");
      const compressed = window.SaathiPdfTools ? await window.SaathiPdfTools.compressPdfFile(file, MAX_MB * 1024 * 1024) : null;
      if (compressed) {
        toSave = compressed;
        showStatus(`Auto-compress ho gaya — naya size ${(compressed.size / (1024 * 1024)).toFixed(1)}MB.`, "success");
      } else {
        showError(`${labelFor(docType)} — file ${MAX_MB}MB se badi hai aur auto-compress se bhi ${MAX_MB}MB tak nahi aa payi. Scan ki quality/resolution kam karke chhoti PDF banayein.`);
        return false;
      }
    }
    const existing = await DocStore.getDoc(docType);
    if (existing && !confirm(`${labelFor(docType)} pehle se upload hai (${existing.name}). Isse replace karna chahte hain?`)) {
      return false;
    }
    const ok = await DocStore.saveDoc(docType, toSave);
    if (!ok) showError("Yeh file save nahi ho payi, dobara try karein.");
    return ok;
  }

  function revokeOldPreview(btn) {
    if (btn && btn.dataset.blobUrl) {
      URL.revokeObjectURL(btn.dataset.blobUrl);
      delete btn.dataset.blobUrl;
    }
  }

  function showUndoToast(docType, entry) {
    lastDeleted = { docType, entry };
    const toast = document.getElementById("saathiUndoToast");
    if (!toast) return;
    toast.innerHTML = `<span> "${labelFor(docType)}" Removed</span>`;
    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.textContent = "↩️ Undo";
    toast.appendChild(undoBtn);
    toast.style.display = "flex";
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { toast.style.display = "none"; lastDeleted = null; }, 8000);
    undoBtn.addEventListener("click", async () => {
      if (!lastDeleted) return;
      await DocStore.restoreDoc(lastDeleted.docType, lastDeleted.entry);
      lastDeleted = null;
      clearTimeout(undoTimer);
      toast.style.display = "none";
      renderList();
    });
  }

  async function openCopyPicker(btn) {
    const docType = btn.dataset.type;
    const row = btn.closest(".saathi-quick-row");
    if (!row || row.querySelector(".saathi-copy-picker")) return;

    const cards = Array.from(document.querySelectorAll("#savedList > div"));
    const activeLabel = (await DocStore.getActiveProfileLabel()) || "";
    const options = cards
      .map((card) => {
        // Prefer the dedicated mobile/ID line (cleaned digits, no risk
        // of picking up a serial-number or other stray digits from the
        // rest of the card) — same approach as docProfileLink.js, for
        // the same reason: getting this wrong would offer to copy a
        // document onto the wrong customer.
        const idLine = card.querySelector(".saathi-userid");
        const fromIdLine = idLine && (idLine.textContent || "").match(/\d{10}/);
        const mobileMatch = fromIdLine || (card.textContent || "").match(/\b\d{10}\b/);
        const h2 = card.querySelector("h2");
        // h2 also contains the "📄 N" doc-count badge as a child element
        // (see docProfileLink.js's addCompletionBadge) — strip it first so
        // the picker shows "Sita Devi", not "Sita Devi📄 0".
        let name = "";
        if (h2) {
          const clone = h2.cloneNode(true);
          const badge = clone.querySelector(".saathi-doc-badge");
          if (badge) badge.remove();
          name = clone.textContent.replace(/^\s*\d+\.\s*/, "").trim();
        }
        return mobileMatch ? { mobile: mobileMatch[0], name } : null;
      })
      .filter(Boolean)
      .filter((o) => !(activeLabel.includes(o.mobile) && (!o.name || activeLabel.toLowerCase().includes(o.name.toLowerCase()))));

    if (!options.length) {
      showError("Copy karne ke liye koi doosra saved profile nahi mila.");
      return;
    }

    const picker = document.createElement("div");
    picker.className = "saathi-copy-picker";
    picker.innerHTML = `
      <select class="saathi-copy-select">
        ${options.map((o, i) => `<option value="${i}">${o.name || "—"} (${o.mobile})</option>`).join("")}
      </select>
      <button type="button" class="saathi-copy-confirm" title="Copy karein">☑️</button>
      <button type="button" class="saathi-copy-cancel" title="Cancel">✕</button>
    `;
    row.appendChild(picker);
    picker.querySelector(".saathi-copy-cancel").addEventListener("click", () => picker.remove());
    picker.querySelector(".saathi-copy-confirm").addEventListener("click", async () => {
      const chosen = options[Number(picker.querySelector(".saathi-copy-select").value)];
      const ok = chosen ? await DocStore.copyDocToProfile(docType, chosen.mobile, chosen.name) : false;
      picker.remove();
      showStatus(ok ? `${labelFor(docType)} Added.` : "Not Added.", ok ? "success" : "error");
    });
  }

  function wireRowButtons(listEl) {
    listEl.querySelectorAll(".rm").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const type = btn.dataset.type;
        const entry = await DocStore.getDoc(type);
        await DocStore.removeDoc(type);
        renderList();
        if (entry) showUndoToast(type, entry);
      });
    });
    listEl.querySelectorAll(".view").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const file = await DocStore.getDocAsFile(btn.dataset.type);
        if (!file) return;
        const url = URL.createObjectURL(file);
        btn.dataset.blobUrl = url;
        const tab = window.open(url, "_blank");
        if (!tab) { URL.revokeObjectURL(url); delete btn.dataset.blobUrl; }
        else setTimeout(() => revokeOldPreview(btn), 60000);
      });
    });
    listEl.querySelectorAll(".copy").forEach((btn) => {
      btn.addEventListener("click", () => openCopyPicker(btn));
    });
  }

  async function renderList() {
    const listEl = document.getElementById("saathiUploadedList");
    const countBadge = document.getElementById("saathiDocCountBadge");
    if (!listEl || typeof DocStore === "undefined") return;
    listEl.innerHTML = "";
    let total = 0;
    let matchedAny = false;

    for (const g of GROUPS) {
      const rows = [];
      for (const t of g.items) {
        const saved = await DocStore.getDoc(t.key);
        if (saved) total++;
        if (viewMode === "uploaded" && !saved) continue;
        rows.push({ ...t, saved });
      }
      if (rows.length === 0) continue;
      matchedAny = true;

      const doneInGroup = rows.filter((r) => r.saved).length;
      const groupWrap = document.createElement("div");
      groupWrap.className = "saathi-doc-group";
      groupWrap.innerHTML = `<div class="saathi-doc-group-title">${g.icon || ""} ${g.title} <span class="saathi-doc-group-count">${doneInGroup}/${rows.length}</span></div>`;

      rows.forEach(({ key, label, saved }) => {
        const row = document.createElement("div");
        row.className = "saathi-quick-row" + (saved ? "" : " saathi-quick-row-missing");
        if (saved) {
          const meta = [formatSize(saved.size), formatDate(saved.savedAt)].filter(Boolean).join(" · ");
          row.title = saved.name + (meta ? " — " + meta : "");
          row.innerHTML = `
            <span class="chk">🟥⃢▸</span>
            <span class="lbl">${label}</span>
            <span class="status">${meta || saved.name}</span>
            <button type="button" class="view" data-type="${key}" title="View">👁️</button>
            <button type="button" class="copy" data-type="${key}" title="Copy To Another Profile">📑</button>
            <button type="button" class="rm" data-type="${key}" title="Delete">🚮</button>
          `;
        } else {
          row.innerHTML = `
            <span class="chk chk-missing">○</span>
            <span class="lbl">${label}</span>
            <span class="status">missing</span>
          `;
        }
        groupWrap.appendChild(row);
      });
      listEl.appendChild(groupWrap);
    }

    if (!matchedAny) {
      listEl.innerHTML = `<div class="saathi-doc-empty"></div>`;
    }
    if (countBadge) {
      countBadge.textContent = total > 0 ? String(total) : "";
      countBadge.style.display = total > 0 ? "inline-flex" : "none";
    }

    wireRowButtons(listEl);

    // Keep the Profile-tab card badge for this same customer in sync
    // the moment their document list changes — not just when that tab
    // is next opened.
    if (window.SaathiProfileBadges && typeof window.SaathiProfileBadges.refreshActive === "function") {
      window.SaathiProfileBadges.refreshActive();
    }
  }

  async function downloadAllAsZip() {
    const entries = [];
    for (const t of ALL_TYPES) {
      const file = await DocStore.getDocAsFile(t.key);
      if (!file) continue;
      const bytes = new Uint8Array(await file.arrayBuffer());
      entries.push({ name: `${t.label.replace(/[\\/:*?"<>|]/g, "_")}.pdf`, bytes });
    }
    if (!entries.length) { showError("Is customer ki koi documents upload nahi hain."); return; }
    if (!window.SaathiPdfTools) { showError("ZIP banane wala tool load nahi hua."); return; }
    const zipBlob = await window.SaathiPdfTools.zipFiles(entries);
    if (!zipBlob) { showError("ZIP nahi ban paaya."); return; }
    const label = (await DocStore.getActiveProfileLabel()) || "documents";
    const safeLabel = label.replace(/[^\w\u0900-\u097F]+/g, "_") || "documents";
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeLabel}_documents.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function render() {
    const container = document.getElementById("enclosureDocsSection");
    if (!container || container.dataset.saathiRendered) return;
    container.dataset.saathiRendered = "1";
    injectStyleOnce();

    const groupsHtml = GROUPS.map((g) =>
      `<optgroup label="${g.title}">` +
      g.items.map((t) => `<option value="${t.key}">${t.label}</option>`).join("") +
      `</optgroup>`
    ).join("");

    container.innerHTML = `
      <h3>📎 Documents <span id="saathiDocCountBadge"></span></h3>
      <div class="saathi-doc-body">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div id="saathiDocProfileLine" class="saathi-doc-profile" style="flex:1;margin-bottom:0;"></div>
          <button type="button" id="saathiNewCustomerBtn" class="btn" style="height:26px;padding:0 10px;font-size:9.5px;white-space:nowrap;">☄ New User</button>
        </div>
        <div id="saathiStorageLine" class="saathi-doc-hint" style="margin-bottom:8px;"></div>
        <div id="saathiDocError" class="saathi-doc-error" style="display:none;"></div>

        <div class="saathi-doc-picker">
          <div class="saathi-doc-picker-label">Document Type</div>
          <div class="saathi-doc-row">
            <select id="saathiDocTypeSelect">
              <option value="">Please Select </option>
              ${groupsHtml}
            </select>
          </div>
          <div class="saathi-doc-row">
            <div id="saathiDropZone" class="saathi-dropzone">
              <div class="saathi-doc-filewrap">
                <input type="file" id="saathiDocFileInput" accept="application/pdf,.pdf" disabled>
              </div>
              <div class="saathi-dropzone-hint"></div>
            </div>
          </div>
        </div>

        <div class="saathi-doc-uploaded-title">
          <span style="flex:1;">🗽⃢⃢🗿 Uploaded Documents</span>
          <button type="button" id="saathiChecklistToggle" class="saathi-doc-clearall">🔸 List</button>
          <button type="button" id="saathiZipBtn" class="saathi-doc-clearall">🔸 Zip</button>
          <button type="button" id="saathiClearProfileDocsBtn" class="saathi-doc-clearall danger">🗑 Clear All</button>
        </div>
        <div id="saathiUploadedList"></div>
        <div id="saathiUndoToast"></div>

        <div class="saathi-doc-hint">PDF only, max ${MAX_MB}MB </div>
      </div>
    `;

    const newCustomerBtn = document.getElementById("saathiNewCustomerBtn");
    const clearProfileDocsBtn = document.getElementById("saathiClearProfileDocsBtn");
    const checklistToggleBtn = document.getElementById("saathiChecklistToggle");
    const zipBtn = document.getElementById("saathiZipBtn");
    const typeSelect = document.getElementById("saathiDocTypeSelect");
    const fileInput = document.getElementById("saathiDocFileInput");
    const dropZone = document.getElementById("saathiDropZone");

    clearProfileDocsBtn.addEventListener("click", async () => {
      if (!confirm("ⓘ Delete All Doc")) return;
      await DocStore.clearActiveProfileDocs();
      renderList();
    });

    checklistToggleBtn.addEventListener("click", () => {
      viewMode = viewMode === "uploaded" ? "checklist" : "uploaded";
      checklistToggleBtn.textContent = viewMode === "checklist" ? "🔸 Uploaded" : "🔸 List";
      renderList();
    });

    zipBtn.addEventListener("click", downloadAllAsZip);

    newCustomerBtn.addEventListener("click", async () => {
      if (!confirm("Naya customer shuru karein? Is customer ke liye ab tak jode gaye documents ki list yahan se hat jayegi (documents delete nahi honge, bas naye customer ke liye jagah banegi).")) return;
      await DocStore.startNewProfile();
      typeSelect.value = "";
      fileInput.disabled = true;
      refreshAll();
    });

    // The extension's own "Clear" (reset) button on the form also means
    // "start fresh" — treat it as a new-customer signal too.
    const resetBtn = document.querySelector('#dataForm button[type="reset"]');
    if (resetBtn && !resetBtn.dataset.saathiHooked) {
      resetBtn.dataset.saathiHooked = "1";
      resetBtn.addEventListener("click", async () => {
        await DocStore.startNewProfile();
        setTimeout(refreshAll, 0);
      });
    }

    // The main "+ Create Profile" button is how a new customer's blank
    // form is started — this is the natural, automatic moment to also
    // start a fresh document session, exactly matching how a new profile
    // is normally begun (no separate manual step needed).
    const addNewBtn = document.getElementById("addNewRecord");
    if (addNewBtn && !addNewBtn.dataset.saathiHooked) {
      addNewBtn.dataset.saathiHooked = "1";
      addNewBtn.addEventListener("click", async () => {
        await DocStore.startNewProfile();
        setTimeout(refreshAll, 0);
      });
    }

    typeSelect.addEventListener("change", () => {
      fileInput.disabled = !typeSelect.value;
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      const docType = typeSelect.value;
      fileInput.value = "";
      if (!file || !docType || typeof DocStore === "undefined") return;
      const ok = await handleUpload(docType, file);
      if (ok) {
        typeSelect.value = "";
        fileInput.disabled = true;
        renderList();
      }
    });

    ["dragenter", "dragover"].forEach((evt) => {
      dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add("dragging"); });
    });
    ["dragleave", "drop"].forEach((evt) => {
      dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove("dragging"); });
    });
    dropZone.addEventListener("drop", async (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!typeSelect.value) { showError("Pehle document type chunein, phir file drop karein."); return; }
      const ok = await handleUpload(typeSelect.value, file);
      if (ok) {
        typeSelect.value = "";
        fileInput.disabled = true;
        renderList();
      }
    });

    // As soon as Naam/Mobile are (re)typed, keep the friendly label
    // above in sync, AND — the important part — once a full 10-digit
    // mobile number is present, make sure the documents uploaded so
    // far actually belong to THIS customer (ties a brand-new profile's
    // docs to it, and does nothing if they already do).
    const nameEl = document.getElementById("name");
    const mobileEl = document.getElementById("mobile");
    let onMobileChange = null;
    if (nameEl) {
      nameEl.addEventListener("input", refreshProfileLine);
      // Number shared by several people: the documents can only be attached to
      // the right person once the name is known, so re-check when it is typed.
      let nameTimer = null;
      nameEl.addEventListener("input", () => { clearTimeout(nameTimer); nameTimer = setTimeout(() => onMobileChange && onMobileChange(), 600); });
    }
    if (mobileEl) {
      onMobileChange = async () => {
        if (typeof DocStore === "undefined") return;
        const digits = mobileEl.value.replace(/\D/g, "");
        if (digits.length === 10) {
          await DocStore.migrateActiveSessionTo(digits);
          refreshAll();
        } else {
          refreshProfileLine();
        }
      };
      mobileEl.addEventListener("input", onMobileChange);
      mobileEl.addEventListener("change", onMobileChange);
    }

    refreshAll();
  }

  function refreshAll() {
    refreshProfileLine();
    refreshStorageLine();
    renderList();
  }

  // Exposed so docProfileLink.js can refresh this panel the moment the
  // active profile changes (e.g. Load/Update clicked on a different
  // saved profile on the Profile tab).
  window.SaathiEnclosureDocsPanel = { refresh: refreshAll };

  document.addEventListener("DOMContentLoaded", render);
  if (document.readyState !== "loading") render();
})();
