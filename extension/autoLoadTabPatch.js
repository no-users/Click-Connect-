/**
 * autoLoadTabPatch.js
 * ------------------------------------------------------------
 * Fixes the root cause of the "Fill Active Profile" shortcut / mini
 * profile switcher occasionally showing an unrelated error (e.g.
 * "Could not send message to tab", "No active tab found").
 *
 * popup.js (obfuscated, not ours to edit) sends the filled-in form to
 * the real government page via chrome.tabs.sendMessage(), and finds
 * that tab by calling chrome.tabs.query({active:true, currentWindow:
 * true}) — several times, for the initial autofill AND for every
 * cascading dropdown (district/anumandal/prakhand/police-station...).
 * That query is only correct when popup.html is the REAL action popup
 * attached to the actual browsing window. When background.js has to
 * fall back to a separate small window (openAutoLoadWindow() — Firefox,
 * or when openPopup()'s user-gesture requirement isn't met, which is
 * the common case for the mini profile switcher), "currentWindow" from
 * inside THAT window is the small window itself — which has no RTPS
 * tab — so popup.js's own query finds nothing and throws its own
 * unrelated error instead of filling anything.
 *
 * Fix: background.js stashes the id of the actual RTPS tab under
 * saathiPendingAutoLoadTabId right before opening either kind of popup
 * (see background.js's command listener and DS_OPEN_POPUP_FOR_AUTOLOAD
 * handler). This file — loaded BEFORE popup.js, so the patch is in
 * place before popup.js ever calls chrome.tabs.query itself —
 * transparently redirects any {active:true, currentWindow:true} query
 * to that exact tab whenever the flag is present, so popup.js's own
 * internal messaging reaches the right tab regardless of which kind of
 * window this popup is running in.
 *
 * One-shot: the stashed tab id is read and cleared immediately, and
 * only takes effect for this one popup open — a normal, non-auto-load
 * popup open is completely unaffected (chrome.tabs.query behaves
 * exactly as it always has).
 * ------------------------------------------------------------
 */
(function () {
  const TAB_KEY = "saathiPendingAutoLoadTabId";

  if (!chrome.tabs || typeof chrome.tabs.query !== "function") return;

  let overrideTabId = null;
  const originalQuery = chrome.tabs.query.bind(chrome.tabs);

  function isActiveCurrentWindowQuery(queryInfo) {
    if (!queryInfo || typeof queryInfo !== "object") return false;
    const keys = Object.keys(queryInfo);
    return keys.length === 2 && queryInfo.active === true && queryInfo.currentWindow === true;
  }

  chrome.tabs.query = function (queryInfo, callback) {
    if (overrideTabId !== null && isActiveCurrentWindowQuery(queryInfo) && typeof callback === "function") {
      chrome.tabs.get(overrideTabId, (tab) => {
        // If the stashed tab no longer exists (closed in the meantime),
        // fall back to the original query instead of returning nothing.
        if (chrome.runtime.lastError || !tab) {
          originalQuery(queryInfo, callback);
          return;
        }
        callback([tab]);
      });
      return undefined;
    }
    return originalQuery(queryInfo, callback);
  };

  // Read + clear the one-shot flag as early as possible (well before
  // any click could trigger popup.js's own chrome.tabs.query calls).
  chrome.storage.local.get([TAB_KEY], (res) => {
    const tabId = res && res[TAB_KEY];
    if (typeof tabId === "number") {
      overrideTabId = tabId;
      chrome.storage.local.remove(TAB_KEY);
    }
  });
})();
