/**
 * ocrPreprocess.js
 * ------------------------------------------------------------
 * Image clean-up BEFORE OCR. Phone photos / scans of Aadhaar,
 * ration cards etc. are usually tilted, shadowed, low contrast or
 * too small — Tesseract's accuracy drops a lot on those. This file
 * fixes that fully offline, with zero dependencies.
 *
 * Layout:
 *   - Pure functions (work on plain Uint8ClampedArray buffers, so
 *     they can be unit-tested in Node):
 *       toGray, stretchContrast, otsuThreshold, adaptiveBinarize,
 *       estimateSkewDegrees, rotateGray, boxDownscale
 *   - Canvas helpers (browser only):
 *       bitmapToCanvas, buildVariants, rotateCanvas90
 * ------------------------------------------------------------
 */

const OcrPreprocess = (function () {

  // ---------- pure pixel functions ----------

  /** RGBA -> 8-bit luma. */
  function toGray(rgba, w, h) {
    const out = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < out.length; i++, p += 4) {
      const a = rgba[p + 3];
      // Transparent pixels (PNG scans) are treated as white paper.
      const r = a === 255 ? rgba[p] : (rgba[p] * a + 255 * (255 - a)) / 255;
      const g = a === 255 ? rgba[p + 1] : (rgba[p + 1] * a + 255 * (255 - a)) / 255;
      const b = a === 255 ? rgba[p + 2] : (rgba[p + 2] * a + 255 * (255 - a)) / 255;
      out[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    }
    return out;
  }

  /** Percentile contrast stretch (ignores 1% darkest / 1% brightest outliers). */
  function stretchContrast(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
    if (hi - lo < 20) return gray; // nearly flat image — stretching would only amplify noise
    const scale = 255 / (hi - lo);
    const out = new Uint8ClampedArray(gray.length);
    for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - lo) * scale;
    return out;
  }

  /** Otsu's global threshold (0-255). */
  function otsuThreshold(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = 0, threshold = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; threshold = t; }
    }
    return threshold;
  }

  /**
   * Adaptive (local) binarisation — handles shadows / uneven lighting
   * from phone photos, where one global threshold would turn half the
   * page black. Bradley-Roth with an integral image (O(n)).
   * Returns a gray buffer containing only 0 (ink) and 255 (paper).
   */
  function adaptiveBinarize(gray, w, h, opts) {
    opts = opts || {};
    const win = Math.max(15, ((opts.windowSize || Math.round(w / 12)) | 1));
    const half = win >> 1;
    const t = typeof opts.sensitivity === "number" ? opts.sensitivity : 0.15;
    const global = otsuThreshold(gray);

    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        rowSum += gray[y * w + x];
        integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
      }
    }

    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const y1 = Math.max(0, y - half), y2 = Math.min(h - 1, y + half);
      for (let x = 0; x < w; x++) {
        const x1 = Math.max(0, x - half), x2 = Math.min(w - 1, x + half);
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);
        const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)] - integral[y1 * (w + 1) + (x2 + 1)]
                  - integral[(y2 + 1) * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
        const v = gray[y * w + x];
        // Dark relative to its neighbourhood AND not clearly paper-bright
        // globally — the second test stops speckle noise on blank areas.
        out[y * w + x] = (v * count <= sum * (1 - t) && v < global + 30) ? 0 : 255;
      }
    }
    return out;
  }

  /** Average-box downscale of a gray buffer so the long side == maxSide. */
  function boxDownscale(gray, w, h, maxSide) {
    const longSide = Math.max(w, h);
    if (longSide <= maxSide) return { data: gray, w, h, factor: 1 };
    const factor = longSide / maxSide;
    const nw = Math.max(1, Math.round(w / factor)), nh = Math.max(1, Math.round(h / factor));
    const out = new Uint8ClampedArray(nw * nh);
    for (let y = 0; y < nh; y++) {
      const sy1 = Math.floor(y * factor), sy2 = Math.min(h, Math.max(sy1 + 1, Math.floor((y + 1) * factor)));
      for (let x = 0; x < nw; x++) {
        const sx1 = Math.floor(x * factor), sx2 = Math.min(w, Math.max(sx1 + 1, Math.floor((x + 1) * factor)));
        let sum = 0, n = 0;
        for (let yy = sy1; yy < sy2; yy++) for (let xx = sx1; xx < sx2; xx++) { sum += gray[yy * w + xx]; n++; }
        out[y * nw + x] = sum / n;
      }
    }
    return { data: out, w: nw, h: nh, factor };
  }

  /**
   * Estimate page skew in degrees (positive = rotateGray(+angle) straightens it).
   * Projection-profile method: the correct angle makes text lines produce
   * the "spikiest" horizontal histogram. Searches ±maxAngle only, so a
   * wrongly-guessed huge angle is never applied.
   */
  function estimateSkewDegrees(gray, w, h, maxAngle) {
    maxAngle = maxAngle || 10;
    const small = boxDownscale(gray, w, h, 700);
    const sw = small.w, sh = small.h;
    // Local (adaptive) binarisation, NOT a global threshold: a shadow
    // across half the photo would otherwise count as "ink" and hide
    // the text lines the projection profile is looking for.
    const sg = adaptiveBinarize(small.data, sw, sh, { windowSize: Math.round(sw / 14) });

    const pts = [];
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) if (sg[y * sw + x] === 0) pts.push(x, y);
    }
    if (pts.length < 400) return 0; // practically blank — nothing to deskew
    const cx = sw / 2, cy = sh / 2;
    const rows = Math.ceil(Math.hypot(sw, sh)) + 4;
    const hist = new Float64Array(rows);

    function score(deg) {
      const r = deg * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
      hist.fill(0);
      const off = rows / 2;
      for (let i = 0; i < pts.length; i += 2) {
        const yy = (pts[i] - cx) * sin + (pts[i + 1] - cy) * cos + off;
        hist[yy | 0]++;
      }
      let s = 0;
      for (let i = 1; i < rows; i++) { const d = hist[i] - hist[i - 1]; s += d * d; }
      return s;
    }

    let best = 0, bestScore = score(0);
    for (let a = -maxAngle; a <= maxAngle; a += 0.5) {
      const s = score(a);
      if (s > bestScore) { bestScore = s; best = a; }
    }
    const coarse = best;
    for (let a = coarse - 0.5; a <= coarse + 0.5; a += 0.1) {
      const s = score(a);
      if (s > bestScore) { bestScore = s; best = a; }
    }
    // Ignore tiny angles: rotating adds interpolation blur for no real gain.
    return Math.abs(best) < 0.4 ? 0 : Math.round(best * 10) / 10;
  }

  /**
   * Cheap sideways-page detector (no OCR needed). Text lines make the
   * HORIZONTAL projection spiky; on a page rotated 90° it is the
   * VERTICAL projection that becomes spiky instead.
   * Returns { sideways, ratio } where ratio = columnSharpness / rowSharpness.
   */
  function estimateOrientation(gray, w, h) {
    const small = boxDownscale(gray, w, h, 700);
    const sw = small.w, sh = small.h;
    const bin = adaptiveBinarize(small.data, sw, sh, { windowSize: Math.round(sw / 14) });
    const rows = new Float64Array(sh), cols = new Float64Array(sw);
    let ink = 0;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (bin[y * sw + x] === 0) { rows[y]++; cols[x]++; ink++; }
    if (ink < 400) return { sideways: false, ratio: 1 };
    const sharp = (a) => { let s = 0; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; s += d * d; } return s / a.length; };
    const ratio = sharp(cols) / Math.max(1e-9, sharp(rows));
    return { sideways: ratio > 1.5, ratio };
  }

  /** Rotate a gray buffer by `deg` (same convention as estimateSkewDegrees), paper-white fill. */
  function rotateGray(gray, w, h, deg) {
    if (!deg) return { data: gray, w, h };
    const r = deg * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    const cx = w / 2, cy = h / 2;
    const out = new Uint8ClampedArray(w * h).fill(255);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx, dy = y - cy;
        const sx = cx + dx * cos + dy * sin;
        const sy = cy - dx * sin + dy * cos;
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
        const fx = sx - x0, fy = sy - y0;
        const i = y0 * w + x0;
        out[y * w + x] = gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy)
                       + gray[i + w] * (1 - fx) * fy + gray[i + w + 1] * fx * fy;
      }
    }
    return { data: out, w, h };
  }


  // ---------- quality analysis + extra clean-up (v3) ----------

  /** Variance of the Laplacian — the standard "is this photo blurry?" measure. Higher = sharper. */
  function blurScore(gray, w, h) {
    const sm = boxDownscale(gray, w, h, 900);
    const d = sm.data, W = sm.w, H = sm.h;
    let sum = 0, sum2 = 0, n = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const lap = 4 * d[i] - d[i - 1] - d[i + 1] - d[i - W] - d[i + W];
        sum += lap; sum2 += lap * lap; n++;
      }
    }
    if (!n) return 0;
    const mean = sum / n;
    return sum2 / n - mean * mean;
  }

  /** Light text on a dark background (receipt screenshots in dark mode, photos of dark cards). */
  function looksInverted(gray) {
    const t = otsuThreshold(gray);
    let dark = 0;
    for (let i = 0; i < gray.length; i += 3) if (gray[i] < t) dark++;
    return dark / Math.ceil(gray.length / 3) > 0.56;
  }

  function invertGray(gray) {
    const out = new Uint8ClampedArray(gray.length);
    for (let i = 0; i < gray.length; i++) out[i] = 255 - gray[i];
    return out;
  }

  /**
   * Bounding box of the actual content, so desk / wall / screenshot borders
   * (a big source of junk characters) are not read at all.
   * Returns null when cropping would not help (or looks unsafe).
   */
  function contentBox(gray, w, h) {
    const sm = boxDownscale(gray, w, h, 600);
    const bin = adaptiveBinarize(sm.data, sm.w, sm.h, { windowSize: Math.round(sm.w / 14) });
    const W = sm.w, H = sm.h;
    const rows = new Uint32Array(H), cols = new Uint32Array(W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (bin[y * W + x] === 0) { rows[y]++; cols[x]++; }
    const rt = Math.max(2, W * 0.004), ct = Math.max(2, H * 0.004);
    let y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1;
    while (y0 < H && rows[y0] < rt) y0++;
    while (y1 > y0 && rows[y1] < rt) y1--;
    while (x0 < W && cols[x0] < ct) x0++;
    while (x1 > x0 && cols[x1] < ct) x1--;
    if (y1 <= y0 || x1 <= x0) return null;
    const f = sm.factor || 1;
    const mx = Math.max(24, Math.round(w * 0.025)), my = Math.max(24, Math.round(h * 0.025));
    const box = {
      x0: Math.max(0, Math.round(x0 * f) - mx), y0: Math.max(0, Math.round(y0 * f) - my),
      x1: Math.min(w, Math.round((x1 + 1) * f) + mx), y1: Math.min(h, Math.round((y1 + 1) * f) + my),
    };
    const area = ((box.x1 - box.x0) * (box.y1 - box.y0)) / (w * h);
    return area < 0.3 || area > 0.9 ? null : box;
  }

  function cropGray(gray, w, h, box) {
    const nw = box.x1 - box.x0, nh = box.y1 - box.y0;
    const out = new Uint8ClampedArray(nw * nh);
    for (let y = 0; y < nh; y++) out.set(gray.subarray((box.y0 + y) * w + box.x0, (box.y0 + y) * w + box.x0 + nw), y * nw);
    return { data: out, w: nw, h: nh };
  }

  /**
   * Erase long thin ruled lines (table borders, form boxes, underlines).
   * They are read as "|", "_", "—" junk and glue neighbouring words together.
   * Works on a 0 = ink / 255 = paper buffer. Thick dark blocks are left alone.
   */
  function removeRuledLines(bin, w, h) {
    const out = new Uint8ClampedArray(bin);
    const hMin = Math.round(w * 0.16), vMin = Math.round(h * 0.16);
    const MAXT = 10;
    // horizontal
    const hRows = new Uint8Array(h);
    for (let y = 0; y < h; y++) {
      let run = 0, best = 0;
      for (let x = 0; x < w; x++) { if (bin[y * w + x] === 0) { run++; if (run > best) best = run; } else run = 0; }
      hRows[y] = best >= hMin ? 1 : 0;
    }
    for (let y = 0; y < h;) {
      if (!hRows[y]) { y++; continue; }
      let y2 = y; while (y2 < h && hRows[y2]) y2++;
      if (y2 - y <= MAXT) {
        for (let yy = y; yy < y2; yy++) {
          let x = 0;
          while (x < w) {
            if (bin[yy * w + x] !== 0) { x++; continue; }
            let x2 = x; while (x2 < w && bin[yy * w + x2] === 0) x2++;
            if (x2 - x >= hMin) for (let k = x; k < x2; k++) out[yy * w + k] = 255;
            x = x2;
          }
        }
      }
      y = y2;
    }
    // vertical
    const vCols = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      let run = 0, best = 0;
      for (let y = 0; y < h; y++) { if (bin[y * w + x] === 0) { run++; if (run > best) best = run; } else run = 0; }
      vCols[x] = best >= vMin ? 1 : 0;
    }
    for (let x = 0; x < w;) {
      if (!vCols[x]) { x++; continue; }
      let x2 = x; while (x2 < w && vCols[x2]) x2++;
      if (x2 - x <= MAXT) {
        for (let xx = x; xx < x2; xx++) {
          let y = 0;
          while (y < h) {
            if (bin[y * w + xx] !== 0) { y++; continue; }
            let y2 = y; while (y2 < h && bin[y2 * w + xx] === 0) y2++;
            if (y2 - y >= vMin) for (let k = y; k < y2; k++) out[k * w + xx] = 255;
            y = y2;
          }
        }
      }
      x = x2;
    }
    return out;
  }

  /** 3x3 median — removes salt-and-pepper / JPEG speckle without blurring character edges much. */
  function medianBlur3(gray, w, h) {
    const out = new Uint8ClampedArray(gray);
    const v = new Array(9);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        v[0] = gray[i - w - 1]; v[1] = gray[i - w]; v[2] = gray[i - w + 1];
        v[3] = gray[i - 1]; v[4] = gray[i]; v[5] = gray[i + 1];
        v[6] = gray[i + w - 1]; v[7] = gray[i + w]; v[8] = gray[i + w + 1];
        for (let a = 1; a < 9; a++) { const t = v[a]; let b = a - 1; while (b >= 0 && v[b] > t) { v[b + 1] = v[b]; b--; } v[b + 1] = t; }
        out[i] = v[4];
      }
    }
    return out;
  }

  /** Unsharp mask — restores edge contrast on soft / slightly out-of-focus photos. */
  function sharpen(gray, w, h, amount) {
    amount = amount || 1.1;
    const out = new Uint8ClampedArray(gray);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const blur = (gray[i - w - 1] + gray[i - w] + gray[i - w + 1] + gray[i - 1] + gray[i] + gray[i + 1] + gray[i + w - 1] + gray[i + w] + gray[i + w + 1]) / 9;
        out[i] = gray[i] + amount * (gray[i] - blur);
      }
    }
    return out;
  }


  // ---------- deblur (Richardson–Lucy deconvolution) ----------

  function gaussKernel(sigma) {
    const r = Math.max(1, Math.ceil(sigma * 3)), k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
    return k.map((v) => v / sum);
  }
  const boxKernel = (len) => new Array(len).fill(1 / len);

  /** Separable convolution with clamped edges. kx / ky may be null (no blur on that axis). */
  function convSep(src, w, h, kx, ky, tmp, out) {
    if (kx) {
      const r = kx.length >> 1;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          let acc = 0;
          for (let k = -r; k <= r; k++) { let xx = x + k; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; acc += kx[k + r] * src[row + xx]; }
          tmp[row + x] = acc;
        }
      }
    } else tmp.set(src);
    if (ky) {
      const r = ky.length >> 1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let acc = 0;
          for (let k = -r; k <= r; k++) { let yy = y + k; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; acc += ky[k + r] * tmp[yy * w + x]; }
          out[y * w + x] = acc;
        }
      }
    } else out.set(tmp);
  }

  /**
   * Undo a known kind of blur. psf = { kx, ky } (symmetric 1-D kernels).
   * Gaussian => defocus, horizontal box => hand shake along the line, etc.
   */
  function richardsonLucy(gray, w, h, psf, iters) {
    const n = w * h;
    const obs = new Float32Array(n), est = new Float32Array(n), tmp = new Float32Array(n), conv = new Float32Array(n), corr = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = Math.max(2, gray[i]); obs[i] = v; est[i] = v; }
    for (let it = 0; it < iters; it++) {
      convSep(est, w, h, psf.kx, psf.ky, tmp, conv);
      for (let i = 0; i < n; i++) conv[i] = obs[i] / Math.max(1, conv[i]);
      convSep(conv, w, h, psf.kx, psf.ky, tmp, corr);
      for (let i = 0; i < n; i++) { const v = est[i] * corr[i]; est[i] = v > 270 ? 270 : v < 1 ? 1 : v; }
    }
    const out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) out[i] = est[i];
    return out;
  }

  /** Candidate blur models tried by the engine (described by data, so they can be rescaled). */
  function blurModels() {
    return [
      { name: "defocus-1.5", type: "gauss", val: 1.5 }, { name: "defocus-2.5", type: "gauss", val: 2.5 }, { name: "defocus-4", type: "gauss", val: 4 },
      { name: "shake-h9", type: "boxh", val: 9 }, { name: "shake-h15", type: "boxh", val: 15 }, { name: "shake-v9", type: "boxv", val: 9 },
    ];
  }

  /** Kernels for a model at a given image scale (1 = full size, 0.5 = half size …). */
  function psfFor(model, scale) {
    const sc = scale || 1;
    const odd = (n) => { n = Math.max(3, Math.round(n)); return n % 2 ? n : n + 1; };
    if (model.type === "gauss") return { kx: gaussKernel(Math.max(0.6, model.val * sc)), ky: gaussKernel(Math.max(0.6, model.val * sc)) };
    if (model.type === "boxh") return { kx: boxKernel(odd(model.val * sc)), ky: null };
    return { kx: null, ky: boxKernel(odd(model.val * sc)) };
  }

  /** Bilinear resize of a gray buffer. */
  function resizeGray(gray, w, h, nw, nh) {
    const out = new Uint8ClampedArray(nw * nh);
    const fx = w / nw, fy = h / nh;
    for (let y = 0; y < nh; y++) {
      const sy = Math.min(h - 1.001, Math.max(0, (y + 0.5) * fy - 0.5)), y0 = Math.floor(sy), wy = sy - y0;
      for (let x = 0; x < nw; x++) {
        const sx = Math.min(w - 1.001, Math.max(0, (x + 0.5) * fx - 0.5)), x0 = Math.floor(sx), wx = sx - x0;
        const i = y0 * w + x0;
        out[y * nw + x] = gray[i] * (1 - wx) * (1 - wy) + gray[i + 1] * wx * (1 - wy) + gray[i + w] * (1 - wx) * wy + gray[i + w + 1] * wx * wy;
      }
    }
    return out;
  }

  /**
   * Deblur a whole page. Large pages are processed at half size and scaled
   * back up (same final geometry), which keeps this to a couple of seconds.
   */
  function deblurGray(gray, w, h, model, iters) {
    if (w * h > 2500000) {
      const hw = Math.round(w / 2), hh = Math.round(h / 2);
      const small = resizeGray(gray, w, h, hw, hh);
      const d = richardsonLucy(small, hw, hh, psfFor(model, 0.5), iters);
      return resizeGray(d, hw, hh, w, h);
    }
    return richardsonLucy(gray, w, h, psfFor(model, 1), iters);
  }

  /** Crop of a gray buffer (for cheap candidate scoring). */
  function sampleCrop(gray, w, h, maxW, maxH) {
    const cw = Math.min(w, maxW), ch = Math.min(h, maxH);
    const out = new Uint8ClampedArray(cw * ch);
    for (let y = 0; y < ch; y++) out.set(gray.subarray(y * w, y * w + cw), y * cw);
    return { data: out, w: cw, h: ch };
  }

  /** Variants + quality flags from an already prepared (cropped, deskewed) gray page. */
  function variantsFromGray(gray, w, h, opts) {
    opts = opts || {};
    const plain = grayToCanvas(gray, w, h);
    let bin = adaptiveBinarize(gray, w, h, {});
    let ruled = 0;
    if (opts.lines !== false) {
      let inkBefore = 0; for (let i = 0; i < bin.length; i += 2) if (bin[i] === 0) inkBefore++;
      const cleaned = removeRuledLines(bin, w, h);
      let inkAfter = 0; for (let i = 0; i < cleaned.length; i += 2) if (cleaned[i] === 0) inkAfter++;
      ruled = inkBefore ? (inkBefore - inkAfter) / inkBefore : 0;
      bin = cleaned;
    }
    const clean = grayToCanvas(bin, w, h);
    const sharp = opts.sharp === false ? null : grayToCanvas(sharpen(medianBlur3(gray, w, h), w, h), w, h);
    return { plain, clean, sharp, ruled };
  }

  // ---------- canvas helpers (browser only) ----------

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  function grayToCanvas(gray, w, h) {
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      img.data[p] = img.data[p + 1] = img.data[p + 2] = gray[i];
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /**
   * Draw a bitmap/canvas onto a canvas whose long side is moved toward
   * `targetLong` (Tesseract is happiest with ~300dpi text, i.e. long
   * side ≈ 2000-2800 px for an ID card / A4 page).
   * Small images are upscaled, huge ones downscaled.
   */
  function bitmapToCanvas(source, opts) {
    opts = opts || {};
    const minLong = opts.minLong || 1800, maxLong = opts.maxLong || 3000, target = opts.target || 2200;
    const sw = source.width, sh = source.height;
    const longSide = Math.max(sw, sh);
    let scale = 1;
    if (longSide < minLong) scale = target / longSide;
    else if (longSide > maxLong) scale = target / longSide;
    scale = Math.min(scale, 4); // never blow a tiny thumbnail up absurdly
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    return c;
  }

  /**
   * Build OCR-ready versions of one page image. ALL variants share the same
   * geometry (same crop + deskew), so line boxes from one pass can be used
   * to crop the same line from another variant.
   *   plain  — grayscale + contrast stretch (best for clean scans)
   *   clean  — adaptive-binarised, table lines removed (phone photos, forms)
   *   sharp  — denoised + sharpened (soft / grainy images)
   * Also reports `quality` (blur, inverted, skew, cropped) for UI warnings.
   */
  function buildVariants(canvas, opts) {
    opts = opts || {};
    let w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = ctx.getImageData(0, 0, w, h).data;
    let gray = stretchContrast(toGray(rgba, w, h));

    const quality = { blur: blurScore(gray, w, h), inverted: false, cropped: false, skew: 0 };

    if (opts.invert !== false && looksInverted(gray)) { gray = stretchContrast(invertGray(gray)); quality.inverted = true; }

    const orientation = opts.orientation === false ? null : estimateOrientation(gray, w, h);

    if (opts.crop !== false) {
      const box = contentBox(gray, w, h);
      if (box) { const c = cropGray(gray, w, h, box); gray = c.data; w = c.w; h = c.h; quality.cropped = true; }
    }

    const skew = opts.deskew === false || (orientation && orientation.sideways) ? 0 : estimateSkewDegrees(gray, w, h, 10);
    if (skew) gray = rotateGray(gray, w, h, skew).data;
    quality.skew = skew;

    const vs = variantsFromGray(gray, w, h, opts);
    quality.ruled = vs.ruled;
    return { plain: vs.plain, clean: vs.clean, sharp: vs.sharp, skew, orientation, quality, width: w, height: h, gray };
  }

  /** Rotate a canvas by 90 / 180 / 270 degrees clockwise. */
  function rotateCanvas90(canvas, quarterTurnsClockwise) {
    const q = ((quarterTurnsClockwise % 4) + 4) % 4;
    if (q === 0) return canvas;
    const swap = q % 2 === 1;
    const out = makeCanvas(swap ? canvas.height : canvas.width, swap ? canvas.width : canvas.height);
    const ctx = out.getContext("2d");
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(q * Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  return {
    toGray, stretchContrast, otsuThreshold, adaptiveBinarize, boxDownscale,
    estimateSkewDegrees, rotateGray, estimateOrientation,
    blurScore, looksInverted, invertGray, contentBox, cropGray, removeRuledLines, medianBlur3, sharpen,
    richardsonLucy, blurModels, psfFor, deblurGray, resizeGray, sampleCrop, variantsFromGray,
    bitmapToCanvas, buildVariants, rotateCanvas90, grayToCanvas,
  };
})();

if (typeof module !== "undefined") module.exports = OcrPreprocess;
