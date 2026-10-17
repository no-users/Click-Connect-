/**
 * pdfjsLoader.js
 * ------------------------------------------------------------
 * pdf.js (vendor/pdfjs/pdf.min.js) is ~1MB — parsing/evaluating it
 * on every single popup open (even when the user never touches a
 * PDF that session) was pure wasted startup time.
 *
 * This file now only defines window.ensurePdfjsLoaded(): a small
 * function that dynamically imports pdf.js the FIRST time it's
 * actually needed (a PDF is opened for OCR, or pdfTools compresses
 * one), caches the result, and exposes it as window.pdfjsLib exactly
 * like before — so ocrEngine.js / pdfTools.js don't otherwise change.
 *
 * A plain <script> (classic, not type="module") can still use the
 * dynamic import() *expression* — that's a runtime operator, not the
 * static import statement, so it's allowed here and keeps this file
 * simple and synchronous to load.
 * ------------------------------------------------------------
 */
(function () {
  let pdfjsLoadPromise = null;

  window.ensurePdfjsLoaded = function ensurePdfjsLoaded() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsLoadPromise) {
      pdfjsLoadPromise = import(chrome.runtime.getURL("vendor/pdfjs/pdf.min.js"))
        .then((mod) => {
          window.pdfjsLib = mod;
          return mod;
        })
        .catch((e) => {
          pdfjsLoadPromise = null; // allow retry on next call
          throw e;
        });
    }
    return pdfjsLoadPromise;
  };
})();
