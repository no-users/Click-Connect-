/**
 * shortcutAutoLoad.js
 * ------------------------------------------------------------
 * Handles the popup-side half of the "Fill Active Profile" keyboard
 * shortcut (Ctrl+Shift+L by default) and the mini profile switcher's
 * "pick a customer" flow. background.js stashes the active profile's
 * mobile number under saathiPendingAutoLoadMobile and then opens this
 * popup (the real action popup when possible, so popup.js's own
 * internal tab-messaging logic still targets the correct browsing
 * window — see background.js's openAutoLoadPreferReal() for why that
 * matters) — the moment it opens, this script:
 *   1. Reads that one-shot flag (and immediately clears it, so a
 *      later MANUAL popup-open never re-triggers this).
 *   2. Finds the matching saved-profile card in #savedList.
 *   3. Clicks that card's real "Load" button — the exact same
 *      button the operator would click by hand, wired by popup.js
 *      itself — so the actual fill logic is never re-implemented
 *      or guessed at here.
 *   4. Waits briefly for that click's effects (popup.js filling
 *      #dataForm, docProfileLink.js switching the active profile)
 *      to finish, then closes the popup automatically.
 *
 * If the popup was opened normally (no pending flag), or the
 * matching card never appears, this script does nothing and the
 * popup behaves exactly as it always has.
 *
 * 100% additive, same spirit as docProfileLink.js — reads the DOM
 * only, never touches popup.js's internals directly. Load LAST in
 * popup.html so every card is already rendered and wired.
 * ------------------------------------------------------------
 */

(function () {
  const PENDING_KEY = "saathiPendingAutoLoadMobile";
  const MAX_ATTEMPTS = 20; // ~20 x 150ms = 3s max wait for #savedList to render
  const CLOSE_DELAY_MS = 700; // time for the real Load click's effects to finish

  function findButton(card, keyword) {
    const byClass = card.querySelector(`.saathi-btn-${keyword}`);
    if (byClass) return byClass;
    return Array.from(card.querySelectorAll("button")).find((b) =>
      b.textContent.trim().toLowerCase().includes(keyword)
    );
  }

  function extractMobile(card) {
    const idLine = card.querySelector(".saathi-userid");
    if (idLine) {
      const fromIdLine = (idLine.textContent || "").match(/\d{10}/);
      if (fromIdLine) return fromIdLine[0];
    }
    const match = (card.textContent || "").match(/\b\d{10}\b/);
    return match ? match[0] : "";
  }

  function cardName(card) {
    const h2 = card.querySelector("h2");
    if (!h2) return "";
    const clone = h2.cloneNode(true);
    const badge = clone.querySelector(".saathi-doc-badge");
    if (badge) badge.remove();
    return clone.textContent.replace(/^\s*\d+\.\s*/, "").trim().toLowerCase();
  }

  // Several saved profiles can share one mobile number, so when the caller
  // also gave a name, prefer the card with BOTH (falls back to number only).
  let pendingName = "";
  function findCardByMobile(mobile) {
    const cards = Array.from(document.querySelectorAll("#savedList > div")).filter((c) => extractMobile(c) === mobile);
    if (pendingName) {
      const want = pendingName.toLowerCase();
      const exact = cards.find((c) => cardName(c) === want) || cards.find((c) => cardName(c).includes(want) || want.includes(cardName(c)));
      if (exact) return exact;
    }
    return cards[0] || null;
  }

  function tryAutoLoad(mobile, attemptsLeft) {
    const card = findCardByMobile(mobile);
    if (card) {
      const loadBtn = findButton(card, "load") || findButton(card, "update");
      if (loadBtn) {
        loadBtn.click();
        setTimeout(() => window.close(), CLOSE_DELAY_MS);
        return;
      }
    }
    if (attemptsLeft > 0) {
      // #savedList may still be rendering right after the popup opened
      // — retry briefly instead of giving up immediately.
      setTimeout(() => tryAutoLoad(mobile, attemptsLeft - 1), 150);
    }
    // Never found it in time — leave the popup open normally so the
    // operator can just load it by hand, same as always.
  }

  function waitForPendingMobile(attemptsLeft) {
    chrome.storage.local.get([PENDING_KEY, "saathiPendingAutoLoadName"], (res) => {
      const mobile = res && res[PENDING_KEY];
      if (mobile) {
        pendingName = (res && res.saathiPendingAutoLoadName) || "";
        chrome.storage.local.remove(["saathiPendingAutoLoadName"]);
        chrome.storage.local.remove(PENDING_KEY); // one-shot
        tryAutoLoad(mobile, MAX_ATTEMPTS);
        return;
      }
      if (attemptsLeft > 0) {
        // background.js may not have set the flag yet (it opens the
        // popup first, on purpose, to preserve the shortcut's user
        // gesture) — retry briefly instead of giving up immediately.
        setTimeout(() => waitForPendingMobile(attemptsLeft - 1), 100);
      }
      // Never appeared — popup was opened normally, not via the
      // shortcut. Do nothing; behaves exactly as it always has.
    });
  }

  waitForPendingMobile(10); // ~1s max wait for background.js to set the flag
})();
