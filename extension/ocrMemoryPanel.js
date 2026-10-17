/**
 * ocrMemoryPanel.js
 * ------------------------------------------------------------
 * "🧠 OCR ne kya seekha" — shows the corrections the OCR has learned from
 * the operator (see ocrLexicon.js) at the bottom of the Documents tab, so
 * they can be reviewed and deleted. Nothing is learned silently from a
 * big change: only small, OCR-sized fixes to a name are remembered.
 * ------------------------------------------------------------
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function render() {
    const box = $("ocrMemoryBody");
    if (!box || typeof OcrLexicon === "undefined") return;
    const { ocr, translit, records } = OcrLexicon.list();
    const rows = [
      ...Object.entries(ocr).map(([k, v]) => ({ kind: "ocr", k, v, tag: "OCR galti" })),
      ...Object.entries(translit).map(([k, v]) => ({ kind: "translit", k, v, tag: "Hindi → English" })),
      ...Object.entries(records || {}).map(([k, m]) => ({ kind: "rec", k, v: ["name", "father", "mother", "mobile", "date", "ref"].filter((f) => m[f]).map((f) => m[f]).join(" · "), tag: "Receipt yaad" })),
    ];
    $("ocrMemoryCount").textContent = rows.length ? `(${rows.length})` : "";
    box.innerHTML = rows.length
      ? rows.map((r) => `<div class="om-row"><span class="om-tag">${r.tag}</span><span class="om-from">${esc(r.k)}</span><span class="om-arrow">→</span><b class="om-to">${esc(r.v)}</b>
          <button type="button" class="om-x" data-kind="${r.kind}" data-k="${esc(r.k)}" title="Bhool jao">✕</button></div>`).join("") +
        `<button type="button" id="omClear" class="om-clear">🗑 Sab bhool jao</button>`
      : `<div class="om-empty">Abhi kuch nahi seekha.</div>`;
    box.querySelectorAll(".om-x").forEach((b) => b.addEventListener("click", () => { OcrLexicon.forget(b.dataset.kind, b.dataset.k); setTimeout(render, 80); }));
    const clr = $("omClear");
    if (clr) clr.addEventListener("click", () => { if (window.confirm("OCR ne jo seekha hai wo sab hata dein?")) { OcrLexicon.clearAll(); setTimeout(render, 80); } });
  }

  function init() {
    const docs = $("content-docs");
    if (!docs || $("ocrMemory") || typeof OcrLexicon === "undefined") return;
    const d = document.createElement("details");
    d.id = "ocrMemory";
    d.className = "om-card";
    d.innerHTML = `<summary>🧠 OCR Remember <small id="ocrMemoryCount"></small></summary><div id="ocrMemoryBody"></div>`;
    docs.appendChild(d);
    d.addEventListener("toggle", () => { if (d.open) OcrLexicon.load().then(render); });
    try { chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && (ch.saathiOcrLearned || ch.saathiTranslitLearned || ch.saathiOcrRecords)) setTimeout(render, 80); }); } catch (e) { /* ignore */ }
    OcrLexicon.load().then(render);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
