/**
 * emptyStates.js
 * ------------------------------------------------------------
 * #savedList's content (the actual profile cards) is rendered by
 * the obfuscated popup.js core — too risky to edit directly. This
 * file only WATCHES it from the outside (MutationObserver) and
 * inserts/removes a friendly placeholder message when it's empty,
 * without touching how popup.js itself renders profiles.
 * ------------------------------------------------------------
 */
(function () {
  const PLACEHOLDER_ID = "saathiEmptyProfiles";

  function isTrulyEmpty(list) {
    // Ignore our own placeholder when counting — only real profile
    // card elements (popup.js gives each one an <h2> inside) count.
    return !Array.from(list.children).some(
      (el) => el.id !== PLACEHOLDER_ID && el.querySelector && el.querySelector("h2")
    );
  }

  function sync() {
    const list = document.getElementById("savedList");
    if (!list) return;
    const existing = document.getElementById(PLACEHOLDER_ID);
    if (isTrulyEmpty(list)) {
      if (existing) return;
      const el = document.createElement("div");
      el.id = PLACEHOLDER_ID;
      el.className = "saathi-empty-state saathi-empty-profiles";
      el.innerHTML = `
        <span class="saathi-empty-icon">🗃️</span>
        <span class="saathi-empty-title">Abhi koi profile save nahi hai</span>
        <span class="saathi-empty-sub">Upar "+ Create Profile" dabakar pehli profile banayein</span>
      `;
      list.appendChild(el);
    } else if (existing) {
      existing.remove();
    }
  }

  function init() {
    const list = document.getElementById("savedList");
    if (!list) { setTimeout(init, 100); return; }
    sync();
    new MutationObserver(sync).observe(list, { childList: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
