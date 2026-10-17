/**
 * certStatus.js  (popup — Certificates tab, "Status Check" section)
 * ------------------------------------------------------------
 * 1. Upload receipts / certificates (PDF, screenshot, photo).
 * 2. OCR (offline) reads Application Ref. No., Application Submission
 *    Date, applicant / father / mother name. Pages that carry only names
 *    (a certificate) are matched to the right receipt by ref or name.
 * 3. "Start" opens the portal's Track Application page; the content
 *    script (certStatusFill.js) fills step 1, the OPERATOR types only the
 *    captcha, steps 2 and 3 are done automatically, and the status the
 *    portal shows is saved on the record.
 *
 * The captcha is never read or solved by the extension.
 * Shares the Certificates tab with certDownload.js (it builds the
 * #cdPaneStatus container this file fills) and re-uses its cd-* styles.
 * ------------------------------------------------------------
 */
(function () {
  const MAX_FILES = 10;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const REF_OK = /^[A-Z]{3,10}\/20\d{2}\/\d{2,10}$/;
  const Job = typeof SaathiStatusJob !== "undefined" ? SaathiStatusJob : null;

  const STATUS = {
    pending: { icon: "⏳", label: "Pending" },
    done: { icon: "✅", label: "Status mil gaya" },
    skipped: { icon: "⏭", label: "Skip" },
    failed: { icon: "❌", label: "Fail / galat" },
  };
  const KIND_LABEL = { ready: "🟢 Ready / poora", pending: "🟡 Process me", rejected: "🔴 Reject", error: "⚠️ Galat details", info: "ℹ️ Status" };

  let job = null;
  let queue = [];
  let busy = false;
  let abort = null;
  let filter = "all";
  let query = "";
  let sortPendingFirst = false;
  let folded = false;
  let built = false;

  const $ = (id) => document.getElementById(id);
  const toast = (m, k) => window.saathiToast && window.saathiToast(m, k || "info");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name);
  const newId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? "abhi" : m < 60 ? `${m} min pehle` : m < 1440 ? `${Math.round(m / 60)} ghante pehle` : new Date(t).toLocaleDateString(); };
  const oneLine = (r) => `${r.name || "-"} | ${r.ref} | ${r.result ? r.result.text.split("\n").slice(-3).join(" ; ") : (STATUS[r.status] || {}).label}`;
  async function copyText(t, okMsg) {
    try { await navigator.clipboard.writeText(t); toast(okMsg || "Copy ho gaya.", "success"); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(okMsg || "Copy ho gaya.", "success"); } catch (e2) { toast("Copy nahi ho paya.", "warn"); } ta.remove(); }
  }
  function waLink(r) {
    if (!/^[6-9]\d{9}$/.test(String(r.mobile || "")) || !r.result) return "";
    const k = r.result.kind;
    const body = k === "ready" ? "aapka certificate ready hai, kripya le jaayein." : k === "rejected" ? "aapka application reject ho gaya hai, kripya sampark karein." : "aapke application ka status: " + String(r.result.text || "").split("\n").slice(-1)[0].slice(0, 100);
    return `https://wa.me/91${r.mobile}?text=${encodeURIComponent(`Namaste ${r.name || ""} ji, ${body} (Ref: ${r.ref}) — Digital Saathi`)}`;
  }
  const nameKey = (n) => String(n || "").toLowerCase().replace(/[^a-zऀ-ॿ ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

  // ====================================================================
  //  Layout
  // ====================================================================

  function build() {
    const pane = $("cdPaneStatus");
    if (!pane || built) return false;
    built = true;
    pane.innerHTML = `
      <div class="cd-hero cd-hero-status">
        <div class="cd-hero-icon">🔎</div>
        <div>
          <div class="cd-hero-title">Certificate Status</div>
          
        </div>
      </div>

      <details class="cd-card st-fold" id="stFold1" open>
        <summary class="cd-card-title cd-summary"><span class="cd-num">1</span> Page Link <small id="stLinkHint"></small></summary>
        <input type="text" id="stUrl" class="cd-input" spellcheck="false" placeholder="${esc(Job ? Job.DEFAULT_URL : "")}">
        <div class="cd-btn-row">
          <button type="button" id="stSaveUrl" class="cd-btn">Save</button>
          <button type="button" id="stUseTab" class="cd-btn">Pic Link</button>
          <button type="button" id="stOpen" class="cd-btn cd-btn-blue">Open Page</button>
        </div>
        <div class="st-note"></div>
      </details>

      <details class="cd-card st-fold" id="stFold2" open>
        <summary class="cd-card-title cd-summary"><span class="cd-num">2</span> Receipts </small></summary>
        <div id="stDrop" class="cd-drop"><span class="cd-drop-icon">⬆</span><span class="cd-drop-txt"><b>Choose Files</small></span><span class="cd-drop-btn">Choose</span></div>
        <input type="file" id="stInput" accept="image/*,.pdf" multiple style="display:none;">
        <div id="stQueue" class="cd-queue"></div>
        <div class="cd-progress" id="stReadBar" style="display:none;"><div class="cd-progress-fill" id="stReadFill"></div></div>
        <div class="cd-btn-row">
          <button type="button" id="stReadBtn" class="cd-btn cd-btn-gold cd-grow">Apply</button>
          <button type="button" id="stCancelBtn" class="cd-btn cd-btn-red" style="display:none;"> Cancel</button>
          <button type="button" id="stClearQueue" class="cd-btn">Remove</button>
        </div>
        <div class="cd-btn-row cd-btn-row-sm"><button type="button" id="stAddManual" class="cd-btn cd-btn-sm">+ Add </button></div>
      </details>

      <section class="cd-card">
        <div class="cd-card-title"><span class="cd-num">3</span>Recipts List<small></small></div>
        <div class="cd-stats" id="stStats"></div>
        <div class="st-tools">
          <input type="search" id="stSearch" class="cd-input st-search" placeholder="Enter Name" spellcheck="false">
          <button type="button" id="stSort" class="cd-btn cd-btn-sm" title="Baaki wale upar">↕ Baki</button>
          <button type="button" id="stCopyAll" class="cd-btn cd-btn-sm" title="Sabka status copy karein">📋 Copy All</button>
        </div>
        <div class="cd-filters" id="stFilters"></div>
        <div id="stRecords"></div>
      </section>

      <section class="cd-card cd-run cd-run-compact">
        <div class="cd-run-top"><span id="stSummary">—</span><span class="st-kinds" id="stKinds"></span></div>
        <div class="cd-progress"><div class="cd-progress-fill" id="stRunFill"></div></div>
        <div class="cd-run-actions">
          <button type="button" id="stStart" class="cd-btn cd-btn-green cd-grow">Check Status</button>
          <button type="button" id="stStop" class="cd-btn cd-btn-red" title="Stop">⏹</button>
          <details class="cd-more">
            <summary class="cd-btn" title="Aur options">⚙</summary>
            <div class="cd-more-pop">
              <label class="cd-switch"><input type="checkbox" id="stAutoSubmit" checked><span>Auto Summit</span></label>
              <label class="cd-switch"><input type="checkbox" id="stSound" checked><span>🔔 Sound</span></label>
              <div class="cd-more-btns">
                <button type="button" id="stRetry" class="cd-btn cd-btn-sm">🔁 Fail - Try Again</button>
                <button type="button" id="stRecheck" class="cd-btn cd-btn-sm" title="Jinka status abhi 'process me' hai unhe dobara check karo — badlav pakda jayega">🔄 Process-Try Again</button>
                <button type="button" id="stReset" class="cd-btn cd-btn-sm">↺ Pending All</button>
                <button type="button" id="stCsv" class="cd-btn cd-btn-sm">📊 CSV</button>
                <button type="button" id="stWipe" class="cd-btn cd-btn-sm cd-btn-red">🗑 Remove All</button>
              </div>
            </div>
          </details>
        </div>
      </section>`;
    return true;
  }

  // ====================================================================
  //  Page link (session-safe)
  // ====================================================================

  function getUrl() {
    return new Promise((r) => chrome.storage.local.get([Job.URL_KEY], (res) => r((res && res[Job.URL_KEY]) || Job.DEFAULT_URL)));
  }

  async function saveUrl() {
    const n = Job.normalizeLink($("stUrl").value);
    if (!n) { toast("Link https://serviceonline.bihar.gov.in/ ka hona chahiye.", "warn"); return null; }
    await new Promise((r) => chrome.storage.local.set({ [Job.URL_KEY]: n.url }, r));
    $("stUrl").value = n.url;
    toast(n.changed ? "Link saved" : "", "success");
    return n.url;
  }

  function useCurrentTab() {
    chrome.tabs.query({ url: ["https://serviceonline.bihar.gov.in/*"] }, (tabs) => {
      const list = (tabs || []).filter((t) => t.url);
      const flow = list.filter((t) => { try { return Job.isFlowPath(new URL(t.url).pathname); } catch (e) { return false; } });
      const pick = flow.find((t) => t.active) || flow[0] || list.find((t) => t.active) || list[0];
      if (!pick) { toast("Pehle portal ka status page kholkar ye dabayein.", "warn"); return; }
      $("stUrl").value = pick.url;
      saveUrl();
    });
  }

  /** Background shows the portal page; the content script there opens the status link. */
  async function openPage() {
    const url = (await saveUrl()) || (await getUrl());
    if (!url) return false;
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "STATUS_OPEN", url }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) chrome.tabs.create({ url });
          resolve(true);
        });
      } catch (e) { chrome.tabs.create({ url }); resolve(true); }
    });
  }

  // ====================================================================
  //  Upload + OCR
  // ====================================================================

  function addFiles(files) {
    if (busy) return;
    const seen = new Set(queue.map((q) => [q.file.name, q.file.size, q.file.lastModified].join("|")));
    let skipped = 0;
    files.forEach((f) => {
      const k = [f.name, f.size, f.lastModified].join("|");
      if ((!isPdf(f) && !isImg(f)) || f.size > MAX_FILE_BYTES || seen.has(k) || queue.length >= MAX_FILES) { skipped++; return; }
      seen.add(k);
      queue.push({ file: f, status: "Queued", state: "queued" });
    });
    if (skipped) toast(`${skipped} file chhoot gayi (max ${MAX_FILES}, PDF/image, duplicate nahi).`, "warn");
    renderQueue();
    if (queue.length && OcrEngine.warmUp) OcrEngine.warmUp();
  }

  function renderQueue() {
    const el = $("stQueue");
    if (!el) return;
    el.innerHTML = queue.map((q, i) => `
      <div class="cd-file cd-file-${q.state}">
        <span class="cd-file-ico">${isPdf(q.file) ? "📕" : "🖼️"}</span>
        <span class="cd-file-name" title="${esc(q.file.name)}">${esc(q.file.name)}</span>
        <span class="cd-file-status">${q.state === "busy" ? '<span class="saathi-mini-spinner"></span>' : ""}${esc(q.status)}</span>
        <button type="button" class="cd-x" data-i="${i}" title="Hatao">✕</button>
      </div>`).join("");
    el.querySelectorAll(".cd-x").forEach((b) => b.addEventListener("click", () => {
      if (busy) return;
      queue.splice(Number(b.dataset.i), 1);
      renderQueue();
    }));
  }

  function askPassword(file, wasWrong) {
    return window.prompt((wasWrong ? "❌ Galat password.\n\n" : "") + `"${file.name}" password-protected hai. Password daalein (skip: Cancel):`, "");
  }

  const useful = (e) => !!(e.ref || e.name || e.father || e.mother || e.date);

  async function readOne(i, signal) {
    const q = queue[i];
    q.status = "OCR chal raha hai…"; q.state = "busy"; renderQueue();
    const run = (force) => OcrEngine.extractTextFromFile(q.file, (s) => { q.status = s; }, { signal, forceOcr: force, askPassword });
    try {
      let res = await run(false);
      let entries = DocumentParser.extractStatusInfo(res.pageTexts || res.text).filter(useful);
      if (!entries.length && isPdf(q.file) && res.method === "pdf-text") {
        res = await run(true);
        entries = DocumentParser.extractStatusInfo(res.pageTexts || res.text).filter(useful);
      }
      if (!entries.length) { q.status = "Kuchh nahi mila"; q.state = "warn"; }
      else {
        await addEntries(entries, q.file.name);
        const withRef = entries.filter((e) => e.ref).length;
        const missing = entries.filter((e) => e.ref && !e.date).length;
        const warn = (res.warnings && res.warnings[0]) ? " · ⚠ " + res.warnings[0].split(" — ")[0] : "";
        q.status = `${entries.length} record` + (withRef < entries.length ? " · naam wala page jud gaya" : "") + (missing ? ` · ${missing} ki date nahi mili` : "") + warn;
        q.state = missing || warn ? "warn" : "ok";
      }
    } catch (err) {
      const aborted = err && err.code === "ABORTED";
      q.status = aborted ? "Cancel hua" : (err && err.name === "OcrError" ? err.message : "Error — skip");
      q.state = aborted ? "queued" : "err";
      if (!aborted) console.error(err);
    }
    renderQueue();
  }

  /** Merge OCR results into the job: same ref -> same record; a page without ref is matched by name. Never overwrites what is already filled. */
  async function addEntries(entries, fileName) {
    if (window.OcrLexicon) { try { await OcrLexicon.load(); } catch (x) { /* optional */ } }
    await Job.update((j) => {
      entries.forEach((e) => {
        const ocrRef = e.ref || "";
        if (window.OcrLexicon) { if (e.ref) e.ref = OcrLexicon.fixDigits(e.ref); if (e.mobile) e.mobile = OcrLexicon.fixDigits(e.mobile); OcrLexicon.applyMemory(e); }
        let rec = e.ref ? j.records.find((r) => r.ref === e.ref) : null;
        if (!rec) {
          const key = nameKey(e.name);
          if (key) rec = j.records.find((r) => (!e.ref || !r.ref) && nameKey(r.name) === key);
        }
        if (rec) {
          if (!rec.ref && e.ref) rec.ref = e.ref;
          ["date", "name", "father", "mother", "mobile"].forEach((k) => { if (!rec[k] && e[k]) rec[k] = e[k]; });
          if (!rec.candidates || !rec.candidates.length) rec.candidates = e.candidates || [];
          return;
        }
        j.records.push({
          id: newId(), ref: e.ref || "", date: e.date || "", name: e.name || "", father: e.father || "", mother: e.mother || "", mobile: e.mobile || "",
          hindi: e.hindi || "", nameSource: e.nameSource || "", candidates: e.candidates || [], status: "pending", result: null, file: fileName,
          ocrSrc: e.nameSource || "", ocrKey: ocrRef, mem: e.fromMemory || null,
          ocr: { ref: ocrRef, name: e.name || "", father: e.father || "", mother: e.mother || "", mobile: e.mobile || "", date: e.date || "" },
          ocr0: { ref: ocrRef, name: e.name || "", father: e.father || "", mother: e.mother || "", mobile: e.mobile || "", date: e.date || "" },
        });
      });
    });
  }

  async function readAll() {
    if (busy) return;
    if (!queue.length) { toast("Pehle receipts / certificates upload karein.", "warn"); return; }
    busy = true;
    abort = new AbortController();
    $("stReadBtn").disabled = true;
    $("stCancelBtn").style.display = "";
    $("stReadBar").style.display = "";
    queue.forEach((q) => { q.status = "Queued"; q.state = "queued"; });
    const todo = queue.map((_, i) => i);
    let finished = 0, cursor = 0;
    const setBar = () => { $("stReadFill").style.width = Math.round(finished / todo.length * 100) + "%"; };
    setBar();
    const limit = Math.max(1, OcrEngine.getPoolSize ? OcrEngine.getPoolSize() : 1);
    await Promise.all(Array.from({ length: Math.min(limit, todo.length) }, async () => {
      while (cursor < todo.length && !abort.signal.aborted) { await readOne(todo[cursor++], abort.signal); finished++; setBar(); }
    }));
    busy = false;
    abort = null;
    $("stReadBtn").disabled = false;
    $("stCancelBtn").style.display = "none";
    setTimeout(() => { $("stReadBar").style.display = "none"; }, 600);
    await refresh();
    const n = job.records.filter((r) => r.status === "pending").length;
    toast(n ? `${n} record tayyar — check karke Start dabayein.` : "Koi record nahi mila.", n ? "success" : "warn");
  }

  // ====================================================================
  //  Rendering
  // ====================================================================

  const counts = () => {
    const c = (s) => job.records.filter((r) => r.status === s).length;
    return { all: job.records.length, pending: c("pending"), done: c("done"), skipped: c("skipped"), failed: c("failed") };
  };

  function renderStats() {
    const n = counts();
    $("stStats").innerHTML = `
      <div class="cd-stat cd-s-blue"><b>${n.all}</b><span>Total</span></div>
      <div class="cd-stat cd-s-green"><b>${n.done}</b><span>Status mila</span></div>
      <div class="cd-stat cd-s-amber"><b>${n.pending}</b><span>Baaki</span></div>
      <div class="cd-stat cd-s-red"><b>${n.failed + n.skipped}</b><span>Fail / Skip</span></div>`;
    const nReady = job.records.filter((r) => r.result && r.result.kind === "ready").length;
    const nChanged = job.records.filter((r) => r.result && r.result.changed).length;
    const f = [["all", "Sab", n.all], ["pending", "Baaki", n.pending], ["done", "Ho gaye", n.done], ["ready", "🟢 Ready", nReady], ["changed", "🔔 Badla", nChanged], ["failed", "Fail", n.failed + n.skipped]];
    $("stFilters").innerHTML = f.map(([k, l, c]) => `<button type="button" class="cd-filter${filter === k ? " on" : ""}" data-f="${k}">${l} <i>${c}</i></button>`).join("");
    $("stFilters").querySelectorAll(".cd-filter").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; renderStats(); renderRecords(); }));
    const pct = n.all ? Math.round((n.done + n.failed) / n.all * 100) : 0;
    $("stRunFill").style.width = pct + "%";
    const kc = (k) => job.records.filter((r) => r.result && r.result.kind === k).length;
    $("stKinds").innerHTML = [["ready", "🟢"], ["pending", "🟡"], ["rejected", "🔴"], ["error", "⚠️"]].map(([k, i]) => kc(k) ? `<span class="st-kind k-${k}" title="${KIND_LABEL[k]}">${i} ${kc(k)}</span>` : "").join("");
    const times = job.records.filter((r) => r.result && r.result.at).map((r) => r.result.at).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g < 600000);
    const eta = job.running && gaps.length >= 2 && n.pending ? ` · ~${Math.max(1, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * n.pending / 60000))} min baaki` : "";
    $("stSummary").textContent = n.all ? `${n.done + n.failed}/${n.all} check ho gaye (${pct}%)${job.running ? " · ▶ chal raha hai" : ""}${eta}` : "Abhi koi record nahi";
    $("stAutoSubmit").checked = !!job.autoSubmit;
    $("stSound").checked = job.sound !== false;
  }

  function renderRecords() {
    const el = $("stRecords");
    if (!el) return;
    if (!job.records.length) {
      el.innerHTML = `<div class="cd-empty"><div class="cd-empty-ico">🔎</div><b>Abhi koi record nahi</b><small>Upar files upload karke “Files padho” dabayein</small></div>`;
      return;
    }
    const q = query.trim().toLowerCase();
    const matches = (r) => !q || [r.name, r.ref, r.father, r.mother].some((v) => String(v || "").toLowerCase().includes(q));
    const show = (r) => matches(r) && (filter === "all" || (filter === "failed" ? (r.status === "failed" || r.status === "skipped") : filter === "ready" ? !!(r.result && r.result.kind === "ready") : filter === "changed" ? !!(r.result && r.result.changed) : r.status === filter));
    const order = job.records.map((r, i) => i);
    if (sortPendingFirst) order.sort((a, b) => (job.records[a].status === "pending" ? 0 : 1) - (job.records[b].status === "pending" ? 0 : 1) || a - b);
    const html = order.map((i) => {
      const r = job.records[i];
      if (!show(r)) return "";
      const st = STATUS[r.status] || STATUS.pending;
      const active = job.running && i === job.idx && r.status === "pending";
      const refBad = !REF_OK.test(r.ref || "");
      const cands = !r.name && r.candidates && r.candidates.length
        ? `<div class="cd-cands">💡 ${r.candidates.map((c) => `<button type="button" class="cd-cand" data-id="${r.id}" data-n="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : "";
      const missing = [!r.name && "naam", !r.father && "father", !r.mother && "mother"].filter(Boolean);
      const note0 = missing.length ? `<span class="cd-note cd-note-amber">${missing.join(" / ")} Fill Box</span>` : "";
      const note = note0 + (r.mem && r.mem.length ? `<span class="cd-mem" title="Pehle sudhaare hue: ${esc(r.mem.join(", "))}">🧠 yaad se sudhra</span>` : "");
      const res = r.result && r.result.text
        ? `<details class="st-res k-${esc(r.result.kind)}" ${r.status === "done" || r.status === "failed" ? "open" : ""}><summary class="st-res-head">${KIND_LABEL[r.result.kind] || KIND_LABEL.info}${r.result.changed ? `<span class="st-changed" title="Pehle: ${esc(String(r.result.prevText || "").slice(0, 200))}">🔔 Badla</span>` : ""}<small>${esc(ago(r.result.at))}</small><button type="button" class="cd-mini st-copy" data-id="${r.id}" title="Status copy karein">📋</button></summary><pre>${esc(r.result.text)}</pre></details>` : "";
      return `
      <div class="cd-rec cd-st-${r.status}${active ? " is-active" : ""}" data-id="${r.id}">
        <div class="cd-rec-num">${i + 1}</div>
        <div class="cd-rec-main">
          <div class="cd-rec-row">
            <input type="text" class="cd-input cd-ref${refBad ? " cd-bad" : ""}" data-id="${r.id}" data-k="ref" value="${esc(r.ref)}" placeholder="BICCO/2026/00000" title="Application Ref. Number" spellcheck="false">
            <input type="date" class="cd-input st-date${r.date ? "" : " cd-bad"}" data-id="${r.id}" data-k="date" value="${esc(r.date)}" title="Application Submission Date">
          </div>
          <input type="text" class="cd-input cd-name${r.name ? "" : " cd-bad"}" data-id="${r.id}" data-k="name" value="${esc(r.name)}" placeholder="Name of Applicant" spellcheck="false">
          ${cands}
          <div class="cd-rec-row">
            <input type="text" class="cd-input" data-id="${r.id}" data-k="father" value="${esc(r.father)}" placeholder="Name of Father" spellcheck="false">
            <input type="text" class="cd-input" data-id="${r.id}" data-k="mother" value="${esc(r.mother)}" placeholder="Name of Mother" spellcheck="false">
          </div>
          <input type="tel" class="cd-input st-mob" data-id="${r.id}" data-k="mobile" value="${esc(r.mobile || "")}" placeholder="Mobile" maxlength="10" inputmode="numeric">
          ${res}
          <div class="cd-rec-foot">${note}</div>
        </div>
        <div class="cd-rec-side">
          <span class="cd-chip cd-chip-${r.status}" title="${esc(r.file || "")}">${st.icon} ${st.label}</span>
          <div class="cd-rec-actions">
            ${r.status !== "pending" ? `<button type="button" class="cd-mini st-act" data-a="redo" data-id="${r.id}" title="Dobara pending karo">↻</button>` : `<button type="button" class="cd-mini st-act" data-a="skip" data-id="${r.id}" title="Skip">⏭</button>`}
            ${waLink(r) ? `<a class="cd-mini st-wa" href="${waLink(r)}" target="_blank" rel="noopener" title="WhatsApp: ${esc(r.mobile)} ko status bhejo">💬</a>` : ""}
            <button type="button" class="cd-mini st-act cd-mini-red" data-a="del" data-id="${r.id}" title="Hatao">🗑</button>
          </div>
        </div>
      </div>`;
    }).join("");
    el.innerHTML = html || `<div class="cd-empty"><small>${q ? "Is khoj me koi record nahi" : "Is filter me koi record nahi"}</small></div>`;

    const upd = (id, fn) => Job.update((j) => { const r = j.records.find((x) => x.id === id); if (r) fn(r, j); });
    el.querySelectorAll("[data-k]").forEach((i) => i.addEventListener("change", () => {
      const k = i.dataset.k;
      let learnedMsg = "";
      upd(i.dataset.id, (r) => {
        r[k] = k === "ref" ? i.value.trim().toUpperCase().replace(/\s+/g, "") : i.value.trim();
        // OCR got something slightly wrong and the operator fixed it: remember that for next time (OCR memory).
        if (window.OcrLexicon && r.ocr && ["ref", "name", "father", "mother", "mobile"].indexOf(k) >= 0) {
          const msg = OcrLexicon.learnEdit(r, k, r[k]);
          if (msg) { learnedMsg = msg; r.ocr[k] = r[k]; }
        }
        if (window.OcrLexicon) { const m = OcrLexicon.rememberField(r, k, r[k]); if (m && !learnedMsg) learnedMsg = (k === "date" ? "date" : k) + " yaad rakha"; }
        if (k === "name") r.nameSource = "manual";
      }).then(() => { if (learnedMsg) toast("🧠 OCR ne seekh liya: " + learnedMsg, "ok"); });
    }));
    el.querySelectorAll(".cd-cand").forEach((b) => b.addEventListener("click", () => upd(b.dataset.id, (r) => { r.name = b.dataset.n; })));
    el.querySelectorAll(".st-copy").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = job.records.find((x) => x.id === b.dataset.id);
      if (r) copyText(oneLine(r), "Status copy ho gaya.");
    }));
    el.querySelectorAll(".st-act").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id, a = b.dataset.a;
      if (a === "del") Job.update((j) => { j.records = j.records.filter((x) => x.id !== id); j.idx = Math.min(j.idx, Math.max(0, j.records.length - 1)); });
      else if (a === "skip") Job.finish(id, "skipped");
      else upd(id, (r, j) => { r.prev = r.result || r.prev; r.status = "pending"; r.result = null; if (j.idx > j.records.indexOf(r)) j.idx = j.records.indexOf(r); });
    }));
  }

  async function refresh() {
    if (!Job || !$("stRecords")) return;
    job = await Job.get();
    const u = $("stUrl");
    if (u && !u.value) u.value = await getUrl();
    // do not rebuild the list while the operator is typing in one of its boxes
    const typing = document.activeElement && $("stRecords").contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (!folded && job.records.length) { folded = true; ["stFold1", "stFold2"].forEach((id) => { const d = $(id); if (d) d.open = false; }); }
    renderStats();
    if (!typing) renderRecords();
  }

  // ====================================================================
  //  Run control, CSV
  // ====================================================================

  async function start() {
    job = await Job.get();
    const pending = job.records.filter((r) => r.status === "pending");
    if (!pending.length) { toast("Koi pending record nahi hai.", "warn"); return; }
    const bad = pending.filter((r) => !REF_OK.test(r.ref || "") || !r.date);
    if (bad.length) { toast(`${bad.length} record me Ref No. ya Submission Date galat / khaali hai — pehle theek karein.`, "warn"); return; }
    const noNames = pending.filter((r) => !r.name || !r.father || !r.mother).length;
    await Job.update((j) => {
      j.running = true;
      j.autoSubmit = $("stAutoSubmit").checked;
      j.sound = $("stSound").checked;
      j.idx = Job.nextPendingIndex(j, 0);
      j.phase = "step1"; j.phaseRec = j.records[j.idx] && j.records[j.idx].id;
    });
    if (await openPage()) toast(noNames ? `Status page khulte hi captcha type karein. ${noNames} record me naam khaali hai — wahan portal par likhna hoga.` : "Status page khulte hi sirf captcha type karein — baaki sab auto hai.", noNames ? "warn" : "success");
  }

  function exportCsv() {
    if (!job.records.length) { toast("Export ke liye list khaali hai.", "warn"); return; }
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = [["No", "Ref No", "Submission Date", "Applicant", "Father", "Mother", "Check", "Portal Status", "Changed Since Last", "Mobile", "Checked At", "Source File"]].concat(job.records.map((r, i) => [
      i + 1, r.ref, Job.toPortalDate(r.date), r.name, r.father, r.mother, (STATUS[r.status] || {}).label || r.status,
      r.result ? r.result.text.replace(/\n+/g, " | ") : "", r.result && r.result.changed ? "YES" : "", r.mobile || "", r.result ? new Date(r.result.at).toLocaleString() : "", r.file || ""]));
    const blob = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rtps_status.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function init() {
    if (!Job || !build()) return;
    $("stSaveUrl").addEventListener("click", saveUrl);
    $("stUseTab").addEventListener("click", useCurrentTab);
    $("stOpen").addEventListener("click", openPage);
    $("stInput").addEventListener("change", (e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; });
    const drop = $("stDrop");
    drop.addEventListener("click", () => $("stInput").click());
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); addFiles(Array.from(e.dataTransfer.files || [])); });
    $("stReadBtn").addEventListener("click", readAll);
    $("stCancelBtn").addEventListener("click", () => abort && abort.abort());
    $("stClearQueue").addEventListener("click", () => { if (!busy) { queue = []; renderQueue(); } });
    $("stAddManual").addEventListener("click", () => Job.update((j) => { j.records.push({ id: newId(), ref: "", date: "", name: "", father: "", mother: "", candidates: [], status: "pending", result: null, file: "manual" }); }));
    $("stStart").addEventListener("click", start);
    $("stStop").addEventListener("click", () => Job.update((j) => { j.running = false; }));
    $("stRetry").addEventListener("click", () => Job.update((j) => { let first = -1; j.records.forEach((r, i) => { if (r.status === "failed") { r.prev = r.result || r.prev; r.status = "pending"; r.result = null; if (first < 0) first = i; } }); if (first >= 0) j.idx = first; }));
    $("stRecheck").addEventListener("click", () => Job.update((j) => {
      let first = -1;
      j.records.forEach((r, i) => { if (r.status === "done" && r.result && (r.result.kind === "pending" || r.result.kind === "info")) { r.prev = r.result; r.result = null; r.status = "pending"; if (first < 0) first = i; } });
      if (first >= 0) j.idx = first; else toast("Koi 'process me' wala record nahi.", "info");
    }));
    $("stReset").addEventListener("click", () => Job.update((j) => { j.records.forEach((r) => { r.prev = r.result || r.prev; r.status = "pending"; r.result = null; }); j.idx = 0; j.running = false; }));
    $("stCsv").addEventListener("click", exportCsv);
    $("stSearch").addEventListener("input", () => { query = $("stSearch").value; if (job) renderRecords(); });
    $("stSort").addEventListener("click", () => { sortPendingFirst = !sortPendingFirst; $("stSort").classList.toggle("cd-btn-blue", sortPendingFirst); if (job) renderRecords(); });
    $("stCopyAll").addEventListener("click", () => { if (!job.records.length) { toast("List khaali hai.", "warn"); return; } copyText(job.records.map(oneLine).join("\n"), "Sab status copy ho gaye."); });
    $("stWipe").addEventListener("click", () => { if (window.confirm("Poori list hata dein?")) Job.update((j) => { j.records = []; j.idx = 0; j.running = false; }); });
    $("stAutoSubmit").addEventListener("change", () => Job.update((j) => { j.autoSubmit = $("stAutoSubmit").checked; }));
    $("stSound").addEventListener("change", () => Job.update((j) => { j.sound = $("stSound").checked; }));

    chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch[Job.KEY]) refresh(); });
    document.addEventListener("saathi-cert-section", (e) => { if (e.detail === "status") refresh(); });
    renderQueue();
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
