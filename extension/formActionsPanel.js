/**
 * formActionsPanel.js
 * ------------------------------------------------------------
 * premiumFeatures2.js and premiumFeatures5.js each inserted extra
 * buttons (Same Address as Last, Receipt, WhatsApp, Copy as Text)
 * directly into the Clear/Save Data row (.form-actions), which
 * became cramped and broke the layout once several were present.
 *
 * This moves those extra buttons (not Clear/Save Data — those stay
 * exactly where they are) into their own wrapped row placed just
 * above. No click handlers are touched, only their position.
 * ------------------------------------------------------------
 */
(function () {
  function $(id) { return document.getElementById(id); }

  function build() {
    const form = $("dataForm");
    if (!form || $("saathiExtraActionsRow")) return;

    const mainActions = form.querySelector(".form-actions");
    if (!mainActions) return;

    const extraIds = ["saathiSameAddressBtn", "saathiReceiptBtn", "saathiWaBtn", "saathiCopyTextBtn"];
    const found = extraIds.map($).filter(Boolean);
    if (!found.length) return;

    const row = document.createElement("div");
    row.id = "saathiExtraActionsRow";
    found.forEach((btn) => {
      btn.classList.add("saathi-extra-action-btn");
      row.appendChild(btn);
    });

    mainActions.parentElement.insertBefore(row, mainActions);
  }

  function init() {
    build();
    // A couple of these buttons are added slightly after DOMContentLoaded
    // by their own scripts — retry briefly in case we ran first.
    setTimeout(build, 100);
    setTimeout(build, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
