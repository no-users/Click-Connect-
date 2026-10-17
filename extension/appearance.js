/**
 * appearance.js
 * ------------------------------------------------------------
 * 🎨 button in the top bar: pick an accent colour (Ocean, Emerald,
 * Violet, Sunset, Rose) and screen density (Aaram se / Compact).
 * Everything is CSS-variable driven (see appTheme.css) so every tab —
 * Form, Profile, Documents, Certificates — changes together.
 * Purely visual; touches no form / profile logic.
 * ------------------------------------------------------------
 */
(function () {
  const KEY = "saathiAppearance";
  const PALETTES = [
    { id: "ocean", name: "Ocean", color: "#3b82d6" },
    { id: "emerald", name: "Emerald", color: "#1f9d6f" },
    { id: "violet", name: "Violet", color: "#6a55d6" },
    { id: "sunset", name: "Sunset", color: "#e0702d" },
    { id: "rose", name: "Rose", color: "#d6456b" },
  ];
  let state = { accent: "ocean", density: "comfortable" };

  function apply() {
    const root = document.documentElement;
    root.setAttribute("data-accent", state.accent);
    root.setAttribute("data-density", state.density);
    try { localStorage.setItem("saathiAccent", state.accent); localStorage.setItem("saathiDensity", state.density); } catch (e) {}
    render();
  }

  function save() {
    apply();
    try { chrome.storage.local.set({ [KEY]: state }); } catch (e) {}
  }

  function render() {
    const pop = document.getElementById("appearancePop");
    if (!pop) return;
    pop.querySelectorAll(".ap-swatch").forEach(b => b.classList.toggle("on", b.dataset.id === state.accent));
    pop.querySelectorAll(".ap-dens").forEach(b => b.classList.toggle("on", b.dataset.d === state.density));
  }

  function build() {
    const group = document.querySelector(".nav-actions-group");
    if (!group || document.getElementById("appearanceBtn")) return;

    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "appearanceBtn"; btn.className = "icon-nav-btn";
    btn.title = "Rang aur look badlein"; btn.textContent = "🎨";
    group.insertBefore(btn, group.firstChild);

    const cmd = document.createElement("button");
    cmd.type = "button"; cmd.id = "cmdkBtn"; cmd.className = "icon-nav-btn";
    cmd.title = "Quick actions (Ctrl+K)"; cmd.textContent = "⌘";
    group.insertBefore(cmd, group.firstChild);

    const pop = document.createElement("div");
    pop.id = "appearancePop";
    pop.hidden = true;
    pop.innerHTML = `
      <div class="ap-title">🎨 Rang chunein</div>
      <div class="ap-swatches">${PALETTES.map(p => `<button type="button" class="ap-swatch" data-id="${p.id}" title="${p.name}" style="--sw:${p.color}"><span>${p.name}</span></button>`).join("")}</div>
      <div class="ap-title">📐 Layout</div>
      <div class="ap-row">
        <button type="button" class="ap-dens" data-d="comfortable">Aaram se</button>
        <button type="button" class="ap-dens" data-d="compact">Compact</button>
      </div>
      <div class="ap-note">Theme (dark/light) alag button se badalta hai.</div>`;
    document.body.appendChild(pop);

    btn.addEventListener("click", (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; });
    document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) pop.hidden = true; });
    pop.querySelectorAll(".ap-swatch").forEach(b => b.addEventListener("click", () => { state.accent = b.dataset.id; save(); }));
    pop.querySelectorAll(".ap-dens").forEach(b => b.addEventListener("click", () => { state.density = b.dataset.d; save(); }));
    window.saathiOpenAppearance = () => { pop.hidden = false; };
    window.saathiSetAccent = (id) => { if (PALETTES.some(p => p.id === id)) { state.accent = id; save(); } };
    window.saathiPalettes = PALETTES;
    render();
  }

  function init() {
    build();
    try {
      chrome.storage.local.get([KEY], (res) => {
        if (res && res[KEY]) { state = Object.assign(state, res[KEY]); apply(); }
      });
    } catch (e) { /* not in extension context */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
