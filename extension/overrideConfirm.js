/**
 * overrideConfirm.js
 * ------------------------------------------------------------
 * The "OK" popup that wasn't auto-dismissing turned out to be a
 * NATIVE browser confirm() dialog ("serviceonline.bihar.gov.in
 * says...") — not a styled in-page popup. A normal content script
 * (isolated world) cannot click, close, or otherwise touch a native
 * alert()/confirm()/prompt() dialog at all; the only way to stop one
 * from appearing is to override window.confirm/window.alert
 * themselves BEFORE the page calls them, which requires running in
 * the page's own ("MAIN") JS world — see the "world": "MAIN" entry
 * in manifest.json for this file, at document_start so it installs
 * before the page's scripts run.
 *
 * Deliberately narrow, two dialogs only:
 * 1. confirm() whose message contains "नाम की शुद्धता" — the
 *    "1. नाम की शुद्धता की जाँच कर लें..." instructions popup shown
 *    after "I Agree".
 * 2. alert() whose message is exactly "Verified" — the popup shown
 *    right after the mobile-OTP "Validate" button succeeds (see
 *    otpAutoValidate.js for the OTP-box → Validate-click side of
 *    this flow).
 *
 * Any other confirm()/alert() on this site — including ones for
 * actually destructive actions — still shows normally and needs a
 * real human OK/Cancel, exactly as requested ("is page par, baaki
 * kahi nahi").
 * ------------------------------------------------------------
 */

(function () {
  const CONFIRM_MATCH_TEXT = "नाम की शुद्धता";
  const originalConfirm = window.confirm;

  window.confirm = function (message) {
    if (typeof message === "string" && message.includes(CONFIRM_MATCH_TEXT)) {
      return true; // same as a human clicking OK
    }
    return originalConfirm.call(window, message);
  };

  const ALERT_MATCH_TEXT = "verified";
  const originalAlert = window.alert;

  window.alert = function (message) {
    if (typeof message === "string" && message.trim().toLowerCase() === ALERT_MATCH_TEXT) {
      return; // same as a human clicking OK
    }
    return originalAlert.call(window, message);
  };
})();
