/**
 * autoExportPdf.js
 * ------------------------------------------------------------
 * On the final "application submitted" summary page (the printable
 * form with "Export to PDF" and "Close" buttons, shown after Submit
 * on the enclosure/declaration page) — automatically clicks
 * "Export to PDF" once, so a copy of the submitted application
 * downloads immediately without a manual click.
 *
 * Before clicking, it works out a proper filename — e.g.
 * "INC26_SAURAV.pdf" (applicant Saurav Kumar's Income Certificate,
 * 2026) or "CAS26_SAURAV.pdf" (Caste Certificate) — and hands it to
 * background.js so the download is saved under that name instead of
 * the portal's own generic filename.
 *
 * The applicant's first name is read from the same `#name` form
 * field docStore.js already reads elsewhere in this extension (see
 * getApplicantFirstName() below); if that field isn't present on
 * this page, the page text is scanned for a "Name"/"नाम" label as a
 * fallback. If neither works, the name part is simply left out
 * rather than guessing wrong.
 *
 * Certificate type is detected three ways, in order:
 *   1. content.js exposes a `formType()` helper (shared isolated-
 *      world global, same as the rest of this extension) that
 *      reflects the service currently being applied for — used
 *      first when available.
 *   2. The portal's own receipt/application-number prefix — BICCO
 *      for Income, BCCCO for Caste, BRCCO for Residence (visible on
 *      the page as e.g. "BICCO/2026/11907132") — very reliable since
 *      it's the site's own code, not a guessed keyword.
 *   3. Fallback: scan the page's visible text for known certificate
 *      names (English + Hindi). Covers the case where neither of the
 *      above is available/loaded yet.
 * If nothing matches, the file is named "APP<yy>.pdf" instead of
 * guessing wrong.
 *
 * Recognises the "Export to PDF" page by BOTH "Export to PDF" and
 * "Close" buttons being present together (the exact page markup/id
 * wasn't available to pin down precisely — if this ever fires on
 * the wrong page, or doesn't fire on the right one, or the filename
 * comes out wrong, send a screenshot of that page's HTML —
 * right-click → Inspect — the same way it was done for the CAPTCHA
 * fields, and the detection can be made exact).
 *
 * Fires at most once per page load (guarded by `triggered`), so it
 * can't repeatedly re-download if the page keeps re-rendering.
 * ------------------------------------------------------------
 */

(function () {
  let triggered = false;

  // Maps a detected certificate type to the short-form code used in
  // the filename (matches the codes the portal itself uses).
  // Add more entries here as needed — same pattern for both branches.
  const CERT_PATTERNS = [
    { label: "INC", receiptCodes: ["bicco"], formTypes: ["income", "incomecertificate"], terms: ["income certificate", "आय प्रमाण"] },
    { label: "CAS", receiptCodes: ["bccco"], formTypes: ["caste", "castecertificate"], terms: ["caste certificate", "जाति प्रमाण"] },
    { label: "RES", receiptCodes: ["brcco"], formTypes: ["residence", "residencecertificate"], terms: ["residence certificate", "आवासीय प्रमाण", "निवास प्रमाण"] },
  ];

  function findButtonByText(text) {
    const target = text.trim().toLowerCase();
    return (
      Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], a")).find((el) => {
        const t = (el.value || el.textContent || "").trim().toLowerCase();
        return t === target;
      }) || null
    );
  }

  function detectViaFormType() {
    try {
      if (typeof formType !== "function") return null;
      const raw = String(formType() || "").trim().toLowerCase();
      if (!raw) return null;
      const match = CERT_PATTERNS.find((p) => p.formTypes.includes(raw));
      return match ? match.label : null;
    } catch (e) {
      return null; // formType() not ready / threw — fall back to text scan
    }
  }

  function detectViaReceiptCode() {
    const text = (document.body.innerText || "").toLowerCase();
    const match = CERT_PATTERNS.find((p) => p.receiptCodes.some((code) => text.includes(code)));
    return match ? match.label : null;
  }

  function detectViaPageText() {
    const text = (document.body.innerText || "").toLowerCase();
    const match = CERT_PATTERNS.find((p) => p.terms.some((term) => text.includes(term.toLowerCase())));
    return match ? match.label : null;
  }

  function sanitizeForFilename(s) {
    // Keep letters (incl. Devanagari) only — safe across OSes, no
    // spaces/slashes/punctuation that could break a filename.
    return String(s)
      .replace(/[^A-Za-z\u0900-\u097F]/g, "")
      .toUpperCase();
  }

  function getApplicantFirstName() {
    // Primary: the same #name form field docStore.js already reads
    // elsewhere in this extension — most reliable when present.
    try {
      const nameEl = document.getElementById("name");
      const raw = nameEl && "value" in nameEl ? String(nameEl.value || "").trim() : "";
      if (raw) {
        const first = raw.split(/\s+/)[0];
        const clean = sanitizeForFilename(first);
        if (clean) return clean;
      }
    } catch (e) {
      // fall through to text-scan fallback
    }

    // Fallback: this page may not have the #name input (e.g. a fresh
    // printable summary page) — look for a "Name"/"नाम" label instead.
    const text = document.body.innerText || "";
    const patterns = [
      /applicant\s*name\s*[:\-]?\s*([A-Za-z]+)/i,
      /आवेदक\s*का\s*नाम\s*[:\-]?\s*([^\s,:.]+)/,
      /\bname\s*[:\-]\s*([A-Za-z]+)/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1]) {
        const clean = sanitizeForFilename(m[1]);
        if (clean) return clean;
      }
    }
    return null; // no guessing — filename just won't include a name
  }

  function buildFileName() {
    const label = detectViaFormType() || detectViaReceiptCode() || detectViaPageText() || "APP";
    const yearTwoDigits = String(new Date().getFullYear()).slice(-2);
    const firstName = getApplicantFirstName();
    return firstName ? `${label}${yearTwoDigits}_${firstName}.pdf` : `${label}${yearTwoDigits}.pdf`;
  }

  function tick() {
    if (triggered) return;
    const exportBtn = findButtonByText("Export to PDF");
    const closeBtn = findButtonByText("Close");
    if (exportBtn && closeBtn) {
      triggered = true;
      const filename = buildFileName();
      try {
        chrome.runtime.sendMessage({ type: "DS_SET_EXPORT_FILENAME", filename }, () => {
          void chrome.runtime.lastError; // no background listener yet? ignore, click anyway
          exportBtn.click();
        });
      } catch (e) {
        exportBtn.click(); // never let a messaging issue block the export itself
      }
    }
  }

  const observer = new MutationObserver(tick);
  observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tick);
  } else {
    tick();
  }
})();
