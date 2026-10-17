/**
 * certDownloadFill.js  (content script — portal page)
 * ------------------------------------------------------------
 * On the portal's "Download Certificate" page: fills Service /
 * Application Ref. Number / Applicant Name from the current record of
 * the Certificate Download job, puts the cursor in the Captcha box and
 * waits for the OPERATOR to type the captcha (it is never read or
 * solved automatically). As soon as the captcha is typed, Download is
 * pressed. When the file has finished downloading, the background
 * worker marks the record done and the NEXT record is filled here.
 *
 * Only active while a job is running — does nothing on any other page.
 * ------------------------------------------------------------
 */
(function () {
  if (typeof SaathiCertJob === "undefined") return;

  const CAPTCHA_LEN = 6;
  let filledFor = null;      // record id the form currently holds
  let submitting = false;
  let panel = null;
  let lastSig = "";
  let missCount = 0;

  const txt = (el) => (el.value || el.textContent || "").replace(/\s+/g, " ").trim();

  // ---------- locating fields (by label text, so it survives id changes) ----------

  function controlForLabel(re) {
    const labels = Array.from(document.querySelectorAll("label, .form-label, b, strong"));
    for (const l of labels) {
      if (!re.test(txt(l))) continue;
      if (l.htmlFor) { const t = document.getElementById(l.htmlFor); if (t) return t; }
      const inside = l.querySelector("input, select"); if (inside) return inside;
      let n = l.nextElementSibling;
      for (let i = 0; n && i < 3; i++, n = n.nextElementSibling) {
        if (/^(INPUT|SELECT)$/.test(n.tagName)) return n;
        const c = n.querySelector && n.querySelector("input, select");
        if (c) return c;
      }
      const c = l.parentElement && l.parentElement.querySelector("input, select");
      if (c) return c;
    }
    return null;
  }

  const visible = (el) => !!el && el.offsetParent !== null && !el.disabled && el.type !== "hidden";
  const textInputs = () => Array.from(document.querySelectorAll("input")).filter(i => visible(i) && /^(text|search|tel|number|)$/i.test(i.type || ""));

  const find = {
    service: () => controlForLabel(/select\s*services?|service/i) || Array.from(document.querySelectorAll("select")).find(s => Array.from(s.options).some(o => /rtps/i.test(o.text))),
    captcha: () => textInputs().find(i => /captcha/i.test([i.id, i.name, i.placeholder, i.className].join(" "))),
    ref: () => controlForLabel(/application\s*ref|reference\s*(?:no|number)|आवेदन\s*(?:संख्या|संदर्भ)/i)
      || document.querySelector('input[placeholder*="BICCO" i], input[placeholder*="Ref" i], input[id*="ref" i], input[name*="ref" i]')
      // last resort: first text box that is neither the captcha nor the name field
      || textInputs().find(i => i !== find.captcha() && i !== controlForLabel(/applicant\s*name|आवेदक/i)),
    name: () => controlForLabel(/applicant\s*name|name\s*\(?in\s*english|आवेदक/i)
      || document.querySelector('input[placeholder*="Abc Kumar" i], input[id*="name" i], input[name*="name" i]'),
    button: (re) => Array.from(document.querySelectorAll("button, input[type=submit], input[type=button], a.btn, a[role=button]")).find(b => re.test(txt(b))),
  };

  // The Status Check section (certStatusFill.js) owns the Track Application pages.
  const isStatusFlow = () => typeof SaathiStatusJob !== "undefined" && SaathiStatusJob.isFlowPath(location.pathname);
  function isCertPage() { return !isStatusFlow() && !!(find.ref() && find.name() && find.captcha()); }

  // ---------- writing values ----------

  function setValue(el, value) {
    if (!el) return;
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillRecord(rec, isNext) {
    const svc = find.service();
    if (svc && svc.tagName === "SELECT") {
      const opt = Array.from(svc.options).find(o => /rtps/i.test(o.text) || /rtps/i.test(o.value));
      if (opt) setValue(svc, opt.value);
    }
    setValue(find.ref(), rec.ref);
    setValue(find.name(), rec.name);
    const cap = find.captcha();
    if (cap) { setValue(cap, ""); }
    // A fresh captcha for the next certificate (the old one may be consumed).
    if (isNext) { const rb = find.button(/^refresh$/i); if (rb) rb.click(); }
    if (cap) cap.focus();
    filledFor = rec.id;
    submitting = false;
  }

  // ---------- floating control panel ----------

  const PANEL_CSS = `
    #saathiCertPanel{position:fixed;top:14px;right:14px;z-index:2147483647;width:272px;max-width:calc(100vw - 28px);box-sizing:border-box;
      font:12px/1.45 "Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif;color:#1d2746;
      background:#fff;border:1px solid #e3e8f4;border-radius:16px;padding:10px 12px 12px;
      box-shadow:0 18px 40px -16px rgba(33,52,110,.35),0 2px 6px rgba(33,52,110,.08)}
    #saathiCertPanel *{box-sizing:border-box}
    #saathiCertPanel .sc-top{display:flex;align-items:center;gap:6px}
    #saathiCertPanel .sc-title{font-weight:800;font-size:12.5px;flex:1}
    #saathiCertPanel .sc-count{font-weight:800;color:#3d5bd9;font-size:11px;background:#eef2ff;border-radius:99px;padding:1px 8px}
    #saathiCertPanel .sc-min{flex:0 0 auto;width:22px;height:22px;padding:0;border-radius:7px;background:#f0f3fa;color:#5a6788;font-size:13px;line-height:1}
    #saathiCertPanel.min > :not(.sc-top){display:none}
    #saathiCertPanel .sc-bar{height:4px;border-radius:99px;background:#e9edf7;overflow:hidden;margin:8px 0 9px}
    #saathiCertPanel .sc-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#4f6cf0,#2fb67f);transition:width .4s ease}
    #saathiCertPanel .sc-card{background:#f6f8fd;border:1px solid #e8ecf6;border-radius:11px;padding:7px 10px}
    #saathiCertPanel .sc-name{font-weight:800;font-size:13px;word-break:break-word}
    #saathiCertPanel .sc-ref{color:#6a7799;font-size:10.5px;margin-top:1px;word-break:break-all;font-family:Consolas,Menlo,monospace}
    #saathiCertPanel .sc-file{margin-top:5px;font-size:10.5px;color:#1c7a50;font-weight:700;word-break:break-all}
    #saathiCertPanel .sc-hint{margin-top:8px;font-size:11px;color:#8a5a00;background:#fff6e0;border-radius:8px;padding:5px 8px}
    #saathiCertPanel .sc-row{display:flex;gap:6px;margin-top:10px}
    #saathiCertPanel button{flex:1;border:1px solid #dfe5f3;border-radius:9px;padding:7px 6px;cursor:pointer;font-weight:700;font-size:11px;color:#32406a;background:#fff;font-family:inherit}
    #saathiCertPanel button:hover{background:#f3f6ff}
    #saathiCertPanel .sc-ok{background:linear-gradient(135deg,#4f6cf0,#3552d6);color:#fff;border-color:transparent}
    #saathiCertPanel .sc-stop{color:#b5402f}
  `;


  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    if (!document.getElementById("saathiCertPanelStyle")) {
      const st = document.createElement("style");
      st.id = "saathiCertPanelStyle";
      st.textContent = PANEL_CSS;
      document.head.appendChild(st);
    }
    panel = document.createElement("div");
    panel.id = "saathiCertPanel";
    document.body.appendChild(panel);
    return panel;
  }

  function removePanel() { if (panel) { panel.remove(); panel = null; } }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function btn(label, onClick, cls) {
    const b = el("button", cls || "", label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  let minimized = false;
  try { minimized = localStorage.getItem("saathiCertPanelMin") === "1"; } catch (e) { /* ignore */ }
  function renderPanel(job) {
    const p = ensurePanel();
    const total = job.records.length;
    const done = job.records.filter(r => r.status === "done").length;
    const rec = SaathiCertJob.current(job);
    p.innerHTML = "";

    const top = el("div", "sc-top");
    top.appendChild(el("div", "sc-title", rec ? "📥 Certificate download" : "✅ Sab ho gaya"));
    top.appendChild(el("div", "sc-count", `${done}/${total}`));
    const mb = btn(minimized ? "▢" : "–", () => {
      minimized = !minimized;
      try { localStorage.setItem("saathiCertPanelMin", minimized ? "1" : "0"); } catch (e) { /* ignore */ }
      p.classList.toggle("min", minimized); mb.textContent = minimized ? "▢" : "–";
    }, "sc-min");
    mb.title = "Chhota / bada";
    top.appendChild(mb);
    p.className = minimized ? "min" : "";
    p.appendChild(top);

    const bar = el("div", "sc-bar"); const fill = el("div", "sc-fill");
    fill.style.width = (total ? Math.round(done / total * 100) : 0) + "%";
    bar.appendChild(fill); p.appendChild(bar);

    if (rec) {
      const card = el("div", "sc-card");
      card.appendChild(el("div", "sc-name", rec.name));
      card.appendChild(el("div", "sc-ref", `${rec.ref}  ·  #${job.idx + 1} of ${total}`));
      card.appendChild(el("div", "sc-file", "💾 " + SaathiCertJob.fileNameFor(rec, job.settings).split("/").pop()));
      p.appendChild(card);
      p.appendChild(el("div", "sc-hint", job.autoSubmit ? "⌨️ Captcha type karo — Download khud dab jayega" : "⌨️ Captcha type karke Enter dabao"));
      const row = el("div", "sc-row");
      row.appendChild(btn("⏭ Skip", () => SaathiCertJob.finish(rec.id, "skipped")));
      row.appendChild(btn("✔ Next", () => SaathiCertJob.finish(rec.id, "done"), "sc-ok"));
      row.appendChild(btn("⏹ Stop", () => SaathiCertJob.update(j => { j.running = false; }), "sc-stop"));
      p.appendChild(row);
      p.appendChild(el("div", "sc-keys", "Alt+N  next  ·  Alt+S  skip"));
    } else {
      const row = el("div", "sc-row");
      row.appendChild(btn("Band karo", () => SaathiCertJob.update(j => { j.running = false; }), "sc-stop"));
      p.appendChild(row);
    }
  }

  // Keyboard shortcuts while a job runs: Alt+N = mark done & next, Alt+S = skip.
  document.addEventListener("keydown", async (e) => {
    if (!e.altKey || !/^[ns]$/i.test(e.key)) return;
    const job = await SaathiCertJob.get();
    const rec = SaathiCertJob.current(job);
    if (!job.running || !rec) return;
    e.preventDefault();
    SaathiCertJob.finish(rec.id, e.key.toLowerCase() === "n" ? "done" : "skipped");
  }, true);

  // ---------- submit ----------

  async function submit(rec) {
    if (submitting) return;
    const ref = find.ref(), name = find.name(), cap = find.captcha();
    if (!ref || !name || !cap || !cap.value.trim()) return;
    if (ref.value.trim() !== rec.ref) setValue(ref, rec.ref);   // never download for the wrong record
    if (name.value.trim() !== rec.name) setValue(name, rec.name);
    const download = find.button(/^download$/i);
    if (!download) return;
    submitting = true;
    const job = await SaathiCertJob.get();
    chrome.runtime.sendMessage({ type: "CERT_EXPECT_DOWNLOAD", recId: rec.id, filename: SaathiCertJob.fileNameFor(rec, job.settings) }, () => {
      void chrome.runtime.lastError;
      download.click();
      // Nothing downloaded after 6 s (the background worker clears "expect" when a download starts)
      // = the portal refused, usually a wrong captcha: fresh captcha, empty box, cursor back.
      setTimeout(() => {
        submitting = false;
        chrome.storage.local.get(["saathiCertExpect"], (res) => {
          const ex = res && res.saathiCertExpect;
          if (!ex || ex.recId !== rec.id) return;
          chrome.storage.local.remove("saathiCertExpect");
          const img = Array.from(document.querySelectorAll("img")).find((i) => /captcha/i.test([i.id, i.className, i.alt, i.src].join(" ")));
          if (img) img.src = img.src.split("?")[0] + "?id" + Date.now();
          const c = find.captcha();
          if (c) { setValue(c, ""); c.focus(); }
          missCount++; lastSig = "";
          sync();
        });
      }, 6000);
    });
  }

  function wireCaptcha(job) {
    const cap = find.captcha();
    if (!cap || cap.dataset.saathiCertWired) return;
    cap.dataset.saathiCertWired = "1";
    cap.addEventListener("input", async () => {
      const j = await SaathiCertJob.get();
      const rec = SaathiCertJob.current(j);
      if (j.running && rec && j.autoSubmit && cap.value.trim().length >= CAPTCHA_LEN) submit(rec);
    });
    cap.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      const j = await SaathiCertJob.get();
      const rec = SaathiCertJob.current(j);
      if (j.running && rec) { e.preventDefault(); submit(rec); }
    });
  }

  // ---------- sound ----------
  // The operator is usually looking at the captcha image, not the screen, so a
  // short beep tells them a certificate finished downloading (two beeps = all done).
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
    } catch (e) { /* no audio available — silently skip */ }
  }
  let lastDone = null;
  function maybeBeep(job) {
    const done = job.records.filter(r => r.status === "done").length;
    if (lastDone !== null && done > lastDone && job.settings.sound !== false) {
      const finished = !job.records.some(r => r.status === "pending");
      beep(finished ? 2 : 1, finished);
    }
    lastDone = done;
  }

  // ---------- main ----------

  async function sync() {
    const job = await SaathiCertJob.get();
    maybeBeep(job);
    if (!job.running) { removePanel(); filledFor = null; return; }
    if (!isCertPage()) return;               // not (yet) the Download Certificate form
    const rec = SaathiCertJob.current(job);
    // Re-render only when something visible changed (sync also runs on a timer).
    const sig = JSON.stringify([job.idx, job.autoSubmit, job.records.map(r => r.status)]);
    if (!panel || !document.body.contains(panel) || sig !== lastSig) { renderPanel(job); lastSig = sig; }
    wireCaptcha(job);
    if (rec && filledFor !== rec.id) fillRecord(rec, filledFor !== null);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SaathiCertJob.KEY]) sync();
  });

  // The form may render late — watch briefly, then settle.
  let tries = 0;
  const timer = setInterval(() => { sync(); if (++tries > 40) clearInterval(timer); }, 500);
  sync();
})();
