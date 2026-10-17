/**
 * pdfTools.js
 * ------------------------------------------------------------
 * Small, dependency-free helpers used by enclosureDocsPanel.js:
 *
 *   - imagesToPdf(images)         build a valid multi-page PDF from
 *                                  JPEG frames (used by the camera-
 *                                  scan feature).
 *   - compressPdfFile(file, max)  re-render an oversized PDF's pages
 *                                  through the bundled pdf.js at a
 *                                  lower resolution/quality and
 *                                  re-pack them with imagesToPdf,
 *                                  trying progressively harder until
 *                                  it fits under `max` bytes.
 *   - zipFiles(entries)           pack several files into one plain
 *                                  (uncompressed/"store") .zip, so
 *                                  every document for a customer can
 *                                  be downloaded in one go.
 *
 * No external libraries — the project has no bundler and Manifest
 * V3's CSP blocks loading anything from a CDN, so these are hand-
 * written against the plain PDF/ZIP file-format spec (both are
 * well-documented, standard, and deliberately kept to the minimum
 * needed here). Everything degrades gracefully: on any failure these
 * return null so the caller can fall back to its own message instead
 * of producing a corrupt file.
 * ------------------------------------------------------------
 */

(function () {
  function strToBytes(str) {
    return new TextEncoder().encode(str);
  }

  function concatBytes(arrays) {
    let total = 0;
    arrays.forEach((a) => { total += a.length; });
    const out = new Uint8Array(total);
    let offset = 0;
    arrays.forEach((a) => { out.set(a, offset); offset += a.length; });
    return out;
  }

  // ---------------------------------------------------------------
  // PDF writer — one full-page JPEG image per page. This is the
  // standard minimal recipe for "turn scanned images into a PDF"
  // (DCTDecode XObject + a one-line content stream per page).
  // ---------------------------------------------------------------
  async function imagesToPdf(images) {
    if (!images || !images.length) return null;
    try {
      const chunks = [];
      const offsets = [];
      let pos = 0;

      const push = (bytesOrStr) => {
        const bytes = typeof bytesOrStr === "string" ? strToBytes(bytesOrStr) : bytesOrStr;
        chunks.push(bytes);
        pos += bytes.length;
      };
      const beginObj = (num) => { offsets[num] = pos; push(`${num} 0 obj\n`); };
      const endObj = () => push("endobj\n");

      push("%PDF-1.4\n");

      const n = images.length;
      beginObj(1);
      push("<< /Type /Catalog /Pages 2 0 R >>\n");
      endObj();

      const kids = [];
      for (let i = 0; i < n; i++) kids.push(`${3 + i * 3} 0 R`);
      beginObj(2);
      push(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${n} >>\n`);
      endObj();

      for (let i = 0; i < n; i++) {
        const img = images[i];
        const pageNum = 3 + i * 3;
        const imgNum = pageNum + 1;
        const contentNum = pageNum + 2;
        const W = Math.max(1, Math.round(img.width));
        const H = Math.max(1, Math.round(img.height));
        const content = `q\n${W} 0 0 ${H} 0 0 cm\n/Im0 Do\nQ`;
        const contentBytes = strToBytes(content);

        beginObj(pageNum);
        push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>\n`);
        endObj();

        beginObj(imgNum);
        push(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
        push(img.bytes);
        push("\nendstream\n");
        endObj();

        beginObj(contentNum);
        push(`<< /Length ${contentBytes.length} >>\nstream\n`);
        push(contentBytes);
        push("\nendstream\n");
        endObj();
      }

      const totalObjs = 2 + n * 3;
      const xrefStart = pos;
      let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
      for (let num = 1; num <= totalObjs; num++) {
        xref += String(offsets[num] || 0).padStart(10, "0") + " 00000 n \n";
      }
      push(xref);
      push(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

      return new Blob([concatBytes(chunks)], { type: "application/pdf" });
    } catch (e) {
      console.warn("pdfTools.imagesToPdf failed:", e);
      return null;
    }
  }

  // ---------------------------------------------------------------
  // Compressor: re-render every page of an existing PDF (via the
  // already-bundled pdf.js) at a smaller scale/JPEG quality, then
  // re-pack with imagesToPdf. Tries a few presets, biggest first,
  // stopping as soon as the result fits. Capped page count so a huge
  // multi-page PDF doesn't freeze the popup.
  // ---------------------------------------------------------------
  async function compressPdfFile(file, maxBytes, opts) {
    opts = opts || {};
    if (typeof window === "undefined") return null;
    if (window.ensurePdfjsLoaded) { try { await window.ensurePdfjsLoaded(); } catch (e) { return null; } }
    if (!window.pdfjsLib) return null;
    const MAX_PAGES = opts.maxPages || 15;
    const presets = opts.presets || [
      { scale: 1.3, quality: 0.72 },
      { scale: 1.1, quality: 0.6 },
      { scale: 0.9, quality: 0.5 },
      { scale: 0.75, quality: 0.38 },
    ];

    let pdf;
    try {
      const buf = await file.arrayBuffer();
      pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    } catch (e) {
      console.warn("pdfTools.compressPdfFile: could not open PDF:", e);
      return null;
    }
    if (pdf.numPages > MAX_PAGES) return null;

    for (const preset of presets) {
      try {
        const images = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: preset.scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", preset.quality));
          if (!blob) throw new Error("canvas.toBlob returned null");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          images.push({ bytes, width: canvas.width, height: canvas.height });
        }
        const pdfBlob = await imagesToPdf(images);
        if (pdfBlob && pdfBlob.size <= maxBytes) {
          const newName = file.name.replace(/\.pdf$/i, "") + "_compressed.pdf";
          return new File([pdfBlob], newName, { type: "application/pdf" });
        }
      } catch (e) {
        console.warn("pdfTools.compressPdfFile: preset failed, trying next:", e);
      }
    }
    return null; // couldn't get under the limit
  }

  // ---------------------------------------------------------------
  // Minimal ZIP writer — "store" method only (no compression, so no
  // deflate implementation needed). Good enough for bundling a
  // handful of already-small PDFs into one download.
  // ---------------------------------------------------------------
  function crc32(bytes) {
    let crc = ~0;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
      }
    }
    return (~crc) >>> 0;
  }
  const u16 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF]);
  const u32 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);

  function dosDateTime(date) {
    const d = date || new Date();
    const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
    const yearField = Math.max(0, d.getFullYear() - 1980);
    const dateVal = ((yearField & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
    return { time, date: dateVal };
  }

  async function zipFiles(entries) {
    if (!entries || !entries.length) return null;
    try {
      const localChunks = [];
      const centralChunks = [];
      let offset = 0;
      const { time, date } = dosDateTime();

      // De-duplicate names so nothing silently overwrites another
      // entry once unzipped.
      const usedNames = new Set();
      const uniqueName = (name) => {
        let candidate = name;
        let i = 2;
        while (usedNames.has(candidate)) {
          candidate = name.replace(/(\.[^.]+)?$/, (ext) => `_${i++}${ext || ""}`);
        }
        usedNames.add(candidate);
        return candidate;
      };

      for (const entry of entries) {
        const nameBytes = strToBytes(uniqueName(entry.name));
        const crc = crc32(entry.bytes);
        const size = entry.bytes.length;

        const localHeader = concatBytes([
          u32(0x04034b50), u16(20), u16(0), u16(0), u16(time), u16(date),
          u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0),
        ]);
        const localOffset = offset;
        localChunks.push(localHeader, nameBytes, entry.bytes);
        offset += localHeader.length + nameBytes.length + entry.bytes.length;

        const centralHeader = concatBytes([
          u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(time), u16(date),
          u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
          u32(0), u32(localOffset),
        ]);
        centralChunks.push(centralHeader, nameBytes);
      }

      const centralStart = offset;
      const centralBytes = concatBytes(centralChunks);
      offset += centralBytes.length;

      const eocd = concatBytes([
        u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
        u32(centralBytes.length), u32(centralStart), u16(0),
      ]);

      return new Blob([concatBytes(localChunks), centralBytes, eocd], { type: "application/zip" });
    } catch (e) {
      console.warn("pdfTools.zipFiles failed:", e);
      return null;
    }
  }

  window.SaathiPdfTools = { imagesToPdf, compressPdfFile, zipFiles };
})();
