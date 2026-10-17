/**
 * saathiShared.js
 * ------------------------------------------------------------
 * Small helpers shared across the additive "premium" feature files.
 * Loaded ONCE, before everything else that uses it — instead of an
 * identical toast() implementation being copy-pasted into 9 separate
 * files (cloudBackupToggle, importExport, landingScreen, docsTab,
 * premiumFeatures.js through premiumFeatures5.js). Each of those
 * files still calls their own local `toast(...)` / `showToast(...)`
 * exactly as before — those are now just a 1-line delegate to
 * window.saathiToast, so nothing else about them had to change.
 * ------------------------------------------------------------
 */
(function () {
  const ICONS = { info: "ℹ️", success: "✅", warn: "⚠️", error: "⚠️" };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function saathiToast(message, kind = "info", actionLabel, onAction) {
    let el = document.getElementById("saathiToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "saathiToast";
      document.body.appendChild(el);
    }
    el.innerHTML = `<span class="saathi-toast-icon">${ICONS[kind] || ICONS.info}</span><span class="saathi-toast-text">${escapeHtml(message)}</span>`;
    if (actionLabel && onAction) {
      const btn = document.createElement("button");
      btn.textContent = actionLabel;
      btn.className = "saathi-toast-action";
      btn.addEventListener("click", onAction);
      el.appendChild(btn);
    }
    el.className = `saathi-toast saathi-toast-${kind} saathi-toast-show`;
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove("saathi-toast-show"), actionLabel ? 8000 : 3200);
    return el;
  }

  async function saathiHashPin(pin) {
    const bytes = new TextEncoder().encode(String(pin));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Was duplicated (with tiny variations) in landingScreen.js,
  // premiumFeatures.js, premiumFeatures2.js and premiumFeatures4.js —
  // one version now, each of those files calls this instead.
  function saathiGetProfileCards() {
    return Array.from(document.querySelectorAll("#savedList > div")).map((card) => {
      const h2 = card.querySelector("h2");
      let name = h2 ? h2.textContent.trim() : "(unnamed)";
      name = name.replace(/^\d+\.\s*/, "").replace(/\s*📄\s*\d*\s*$/u, "").replace(/\s*⭐\s*$/u, "").trim();   // drop the doc-count / favourite badges other scripts append to the heading
      const idEl = card.querySelector(".saathi-userid");
      const mobile = idEl ? idEl.textContent.replace(/\D/g, "") : "";
      return { name, mobile, card };
    });
  }

  // brand mark as a data URI - usable in print windows / injected UI without extra file permissions
  window.SAATHI_LOGO_URI = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiI+CiAgPGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJ0IiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjOUIwMEQyIi8+PHN0b3Agb2Zmc2V0PSIuNTUiIHN0b3AtY29sb3I9IiNGRTI4QUYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNERDYwM0UiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz4KICA8cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9IjExMiIgZmlsbD0idXJsKCN0KSIvPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDk2IDk2KSBzY2FsZSg1KSIgZmlsbD0ibm9uZSI+CiAgIDxwYXRoIGQ9Ik00Ny41NiAxNi40NEEyMiAyMiAwIDEgMCA0Ny41NiA0Ny41NiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjYuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgIDxsaW5lIHgxPSI0Ny41NiIgeTE9IjIzIiB4Mj0iNDcuNTYiIHkyPSI0MSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWRhc2hhcnJheT0iMC41IDYiLz4KICAgPGNpcmNsZSBjeD0iNDcuNTYiIGN5PSIxNi40NCIgcj0iNS4yIiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iNDcuNTYiIGN5PSI0Ny41NiIgcj0iNS4yIiBmaWxsPSIjZmZmIi8+CiAgIDxwYXRoIGQ9Ik0yMiAxOHYyNS41bDYuOC02LjIgNC42IDEwLjIgNC42LTIuMS00LjYtOS44SDQyLjV6IiBmaWxsPSIjZmZmIi8+PC9nPgo8L3N2Zz4=";
  window.saathiToast = saathiToast;
  // PIN is now stored as a SHA-256 hash instead of plain text (see
  // premiumFeatures.js initPinLock/initPinSettings) — a hash looks
  // like 64 hex chars, so callers can tell it apart from a legacy
  // plaintext PIN (4-8 digits) already sitting in someone's storage
  // from before this change, and migrate it transparently.
  window.saathiHashPin = saathiHashPin;
  window.saathiIsHashedPin = (val) => typeof val === "string" && /^[0-9a-f]{64}$/i.test(val);
  window.saathiGetProfileCards = saathiGetProfileCards;
})();
