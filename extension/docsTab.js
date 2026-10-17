/**
 * docsTab.js  (v2 — advanced OCR upload)
 * ------------------------------------------------------------
 * Wires up the "Documents" tab in popup.html. Additive only —
 * does not modify or depend on the internals of the obfuscated
 * popup.js / content.js. It only reads values out of extracted
 * text and writes them into the existing #dataForm fields by ID,
 * exactly like loading a saved profile does.
 *
 * v2 upgrades:
 *   - Up to 10 PDFs / images in one go (duplicates + oversize files
 *     are rejected with a clear message).
 *   - Files are processed in PARALLEL (size of the OCR worker pool),
 *     each with its own progress bar; Cancel and per-file Retry.
 *   - Password-protected PDFs (e-Aadhaar) ask for the password.
 *   - If a PDF's text layer gives nothing useful, it is re-read with
 *     real OCR automatically.
 *   - Re-running Extract only processes new / failed / rotated files.
 *   - Fixed: #district (and other dropdowns) never actually received
 *     the OCR value, because their option values are numeric codes —
 *     selects are now matched by option TEXT as well.
 * ------------------------------------------------------------
 */

(function () {

  const MAX_FILES = 10;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;

  const FIELD_LABELS = {
    name: "नाम / Name", fathername: "पिता का नाम", mothername: "माता का नाम",
    husbandname: "पति का नाम", gender: "लिंग", mobile: "मोबाइल",
    email: "ईमेल", pin: "पिन कोड", district: "जिला",
    village: "गाँव / Village", postoffice: "डाकघर / Post Office", policeStation: "थाना / Police Station",
    wardNo: "वार्ड नं.",
    profession: "पेशा", casteprofession: "पेशा (जाति)",
    castecategory: "वर्ग / Category", caste: "जाति / Caste",
    totalincome: "कुल आय",
    info_dob: "जन्म तिथि (सिर्फ जानकारी)",
    info_aadhaar: "आधार नं. (सिर्फ जानकारी)",
    info_epic: "EPIC नं. (सिर्फ जानकारी)",
  };

  const RADIO_FIELDS = new Set(["gender"]); // fields that live on <input type=radio name=...>

  let queuedFiles = [];      // [{ file, status, docType, result, resultFile, progress, thumbUrl }]
  window.__saathiQueuedFilesRef = queuedFiles; // exposed read/write for premiumFeatures3.js's rotate button
  let perDocResults = [];    // [{ fields, docType, fileName, confidence, rawText, method }]
  let mergedData = {};       // final merged field -> value
  let mergedSources = {};    // field -> doc index (into perDocResults)
  let mergedAlternates = {}; // field -> [{value, docIdx}] when documents disagreed
  let abortController = null;
  let isProcessing = false;

  function $(id) { return document.getElementById(id); }

  function showToast(message, kind = "info") { return window.saathiToast(message, kind); }

  const DOC_TYPE_OPTIONS = [
    { value: "aadhaar", label: "आधार कार्ड" },
    { value: "voter_id", label: "मतदाता पहचान पत्र" },
    { value: "ration_card", label: "राशन कार्ड" },
    { value: "caste_certificate", label: "जाति प्रमाण पत्र" },
    { value: "income_certificate", label: "आय प्रमाण पत्र" },
    { value: "residence_certificate", label: "निवास प्रमाण पत्र" },
    { value: "unknown", label: "अन्य / पता नहीं" },
  ];

  function docTypeSelectHtml(idx, currentType) {
    const opts = DOC_TYPE_OPTIONS.map(o =>
      `<option value="${o.value}"${o.value === currentType ? " selected" : ""}>${o.label}</option>`
    ).join("");
    return `<select class="doc-type-select" data-idx="${idx}" title="Galat pehchana gaya ho to yahan sahi type chunein">${opts}</select>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function isPdf(file) { return file.type === "application/pdf" || /\.pdf$/i.test(file.name); }
  function isImage(file) { return /^image\//.test(file.type) || /\.(jpe?g|png|webp|bmp|gif|tiff?)$/i.test(file.name); }
  function fileKey(f) { return [f.name, f.size, f.lastModified].join("|"); }

  function prettySize(bytes) {
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  // ------------------------------------------------------------
  // Extra controls (Cancel button + overall progress) — created in JS
  // so popup.html only needs the existing markup.
  // ------------------------------------------------------------
  function ensureExtraControls() {
    const actions = $("extractBtn") && $("extractBtn").parentElement;
    if (actions && !$("cancelOcrBtn")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "cancelOcrBtn";
      btn.className = "btn";
      btn.textContent = "⏹ Cancel";
      btn.style.display = "none";
      btn.addEventListener("click", () => { if (abortController) abortController.abort(); });
      actions.insertBefore(btn, $("clearDocsBtn"));
    }
    const list = $("docFileList");
    if (list && !$("docSummaryBar")) {
      const bar = document.createElement("div");
      bar.id = "docSummaryBar";
      bar.className = "doc-summary-bar";
      list.parentElement.insertBefore(bar, list);
    }
  }

  function updateSummaryBar() {
    const bar = $("docSummaryBar");
    if (!bar) return;
    const total = queuedFiles.length;
    if (!total) { bar.innerHTML = ""; return; }
    const done = queuedFiles.filter(e => e.result && e.resultFile === e.file).length;
    const failed = queuedFiles.filter(e => e.failed).length;
    const avg = total ? Math.round(queuedFiles.reduce((s, e) => s + (e.progress || (e.result && e.resultFile === e.file ? 100 : 0)), 0) / total) : 0;
    bar.innerHTML = `
      <span>📁 ${total}/${MAX_FILES} files · ✓ ${done} ho gaye${failed ? ` · ✗ ${failed} fail` : ""}</span>
      ${isProcessing ? `<div class="doc-progress"><div class="doc-progress-fill" style="width:${avg}%"></div></div>` : ""}`;
  }

  function setProgress(idx, pct) {
    const e = queuedFiles[idx];
    if (!e) return;
    e.progress = pct;
    const fill = document.querySelector(`.doc-progress-fill[data-idx="${idx}"]`);
    if (fill) fill.style.width = pct + "%";
    updateSummaryBar();
  }

  function renderFileList() {
    const list = $("docFileList");
    if (!list) return;
    list.innerHTML = "";
    updateSummaryBar();
    if (queuedFiles.length === 0) {
      list.innerHTML = `
       `;
      return;
    }
    queuedFiles.forEach((entry, idx) => {
      const row = document.createElement("div");
      row.className = "doc-file-row";
      const processing = /chal raha hai/i.test(entry.status);
      const thumb = entry.thumbUrl
        ? `<img class="doc-thumb" src="${entry.thumbUrl}" alt="">`
        : `<span class="doc-thumb doc-thumb-pdf">${isPdf(entry.file) ? "PDF" : "IMG"}</span>`;
      row.innerHTML = `
        ${thumb}
        <span class="doc-file-name" title="${escapeHtml(entry.file.name)} (${prettySize(entry.file.size)})">${idx + 1}. ${escapeHtml(entry.file.name)}</span>
        <span class="doc-file-status${processing ? " saathi-status-busy" : ""}" data-idx="${idx}">${processing ? '<span class="saathi-mini-spinner"></span>' : ""}${escapeHtml(entry.status)}</span>
        ${entry.docType ? docTypeSelectHtml(idx, entry.docType) : ""}
        ${entry.failed && !isProcessing ? `<button type="button" class="doc-file-retry" data-idx="${idx}" title="Dobara try karein">↻</button>` : ""}
        <button type="button" class="doc-file-remove" data-idx="${idx}" title="Remove">✕</button>
        ${processing || isProcessing ? `<div class="doc-progress doc-progress-row"><div class="doc-progress-fill" data-idx="${idx}" style="width:${entry.progress || 0}%"></div></div>` : ""}
      `;
      list.appendChild(row);
    });
    list.querySelectorAll(".doc-file-remove").forEach(btn => {
      btn.addEventListener("click", () => removeFile(Number(btn.dataset.idx)));
    });
    list.querySelectorAll(".doc-file-retry").forEach(btn => {
      btn.addEventListener("click", () => processAllFiles([Number(btn.dataset.idx)]));
    });
    // Lets the customer correct the document type by hand if OCR
    // guessed wrong — re-saves it under the corrected key so the
    // "Attach Enclosure(s)" auto-fill picks the right file later.
    list.querySelectorAll(".doc-type-select").forEach(sel => {
      sel.addEventListener("change", async () => {
        const idx = Number(sel.dataset.idx);
        const entry = queuedFiles[idx];
        if (!entry) return;
        const oldType = entry.docType;
        const newType = sel.value;
        entry.docType = newType;
        if (entry.result) entry.result.docType = newType;
        if (typeof DocStore !== "undefined" && isPdf(entry.file)) {
          try {
            if (newType !== "unknown") await DocStore.saveDoc(newType, entry.file);
            if (oldType && oldType !== newType && oldType !== "unknown") await DocStore.removeDoc(oldType);
            showToast("Document type update ho gaya.", "ok");
          } catch (err) {
            console.warn("DocStore update skipped:", err);
          }
        }
        // Document type decides which file is trusted for each field — re-merge.
        if (queuedFiles.some(e => e.result)) { remerge(); renderReviewTable(); }
      });
    });
  }

  function removeFile(idx) {
    const entry = queuedFiles[idx];
    if (entry && entry.thumbUrl) URL.revokeObjectURL(entry.thumbUrl);
    queuedFiles.splice(idx, 1);
    if (queuedFiles.some(e => e.result)) remerge();
    renderFileList();
    if (queuedFiles.some(e => e.result)) renderReviewTable();
    else if ($("docReviewContainer")) $("docReviewContainer").innerHTML = "";
  }

  function setStatus(idx, text) {
    const entry = queuedFiles[idx];
    if (!entry) return;
    entry.status = text;
    const el = document.querySelector(`.doc-file-status[data-idx="${idx}"]`);
    if (el) {
      const processing = /chal raha hai/i.test(text);
      el.classList.toggle("saathi-status-busy", processing);
      el.innerHTML = `${processing ? '<span class="saathi-mini-spinner"></span>' : ""}${escapeHtml(text)}`;
    }
  }

  // ------------------------------------------------------------
  // Adding files (input / drop / camera) with the 10-file limit
  // ------------------------------------------------------------
  function addFiles(newFiles) {
    if (isProcessing) { showToast("Processing chal rahi hai — khatam hone ka intezaar karein.", "warn"); return; }
    let rejectedLimit = 0, rejectedType = 0, rejectedSize = 0, duplicates = 0;
    const seen = new Set(queuedFiles.map(e => fileKey(e.file)));

    newFiles.forEach(file => {
      if (!isPdf(file) && !isImage(file)) { rejectedType++; return; }
      if (file.size > MAX_FILE_BYTES) { rejectedSize++; return; }
      if (seen.has(fileKey(file))) { duplicates++; return; }
      if (queuedFiles.length >= MAX_FILES) { rejectedLimit++; return; }
      seen.add(fileKey(file));
      queuedFiles.push({
        file, status: "Queued", progress: 0,
        thumbUrl: isImage(file) ? URL.createObjectURL(file) : null,
      });
    });

    const notes = [];
    if (rejectedLimit) notes.push(`${rejectedLimit} file chhoot gayi (max ${MAX_FILES})`);
    if (rejectedType) notes.push(`${rejectedType} file PDF/image nahi thi`);
    if (rejectedSize) notes.push(`${rejectedSize} file ${prettySize(MAX_FILE_BYTES)} se badi thi`);
    if (duplicates) notes.push(`${duplicates} duplicate hata di`);
    if (notes.length) showToast(notes.join(" · "), "warn");

    renderFileList();
    // Start loading the OCR models now so "Extract" feels instant later.
    if (queuedFiles.length && OcrEngine.warmUp) OcrEngine.warmUp();
  }

  // ------------------------------------------------------------
  // Processing
  // ------------------------------------------------------------
  function askPdfPassword(file, wasWrong) {
    const msg = (wasWrong ? "❌ Galat password.\n\n" : "") +
      `"${file.name}" password-protected hai.\n\n` +
      "e-Aadhaar ka password: naam ke pehle 4 akshar (CAPITAL) + janm ka saal (YYYY)\n" +
      "Jaise RAHUL KUMAR, 1995 → RAHU1995\n\n" +
      "Password daalein (skip karne ke liye Cancel dabayein):";
    return window.prompt(msg, "");
  }

  function methodLabel(m) {
    return m === "pdf-text" ? "PDF text" : m === "mixed" ? "PDF text+OCR" : "OCR";
  }

  /** Run OCR + parsing for one queued file. Never throws — records the outcome on the entry. */
  async function processOne(i, signal) {
    const entry = queuedFiles[i];
    const file = entry.file;
    entry.failed = false;
    setProgress(i, 2);
    setStatus(i, "OCR chal raha hai…");

    const run = (forceOcr) => OcrEngine.extractTextFromFile(file, (s) => setStatus(i, s), {
      signal,
      forceOcr,
      askPassword: askPdfPassword,
      onProgress: (p) => setProgress(i, p.pct),
    });

    try {
      let ocr = await run(false);
      let parsed = DocumentParser.extractFields(ocr.text);

      // A PDF text layer can exist yet be useless (legacy Hindi fonts like
      // Kruti Dev produce Latin gibberish). Nothing recognised -> try real OCR.
      if (isPdf(file) && ocr.method === "pdf-text" && parsed.filled === 0 && parsed.docType === "unknown") {
        setStatus(i, "Text layer kaam ka nahi — OCR chal raha hai…");
        const forced = await run(true);
        const parsed2 = DocumentParser.extractFields(forced.text);
        if (parsed2.filled > parsed.filled || parsed2.docType !== "unknown") { ocr = forced; parsed = parsed2; }
      }

      const result = parsed;
      result.fileName = file.name;
      result.rawText = ocr.text;
      result.rawFull = ocr.raw || ocr.text;   // everything the engine read, before junk filtering
      result.confidence = ocr.confidence;
      result.method = ocr.method;
      result.warnings = ocr.warnings || [];

      entry.result = result;
      entry.resultFile = file;
      entry.docType = result.docType && result.docType !== "unknown" ? result.docType : "unknown";
      entry.failed = false;
      setProgress(i, 100);

      const confLabel = typeof ocr.confidence === "number" && ocr.method !== "pdf-text" ? ` · ${Math.round(ocr.confidence)}% sure` : "";
      const secs = ocr.ms ? ` · ${(ocr.ms / 1000).toFixed(1)}s` : "";
      const lowConf = ocr.method !== "pdf-text" && typeof ocr.confidence === "number" && ocr.confidence < 60 ? " · ⚠️ image saaf nahi hai" : "";
      let line = `✓ Done (${result.docType})${confLabel} · ${methodLabel(ocr.method)}${secs}${lowConf}`;
      if (result.warnings.length) line += ` · ℹ️ ${result.warnings[0]}`;

      // Additive: also keep the actual scanned file (not just its text)
      // so "Attach Enclosure(s)" auto-fill on the government page can
      // re-use it later. Never blocks the OCR flow if this fails.
      //
      // IMPORTANT: only PDF files are saved here — the government page's
      // "Attach Enclosure(s)" inputs only accept PDF. Images still get
      // OCR'd for text, they just aren't fed into the enclosure store.
      if (typeof DocStore !== "undefined" && result.docType && result.docType !== "unknown") {
        if (isPdf(file)) {
          DocStore.saveDoc(result.docType, file).catch((err) => { console.warn("DocStore save skipped:", err); });
        } else {
          line += " · ⚠️ PDF nahi hai, page-attach ke liye Documents section me PDF upload karein";
        }
      }
      setStatus(i, line);
    } catch (err) {
      entry.failed = true;
      entry.result = null;
      entry.resultFile = null;
      setProgress(i, 0);
      if (err && err.code === "ABORTED") {
        entry.failed = false;
        setStatus(i, "⏹ Cancel hua");
      } else {
        console.error("OCR failed for", file.name, err);
        const reason = err && err.name === "OcrError" ? err.message : "Error — skip ho gaya";
        setStatus(i, "✗ " + reason);
      }
    }
  }

  /** Rebuild perDocResults + merged data from every entry that has a fresh result. */
  function remerge() {
    perDocResults = [];
    queuedFiles.forEach((e) => {
      if (e.result && e.resultFile === e.file) perDocResults.push(e.result);
    });
    const { merged, sources, alternates } = DocumentParser.mergeExtractions(perDocResults);
    mergedData = merged;
    mergedSources = sources;
    mergedAlternates = alternates || {};
    window.__saathiLastDocTypes = [...new Set(perDocResults.map(r => r.docType).filter(t => t && t !== "unknown"))];
  }

  async function processAllFiles(onlyIndices) {
    if (isProcessing) return;
    if (queuedFiles.length === 0) {
      showToast("Pehle kam se kam ek document upload karo.", "warn");
      return;
    }

    // Only new / failed / rotated files need work; finished ones are reused.
    const todo = (Array.isArray(onlyIndices) ? onlyIndices : queuedFiles.map((_, i) => i))
      .filter(i => queuedFiles[i] && !(queuedFiles[i].result && queuedFiles[i].resultFile === queuedFiles[i].file));

    if (todo.length === 0) {
      remerge();
      renderReviewTable();
      showToast("Sab files pehle se process ho chuki hain.", "info");
      return;
    }

    isProcessing = true;
    abortController = new AbortController();
    const signal = abortController.signal;
    const extractBtn = $("extractBtn"), cancelBtn = $("cancelOcrBtn");
    extractBtn.disabled = true;
    extractBtn.innerHTML = '<span class="saathi-mini-spinner saathi-mini-spinner-light"></span> Processing…';
    if (cancelBtn) cancelBtn.style.display = "";
    todo.forEach(i => { queuedFiles[i].progress = 0; queuedFiles[i].status = "Queued"; queuedFiles[i].failed = false; });
    renderFileList();

    // Several files at once, but never more than the OCR worker pool
    // can actually run (keeps memory use sane on 10 big PDFs).
    const limit = Math.max(1, OcrEngine.getPoolSize ? OcrEngine.getPoolSize() : 1);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, todo.length) }, async () => {
      while (cursor < todo.length && !signal.aborted) {
        const i = todo[cursor++];
        await processOne(i, signal);
      }
    });
    await Promise.all(runners);

    // Anything never started because of Cancel
    todo.forEach(i => { if (queuedFiles[i] && queuedFiles[i].status === "Queued") setStatus(i, "⏹ Cancel hua"); });

    isProcessing = false;
    abortController = null;
    remerge();
    renderFileList();
    renderReviewTable();
    extractBtn.disabled = false;
    extractBtn.textContent = "Extract & Fill";
    if (cancelBtn) cancelBtn.style.display = "none";

    const n = Object.keys(mergedData).filter(k => !k.startsWith("info_")).length;
    const failed = queuedFiles.filter(e => e.failed).length;
    showToast(
      (n ? `${n} fields mil gayi — review kar lo.` : "Koi field detect nahi hui.") + (failed ? ` (${failed} file fail hui — ↻ se dobara try karein)` : ""),
      n ? "success" : "warn"
    );
  }

  function renderReviewTable() {
    const container = $("docReviewContainer");
    if (!container) return;

    const keys = Object.keys(mergedData);
    if (keys.length === 0) {
      container.innerHTML = `<div id="noSaved" class="saathi-empty-state">
        <span class="saathi-empty-icon">🔍</span>
        <span class="saathi-empty-title">Koi field detect nahi hui</span>
        <span class="saathi-empty-sub">Documents clearer ya alag try karo, ya neeche form mein manually bhar do</span>
      </div>`;
      return;
    }

    // Form fields first, info-only rows last.
    keys.sort((a, b) => (a.startsWith("info_") ? 1 : 0) - (b.startsWith("info_") ? 1 : 0));

    let rows = keys.map(key => {
      const label = FIELD_LABELS[key] || key;
      const value = mergedData[key];
      const srcIdx = mergedSources[key];
      const srcName = perDocResults[srcIdx] ? perDocResults[srcIdx].fileName : "?";
      const alts = mergedAlternates[key];
      const infoOnly = key.startsWith("info_");

      let valueCell;
      if (alts && alts.length > 1) {
        // Documents disagreed on this field — let the user pick instead of silently guessing.
        const options = alts.map(a => {
          const docName = perDocResults[a.docIdx] ? perDocResults[a.docIdx].fileName : "?";
          const sel = a.value === value ? "selected" : "";
          return `<option value="${escapeHtml(a.value)}" ${sel}>${escapeHtml(a.value)} (${escapeHtml(docName)})</option>`;
        }).join("");
        valueCell = `<select class="doc-review-input doc-review-conflict" data-field="${key}">${options}</select>`;
      } else {
        valueCell = `<input type="text" class="doc-review-input" data-field="${key}" value="${escapeHtml(value)}">`;
      }

      return `
        <tr${alts && alts.length > 1 ? ' class="doc-review-conflict-row"' : ""}${infoOnly ? ' class="doc-review-info-row"' : ""}>
          <td>${escapeHtml(label)}${alts && alts.length > 1 ? ' <span title="Documents disagree" class="doc-conflict-flag">⚠️</span>' : ""}</td>
          <td>${valueCell}</td>
          <td class="doc-review-source">${escapeHtml(srcName)}</td>
        </tr>`;
    }).join("");

    const docSummary = perDocResults.map(r => {
      const typeLabel = (DOC_TYPE_OPTIONS.find(o => o.value === r.docType) || {}).label || r.docType;
      const conf = r.method === "pdf-text" ? "text layer" : typeof r.confidence === "number" ? Math.round(r.confidence) + "%" : "—";
      return `<li>${escapeHtml(r.fileName)} — ${escapeHtml(typeLabel)} · ${conf}</li>`;
    }).join("");

    container.innerHTML = `
      <ul class="doc-summary-list">${docSummary}</ul>
      <table class="doc-review-table">
        <thead><tr><th>Field</th><th>Value (edit if galat ho)</th><th>Source</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="doc-rawtext-list">
        ${perDocResults.map((r) => `
          <details class="doc-rawtext-item">
            <summary>📝 ${escapeHtml(r.fileName)} — raw text dekho${typeof r.confidence === "number" ? ` (${Math.round(r.confidence)}% confidence)` : ""}</summary>
            <pre>${escapeHtml(r.rawText || "(khaali)")}</pre>
            ${r.rawFull && r.rawFull !== r.rawText ? `<div class="doc-review-source">Filter se pehle ka poora padha hua text:</div><pre>${escapeHtml(r.rawFull)}</pre>` : ""}
          </details>
        `).join("")}
      </div>
      <div class="form-actions" style="margin-top:10px;">
        <button type="button" id="applyToFormBtn" class="btn btn-primary">Apply to Form</button>
      </div>
    `;

    $("applyToFormBtn").addEventListener("click", applyReviewedDataToForm);
  }

  // ------------------------------------------------------------
  // Writing values into the form
  // ------------------------------------------------------------
  function fireChange(el) {
    // 'change' makes any cascading dropdown logic already in popup.js
    // (district -> anumandal -> prakhand, caste -> subcaste, etc.) run.
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /**
   * Set a field. For <select> we match by option value first, then by
   * option TEXT (e.g. "PATNA/पटना" for "Patna") because many dropdowns
   * here use numeric codes as values.
   * @returns {boolean} whether the value was applied
   */
  // popup.js's own change-handlers do not fire for script-dispatched events,
  // so the dependent dropdowns (State -> District -> Police Station) are
  // filled by calling its exposed update functions directly.
  function callPopupFn(name) {
    try { if (typeof window[name] === "function") window[name](); } catch (e) { console.warn(name + " skipped:", e); }
  }

  function prepareCascade(el) {
    if (el.id === "district" && el.options.length <= 1) {
      const st = $("state");
      if (st && !st.value && st.querySelector('option[value="10"]')) st.value = "10"; // BIHAR
      callPopupFn("updateDistricts");
    }
  }

  function afterCascade(el) {
    if (el.id === "district") { callPopupFn("updateAnumandals"); callPopupFn("updatePoliceStations"); }
    else if (el.id === "anumandal") callPopupFn("updatePrakhands");
  }

  function setFieldValue(el, value) {
    if (el.tagName === "SELECT") {
      prepareCascade(el);
      const want = String(value).trim().toLowerCase();
      let match = Array.from(el.options).find(o => o.value === String(value));
      if (!match && want) {
        match = Array.from(el.options).find(o => o.value && o.text.trim().toLowerCase() === want) ||
                Array.from(el.options).find(o => o.value && o.text.toLowerCase().split("/").some(part => part.trim() === want)) ||
                Array.from(el.options).find(o => o.value && o.text.toLowerCase().includes(want));
      }
      if (!match) return false;
      el.value = match.value;
      fireChange(el);
      afterCascade(el);
      return true;
    }
    el.value = value;
    fireChange(el);
    return true;
  }

  function applyReviewedDataToForm() {
    // Pull current (possibly hand-edited) values out of the review table.
    const NAME_FIELDS = new Set(["name", "fathername", "mothername", "husbandname"]);
    document.querySelectorAll(".doc-review-input").forEach(input => {
      const before = mergedData[input.dataset.field];
      mergedData[input.dataset.field] = input.value;
      // A name the operator corrected is remembered, so the same OCR slip is fixed next time.
      if (window.OcrLexicon && NAME_FIELDS.has(input.dataset.field) && before && input.value && before !== input.value) OcrLexicon.learnName(before, input.value, "ocr");
    });

    const retryLater = [];

    Object.entries(mergedData).forEach(([field, value]) => {
      if (!value || field.startsWith("info_")) return; // info-only rows never touch the form

      if (RADIO_FIELDS.has(field)) {
        const radio = document.querySelector(`input[name="${field}"][value="${value}"]`);
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      const el = $(field);
      if (!el) return; // field not present in this form build — skip safely
      if (!setFieldValue(el, value) && el.tagName === "SELECT") retryLater.push([field, value]);
    });

    // NCL form: the date of birth / Aadhaar read from the documents are shown as "info only" rows above
    // (they have no field in the normal form), but the NCL section HAS fields for them. Fill those -
    // only when empty (never overwrite what was typed) and only with values that look trustworthy.
    const nclFilled = [];
    const dobEl = $("f_ncl_dob"), aadEl = $("f_ncl_aadhaar");
    const fillIfEmpty = (el, v, label) => {
      if (!el || el.value.trim() || !v) return;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      nclFilled.push(label);
    };
    const dobVal = String(mergedData.info_dob || "").trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dobVal)) fillIfEmpty(dobEl, dobVal, "जन्म तिथि");       // a bare year is not enough
    const aadRaw = String(mergedData.info_aadhaar || "");
    if (!/\(\?\)/.test(aadRaw)) {                                                                // "(?)" = checksum failed -> do not auto-fill
      const aad = aadRaw.replace(/\D/g, "");
      if (aad.length === 12) fillIfEmpty(aadEl, aad, "आधार");
    }

    // Dropdowns that depend on another one (e.g. Police Station after
    // District) only fill their options a moment after the parent changes.
    if (retryLater.length) {
      [500, 1200, 2500].forEach((delay) => {
        setTimeout(() => {
          for (let k = retryLater.length - 1; k >= 0; k--) {
            const el = $(retryLater[k][0]);
            if (el && setFieldValue(el, retryLater[k][1])) retryLater.splice(k, 1);
          }
        }, delay);
      });
    }

    // Jump the user to the Form tab so they can review everything in
    // context before hitting the extension's own "Save Data" button.
    const formTabBtn = $("tab-form");
    if (formTabBtn) formTabBtn.click();

    showToast("Form mein bhar diya gaya" + (nclFilled.length ? " (NCL: " + nclFilled.join(", ") + " bhi)" : "") + " — ek baar check karke Save Data dabao.", "success");
  }

  function handleFileInputChange(e) {
    addFiles(Array.from(e.target.files || []));
    e.target.value = ""; // allow re-selecting the same file later
  }

  function handleDrop(e) {
    e.preventDefault();
    $("docDropZone").classList.remove("doc-dropzone-active");
    addFiles(Array.from(e.dataTransfer.files || []));
  }

  function clearQueue() {
    if (abortController) abortController.abort();
    queuedFiles.forEach(e => { if (e.thumbUrl) URL.revokeObjectURL(e.thumbUrl); });
    queuedFiles.length = 0; // mutate in place so window.__saathiQueuedFilesRef stays valid
    perDocResults = [];
    mergedData = {};
    mergedSources = {};
    mergedAlternates = {};
    renderFileList();
    const container = $("docReviewContainer");
    if (container) container.innerHTML = "";
  }

  function wireTabSwitching() {
    const tabDocs = $("tab-docs");
    const tabForm = $("tab-form");
    const tabSaved = $("tab-saved");
    const contentDocs = $("content-docs");

    if (!tabDocs || !contentDocs) return;

    function showDocsTab() {
      contentDocs.style.display = "block";
      $("content-form").style.display = "none";
      $("content-saved").style.display = "none";
      [tabForm, tabSaved, tabDocs].forEach(b => b && b.classList.remove("active"));
      tabDocs.classList.add("active");
    }

    tabDocs.addEventListener("click", showDocsTab);

    // Additive listeners: when the user goes back to Form/Profile,
    // make sure our Documents panel hides itself. popup.js's own
    // showTab() doesn't know this panel exists, so we handle it here.
    if (tabForm) tabForm.addEventListener("click", () => { contentDocs.style.display = "none"; tabDocs.classList.remove("active"); });
    if (tabSaved) tabSaved.addEventListener("click", () => { contentDocs.style.display = "none"; tabDocs.classList.remove("active"); });
  }

  // ------------------------------------------------------------
  // Theme toggle — pre-existing gap in the original extension.
  // The button + all the .dark-theme CSS variables already existed
  // in popup.html, but nothing ever wired the click to toggle the
  // class. Fixed here (additive, doesn't touch popup.js/content.js).
  // ------------------------------------------------------------
  function initTheme() {
    const btn = $("themeToggleBtn");
    if (!btn) return;

    chrome.storage.local.get(["digitalSaathiTheme"], (res) => {
      if (res && res.digitalSaathiTheme === "dark") {
        document.body.classList.add("dark-theme");
      }
    });

    btn.addEventListener("click", () => {
      document.body.classList.toggle("dark-theme");
      const isDark = document.body.classList.contains("dark-theme");
      chrome.storage.local.set({ digitalSaathiTheme: isDark ? "dark" : "light" });
    });
  }

  function init() {
    initTheme();
    wireTabSwitching();
    const input = $("docUploadInput");
    if (input) input.addEventListener("change", handleFileInputChange);
    const extractBtn = $("extractBtn");
    if (extractBtn) extractBtn.addEventListener("click", () => processAllFiles());
    const clearBtn = $("clearDocsBtn");
    if (clearBtn) clearBtn.addEventListener("click", clearQueue);
    ensureExtraControls();
    renderFileList();

    const customerFormBtn = $("openCustomerFormBtn");
    if (customerFormBtn) {
      customerFormBtn.addEventListener("click", () => {
        chrome.storage.local.get(["saathiCustomerFormLink"], (res) => {
          let link = res.saathiCustomerFormLink;
          if (!link) {
            link = window.prompt("Apna customer-form ka link daalein (jaise Netlify/Google Form link):", "https://");
            if (!link || link === "https://") return;
            chrome.storage.local.set({ saathiCustomerFormLink: link });
          }
          if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: link });
          else window.open(link, "_blank");
        });
      });
      customerFormBtn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const next = window.prompt("Customer form ka link update karein:", "");
        if (next) chrome.storage.local.set({ saathiCustomerFormLink: next });
      });
      customerFormBtn.title = "Click: link kholein. Right-click: link badlein.";
    }

    const dropZone = $("docDropZone");
    if (dropZone) {
      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("doc-dropzone-active");
      });
      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("doc-dropzone-active");
      });
      dropZone.addEventListener("drop", handleDrop);
      dropZone.addEventListener("click", () => input && input.click());
      const zoneLabel = dropZone.querySelector("span");
      if (zoneLabel) zoneLabel.textContent = `📄 Choose Files (max ${MAX_FILES})`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("unload", () => { OcrEngine.terminate(); });
})();
