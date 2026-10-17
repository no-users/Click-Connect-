/**
 * premiumFeatures.js
 * ------------------------------------------------------------
 * A batch of additive, non-invasive upgrades. Every feature here
 * only OBSERVES or PROXY-CLICKS the existing app — none of it
 * replaces or rewrites popup.js/content.js logic, so the original
 * save/load/fill behaviour is never at risk.
 *
 * Included this round:
 *  1. Search/filter bar on the Profile tab
 *  2. Live validation hints (mobile 10-digit, PIN 6-digit)
 *  3. Duplicate-mobile warning (non-blocking) on Save
 *  4. Daily / monthly "forms filled" counter
 *  5. Weekly backup reminder toast
 *  6. Optional PIN lock on the landing screen
 *  7. Auto light/dark theme (follows system, until user picks manually)
 *  8. Favorite (⭐) profiles, pinned to the top of the list
 * ------------------------------------------------------------
 */

(function () {
  function $(id) { return document.getElementById(id); }

  function toast(message, kind = "info") { return window.saathiToast(message, kind); }

  function getProfileCards() { return window.saathiGetProfileCards(); }

  // ---------- 1. Search / filter bar ----------
  function initSearch() {
    const contentSaved = $("content-saved");
    if (!contentSaved || $("saathiSearchInput")) return;

    const wrap = document.createElement("div");
    wrap.id = "saathiSearchInput"; // kept on the wrapper so other scripts' $() / moveInto still find "the search box" as one unit
    wrap.className = "saathi-search-wrap";

    const box = document.createElement("input");
    box.type = "text";
    box.placeholder = "Naam ya mobile se search karein…";
    box.className = "saathi-search-box";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "saathi-search-clear";
    clearBtn.textContent = "✕";
    clearBtn.setAttribute("aria-label", "Clear search");

    wrap.appendChild(box);
    wrap.appendChild(clearBtn);
    contentSaved.insertBefore(wrap, contentSaved.firstChild);

    function applyFilter() {
      const q = box.value.trim().toLowerCase();
      wrap.classList.toggle("saathi-search-has-text", !!q);
      getProfileCards().forEach(({ name, mobile, card }) => {
        const match = !q || name.toLowerCase().includes(q) || mobile.includes(q);
        card.style.display = match ? "" : "none";
      });
    }
    box.addEventListener("input", applyFilter);
    // Icon turns gold while the box is focused — small "it's alive"
    // touch on top of the existing gold pulse-ring (popup.html CSS).
    box.addEventListener("focus", () => wrap.classList.add("saathi-search-focused"));
    box.addEventListener("blur", () => wrap.classList.remove("saathi-search-focused"));
    clearBtn.addEventListener("click", () => {
      box.value = "";
      applyFilter();
      box.focus();
    });
  }

  // ---------- 2. Live validation ----------
  function markInvalid(el, message) {
    el.classList.add("saathi-field-invalid");
    let hint = el.parentElement.querySelector(".saathi-field-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "saathi-field-hint";
      el.insertAdjacentElement("afterend", hint);
    }
    hint.textContent = message;
  }
  function clearInvalid(el) {
    el.classList.remove("saathi-field-invalid");
    const hint = el.parentElement.querySelector(".saathi-field-hint");
    if (hint) hint.remove();
  }

  function initValidation() {
    const mobile = $("mobile");
    const pin = $("pin");
    if (mobile) {
      mobile.addEventListener("blur", () => {
        if (mobile.value && !/^\d{10}$/.test(mobile.value.trim())) {
          markInvalid(mobile, "Mobile number 10 digit ka hona chahiye.");
        } else {
          clearInvalid(mobile);
        }
      });
    }
    if (pin) {
      pin.addEventListener("blur", () => {
        if (pin.value && !/^\d{6}$/.test(pin.value.trim())) {
          markInvalid(pin, "PIN code 6 digit ka hona chahiye.");
        } else {
          clearInvalid(pin);
        }
      });
    }
  }

  // ---------- 3. Duplicate-mobile warning + counter hook ----------
  function initSaveHooks() {
    const form = $("dataForm");
    const mobile = $("mobile");
    if (!form) return;

    form.addEventListener("submit", () => {
      // Duplicate check (non-blocking — just informs, never stops the save).
      if (mobile && mobile.value.trim()) {
        const enteredMobile = mobile.value.replace(/\D/g, "");
        const dupe = getProfileCards().some((p) => p.mobile && p.mobile === enteredMobile);
        if (dupe) toast("Note: is mobile number se ek profile pehle se saved hai.", "warn");
      }
      bumpCounter();
    }, true); // capture phase: runs alongside popup.js's own handler, doesn't block it
  }

  // ---------- 4. Daily / monthly counter ----------
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function monthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function bumpCounter() {
    chrome.storage.local.get(["saathiUsageStats"], (res) => {
      const stats = res.saathiUsageStats || {};
      const tKey = todayKey(), mKey = monthKey();
      stats[tKey] = (stats[tKey] || 0) + 1;
      stats[mKey + "-month"] = (stats[mKey + "-month"] || 0) + 1;
      chrome.storage.local.set({ saathiUsageStats: stats }, renderCounterBadge);
    });
  }
  function renderCounterBadge() {
    chrome.storage.local.get(["saathiUsageStats"], (res) => {
      const stats = res.saathiUsageStats || {};
      const today = stats[todayKey()] || 0;
      const month = stats[monthKey() + "-month"] || 0;
      let badge = $("saathiCounterBadge");
      const contentSaved = $("content-saved");
      if (!badge && contentSaved) {
        badge = document.createElement("div");
        badge.id = "saathiCounterBadge";
        contentSaved.insertBefore(badge, contentSaved.firstChild);
      }
      if (badge) {
        badge.innerHTML = `
          <span class="saathi-stat-pill">
            <span class="saathi-stat-icon">📅</span>
            <span class="saathi-stat-num">${today}</span>
            <span class="saathi-stat-label">Today</span>
          </span>
          <span class="saathi-stat-divider"></span>
          <span class="saathi-stat-pill">
            <span class="saathi-stat-icon">🗓️</span>
            <span class="saathi-stat-num">${month}</span>
            <span class="saathi-stat-label">This Month</span>
          </span>
        `;
      }
    });
  }

  // ---------- 5. Weekly backup reminder ----------
  function checkBackupReminder() {
    chrome.storage.local.get(["saathiLastBackupAt"], (res) => {
      const last = res.saathiLastBackupAt ? new Date(res.saathiLastBackupAt) : null;
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      if (!last || Date.now() - last.getTime() > weekMs) {
        setTimeout(() => toast("Reminder: apna data backup karna na bhoolein.", ), 1200);
      }
    });
    const exportBtn = $("saathiExportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        chrome.storage.local.set({ saathiLastBackupAt: new Date().toISOString() });
      });
    }
  }

  // ---------- 6. Optional PIN lock (landing screen gate) ----------
  function initPinLock() {
    chrome.storage.local.get(["saathiAppPin"], (res) => {
      const overlay = $("saathiLandingOverlay");
      if (!res.saathiAppPin || !overlay) return; // not enabled — nothing to do

      const gate = document.createElement("div");
      gate.id = "saathiPinGate";
      gate.innerHTML = `
        <img src="brand/app-icon.svg" class="landing-logo" alt="Click &amp; Continue">
        <div class="landing-card" style="text-align:center;">
          <div class="landing-label">🔒 Enter PIN</div>
          <input type="password" id="saathiPinInput" class="landing-select" inputmode="numeric" maxlength="8">
          <button type="button" id="saathiPinSubmit" class="landing-fill-btn">Unlock</button>
          <div id="saathiForgotPin" style="margin-top:10px;font-size:10px;color:var(--text-muted);text-decoration:underline;cursor:pointer;">Forgot PIN?</div>
        </div>
      `;
      document.body.appendChild(gate);
      overlay.style.display = "none";

      gate.querySelector("#saathiForgotPin").addEventListener("click", () => {
        if (window.confirm("PIN reset karke lock hata dein? (Aapka saved profile data safe rahega)")) {
          chrome.storage.local.remove("saathiAppPin", () => {
            gate.remove();
            overlay.style.display = "flex";
            toast("PIN lock hata diya gaya.", "success");
          });
        }
      });

      async function tryUnlock() {
        const val = $("saathiPinInput").value;
        chrome.storage.local.get(["saathiAppPin"], async (r2) => {
          const stored = r2.saathiAppPin;
          let ok = false;
          if (window.saathiIsHashedPin(stored)) {
            ok = (await window.saathiHashPin(val)) === stored;
          } else {
            // Legacy plaintext PIN from before hashing was added —
            // verify directly this one time, then upgrade it to a
            // hash so it's never stored in plain text again.
            ok = val === stored;
            if (ok) chrome.storage.local.set({ saathiAppPin: await window.saathiHashPin(val) });
          }
          if (ok) {
            gate.remove();
            overlay.style.display = "flex";
          } else {
            toast("Galat PIN.", "warn");
          }
        });
      }
      $("saathiPinSubmit").addEventListener("click", tryUnlock);
      $("saathiPinInput").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
    });
  }

  // Small settings control to set/change/remove the PIN, placed in Profile tab.
  function initPinSettings() {
    const contentSaved = $("content-saved");
    if (!contentSaved || $("saathiPinSettingBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "saathiPinSettingBtn";
    btn.className = "saathi-pin-setting-btn";
    btn.textContent = "🔒 Set/Change PIN Lock";
    contentSaved.insertBefore(btn, contentSaved.firstChild);

    btn.addEventListener("click", () => {
      chrome.storage.local.get(["saathiAppPin"], (res) => {
        const current = res.saathiAppPin || "";
        const next = window.prompt(
          current ? "Naya PIN daalo (khaali chhodo PIN hatane ke liye):" : "4-8 digit ka PIN set karo:",
          ""
        );
        if (next === null) return;
        if (next === "") {
          chrome.storage.local.remove("saathiAppPin");
          toast("PIN lock hata diya gaya.", "success");
        } else if (/^\d{4,8}$/.test(next)) {
          window.saathiHashPin(next).then((hash) => {
            chrome.storage.local.set({ saathiAppPin: hash });
            toast("PIN lock set ho gaya.", "success");
          });
        } else {
          toast("PIN sirf 4-8 digit ka hona chahiye.", "warn");
        }
      });
    });
  }

  // ---------- 7. Auto light/dark theme ----------
  function initAutoTheme() {
    chrome.storage.local.get(["digitalSaathiTheme"], (res) => {
      if (res.digitalSaathiTheme) return; // user already picked manually — don't override
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) document.body.classList.add("dark-theme");
    });
  }

  // ---------- 8. Favorite profiles ----------
  function getFavorites(cb) {
    chrome.storage.local.get(["saathiFavorites"], (res) => cb(res.saathiFavorites || []));
  }
  function toggleFavorite(name) {
    getFavorites((favs) => {
      const idx = favs.indexOf(name);
      if (idx === -1) favs.push(name); else favs.splice(idx, 1);
      chrome.storage.local.set({ saathiFavorites: favs }, applyFavorites);
    });
  }
  let _applyingFavorites = false;
  function applyFavorites() {
    if (_applyingFavorites) return;
    getFavorites((favs) => {
      _applyingFavorites = true;
      const cards = getProfileCards();
      cards.forEach(({ name, card }) => {
        let star = card.querySelector(".saathi-fav-star");
        if (!star) {
          star = document.createElement("button");
          star.type = "button";
          star.className = "saathi-fav-star";
          star.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(name);
          });
          card.style.position = "relative";
          card.appendChild(star);
        }
        const isFav = favs.includes(name);
        star.textContent = isFav ? "⭐" : "☆";
        star.classList.toggle("saathi-fav-active", isFav);
      });
      // Pin favorited cards to the top, preserving relative order otherwise.
      const list = $("savedList");
      if (list) {
        cards
          .filter((c) => favs.includes(c.name))
          .forEach((c) => {
            if (list.firstChild !== c.card) list.insertBefore(c.card, list.firstChild);
          });
      }
      setTimeout(() => { _applyingFavorites = false; }, 0);
    });
  }

  function init() {
    try { initSearch(); } catch (e) { console.warn("[premiumFeatures] initSearch failed", e); }
    try { initValidation(); } catch (e) { console.warn("[premiumFeatures] initValidation failed", e); }
    try { initSaveHooks(); } catch (e) { console.warn("[premiumFeatures] initSaveHooks failed", e); }
    try { renderCounterBadge(); } catch (e) { console.warn("[premiumFeatures] renderCounterBadge failed", e); }
    try { checkBackupReminder(); } catch (e) { console.warn("[premiumFeatures] checkBackupReminder failed", e); }
    try { initPinLock(); } catch (e) { console.warn("[premiumFeatures] initPinLock failed", e); }
    try { initPinSettings(); } catch (e) { console.warn("[premiumFeatures] initPinSettings failed", e); }
    try { initAutoTheme(); } catch (e) { console.warn("[premiumFeatures] initAutoTheme failed", e); }
    try { applyFavorites(); } catch (e) { console.warn("[premiumFeatures] applyFavorites failed", e); }

    const list = $("savedList");
    if (list) new MutationObserver(applyFavorites).observe(list, { childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
