/**
 * captchaAssist.js (Ultimate Speed & Automation Version)
 * ------------------------------------------------------------
 * 1. Instant Auto-Clear: Refresh ya load hone par input box hamesha blank milega.
 * 2. Floating Refresh Control Panel: Screen ke corner mein modern click-to-refresh button.
 * 3. Quick Keyboard Shortcut (Alt + R): Instant CAPTCHA image reload aur cursor focus.
 * 4. Smart Enter-to-Proceed: Type karne ke baad Enter dabate hi Proceed button trigger hoga.
 * 5. Auto-Submit on Exact Length: Portal ke 6-digit CAPTCHA limit ke mutabiq, 
      jaise hi 6th digit type hogi, bina Enter dabaye form automatic proceed ho jayega.
 * 6. Focus Retention Shield: Cursor ko hamesha CAPTCHA box par locked rakhta hai.
 * ------------------------------------------------------------
 */

(function () {
  const KNOWN_IMAGE_ID = "captchaImage";
  const KNOWN_INPUT_ID = "captchaAnswer";

  function looksLikeCaptcha(str) {
    return typeof str === "string" && str.toLowerCase().includes("captcha");
  }

  function findCaptchaImage() {
    const known = document.getElementById(KNOWN_IMAGE_ID);
    if (known && known.tagName === "IMG") return known;
    return (
      Array.from(document.querySelectorAll("img")).find(
        (img) =>
          looksLikeCaptcha(img.id) ||
          looksLikeCaptcha(img.className) ||
          looksLikeCaptcha(img.alt) ||
          looksLikeCaptcha(img.src)
      ) || null
    );
  }

  function findCaptchaInput() {
    const known = document.getElementById(KNOWN_INPUT_ID);
    if (known && known.tagName === "INPUT") return known;
    return (
      Array.from(document.querySelectorAll("input[type='text'], input:not([type])")).find(
        (inp) =>
          looksLikeCaptcha(inp.id) ||
          looksLikeCaptcha(inp.name) ||
          looksLikeCaptcha(inp.placeholder)
      ) || null
    );
  }

  function findProceedButton() {
    const candidates = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], a"));
    return (
      candidates.find((el) => {
        const text = (el.value || el.textContent || "").trim().toLowerCase();
        return text === "proceed";
      }) || null
    );
  }

  // Auto-dismisses a plain "OK" popup that appears after clicking
  // Proceed — but ONLY once the CAPTCHA has actually been seen on
  // THIS page (sawCaptchaHere below), so this never touches an "OK"
  // button anywhere else on the portal. If this turns out to be a
  // native browser alert() rather than a styled in-page popup, this
  // can't dismiss it — content scripts can't interact with native
  // dialogs at all; let me know what it looks like if this doesn't
  // work and a different approach can be tried.
  function findOkButton() {
    const candidates = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], a"));
    return (
      candidates.find((el) => {
        const text = (el.value || el.textContent || "").trim().toLowerCase();
        return text === "ok";
      }) || null
    );
  }

  let sawCaptchaHere = false;

  function autoDismissOk() {
    if (!sawCaptchaHere) return;
    const okBtn = findOkButton();
    if (okBtn && !okBtn.dataset.saathiAutoOkClicked) {
      okBtn.dataset.saathiAutoOkClicked = "1";
      okBtn.click();
    }
  }

  // Refresh CAPTCHA & Force Clear Input
  // Custom Smooth Spin Animation Injector
  if (!document.getElementById("saathi-spin-style")) {
    const style = document.createElement("style");
    style.id = "saathi-spin-style";
    style.innerHTML = `
      @keyframes saathiSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .saathi-spinning {
        animation: saathiSpin 0.7s linear infinite !important;
        display: inline-block !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Refresh CAPTCHA & Force Clear Input (with Guaranteed Custom Spin Animation)
  function refreshCaptcha() {
    const img = findCaptchaImage();
    const input = findCaptchaInput();
    
    const icon = controlPanel ? controlPanel.querySelector("i") : null;
    if (icon) {
      icon.classList.add("saathi-spinning");
    }

    if (input) {
      input.value = ""; 
      input.defaultValue = "";
    }

    const stopSpin = () => {
      if (icon) icon.classList.remove("saathi-spinning");
      if (img) {
        img.removeEventListener("load", stopSpin);
        img.removeEventListener("error", stopSpin);
      }
    };

    if (img) {
      img.addEventListener("load", stopSpin);
      img.addEventListener("error", stopSpin);

      const base = img.src.split("?")[0];
      img.src = base + "?id" + new Date().getTime();
    } else {
      setTimeout(stopSpin, 600);
    }

    if (input) {
      input.value = "";
      input.focus();
    }
  }

  // Global Keyboard Shortcut: Alt + R
  document.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "r" || e.key === "R")) {
      const img = findCaptchaImage();
      if (img) {
        e.preventDefault();
        refreshCaptcha();
      }
    }
  });

  // Floating Control Panel Button UI
  let controlPanel = null;
  function ensureControlPanel() {
    if (controlPanel && document.body.contains(controlPanel)) return controlPanel;
    
    controlPanel = document.createElement("div");
    controlPanel.style.cssText = [
      // Sits just above the "Digital Saathi Active" badge (which is
      // pinned at bottom:14px in enclosureAutoFill.js) instead of on
      // top of it — same rounded-pill family look, stacked cleanly.
      "position:fixed", "bottom:54px", "right:14px", "z-index:999999",
      "background:#1c2b4a", "color:#fff", "padding:7px 14px", "border-radius:20px",
      "box-shadow:0 6px 16px -6px rgba(0,0,0,.4)", "font-family:Arial,sans-serif",
      "font-size:11.5px", "font-weight:700", "display:flex", "align-items:center",
      "gap:7px", "cursor:pointer",
      "border:1px solid rgba(255,255,255,0.15)", "transition:all 0.2s ease"
    ].join(";");

    const icon = document.createElement("i");
    // The real page loads Font Awesome 4.7.0 (checked its <link> tag in
    // the page source you sent), which uses the plain "fa" prefix and
    // "fa-refresh" — "fas fa-sync-alt" is Font Awesome 5+ syntax and
    // doesn't exist in 4.7.0, so the icon was rendering as nothing.
    icon.className = "fa fa-refresh";
    controlPanel.appendChild(icon);

    const text = document.createElement("span");
    text.textContent = "Update Captcha";
    controlPanel.appendChild(text);

    controlPanel.onmouseover = () => { controlPanel.style.background = "#28406b"; };
    controlPanel.onmouseout = () => { controlPanel.style.background = "#1c2b4a"; };

    controlPanel.onclick = () => {
      refreshCaptcha();
    };

    document.body.appendChild(controlPanel);
    return controlPanel;
  }

 

  // NOTE: Enter-to-proceed and auto-submit-on-6-digits for the CAPTCHA
  // box are intentionally NOT implemented — the operator proceeds
  // manually by design. Only refresh/clear/focus-shield behaviour
  // below is automatic. (OTP's own auto-validate in
  // otpAutoValidate.js is separate and unaffected.)

  let initialized = false;

  function tick() {
    const img = findCaptchaImage();
    const input = findCaptchaInput();

    if (img && input) {
      sawCaptchaHere = true;
      ensureControlPanel();

      // Initial load clean-up ONLY — deliberately NOT auto-focusing
      // the CAPTCHA box here anymore. It used to steal focus the
      // moment the CAPTCHA was found, which in practice is right
      // after the page loads — exactly when the operator is trying to
      // click into the FIRST form field, not the CAPTCHA, so typing
      // was landing in the wrong box. Focus now only ever jumps to the
      // CAPTCHA box when explicitly asked for: Alt+R (or the floating
      // refresh button) — see refreshCaptcha() — which both refreshes
      // AND focuses in one press, on purpose.
      if (!initialized) {
        // Clears a suspiciously long leftover value (e.g. browser
        // autofill remembering an old answer) so a stale value doesn't
        // get submitted by accident on this fresh CAPTCHA image.
        if (input.value.length > 6) {
          input.value = "";
        }
        initialized = true;
      }
    }

    // Checked every tick regardless of whether the CAPTCHA elements are
    // still on the page right now — clicking Proceed may replace/hide
    // them with the OK popup, so this must not stop just because they
    // disappeared. sawCaptchaHere still keeps this scoped to only this
    // page (never fires unless the CAPTCHA was actually seen here).
    autoDismissOk();
  }

  const observer = new MutationObserver(() => tick());
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["src"],
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tick);
  } else {
    tick();
  }
})();