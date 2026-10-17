/**
 * landingScreen.js
 * ------------------------------------------------------------
 * Shows a minimal "pick a profile and fill" screen as soon as the
 * popup opens. The full app (header, Form/Profile/Documents tabs —
 * everything already built) is NOT modified in any way; it's just
 * covered by this overlay until "Create Profile" is pressed, at
 * which point the overlay is hidden and the existing app is
 * revealed exactly as it already was.
 *
 * Nothing here reimplements storage/load logic — "Fill" proxy-
 * clicks the real Load button on the matching saved-profile card,
 * and "Create Profile" proxy-clicks the real #addNewRecord button.
 * ------------------------------------------------------------
 */

(function () {

  function $(id) { return document.getElementById(id); }

  function toast(message, kind = "info") { return window.saathiToast(message, kind); }

  function getProfileCards() { return window.saathiGetProfileCards(); }

  function findButton(card, keyword) {
    const byClass = card.querySelector(`.saathi-btn-${keyword}`);
    if (byClass) return byClass;
    return Array.from(card.querySelectorAll("button")).find(
      (b) => b.textContent.trim().toLowerCase().includes(keyword)
    );
  }

  function refreshDropdown() {
    const select = $("landingProfileSelect");
    if (!select) return;
    const cards = getProfileCards();
    const prevValue = select.value;

    select.innerHTML = `<option value="">Select Profile </option>`;
    cards.forEach((entry, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = entry.name;
      select.appendChild(opt);
    });

    if (cards[Number(prevValue)]) select.value = prevValue;

    $("landingEmptyMsg").style.display = cards.length ? "none" : "block";
    $("landingFillBtn").disabled = cards.length === 0;
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "saathiLandingOverlay";
    overlay.innerHTML = `
      <img src="brand/app-icon.svg" class="landing-logo" alt="Click &amp; Continue">
      <div class="landing-header">
        <div class="landing-header-brand">Digital <span class="landing-header-accent">Saathi</span></div>
        <div class="landing-header-tagline">Page Auto Update</div>
      </div>
      <div class="landing-card">
        <div class="landing-label">Select Profile</div>
        <select id="landingProfileSelect" class="landing-select"></select>
        <div id="landingEmptyMsg" class="landing-empty">
          No profiles use Create Profile
        </div>
        <button type="button" id="landingFillBtn" class="landing-fill-btn">Update Page</button>
      </div>
      <button type="button" id="landingCreateBtn" class="landing-create-btn">+ Create Profile</button>
    `;
    return overlay;
  }

  function revealFullApp() {
    const overlay = $("saathiLandingOverlay");
    if (overlay) overlay.style.display = "none";
    document.body.classList.remove("saathi-landing-active");
    const addBtn = $("addNewRecord");
    if (addBtn) addBtn.click();
  }

  function init() {
    if ($("saathiLandingOverlay")) return;

    const overlay = buildOverlay();
    document.body.appendChild(overlay);
    document.body.classList.add("saathi-landing-active");

    // Force popup.js to render the saved-profile list in the background
    // (it's normally only built when the hidden Profile tab is opened)
    // so our dropdown has something to show, without the user ever
    // seeing that tab switch happen.
    const savedTabBtn = $("tab-saved");
    if (savedTabBtn) savedTabBtn.click();

    refreshDropdown();
    const list = $("savedList");
    if (list) new MutationObserver(refreshDropdown).observe(list, { childList: true, subtree: true });

    $("landingFillBtn").addEventListener("click", () => {
      const select = $("landingProfileSelect");
      const idx = select.value;
      if (idx === "") {
        toast("Please select a profile first.", "warn");
        return;
      }
      const entry = getProfileCards()[Number(idx)];
      if (!entry) return;
      const btn = findButton(entry.card, "load");
      if (btn) {
        btn.click();
        toast("Filling in profile…", "success");
      } else {
        toast("Couldn't find the Load button for this profile.", "warn");
      }
    });

    $("landingCreateBtn").addEventListener("click", revealFullApp);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
