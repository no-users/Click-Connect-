/**
 * ocrEngine.js  (v3 — accuracy engine)
 * ------------------------------------------------------------
 * Fully OFFLINE OCR. Nothing here calls out to the internet.
 *
 * Why v3: Tesseract on its own happily returns junk for a blurry photo,
 * a dark-mode screenshot, a table with ruled lines, or a line that mixes
 * Hindi and English. The professional fix is not one better model but a
 * pipeline that checks its own work:
 *
 *   1. PREPARE   invert dark pages, crop away desk / borders, deskew,
 *                strip table lines, denoise + sharpen   (ocrPreprocess.js)
 *   2. READ      several passes with different page-segmentation modes
 *                on different clean-ups of the same page
 *   3. FUSE      row by row, keep whichever pass read that row best
 *   4. REPAIR    rows still unsure are cropped, enlarged and re-read by
 *                separate Hindi-only / English-only / block models;
 *                the best-scoring reading wins
 *   5. FILTER    low-confidence junk words, symbol runs and garbage rows
 *                are removed (the raw text is kept for inspection)
 *   6. CORRECT   label words snapped to the real vocabulary; corrections
 *                the operator made earlier are applied   (ocrLexicon.js)
 *   7. REPORT    blur / resolution / unsure-row warnings for the UI
 *
 * PDFs: the embedded text layer is used when present (exact), scanned
 * pages go through the pipeline above. e-Aadhaar passwords are supported.
 *
 * API (unchanged):  OcrEngine.extractTextFromFile(file, onStatus, options)
 *   -> { text, raw, confidence, method, pages, pageTexts, rotation,
 *        quality, lowLines, warnings, ms }
 * ------------------------------------------------------------
 */

