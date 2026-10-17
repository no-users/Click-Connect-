/**
 * miniProfileSwitcher.js
 * ------------------------------------------------------------
 * A small floating search box (bottom-left of the government page)
 * so the operator can switch to a different saved customer without
 * clicking the extension icon and searching inside the popup.
 *
 * Data source: saathiProfileIndex — a lightweight {mobile, name}
 * list that docProfileLink.js keeps refreshed in chrome.storage.local
 * every time the popup's saved-profile list renders. This file never
 * touches popup.js's own (obfuscated) full profile records — only
 * this small mirror, purely for search suggestions.
 *
 * Picking a result reuses the exact same safe hand-off as the
 * "Fill Active Profile" keyboard shortcut (background.js +
 * shortcutAutoLoad.js): it stashes the chosen mobile number and asks
 * background.js to open the popup, which then auto-clicks that
 * customer's real "Load" button and closes itself. This file never
 * re-implements the actual form-filling logic.
 *
 * Visual language matches the popup's own theme (navy/gold, avatar
 * initials, pop/slide animations) so switching a customer on the
 * government page feels like the same product, not a bolted-on box.
 * ------------------------------------------------------------
 */

(function () {
  const INDEX_KEY = "saathiProfileIndex";
  const PENDING_KEY = "saathiPendingAutoLoadMobile";
  const MAX_RESULTS = 8;

  // Same navy/gold-leaning gradient pairs as profileCardEnhancer.js's
  // AVATAR_PALETTE, kept in sync by eye so a customer's avatar colour
  // looks the same here as it does inside the popup.
  const AVATAR_PALETTE = [
    ["#1c2b4a", "#3a4d78"],
    ["#b9832f", "#d9a44e"],
    ["#3f6b52", "#5c9373"],
    ["#7a3b3b", "#a5574f"],
    ["#3b5f7a", "#5c8aa5"],
    ["#6b4a7a", "#8f66a5"],
  ];

  function initials(name) {
    const words = (name || "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  let root = null;
  let toggleBtn = null;
  let panel = null;
  let input = null;
  let resultsEl = null;
  let toastEl = null;
  let toastHideTimer = null;

  function css(el, styles) {
    el.style.cssText = styles.join(";");
  }

  function injectStyles() {
    if (document.getElementById("saathiSwitcherStyles")) return;
    const style = document.createElement("style");
    style.id = "saathiSwitcherStyles";
    style.textContent = `
      @keyframes saathiSwitcherIn {
        from { opacity: 0; transform: translateY(8px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes saathiSwitcherRowIn {
        from { opacity: 0; transform: translateX(-4px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes saathiSwitcherToastIn {
        from { opacity: 0; transform: translateY(8px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes saathiSwitcherSpin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
      .saathi-switcher-toggle {
        display: inline-flex; align-items: center; gap: 6px;
        background: linear-gradient(135deg, #24365c 0%, #14203a 100%);
        color: #fff; border: 1px solid rgba(217, 164, 78, 0.55);
        border-radius: 999px; padding: 9px 15px 9px 13px;
        font-size: 12.5px; font-weight: 700; cursor: pointer;
        font-family: Arial, sans-serif;
        box-shadow: 0 8px 20px -6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
        transition: transform 0.15s cubic-bezier(0.16,1,0.3,1), box-shadow 0.15s ease;
      }
      .saathi-switcher-toggle:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 26px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);
      }
      .saathi-switcher-toggle:active { transform: translateY(0) scale(0.97); }
      .saathi-switcher-chevron { display: inline-block; font-size: 9px; opacity: 0.7; transition: transform 0.2s ease; }
      .saathi-switcher-toggle-open .saathi-switcher-chevron { transform: rotate(180deg); }

      .saathi-switcher-panel {
        position: absolute; bottom: 50px; left: 0; width: 246px;
        background: linear-gradient(165deg, #ffffff 0%, #f6f9fd 100%);
        border-radius: 14px;
        border: 1px solid rgba(217, 164, 78, 0.35);
        border-top: 3px solid #d9a44e;
        box-shadow: 0 18px 42px -14px rgba(15, 23, 42, 0.4);
        padding: 10px; box-sizing: border-box;
        max-height: 300px;
        display: flex; flex-direction: column; gap: 7px;
        font-family: Arial, sans-serif;
        transform-origin: bottom left;
        opacity: 0; transform: translateY(8px) scale(0.95);
        pointer-events: none;
        transition: opacity 0.16s cubic-bezier(0.16,1,0.3,1), transform 0.16s cubic-bezier(0.16,1,0.3,1);
      }
      .saathi-switcher-panel-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }

      .saathi-switcher-input {
        width: 100%; box-sizing: border-box; padding: 9px 12px 9px 30px;
        font-size: 12.5px; border: 1.5px solid #e2e8f0; border-radius: 999px;
        outline: none; color: #1c2b4a;
        background: #f8fafc url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="%2364748b" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>') no-repeat 10px center / 12px 12px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .saathi-switcher-input:focus { border-color: #d9a44e; box-shadow: 0 0 0 3px rgba(217,164,78,0.25); }

      .saathi-switcher-results { overflow-y: auto; max-height: 220px; display: flex; flex-direction: column; gap: 2px; }

      .saathi-switcher-row {
        display: flex; align-items: center; gap: 8px;
        text-align: left; background: transparent; border: none; border-radius: 9px;
        padding: 6px 7px; font-size: 12px; cursor: pointer; color: #1c2b4a;
        width: 100%; box-sizing: border-box;
        transition: background 0.12s ease, transform 0.12s ease;
        animation: saathiSwitcherRowIn 0.18s cubic-bezier(0.16,1,0.3,1) both;
      }
      .saathi-switcher-row:hover { background: #eef2f8; transform: translateX(2px); }
      .saathi-switcher-row-avatar {
        width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 10px; font-weight: 700;
        box-shadow: 0 2px 6px -1px rgba(28,34,51,0.3);
      }
      .saathi-switcher-row-text { display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
      .saathi-switcher-row-name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .saathi-switcher-row-mobile { font-size: 10px; color: #8592a8; }

      .saathi-switcher-empty { font-size: 11.5px; color: #8592a8; padding: 10px 6px; text-align: center; }

      .saathi-switcher-toast {
        position: fixed; bottom: 56px; left: 14px; z-index: 2147483647;
        display: inline-flex; align-items: center; gap: 6px;
        background: linear-gradient(135deg, #24365c 0%, #14203a 100%);
        color: #fff; font-size: 12px; font-weight: 600;
        font-family: Arial, sans-serif;
        padding: 7px 13px; border-radius: 999px;
        border: 1px solid rgba(217, 164, 78, 0.5);
        box-shadow: 0 10px 24px -8px rgba(0,0,0,0.45);
        animation: saathiSwitcherToastIn 0.2s cubic-bezier(0.16,1,0.3,1);
      }
      .saathi-switcher-toast-out { opacity: 0; transform: translateY(6px) scale(0.96); transition: opacity 0.18s ease, transform 0.18s ease; }
      .saathi-switcher-toast-icon { display: inline-block; animation: saathiSwitcherSpin 0.6s ease-in-out; }
    `;
    document.documentElement.appendChild(style);
  }

  function buildUI() {
    if (root) return root;
    injectStyles();

    root = document.createElement("div");
    root.id = "saathi-mini-switcher-root";
    css(root, ["position:fixed", "bottom:14px", "left:14px", "z-index:2147483646", "font-family:Arial, sans-serif"]);

    toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "saathi-switcher-toggle";
    toggleBtn.innerHTML = `🛒 <span>Profiles</span> <span class="saathi-switcher-chevron">▾</span>`;
    toggleBtn.addEventListener("click", () => togglePanel());

    panel = document.createElement("div");
    panel.className = "saathi-switcher-panel";

    input = document.createElement("input");
    input.type = "text";
    input.className = "saathi-switcher-input";
    input.placeholder = "Naam ya mobile type karein...";
    input.addEventListener("input", () => renderResults(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") togglePanel(false);
    });

    resultsEl = document.createElement("div");
    resultsEl.className = "saathi-switcher-results";

    panel.appendChild(input);
    panel.appendChild(resultsEl);
    root.appendChild(panel);
    root.appendChild(toggleBtn);
    document.body.appendChild(root);
    return root;
  }

  function togglePanel(force) {
    const show = force !== undefined ? force : !panel.classList.contains("saathi-switcher-panel-open");
    panel.classList.toggle("saathi-switcher-panel-open", show);
    toggleBtn.classList.toggle("saathi-switcher-toggle-open", show);
    if (show) {
      input.value = "";
      input.focus();
      renderResults("");
    }
  }

  function getIndex() {
    return new Promise((resolve) => {
      chrome.storage.local.get([INDEX_KEY], (res) => resolve((res && res[INDEX_KEY]) || []));
    });
  }

  async function renderResults(query) {
    const index = await getIndex();
    const q = query.trim().toLowerCase();
    const matches = (q
      ? index.filter((p) => (p.name || "").toLowerCase().includes(q) || (p.mobile || "").includes(q))
      : index
    ).slice(0, MAX_RESULTS);

    resultsEl.innerHTML = "";
    if (index.length === 0) {
      const empty = document.createElement("div");
      empty.className = "saathi-switcher-empty";
      empty.textContent = "Koi Card Nhi Hai, Profile Se Save Kre";
      resultsEl.appendChild(empty);
      return;
    }
    if (matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "saathi-switcher-empty";
      empty.textContent = "🔍 Kuch nahi mila.";
      resultsEl.appendChild(empty);
      return;
    }

    matches.forEach((p, idx) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "saathi-switcher-row";
      row.style.animationDelay = `${idx * 25}ms`;

      const [c1, c2] = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
      const avatar = document.createElement("span");
      avatar.className = "saathi-switcher-row-avatar";
      avatar.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
      avatar.textContent = initials(p.name);

      const text = document.createElement("span");
      text.className = "saathi-switcher-row-text";
      const nameEl = document.createElement("span");
      nameEl.className = "saathi-switcher-row-name";
      nameEl.textContent = p.name || "(naam nahi)";
      const mobileEl = document.createElement("span");
      mobileEl.className = "saathi-switcher-row-mobile";
      mobileEl.textContent = p.mobile || "";
      text.appendChild(nameEl);
      text.appendChild(mobileEl);

      row.appendChild(avatar);
      row.appendChild(text);
      row.addEventListener("click", () => selectProfile(p));
      resultsEl.appendChild(row);
    });
  }

  function showToast(text) {
    if (toastHideTimer) clearTimeout(toastHideTimer);
    if (toastEl) toastEl.remove();

    toastEl = document.createElement("div");
    toastEl.className = "saathi-switcher-toast";

    const icon = document.createElement("span");
    icon.className = "saathi-switcher-toast-icon";
    icon.textContent = "🔄";
    const label = document.createElement("span");
    label.textContent = text;

    toastEl.appendChild(icon);
    toastEl.appendChild(label);
    document.body.appendChild(toastEl);

    toastHideTimer = setTimeout(() => {
      if (!toastEl) return;
      toastEl.classList.add("saathi-switcher-toast-out");
      setTimeout(() => {
        if (toastEl) {
          toastEl.remove();
          toastEl = null;
        }
      }, 200);
    }, 1800);
  }

  function selectProfile(p) {
    togglePanel(false);
    showToast(`Switching to ${p.name || p.mobile}...`);
    // Fire both without awaiting each other — background.js's
    // openPopup() call needs to happen as close to this click as
    // possible; shortcutAutoLoad.js already polls briefly for the
    // pending mobile, so a few ms of ordering slack here is fine.
    // Name travels with the number: two saved profiles can share one mobile.
    chrome.storage.local.set({ [PENDING_KEY]: p.mobile, saathiPendingAutoLoadName: p.name || "" });
    chrome.runtime.sendMessage({ type: "DS_OPEN_POPUP_FOR_AUTOLOAD" });
  }

  function init() {
    buildUI();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
