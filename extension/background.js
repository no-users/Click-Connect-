/**
 * background.js
 * ------------------------------------------------------------
 * Only job: rename the PDF that autoExportPdf.js triggers on the
 * "application submitted" page, so it downloads with a meaningful
 * name (e.g. "Income_Certificate_2026.pdf") instead of whatever
 * generic name the government portal itself gives the file.
 *
 * Flow:
 *   1. autoExportPdf.js (content script) works out the certificate
 *      type + year and sends it here via chrome.runtime.sendMessage
 *      BEFORE clicking the "Export to PDF" button.
 *   2. We remember that name for a few seconds.
 *   3. chrome.downloads.onDeterminingFilename fires when the click
 *      actually starts a download — if we have a pending name, we
 *      use it; otherwise the download proceeds with its normal name
 *      (so nothing else on the site is ever affected).
 * ------------------------------------------------------------
 */

// Chrome/Edge (MV3 service worker) load driveSync.js via importScripts.
// Firefox's background page doesn't have importScripts — there,
// driveSync.js is instead listed directly in manifest.json's
// background.scripts array (loaded before this file), so it's already
// available and this call is simply skipped.
if (typeof importScripts === "function") {
  importScripts("driveSync.js");
  importScripts("certJob.js"); // shared state for the Certificate Download section
  importScripts("certStatusJob.js"); // shared state for the Certificate Status Check section
}

// EXT_API is already declared by driveSync.js (loaded just above via
// importScripts) — both files share the same global scope here, so
// it must NOT be redeclared in this file too (that throws a
// "already been declared" SyntaxError and crashes the whole worker).

// Opens popup.html in its own small window. This is the FALLBACK path —
// used only when chrome.action.openPopup() isn't available (Firefox has
// no equivalent) or fails. It works identically in Chrome, Edge, AND
// Firefox — unlike chrome.action.openPopup(), which is Chrome/Edge-only.
//
// This used to be a KNOWN LIMITATION: popup.js's own (obfuscated,
// not-ours-to-edit) internal logic pushes field changes to the real page
// via chrome.tabs.sendMessage(), targeting whatever
// chrome.tabs.query({active:true, currentWindow:true}) returns — since a
// window opened via windows.create() is its own separate window, that
// query used to resolve to THIS small window (which has no RTPS tab in
// it) instead of the real browsing window, so popup.js's internal query
// found nothing and threw its own unrelated "Could not send message to
// tab" / "No active tab" error instead of filling anything — this was
// the actual cause of the "shortcut shows some unrelated error" bug.
// FIXED: autoLoadTabPatch.js (loaded in popup.html before popup.js)
// transparently redirects that exact query to the real RTPS tab id we
// stash below (PENDING_AUTO_LOAD_TAB_KEY), so popup.js's own internal
// messaging reaches the right tab even from this separate window.
function openAutoLoadWindow() {
  EXT_API.windows.create({
    url: EXT_API.runtime.getURL("popup.html"),
    type: "popup",
    width: 380,
    height: 560,
  });
}

// Prefers the REAL action popup (chrome.action.openPopup()) — since that
// popup is attached to the actual current browser window, "currentWindow"
// inside popup.js's own internal logic correctly resolves to the window
// that has the RTPS tab active, so its chrome.tabs.sendMessage() calls
// reach the right tab and the page actually gets filled, instead of
// throwing the unrelated error described above. Only falls back to the
// separate small window (openAutoLoadWindow, with the limitation noted
// there) when openPopup() genuinely isn't available (Firefox) or fails —
// e.g. because too much time/async work passed since the user's gesture
// for Chrome to still consider it "recent" (most likely on the mini
// profile switcher's path, which hops through a content-script click ->
// runtime.sendMessage -> this listener, rather than a direct keyboard
// command).
function openAutoLoadPreferReal() {
  if (chrome.action && typeof chrome.action.openPopup === "function") {
    try {
      const result = chrome.action.openPopup();
      // MV3's openPopup() returns a Promise — if it rejects (gesture
      // already expired, popup blocked, etc.) fall back instead of
      // silently doing nothing.
      if (result && typeof result.catch === "function") {
        result.catch(() => openAutoLoadWindow());
      }
      return;
    } catch (e) {
      // fall through to the window fallback below
    }
  }
  openAutoLoadWindow();
}

let pendingFilename = null;
let pendingExpiresAt = 0;

const PENDING_TTL_MS = 15000; // safety net in case Export to PDF never triggers a download

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "DS_SET_EXPORT_FILENAME" && message.filename) {
    pendingFilename = message.filename;
    pendingExpiresAt = Date.now() + PENDING_TTL_MS;
    sendResponse({ ok: true });
  }
  return false;
});

