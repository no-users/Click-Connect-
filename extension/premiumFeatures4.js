/**
 * premiumFeatures4.js — batch 4 (final)
 *  1. Tags/category chip per saved profile (editable, click to rename)
 *  2. Document-type auto-tag (from the last OCR extraction) added automatically
 *  3. Safe bulk delete (reuses the checkboxes from batch-2's bulk export)
 *  4. Auto-draft save for the Form tab (survives an accidental popup close)
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function toast(message, kind = "info") { return window.saathiToast(message, kind); }
  function getProfileCards() { return window.saathiGetProfileCards(); }

  // ---------- 1 & 2. Tags ----------
  function getTags(cb) { chrome.storage.local.get(["saathiTags"], (res) => cb(res.saathiTags || {})); }
  function setTag(name, tag) {
    getTags((tags) => {
      if (tag) tags[name] = tag; else delete tags[name];
      chrome.storage.local.set({ saathiTags: tags }, applyTags);
    });
  }
  let _applyingTags = false;
  function applyTags() {
    if (_applyingTags) return;
    _applyingTags = true;
    getTags((tags) => {
      getProfileCards().forEach(({ name, card }) => {
        let chip = card.querySelector(".saathi-tag-chip");
        if (!chip) {
          chip = document.createElement("span");
          chip.className = "saathi-tag-chip";
          chip.title = "Click to edit tag/category";
          chip.addEventListener("click", (e) => {
            e.stopPropagation();
            const current = tags[name] || "";
            const next = window.prompt("Tag/category (jaise: gaanv ka naam, 'Pending', 'Done'):", current);
            if (next !== null) setTag(name, next.trim());
          });
          const meta = card.querySelector(".saathi-meta") || card.querySelector("div");
          if (meta) meta.appendChild(chip);
        }
        chip.textContent = tags[name] ? `🏷️ ${tags[name]}` : "🏷️ Add tag";
        chip.classList.toggle("saathi-tag-empty", !tags[name]);
      });
      setTimeout(() => { _applyingTags = false; }, 0);
    });
  }
  function initAutoDocTag() {
    const form = $("dataForm");
    if (!form) return;
    form.addEventListener("submit", () => {
      const types = window.__saathiLastDocTypes;
      const name = ($("name") && $("name").value.trim()) || "";
      if (!types || !types.length || !name) return;
      const label = types.map((t) => t.replace(/_/g, " ")).join(", ");
      getTags((tags) => {
        if (!tags[name]) { // don't overwrite a tag the user already set manually
          tags[name] = label;
          chrome.storage.local.set({ saathiTags: tags }, applyTags);
        }
      });
    }, true);
  }

  // ---------- 3. Safe bulk delete ----------
  function findButton(card, keyword) {
    const byClass = card.querySelector(`.saathi-btn-${keyword}`);
    if (byClass) return byClass;
    return Array.from(card.querySelectorAll("button")).find(
      (b) => b.textContent.trim().toLowerCase().includes(keyword)
    );
  }
  async function deleteSelectedSequentially(names) {
    for (const name of names) {
      const entry = getProfileCards().find((p) => p.name === name);
      if (!entry) continue;
      const btn = findButton(entry.card, "delete");
      if (btn) {
        btn.click(); // native confirm() inside popup.js's handler blocks here until answered
        await new Promise((r) => setTimeout(r, 150)); // let the list re-render before the next lookup
      }
    }
  }
  function initBulkDelete() {
    const contentSaved = $("content-saved");
    if (!contentSaved || $("saathiBulkDeleteBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "saathiBulkDeleteBtn";
    btn.className = "saathi-pin-setting-btn saathi-tool-btn-danger";
    btn.textContent = "🗑️ Delete Selected";
    contentSaved.insertBefore(btn, contentSaved.firstChild);

    btn.addEventListener("click", async () => {
      const selected = getProfileCards().filter((p) => {
        const cb = p.card.querySelector(".saathi-bulk-check");
        return cb && cb.checked;
      }).map((p) => p.name);
      if (!selected.length) { toast("Pehle checkbox se profiles select karo.", "warn"); return; }
      if (!window.confirm(`${selected.length} profile delete karein? Ye undo nahi ho sakta.`)) return;
      await deleteSelectedSequentially(selected);
      toast("Selected profiles delete ho gaye.", "success");
    });
  }

  // ---------- 4. Auto-draft save ----------
  const DRAFT_FIELDS = ["name", "fathername", "mothername", "husbandname", "mobile", "email",
    "district", "anumandal", "prakhand", "gram", "village", "pin", "postoffice",
    "policeStation", "wardNo", "purpose"];

  function saveDraft() {
    const data = {};
    DRAFT_FIELDS.forEach((f) => { const el = $(f); if (el && el.value) data[f] = el.value; });
    if (Object.keys(data).length) chrome.storage.local.set({ saathiFormDraft: data });
    else chrome.storage.local.remove("saathiFormDraft");
  }
  function clearDraft() { chrome.storage.local.remove("saathiFormDraft"); }

  function initAutoDraft() {
    const form = $("dataForm");
    if (!form) return;
    let debounce;
    form.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(saveDraft, 800);
    });
    form.addEventListener("submit", clearDraft, true);

    const clearBtn = form.querySelector('button[type="reset"]');
    if (clearBtn) clearBtn.addEventListener("click", clearDraft);

    // Offer to restore only if the form looks freshly empty (avoids
    // clobbering data the user just loaded from a saved profile).
    chrome.storage.local.get(["saathiFormDraft"], (res) => {
      const draft = res.saathiFormDraft;
      const nameEl = $("name");
      if (!draft || !nameEl || nameEl.value.trim()) return;
      const banner = document.createElement("div");
      banner.id = "saathiDraftBanner";
      banner.innerHTML = `📝 Ek adhoora draft mila (${draft.name || "unnamed"}) — <button type="button" id="saathiDraftRestore">Restore karein</button> <button type="button" id="saathiDraftDismiss">✕</button>`;
      form.insertBefore(banner, form.firstChild);
      $("saathiDraftRestore").addEventListener("click", () => {
        Object.entries(draft).forEach(([k, v]) => {
          const el = $(k);
          if (el) { el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); }
        });
        banner.remove();
        toast("Draft restore ho gaya.", "success");
      });
      $("saathiDraftDismiss").addEventListener("click", () => { banner.remove(); clearDraft(); });
    });
  }

  function init() {
    try { applyTags(); } catch (e) { console.warn("[premiumFeatures4] applyTags failed", e); }
    try { initAutoDocTag(); } catch (e) { console.warn("[premiumFeatures4] initAutoDocTag failed", e); }
    try { initBulkDelete(); } catch (e) { console.warn("[premiumFeatures4] initBulkDelete failed", e); }
    try { initAutoDraft(); } catch (e) { console.warn("[premiumFeatures4] initAutoDraft failed", e); }
    const list = $("savedList");
    if (list) new MutationObserver(applyTags).observe(list, { childList: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
