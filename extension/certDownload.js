/**
 * certDownload.js  (popup — "Certificates" tab)
 * ------------------------------------------------------------
 * 1. Upload up to 10 RTPS receipts (PDF / screenshot / photo).
 * 2. OCR reads each one -> Application Ref. Number, applicant name
 *    (Hindi names are converted to English) and the certificate type.
 *    Every receipt becomes its own card; files where nothing was found
 *    are kept apart so they can be typed in by hand.
 *    (The tab has two sections: "Download" — this file — and
 *    "Status Check" — certStatus.js, which fills #cdPaneStatus.)
 * 3. "Start" opens the portal's Download Certificate page; the content
 *    script (certDownloadFill.js) fills each record, the operator types
 *    the captcha, the PDF downloads and is saved as e.g. IN26-Naam.pdf,
 *    and the next record is filled automatically.
 *
 * The captcha is never read or solved by the extension.
 * ------------------------------------------------------------
 */
(function () {
  const MAX_FILES = 10;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const DEFAULT_URL = "https://swcs.bihar.gov.in/RtpsReportView/certificate_download.jsp";
  const HOST_RE = /^https:\/\/(?:serviceonline|swcs)\.bihar\.gov\.in\//i;
  const HOST_PATTERNS = ["https://serviceonline.bihar.gov.in/*", "https://swcs.bihar.gov.in/*"];
  const REF_OK = /^[A-Z]{3,10}\/20\d{2}\/\d{2,10}$/;
  const TOKENS = ["{PFX}", "{YY}", "{YYYY}", "{NAME}", "{REF}", "{SERIAL}", "{TYPE}"];

  const STATUS = {
    pending: { icon: "⏳", label: "Pending" },
    done: { icon: "✅", label: "Download ho gaya" },
    skipped: { icon: "⏭", label: "Skip" },
    failed: { icon: "❌", label: "Fail" },
  };

  let job = null;                 // mirror of SaathiCertJob state
  let queue = [];                 // [{ file, status }]
  let notFound = [];              // [{ fileName, rawText }]
  let busy = false;
  let abort = null;
  let filter = "all";
  let readProgress = 0;

  const $ = (id) => document.getElementById(id);
  const toast = (m, k) => window.saathiToast && window.saathiToast(m, k || "info");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name);
  const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ====================================================================
  //  Layout
  // ====================================================================

  function build() {
    if (typeof SaathiExtraTabs === "undefined" || $("tab-certs")) return false;

    const box = document.createElement("div");
    box.id = "content-certs";
    box.style.display = "none";
    box.innerHTML = `
    <div class="cd-wrap">
      <div class="cd-seg" role="tablist">
        <button type="button" id="cdSegDownload" class="cd-seg-btn on" role="tab" aria-selected="true">📥 Download</button>
        <button type="button" id="cdSegStatus" class="cd-seg-btn" role="tab" aria-selected="false">🔎 Status Check</button>
      </div>

      <div class="cd-pane" id="cdPaneDownload">
      <div class="cd-hero">
        <div class="cd-hero-icon">📥</div>
        <div>
          <div class="cd-hero-title">Certificate Download</div>
          <div class="cd-hero-sub"></div>
        </div>
      </div>

      <div class="cd-steps" id="cdSteps"></div>

      <details class="cd-card st-fold" id="cdFold1" open>
        <summary class="cd-card-title cd-summary"><span class="cd-num">1</span> Download page ka link</summary>
        <input type="text" id="certUrl" class="cd-input" placeholder="${DEFAULT_URL}">
        <div class="cd-btn-row">
          <button type="button" id="certSaveUrl" class="cd-btn">💾 Save</button>
          <button type="button" id="certUseTab" class="cd-btn">📌 Current tab ka link</button>
          <button type="button" id="certOpen" class="cd-btn cd-btn-blue">🌐 Page kholo</button>
        </div>
      </details>

      <details class="cd-card st-fold" id="cdFold2" open>
        <summary class="cd-card-title cd-summary"><span class="cd-num">2</span> Receipts <small>(max ${MAX_FILES} · PDF / screenshot / photo)</small></summary>
        <div id="certDrop" class="cd-drop"><span class="cd-drop-icon">⬆</span><span class="cd-drop-txt"><b>Files chunein</b> ya drop karein<small>Ek hi baar me ${MAX_FILES} tak</small></span><span class="cd-drop-btn">Chuno</span></div>
        <input type="file" id="certInput" accept="image/*,.pdf" multiple style="display:none;">
        <div id="certQueue" class="cd-queue"></div>
        <div class="cd-progress" id="cdReadBar" style="display:none;"><div class="cd-progress-fill" id="cdReadFill"></div></div>
        <div class="cd-btn-row">
          <button type="button" id="certReadBtn" class="cd-btn cd-btn-gold cd-grow">🔍 Receipts padho</button>
          <button type="button" id="certCancelBtn" class="cd-btn cd-btn-red" style="display:none;">⏹ Cancel</button>
          <button type="button" id="certClearQueue" class="cd-btn">🧹 Files hatao</button>
        </div>
      </details>

      <div id="certNotFound"></div>

      <section class="cd-card" id="cdRecordsCard">
        <div class="cd-card-title"><span class="cd-num">3</span> Check karein <small>(galat ho to sudhaar lein)</small></div>
        <div class="cd-stats" id="cdStats"></div>
        <div class="st-tools">
          <input type="search" id="cdSearch" class="cd-input st-search" placeholder="🔍 Naam ya Ref se khojein" spellcheck="false">
          <button type="button" id="cdCopyAll" class="cd-btn cd-btn-sm" title="Ref + naam ki list copy karein">📋 List copy</button>
        </div>
        <div class="cd-filters" id="cdFilters"></div>
        <div id="certRecords"></div>
      </section>

      <section class="cd-card">
        <details id="cdNaming">
          <summary class="cd-card-title cd-summary"><span class="cd-num">⚙</span> File ka naam kaisa ho? <small id="cdNamePreview"></small></summary>
          <div class="cd-naming">
            <label class="cd-label">Naam ka format <small>(token par click karke jodein)</small></label>
            <input type="text" id="cdTemplate" class="cd-input">
            <div class="cd-tokens" id="cdTokens">${TOKENS.map(t => `<button type="button" class="cd-token" data-t="${t}">${t}</button>`).join("")}</div>
            <label class="cd-label">Folder <small>(Downloads ke andar, khaali = seedha Downloads)</small></label>
            <input type="text" id="cdFolder" class="cd-input">
            <label class="cd-label">Certificate ke code <small>(jaise IN26-Naam me "IN")</small></label>
            <div class="cd-codes" id="cdCodes">${Object.entries(SaathiCertJob.SERVICE_LABELS).map(([k, v]) => `
              <label class="cd-code"><span>${esc(v)}</span><input type="text" maxlength="6" data-k="${k}" class="cd-input cd-code-in"></label>`).join("")}</div>
            <div class="cd-btn-row"><button type="button" id="cdNameReset" class="cd-btn">↺ Default par lao</button></div>
          </div>
        </details>
      </section>

      <section class="cd-card cd-run cd-run-compact" id="cdRun">
        <div class="cd-run-top"><span id="certSummary">—</span></div>
        <div class="cd-progress"><div class="cd-progress-fill" id="cdRunFill"></div></div>
        <div class="cd-run-actions">
          <button type="button" id="certStart" class="cd-btn cd-btn-green cd-grow">▶ Start download</button>
          <button type="button" id="certStop" class="cd-btn cd-btn-red" title="Stop">⏹</button>
          <details class="cd-more">
            <summary class="cd-btn" title="Aur options">⚙</summary>
            <div class="cd-more-pop">
              <label class="cd-switch"><input type="checkbox" id="certAutoSubmit" checked><span>Captcha type hote hi Download</span></label>
              <label class="cd-switch"><input type="checkbox" id="certSound" checked><span>🔔 Awaaz</span></label>
              <div class="cd-more-btns">
                <button type="button" id="certRetry" class="cd-btn cd-btn-sm">🔁 Fail wale dobara</button>
                <button type="button" id="certReset" class="cd-btn cd-btn-sm">↺ Sab pending karo</button>
                <button type="button" id="certCsv" class="cd-btn cd-btn-sm">📊 CSV</button>
                <button type="button" id="certWipe" class="cd-btn cd-btn-sm cd-btn-red">🗑 List saaf</button>
              </div>
            </div>
          </details>
        </div>
      </section>
      </div>

      <div class="cd-pane" id="cdPaneStatus" style="display:none;"></div>
    </div>`;
    return SaathiExtraTabs.add({ id: "tab-certs", label: "Recipt", box, onShow: refresh });
  }

  // ====================================================================
  //  Page link
  // ====================================================================

  const normUrl = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch (e) { return ""; } };

  function getUrl() {
    return new Promise(r => chrome.storage.local.get([SaathiCertJob.URL_KEY], res => r((res && res[SaathiCertJob.URL_KEY]) || DEFAULT_URL)));
  }

  async function saveUrl() {
    const v = $("certUrl").value.trim();
    if (!HOST_RE.test(v)) { toast("Link swcs.bihar.gov.in ya serviceonline.bihar.gov.in ka hona chahiye.", "warn"); return false; }
    await new Promise(r => chrome.storage.local.set({ [SaathiCertJob.URL_KEY]: v }, r));
    toast("Link save ho gaya.", "success");
    return true;
  }

  function useCurrentTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs && tabs[0];
      if (t && t.url && HOST_RE.test(t.url)) { $("certUrl").value = t.url; saveUrl(); }
      else toast("Pehle portal ke Download Certificate page par jaakar ye dabayein.", "warn");
    });
  }

  /** Focus an already-open Download Certificate tab, or open a new one. */
  async function openPage() {
    const url = ($("certUrl").value || "").trim() || await getUrl();
    if (!HOST_RE.test(url)) { toast("Pehle sahi page ka link save karein.", "warn"); return false; }
    const key = normUrl(url);
    const tabs = await new Promise(r => chrome.tabs.query({ url: HOST_PATTERNS }, r));
    const hit = (tabs || []).find(t => normUrl(t.url) === key);
    if (hit) {
      chrome.tabs.update(hit.id, { active: true });
      if (chrome.windows) chrome.windows.update(hit.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url });
    }
    return true;
  }

  // ====================================================================
  //  Upload + OCR
  // ====================================================================

  function addFiles(files) {
    if (busy) return;
    const seen = new Set(queue.map(q => [q.file.name, q.file.size, q.file.lastModified].join("|")));
    let skipped = 0;
    files.forEach(f => {
      const k = [f.name, f.size, f.lastModified].join("|");
      if ((!isPdf(f) && !isImg(f)) || f.size > MAX_FILE_BYTES || seen.has(k) || queue.length >= MAX_FILES) { skipped++; return; }
      seen.add(k);
      queue.push({ file: f, status: "Queued", state: "queued" });
    });
    if (skipped) toast(`${skipped} file chhoot gayi (max ${MAX_FILES}, PDF/image, duplicate nahi).`, "warn");
    renderQueue(); renderSteps();
    if (queue.length && OcrEngine.warmUp) OcrEngine.warmUp();
  }

  function renderQueue() {
    const el = $("certQueue");
    if (!el) return;
    el.innerHTML = queue.map((q, i) => `
      <div class="cd-file cd-file-${q.state}">
        <span class="cd-file-ico">${isPdf(q.file) ? "📕" : "🖼️"}</span>
        <span class="cd-file-name" title="${esc(q.file.name)}">${esc(q.file.name)}</span>
        <span class="cd-file-status">${q.state === "busy" ? '<span class="saathi-mini-spinner"></span>' : ""}${esc(q.status)}</span>
        <button type="button" class="cd-x" data-i="${i}" title="Hatao">✕</button>
      </div>`).join("");
    el.querySelectorAll(".cd-x").forEach(b => b.addEventListener("click", () => {
      if (busy) return;
      queue.splice(Number(b.dataset.i), 1);
      renderQueue(); renderSteps();
    }));
  }

  function askPassword(file, wasWrong) {
    return window.prompt((wasWrong ? "❌ Galat password.\n\n" : "") + `"${file.name}" password-protected hai. Password daalein (skip: Cancel):`, "");
  }

  async function readOne(i, signal) {
    const q = queue[i];
    q.status = "OCR chal raha hai…"; q.state = "busy"; renderQueue();
    const run = (force) => OcrEngine.extractTextFromFile(q.file, (s) => { q.status = s; }, { signal, forceOcr: force, askPassword });
    try {
      let res = await run(false);
      let recs = DocumentParser.extractReceipts(res.pageTexts || res.text);
      if (!recs.length && isPdf(q.file) && res.method === "pdf-text") {
        res = await run(true);
        recs = DocumentParser.extractReceipts(res.pageTexts || res.text);
      }
      if (!recs.length) {
        notFound.push({ fileName: q.file.name, rawText: res.text });
        q.status = "Ref No. nahi mila"; q.state = "warn";
      } else {
        await addRecords(recs, q.file.name);
        const noName = recs.filter(r => !r.name).length;
        const warn = (res.warnings && res.warnings[0]) ? " · ⚠ " + res.warnings[0].split(" — ")[0] : "";
        q.status = `${recs.length} receipt mili` + (noName ? ` · ${noName} ka naam nahi mila` : "") + warn;
        q.state = noName || warn ? "warn" : "ok";
      }
    } catch (err) {
      const aborted = err && err.code === "ABORTED";
      q.status = aborted ? "Cancel hua" : (err && err.name === "OcrError" ? err.message : "Error — skip");
      q.state = aborted ? "queued" : "err";
      if (!aborted) console.error(err);
    }
    renderQueue();
  }

  async function addRecords(recs, fileName) {
    if (window.OcrLexicon) { try { await OcrLexicon.load(); } catch (x) { /* optional */ } }
    await SaathiCertJob.update(j => {
      recs.forEach(r => {
        const ocrRef = r.ref || "";
        if (window.OcrLexicon) { if (r.ref) r.ref = OcrLexicon.fixDigits(r.ref); if (r.mobile) r.mobile = OcrLexicon.fixDigits(r.mobile); OcrLexicon.applyMemory(r); }
        const ex = j.records.find(x => x.ref === r.ref);
        if (ex) {
          if (!ex.name && r.name) { ex.name = r.name; ex.nameSource = r.nameSource; }
          if (!ex.candidates || !ex.candidates.length) ex.candidates = r.candidates || [];
          if (!ex.due && r.due) ex.due = r.due;
          if (!ex.mobile && r.mobile) ex.mobile = r.mobile;
          return;
        }
        j.records.push({
          id: newId(), ref: r.ref, name: r.name || "", hindi: r.hindi || "", nameSource: r.nameSource || "",
          candidates: r.candidates || [], type: r.serviceKey || "other", serviceText: r.serviceText || "",
          due: r.due || "", mobile: r.mobile || "",
          ocrSrc: r.nameSource || "", ocrKey: ocrRef, mem: r.fromMemory || null,
          ocr: { ref: ocrRef, name: r.name || "", mobile: r.mobile || "" }, ocr0: { ref: ocrRef, name: r.name || "", mobile: r.mobile || "" },
          file: fileName, status: "pending",
        });
      });
    });
  }

  async function readAll() {
    if (busy) return;
    if (!queue.length) { toast("Pehle receipts upload karein.", "warn"); return; }
    busy = true;
    abort = new AbortController();
    $("certReadBtn").disabled = true;
    $("certCancelBtn").style.display = "";
    $("cdReadBar").style.display = "";
    notFound = [];
    queue.forEach(q => { q.status = "Queued"; q.state = "queued"; });
    const todo = queue.map((_, i) => i);
    let finished = 0;
    const setBar = () => { $("cdReadFill").style.width = Math.round(finished / todo.length * 100) + "%"; };
    setBar();
    const limit = Math.max(1, OcrEngine.getPoolSize ? OcrEngine.getPoolSize() : 1);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(limit, todo.length) }, async () => {
      while (cursor < todo.length && !abort.signal.aborted) { await readOne(todo[cursor++], abort.signal); finished++; setBar(); }
    }));
    busy = false;
    abort = null;
    $("certReadBtn").disabled = false;
    $("certCancelBtn").style.display = "none";
    setTimeout(() => { $("cdReadBar").style.display = "none"; }, 600);
    await refresh();
    const n = (await SaathiCertJob.get()).records.filter(r => r.status === "pending").length;
    toast(n ? `${n} receipt tayyar — check karke Start dabayein.` : "Koi receipt nahi mili.", n ? "success" : "warn");
  }

  // ====================================================================
  //  Ready-date tracking + WhatsApp
  // ====================================================================

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  /** When can this certificate be downloaded? (receipt's proposed delivery date) */
  function readiness(rec) {
    if (!rec.due) return { state: "unknown", text: "", days: null };
    const [y, m, d] = rec.due.split("-").map(Number);
    const days = Math.round((new Date(y, m - 1, d).getTime() - dayStart(new Date())) / 86400000);
    const label = `${d} ${MONTHS[m - 1]}`;
    if (days > 1) return { state: "wait", text: `${label} — ${days} din baaki`, days };
    if (days === 1) return { state: "wait", text: `${label} — kal`, days };
    if (days === 0) return { state: "today", text: `${label} — aaj`, days };
    return { state: "ready", text: `${label} — ready`, days };
  }

  const isReady = (r) => { const x = readiness(r).state; return x === "ready" || x === "today"; };

  function whatsappLink(rec) {
    if (!rec.mobile) return "";
    const kind = (SaathiCertJob.SERVICE_LABELS[rec.type] || "").split("/").pop().trim();
    const msg = `Namaste ${rec.name} ji, aapka ${kind && rec.type !== "other" ? kind + " " : ""}certificate (Ref: ${rec.ref}) ready hai. Kripya apna certificate le jaayein. — Digital Saathi`;
    return `https://wa.me/91${rec.mobile}?text=${encodeURIComponent(msg)}`;
  }

  // ====================================================================
  //  Rendering
  // ====================================================================

  function renderSteps() {
    const el = $("cdSteps");
    if (!el || !job) return;
    const hasRecs = job.records.length > 0;
    const allDone = hasRecs && job.records.every(r => r.status !== "pending");
    const steps = [
      { t: "Link", done: true },
      { t: "Receipts", done: hasRecs || queue.length > 0 },
      { t: "Check", done: hasRecs && (job.running || allDone) },
      { t: "Download", done: allDone },
    ];
    const active = steps.findIndex(s => !s.done);
    el.innerHTML = steps.map((s, i) => `
      <div class="cd-step ${s.done ? "is-done" : ""} ${i === active ? "is-active" : ""}">
        <span class="cd-step-dot">${s.done ? "✓" : i + 1}</span><span class="cd-step-t">${s.t}</span>
      </div>`).join('<span class="cd-step-line"></span>');
  }

  function counts() {
    const c = (s) => job.records.filter(r => r.status === s).length;
    return { all: job.records.length, pending: c("pending"), done: c("done"), skipped: c("skipped"), failed: c("failed") };
  }

  function renderStats() {
    const n = counts();
    $("cdStats").innerHTML = `
      <div class="cd-stat cd-s-blue"><b>${n.all}</b><span>Total</span></div>
      <div class="cd-stat cd-s-green"><b>${n.done}</b><span>Ho gaye</span></div>
      <div class="cd-stat cd-s-amber"><b>${n.pending}</b><span>Baaki</span></div>
      <div class="cd-stat cd-s-red"><b>${n.failed + n.skipped}</b><span>Fail / Skip</span></div>`;
    const readyCount = job.records.filter(r => r.status === "pending" && isReady(r)).length;
    const f = [["all", "Sab", n.all], ["ready", "🟢 Ready", readyCount], ["pending", "Baaki", n.pending], ["done", "Ho gaye", n.done], ["failed", "Fail", n.failed + n.skipped]];
    $("cdFilters").innerHTML = f.map(([k, l, c]) => `<button type="button" class="cd-filter${filter === k ? " on" : ""}" data-f="${k}">${l} <i>${c}</i></button>`).join("") +
      `<button type="button" class="cd-filter cd-sort" id="cdSortReady" title="Ready wale upar, phir jaldi wali date">↕ Ready pehle</button>`;
    $("cdSortReady").addEventListener("click", () => SaathiCertJob.update(j => {
      const rank = (r) => (r.status !== "pending" ? 3 : isReady(r) ? 0 : r.due ? 1 : 2);
      j.records = j.records.map((r, i) => [r, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0].due || "9").localeCompare(b[0].due || "9") || a[1] - b[1]).map(x => x[0]);
      j.idx = Math.max(0, SaathiCertJob.nextPendingIndex(j, 0));
    }));
    $("cdFilters").querySelectorAll(".cd-filter").forEach(b => b.addEventListener("click", () => { filter = b.dataset.f; renderStats(); renderRecords(); }));

    const pct = n.all ? Math.round(n.done / n.all * 100) : 0;
    $("cdRunFill").style.width = pct + "%";
    const times = job.records.filter((r) => r.at).map((r) => r.at).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g < 600000);
    const eta = job.running && gaps.length >= 2 && n.pending ? ` · ~${Math.max(1, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * n.pending / 60000))} min baaki` : "";
    $("certSummary").textContent = n.all ? `${n.done}/${n.all} ho gaye (${pct}%)${job.running ? " · ▶ chal raha hai" : ""}${eta}` : "Abhi koi receipt nahi";
    $("certAutoSubmit").checked = !!job.autoSubmit;
    $("certSound").checked = job.settings.sound !== false;
  }

  function typeSelectHtml(rec) {
    return `<select class="cd-input cd-type" data-id="${rec.id}" title="Certificate ka type — file ke code ke liye">` +
      Object.entries(SaathiCertJob.SERVICE_LABELS).map(([k, v]) => `<option value="${k}"${rec.type === k ? " selected" : ""}>${esc(v)}</option>`).join("") + `</select>`;
  }

  function renderRecords() {
    const el = $("certRecords");
    if (!el) return;
    if (!job.records.length) {
      el.innerHTML = `<div class="cd-empty"><div class="cd-empty-ico">🧾</div><b>Abhi koi receipt nahi</b><small>Upar receipts upload karke "Receipts padho" dabayein</small></div>`;
      return;
    }
    const q = ($("cdSearch") ? $("cdSearch").value : "").trim().toLowerCase();
    const matches = (r) => !q || [r.name, r.ref].some((v) => String(v || "").toLowerCase().includes(q));
    const show = (r) => matches(r) && (filter === "all" || (filter === "failed" ? (r.status === "failed" || r.status === "skipped")
      : filter === "ready" ? (r.status === "pending" && isReady(r)) : r.status === filter));
    const html = job.records.map((r, i) => {
      if (!show(r)) return "";
      const st = STATUS[r.status] || STATUS.pending;
      const active = job.running && i === job.idx && r.status === "pending";
      const refBad = !REF_OK.test(r.ref || "");
      const cands = (!r.name || r.nameSource === "translit") && r.candidates && r.candidates.length
        ? `<div class="cd-cands">💡 ${r.candidates.map(c => `<button type="button" class="cd-cand" data-id="${r.id}" data-n="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : "";
      const rd = readiness(r);
      const due = rd.state === "unknown" ? "" : `<span class="cd-due cd-due-${rd.state}" title="Receipt ki proposed date">📅 ${esc(rd.text)}</span>`;
      const wa = whatsappLink(r);
      const memChip = r.mem && r.mem.length ? `<span class="cd-mem" title="Pehle sudhaare hue: ${esc(r.mem.join(", "))}">🧠 yaad se sudhra</span>` : "";
      const note0 = r.nameSource === "translit" ? `<span class="cd-note cd-note-amber">Hindi → English${r.hindi ? ": " + esc(r.hindi) : ""} — check karein</span>`
        : !r.name ? `<span class="cd-note cd-note-red">Naam nahi mila — neeche se chunein ya likhein</span>` : "";
      const note = note0 + memChip;
      return `
      <div class="cd-rec cd-st-${r.status}${active ? " is-active" : ""}" data-id="${r.id}">
        <div class="cd-rec-num">${i + 1}</div>
        <div class="cd-rec-main">
          <div class="cd-rec-row">
            <input type="text" class="cd-input cd-ref${refBad ? " cd-bad" : ""}" data-id="${r.id}" value="${esc(r.ref)}" title="Application Ref. Number" spellcheck="false">
            ${typeSelectHtml(r)}
          </div>
          <input type="text" class="cd-input cd-name${r.name ? "" : " cd-bad"}" data-id="${r.id}" value="${esc(r.name)}" placeholder="Applicant name (English)" spellcheck="false">
          ${cands}
          <div class="cd-rec-foot">
            <span class="cd-fname" title="Is naam se save hoga">💾 ${esc(SaathiCertJob.fileNameFor(r, job.settings).split("/").pop())}</span>
            ${due}
            ${note}
          </div>
        </div>
        <div class="cd-rec-side">
          <span class="cd-chip cd-chip-${r.status}" title="${esc(r.file)}">${st.icon} ${st.label}</span>
          <div class="cd-rec-actions">
            ${r.status !== "pending" ? `<button type="button" class="cd-mini cd-act" data-a="redo" data-id="${r.id}" title="Dobara pending karo">↻</button>` : `<button type="button" class="cd-mini cd-act" data-a="skip" data-id="${r.id}" title="Skip">⏭</button>`}
            ${wa ? `<a class="cd-mini cd-wa" href="${wa}" target="_blank" rel="noopener" title="WhatsApp: ${esc(r.mobile)} ko 'certificate ready' bhejo">💬</a>` : ""}
            <button type="button" class="cd-mini cd-act cd-mini-red" data-a="del" data-id="${r.id}" title="Hatao">🗑</button>
          </div>
        </div>
      </div>`;
    }).join("");
    el.innerHTML = html || `<div class="cd-empty"><small>Is filter me koi receipt nahi</small></div>`;

    const upd = (id, fn) => SaathiCertJob.update(j => { const r = j.records.find(x => x.id === id); if (r) fn(r, j); });
    const teach = (i, field, apply) => {
      let msg = "";
      upd(i.dataset.id, r => {
        apply(r);
        if (window.OcrLexicon && r.ocr) {
          msg = OcrLexicon.learnEdit(r, field, r[field]);
          const m2 = OcrLexicon.rememberField(r, field, r[field]);
          if (msg) r.ocr[field] = r[field]; else if (m2) msg = field + " yaad rakha";
        }
      }).then(() => { if (msg && typeof toast === "function") toast("🧠 OCR ne seekh liya: " + msg, "ok"); });
    };
    el.querySelectorAll(".cd-ref").forEach(i => i.addEventListener("change", () => teach(i, "ref", r => { r.ref = i.value.trim().toUpperCase().replace(/\s+/g, ""); })));
    el.querySelectorAll(".cd-name").forEach(i => i.addEventListener("change", () => teach(i, "name", r => { r.name = i.value.trim(); r.nameSource = "manual"; })));
    el.querySelectorAll(".cd-type").forEach(i => i.addEventListener("change", () => upd(i.dataset.id, r => { r.type = i.value; })));
    el.querySelectorAll(".cd-cand").forEach(b => b.addEventListener("click", () => upd(b.dataset.id, r => { r.name = b.dataset.n; r.nameSource = "manual"; })));
    el.querySelectorAll(".cd-act").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.id, a = b.dataset.a;
      if (a === "del") SaathiCertJob.update(j => { j.records = j.records.filter(x => x.id !== id); j.idx = Math.min(j.idx, Math.max(0, j.records.length - 1)); });
      else if (a === "skip") SaathiCertJob.finish(id, "skipped");
      else upd(id, (r, j) => { r.status = "pending"; if (j.idx > j.records.indexOf(r)) j.idx = j.records.indexOf(r); });
    }));
  }

  function renderNotFound() {
    const el = $("certNotFound");
    if (!el) return;
    if (!notFound.length) { el.innerHTML = ""; return; }
    el.innerHTML = `<section class="cd-card cd-card-warn">
      <div class="cd-card-title">⚠️ In files me Ref No. nahi mila <small>(alag rakha — haath se daalein)</small></div>` + notFound.map((n, i) => `
      <div class="cd-nf">
        <div class="cd-nf-file">📄 ${esc(n.fileName)}</div>
        <div class="cd-rec-row">
          <input type="text" class="cd-input" id="nfRef${i}" placeholder="BICCO/2026/00000" spellcheck="false">
          <input type="text" class="cd-input" id="nfName${i}" placeholder="Applicant Name (English)" spellcheck="false">
          <button type="button" class="cd-btn cd-btn-blue nf-add" data-i="${i}">➕ Add</button>
        </div>
        <details class="cd-raw"><summary>OCR ka raw text dekho</summary><pre>${esc(n.rawText || "(khaali)")}</pre></details>
      </div>`).join("") + `</section>`;
    el.querySelectorAll(".nf-add").forEach(b => b.addEventListener("click", async () => {
      const i = Number(b.dataset.i);
      const ref = $("nfRef" + i).value.trim().toUpperCase(), name = $("nfName" + i).value.trim();
      if (!REF_OK.test(ref) || !name) { toast("Ref No. (BICCO/2026/00000) aur naam dono daalein.", "warn"); return; }
      await addRecords([{ ref, name, nameSource: "manual", serviceKey: "other", candidates: [] }], notFound[i].fileName);
      notFound.splice(i, 1);
      await refresh();
    }));
  }

  function renderNaming(fromInput) {
    const st = job.settings;
    if (!fromInput) {
      $("cdTemplate").value = st.template;
      $("cdFolder").value = st.folder;
      document.querySelectorAll(".cd-code-in").forEach(i => { i.value = st.codes[i.dataset.k] || ""; });
    }
    const sample = job.records[0] || { ref: "BICCO/2026/00123", name: "Rahul Kumar", type: "income" };
    const live = Object.assign({}, st, {
      template: $("cdTemplate").value || st.template, folder: $("cdFolder").value,
      codes: Object.assign({}, st.codes, ...Array.from(document.querySelectorAll(".cd-code-in")).map(i => ({ [i.dataset.k]: i.value.trim() }))),
    });
    $("cdNamePreview").textContent = "→ " + SaathiCertJob.fileNameFor(sample, live);
  }

  let foldedOnce = false;
  let refreshSeq = 0;
  async function refresh() {
    const seq = ++refreshSeq;
    const fresh = await SaathiCertJob.get();
    if (seq !== refreshSeq) return; // a newer refresh is already running — don't paint an older snapshot
    job = fresh;
    const urlInput = $("certUrl");
    if (urlInput && !urlInput.value) urlInput.value = await getUrl();
    if (!document.activeElement || !/cd-(name|ref)|cd-input/.test(document.activeElement.className || "")) { /* avoid stealing focus */ }
    if (!foldedOnce && job.records.length) { foldedOnce = true; ["cdFold1", "cdFold2"].forEach((id) => { const d = $(id); if (d) d.open = false; }); }
    renderSteps(); renderStats(); renderRecords(); renderNotFound();
    if (!$("cdNaming").contains(document.activeElement)) renderNaming(false);
    else renderNaming(true);
  }

  // ====================================================================
  //  Run control, naming settings, CSV
  // ====================================================================

  async function start() {
    job = await SaathiCertJob.get();
    const pending = job.records.filter(r => r.status === "pending");
    if (!pending.length) { toast("Koi pending receipt nahi hai.", "warn"); return; }
    const bad = pending.filter(r => !r.ref || !r.name);
    if (bad.length) { toast(`${bad.length} receipt me naam/Ref No. khaali hai — pehle bhar do.`, "warn"); return; }
    await SaathiCertJob.update(j => {
      j.running = true;
      j.autoSubmit = $("certAutoSubmit").checked;
      j.idx = SaathiCertJob.nextPendingIndex(j, 0);
    });
    if (await openPage()) toast("Page par captcha type karte jaayein — baaki sab auto hai.", "success");
  }

  function exportCsv() {
    if (!job.records.length) { toast("Export ke liye list khaali hai.", "warn"); return; }
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = [["No", "Ref No", "Name", "Mobile", "Ready Date", "Type", "Status", "Saved As", "Source File"]].concat(job.records.map((r, i) =>
      [i + 1, r.ref, r.name, r.mobile || "", r.due || "", SaathiCertJob.SERVICE_LABELS[r.type] || r.type, (STATUS[r.status] || {}).label || r.status, SaathiCertJob.fileNameFor(r, job.settings), r.file]));
    const blob = new Blob(["\ufeff" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rtps_certificates.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function saveNaming() {
    SaathiCertJob.update(j => {
      j.settings.template = $("cdTemplate").value.trim() || SaathiCertJob.DEFAULT_TEMPLATE;
      j.settings.folder = $("cdFolder").value.trim();
      document.querySelectorAll(".cd-code-in").forEach(i => { const v = i.value.trim().toUpperCase(); if (v) j.settings.codes[i.dataset.k] = v; });
    });
  }

  // ---- Download / Status Check switch -------------------------------
  function showSection(which) {
    const status = which === "status";
    $("cdPaneDownload").style.display = status ? "none" : "";
    $("cdPaneStatus").style.display = status ? "" : "none";
    $("cdSegDownload").classList.toggle("on", !status);
    $("cdSegStatus").classList.toggle("on", status);
    $("cdSegDownload").setAttribute("aria-selected", String(!status));
    $("cdSegStatus").setAttribute("aria-selected", String(status));
    try { localStorage.setItem("saathiCertSection", which); } catch (e) { /* storage blocked — fine */ }
    document.dispatchEvent(new CustomEvent("saathi-cert-section", { detail: which }));
  }

  function init() {
    if (!build()) return;
    $("cdSegDownload").addEventListener("click", () => showSection("download"));
    $("cdSegStatus").addEventListener("click", () => showSection("status"));
    let remembered = "download";
    try { remembered = localStorage.getItem("saathiCertSection") || "download"; } catch (e) { /* ignore */ }
    if (remembered === "status") showSection("status");
    $("certSaveUrl").addEventListener("click", saveUrl);
    $("certUseTab").addEventListener("click", useCurrentTab);
    $("certOpen").addEventListener("click", openPage);
    $("certInput").addEventListener("change", (e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; });
    const drop = $("certDrop");
    drop.addEventListener("click", () => $("certInput").click());
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); addFiles(Array.from(e.dataTransfer.files || [])); });
    $("certReadBtn").addEventListener("click", readAll);
    $("certCancelBtn").addEventListener("click", () => abort && abort.abort());
    $("certClearQueue").addEventListener("click", () => { if (!busy) { queue = []; notFound = []; renderQueue(); renderNotFound(); renderSteps(); } });
    $("certStart").addEventListener("click", start);
    $("certStop").addEventListener("click", () => SaathiCertJob.update(j => { j.running = false; }));
    $("certRetry").addEventListener("click", () => SaathiCertJob.update(j => { let first = -1; j.records.forEach((r, i) => { if (r.status === "failed") { r.status = "pending"; if (first < 0) first = i; } }); if (first >= 0) j.idx = first; }));
    $("certReset").addEventListener("click", () => SaathiCertJob.update(j => { j.records.forEach(r => { r.status = "pending"; }); j.idx = 0; j.running = false; }));
    $("certCsv").addEventListener("click", exportCsv);
    $("cdSearch").addEventListener("input", () => { if (job) renderRecords(); });
    $("cdCopyAll").addEventListener("click", async () => {
      if (!job.records.length) { toast("List khaali hai.", "warn"); return; }
      const t = job.records.map((r) => `${r.name} | ${r.ref} | ${(STATUS[r.status] || {}).label}`).join("\n");
      try { await navigator.clipboard.writeText(t); toast("List copy ho gayi.", "success"); } catch (e) { toast("Copy nahi ho paya.", "warn"); }
    });
    $("certWipe").addEventListener("click", () => { if (window.confirm("Poori list hata dein?")) SaathiCertJob.update(j => { j.records = []; j.idx = 0; j.running = false; }); });
    $("certAutoSubmit").addEventListener("change", () => SaathiCertJob.update(j => { j.autoSubmit = $("certAutoSubmit").checked; }));
    $("certSound").addEventListener("change", () => SaathiCertJob.update(j => { j.settings.sound = $("certSound").checked; }));

    // file-name settings
    ["cdTemplate", "cdFolder"].forEach(id => { $(id).addEventListener("input", () => renderNaming(true)); $(id).addEventListener("change", saveNaming); });
    document.querySelectorAll(".cd-code-in").forEach(i => { i.addEventListener("input", () => renderNaming(true)); i.addEventListener("change", saveNaming); });
    $("cdTokens").querySelectorAll(".cd-token").forEach(b => b.addEventListener("click", () => {
      const inp = $("cdTemplate"); const pos = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
      inp.value = inp.value.slice(0, pos) + b.dataset.t + inp.value.slice(pos);
      inp.focus(); renderNaming(true); saveNaming();
    }));
    $("cdNameReset").addEventListener("click", () => SaathiCertJob.update(j => { j.settings = SaathiCertJob.DEFAULT_SETTINGS(); }));

    chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch[SaathiCertJob.KEY]) refresh(); });
    renderQueue();
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
