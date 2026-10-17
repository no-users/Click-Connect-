/**
 * otpAutoValidate.js
 * ------------------------------------------------------------
 * Mirrors the CAPTCHA auto-proceed flow (see captchaAssist.js) for
 * the mobile-number OTP popup ("Validate OTP" modal):
 *
 * 1. Jaise hi OTP box mein 6 digit type ho jaati hain, "Validate"
 *    button apne aap click ho jata hai (Proceed jaisa hi behaviour).
 * 2. Validate hone ke baad jo native "...says Verified" alert()
 *    aata hai, wo bhi apne aap dismiss (OK) ho jata hai.
 *
 * That "Verified" popup is a native browser alert() (address-bar
 * style "site says"), exactly like the confirm() dialog handled in
 * overrideConfirm.js — a normal content script cannot click or close
 * it. So the actual auto-dismiss for it lives in overrideConfirm.js
 * (MAIN world, window.alert override). This file only handles the
 * OTP input + Validate button, which are normal in-page elements.
 * ------------------------------------------------------------
 */

(function () {
  function looksLikeOtp(str) {
    return typeof str === "string" && str.toLowerCase().includes("otp");
  }

  function findOtpInput() {
    // Prefer an input whose id/name/placeholder mentions "otp".
    const byAttr = Array.from(
      document.querySelectorAll("input[type='text'], input[type='tel'], input[type='number'], input:not([type])")
    ).find(
      (inp) =>
        looksLikeOtp(inp.id) || looksLikeOtp(inp.name) || looksLikeOtp(inp.placeholder)
    );
    if (byAttr) return byAttr;

    // Fallback: the input sitting inside/near a "Validate OTP" modal,
    // next to an "Enter OTP" label — matches the popup shown in the
    // portal even if the input itself has no telling id/name.
    const label = Array.from(document.querySelectorAll("label, span, div")).find(
      (el) =>
        el.children.length === 0 &&
        /enter\s*otp/i.test((el.textContent || "").trim())
    );
    if (label) {
      const container = label.closest("div") || label.parentElement;
      const input = container && container.querySelector("input");
      if (input) return input;
    }
    return null;
  }

  function findValidateButton() {
    const candidates = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], a"));
    return (
      candidates.find((el) => {
        const text = (el.value || el.textContent || "").trim().toLowerCase();
        return text === "validate";
      }) || null
    );
  }

  function wireOtpInputOnce(input) {
    if (!input || input.dataset.saathiOtpWired) return;
    input.dataset.saathiOtpWired = "1";

    // Enter key support — same convenience as the CAPTCHA box.
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const validateBtn = findValidateButton();
        if (validateBtn) {
          e.preventDefault();
          validateBtn.click();
        }
      }
    });

    // Auto-click Validate once all 6 OTP digits are typed.
    input.addEventListener("input", () => {
      const val = input.value.trim();
      if (val.length === 6) {
        const validateBtn = findValidateButton();
        if (validateBtn) {
          // Small delay so the 6th digit is rendered before clicking,
          // same as the CAPTCHA auto-submit.
          setTimeout(() => {
            validateBtn.click();
          }, 80);
        }
      } else {
        // OTP box cleared/edited below 6 digits (e.g. Resend OTP) —
        // allow auto-validate to fire again next time it's full.
        delete input.dataset.saathiOtpAutoClicked;
      }
    });
  }

  function tick() {
    const input = findOtpInput();
    if (input) {
      wireOtpInputOnce(input);
    }
  }

  const observer = new MutationObserver(() => tick());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tick);
  } else {
    tick();
  }
})();