const OcrEngine = (function () {

    const JOB_TIMEOUT_MS = 180000;    // protects the UI from a stuck recognise job
  const DEFAULT_MAX_PDF_PAGES = 10;
  const CACHE_LIMIT = 40;

  const cache = new Map();

  // ---------- small helpers ----------

  class OcrError extends Error {
    constructor(code, message) { super(message); this.name = "OcrError"; this.code = code; }
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw new OcrError("ABORTED", "Cancel kar diya gaya");
  }

  function withTimeout(promise, ms, label) {
    let t;
    const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new OcrError("TIMEOUT", (label || "OCR") + " bahut der laga raha hai (timeout)")), ms); });
    return Promise.race([promise, timer]).finally(() => clearTimeout(t));
  }

  function alnumCount(text) {
    const m = (text || "").match(/[A-Za-z0-9\u0900-\u097F]/g);
    return m ? m.length : 0;
  }

  function cleanText(t) {
    return (t || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")   // zero-width junk
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cacheKey(file, extra) {
    return [file.name, file.size, file.lastModified, extra || ""].join("|");
  }

  function remember(key, value) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, value);
  }

  // ---------- pdf.js ----------

  let pdfjsConfigured = false;
  function ensurePdfjsConfigured() {
    // pdf.js ships as an ES module, exposed as window.pdfjsLib by
    // pdfjsLoader.js. The worker path is set only once, lazily.
    if (pdfjsConfigured || typeof pdfjsLib === "undefined") return;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";
    pdfjsConfigured = true;
  }

  // ---------- worker pools ----------
  //
  // Different jobs need different engines. Sharing one worker and flipping its
  // parameters between jobs would be racy, so each configuration has its own
  // small pool, created lazily (the single-language ones only when a row needs repair).

  const POOL_CONFIG = {
    auto:   { langs: "eng+hin", psm: "3",  max: 3 },   // normal page layout analysis
    block:  { langs: "eng+hin", psm: "6",  max: 1 },   // one uniform block (receipts, cards)
    sparse: { langs: "eng+hin", psm: "11", max: 1 },   // scattered text (forms, screenshots)
    eng:    { langs: "eng",     psm: "7",  max: 1 },   // single line, English model only
    hin:    { langs: "hin",     psm: "7",  max: 1 },   // single line, Hindi model only
  };
  const pools = {}; // key -> { scheduler, workers, promise }

  function desiredAutoSize() {
    const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
    const mem = (typeof navigator !== "undefined" && navigator.deviceMemory) || 4;
    let n = Math.max(1, Math.min(POOL_CONFIG.auto.max, cores - 1));
    if (mem <= 2) n = 1;            // low-RAM machine: one worker only
    else if (mem <= 4) n = Math.min(n, 2);
    return n;
  }

  async function createOneWorker(cfg) {
    const w = await Tesseract.createWorker(cfg.langs, 1, {
      // All paths point at files bundled inside the extension —
      // no network access, works fully offline.
      workerPath: "vendor/tesseract/worker.min.js",
      corePath: "vendor/tesseract/tesseract-core.wasm.js",
      langPath: "vendor/tesseract/lang-data",
      // Critical for browser-extension contexts: forces the worker to
      // load as a real same-origin script instead of a CDN-backed Blob.
      workerBlobURL: false,
      logger: () => {},
    });
    try {
      await w.setParameters({
        preserve_interword_spaces: "1", // keeps column gaps -> better label/value parsing
        user_defined_dpi: "300",        // we pre-scale to ~300dpi; silences DPI guessing
        tessedit_pageseg_mode: cfg.psm,
      });
    } catch (e) { /* older cores may not accept a parameter; not fatal */ }
    return w;
  }

  async function ensurePool(key) {
    key = key || "auto";
    const slot = pools[key] || (pools[key] = {});
    if (slot.scheduler) return slot.scheduler;
    if (slot.promise) return slot.promise;
    const cfg = POOL_CONFIG[key];
    slot.promise = (async () => {
      if (window.ensureTesseractLoaded) await window.ensureTesseractLoaded();
      if (typeof Tesseract === "undefined") {
        throw new OcrError("NO_TESSERACT", "Tesseract load nahi hua (tesseractLoader.js aur vendor/tesseract files check karein).");
      }
      const n = key === "auto" ? desiredAutoSize() : cfg.max;
      const sched = Tesseract.createScheduler();
      const settled = await Promise.allSettled(Array.from({ length: n }, () => createOneWorker(cfg)));
      const workers = [];
      let firstErr = null;
      settled.forEach((r) => {
        if (r.status === "fulfilled") { sched.addWorker(r.value); workers.push(r.value); }
        else if (!firstErr) firstErr = r.reason;
      });
      if (!workers.length) throw firstErr || new OcrError("NO_WORKER", "OCR worker start nahi hua.");
      slot.workers = workers;
      slot.scheduler = sched;
      return sched;
    })().catch((e) => { slot.promise = null; throw e; });
    return slot.promise;
  }

  /** Call early (e.g. when the first file is added) so models are loaded by the time Extract is pressed. */
  function warmUp() { return Promise.all([ensurePool("auto"), window.OcrLexicon ? OcrLexicon.load() : null]).then(() => true).catch(() => false); }

  function getPoolSize() { return (pools.auto && pools.auto.workers && pools.auto.workers.length) || desiredAutoSize(); }

  // ---------- reading: Tesseract output -> lines with word confidences ----------

  const wlen = (t) => Math.max(1, Array.from(t).length);

  function weightedConf(words) {
    let s = 0, n = 0;
    words.forEach((w) => { const l = wlen(w.text); s += (w.conf || 0) * l; n += l; });
    return n ? s / n : 0;
  }

  function parseData(data) {
    const lines = [];
    (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => {
      const words = (l.words || []).map((w) => ({
        text: String(w.text || "").trim(), conf: typeof w.confidence === "number" ? w.confidence : 0,
        x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1,
      })).filter((w) => w.text);
      if (!words.length) return;
      lines.push({
        text: words.map((w) => w.text).join(" "), conf: weightedConf(words), words,
        x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1,
      });
    })));
    if (!lines.length && data.text && data.text.trim()) {
      // no layout info (older core): keep the text, give every row the page confidence
      data.text.split(/\n/).filter((t) => t.trim()).forEach((t, i) => {
        const words = t.trim().split(/\s+/).map((x) => ({ text: x, conf: data.confidence || 0 }));
        lines.push({ text: t.trim(), conf: data.confidence || 0, words, x0: 0, y0: i * 40, x1: 1, y1: i * 40 + 30 });
      });
    }
    return { text: cleanText(data.text), confidence: typeof data.confidence === "number" ? data.confidence : weightedConf(lines.flatMap((l) => l.words)), lines };
  }

  async function recognize(canvas, poolKey) {
    const sched = await ensurePool(poolKey || "auto");
    const { data } = await withTimeout(sched.addJob("recognize", canvas, {}, { text: true, blocks: true }), JOB_TIMEOUT_MS, "OCR");
    return parseData(data);
  }

  // ---------- judging a reading ----------

  const DEVA = /[\u0900-\u097F]/, LATIN = /[A-Za-z]/;

  /** Words that mix Hindi and Latin letters ("आवेBदन") — the signature of a mis-read line. */
  function mixedScriptCount(words) {
    let n = 0;
    words.forEach((w) => { if (DEVA.test(w.text) && LATIN.test(w.text)) n++; });
    return n;
  }

  /** Symbol soup, single-letter confetti, runs of one character … */
  function isJunkText(t) {
    const s = String(t || "").replace(/\s+/g, "");
    if (s.length < 1) return true;
    const good = (s.match(/[A-Za-z0-9\u0900-\u097F]/g) || []).length;
    if (good / s.length < 0.5) return true;
    const toks = String(t).trim().split(/\s+/);
    if (toks.length >= 3 && toks.filter((x) => Array.from(x).length === 1).length / toks.length > 0.6) return true;
    if (/(.)\1{4,}/.test(s)) return true;
    return false;
  }

  /**
   * A 12-digit group that is shaped like an Aadhaar number but fails the checksum
   * has at least one mis-read digit. Tesseract cannot know that; this can.
   */
  function badAadhaar(text) {
    if (typeof DocumentParser === "undefined" || !DocumentParser.verhoeffValid) return false;
    const re = /(?<!\d)(\d{4})\s?(\d{4})\s?(\d{4})(?!\d)/g;
    let m, bad = false;
    while ((m = re.exec(text))) {
      const d = m[1] + m[2] + m[3];
      if (/^[01]/.test(d)) continue;
      if (DocumentParser.verhoeffValid(d)) return false; // at least one valid number on the row — fine
      bad = true;
    }
    return bad;
  }

  /** Confidence adjusted for the junk signals Tesseract itself does not penalise. */
  function lineScore(line) {
    let sc = line.conf;
    if (badAadhaar(line.text)) sc -= 30;
    sc -= Math.min(36, mixedScriptCount(line.words) * 14);
    if (isJunkText(line.text)) sc -= 35;
    return sc;
  }

  function pageStats(lines) {
    const words = lines.flatMap((l) => l.words);
    const chars = words.reduce((a, w) => a + wlen(w.text), 0);
    return {
      conf: weightedConf(words), chars,
      low: lines.filter((l) => l.conf < 60 && alnumCount(l.text) >= 3).length,
      badNum: lines.filter((l) => badAadhaar(l.text)).length,
      junk: lines.filter((l) => isJunkText(l.text)).length,
      rows: lines.length,
    };
  }

  const isGood = (st) => st.chars >= 30 && st.conf >= 88 && st.low === 0 && st.junk === 0 && st.badNum === 0;

  // ---------- fusing passes: best reading per ROW ----------

  /**
   * Different passes cut the same page into different "lines" (one pass may
   * return a whole row, another the label and the value separately). Rows are
   * therefore rebuilt from vertical position: a line joins a row when its
   * CENTRE lies on that row's centre line. (Using the union of line boxes made
   * rows chain together whenever one line was taller than the rest.)
   * For every row the pass whose reading scores best is kept.
   */
  function fusePasses(passes) {
    const all = [];
    passes.forEach((p, pi) => p.lines.forEach((l) => all.push({ l, pi, cy: (l.y0 + l.y1) / 2, h: Math.max(6, l.y1 - l.y0) })));
    all.sort((a, b) => a.cy - b.cy);
    const rows = [];
    all.forEach((item) => {
      let row = null;
      for (let i = rows.length - 1; i >= 0 && i >= rows.length - 4; i--) {
        const r = rows[i];
        if (Math.abs(item.cy - r.cy) < 0.5 * Math.min(r.h, item.h)) { row = r; break; }
      }
      if (row) {
        row.items.push(item);
        row.cy = row.items.reduce((a, x) => a + x.cy, 0) / row.items.length;
        row.h = Math.min(row.h, item.h);
      } else rows.push({ cy: item.cy, h: item.h, items: [item] });
    });
    const fused = [];
    rows.forEach((row) => {
      const byPass = new Map();
      row.items.forEach((it) => { if (!byPass.has(it.pi)) byPass.set(it.pi, []); byPass.get(it.pi).push(it.l); });
      let best = null;
      byPass.forEach((ls, pi) => {
        ls.sort((a, b) => a.x0 - b.x0);
        const words = ls.flatMap((l) => l.words);
        const cand = {
          text: ls.map((l) => l.text).join("  "), words, conf: weightedConf(words), pass: pi,
          x0: Math.min(...ls.map((l) => l.x0)), x1: Math.max(...ls.map((l) => l.x1)),
          y0: Math.min(...ls.map((l) => l.y0)), y1: Math.max(...ls.map((l) => l.y1)),
        };
        cand.score = lineScore(cand) + Math.min(6, alnumCount(cand.text) / 12); // a row with more real text beats a clipped one
        if (!best || cand.score > best.score + 0.5) best = cand;
      });
      if (best) fused.push(best);
    });
    fused.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    return fused;
  }

  // ---------- repairing unsure rows ----------

  function cropLineCanvas(src, line) {
    const h = Math.max(8, line.y1 - line.y0);
    const padY = Math.round(h * 0.35), padX = 14;
    const sx = Math.max(0, line.x0 - padX), sy = Math.max(0, line.y0 - padY);
    const sw = Math.min(src.width - sx, line.x1 - line.x0 + padX * 2), sh = Math.min(src.height - sy, h + padY * 2);
    if (sw < 6 || sh < 6) return null;
    const k = Math.max(1, Math.min(3, 72 / sh));
    const border = 16;
    const c = document.createElement("canvas");
    c.width = Math.round(sw * k) + border * 2; c.height = Math.round(sh * k) + border * 2;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, sx, sy, sw, sh, border, border, Math.round(sw * k), Math.round(sh * k));
    return c;
  }

  /**
   * Re-read every unsure row on its own, enlarged, with three different engines
   * (Hindi-only, English-only, mixed block). A script-specific model cannot
   * confuse the two scripts, which is the main source of junk on mixed lines.
   */
  async function repairRows(rows, srcCanvas, signal) {
    const targets = rows.filter((r) => (r.conf < 66 || badAadhaar(r.text)) && alnumCount(r.text) >= 3 && r.x1 > r.x0).sort((a, b) => a.score - b.score).slice(0, 12);
    let repaired = 0;
    for (const row of targets) {
      throwIfAborted(signal);
      const crop = cropLineCanvas(srcCanvas, row);
      if (!crop) continue;
      const tries = await Promise.all(["hin", "eng", "block"].map(async (key) => {
        try {
          const r = await recognize(crop, key);
          const words = r.lines.flatMap((l) => l.words);
          if (!words.length) return null;
          const cand = { text: r.lines.map((l) => l.text).join(" "), words, conf: weightedConf(words) };
          cand.score = lineScore(cand);
          return cand;
        } catch (e) { return null; }
      }));
      const best = tries.filter(Boolean).sort((a, b) => b.score - a.score)[0];
      if (best && best.score > row.score + 6) {
        row.text = best.text; row.words = best.words.map((w) => Object.assign({}, w, { x0: row.x0, x1: row.x1, y0: row.y0, y1: row.y1 }));
        row.conf = best.conf; row.score = best.score; row.repaired = true; repaired++;
      }
    }
    return repaired;
  }

  // ---------- filtering + correcting ----------

  /** Drop confetti words and garbage rows; correct what is left. Returns { lines, dropped }. */
  function filterRows(rows) {
    const keep = [];
    let dropped = 0;
    const pageConf = pageStats(rows).conf;
    // On a poor page, anything the engine itself is that unsure about is more likely
    // invention than reading — better to show nothing than something wrong.
    const floor = pageConf < 55 ? 48 : 38;
    rows.forEach((row) => {
      let words = row.words.filter((w) => {
        const t = w.text;
        const alnum = alnumCount(t);
        if (!alnum) return /^[:：\/\-–()\[\].,|]$/.test(t) && w.conf >= 55; // keep structural punctuation only when read confidently
        if (/^\d+$/.test(t) || /\d/.test(t)) return w.conf >= 25;           // numbers: precious, keep unless hopeless
        if (alnum <= 2 && w.conf < 45) return false;                        // short + unsure = noise
        return w.conf >= 28;
      });
      if (window.OcrLexicon) words = OcrLexicon.correctWords(words);
      const text = words.map((w) => w.text).join(" ").replace(/\s+([:：])/g, " $1").trim();
      const hasBigNumber = /\d{6,}/.test(text);   // ref / mobile / Aadhaar numbers are worth keeping even when unsure
      if (!text || alnumCount(text) < 2 || isJunkText(text) || (row.conf < floor && !hasBigNumber) || (row.conf < 30 && alnumCount(text) < 6)) { dropped++; return; }
      keep.push({ text, conf: row.conf, y0: row.y0, y1: row.y1, repaired: !!row.repaired });
    });
    return { lines: keep, dropped };
  }

  // ---------- page-level OCR pipeline ----------

  async function detectQuarterTurns(baseCanvas, candidates) {
    const Pre = OcrPreprocess;
    const small = Pre.bitmapToCanvas(baseCanvas, { minLong: 0, maxLong: 1, target: 1100 });
    const jobs = candidates.map(async (q) => {
      const rot = Pre.rotateCanvas90(small, q);
      const v = Pre.buildVariants(rot, { deskew: false, orientation: false, crop: false, sharp: false, lines: false });
      const r = await recognize(v.plain, "auto");
      return { q, score: r.confidence + Math.min(25, alnumCount(r.text) / 8) };
    });
    const res = await Promise.all(jobs);
    res.sort((a, b) => b.score - a.score);
    const zero = res.find((r) => r.q === 0);
    const zeroScore = zero ? zero.score : 0; // sideways hint: 0° isn't a candidate
    if (res[0].q !== 0 && res[0].score > zeroScore + 12) return res[0].q;
    return 0;
  }

  /**
   * Blurry / shaky photo rescue: try six blur models on a small crop, keep the
   * one whose deconvolved crop OCRs best, then apply it to the whole page.
   * Returns null when nothing clearly helps.
   */
  async function deblurPage(v, signal) {
    const Pre = OcrPreprocess;
    const sample = Pre.sampleCrop(v.gray, v.width, v.height, 900, 460);
    const score = async (g) => {
      const r = await recognize(Pre.grayToCanvas(g, sample.w, sample.h), "auto");
      return r.confidence + Math.min(25, alnumCount(r.text) / 8);
    };
    const baseScore = await score(sample.data);
    let best = null;
    // very soft page -> defocus is the likely cause; otherwise hand-shake is
    const all = Pre.blurModels(), pick = (names) => all.filter((m) => names.includes(m.name));
    const models = v.quality.blur < 120 ? pick(["defocus-2.5", "defocus-4", "shake-h9"]) : pick(["defocus-1.5", "defocus-2.5", "shake-h9", "shake-h15"]);
    for (const m of models) {
      throwIfAborted(signal);
      const sc = await score(Pre.richardsonLucy(sample.data, sample.w, sample.h, Pre.psfFor(m, 1), 10));
      if (!best || sc > best.score) best = { m, score: sc };
    }
    if (!best || best.score < baseScore + 8) return null;
    const g = Pre.deblurGray(v.gray, v.width, v.height, best.m, 8);
    const vs = Pre.variantsFromGray(g, v.width, v.height, {});
    return Object.assign({}, vs, { gray: g, model: best.m.name });
  }

  /** Several passes -> fuse -> (deblur rescue) -> repair. `canvas` is the already scaled page. */
  async function readPage(canvas, signal) {
    const Pre = OcrPreprocess;
    const v = Pre.buildVariants(canvas);
    if (v.orientation && v.orientation.sideways) return { sideways: true, v };

    // Start with the variant that suits this page: ruled/table pages read far better
    // (and faster) with the lines already removed.
    const ruled = v.quality.ruled > 0.25; // heavy table / ruled page (blurred horizontal strokes score ~0.1, so they do not trigger this)
    const order = ruled ? [v.clean, v.plain] : [v.plain, v.clean];
    const passes = [await recognize(order[0], "auto")];
    throwIfAborted(signal);
    let st = pageStats(passes[0].lines);
    let tried = 1;
    // A (nearly) blank page has nothing to rescue — don't burn time on more passes.
    if (st.chars < 4) return { rows: passes[0].lines.map((l) => Object.assign({}, l, { score: lineScore(l) })), v, tried, repaired: 0, sideways: false };

    // A ruled page is always read twice: the line-free variant is fast but lossy
    // (it once turned "BCCCO" into "80000"), so it is cross-checked against the original.
    if (!isGood(st) || ruled) {
      passes.push(await recognize(order[1], "auto")); tried++;
      throwIfAborted(signal);
      st = pageStats(fusePasses(passes));
    }
    if (!isGood(st) && st.conf < 84) {
      passes.push(await recognize(ruled ? v.clean : v.plain, "block")); tried++;
      throwIfAborted(signal);
      st = pageStats(fusePasses(passes));
    }
    if (!isGood(st) && st.conf < 74 && v.sharp) {
      passes.push(await recognize(v.sharp, "sparse")); tried++;
      throwIfAborted(signal);
      st = pageStats(fusePasses(passes));
    }

    // Still weak: it may be out of focus or shaken — try to undo the blur.
    let deblurred = null;
    if (!isGood(st) && (st.conf < 72 || v.quality.blur < 90)) {
      try {
        deblurred = await deblurPage(v, signal);
        if (deblurred) {
          passes.push(await recognize(deblurred.plain, "auto")); tried++;
          if (!ruled) { passes.push(await recognize(deblurred.clean, "auto")); tried++; }
        }
      } catch (e) { if (e && e.code === "ABORTED") throw e; }
    }

    // Always rebuild ROWS by vertical position — even for a single pass. Tesseract returns a
    // two-column form (label | value) as two separate blocks; rows put "label : value" back together.
    let rows = fusePasses(passes);

    let repaired = 0;
    try { repaired = await repairRows(rows, (deblurred || v).plain, signal); } catch (e) { if (e && e.code === "ABORTED") throw e; }
    if (deblurred) v.quality.deblurred = deblurred.model;
    return { rows, v, tried, repaired, sideways: false };
  }

  function qualityWarnings(v, srcW, srcH, st, dropped) {
    const w = [];
    const q = v.quality || {};
    const hasContent = st.rows >= 2 && st.chars >= 20;           // a blank page is not "blurry", it is just empty
    if (hasContent && typeof q.blur === "number" && q.blur < 55) w.push("Image dhundhli (blurry) hai — saaf photo lene par accuracy kaafi badhegi");
    if (hasContent && (Math.min(srcW, srcH) < 280 || srcW * srcH < 300000)) w.push("Image ki resolution bahut kam hai — badi / saaf image use karein");
    if (st.low > 0) w.push(`${st.low} line saaf nahi padhi gayi — raw text me check karein`);
    if (st.conf < 55 && st.rows >= 2) w.unshift("Image padhne layak saaf nahi hai — bharosemand text nahi mila. Saaf photo ya PDF se dobara try karein");
    return w;
  }

  /**
   * OCR one page image (canvas / ImageBitmap).
   * @returns {{text, raw, confidence, rotation, quality, lowLines, warnings, passes}}
   */
  async function ocrPage(source, signal) {
    const Pre = OcrPreprocess;
    if (window.OcrLexicon) { try { await OcrLexicon.load(); } catch (e) { /* optional */ } }
    const srcW = source.width, srcH = source.height;
    let base = Pre.bitmapToCanvas(source);
    throwIfAborted(signal);

    let page = await readPage(base, signal);
    let rotation = 0;

    const weak = !page.sideways && (pageStats(page.rows).conf < 70 || alnumCount(page.rows.map((r) => r.text).join(" ")) < 15);
    if (page.sideways || weak) {
      throwIfAborted(signal);
      const q = await detectQuarterTurns(base, page.sideways ? [1, 3] : [0, 2]);
      if (q !== 0) {
        const rotated = Pre.rotateCanvas90(base, q);
        const again = await readPage(rotated, signal);
        if (!again.sideways) {
          const better = !page.rows || pageStats(again.rows).conf >= pageStats(page.rows).conf;
          if (better) { page = again; rotation = q * 90; base = rotated; }
        }
      } else if (page.sideways) {
        // the "sideways" hint was wrong (e.g. a table-heavy page) — read it as it is
        const v = Pre.buildVariants(base, { orientation: false });
        const r = await recognize(v.plain, "auto");
        page = { rows: r.lines.map((l) => Object.assign({}, l, { score: lineScore(l) })), v, tried: 1, repaired: 0 };
      }
    }

    const rows = page.rows || [];
    const st = pageStats(rows);
    const raw = rows.map((r) => r.text).join("\n");
    const { lines, dropped } = filterRows(rows);
    let text = lines.map((l) => l.text).join("\n");
    if (window.OcrLexicon) text = OcrLexicon.applyLearned(text);
    const lowLines = lines.filter((l) => l.conf < 60).map((l) => ({ text: l.text, conf: Math.round(l.conf) }));

    return {
      text: cleanText(text), raw: cleanText(raw), confidence: st.conf, rotation,
      quality: Object.assign({}, page.v ? page.v.quality : {}, { dropped, repaired: page.repaired || 0, passes: page.tried || 1 }),
      lowLines, warnings: qualityWarnings(page.v || { quality: {} }, srcW, srcH, st, dropped), passes: page.tried || 1,
    };
  }

  // ---------- PDF text-layer extraction ----------

  function textContentToLines(tc) {
    const buckets = new Map();           // y-bucket -> row
    const rows = [];
    for (const it of tc.items) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      const key = Math.round(y / 3);
      let row = buckets.get(key) || buckets.get(key - 1) || buckets.get(key + 1);
      if (!row) { row = { y, items: [] }; buckets.set(key, row); rows.push(row); }
      row.items.push({ x, str: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);      // PDF y grows upward
    return rows.map((r) => {
      r.items.sort((a, b) => a.x - b.x);
      let line = "", lastEnd = null;
      for (const it of r.items) {
        if (lastEnd !== null && it.x - lastEnd > 3) line += " ";
        line += it.str;
        lastEnd = it.x + it.w;
      }
      return line.replace(/\s+/g, " ").trim();
    }).filter(Boolean).join("\n");
  }

  /** Rejects text layers made of replacement/private-use glyphs (broken font maps). */
  function textLayerLooksValid(text) {
    if (!text) return false;
    const bad = (text.match(/[\uFFFD\uE000-\uF8FF\u0000-\u0008]/g) || []).length;
    return bad / text.length < 0.08;
  }

  async function openPdf(file, options) {
    if (window.ensurePdfjsLoaded) await window.ensurePdfjsLoaded();
    ensurePdfjsConfigured();
    if (typeof pdfjsLib === "undefined") {
      throw new OcrError("NO_PDFJS", "pdfjsLib load nahi hua (popup.html ka module script aur vendor/pdfjs files check karein).");
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const task = pdfjsLib.getDocument({ data: buf, isEvalSupported: false });

    let cancelledByUser = false;
    task.onPassword = (updatePassword, reason) => {
      const wrong = reason === 2; // 1 = password needed, 2 = last one was wrong
      Promise.resolve(options.askPassword ? options.askPassword(file, wrong) : null).then((pw) => {
        if (pw === null || pw === undefined || pw === "") {
          cancelledByUser = true;
          task.destroy().catch(() => {});
        } else {
          updatePassword(pw);
        }
      });
    };

    try {
      return await task.promise;
    } catch (e) {
      if (cancelledByUser) throw new OcrError("PASSWORD_CANCELLED", "Password nahi diya gaya — PDF skip");
      if (e && e.name === "PasswordException") throw new OcrError("PASSWORD_CANCELLED", "PDF password-protected hai");
      if (e && (e.name === "InvalidPDFException" || e.name === "FormatError")) {
        throw new OcrError("PDF_BROKEN", "PDF kharab ya corrupt lag rahi hai");
      }
      throw e;
    }
  }

  async function ocrPdf(file, options, report) {
    const { signal } = options;
    const pdf = await openPdf(file, options);
    const maxPages = options.maxPages || DEFAULT_MAX_PDF_PAGES;
    const total = Math.min(pdf.numPages, maxPages);
    const warnings = [];
    if (pdf.numPages > maxPages) warnings.push(`PDF me ${pdf.numPages} pages hain — sirf pehle ${maxPages} process hue.`);

    const parts = [];
    const raws = [];
    const lowLines = [];
    let quality = null;
    const pageInfo = [];
    let rotationUsed = 0;

    try {
      for (let p = 1; p <= total; p++) {
        throwIfAborted(signal);
        const page = await pdf.getPage(p);
        const frac = (i) => ((p - 1) + i) / total;

        let layerText = "";
        if (!options.forceOcr) {
          report(frac(0.05), `Text layer padh raha hai… page ${p}/${total}`);
          try { layerText = textContentToLines(await page.getTextContent()); } catch (e) { layerText = ""; }
        }

        if (!options.forceOcr && alnumCount(layerText) >= 25 && textLayerLooksValid(layerText)) {
          parts.push(layerText);
          raws.push(layerText);
          pageInfo.push({ page: p, method: "pdf-text", confidence: 99 });
        } else {
          report(frac(0.1), `OCR chal raha hai… page ${p}/${total} (render)`);
          const vp1 = page.getViewport({ scale: 1 });
          const scale = Math.min(4, Math.max(1.5, 2200 / Math.max(vp1.width, vp1.height)));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, canvas, viewport }).promise;
          throwIfAborted(signal);

          report(frac(0.35), `OCR chal raha hai… page ${p}/${total}`);
          const r = await ocrPage(canvas, signal);
          parts.push(r.text);
          raws.push(r.raw);
          r.lowLines.forEach((l) => lowLines.push(l));
          r.warnings.forEach((w) => { if (!warnings.includes(w)) warnings.push(w); });
          if (!quality) quality = r.quality;
          pageInfo.push({ page: p, method: "ocr", confidence: r.confidence, rotation: r.rotation });
          if (r.rotation) rotationUsed = r.rotation;
        }
        try { page.cleanup(); } catch (e) {}
        report(frac(1), `Page ${p}/${total} ho gaya`);
      }
    } finally {
      try { await pdf.destroy(); } catch (e) {}
    }

    const confs = pageInfo.map((i) => i.confidence);
    const usedOcr = pageInfo.some((i) => i.method === "ocr");
    const usedText = pageInfo.some((i) => i.method === "pdf-text");
    return {
      text: parts.join("\n\n"),
      raw: raws.join("\n\n"),
      pageTexts: parts.slice(),
      quality, lowLines,
      confidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null,
      method: usedOcr && usedText ? "mixed" : usedOcr ? "ocr" : "pdf-text",
      pages: total,
      rotation: rotationUsed,
      warnings,
    };
  }

  // ---------- image files ----------

  async function loadBitmap(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e1) {
      try { return await createImageBitmap(file); }
      catch (e2) {
        throw new OcrError("UNSUPPORTED", "Ye image format padh nahi paye (HEIC/WEBP?) — JPG ya PNG me convert karke try karein.");
      }
    }
  }

  async function ocrImage(file, options, report) {
    report(0.05, "OCR chal raha hai… image load");
    const bmp = await loadBitmap(file);
    throwIfAborted(options.signal);
    report(0.2, "OCR chal raha hai… image saaf ho rahi hai");
    let result;
    try { result = await ocrPage(bmp, options.signal); }
    finally { if (bmp.close) bmp.close(); }
    report(1, "Image ho gayi");
    return {
      text: result.text,
      raw: result.raw,
      pageTexts: [result.text],
      confidence: result.confidence,
      method: "ocr",
      pages: 1,
      rotation: result.rotation,
      quality: result.quality,
      lowLines: result.lowLines,
      warnings: result.warnings,
    };
  }

  // ---------- public API ----------

  /**
   * Extract raw text (+ OCR confidence, 0-100) from any supported file.
   * @param {File} file
   * @param {(status:string)=>void} [onStatus]  human-readable status line
   * @param {object} [options]
   * @param {(p:{pct:number,stage:string})=>void} [options.onProgress]
   * @param {(file:File, wasWrong:boolean)=>Promise<string|null>|string|null} [options.askPassword]
   * @param {boolean} [options.forceOcr]  ignore a PDF's text layer and OCR it anyway
   * @param {number}  [options.maxPages]
   * @param {AbortSignal} [options.signal]
   */
  async function extractTextFromFile(file, onStatus, options) {
    options = options || {};
    const started = Date.now();
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    const key = cacheKey(file, options.forceOcr ? "force" : "");
    if (cache.has(key)) {
      if (onStatus) onStatus("Done (cache)");
      if (options.onProgress) options.onProgress({ pct: 100, stage: "cache" });
      return Object.assign({}, cache.get(key), { cached: true });
    }

    const report = (frac, stage) => {
      if (onStatus) onStatus(stage);
      if (options.onProgress) options.onProgress({ pct: Math.max(0, Math.min(100, Math.round(frac * 100))), stage });
    };

    throwIfAborted(options.signal);
    report(0, isPdf ? "PDF khul rahi hai…" : "Image padh raha hai…");

    const result = isPdf ? await ocrPdf(file, options, report) : await ocrImage(file, options, report);
    result.ms = Date.now() - started;

    remember(key, result);
    if (onStatus) onStatus("Done");
    return result;
  }

  async function terminate() {
    const slots = Object.keys(pools).map((k) => pools[k]);
    Object.keys(pools).forEach((k) => delete pools[k]);
    const list = slots.flatMap((sl) => sl.workers || []);
    await Promise.allSettled(list.map((w) => w.terminate()));
  }

  function clearCache() { cache.clear(); }

  return { extractTextFromFile, warmUp, terminate, clearCache, getPoolSize, OcrError };
})();
