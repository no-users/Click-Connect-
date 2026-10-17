/**
 * importExport.js
 * ------------------------------------------------------------
 * Adds "Export Backup" / "Import Backup" to the Profile tab.
 *
 * Export: dumps the ENTIRE chrome.storage.local (all saved
 * profiles + settings) into a downloadable .json file. We round-
 * trip the whole storage rather than trying to reverse-engineer
 * popup.js's internal key names — this way it keeps working even
 * if that internal format changes later.
 *
 * Import: reads a previously-exported .json file and MERGES it
 * into the current storage:
 *   - array values (this is where the saved-profile list almost
 *     certainly lives) are combined and de-duplicated
 *   - docStore.js's own document storage is merged per-customer,
 *     per-document-type (see mergeDocsStorage below) — NOT treated
 *     like a generic object, or every customer's documents would be
 *     silently dropped on any device that already has at least one
 *     document saved
 *   - a key that doesn't exist locally yet is added as-is
 *   - any other scalar/object key that already exists locally (e.g.
 *     the theme preference) is left untouched, so importing someone's
 *     profile backup can never silently change your own settings
 * Nothing is ever deleted — worst case of a slightly-different
 * duplicate is an extra entry the user can remove with the
 * existing Delete button.
 * ------------------------------------------------------------
 */

(function () {

  function toast(message, kind = "info") { return window.saathiToast(message, kind); }

  function todayStamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function exportData() {
    chrome.storage.local.get(null, (allData) => {
      const payload = {
        app: "Digital Saathi",
        exportedAt: new Date().toISOString(),
        data: allData,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `digital-saathi-backup-${todayStamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Backup file download ho raha hai…", "success");
    });
  }

  // Settings that must never be silently transferred by an import —
  // these are device-specific and importing a backup should not
  // change them on the device doing the importing (this is also
  // what caused a real bug: importing a file that happened to
  // contain a PIN silently turned PIN-lock on for a device that
  // never set one).
  const NEVER_IMPORT_KEYS = new Set(["saathiAppPin"]);

  // docStore.js's own storage key — an object keyed by customer
  // (mobile number), each holding that customer's uploaded documents.
  // Needs its own per-customer merge below (see DOCS_STORAGE_KEY
  // handling) instead of the generic array/scalar handling, or a
  // backup import would silently DROP every customer's documents
  // whenever the key already exists locally (i.e. on any device that
  // has ever had even one document uploaded) — that's a real bug this
  // fixes: restoring a backup previously could lose every document.
  const DOCS_STORAGE_KEY = "saathiDocStoreByProfile";

  function mergeDocsStorage(existingDocs, incomingDocs) {
    const merged = { ...(existingDocs || {}) };
    Object.keys(incomingDocs || {}).forEach((profileId) => {
      if (!merged[profileId]) {
        merged[profileId] = incomingDocs[profileId];
      } else {
        // Customer already has some documents locally — add any
        // document types the backup has that aren't saved locally yet.
        // A document already saved locally under the same type always
        // wins (never silently overwritten by an older backup).
        merged[profileId] = { ...incomingDocs[profileId], ...merged[profileId] };
      }
    });
    return merged;
  }

  function mergeStorageData(existing, incoming) {
    const merged = { ...existing };
    Object.keys(incoming).forEach((key) => {
      if (NEVER_IMPORT_KEYS.has(key)) return;
      const incomingVal = incoming[key];
      const existingVal = existing[key];

      if (key === DOCS_STORAGE_KEY && typeof incomingVal === "object" && incomingVal !== null) {
        merged[key] = mergeDocsStorage(existingVal, incomingVal);
      } else if (Array.isArray(incomingVal) && Array.isArray(existingVal)) {
        const seen = new Set(existingVal.map((item) => JSON.stringify(item)));
        const combined = [...existingVal];
        incomingVal.forEach((item) => {
          const sig = JSON.stringify(item);
          if (!seen.has(sig)) {
            combined.push(item);
            seen.add(sig);
          }
        });
        merged[key] = combined;
      } else if (existingVal === undefined) {
        merged[key] = incomingVal;
      }
      // else: key already exists locally and isn't an array on both
      // sides (e.g. a setting like theme) — keep the local value,
      // don't let an imported backup silently change it.
    });
    return merged;
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        toast("Ye file sahi backup format mein nahi hai.", "warn");
        return;
      }
      const incoming = parsed && parsed.data ? parsed.data : parsed;
      if (!incoming || typeof incoming !== "object") {
        toast("Is file mein koi data nahi mila.", "warn");
        return;
      }

      chrome.storage.local.get(null, (existing) => {
        const merged = mergeStorageData(existing, incoming);
        chrome.storage.local.set(merged, () => {
          toast("Data import ho gaya — profile list refresh ho rahi hai…", "success");
          // Refresh the saved-profile list in place instead of reloading
          // the whole popup. Reloading a popup right after a native file
          // dialog is unreliable in Chrome — it can close the popup
          // entirely instead of reloading it (this was the "PIN screen
          // then whole extension closes" bug).
          const savedTabBtn = document.getElementById("tab-saved");
          if (savedTabBtn) savedTabBtn.click();
        });
      });
    };
    reader.readAsText(file);
  }

  function buildToolbar() {
    const wrap = document.createElement("div");
    wrap.id = "saathiBackupToolbar";
    wrap.innerHTML = `
      <button type="button" id="saathiExportBtn" class="btn btn-primary">⬇ Export Backup</button>
      <button type="button" id="saathiImportBtn" class="btn" style="background:var(--input-bg);border:1.5px solid var(--border-color);color:var(--text-primary);">⬆ Import Backup</button>
      <input type="file" id="saathiImportInput" accept=".json" style="display:none;">
    `;
    return wrap;
  }

  function init() {
    const contentSaved = document.getElementById("content-saved");
    if (!contentSaved || document.getElementById("saathiBackupToolbar")) return;

    const toolbar = buildToolbar();
    contentSaved.insertBefore(toolbar, contentSaved.firstChild);

    document.getElementById("saathiExportBtn").addEventListener("click", exportData);
    const fileInput = document.getElementById("saathiImportInput");
    document.getElementById("saathiImportBtn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importFile(file);
      e.target.value = "";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
