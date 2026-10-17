/**
 * profileToolsPanel.js
 * ------------------------------------------------------------
 * Batches 1-4 each independently inserted their own toolbar at the
 * top of the Profile tab (search box, dashboard, backup buttons,
 * encrypted backup buttons, PIN setting, bulk export/delete...).
 * That's a lot of separate elements stacking up with inconsistent
 * spacing and no grouping.
 *
 * This file does not rewrite any of them — it MOVES the existing
 * elements (which keeps all their working click handlers intact)
 * into a clean structure:
 *   - Search box + 7-day dashboard: always visible (used often)
 *   - Everything else: collapsed under one "⚙️ Tools" drawer
 *   - Bulk-select checkboxes: hidden until "Select Mode" is turned on
 * Runs last, after every other script has created its own elements.
 * ------------------------------------------------------------
 */
(function () {
  function $(id) { return document.getElementById(id); }

  function moveInto(container, id) {
    const el = $(id);
    if (el) container.appendChild(el);
    return el;
  }

  // Splits a button's rendered content into a small colored icon badge
  // + label text, so CSS can style them as separate pieces (instead of
  // one plain text string) without touching any click handlers.
  function setBtnContent(btn, icon, label) {
    btn.innerHTML = `<span class="saathi-btn-icon">${icon}</span><span class="saathi-btn-label">${label}</span>`;
  }

  // Wraps an existing already-built button (created by another script,
  // with its own textContent + working click handler already attached)
  // so its emoji becomes a colored icon badge too, without touching
  // the handler. Leaves buttons whose text doesn't start with an
  // emoji-ish token alone.
  function splitExistingLabel(btn) {
    if (!btn || btn.dataset.saathiSplit) return;
    const text = btn.textContent.trim();
    const match = text.match(/^(\S+)\s+(.+)$/);
    if (!match) return;
    setBtnContent(btn, match[1], match[2]);
    btn.dataset.saathiSplit = "1";
  }

  function build() {
    const contentSaved = $("content-saved");
    if (!contentSaved || $("saathiToolsHeader")) return;

    // Only proceed once the elements we need to move actually exist —
    // other scripts create them on DOMContentLoaded same as this one,
    // so give them a moment if they haven't landed yet.
    const required = ["saathiSearchInput", "saathiDashboard", "saathiCounterBadge"];
    if (!required.every((id) => $(id))) { setTimeout(build, 50); return; }

    const header = document.createElement("div");
    header.id = "saathiToolsHeader";

    const drawer = document.createElement("details");
    drawer.id = "saathiToolsDrawer";
    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="saathi-tools-summary-icon">⚡</span> Quick Actions`;
    drawer.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "saathi-tools-grid";
    drawer.appendChild(grid);

    contentSaved.insertBefore(drawer, contentSaved.firstChild);
    contentSaved.insertBefore(header, drawer);

    // --- Always-visible: search + dashboard ---
    moveInto(header, "saathiDashboard");
    moveInto(header, "saathiCounterBadge");
    moveInto(header, "saathiSearchInput");

    // --- Group: Bulk actions (emerald) ---
    const bulkGroup = document.createElement("div");
    bulkGroup.className = "saathi-tools-group saathi-group-bulk";
    grid.appendChild(bulkGroup);

    const selectRow = document.createElement("div");
    selectRow.className = "saathi-tools-section-label";
    selectRow.innerHTML = `<span class="saathi-tools-label-icon">🧮</span> Bulk actions`;
    bulkGroup.appendChild(selectRow);

    const selectModeBtn = document.createElement("button");
    selectModeBtn.type = "button";
    selectModeBtn.id = "saathiSelectModeBtn";
    selectModeBtn.className = "saathi-tool-btn";
    setBtnContent(selectModeBtn, "☑️", "Select Mode: Off");
    bulkGroup.appendChild(selectModeBtn);
    chrome.storage.local.get(["saathiSelectMode"], (res) => {
      const on = !!res.saathiSelectMode;
      document.body.classList.toggle("saathi-select-mode", on);
      setBtnContent(selectModeBtn, on ? "✅" : "☑️", `Select Mode: ${on ? "On" : "Off"}`);
      selectModeBtn.classList.toggle("saathi-btn-active", on);
    });
    selectModeBtn.addEventListener("click", () => {
      const on = document.body.classList.toggle("saathi-select-mode");
      setBtnContent(selectModeBtn, on ? "✅" : "☑️", `Select Mode: ${on ? "On" : "Off"}`);
      selectModeBtn.classList.toggle("saathi-btn-active", on);
      chrome.storage.local.set({ saathiSelectMode: on });
      if (!on) {
        // leaving select mode: clear any leftover "selected" highlight
        // so cards don't look picked next time the mode is turned back on
        document.querySelectorAll(".saathi-card-selected").forEach((card) => {
          card.classList.remove("saathi-card-selected");
          const cb = card.querySelector(".saathi-bulk-check");
          if (cb) cb.checked = false;
        });
      }
    });

    const bulkRow = document.createElement("div");
    bulkRow.className = "saathi-tools-row";
    bulkGroup.appendChild(bulkRow);
    const bulkExportBtn = moveInto(bulkRow, "saathiBulkExportBtn");
    const bulkDeleteBtn = moveInto(bulkRow, "saathiBulkDeleteBtn");
    splitExistingLabel(bulkExportBtn);
    splitExistingLabel(bulkDeleteBtn);

    // --- Group: Backup (sky blue) ---
    const backupGroup = document.createElement("div");
    backupGroup.className = "saathi-tools-group saathi-group-backup";
    grid.appendChild(backupGroup);

    const backupLabel = document.createElement("div");
    backupLabel.className = "saathi-tools-section-label";
    backupLabel.innerHTML = `<span class="saathi-tools-label-icon">💾</span> Backup`;
    backupGroup.appendChild(backupLabel);

    const backupRow = document.createElement("div");
    backupRow.className = "saathi-tools-row";
    backupGroup.appendChild(backupRow);
    const exportBtn = moveInto(backupRow, "saathiExportBtn");
    const importBtn = moveInto(backupRow, "saathiImportBtn");
    // the hidden file input for plain import needs to move too
    moveInto(backupRow, "saathiImportInput");
    splitExistingLabel(exportBtn);
    splitExistingLabel(importBtn);

    const encRow = document.createElement("div");
    encRow.className = "saathi-tools-row";
    backupGroup.appendChild(encRow);
    const encExport = moveInto(encRow, "saathiEncExportBtn");
    const encImport = moveInto(encRow, "saathiEncImportBtn");
    moveInto(encRow, "saathiEncImportInput");
    splitExistingLabel(encExport);
    splitExistingLabel(encImport);
    // clean up the now-empty leftover wrapper divs from earlier scripts
    const oldBackupToolbar = $("saathiBackupToolbar");
    if (oldBackupToolbar) oldBackupToolbar.remove();
    const oldEncRow = $("saathiEncryptedRow");
    if (oldEncRow && oldEncRow !== encRow && !oldEncRow.contains(encExport)) oldEncRow.remove();

    // --- Group: Security (violet) ---
    const secGroup = document.createElement("div");
    secGroup.className = "saathi-tools-group saathi-group-security";
    grid.appendChild(secGroup);

    const secLabel = document.createElement("div");
    secLabel.className = "saathi-tools-section-label";
    secLabel.innerHTML = `<span class="saathi-tools-label-icon">🛡️</span> Security`;
    secGroup.appendChild(secLabel);
    const pinBtn = moveInto(secGroup, "saathiPinSettingBtn");
    splitExistingLabel(pinBtn);
  }

  // Show bulk checkboxes only in Select Mode.
  function styleFix() {
    document.querySelectorAll(".saathi-tool-btn, .saathi-pin-setting-btn, #saathiExportBtn, #saathiImportBtn, #saathiEncExportBtn, #saathiEncImportBtn, #saathiBulkExportBtn, #saathiBulkDeleteBtn")
      .forEach((el) => el.classList.add("saathi-tool-btn"));
  }

  function init() {
    build();
    setTimeout(styleFix, 100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
