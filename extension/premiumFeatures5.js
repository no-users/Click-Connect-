/**
 * premiumFeatures5.js — batch 5 (new, distinct features)
 *  1. Aadhaar number checksum validation (Verhoeff algorithm) — flags a
 *     likely OCR misread instead of silently filling a wrong number.
 *  2. Undo Delete — snapshots the whole storage right before a delete
 *     click, offers to restore it for a few seconds after.
 *  3. Copy as Text — puts a plain-text summary of the current form on
 *     the clipboard (for SMS/Notes/anything other than WhatsApp image).
 *  4. Print Monthly Report — a printable summary of this month's usage
 *     and fee totals (built from the batch-2/4 stats already tracked).
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function toast(message, kind = "info", actionLabel, onAction) { return window.saathiToast(message, kind, actionLabel, onAction); }
  function fieldVal(id) { const el = $(id); return el ? el.value.trim() : ""; }

  // ---------- 1. Aadhaar checksum (Verhoeff algorithm) ----------
  const VERHOEFF_D = [
    [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]
  ];
  const VERHOEFF_P = [
    [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]
  ];
  function verhoeffValid(numStr) {
    let c = 0;
    const digits = numStr.split("").reverse().map(Number);
    for (let i = 0; i < digits.length; i++) {
      c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
    }
    return c === 0;
  }

  function scanAadhaarInReview() {
    const container = $("docReviewContainer");
    if (!container) return;
    // Look across the raw-text previews (batch-3 feature) for 12-digit
    // Aadhaar-shaped numbers and validate them.
    const rawBlocks = container.querySelectorAll(".doc-rawtext-item pre");
    const found = [];
    rawBlocks.forEach((pre) => {
      const matches = pre.textContent.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/g) || [];
      matches.forEach((m) => {
        const digits = m.replace(/\s/g, "");
        if (digits.length === 12) found.push({ digits, valid: verhoeffValid(digits) });
      });
    });
    const invalid = found.filter((f) => !f.valid);
    if (invalid.length) {
      let warn = $("saathiAadhaarWarning");
      if (!warn) {
        warn = document.createElement("div");
        warn.id = "saathiAadhaarWarning";
        warn.className = "saathi-aadhaar-warn";
        container.insertBefore(warn, container.firstChild);
      }
      warn.textContent = `⚠️ ${invalid.length} Aadhaar-jaisa number mila jiska checksum sahi nahi hai (${invalid.map(i => i.digits).join(", ")}) — OCR misread ho sakta hai, original document se ek baar milaan kar lein.`;
    }
  }

  function initAadhaarCheck() {
    const extractBtn = $("extractBtn");
    if (!extractBtn) return;
    extractBtn.addEventListener("click", () => {
      setTimeout(scanAadhaarInReview, 1500); // after review table renders
    });
  }

  // ---------- 2. Undo Delete ----------
  let undoSnapshot = null;
  function initUndoDelete() {
    const list = $("savedList");
    if (!list) return;
    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".saathi-btn-delete") ||
        (e.target.closest("button") && /delete/i.test(e.target.closest("button").textContent) ? e.target.closest("button") : null);
      if (!btn) return;
      // Capture BEFORE the native confirm()/actual delete runs (this
      // listener fires in the same tick, ahead of popup.js's own handler
      // only if registered first — as a safety net we snapshot on every
      // delete-labelled click attempt, which is harmless even if the
      // user cancels the confirm dialog).
      chrome.storage.local.get(null, (data) => {
        undoSnapshot = JSON.parse(JSON.stringify(data));
      });
      setTimeout(() => {
        toast("Profile delete ho gayi.", "warn", "Undo", () => {
          if (!undoSnapshot) return;
          chrome.storage.local.set(undoSnapshot, () => {
            toast("Wapas restore ho gaya.", "success");
            const savedTabBtn = $("tab-saved");
            if (savedTabBtn) savedTabBtn.click();
            undoSnapshot = null;
          });
        });
      }, 400);
    }, true);
  }


  // ---------- 4. Print Monthly Report ----------
  // ---------- 3. Copy as Text ----------
  function formSummaryText() {
    const addr = ["village", "gram", "postoffice", "policeStation", "district", "pin"].map(fieldVal).filter(Boolean).join(", ");
    const gender = $("female") && $("female").checked ? "Female" : $("male") && $("male").checked ? "Male" : "";
    const lines = [
      ["Naam", fieldVal("name")], ["Pita", fieldVal("fathername")], ["Mata", fieldVal("mothername")], ["Pati", fieldVal("husbandname")],
      ["Gender", gender], ["Mobile", fieldVal("mobile")], ["Email", fieldVal("email")], ["Pata", addr], ["Purpose", fieldVal("purpose")],
      ["Profession", fieldVal("profession")],
    ].filter((r) => r[1]);
    return lines.map((r) => r[0] + ": " + r[1]).join("\n");
  }
  function initCopyAsText() {
    const form = $("dataForm");
    const host = document.querySelector(".form-actions") || form;
    if (!host || $("saathiCopyTextBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "saathiCopyTextBtn"; btn.className = "btn"; btn.textContent = "📋 Copy as Text";
    btn.addEventListener("click", async () => {
      const text = formSummaryText();
      if (!text) return toast("Copy karne ke liye form me kuch bharein.", "warn");
      try { await navigator.clipboard.writeText(text); toast("Text copy ho gaya.", "success"); }
      catch (e) {
        const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy"); ta.remove();
        toast(ok ? "Text copy ho gaya." : "Copy nahi ho paya.", ok ? "success" : "warn");
      }
    });
    host.appendChild(btn);
  }
  window.saathiVerhoeffValid = verhoeffValid;
  window.saathiFormSummaryText = formSummaryText;

  function initMonthlyReport() {
    const contentSaved = $("content-saved");
    if (!contentSaved || $("saathiReportBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "saathiReportBtn";
    btn.className = "saathi-tool-btn saathi-tool-btn-accent";
    btn.innerHTML = `<span class="saathi-btn-icon">🖨️</span><span class="saathi-btn-label">Print Monthly Report</span>`;
    const drawer = $("saathiToolsDrawer");
    const grid = drawer ? drawer.querySelector(".saathi-tools-grid") : null;
    if (grid) grid.appendChild(btn); else contentSaved.insertBefore(btn, contentSaved.firstChild);

    btn.addEventListener("click", () => {
      chrome.storage.local.get(["saathiUsageStats", "saathiTotalCount"], (res) => {
        const stats = res.saathiUsageStats || {};
        const now = new Date();
        const mKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const monthCount = stats[mKey + "-month"] || 0;
        const monthFee = stats[mKey + "-month-fee"] || 0;
        const total = res.saathiTotalCount || 0;
        const monthName = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

        const win = window.open("", "_blank", "width=420,height=560");
        if (!win) { toast("Popup blocked — report window allow karo.", "warn"); return; }
        win.document.write(`
          <html><head><title>Monthly Report</title><style>
            body{font-family:sans-serif;padding:26px;color:#1e293b;}
            h2{color:#2f6fb8;margin-bottom:0;} .sub{color:#64748b;font-size:12px;margin-bottom:20px;}
            .stat{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eee;font-size:15px;}
            .stat b{color:#0f172a;}
          </style></head><body>
            <h2>Digital Saathi</h2>
            <div class="sub">Monthly Report — ${monthName}</div>
            <div class="stat"><span>Forms filled this month</span><b>${monthCount}</b></div>
            <div class="stat"><span>Fee collected this month</span><b>Rs. ${monthFee}</b></div>
            <div class="stat"><span>Total forms filled (all time)</span><b>${total}</b></div>
            <div style="margin-top:24px;font-size:10px;color:#94a3b8;">Generated via Digital Saathi</div>
          </body></html>
        `);
        win.document.close();
        win.focus();
        win.print();
      });
    });
  }

  function init() {
    [initAadhaarCheck, initUndoDelete, initCopyAsText, initMonthlyReport]
      .forEach((fn) => { try { fn(); } catch (e) { console.warn("[premium5] " + fn.name + " failed", e); } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
