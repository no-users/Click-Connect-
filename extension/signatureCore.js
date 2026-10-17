/**
 * signatureCore.js  (v3.1, new)
 * ------------------------------------------------------------
 * Pure pixel logic for "signature on photo": turns a phone photo of a
 * signature on paper into a clean transparent ink layer. No DOM here,
 * so it is unit-tested under node (module.exports) and used by
 * signatureOnPhoto.js in the popup (window.SaathiSignatureCore).
 *
 * Pipeline
 *   1. luminance per pixel
 *   2. LOCAL paper-brightness estimate (block 85th percentile, smoothed,
 *      bilinear) - so shadows / uneven light / a gradient across the
 *      paper do NOT survive as grey blotches (a single global threshold
 *      cannot do this)
 *   3. darkness d = (paper - pixel) / paper, then a smooth threshold
 *      -> alpha (soft anti-aliased edges, not jagged)
 *   4. despeckle: drop tiny isolated blobs (paper grain, dust)
 *   5. ink colour (auto / black / blue), density, crop to the real ink
 * ------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SaathiSignatureCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  function luminanceMap(rgba, w, h) {
    const lum = new Float32Array(w * h);
    for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
      // transparent pixels count as paper
      const a = rgba[p + 3] / 255;
      const l = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
      lum[i] = a < 1 ? l * a + 255 * (1 - a) : l;
    }
    return lum;
  }

  /** Smooth per-pixel estimate of what the empty paper looks like. */
  function paperEstimate(lum, w, h) {
    const block = Math.max(8, Math.round(Math.min(w, h) / 16));
    const gw = Math.max(1, Math.ceil(w / block)), gh = Math.max(1, Math.ceil(h / block));
    let grid = new Float32Array(gw * gh);
    const hist = new Uint16Array(64);
    for (let by = 0; by < gh; by++) {
      for (let bx = 0; bx < gw; bx++) {
        hist.fill(0);
        let n = 0;
        const x1 = Math.min(w, (bx + 1) * block), y1 = Math.min(h, (by + 1) * block);
        for (let y = by * block; y < y1; y += 2) {
          for (let x = bx * block; x < x1; x += 2) { hist[lum[y * w + x] >> 2]++; n++; }
        }
        // 85th percentile: ink covers a minority of a block, so this is the paper
        let acc = 0, target = n * 0.85, bin = 63;
        for (let i = 0; i < 64; i++) { acc += hist[i]; if (acc >= target) { bin = i; break; } }
        grid[by * gw + bx] = bin * 4 + 2;
      }
    }
    // blur the grid twice so block borders disappear
    for (let pass = 0; pass < 2; pass++) {
      const out = new Float32Array(grid.length);
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) { s += grid[yy * gw + xx]; c++; }
        }
        out[y * gw + x] = s / c;
      }
      grid = out;
    }
    const bg = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const gy = clamp(y / block - 0.5, 0, gh - 1), y0 = Math.floor(gy), y1 = Math.min(gh - 1, y0 + 1), fy = gy - y0;
      for (let x = 0; x < w; x++) {
        const gx = clamp(x / block - 0.5, 0, gw - 1), x0 = Math.floor(gx), x1 = Math.min(gw - 1, x0 + 1), fx = gx - x0;
        const a = grid[y0 * gw + x0] * (1 - fx) + grid[y0 * gw + x1] * fx;
        const b = grid[y1 * gw + x0] * (1 - fx) + grid[y1 * gw + x1] * fx;
        bg[y * w + x] = a * (1 - fy) + b * fy;
      }
    }
    return bg;
  }

  /** Removes connected blobs smaller than minArea (4-connectivity) from alpha, in place. */
  function despeckle(alpha, w, h, minArea) {
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    for (let start = 0; start < alpha.length; start++) {
      if (seen[start] || alpha[start] < 0.25) continue;
      let sp = 0, count = 0;
      const members = [];
      stack[sp++] = start; seen[start] = 1;
      while (sp) {
        const i = stack[--sp];
        count++;
        if (count <= minArea) members.push(i);
        const x = i % w, y = (i - x) / w;
        if (x > 0 && !seen[i - 1] && alpha[i - 1] >= 0.25) { seen[i - 1] = 1; stack[sp++] = i - 1; }
        if (x < w - 1 && !seen[i + 1] && alpha[i + 1] >= 0.25) { seen[i + 1] = 1; stack[sp++] = i + 1; }
        if (y > 0 && !seen[i - w] && alpha[i - w] >= 0.25) { seen[i - w] = 1; stack[sp++] = i - w; }
        if (y < h - 1 && !seen[i + w] && alpha[i + w] >= 0.25) { seen[i + w] = 1; stack[sp++] = i + w; }
      }
      if (count < minArea) members.forEach((i) => { alpha[i] = 0; });
    }
  }

  const DEFAULTS = { threshold: 0.14, contrast: 50, density: 100, ink: "auto" };

  /**
   * rgba: Uint8ClampedArray (w*h*4) of the signature photo.
   * returns { rgba: Uint8ClampedArray (cropped, transparent background), width, height, ink:[r,g,b], empty }
   */
  function extractSignature(rgba, w, h, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const lum = luminanceMap(rgba, w, h);
    const bg = paperEstimate(lum, w, h);

    // contrast -> how sharply "paper" turns into "ink"
    const width = 0.40 - 0.0035 * clamp(o.contrast, 0, 100);        // 0.40 (soft) .. 0.05 (hard)
    const t = clamp(o.threshold, 0.02, 0.6);
    const alpha = new Float32Array(w * h);
    for (let i = 0; i < alpha.length; i++) {
      const paper = Math.max(bg[i], 60);
      const d = (paper - lum[i]) / paper;
      alpha[i] = smooth((d - t) / width);
    }
    despeckle(alpha, w, h, Math.max(5, Math.round(w * h * 0.00004)));

    // ink colour from the confident ink pixels
    let r = 0, g = 0, b = 0, wsum = 0;
    for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
      if (alpha[i] > 0.8) { r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2]; wsum++; }
    }
    let ink = [24, 24, 32];
    if (o.ink === "blue") ink = [22, 40, 150];
    else if (o.ink === "black") ink = [20, 20, 26];
    else if (wsum > 20) {
      r /= wsum; g /= wsum; b /= wsum;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (sat < 28) ink = [24, 24, 32];                                // grey pen -> proper black
      else {                                                           // coloured pen: keep the hue, make it pen-dark
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        const k = l > 85 ? 85 / l : 1;
        ink = [Math.round(r * k), Math.round(g * k), Math.round(b * k)];
      }
    }

    // density: >100 = bolder, <100 = lighter
    const dens = clamp(o.density, 20, 300) / 100;
    if (dens > 1) for (let i = 0; i < alpha.length; i++) alpha[i] = 1 - Math.pow(1 - alpha[i], dens);   // bolder: soft edges fill in
    else if (dens < 1) for (let i = 0; i < alpha.length; i++) alpha[i] *= dens;                       // lighter: ink becomes translucent

    // crop to the real ink (ignore stray single rows/columns)
    const colCnt = new Uint32Array(w), rowCnt = new Uint32Array(h);
    let total = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > 0.3) { colCnt[x]++; rowCnt[y]++; total++; }
    }
    if (total < 12) return { rgba: new Uint8ClampedArray(4), width: 1, height: 1, ink, empty: true };
    const first = (arr) => { for (let i = 0; i < arr.length; i++) if (arr[i] >= 1) return i; return 0; };
    const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] >= 1) return i; return arr.length - 1; };
    let x0 = first(colCnt), x1 = last(colCnt), y0 = first(rowCnt), y1 = last(rowCnt);
    const padX = Math.max(2, Math.round((x1 - x0) * 0.03)), padY = Math.max(2, Math.round((y1 - y0) * 0.06));
    x0 = Math.max(0, x0 - padX); x1 = Math.min(w - 1, x1 + padX);
    y0 = Math.max(0, y0 - padY); y1 = Math.min(h - 1, y1 + padY);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const out = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const a = alpha[(y + y0) * w + (x + x0)], p = (y * cw + x) * 4;
      out[p] = ink[0]; out[p + 1] = ink[1]; out[p + 2] = ink[2]; out[p + 3] = Math.round(a * 255);
    }
    return { rgba: out, width: cw, height: ch, ink, empty: false };
  }

  /** Mean brightness (0-255) of a rectangle of an RGBA buffer - used to pick Normal vs Multiply blending. */
  function meanLuminance(rgba, w, h, rx, ry, rw, rh) {
    const x0 = clamp(Math.round(rx), 0, w - 1), y0 = clamp(Math.round(ry), 0, h - 1);
    const x1 = clamp(Math.round(rx + rw), x0 + 1, w), y1 = clamp(Math.round(ry + rh), y0 + 1, h);
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const p = (y * w + x) * 4;
      s += 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]; n++;
    }
    return n ? s / n : 255;
  }

  return { extractSignature, meanLuminance, DEFAULTS };
});
