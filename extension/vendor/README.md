# Vendor files needed (one-time setup)

⚠️ **If you already have a `vendor/` folder with small files (a few KB each)
that just return placeholder/dummy text — those are NOT the real
libraries and OCR will never work with them.** The real files are large
(tesseract.min.js is several hundred KB, pdf.min.js is 300-500KB+,
tesseract-core.wasm.js is a couple MB). If your files are tiny, delete
them and follow the steps below with the real ones.

I can't download these myself (this sandbox has no internet access), so
please grab them once and drop them into this `vendor/` folder. After that,
everything runs fully offline — no further downloads happen at runtime.

## 1. Tesseract.js (OCR engine)

Easiest reliable way — using npm (if you have Node.js installed):
```
npm install tesseract.js tesseract.js-core
```
Then copy these files from `node_modules/` into `vendor/tesseract/`:
- `node_modules/tesseract.js/dist/tesseract.min.js` → `vendor/tesseract/tesseract.min.js`
- `node_modules/tesseract.js/dist/worker.min.js` → `vendor/tesseract/worker.min.js`
- `node_modules/tesseract.js-core/tesseract-core.wasm.js` AND the matching
  `tesseract-core.wasm` file (same folder) → `vendor/tesseract/`

No Node.js? Download the same files directly from the tesseract.js GitHub
releases page (github.com/naptha/tesseract.js → check the `dist/` folder
of a tagged release) — just make sure whatever you save is genuinely
hundreds of KB, not a few lines of text.

Then create `vendor/tesseract/lang-data/` and put the trained language data
there (download once from
https://github.com/naptha/tessdata/tree/gh-pages/4.0.0_fast — fast models
are smaller and fine for this use case):
- `eng.traineddata.gz`
- `hin.traineddata.gz`

(~10–15 MB total for both languages — this is the only genuinely large
part of the whole feature. If yours are already ~1-2MB each, those look correct.)

## 2. PDF.js (so PDF uploads can be OCR'd page by page)

**Update:** current pdf.js releases ship `pdf.js`/`pdf.worker.js` as genuine ES
modules (they contain `export { ... }` statements) — there is no working
classic/UMD global-script build anymore, even in the "legacy" zip. The
project's code already handles this: `popup.html` imports `pdf.min.js` via
a `<script type="module">` tag and exposes it as `window.pdfjsLib` itself,
so you don't need to find or convert anything — just get the real files:

From https://github.com/mozilla/pdf.js/releases — download the
**"pdfjs-x.x.x-dist.zip"** asset (or `-legacy-dist.zip`, same content
now), then from `build/` inside it:
- `pdf.mjs` (or `pdf.js`) → save as `vendor/pdfjs/pdf.min.js`
- `pdf.worker.mjs` (or `pdf.worker.js`) → save as `vendor/pdfjs/pdf.worker.min.js`

Whatever you save, open it in a text editor and confirm it ends with an
`export { ... };` statement — that confirms it's the real module file
(not an empty/fake placeholder).

## Why bundle instead of using a CDN?

Two reasons:
1. Manifest V3 Chrome Web Store policy disallows loading executable code
   from a remote server — everything must ship inside the extension.
2. These documents can contain caste, income, and other sensitive
   personal data. Keeping OCR fully local means nothing about the
   customer's documents ever leaves their machine.

Once these files are in place, reload the unpacked extension in
`chrome://extensions` and the new **Documents** tab in the popup will work.
