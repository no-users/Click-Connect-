/**
 * cmdk.js — Quick actions palette (Ctrl+K, or the ⌘ button)
 * ------------------------------------------------------------
 * Type a few letters (Hindi-English mix is fine: "cert", "dark",
 * "naya", "ocr", "rang") and press Enter. Every action simply CLICKS
 * an existing button, so it can never behave differently from the
 * normal UI.
 * ------------------------------------------------------------
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const click = (id) => { const e = $(id); if (e) e.click(); };

  /** Tab buttons are hidden behind the landing screen until a profile view is opened. */
  function ensureApp() {
    if (document.body.classList.contains("saathi-landing-active")) click("addNewRecord");
  }
  const goTab = (id) => () => { ensureApp(); setTimeout(() => click(id), 30); };
  const onCerts = (id) => () => { ensureApp(); setTimeout(() => { click("tab-certs"); setTimeout(() => click(id), 60); }, 30); };

  function actions() {
    const list = [
      { icon: "📝", label: "Form tab kholo", keys: "form fill bharo", run: goTab("tab-form") },
      { icon: "👤", label: "Profile tab (saved)", keys: "profile saved search khojo", run: goTab("tab-saved") },
      { icon: "📄", label: "Documents / OCR tab", keys: "documents ocr aadhaar upload", run: goTab("tab-docs") },
      { icon: "🗂️", label: "Doc Vault (customer ke documents)", keys: "vault documents doc upload enclosure customer file", run: goTab("tab-vault") },
      { icon: "📥", label: "Certificates download tab", keys: "certificate download receipt rtps", run: goTab("tab-certs") },
      { icon: "➕", label: "Naya profile banao", keys: "create new naya profile", run: () => click("addNewRecord") },
      { icon: "🌓", label: "Dark / Light theme badlo", keys: "theme dark light raat", run: () => click("themeToggleBtn") },
      { icon: "🎨", label: "Rang / look badlo", keys: "rang color accent appearance density compact", run: () => window.saathiOpenAppearance && window.saathiOpenAppearance() },
      { icon: "🌐", label: "Download Certificate page kholo", keys: "certificate page open link", run: onCerts("certOpen") },
      { icon: "🔍", label: "Receipts padho (OCR)", keys: "receipt read ocr padho", run: onCerts("certReadBtn") },
      { icon: "▶", label: "Certificate download start", keys: "start download certificate", run: onCerts("certStart") },
      { icon: "⏹", label: "Certificate download stop", keys: "stop band", run: onCerts("certStop") },
      { icon: "🔁", label: "Fail wale certificates dobara", keys: "retry fail dobara", run: onCerts("certRetry") },
      { icon: "📊", label: "Certificates ki CSV export", keys: "csv export excel list", run: onCerts("certCsv") },
      { icon: "❓", label: "Shortcuts dekho", keys: "help shortcut keys", run: () => window.saathiToast && window.saathiToast("Ctrl+K quick actions · portal page par: Alt+N next, Alt+S skip", "info") },
    ];
    (window.saathiPalettes || []).forEach(p => list.push({ icon: "●", label: "Rang: " + p.name, keys: "rang color accent " + p.id, color: p.color, run: () => window.saathiSetAccent(p.id) }));
    (window.saathiExtraActions || []).forEach((a) => list.push(a));   // other modules (Health Check...) register here
    return list;
  }

  let overlay, input, listEl, items = [], sel = 0;

  function build() {
    overlay = document.createElement("div");
    overlay.id = "cmdkOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="ck-box"><input id="cmdkInput" class="ck-input" placeholder="Kya karna hai? (cert, dark, naya, ocr, rang…)" autocomplete="off" spellcheck="false"><div id="cmdkList" class="ck-list"></div><div class="ck-foot"><span>↑↓ chunein</span><span>Enter chalao</span><span>Esc band</span></div></div>`;
    document.body.appendChild(overlay);
    input = $("cmdkInput"); listEl = $("cmdkList");
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    input.addEventListener("input", () => { sel = 0; render(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { sel = Math.min(sel + 1, items.length - 1); render(true); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); render(true); e.preventDefault(); }
      else if (e.key === "Enter") { run(sel); e.preventDefault(); }
      else if (e.key === "Escape") { close(); e.preventDefault(); }
    });
  }

  function render(keepScroll) {
    const q = input.value.trim().toLowerCase();
    const all = actions();
    items = !q ? all.filter(a => !a.color) : all.filter(a => q.split(/\s+/).every(w => (a.label + " " + a.keys).toLowerCase().includes(w)));
    listEl.innerHTML = items.length ? items.map((a, i) => `
      <button type="button" class="ck-item${i === sel ? " on" : ""}" data-i="${i}">
        <span class="ck-ico"${a.color ? ` style="color:${a.color}"` : ""}>${a.icon}</span><span class="ck-label">${a.label}</span>
      </button>`).join("") : `<div class="ck-empty">Kuch nahi mila — dusra shabd try karein</div>`;
    listEl.querySelectorAll(".ck-item").forEach(b => b.addEventListener("click", () => run(Number(b.dataset.i))));
    const on = listEl.querySelector(".ck-item.on");
    if (on && keepScroll) on.scrollIntoView({ block: "nearest" });
  }

  function run(i) { const a = items[i]; if (!a) return; close(); setTimeout(a.run, 20); }
  function open() { if (!overlay) build(); overlay.hidden = false; input.value = ""; sel = 0; render(); input.focus(); }
  function close() { if (overlay) overlay.hidden = true; }

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); overlay && !overlay.hidden ? close() : open(); }
    else if (e.key === "Escape" && overlay && !overlay.hidden) close();
    else if (e.key === "/" && !typing && !(overlay && !overlay.hidden)) { e.preventDefault(); open(); }
  });

  const hook = () => { const b = $("cmdkBtn"); if (b && !b.dataset.ck) { b.dataset.ck = "1"; b.addEventListener("click", open); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(hook, 0)); else setTimeout(hook, 0);
  setTimeout(hook, 400);
})();
