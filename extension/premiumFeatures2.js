/**
 * premiumFeatures2.js — batch 2 (additive, non-invasive, same pattern as before)
 *  1. "Same Address as Last" quick-copy button in the Form tab
 *  2. Printable receipt + WhatsApp share of the current form
 *  3. Fee ledger (optional amount prompt on save, daily/monthly totals)
 *  4. Follow-up reminders (optional date on save, due-soon toast)
 *  5. Milestone congratulation toasts (10 / 50 / 100 / 500 forms)
 *  6. 7-day usage bar chart on the Profile tab
 *  7. Bulk export of only the selected profiles
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function toast(message, kind = "info") { return window.saathiToast(message, kind); }
  function fieldVal(id) { const el = $(id); return el ? el.value.trim() : ""; }
  function setField(id, val) {
    const el = $(id);
    if (!el || !val) return;
    el.value = val;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const ADDRESS_FIELDS = ["state", "district", "anumandal", "prakhand", "gram", "village",
    "pin", "postoffice", "policeStation", "wardNo"];

  // ---------- 1. Same Address as Last ----------
  function captureLastAddress() {
    const data = {};
    ADDRESS_FIELDS.forEach((f) => { const v = fieldVal(f); if (v) data[f] = v; });
    if (Object.keys(data).length) chrome.storage.local.set({ saathiLastAddress: data });
  }

  function makeFormBtn(id, label) {
    const b = document.createElement("button");
    b.type = "button"; b.id = id; b.className = "btn"; b.textContent = label;
    return b;
  }
  function formActionsHost() { return document.querySelector(".form-actions") || $("dataForm"); }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function initSameAsLast() {
    const host = formActionsHost();
    if (!host || $("saathiSameAddressBtn")) return;
    const btn = makeFormBtn("saathiSameAddressBtn", "📍 Same Address as Last");
    btn.addEventListener("click", async () => {
      const res = await new Promise((r) => chrome.storage.local.get(["saathiLastAddress"], r));
      const a = res && res.saathiLastAddress;
      if (!a) return toast("Abhi koi pichla address saved nahi hai - ek form save karein.", "warn");
      // state -> district -> anumandal -> prakhand -> gram: each step fills the next dropdown
      for (const f of ADDRESS_FIELDS) {
        if (a[f]) { setField(f, a[f]); await wait(f === "state" || f === "district" || f === "anumandal" || f === "prakhand" ? 150 : 30); }
      }
      // dropdown lists load asynchronously; set once more so a late list still gets its value
      await wait(300);
      ADDRESS_FIELDS.forEach((f) => { const el = $(f); if (el && a[f] && el.value !== a[f]) setField(f, a[f]); });
      toast("Pichla address bhar diya.", "success");
    });
    host.appendChild(btn);
    const form = $("dataForm");
    if (form) form.addEventListener("submit", captureLastAddress, true);
  }

  // ---------- 2. Receipt + WhatsApp ----------
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function addressLine() {
    return ["village", "gram", "postoffice", "policeStation", "district", "pin"].map(fieldVal).filter(Boolean).join(", ");
  }
  function openReceipt() {
    const name = fieldVal("name");
    if (!name) return toast("Pehle form me naam bharein.", "warn");
    const amountRaw = window.prompt("Receipt me amount (Rs.) - khali chhodein to amount nahi dikhega:", "");
    if (amountRaw === null) return;
    const amount = amountRaw.replace(/[^\d.]/g, "");
    const now = new Date();
    const rows = [["Naam", name], ["Pita/Pati", fieldVal("fathername") || fieldVal("husbandname")], ["Mobile", fieldVal("mobile")],
      ["Pata", addressLine()], ["Seva / Purpose", fieldVal("purpose")]].filter((r) => r[1]);
    const win = window.open("", "_blank", "width=440,height=620");
    if (!win) return toast("Popup blocked - receipt window allow karo.", "warn");
    win.document.write(`<html><head><title>Receipt</title><style>
      body{font-family:sans-serif;padding:26px;color:#1e293b;} h2{color:#2f6fb8;margin:0;} .sub{color:#64748b;font-size:12px;margin-bottom:16px;}
      .r{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid #eee;font-size:14px;} .r b{text-align:right;}
      .amt{margin-top:16px;font-size:18px;font-weight:700;text-align:right;} .f{margin-top:26px;font-size:10px;color:#94a3b8;}
    .hd{display:flex;align-items:center;gap:10px;margin-bottom:2px;} .hd img{width:34px;height:34px;border-radius:9px;}
    </style></head><body><div class="hd"><img src="${esc(window.SAATHI_LOGO_URI || '')}" alt=""><h2>Digital Saathi</h2></div><div class="sub">Receipt - ${esc(now.toLocaleString("en-IN"))}</div>
      ${rows.map((r) => `<div class="r"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join("")}
      ${amount ? `<div class="amt">Amount: Rs. ${esc(amount)}</div>` : ""}
      <div class="f">Generated via Digital Saathi</div></body></html>`);
    win.document.close(); win.focus(); win.print();
  }
  function shareWhatsApp() {
    const name = fieldVal("name");
    const mobile = fieldVal("mobile").replace(/\D/g, "").slice(-10);
    if (mobile.length !== 10) return toast("WhatsApp ke liye 10 digit ka mobile number chahiye.", "warn");
    const purpose = fieldVal("purpose");
    const msg = `Namaste${name ? " " + name : ""} ji,\nAapka${purpose ? " " + purpose + " ka" : ""} aavedan hamare paas receive ho gaya hai. Kaam hone par aapko soochit kiya jayega.\n- Digital Saathi`;
    window.open("https://wa.me/91" + mobile + "?text=" + encodeURIComponent(msg), "_blank");
  }
  function initReceiptShare() {
    const host = formActionsHost();
    if (!host) return;
    if (!$("saathiReceiptBtn")) { const b = makeFormBtn("saathiReceiptBtn", "🧾 Receipt"); b.addEventListener("click", openReceipt); host.appendChild(b); }
    if (!$("saathiWaBtn")) { const b = makeFormBtn("saathiWaBtn", "💬 WhatsApp"); b.addEventListener("click", shareWhatsApp); host.appendChild(b); }
  }

  

  // ---------- 3 & 5. Fee ledger + milestones ----------
  function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function monthKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

  function initFeeAndMilestones() {
    const form = $("dataForm");
    if (!form) return;
    form.addEventListener("submit", () => {
      const feeStr = window.prompt("Fee collected (₹) — khaali chhodo agar track nahi karna:", "");
      chrome.storage.local.get(["saathiUsageStats", "saathiTotalCount"], (res) => {
        const stats = res.saathiUsageStats || {};
        const total = (res.saathiTotalCount || 0) + 1;
        if (feeStr && !isNaN(parseFloat(feeStr))) {
          const fee = parseFloat(feeStr);
          stats[todayKey() + "-fee"] = (stats[todayKey() + "-fee"] || 0) + fee;
          stats[monthKey() + "-month-fee"] = (stats[monthKey() + "-month-fee"] || 0) + fee;
        }
        chrome.storage.local.set({ saathiUsageStats: stats, saathiTotalCount: total }, () => {
          [10, 50, 100, 500, 1000].forEach((m) => {
            if (total === m) setTimeout(() => toast(`🏆 Milestone! ${m} forms complete ho gaye.`, "success"), 1400);
          });
          renderDashboard();
        });
      });
    }, true);
  }

  // ---------- 4. Follow-up reminders ----------
  function initFollowUps() {
    const form = $("dataForm");
    if (!form) return;
    form.addEventListener("submit", () => {
      const dateStr = window.prompt("Follow-up reminder date (DD-MM-YYYY) — khaali chhodo skip karne ke liye:", "");
      if (!dateStr) return;
      const parts = dateStr.split(/[-/]/);
      if (parts.length !== 3) return;
      const iso = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      const name = fieldVal("name"), mobile = fieldVal("mobile");
      chrome.storage.local.get(["saathiReminders"], (res) => {
        const list = res.saathiReminders || [];
        list.push({ name, mobile, date: iso });
        chrome.storage.local.set({ saathiReminders: list });
      });
    }, true);
  }
  function checkDueReminders() {
    chrome.storage.local.get(["saathiReminders"], (res) => {
      const list = res.saathiReminders || [];
      const now = Date.now(), threeDays = 3 * 24 * 60 * 60 * 1000;
      const due = list.filter((r) => {
        const t = new Date(r.date).getTime();
        return !isNaN(t) && t - now <= threeDays && t - now >= -threeDays;
      });
      if (due.length) {
        setTimeout(() => toast(`🔔 ${due.length} follow-up${due.length > 1 ? "s" : ""} due jald hi.`, "warn"), 1800);
      }
    });
  }

  // ---------- 6. 7-day usage bar chart ----------
  function renderDashboard() {
    const contentSaved = $("content-saved");
    if (!contentSaved) return;
    chrome.storage.local.get(["saathiUsageStats"], (res) => {
      const stats = res.saathiUsageStats || {};
      let chart = $("saathiDashboard");
      if (!chart) {
        chart = document.createElement("div");
        chart.id = "saathiDashboard";
        contentSaved.insertBefore(chart, contentSaved.firstChild);
      }
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        days.push({ label: d.toLocaleDateString("en-IN", { weekday: "short" }), count: stats[key] || 0 });
      }
      const max = Math.max(1, ...days.map((d) => d.count));
      const todayFee = stats[todayKey() + "-fee"] || 0;
      chart.innerHTML = `
        <div class="saathi-dash-head">
          <div class="saathi-dash-title"><span class="saathi-dash-title-icon">📈</span> Last 7 Days</div>
          ${todayFee ? `<div class="saathi-dash-fee-chip">💰 ₹${todayFee} today</div>` : ""}
        </div>
        <div class="saathi-dash-bars">
          ${days.map((d, i) => `
            <div class="saathi-dash-col" style="animation-delay:${i * 0.05}s">
              <div class="saathi-dash-bar" data-count="${d.count}" style="height:${Math.max(4, (d.count / max) * 40)}px" title="${d.count}"></div>
              <div class="saathi-dash-label">${d.label}</div>
            </div>`).join("")}
        </div>
      `;
    });
  }

  // ---------- 7. Bulk export selected ----------
  function getProfileCards() { return window.saathiGetProfileCards(); }
  function initBulkExport() {
    const contentSaved = $("content-saved");
    if (!contentSaved || $("saathiBulkExportBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "saathiBulkExportBtn"; btn.className = "saathi-pin-setting-btn";
    btn.textContent = "☑️ Export Selected Only";
    contentSaved.insertBefore(btn, contentSaved.firstChild);

    function ensureCheckboxes() {
      getProfileCards().forEach(({ card }) => {
        if (card.querySelector(".saathi-bulk-check")) return;
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "saathi-bulk-check";
        cb.addEventListener("change", () => card.classList.toggle("saathi-card-selected", cb.checked));
        card.insertBefore(cb, card.firstChild);
      });
    }
    ensureCheckboxes();
    const list = $("savedList");
    if (list) new MutationObserver(ensureCheckboxes).observe(list, { childList: true });

    btn.addEventListener("click", () => {
      const selected = getProfileCards().filter((p) => {
        const cb = p.card.querySelector(".saathi-bulk-check");
        return cb && cb.checked;
      }).map((p) => p.name);
      if (!selected.length) { toast("Pehle kam se kam ek profile select karo (checkbox).", "warn"); return; }

      chrome.storage.local.get(null, (allData) => {
        const filtered = {};
        Object.keys(allData).forEach((key) => {
          const val = allData[key];
          if (Array.isArray(val)) {
            filtered[key] = val.filter((item) => {
              const itemName = (item && (item.name || item.Name || "")).toString();
              return selected.some((s) => itemName.includes(s) || s.includes(itemName));
            });
          }
        });
        const payload = { app: "Digital Saathi (selected)", exportedAt: new Date().toISOString(), data: filtered };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `digital-saathi-selected-${todayKey()}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast(`${selected.length} profile export ho gaye.`, "success");
      });
    });
  }

  function init() {
    // each feature isolated - one failing can never take the others down with it
    [initSameAsLast, initReceiptShare, initFeeAndMilestones, initFollowUps, checkDueReminders, renderDashboard, initBulkExport]
      .forEach((fn) => { try { fn(); } catch (e) { console.warn("[premium2] " + fn.name + " failed", e); } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
