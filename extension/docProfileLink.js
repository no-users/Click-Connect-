/**
 * docProfileLink.js
 * ------------------------------------------------------------
 * Connects the Profile tab's saved-profile cards (rendered by the
 * obfuscated popup.js — Load / Update / Delete buttons per card) to
 * docStore.js's per-customer documents, so:
 *
 *   - Clicking "Load" or "Update" on a saved profile switches the
 *     Documents panel (enclosureDocsPanel.js, inside the Form tab)
 *     over to THAT customer's documents — view, add, or remove them
 *     right there, same as editing the rest of the profile.
 *   - Clicking "Delete" on a saved profile (after popup.js's own
 *     confirm dialog actually removes the card) also removes that
 *     customer's saved documents, so nothing orphaned is left behind.
 *
 * Customers are matched by mobile number (read straight off the
 * rendered card — same value already shown in the "ID: ..." line),
 * since that's the one stable, unique value available without
 * touching popup.js's own (obfuscated) internals.
 *
 * 100% additive — only reads the DOM and calls docStore.js. Does not
 * modify content.js / popup.js or their click handlers.
 * ------------------------------------------------------------
 */

(function () {
  function findButton(card, keyword) {
    const byClass = card.querySelector(`.saathi-btn-${keyword}`);
    if (byClass) return byClass;
    return Array.from(card.querySelectorAll("button")).find((b) =>
      b.textContent.trim().toLowerCase().includes(keyword)
    );
  }

  function extractMobile(card) {
    // Prefer the dedicated mobile/ID line if profileCardEnhancer.js has
    // already run (its digits are guaranteed clean, no stray numbers
    // from a serial badge or anything else on the card) — falls back to
    // scanning the whole card so this still works even if that script
    // hasn't run yet / is ever removed. This matters: getting the wrong
    // mobile here would mix one customer's documents into another's.
    const idLine = card.querySelector(".saathi-userid");
    if (idLine) {
      const fromIdLine = (idLine.textContent || "").match(/\d{10}/);
      if (fromIdLine) return fromIdLine[0];
    }
    const match = (card.textContent || "").match(/\b\d{10}\b/);
    return match ? match[0] : "";
  }

  function extractName(card) {
    const h2 = card.querySelector("h2");
    if (!h2) return "";
    // addCompletionBadge() below appends the "📄 N" doc-count badge as a
    // CHILD of this same h2 (so it sits right next to the name visually).
    // That means h2.textContent also includes the badge's text — read
    // straight from it and every saved profile's name would come out as
    // "Ramesh Kumar📄 0" instead of "Ramesh Kumar" (this fed the
    // saathiProfileIndex mirror, so the mini switcher's list showed the
    // polluted name too). Clone the h2 and drop the badge first so only
    // the actual name text remains.
    const clone = h2.cloneNode(true);
    const badge = clone.querySelector(".saathi-doc-badge");
    if (badge) badge.remove();
    return clone.textContent.replace(/^\s*\d+\.\s*/, "").trim();
  }

  function refreshDocsUI() {
    if (window.SaathiEnclosureDocsPanel && typeof window.SaathiEnclosureDocsPanel.refresh === "function") {
      window.SaathiEnclosureDocsPanel.refresh();
    }
  }

  async function onOpenProfile(card) {
    if (typeof DocStore === "undefined") return;
    const mobile = extractMobile(card);
    const name = extractName(card);
    // Small delay so popup.js has finished writing name/mobile/etc.
    // into #dataForm before we switch — avoids a flash of the wrong
    // "for <name>" label if it read the form instead of the card.
    await DocStore.switchToProfile(mobile, name);
    refreshDocsUI();
  }

  async function onDeleteProfile(card) {
    if (typeof DocStore === "undefined") return;
    const mobile = extractMobile(card);
    const name = extractName(card); // read NOW — the card disappears once deletion is confirmed
    if (!mobile) return;
    // popup.js's own click handler shows a native confirm() and only
    // removes the card from #savedList if the operator accepts it —
    // so wait for the card to actually disappear before deleting its
    // documents (if the operator cancels, the card stays and nothing
    // here happens).
    for (let tries = 0; tries < 40; tries++) {
      if (!document.body.contains(card)) {
        await DocStore.deleteProfileDocs(mobile, name); // by mobile AND name: others on this number keep their documents
        refreshDocsUI();
        return;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async function addCompletionBadge(card, mobile) {
    if (!mobile || typeof DocStore === "undefined") return;
    const cardName = extractName(card);
    let badge = card.querySelector(".saathi-doc-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "saathi-doc-badge";
      // Sizing/placement stays inline (layout concern); the gold/navy
      // pill look + pulse-on-active now lives in popup.html's
      // .saathi-doc-badge / .saathi-doc-badge-active CSS classes, so
      // it matches the rest of the app's premium theme automatically
      // (and follows light/dark mode) instead of a hardcoded flat navy.
      badge.style.cssText = "margin-left:6px;vertical-align:middle;";
      const h2 = card.querySelector("h2");
      if (h2) h2.appendChild(badge);
      else card.insertBefore(badge, card.firstChild);
    }
    const count = await DocStore.getDocsCountForMobile(mobile, cardName);
    badge.textContent = count > 0 ? `📄 ${count}` : "📄 0";
    badge.title = count > 0 ? `${count} document(s) uploaded` : "Koi document upload nahi hui";
    badge.classList.toggle("saathi-doc-badge-active", count > 0);
  }

  async function refreshActiveCardBadge() {
    const mobileEl = document.getElementById("mobile");
    const digits = mobileEl ? mobileEl.value.replace(/\D/g, "") : "";
    if (digits.length !== 10) return;
    const cards = document.querySelectorAll("#savedList > div");
    // Several saved profiles can share one number — refresh every one of them.
    for (const card of cards) {
      if (extractMobile(card) === digits) await addCompletionBadge(card, digits);
    }
  }

  function wireCard(card) {
    if (card.dataset.saathiDocLinkWired) return;
    card.dataset.saathiDocLinkWired = "1";

    const loadBtn = findButton(card, "load");
    const updateBtn = findButton(card, "update");
    const deleteBtn = findButton(card, "delete");

    if (loadBtn) loadBtn.addEventListener("click", () => setTimeout(() => onOpenProfile(card), 80));
    if (updateBtn) updateBtn.addEventListener("click", () => setTimeout(() => onOpenProfile(card), 80));
    if (deleteBtn) deleteBtn.addEventListener("click", () => onDeleteProfile(card));

    card.style.cursor = "pointer";

    // Clicking anywhere else on the card (not a button) ALSO marks it
    // active immediately — operators think of clicking/selecting a
    // saved customer's card as "choosing" them, separately from
    // pressing Load/Update specifically. This only sets the active
    // pointer (updates the badge) — it does not fill the government
    // page; that still needs Load/Update as before.
    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return; // Load/Update/Delete already handle their own click
      onOpenProfile(card);
    });

    const mobile = extractMobile(card);
    if (mobile) addCompletionBadge(card, mobile);
  }

  function updateProfileIndex() {
    // Lightweight name+mobile-only mirror of the saved-profile cards,
    // kept in chrome.storage.local (shared across all extension
    // contexts) so the on-page mini profile switcher — which runs as
    // a content script and has no access to this popup's own DOM —
    // can still offer a searchable list, without ever touching
    // popup.js's own (obfuscated) full profile records.
    const cards = document.querySelectorAll("#savedList > div");
    const index = [];
    cards.forEach((card) => {
      const mobile = extractMobile(card);
      const name = extractName(card);
      if (mobile) index.push({ mobile, name });
    });
    chrome.storage.local.set({ saathiProfileIndex: index });
  }

  function wireAll() {
    document.querySelectorAll("#savedList > div").forEach(wireCard);
    updateProfileIndex();
  }

  function init() {
    const list = document.getElementById("savedList");
    if (!list) return;
    wireAll(); // in case it's already populated
    const observer = new MutationObserver(() => wireAll());
    observer.observe(list, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Exposed so enclosureDocsPanel.js can keep the Profile tab's badge
  // for whichever customer is currently open in sync the moment a
  // document is added/removed — without needing to reopen that tab.
  window.SaathiProfileBadges = { refreshActive: refreshActiveCardBadge };
})();
