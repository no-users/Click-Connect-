/**
 * uiFixes.js
 * ------------------------------------------------------------
 * Small, additive, defensive fixes:
 *  1. Guarantees radio-group clicks always stick (in case anything
 *     else in the app re-renders/resets the form right after a click).
 *  2. Central place for any future "ultra-level" UI polish.
 * ------------------------------------------------------------
 */

(function () {
  function reinforceRadioGroups() {
    document.querySelectorAll(".radio-group input[type=radio]").forEach(el => {
      el.addEventListener("click", function () {
        const self = this;
        // Re-assert on the next frame in case something else in the
        // app resets form state synchronously right after the click.
        requestAnimationFrame(() => {
          if (!self.checked) self.checked = true;
        });
      });
    });
  }

  function init() {
    reinforceRadioGroups();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
