/**
 * extraTabs.js
 * ------------------------------------------------------------
 * popup.js only knows the three original tabs (Form / Profile /
 * Documents). This small helper lets additional tabs (Doc Vault,
 * Certificates …) live next to them: it adds the button, places the
 * content box, and makes every tab hide every other tab's content —
 * without touching popup.js.
 * ------------------------------------------------------------
 */
const SaathiExtraTabs = (function () {
  const CORE_BTNS = ["tab-form", "tab-saved", "tab-docs"];
  const CORE_BOXES = ["content-form", "content-saved", "content-docs"];
  const extras = []; // { id, btn, box, onShow }
  let wired = false;
  const $ = (id) => document.getElementById(id);

  function hideExtras(exceptId) {
    extras.forEach((e) => {
      if (e.id === exceptId) return;
      e.box.style.display = "none";
      e.btn.classList.remove("active");
    });
  }

  function show(id) {
    const e = extras.find((x) => x.id === id);
    if (!e) return;
    CORE_BOXES.map($).filter(Boolean).forEach((c) => { c.style.display = "none"; });
    CORE_BTNS.map($).filter(Boolean).forEach((b) => b.classList.remove("active"));
    hideExtras(id);
    e.btn.classList.add("active");
    e.box.style.display = "block";
    if (e.onShow) e.onShow();
  }

  function wireCoreButtons() {
    if (wired) return;
    wired = true;
    CORE_BTNS.map($).filter(Boolean).forEach((b) => b.addEventListener("click", () => hideExtras(null)));
  }

  /** opts: { id, label, box (element), onShow } — returns true when added. */
  function add(opts) {
    const group = document.querySelector(".nav-tabs-group");
    const anchor = extras.length ? extras[extras.length - 1].box : $("content-docs");
    if (!group || !anchor || $(opts.id)) return false;
    const btn = document.createElement("button");
    btn.id = opts.id;
    btn.className = "tab-btn";
    btn.textContent = opts.label;
    group.appendChild(btn);
    opts.box.style.display = "none";
    anchor.insertAdjacentElement("afterend", opts.box);
    extras.push({ id: opts.id, btn, box: opts.box, onShow: opts.onShow });
    btn.addEventListener("click", () => show(opts.id));
    wireCoreButtons();
    return true;
  }

  return { add, show };
})();
