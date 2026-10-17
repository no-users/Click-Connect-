/**
 * cloudBackupToggle.js
 * ------------------------------------------------------------
 * Adds a single "Cloud Backup: ON/OFF" button + a one-line status
 * ("Aakhri backup: 4 min pehle") to the Profile tab, right next to
 * the existing Export/Import Backup buttons (importExport.js).
 *
 * Turning it ON does a one-time interactive Google sign-in (shows
 * Google's normal account-picker/consent screen), then hands off to
 * background.js + driveSync.js, which keep syncing automatically
 * every 5 minutes from then on — nothing else to configure here.
 * ------------------------------------------------------------
 */

(function () {
  const ENABLED_KEY = "saathiCloudBackupEnabled";
  const LAST_SYNCED_AT_KEY = "saathiLastSyncedAt";
  const LAST_SYNC_ERROR_KEY = "saathiLastSyncError";

  let statusEl = null;
  let toggleBtn = null;
  let refreshTimer = null;

  function toast(message, kind = "info") { return window.saathiToast(message, kind); }

  function timeAgo(ts) {
    if (!ts) return "Abhi tak backup nahi hua";
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (mins < 1) return "Aakhri backup: abhi";
    if (mins === 1) return "Aakhri backup: 1 min pehle";
    if (mins < 60) return `Aakhri backup: ${mins} min pehle`;
    const hrs = Math.round(mins / 60);
    return `Aakhri backup: ${hrs} ghante pehle`;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function renderRedirectUrl(container) {
    const chip = document.createElement("div");
    chip.className = "saathi-redirect-chip";
    chip.innerHTML = `<span class="saathi-redirect-icon">🔗</span><span class="saathi-redirect-text">Redirect URL load ho raha hai…</span>`;
    container.appendChild(chip);
    const textEl = chip.querySelector(".saathi-redirect-text");

    try {
      chrome.runtime.sendMessage({ type: "DS_GET_REDIRECT_URL" }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          chip.classList.add("saathi-redirect-warn");
          textEl.textContent = "⚠️ Redirect URL load nahi hua: " + err.message;
          return;
        }
        if (!response || !response.ok || !response.url) {
          chip.classList.add("saathi-redirect-warn");
          textEl.textContent = "⚠️ Redirect URL load nahi hua: " + ((response && response.error) || "extension reload karke try karein");
          return;
        }
        chip.querySelector(".saathi-redirect-icon").textContent = "📋";
        textEl.textContent = response.url;
        chip.title = "Google Cloud Console → OAuth Client → Authorized redirect URIs me ye add karein (tap to copy)";
        chip.addEventListener("click", () => {
          copyToClipboard(response.url);
          chip.classList.add("saathi-redirect-copied");
          const prevIcon = chip.querySelector(".saathi-redirect-icon").textContent;
          chip.querySelector(".saathi-redirect-icon").textContent = "✅";
          toast("Redirect URL copy ho gaya.", "info");
          setTimeout(() => {
            chip.classList.remove("saathi-redirect-copied");
            chip.querySelector(".saathi-redirect-icon").textContent = prevIcon;
          }, 1200);
        });
      });
    } catch (e) {
      // Most common cause: the extension was reloaded from
      // chrome://extensions while THIS popup was already open — the
      // old popup's connection to the extension is now stale/dead.
      // Closing this popup and opening a fresh one fixes it.
      chip.classList.add("saathi-redirect-warn");
      textEl.textContent = "⚠️ Popup purana ho gaya — ise band karke dobara kholein.";
    }
  }

  function render() {
    chrome.storage.local.get([ENABLED_KEY, LAST_SYNCED_AT_KEY, LAST_SYNC_ERROR_KEY], (res) => {
      const enabled = !!res[ENABLED_KEY];
      toggleBtn.classList.toggle("saathi-cb-on", enabled);
      toggleBtn.classList.toggle("saathi-cb-off", !enabled);
      toggleBtn.innerHTML = `
        <span class="saathi-cb-switch"><span class="saathi-cb-knob"></span></span>
        <span class="saathi-cb-label">${enabled ? "Cloud Backup: ON" : "Cloud Backup: OFF"}</span>
      `;

      statusEl.classList.remove("saathi-cb-status-warn", "saathi-cb-status-ok");
      if (!enabled) {
        statusEl.innerHTML = "";
        return;
      }
      if (res[LAST_SYNC_ERROR_KEY]) {
        statusEl.classList.add("saathi-cb-status-warn");
        statusEl.innerHTML = `<span class="saathi-cb-dot"></span>⚠️ ${res[LAST_SYNC_ERROR_KEY]}`;
      } else {
        statusEl.classList.add("saathi-cb-status-ok");
        statusEl.innerHTML = `<span class="saathi-cb-dot"></span>${timeAgo(res[LAST_SYNCED_AT_KEY])}`;
      }
    });
  }

  function onToggleClick() {
    chrome.storage.local.get([ENABLED_KEY], (res) => {
      const currentlyEnabled = !!res[ENABLED_KEY];
      if (currentlyEnabled) {
        chrome.runtime.sendMessage({ type: "DS_CLOUD_BACKUP_DISABLE" }, () => {
          toast("Cloud Backup band kar diya.", "info");
          render();
        });
        return;
      }

      toggleBtn.disabled = true;
      toggleBtn.classList.add("saathi-cb-signing");
      toggleBtn.innerHTML = `<span class="saathi-cb-spinner"></span><span class="saathi-cb-label">Signing in…</span>`;
      chrome.runtime.sendMessage({ type: "DS_CLOUD_BACKUP_ENABLE" }, (response) => {
        toggleBtn.disabled = false;
        toggleBtn.classList.remove("saathi-cb-signing");
        if (response && response.ok) {
          toast("Cloud Backup chalu ho gaya — har 5 minute me auto-sync hoga.", "success");
        } else {
          toast("Sign-in nahi ho paya: " + ((response && response.error) || "Kuch galat hua"), "warn");
        }
        render();
      });
    });
  }

  function buildUI() {
    const wrap = document.createElement("div");
    wrap.id = "saathiCloudBackupRow";
    wrap.className = "saathi-cb-card";

    const head = document.createElement("div");
    head.className = "saathi-cb-head";
    head.innerHTML = `<span class="saathi-cb-icon">☁️</span><span class="saathi-cb-title">Cloud Backup<span class="saathi-cb-sub">Auto-sync every 5 minutes</span></span>`;

    toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "saathi-cb-toggle";
    toggleBtn.addEventListener("click", onToggleClick);
    head.appendChild(toggleBtn);

    statusEl = document.createElement("div");
    statusEl.className = "saathi-cb-status";

    wrap.appendChild(head);
    wrap.appendChild(statusEl);
    return wrap;
  }

  function init() {
    const toolbar = document.getElementById("saathiBackupToolbar");
    const contentSaved = document.getElementById("content-saved");
    if (document.getElementById("saathiCloudBackupRow")) return;
    if (!toolbar && !contentSaved) return;

    const row = buildUI();
    if (toolbar) {
      toolbar.insertAdjacentElement("afterend", row);
    } else {
      contentSaved.insertBefore(row, contentSaved.firstChild);
    }

    render();
    renderRedirectUrl(row);
    // Keep "X min pehle" fresh while the popup stays open.
    refreshTimer = setInterval(render, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