// Mini profile switcher (see miniProfileSwitcher.js) — clicking a
// customer in the on-page search box sets saathiPendingAutoLoadMobile
// itself, then sends this message to get the auto-load popup opened.
// Also stash the EXACT tab it was clicked from (sender.tab.id) — see
// PENDING_AUTO_LOAD_TAB_KEY below for why this matters.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "DS_OPEN_POPUP_FOR_AUTOLOAD") {
    if (sender && sender.tab && typeof sender.tab.id === "number") {
      chrome.storage.local.set({ [PENDING_AUTO_LOAD_TAB_KEY]: sender.tab.id }, () => {
        openAutoLoadPreferReal();
      });
    } else {
      openAutoLoadPreferReal();
    }
  }
});

/**
 * ------------------------------------------------------------
 * Google Drive Cloud Backup (see driveSync.js for the actual sync
 * logic). This block only wires up the timer and the messages the
 * popup's toggle (cloudBackupToggle.js) sends.
 * ------------------------------------------------------------
 */

const CLOUD_SYNC_ALARM = "saathiCloudSyncTick";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(CLOUD_SYNC_ALARM, { periodInMinutes: 5 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(CLOUD_SYNC_ALARM, { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLOUD_SYNC_ALARM) self.SaathiCloudSync.runCloudSync();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  if (message.type === "DS_CLOUD_BACKUP_ENABLE") {
    self.SaathiCloudSync.enableCloudBackup()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // keep the message channel open for the async response
  }

  if (message.type === "DS_CLOUD_BACKUP_DISABLE") {
    self.SaathiCloudSync.disableCloudBackup().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "DS_CLOUD_BACKUP_SYNC_NOW") {
    self.SaathiCloudSync.runCloudSync()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (message.type === "CERT_EXPECT_DOWNLOAD") {
    chrome.storage.local.set({
      saathiCertExpect: { recId: message.recId, filename: message.filename, until: Date.now() + 90000 },
    }, () => sendResponse({ ok: true }));
    return true;
  }

  // Status Check: bring the operator to the portal page that carries the
  // "आवेदन की स्थिति देखें" link (the Track Application page itself only
  // opens when reached from the portal — opened directly it errors).
  if (message.type === "STATUS_OPEN") {
    statusOpenPage(message.url)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (message.type === "DS_GET_REDIRECT_URL") {
    try {
      const url = self.SaathiCloudSync && self.SaathiCloudSync.getRedirectUrl();
      sendResponse({ ok: true, url });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
    return false;
  }

  return false;
});

/**
 * Status Check: show the portal page with the status link and flag it so the
 * content script there (certStatusFill.js) clicks / highlights the link.
 * An already-open portal home tab is re-used; the operator's other portal
 * tabs (a form in progress, say) are never navigated away.
 */
async function statusOpenPage(url) {
  const Job = SaathiStatusJob;
  const n = Job.normalizeLink(url || "");
  const target = n ? n.url : Job.HOME_URL;
  await chrome.storage.local.set({ [Job.WANT_KEY]: { at: Date.now() } });

  const tabs = await chrome.tabs.query({ url: ["https://serviceonline.bihar.gov.in/*"] });
  const pathOf = (t) => { try { return new URL(t.url).pathname; } catch (e) { return ""; } };
  const targetPath = new URL(target).pathname;
  const hit = tabs.find((t) => pathOf(t) === targetPath);
  if (hit) {
    await chrome.tabs.update(hit.id, { active: true });
    if (chrome.windows && hit.windowId != null) { try { await chrome.windows.update(hit.windowId, { focused: true }); } catch (e) { /* ignore */ } }
    return { ok: true, tabId: hit.id, reused: true };
  }
  const t = await chrome.tabs.create({ url: target });
  return { ok: true, tabId: t.id };
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const stillValid = pendingFilename && Date.now() < pendingExpiresAt;
  const isPdf = /\.pdf$/i.test(item.filename);

  if (stillValid && isPdf) {
    const filename = pendingFilename;
    pendingFilename = null;
    pendingExpiresAt = 0;
    suggest({ filename, conflictAction: "uniquify" });
    return;
  }

  // Certificate Download section: the content script announced which
  // record it is about to download (see CERT_EXPECT_DOWNLOAD below).
  // Kept in storage, not memory, because this worker can be restarted.
  chrome.storage.local.get(["saathiCertExpect"], (res) => {
    const ex = res && res.saathiCertExpect;
    if (ex && Date.now() < ex.until) {
      chrome.storage.local.remove("saathiCertExpect");
      chrome.storage.local.set({ saathiCertDl: { id: item.id, recId: ex.recId } });
      suggest({ filename: ex.filename, conflictAction: "uniquify" });
    } else {
      suggest(); // let Chrome use the default name
    }
  });
  return true; // suggest() is called asynchronously above
});

// A tracked certificate finished downloading -> mark it done and let the
// page content script move on to the next record (it watches the same storage key).
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state || (delta.state.current !== "complete" && delta.state.current !== "interrupted")) return;
  chrome.storage.local.get(["saathiCertDl"], (res) => {
    const dl = res && res.saathiCertDl;
    if (!dl || dl.id !== delta.id) return;
    chrome.storage.local.remove("saathiCertDl");
    if (typeof SaathiCertJob !== "undefined") {
      SaathiCertJob.finish(dl.recId, delta.state.current === "complete" ? "done" : "failed");
    }
  });
});

