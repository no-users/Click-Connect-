/**
 * certStatusFill.js  (content script — portal "Track Application" pages)
 * ------------------------------------------------------------
 * Drives the portal's application-status flow for the records of the
 * Status Check job (Certificates tab):
 *
 *   step 1  Application Reference Number + "Application Submission Date"
 *           are filled; the cursor goes to the captcha box. The OPERATOR
 *           types the captcha (it is never read or solved by the
 *           extension) and Submit is pressed as soon as 6 digits are in.
 *   step 2  "Do you want to view/download the documents?"  ->  Yes  ->  Submit
 *   step 3  Name of Applicant / Father / Mother are filled -> Submit
 *           (if one of them is unknown the box is focused for typing).
 *   result  the status text the portal shows is read, saved on the
 *           record, and — if "agla record khud" is on — the next record's
 *           step 1 opens by itself.
 *
 * Only active while a Status job is running. Fields are found by their
 * visible label text, so the script survives id changes on the portal.
 * ------------------------------------------------------------
 */
(function () {
  if (typeof SaathiStatusJob === "undefined") return;
  const Job = SaathiStatusJob;

  const CAPTCHA_LEN = 6;

  let filledFor = null;       // record id whose step-1 values are in the form
  let namesFor = null;        // record id whose names were filled on this page
  let submitting = false;
  let docsClickedAt = 0;
  let namesSubmittedAt = 0;
  let captchaMisses = 0;
  let busy = false;
  let rerun = false;
  let panel = null;
  let lastSig = "";
  let dismissed = false;
  let shown = null;           // { rec, result, hasMore } — result of the record just finished
  let broken = false;
  const startedAt = Date.now();

  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const txt = (el) => norm(el.value != null && el.tagName === "INPUT" ? el.value : el.textContent);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, ms) {
    const end = Date.now() + ms;
    for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return null; await sleep(100); }
  }

  // ---------- finding things (by visible text) ----------

  const inPanel = (el) => !!(el && el.closest && el.closest("#saathiStatusPanel"));
  const shownEl = (el) => !!el && el.type !== "hidden" && (el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0));
  const usable = (el) => shownEl(el) && !el.disabled && !inPanel(el);

  const textInputs = (root) => Array.from((root || document).querySelectorAll("input")).filter((i) => /^(text|search|tel|number|date|)$/i.test(i.type || "") && shownEl(i) && !inPanel(i));

  const radios = () => Array.from(document.querySelectorAll("input[type=radio]")).filter((r) => shownEl(r) && !inPanel(r));

  function radioLabel(r) {
    if (r.id) { const l = document.querySelector('label[for="' + String(r.id).replace(/"/g, '\\"') + '"]'); if (l) return txt(l); }
    const p = r.closest("label"); if (p) return txt(p);
    let t = "";
    for (let n = r.nextSibling; n && t.length < 60; n = n.nextSibling) {
      if (n.nodeType === 3) t += n.textContent;
      else if (n.nodeType === 1) { if (n.tagName === "INPUT" || n.tagName === "BR") break; t += n.textContent; }
    }
    return norm(t);
  }
  const radioByText = (re) => radios().find((r) => re.test(radioLabel(r)));

  /** the "Yes" radio that belongs to the "view/download the documents" question */
  function docsYes() {
    return radios().find((r) => {
      if (!/^\s*yes\s*$/i.test(radioLabel(r))) return false;
      for (let el = r.parentElement, up = 0; el && up < 6; el = el.parentElement, up++) {
        const t = norm(el.textContent);
        if (t.length < 500 && /documents?\s*of\s*your\s*application|view\s*\/?\s*download\s*the\s*documents/i.test(t)) return true;
      }
      return false;
    }) || null;
  }

  /** first text box that comes AFTER a label whose text matches `re` */
  function controlAfterLabel(re) {
    const radioHolders = new Set();
    radios().forEach((r) => { if (r.parentElement) radioHolders.add(r.parentElement); });
    const cands = Array.from(document.querySelectorAll("label, .form-label, b, strong, td, th, span, p, div")).filter((l) => {
      if (inPanel(l)) return false;
      const t = txt(l);
      if (t.length > 70 || !re.test(t)) return false;
      if (l.querySelector("input[type=radio]") || radioHolders.has(l.parentElement) || radioHolders.has(l)) return false; // radio captions are not field labels
      return !Array.from(l.children).some((c) => re.test(txt(c)));      // innermost match only
    });
    for (const l of cands) {
      if (l.htmlFor) { const t = document.getElementById(l.htmlFor); if (t && /^(text|search|tel|number|date|)$/i.test(t.type || "") && t.tagName === "INPUT") return t; }
      for (let el = l, up = 0; el && up < 4; el = el.parentElement, up++) {
        const found = textInputs(el).find((i) => l.contains(i) || (l.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING));
        if (found) return found;
      }
    }
    return null;
  }

  const find = {
    captcha: () => {
      const known = document.getElementById("captchaAnswer");
      if (known && known.tagName === "INPUT" && shownEl(known)) return known;
      return textInputs().find((i) => /captcha/i.test([i.id, i.name, i.placeholder, i.className].join(" ")))
        || controlAfterLabel(/enter\s*the\s*characters|word\s*verification/i);
    },
    ref: () => controlAfterLabel(/^\s*(?:\d+\s*[.)]\s*)?application\s*reference\s*(?:number|no)/i),
    date: () => {
      const d = controlAfterLabel(/^\s*(?:\d+\s*[.)]\s*)?application\s*submission\s*date\s*\*?\s*$/i);
      const c = find.captcha(), r = find.ref();
      return d && d !== c && d !== r ? d : null;
    },
    applicant: () => controlAfterLabel(/^\s*(?:\d+\s*[.)]\s*)?name\s*of\s*applicant/i),
    father: () => controlAfterLabel(/^\s*(?:\d+\s*[.)]\s*)?name\s*of\s*father/i),
    mother: () => controlAfterLabel(/^\s*(?:\d+\s*[.)]\s*)?name\s*of\s*mother/i),
    button: (re) => Array.from(document.querySelectorAll("button, input[type=submit], input[type=button], a.btn, a[role=button]")).find((b) => !inPanel(b) && shownEl(b) && re.test(txt(b))),
  };
  const submitBtn = () => find.button(/^\s*submit\s*$/i);

  function stage() {
    if (find.ref() && find.captcha()) return "step1";
    if (find.applicant() || find.father() || find.mother()) return "names";
    if (docsYes()) return "docs";
    return "other";
  }

  function setValue(el, value) {
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---------- steps ----------

  async function fillStep1(rec) {
    const byRef = radioByText(/through\s*application\s*reference/i);
    if (byRef && !byRef.checked) byRef.click();
    const ref = await until(find.ref, 3000);
    if (ref && ref.value.trim() !== rec.ref) setValue(ref, rec.ref);

    const byDate = radioByText(/^\s*application\s*submission\s*date/i);
    if (byDate && !byDate.checked) byDate.click();
    const portalDate = Job.toPortalDate(rec.date);
    if (portalDate) {
      const d = await until(find.date, 3000);
      if (d && d.value.trim() !== portalDate) setValue(d, portalDate);
    }
    const cap = find.captcha();
    if (cap) { setValue(cap, ""); cap.focus(); }
    filledFor = rec.id;
    submitting = false;
  }

  async function submitStep1(rec) {
    if (submitting) return;
    const cap = find.captcha();
    if (!cap || cap.value.trim().length < CAPTCHA_LEN) return;
    submitting = true;
    const ref = find.ref(), date = find.date();
    const want = Job.toPortalDate(rec.date);
    if (!ref || ref.value.trim() !== rec.ref || (want && (!date || date.value.trim() !== want))) {
      const keep = cap.value;
      await fillStep1(rec);
      const c2 = find.captcha(); if (c2) setValue(c2, keep);
      submitting = true;
    }
    const btn = submitBtn();
    if (!btn) { submitting = false; return; }
    await Job.update((j) => { j.phase = "docs"; j.phaseRec = rec.id; });   // after this click we expect the documents question
    btn.click();
    // Still on step 1 a few seconds later = the portal refused (usually a wrong captcha):
    // load a fresh captcha, clear the box and put the cursor back — the operator just types again.
    setTimeout(() => {
      submitting = false;
      if (stage() !== "step1") return;
      captchaMisses++;
      const img = Array.from(document.querySelectorAll("img")).find((i) => /captcha/i.test([i.id, i.className, i.alt, i.src].join(" ")));
      if (img) img.src = img.src.split("?")[0] + "?id" + Date.now();
      const c = find.captcha();
      if (c) { setValue(c, ""); c.focus(); }
      lastSig = "";
    }, 5000);
  }

  async function doDocs() {
    if (Date.now() - docsClickedAt < 8000) return;
    const yes = docsYes();
    if (!yes) return;
    docsClickedAt = Date.now();
    if (!yes.checked) yes.click();
    // The three name boxes appear either straight away or only after Submit.
    const names = await until(() => find.applicant() || find.father() || find.mother(), 1200);
    if (names) return;                       // next tick handles the names stage
    const btn = submitBtn();
    if (btn) btn.click();
  }

  async function doNames(rec) {
    if (!rec) return;
    const boxes = [["name", find.applicant()], ["father", find.father()], ["mother", find.mother()]];
    if (namesFor !== rec.id) {
      boxes.forEach(([k, el]) => { if (el && rec[k] && el.value.trim() !== rec[k]) setValue(el, rec[k]); });
      namesFor = rec.id;
    }
    const empty = boxes.find(([k, el]) => el && !el.value.trim());
    if (empty) { if (document.activeElement !== empty[1]) empty[1].focus(); return; }   // operator types the missing name
    if (Date.now() - namesSubmittedAt < 8000) return;
    const btn = submitBtn();
    if (!btn) return;
    namesSubmittedAt = Date.now();
    await Job.update((j) => { j.phase = "names"; j.phaseRec = rec.id; j.namesAt = Date.now(); });
    btn.click();
  }

  // What the operator typed into a name box is kept on the record.
  document.addEventListener("click", async (e) => {
    const b = e.target && e.target.closest && e.target.closest("button, input[type=submit], input[type=button]");
    if (!b || inPanel(b) || !/^\s*submit\s*$/i.test(txt(b)) || stage() !== "names") return;
    const vals = { name: find.applicant(), father: find.father(), mother: find.mother() };
    const job = await Job.get();
    const rec = Job.current(job);
    if (!rec) return;
    await Job.update((j) => {
      const r = j.records.find((x) => x.id === rec.id);
      if (!r) return;
      Object.entries(vals).forEach(([k, el]) => { if (el && el.value.trim()) r[k] = el.value.trim(); });
      j.phase = "names"; j.phaseRec = rec.id; j.namesAt = Date.now();
    });
  }, true);

  // ---------- result ----------

  const CAPTION_LINE = /^(?:\d+\s*[.)]\s*)?(?:name\s*of\s*(?:the\s*)?(?:applicant|father|mother)\s*\*?|do you want to view.*)$|^(application details|otp\s*\/\s*application field verification|application status|submit|reset|back|close|print|home)$/i;

  function readResultText() {
    // hide every floating overlay (our panel, other extensions' "Profiles" button …) while reading
    const hidden = [];
    Array.from(document.body.children).forEach((c) => {
      let fixed = false;
      try { fixed = getComputedStyle(c).position === "fixed"; } catch (e) { /* ignore */ }
      if (fixed || inPanel(c) || /saathi/i.test(c.id || "")) { hidden.push([c, c.style.display]); c.style.display = "none"; }
    });
    let raw = "";
    try { raw = document.body.innerText || ""; } catch (e) { raw = document.body.textContent || ""; }
    hidden.forEach(([c, d]) => { c.style.display = d; });
    const lines = raw.split(/\r?\n/)
      .map((l) => norm(l.replace(/\t+/g, " | ").replace(/application details|otp\s*\/\s*application field verification|application status(?=\s*$)/gi, " ")))
      .filter((l) => l && !CAPTION_LINE.test(l));
    return lines.slice(0, 14).join("\n").slice(0, 800);
  }

  function classify(t) {
    if (/invalid|no\s*record|not\s*found|incorrect|mismatch|does\s*not\s*match|wrong|गलत|नहीं\s*मिल|त्रुटि|\berror\b/i.test(t)) return "error";
    if (/reject|अस्वीकृत|अस्वीकार|रद्द|cancel/i.test(t)) return "rejected";
    if (/deliver|dispos|approved|issued|generated|completed|ready|स्वीकृत|वितरित|निर्गत|जारी|पूर्ण|तैयार/i.test(t)) return "ready";
    if (/pending|लंबित|in\s*process|प्रक्रिया|forwarded|अग्रसारित|under/i.test(t)) return "pending";
    return "info";
  }

  async function captureResult(rec) {
    const text = readResultText();
    if (!text) return;
    const kind = classify(text);
    const result = { text, kind, at: Date.now() };
    await Job.update((j) => { j.phase = "result"; j.phaseRec = rec.id; j.namesAt = null; });
    await Job.finish(rec.id, kind === "error" ? "failed" : "done", result);
    const after = await Job.get();
    // keep running=true while the operator is still looking at this page; the page stays until THEY press Next
    const ni = Job.nextPendingIndex(after, 0);
    const cnt = (k) => after.records.filter((r) => r.result && r.result.kind === k).length;
    shown = { rec: Object.assign({}, rec), result, hasMore: ni >= 0,
      next: ni >= 0 ? (after.records[ni].name || after.records[ni].ref) : "",
      done: after.records.filter((r) => r.status === "done" || r.status === "failed").length, total: after.records.length,
      ready: cnt("ready"), pending: cnt("pending"), bad: cnt("error") + cnt("rejected"), changed: after.records.filter((r) => r.result && r.result.changed).length };
    if (!after.running && shown.hasMore) await Job.update((j) => { j.running = true; });
    lastSig = "";
    renderResult();
  }

  async function goNext() {
    const job = await Job.get();
    if (Job.nextPendingIndex(job, 0) < 0) { shown = null; renderNow(); return; }
    await Job.update((j) => { j.running = true; j.phase = "step1"; j.namesAt = null; });
    // Same window, same site -> the portal sees a normal in-site navigation (Referer + opener kept).
    location.href = Job.STEP1_URL;
  }

  // ---------- floating panel ----------

  const PANEL_CSS = `
    #saathiStatusPanel{position:fixed;top:14px;right:14px;z-index:2147483647;width:272px;max-width:calc(100vw - 28px);box-sizing:border-box;
      font:12px/1.45 "Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif;color:#1d2746;
      background:#fff;border:1px solid #e3e8f4;border-radius:16px;padding:10px 12px 12px;
      box-shadow:0 18px 40px -16px rgba(33,52,110,.35),0 2px 6px rgba(33,52,110,.08)}
    #saathiStatusPanel *{box-sizing:border-box}
    #saathiStatusPanel.sc-done{border-color:#bfe6d2;background:linear-gradient(180deg,#f3fbf7 0,#fff 90px)}
    #saathiStatusPanel.sc-warn{border-color:#f1c9c4;background:linear-gradient(180deg,#fff5f3 0,#fff 90px)}
    #saathiStatusPanel .sc-top{display:flex;align-items:center;gap:6px}
    #saathiStatusPanel .sc-title{font-weight:800;font-size:12.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1d2746}
    #saathiStatusPanel .sc-count{font-weight:800;color:#3d5bd9;font-size:11px;background:#eef2ff;border-radius:99px;padding:1px 8px}
    #saathiStatusPanel .sc-min{flex:0 0 auto;width:22px;height:22px;padding:0;border-radius:7px;background:#f0f3fa;color:#5a6788;font-size:13px;line-height:1}
    #saathiStatusPanel.min > :not(.sc-top){display:none}
    #saathiStatusPanel .sc-bar{height:4px;border-radius:99px;background:#e9edf7;overflow:hidden;margin:8px 0 9px}
    #saathiStatusPanel .sc-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#4f6cf0,#2fb67f);transition:width .4s ease}
    #saathiStatusPanel .sc-card{background:#f6f8fd;border:1px solid #e8ecf6;border-radius:11px;padding:7px 10px}
    #saathiStatusPanel .sc-name{font-weight:800;font-size:13px;word-break:break-word}
    #saathiStatusPanel .sc-ref{color:#6a7799;font-size:10.5px;margin-top:1px;word-break:break-all;font-family:Consolas,Menlo,monospace}
    #saathiStatusPanel .sc-steps{display:flex;gap:3px;margin-top:7px}
    #saathiStatusPanel .sc-st{flex:1;text-align:center;font-size:9.5px;font-weight:700;padding:3px 0;border-radius:6px;background:#e9edf7;color:#7b88a8;white-space:nowrap}
    #saathiStatusPanel .sc-st.on{background:#3d5bd9;color:#fff}
    #saathiStatusPanel .sc-st.ok{background:#d6f1e4;color:#1c7a50}
    #saathiStatusPanel .sc-hint{margin-top:8px;font-size:11px;color:#8a5a00;background:#fff6e0;border-radius:8px;padding:5px 8px}
    #saathiStatusPanel .sc-ok-line{margin-top:8px;font-size:11px;color:#1c7a50;font-weight:700;text-align:center}
    #saathiStatusPanel .sc-big{margin-top:9px;display:flex;align-items:center;gap:7px;font-weight:800;font-size:12px;color:#1c7a50}
    #saathiStatusPanel .sc-big i{font-style:normal;display:inline-flex;width:20px;height:20px;border-radius:50%;background:#2fb67f;color:#fff;align-items:center;justify-content:center;font-size:12px}
    #saathiStatusPanel .sc-big.bad{color:#b5402f}#saathiStatusPanel .sc-big.bad i{background:#e0604f}
    #saathiStatusPanel .sc-key{margin-top:7px;padding:9px 11px;border-radius:11px;background:#fff;border:1px solid #dfe6f5;border-left:4px solid #8fa0cf;font-weight:800;font-size:14px;line-height:1.3;word-break:break-word}
    #saathiStatusPanel .sc-key.k-ready{border-left-color:#2fb67f;background:#f1fbf6;color:#14663f}
    #saathiStatusPanel .sc-key.k-pending{border-left-color:#e8a317;background:#fff9ea;color:#7a5200}
    #saathiStatusPanel .sc-key.k-rejected,#saathiStatusPanel .sc-key.k-error{border-left-color:#e0604f;background:#fff4f2;color:#a23a2c}
    #saathiStatusPanel .sc-more{margin-top:6px}
    #saathiStatusPanel .sc-more summary{cursor:pointer;font-size:10.5px;font-weight:700;color:#6a7799;list-style:none;user-select:none}
    #saathiStatusPanel .sc-more summary::-webkit-details-marker{display:none}
    #saathiStatusPanel .sc-res{margin-top:5px;max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:11px;color:#47536f;background:#f6f8fd;border-radius:9px;padding:6px 8px}
    #saathiStatusPanel .sc-row{display:flex;gap:6px;margin-top:10px}
    #saathiStatusPanel button{flex:1;border:1px solid #dfe5f3;border-radius:9px;padding:7px 6px;cursor:pointer;font-weight:700;font-size:11px;color:#32406a;background:#fff;font-family:inherit}
    #saathiStatusPanel button:hover{background:#f3f6ff}
    #saathiStatusPanel .sc-ok{background:linear-gradient(135deg,#4f6cf0,#3552d6);color:#fff;border-color:transparent;flex:2.2;box-shadow:0 8px 16px -8px rgba(53,82,214,.7)}
    #saathiStatusPanel .sc-ok:hover{background:linear-gradient(135deg,#5a76f5,#3a58de)}
    #saathiStatusPanel .sc-stop{color:#b5402f}
    #saathiStatusPanel .sc-x{flex:0 0 34px}
    #saathiStatusPanel{width:288px;border-radius:18px;background:rgba(255,255,255,.97);backdrop-filter:blur(8px);padding:10px 12px 12px}
    #saathiStatusPanel .sc-dot{font-style:normal;flex:0 0 auto;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#3ccf91,#1f9d63);color:#fff;font-size:12px;font-weight:800;box-shadow:0 4px 10px -4px rgba(31,157,99,.7)}
    #saathiStatusPanel .sc-dot.bad{background:linear-gradient(135deg,#f08376,#d0493a)}
    #saathiStatusPanel .sc-who{margin-top:8px;display:flex;flex-direction:column;gap:1px}
    #saathiStatusPanel .sc-who b{font-size:13px;color:#1d2746;word-break:break-word}
    #saathiStatusPanel .sc-who .sc-ref{margin:0}
    #saathiStatusPanel .sc-key{margin-top:8px;border-radius:12px;font-size:13.5px}
    #saathiStatusPanel .sc-more summary{color:#8a96b5}
    #saathiStatusPanel .sc-wa{flex:0 0 34px;display:flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid #cdeedd;background:#f1fbf6;border-radius:9px;font-size:13px}
    #saathiStatusPanel .sc-next{margin-top:7px;text-align:center;font-size:10.5px;color:#8a96b5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #saathiStatusPanel .sc-sum{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:6px;font-size:10.5px;font-weight:700;color:#47536f}
    #saathiStatusPanel .sc-sum span{background:#f0f3fa;border-radius:99px;padding:2px 8px}
    #saathiStatusPanel .sc-row{margin-top:9px}
  `;



  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    if (!document.getElementById("saathiStatusPanelStyle")) {
      const st = document.createElement("style");
      st.id = "saathiStatusPanelStyle";
      st.textContent = PANEL_CSS;
      document.head.appendChild(st);
    }
    panel = document.createElement("div");
    panel.id = "saathiStatusPanel";
    document.body.appendChild(panel);
    return panel;
  }
  function removePanel() { if (panel) { panel.remove(); panel = null; } lastSig = ""; }

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, onClick, cls) { const b = el("button", cls || "", label); b.type = "button"; b.addEventListener("click", onClick); return b; }

  let minimized = false;
  try { minimized = localStorage.getItem("saathiStatusPanelMin") === "1"; } catch (e) { /* ignore */ }
  function addMin(top) {
    const m = btn(minimized ? "▢" : "–", () => {
      minimized = !minimized;
      try { localStorage.setItem("saathiStatusPanelMin", minimized ? "1" : "0"); } catch (e) { /* ignore */ }
      if (panel) panel.classList.toggle("min", minimized);
      m.textContent = minimized ? "▢" : "–";
    }, "sc-min");
    m.title = "Chhota / bada";
    top.appendChild(m);
    if (panel) panel.classList.toggle("min", minimized);
  }
  const STEP_NAMES = [["step1", "1 Ref+Date"], ["docs", "2 Docs"], ["names", "3 Naam"], ["result", "Status"]];

  function renderPanel(job, st, rec, hint) {
    const p = ensurePanel();
    const total = job.records.length;
    const done = job.records.filter((r) => r.status === "done" || r.status === "failed").length;
    p.innerHTML = "";
    const top = el("div", "sc-top");
    top.appendChild(el("div", "sc-title", "🔎 Status check"));
    top.appendChild(el("div", "sc-count", `${done}/${total}`));
    addMin(top);
    p.className = minimized ? "min" : "";
    p.appendChild(top);
    const bar = el("div", "sc-bar"), fill = el("div", "sc-fill");
    fill.style.width = (total ? Math.round(done / total * 100) : 0) + "%";
    bar.appendChild(fill); p.appendChild(bar);

    if (rec) {
      const card = el("div", "sc-card");
      card.appendChild(el("div", "sc-name", rec.name || rec.ref));
      card.appendChild(el("div", "sc-ref", `${rec.ref}  ·  ${Job.toPortalDate(rec.date) || "date ?"}  ·  #${job.idx + 1} of ${total}`));
      const steps = el("div", "sc-steps");
      const order = STEP_NAMES.map((s) => s[0]);
      STEP_NAMES.forEach(([k, label]) => {
        const c = el("div", "sc-st" + (k === st ? " on" : order.indexOf(k) < order.indexOf(st) ? " ok" : ""), label);
        steps.appendChild(c);
      });
      card.appendChild(steps);
      p.appendChild(card);
      if (hint) p.appendChild(el("div", "sc-hint", hint));
      const row = el("div", "sc-row");
      row.appendChild(btn("⏭ Skip", () => Job.finish(rec.id, "skipped")));
      row.appendChild(btn("⏹ Stop", () => Job.update((j) => { j.running = false; }), "sc-stop"));
      p.appendChild(row);
    } else {
      p.appendChild(el("div", "sc-hint", "Koi pending record nahi."));
      const row = el("div", "sc-row");
      row.appendChild(btn("Band karo", () => Job.update((j) => { j.running = false; }), "sc-stop"));
      p.appendChild(row);
    }
  }

  /** The one line that matters ("Certificate Delivered") out of the portal's status text. */
  function keyLine(text) {
    const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    for (const l of lines) { const m = l.match(/(?:current\s*status|status|स्थिति)\s*[|:\-]\s*(.+)$/i); if (m && m[1].trim()) return m[1].trim(); }
    return lines.length ? lines[lines.length - 1] : "";
  }

  function renderResult() {
    const p = ensurePanel();
    p.innerHTML = "";
    const bad = shown.result.kind === "error";
    p.className = (bad ? "sc-warn" : "sc-done") + (minimized ? " min" : "");
    const top = el("div", "sc-top");
    const dot = el("i", "sc-dot" + (bad ? " bad" : ""), bad ? "!" : "✓");
    top.appendChild(dot);
    top.appendChild(el("div", "sc-title", bad ? "Check hua · details galat lagti hain" : "Status check ho gaya"));
    top.appendChild(el("div", "sc-count", `${shown.done}/${shown.total}`));
    addMin(top);
    p.appendChild(top);
    const who = el("div", "sc-who");
    who.appendChild(el("b", "", shown.rec.name || shown.rec.ref));
    who.appendChild(el("span", "sc-ref", shown.rec.ref));
    p.appendChild(who);
    const key = keyLine(shown.result.text);
    p.appendChild(el("div", "sc-key k-" + shown.result.kind, key || shown.result.text));
    if (shown.result.changed) p.appendChild(el("div", "sc-hint", "🔔 Status badla hai — pehle: " + keyLine(shown.result.prevText).slice(0, 80)));
    if (shown.result.text && shown.result.text.trim() !== key) {
      const more = el("details", "sc-more");
      more.appendChild(el("summary", "", "Poori detail"));
      more.appendChild(el("div", "sc-res", shown.result.text));
      p.appendChild(more);
    }
    const row = el("div", "sc-row");
    const cp = btn("📋 Copy", () => {
      try { navigator.clipboard.writeText(`${shown.rec.name || ""} | ${shown.rec.ref} | ${key}`); cp.textContent = "✓ Copy hua"; setTimeout(() => { cp.textContent = "📋 Copy"; }, 1400); } catch (e) { /* ignore */ }
    });
    row.appendChild(cp);
    const mob = String(shown.rec.mobile || "").replace(/\D/g, "").slice(-10);
    if (mob.length === 10) {
      const wa = el("a", "sc-wa", "💬");
      wa.href = "https://wa.me/91" + mob + "?text=" + encodeURIComponent(`${shown.rec.name || "Aapka"} — application ${shown.rec.ref}: ${key}`);
      wa.target = "_blank"; wa.rel = "noopener"; wa.title = "WhatsApp par status bhejo";
      row.appendChild(wa);
    }
    if (shown.hasMore) row.appendChild(btn("Agla →", goNext, "sc-ok"));
    row.appendChild(btn("✕", () => { dismissed = true; shown = null; removePanel(); }, "sc-x"));
    p.appendChild(row);
    if (shown.hasMore && shown.next) p.appendChild(el("div", "sc-next", "Agla: " + shown.next + "  ·  Alt+N"));
    if (!shown.hasMore) {
      const sum = el("div", "sc-sum");
      [["🟢", shown.ready, "ready"], ["🟡", shown.pending, "baaki"], ["🔴", shown.bad, "fail"], ["🔔", shown.changed, "badla"]].forEach(([ic, n, l]) => { if (n) sum.appendChild(el("span", "", `${ic} ${n} ${l}`)); });
      p.appendChild(el("div", "sc-ok-line", "🎉 Sab record check ho gaye"));
      if (sum.childNodes.length) p.appendChild(sum);
    }
  }
  const renderNow = () => { if (shown) renderResult(); else removePanel(); };

  document.addEventListener("keydown", async (e) => {
    if (!e.altKey || !/^[ns]$/i.test(e.key)) return;
    if (shown && e.key.toLowerCase() === "n") { e.preventDefault(); goNext(); return; }
    const job = await Job.get();
    const rec = Job.current(job);
    if (!job.running || !rec || !panel) return;
    if (e.key.toLowerCase() === "s") { e.preventDefault(); Job.finish(rec.id, "skipped"); }
  }, true);

  // ---------- captcha box ----------

  function wireCaptcha() {
    const cap = find.captcha();
    if (!cap || cap.dataset.saathiStatusWired) return;
    cap.dataset.saathiStatusWired = "1";
    const go = async () => {
      const j = await Job.get();
      const rec = Job.current(j);
      if (j.running && rec && j.autoSubmit && cap.value.trim().length >= CAPTCHA_LEN) submitStep1(rec);
    };
    cap.addEventListener("input", go);
    cap.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      const j = await Job.get();
      const rec = Job.current(j);
      if (j.running && rec && cap.value.trim().length >= CAPTCHA_LEN) { e.preventDefault(); submitStep1(rec); }
    });
  }

  // ---------- sound ----------
  let audio = null;
  function beep(times, high) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < times; i++) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = "sine"; o.frequency.value = high ? 988 : 740;
        g.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.2);
        g.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + i * 0.2 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.2 + 0.16);
        o.connect(g); g.connect(audio.destination);
        o.start(audio.currentTime + i * 0.2); o.stop(audio.currentTime + i * 0.2 + 0.18);
      }
    } catch (e) { /* no audio — skip */ }
  }
  let lastDone = null;
  function maybeBeep(job) {
    const done = job.records.filter((r) => r.status === "done" || r.status === "failed").length;
    if (lastDone !== null && done > lastDone && job.sound !== false) {
      const finished = !job.records.some((r) => r.status === "pending");
      beep(finished ? 2 : 1, finished);
    }
    lastDone = done;
  }

  // ---------- portal error page / opening the status page ----------
  // The Track Application page only opens when it is reached FROM the portal
  // (opened directly it shows "FOLLOWING EXCEPTION OCCURRED ..."). So:
  //  * on the portal home page the "आवेदन की स्थिति देखें" link is clicked for
  //    the operator; if the browser blocks that pop-up, the link is
  //    highlighted with a banner — ONE click from the operator opens it;
  //  * on an error page the extension goes back to the home page and tries again.

  let homeTried = false;
  let banner = null;
  let flowSeenSent = false;

  const getStore = (key) => new Promise((r) => chrome.storage.local.get([key], (res) => r(res && res[key])));

  function statusLink() {
    const re = /आवेदन\s*की\s*स्थिति|application\s*status|track\s*(?:your\s*)?application/i;
    const cands = Array.from(document.querySelectorAll("a, button, li, span, div, p, h3, h4")).filter((e) => {
      if (inPanel(e) || e === banner || (banner && banner.contains(e)) || !shownEl(e)) return false;
      const t = txt(e);
      return t.length < 45 && re.test(t) && !Array.from(e.children).some((c) => re.test(txt(c)));
    });
    const clickable = (e) => e.closest("a, button, [onclick]");
    cands.sort((x, y) => (clickable(y) ? 1 : 0) - (clickable(x) ? 1 : 0));
    const hit = cands[0];
    return hit ? (clickable(hit) || hit) : null;
  }

  function removeBanner() {
    if (banner) { banner.remove(); banner = null; }
    document.querySelectorAll("[data-saathi-glow]").forEach((e) => { e.style.outline = ""; e.style.boxShadow = ""; e.removeAttribute("data-saathi-glow"); });
  }

  function showBanner(msg, link) {
    if (!banner || !document.body.contains(banner)) {
      banner = document.createElement("div");
      banner.id = "saathiStatusPanel";                     // same id => ignored by the finders above
      banner.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:min(92vw,460px);padding:11px 16px;border-radius:14px;background:#171f45;color:#fff;font:700 13px/1.4 Arial,sans-serif;box-shadow:0 14px 34px -10px rgba(0,0,0,.6);text-align:center;border:2px solid #f2c76e";
      document.body.appendChild(banner);
    }
    banner.textContent = msg;
    if (link) {
      link.setAttribute("data-saathi-glow", "1");
      link.style.outline = "3px solid #f2c76e"; link.style.boxShadow = "0 0 0 6px rgba(242,199,110,.45)";
      try { link.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { /* ignore */ }
    }
  }

  /** Portal home (or any non-flow portal page): open the status link for the operator. */
  async function homeAssist(job) {
    if (!job.running) { removeBanner(); return; }
    const want = await getStore(Job.WANT_KEY);
    const seen = await getStore(Job.SEEN_KEY);
    if (!want || Date.now() - want.at > 180000 || (seen && seen > want.at)) { removeBanner(); homeTried = false; return; }
    const link = statusLink();
    if (!link) { showBanner("Portal par “आवेदन की स्थिति देखें” link khojiye aur us par click kijiye.", null); return; }
    if (!homeTried) { homeTried = true; try { link.click(); } catch (e) { /* ignore */ } }
    showBanner("👆 “आवेदन की स्थिति देखें” par ek click karein — baaki sab auto hai (pop-up block ho gaya ho to allow karein).", link);
  }

  function renderProblem(job) {
    const p = ensurePanel();
    p.innerHTML = "";
    p.appendChild(el("div", "sc-title", "⚠️ Portal ne error diya"));
    p.appendChild(el("div", "sc-hint", "Ye page seedhe kholne par portal error deta hai. Portal home se “आवेदन की स्थिति देखें” link khol rahe hain…"));
    const row = el("div", "sc-row");
    row.appendChild(btn("🏠 Home se kholo", () => reopenFromHome(true), "sc-ok"));
    row.appendChild(btn("⏹ Stop", () => Job.update((j) => { j.running = false; }), "sc-stop"));
    p.appendChild(row);
  }

  async function reopenFromHome(force) {
    const prev = (await getStore(Job.RECOVER_KEY)) || { n: 0, at: 0 };
    const n = Date.now() - prev.at < 120000 ? prev.n + 1 : 1;
    if (!force && n > 2) return;
    await new Promise((r) => chrome.storage.local.set({ [Job.RECOVER_KEY]: { n, at: Date.now() } }, r));
    chrome.runtime.sendMessage({ type: "STATUS_OPEN" }, () => { void chrome.runtime.lastError; });
    setTimeout(() => { try { window.close(); } catch (e) { /* not script-opened: stays */ } }, 400);
  }

  // ---------- main ----------

  async function handle() {
    const job = await Job.get();
    maybeBeep(job);

    if (shown) { if (!panel || !document.body.contains(panel)) renderResult(); return; }

    const st = stage();
    const flowPage = Job.isFlowPath(location.pathname);

    // Result page reloaded (F5) or opened again: show the saved status instead of a blank page.
    if (!dismissed && flowPage && st !== "step1" && st !== "docs" && job.phase === "result" && job.phaseRec) {
      const done = job.records.find((r) => r.id === job.phaseRec && r.result);
      if (done) { shown = { rec: Object.assign({}, done), result: done.result, hasMore: Job.nextPendingIndex(job, 0) >= 0 }; renderResult(); return; }
    }
    if (!job.running) { removePanel(); filledFor = null; namesFor = null; return; }
    if (flowPage && !flowSeenSent) { flowSeenSent = true; chrome.storage.local.set({ [Job.SEEN_KEY]: Date.now() }); }
    if (!flowPage && st === "other") { await homeAssist(job); return; }
    removeBanner();

    // The portal's exception page is never a "status": rebuild the way in (home -> link) instead.
    let bodyText = "";
    try { bodyText = document.body ? document.body.innerText : ""; } catch (e) { /* ignore */ }
    if (st === "other" && Job.isExceptionText(bodyText)) {
      if (!panel || !document.body.contains(panel) || lastSig !== "problem") { renderProblem(job); lastSig = "problem"; }
      if (!broken) { broken = true; setTimeout(() => reopenFromHome(false), 1500); }
      return;
    }

    const rec = Job.current(job);

    // RESULT page = the page that opens after the names were submitted. Recognised by the stored
    // submit time (so it works even if the result page still shows the name boxes), either because
    // this page was loaded after that moment, or because this page changed away from the names form.
    if (job.namesAt && rec && rec.id === job.phaseRec && st !== "step1" && st !== "docs" &&
        (startedAt > job.namesAt || st !== "names") && Date.now() - job.namesAt > 600) {
      await sleep(500);                                  // let the page finish rendering
      await captureResult(rec);
      return;
    }
    // same idea when the docs step was answered "No" — no names step follows
    const formLike = textInputs().length > 0 || !!submitBtn();
    if (st === "other" && !formLike && job.phase === "docs" && job.phaseRec && rec && rec.id === job.phaseRec && !job.namesAt) {
      const ready = await until(() => stage() === "other", 600);
      if (ready && Date.now() - startedAt > 1200) await captureResult(rec);
      return;
    }

    let hint = "";
    if (st === "step1") hint = (captchaMisses ? `🔄 Naya captcha (${captchaMisses} baar galat) — ` : "") + (job.autoSubmit ? "⌨️ Captcha type karo — Submit khud dabega" : "⌨️ Captcha type karke Enter dabao");
    else if (st === "docs") hint = "Documents: Yes → Submit (auto)";
    else if (st === "names") hint = "Naam bhar rahe hain → Submit (auto)";
    else hint = "Page pehchana nahi gaya — haath se aage badhein";

    const sig = JSON.stringify([job.idx, job.autoSubmit, job.records.map((r) => r.status), st, hint, rec && [rec.name, rec.father, rec.mother, rec.date]]);
    if (!panel || !document.body.contains(panel) || sig !== lastSig) { renderPanel(job, st === "other" ? "step1" : st, rec, hint); lastSig = sig; }
    if (!rec) return;

    if (st === "step1") {
      if (job.phase !== "step1" || job.phaseRec !== rec.id) await Job.update((j) => { j.phase = "step1"; j.phaseRec = rec.id; j.namesAt = null; });
      wireCaptcha();
      if (filledFor !== rec.id) await fillStep1(rec);
    } else if (st === "docs") {
      await doDocs();
    } else if (st === "names") {
      if (job.phase !== "names" || job.phaseRec !== rec.id) await Job.update((j) => { j.phase = "names"; j.phaseRec = rec.id; j.namesAt = null; });
      // mother/father box missing from the page is fine; only boxes that exist are handled
      await doNames(rec);
      const left = [find.applicant(), find.father(), find.mother()].filter((x) => x && !x.value.trim()).length;
      if (left) {
        const h = "✍️ Khaali naam haath se likhein, phir Submit";
        if (hint !== h) { renderPanel(job, "names", rec, h); lastSig = ""; }
      }
    }
  }

  async function tick() {
    if (busy) { rerun = true; return; }
    busy = true;
    try { await handle(); } catch (e) { console.warn("[Digital Saathi] status step failed", e); }
    busy = false;
    if (rerun) { rerun = false; tick(); }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[Job.KEY]) tick();
  });
  setInterval(tick, 1000);
  tick();
})();
