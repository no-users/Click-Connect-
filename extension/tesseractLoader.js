/**
 * tesseractLoader.js
 * ------------------------------------------------------------
 * Same idea as pdfjsLoader.js: tesseract.min.js was previously a
 * plain eager <script> tag in popup.html, parsed on every popup
 * open even for the majority of opens where the user never touches
 * Documents/OCR. It's a classic (non-module) script, so it's loaded
 * here via a dynamically-injected <script> tag rather than a module
 * import — window.Tesseract ends up identical either way, so nothing
 * in ocrEngine.js besides the loader call changes.
 * ------------------------------------------------------------
 */
(function () {
  let loadPromise = null;

  window.ensureTesseractLoaded = function ensureTesseractLoaded() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!loadPromise) {
      loadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("vendor/tesseract/tesseract.min.js");
        script.onload = () => resolve(window.Tesseract);
        script.onerror = () => {
          loadPromise = null; // allow retry on next call
          reject(new Error("tesseract.min.js load failed"));
        };
        document.head.appendChild(script);
      });
    }
    return loadPromise;
  };
})();