/**
 * ------------------------------------------------------------
 * "Fill Active Profile" keyboard shortcut (Ctrl+Shift+L by default,
 * changeable at chrome://extensions/shortcuts).
 *
 * docStore.js already tracks a persistent "active profile" (the
 * customer whose saved-profile card was last Loaded/Updated) under
 * saathiActiveProfileId, keyed like "profile_<10-digit-mobile>".
 *
 * We deliberately do NOT try to read/re-implement popup.js's own
 * (obfuscated) profile-fill logic here — that risks silently mixing
 * up customer data if we guess its internal format wrong. Instead,
 * this hands off to popup.html's own real "Load" button (see
 * shortcutAutoLoad.js) by:
 *   1. Stashing the active profile's mobile number under a one-shot
 *      flag, saathiPendingAutoLoadMobile.
 *   2. Opening popup.html — preferably the REAL action popup, via
 *      openAutoLoadPreferReal() above — shortcutAutoLoad.js picks the
 *      flag up the moment it opens, clicks that saved profile's real
 *      Load button, waits for the page to be filled, then closes
 *      itself.
 * ------------------------------------------------------------
 */

const ACTIVE_ID_KEY = "saathiActiveProfileId";
const PENDING_AUTO_LOAD_KEY = "saathiPendingAutoLoadMobile";
// The tab that was actually on the RTPS site when the shortcut/switcher
// was triggered. See autoLoadTabPatch.js (loaded early in popup.html,
// before popup.js) for why this is stashed: it's what fixes the
// "shortcut shows some unrelated error" bug for good, including the
// mini-switcher's fallback-window path where openPopup() can't be used.
const PENDING_AUTO_LOAD_TAB_KEY = "saathiPendingAutoLoadTabId";
const PROFILE_PREFIX = "profile_";
const RTPS_URL_PATTERN = /^https:\/\/serviceonline\.bihar\.gov\.in\//;

chrome.commands.onCommand.addListener((command) => {
  if (command !== "fill-active-profile") return;

  // Try the REAL action popup FIRST and SYNCHRONOUSLY, before any
  // awaited work below — chrome.action.openPopup() only counts as
  // valid when called this close to the actual keyboard-shortcut
  // gesture. See openAutoLoadPreferReal()'s comment for why this
  // matters (it's the actual fix for the "shortcut shows some
  // unrelated error" bug, not just a preference).
  const canOpenRealPopup = !!(chrome.action && typeof chrome.action.openPopup === "function");
  if (canOpenRealPopup) {
    try { chrome.action.openPopup(); } catch (e) { /* handled by the fallback below */ }
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url || !RTPS_URL_PATTERN.test(tab.url)) {
      return; // shortcut only makes sense on the RTPS site itself
    }

    chrome.storage.local.get([ACTIVE_ID_KEY, "saathiCustomers", "saathiActiveProfileLabel"], (res) => {
      const activeId = res && res[ACTIVE_ID_KEY];
      if (!activeId) return; // no active customer yet - nothing to auto-load
      // New customers (docStore v2) have ids like "cust_<ts>_<rand>"; only legacy ones are "profile_<mobile>".
      // The old code accepted ONLY the legacy form, so the shortcut silently did nothing for every new customer.
      let mobile = "";
      let name = "";
      if (activeId.indexOf(PROFILE_PREFIX) === 0) {
        mobile = activeId.slice(PROFILE_PREFIX.length);
      } else {
        const cust = ((res && res.saathiCustomers) || []).find((c) => c && c.id === activeId);
        if (cust) { mobile = String(cust.mobile || ""); name = cust.name || ""; }
      }
      mobile = mobile.replace(/\D/g, "");
      if (!mobile) return; // a customer without a mobile number cannot be matched to a saved card
      chrome.storage.local.set({ [PENDING_AUTO_LOAD_KEY]: mobile, saathiPendingAutoLoadName: name, [PENDING_AUTO_LOAD_TAB_KEY]: tab.id }, () => {
        // Firefox (no chrome.action.openPopup) only - same small separate-window flow as before there.
        if (!canOpenRealPopup) openAutoLoadWindow();
      });
    });
  });
});


// ------------------------------------------------------------
// Toolbar badge for the Certificate Download job: shows how many
// certificates are still pending while it runs, and a green tick
// when everything is done — visible even with the popup closed.
// ------------------------------------------------------------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.saathiCertJob) return;
  const job = changes.saathiCertJob.newValue || {};
  const old = changes.saathiCertJob.oldValue || {};
  const records = job.records || [];
  const pending = records.filter((r) => r.status === "pending").length;
  if (job.running && pending) {
    chrome.action.setBadgeBackgroundColor({ color: "#d99a1f" });
    chrome.action.setBadgeText({ text: String(pending) });
  } else if (old.running && !job.running && records.length && !pending) {
    chrome.action.setBadgeBackgroundColor({ color: "#1f9d63" });
    chrome.action.setBadgeText({ text: "✓" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 20000);
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
});





