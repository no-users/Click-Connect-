/**
 * activeProfileBadge.js
 * ------------------------------------------------------------
 * Shows a small fixed badge on the government page reading
 * "Active: <Name>" for whichever customer's profile is currently
 * active. This is docStore.js's own persistent "active profile"
 * concept (saathiActiveProfileLabel) — set the moment a saved
 * profile's Load/Update button is clicked, and kept until the
 * operator switches to a different one — this file only displays it.
 *
 * Purpose: before pressing the "Fill Active Profile" shortcut
 * (see background.js + shortcutAutoLoad.js), the operator can glance
 * at this badge and confirm it's really the right customer — exactly
 * the safety-check discussed, without adding an extra click/confirm
 * dialog on every single fill.
 *
 * Purely additive/read-only — loaded right after docStore.js so
 * DocStore is available; makes no changes to any form field.
 * ------------------------------------------------------------
 */

(function () {
  const ACTIVE_LABEL_KEY = "saathiActiveProfileLabel";
  let badgeEl = null;

  // Shared premium pill look for the little on-page floating badges
  // (this one + enclosureAutoFill.js's "Active" badge). Injected once,
  // guarded by id, so whichever of the two files runs first wins and
  // the other's call is a harmless no-op — no load-order dependency.
  function injectBadgeStyles() {
    if (document.getElementById("saathiOnPageBadgeStyles")) return;
    const style = document.createElement("style");
    style.id = "saathiOnPageBadgeStyles";
    style.textContent = `
     @keyframes saathiBadgeIn {
  0% { 
    opacity: 0; 
    transform: translateY(-8px) scale(0.9); 
  }
  100% { 
    opacity: 1; 
    transform: translateY(0) scale(1); 
  }
}

@keyframes saathiDotPulse {
  0% { 
    box-shadow: 0 0 0 0 rgba(14, 243, 90, 0.65); 
  }
  70% { 
    box-shadow: 0 0 0 6px rgba(14, 243, 90, 0); 
  }
  100% { 
    box-shadow: 0 0 0 0 rgba(14, 243, 90, 0); 
  }
}

@keyframes saathiValueShimmer { 
  to { 
    background-position: -200% center; 
  } 
}

.saathi-onpage-badge {
  /* Layout & Spacing */
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px; /* Important: Isse text aur border ke beech achha space aayega */
  
  /* Modern Typography */
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.3px;
  color: #ffffff;
  
  /* Premium Dark Gradient & Golden Accent */
  background: linear-gradient(135deg, #2c3228 0%, #151a28 100%);
  border: 1px solid rgba(217, 164, 78, 0.45);
  border-radius: 999px;
  
  /* 3D Depth & Glass Effect */
  box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  
  /* Smooth Bounce Animation */
  animation: saathiBadgeIn 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
}

.saathi-onpage-badge .saathi-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #0ef35a;
  flex-shrink: 0;
  
  /* Inner glow aur matching pulse shadow */
  box-shadow: 0 0 6px rgba(14, 243, 90, 0.4); 
  animation: saathiDotPulse 2s ease-out infinite;
}
      .saathi-onpage-badge .saathi-label { opacity: 0.8; font-weight: 600; }
      .saathi-onpage-badge .saathi-value {
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 170px;
        display: inline-block;
        vertical-align: middle;
        /* Slow gold shimmer sweep across the customer's name — a
           small "premium" flourish, not distracting since it's slow. */
        background: linear-gradient(90deg, #eabd6a 0%, #fff5da 50%, #eabd6a 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: saathiValueShimmer 2.5s linear infinite;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureBadge() {
    if (badgeEl && document.body.contains(badgeEl)) return badgeEl;
    injectBadgeStyles();
    badgeEl = document.createElement("div");
    badgeEl.id = "saathi-active-profile-badge";
    badgeEl.className = "saathi-onpage-badge";
    badgeEl.style.cssText = [
      "position:fixed",
      "bottom:10px",
      "right:10px",
      "z-index:2147483647",
      "font-size:12px",
      "padding:6px 13px 6px 11px",
      "pointer-events:none",
      "max-width:270px",
    ].join(";");
    document.body.appendChild(badgeEl);
    return badgeEl;
  }

  function applyLabel(label) {
    if (!label) {
      if (badgeEl) {
        badgeEl.remove();
        badgeEl = null;
      }
      return;
    }
    const el = ensureBadge();
    // Build the structure once; only the name text changes after that
    // — keeps the dot's pulse animation from restarting on every
    // storage update, and keeps the customer name out of innerHTML.
    if (!el.querySelector(".saathi-value")) {
      el.innerHTML = `<span class="saathi-dot"></span><span class="saathi-label"></span><span class="saathi-value"></span>`;
    }
    el.querySelector(".saathi-value").textContent = label;
  }

  function render() {
    // Read the stored label directly — this is exactly what
    // docProfileLink.js set (from the card that was Loaded), and is
    // authoritative. We deliberately do NOT call
    // DocStore.getActiveProfileLabel() here: that function re-derives
    // the label from THIS page's own #name/#mobile fields, which can
    // still hold the PREVIOUS customer's values for a moment after
    // switching (popup.js's fill-into-page hasn't landed yet) — using
    // it here would overwrite the just-switched label with stale data.
    chrome.storage.local.get([ACTIVE_LABEL_KEY], (res) => {
      applyLabel(res && res[ACTIVE_LABEL_KEY]);
    });
  }

  // Live-update if the active profile changes while this page is open
  // (e.g. switched to a different saved customer from the popup) —
  // use the new value straight from the change event, no extra read.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[ACTIVE_LABEL_KEY]) {
      applyLabel(changes[ACTIVE_LABEL_KEY].newValue);
    }
  });

  if (document.body) {
    render();
  } else {
    document.addEventListener("DOMContentLoaded", render);
  }
})();
