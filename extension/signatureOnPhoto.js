/**
 * signatureOnPhoto.js  (v3.1, new)
 * ------------------------------------------------------------
 * "✍️ Signature on photo" for the popup form.
 *
 * Flow
 *   1. Operator picks the customer's photo (#image) -> a small
 *      "Signature" drop box appears right beside it.
 *   2. Drop / pick / paste the signature photo -> the background is
 *      removed automatically (signatureCore.js) and an editor opens.
 *   3. Drag the signature with the mouse, mouse-wheel or corner handle
 *      to resize, top handle to rotate, sliders for size / rotation /
 *      background cleaning / contrast / light-dark, ink colour,
 *      "Asli look" (multiply - ink looks printed on the photo) or Normal.
 *   4. "Photo par lagao" -> signature is flattened into the photo
 *      (JPEG, kept inside the portal's 20-350 KB window), the box
 *      disappears and a small "↩ Signature hatao" chip lets you undo.
 * The processed file is put back into #image exactly like the camera /
 * restore code does, so every existing save / fill path keeps working.
 * ------------------------------------------------------------
 */
(function () {
  const Core = window.SaathiSignatureCore;
  const $ = (id) => document.getElementById(id);
  const toast = (m, k) => { try { if (window.saathiToast) window.saathiToast(m, k || "info"); } catch (e) { /* ignore */ } };
  const MAX_KB = 330;          // popup.js rejects > 350 KB, the portal label says 320 KB
  const MIN_KB = 22;           // popup.js rejects < 20 KB
  const LAST_KEY = "saathiLastSignature";

  let applying = false;
  let originalFile = null;     // the photo as it was before a signature was added
  let panel = null;
  let undoChip = null;
  let dismissedFor = null;     // file the operator clicked "×" for

  if (!Core) { console.warn("[signatureOnPhoto] signatureCore.js missing"); return; }

  // ------------------------------------------------------------ helpers
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const isStr = typeof src === "string";
      const url = isStr ? src : URL.createObjectURL(src);
      const im = new Image();
      im.onload = () => { if (!isStr) URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { if (!isStr) URL.revokeObjectURL(url); reject(new Error("image load failed")); };
      im.src = url;
    });
  }
  const canvasOf = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const toBlob = (canvas, q) => new Promise((r) => canvas.toBlob(r, "image/jpeg", q));

  /** Signature photo -> RGBA buffer, longest side <= 900 px (plenty for a pen stroke, and fast). */
  async function readSignaturePixels(src) {
    const im = await loadImage(src);
    const k = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const c = canvasOf(w, h);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(im, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h, dataUrl: c.toDataURL("image/jpeg", 0.9) };
  }

  // ------------------------------------------------------------ styles
  function injectStyle() {
    if ($("saathiSigStyle")) return;
    const st = document.createElement("style");
    st.id = "saathiSigStyle";
    st.textContent = `
      #saathiSigBox{grid-column:auto;border:2px dashed var(--accent-gold,#d9a43e);border-radius:14px;padding:9px 10px;background:var(--card-bg-soft,rgba(217,164,62,.07));
        animation:saathiSigIn .35s cubic-bezier(.2,.9,.3,1.2);}
      #saathiSigBox .sg-head{display:flex;align-items:center;justify-content:space-between;font-weight:800;font-size:12.5px;color:var(--text-primary,#1e293b);margin-bottom:6px;}
      #saathiSigBox .sg-x{border:none;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:var(--text-muted,#94a3b8);padding:0 3px;}
      #saathiSigBox .sg-drop{display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;padding:12px 8px;border-radius:11px;cursor:pointer;
        background:var(--input-bg,#fff);border:1.5px solid var(--border-color,#e2e8f0);transition:all .18s;font-size:12px;font-weight:700;color:var(--text-primary,#1e293b);}
      #saathiSigBox .sg-drop:hover,#saathiSigBox .sg-drop.over{border-color:var(--accent-gold,#d9a43e);transform:translateY(-1px);box-shadow:0 6px 16px -8px rgba(217,164,62,.7);}
      #saathiSigBox .sg-drop .sg-ico{font-size:22px;} #saathiSigBox .sg-drop small{font-weight:600;color:var(--text-muted,#64748b);font-size:10.5px;}
      #saathiSigBox .sg-last{margin-top:7px;width:100%;border:1px solid var(--border-color,#e2e8f0);background:transparent;color:var(--text-primary,#1e293b);
        border-radius:9px;padding:6px;font-size:11.5px;font-weight:700;cursor:pointer;}
      #saathiSigBox .sg-last:hover{border-color:var(--accent-gold,#d9a43e);}
      #saathiSigUndo{margin-top:6px;border:1px solid var(--border-color,#e2e8f0);background:var(--input-bg,#fff);color:var(--text-primary,#1e293b);border-radius:999px;
        padding:4px 11px;font-size:11px;font-weight:700;cursor:pointer;display:inline-block;} #saathiSigUndo:hover{border-color:#dc2626;color:#dc2626;}
      @keyframes saathiSigIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}

      #saathiSigEditor{position:fixed;inset:0;z-index:100001;background:rgba(10,15,30,.62);display:flex;align-items:center;justify-content:center;padding:10px;}
      #saathiSigEditor .se-win{background:var(--card-bg,#fff);color:var(--text-primary,#1e293b);border-radius:18px;width:100%;max-width:585px;box-shadow:0 24px 60px -16px rgba(0,0,0,.55);overflow:hidden;
        animation:saathiSigIn .3s cubic-bezier(.2,.9,.3,1.2);}
      #saathiSigEditor .se-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-weight:800;font-size:14px;border-bottom:1px solid var(--border-color,#e2e8f0);}
      #saathiSigEditor .se-bar small{font-weight:600;color:var(--text-muted,#64748b);font-size:11px;}
      #saathiSigEditor .se-body{display:flex;gap:14px;padding:12px 14px;align-items:flex-start;}
      #saathiSigEditor .se-stage{flex:none;background:repeating-conic-gradient(#e5e7eb 0 25%,#f8fafc 0 50%) 0 0/16px 16px;border-radius:10px;overflow:hidden;line-height:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
      #saathiSigEditor canvas{display:block;touch-action:none;}
      #saathiSigEditor .se-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;}
      #saathiSigEditor .se-row{display:flex;flex-direction:column;gap:2px;font-size:11.5px;font-weight:700;}
      #saathiSigEditor .se-row label{display:flex;justify-content:space-between;color:var(--text-primary,#1e293b);} #saathiSigEditor .se-row label b{color:var(--text-muted,#64748b);font-weight:700;}
      #saathiSigEditor input[type=range]{width:100%;accent-color:var(--accent-gold,#d9a43e);margin:0;height:16px;}
      #saathiSigEditor .se-seg{display:flex;border:1.5px solid var(--border-color,#e2e8f0);border-radius:9px;overflow:hidden;}
      #saathiSigEditor .se-seg button{flex:1;border:none;background:var(--input-bg,#fff);color:var(--text-primary,#1e293b);font-size:11px;font-weight:700;padding:5px 2px;cursor:pointer;}
      #saathiSigEditor .se-seg button.on{background:var(--accent-gold,#d9a43e);color:#fff;}
      #saathiSigEditor .se-tip{font-size:10.5px;color:var(--text-muted,#64748b);font-weight:600;line-height:1.35;}
      #saathiSigEditor .se-foot{display:flex;gap:8px;justify-content:flex-end;padding:10px 14px 13px;border-top:1px solid var(--border-color,#e2e8f0);}
      #saathiSigEditor .se-btn{border:none;border-radius:10px;padding:9px 15px;font-weight:800;font-size:12.5px;cursor:pointer;background:var(--input-bg,#eef2f7);color:var(--text-primary,#1e293b);border:1px solid var(--border-color,#e2e8f0);}
      #saathiSigEditor .se-btn.pri{background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;border-color:transparent;box-shadow:0 8px 18px -8px rgba(21,128,61,.8);}
      #saathiSigEditor .se-btn:disabled{opacity:.55;cursor:wait;}
      #saathiSigEditor .se-busy{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(255,255,255,.55);font-weight:800;font-size:12px;color:#334155;}`;
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------ the box beside the photo
  function removePanel() { if (panel) { panel.remove(); panel = null; } }
  function removeUndo() { if (undoChip) { undoChip.remove(); undoChip = null; } }

  async function showPanel() {
    const input = $("image");
    if (!input || panel) return;
    injectStyle();
    const group = input.closest(".form-group") || input.parentElement;
    panel = document.createElement("div");
    panel.id = "saathiSigBox";
    panel.innerHTML = `
      <div class="sg-head"><span>✍️ Signature (photo par lagane ke liye)</span><button type="button" class="sg-x" title="Abhi nahi chahiye">×</button></div>
      <label class="sg-drop" id="saathiSigDrop"><span class="sg-ico">🖋️</span>Signature ki photo yahan daalein<small>click · drag-drop · Ctrl+V &nbsp;|&nbsp; background apne aap hat jayega</small>
        <input type="file" accept="image/*" style="display:none"></label>
      <button type="button" class="sg-last" style="display:none">↻ Pichla signature use karein</button>`;
    group.insertAdjacentElement("afterend", panel);

    const fileInput = panel.querySelector("input[type=file]");
    const drop = panel.querySelector(".sg-drop");
    panel.querySelector(".sg-x").addEventListener("click", () => { dismissedFor = input.files && input.files[0]; removePanel(); });
    fileInput.addEventListener("change", () => { const f = fileInput.files && fileInput.files[0]; fileInput.value = ""; if (f) startWith(f); });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) startWith(f); });

    try {
      const res = await new Promise((r) => chrome.storage.local.get([LAST_KEY], r));
      const last = res && res[LAST_KEY];
      const btn = panel && panel.querySelector(".sg-last");
      if (last && last.src && btn) {
        btn.style.display = "block";
        btn.addEventListener("click", () => startWith(last.src));
      }
    } catch (e) { /* storage unavailable */ }
  }

  // Ctrl+V of a screenshot / copied image while the box is visible
  document.addEventListener("paste", (e) => {
    if (!panel || ($("saathiSigEditor"))) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.kind === "file" && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) { e.preventDefault(); startWith(f); } return; }
    }
  });

  function showUndo() {
    const prev = $("imagePreview");
    if (!prev || !originalFile) return;
    removeUndo();
    injectStyle();
    undoChip = document.createElement("button");
    undoChip.type = "button";
    undoChip.id = "saathiSigUndo";
    undoChip.textContent = "↩ Signature hatao";
    undoChip.addEventListener("click", () => {
      if (!originalFile) return;
      setPhotoFile(originalFile);
      removeUndo();
      dismissedFor = null;
      toast("Signature hata di, original photo wapas.", "success");
      showPanel();
    });
    prev.insertAdjacentElement("afterend", undoChip);
  }

  function setPhotoFile(file) {
    const input = $("image");
    const dt = new DataTransfer();
    dt.items.add(file);
    applying = true;
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setTimeout(() => { applying = false; }, 400);
  }

  // ------------------------------------------------------------ editor
  async function startWith(sigSource) {
    const input = $("image");
    const photoFile = input && input.files && input.files[0];
    if (!photoFile) return toast("Pehle customer ki photo chunein.", "warn");
    let sig, photo;
    try {
      [sig, photo] = await Promise.all([readSignaturePixels(sigSource), loadImage(photoFile)]);
    } catch (e) { return toast("Ye image khul nahi paayi.", "warn"); }
    try { chrome.storage.local.set({ [LAST_KEY]: { src: sig.dataUrl, at: Date.now() } }); } catch (e) { /* ignore */ }
    openEditor(photoFile, photo, sig);
  }

  function openEditor(photoFile, photo, sig) {
    injectStyle();
    const old = $("saathiSigEditor"); if (old) old.remove();

    const W = photo.naturalWidth, H = photo.naturalHeight;
    const maxW = 300, maxH = 350;
    const k = Math.min(maxW / W, maxH / H);                          // CSS px per photo px
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const state = {
      x: 0.7, y: 0.88, scale: 0.4, rot: 0,
      mode: "multiply",
      p: { threshold: 0.14, contrast: 50, density: 100, ink: "auto" },
      sigCanvas: null, aspect: 1,
    };

    // ---- DOM
    const root = document.createElement("div");
    root.id = "saathiSigEditor";
    root.innerHTML = `
      <div class="se-win" style="position:relative">
        <div class="se-bar"><span>✍️ Signature adjust karein</span><small>Mouse se khinchein · scroll = size · upar ka gola = ghumana</small></div>
        <div class="se-body">
          <div class="se-stage"><canvas></canvas></div>
          <div class="se-side">
            <div class="se-row"><label>Size <b data-v="size"></b></label><input type="range" data-s="size" min="5" max="100" step="1"></div>
            <div class="se-row"><label>Ghumana <b data-v="rot"></b></label><input type="range" data-s="rot" min="-45" max="45" step="1"></div>
            <div class="se-row"><label>Background safai <b data-v="thr"></b></label><input type="range" data-s="thr" min="0" max="100" step="1"></div>
            <div class="se-row"><label>Contrast <b data-v="con"></b></label><input type="range" data-s="con" min="0" max="100" step="1"></div>
            <div class="se-row"><label>Halka ◀ ▶ Gehra <b data-v="den"></b></label><input type="range" data-s="den" min="30" max="250" step="5"></div>
            <div class="se-row"><label>Syahi</label><div class="se-seg" data-g="ink"><button type="button" data-val="auto">Auto</button><button type="button" data-val="black">Kaala</button><button type="button" data-val="blue">Neela</button></div></div>
            <div class="se-row"><label>Lagane ka tareeka</label><div class="se-seg" data-g="mode"><button type="button" data-val="multiply">Asli look</button><button type="button" data-val="normal">Normal</button></div></div>
            <div class="se-tip">Photo andheri jagah par signature na dikhe to <b>Normal</b> chunein.</div>
          </div>
        </div>
        <div class="se-foot"><button type="button" class="se-btn" data-a="reset">↺ Reset</button><button type="button" class="se-btn" data-a="cancel">✕ Cancel</button><button type="button" class="se-btn pri" data-a="apply">✓ Photo par lagao</button></div>
        <div class="se-busy">Ho raha hai…</div>
      </div>`;
    document.body.appendChild(root);

    const canvas = root.querySelector("canvas");
    canvas.width = Math.round(W * k * dpr); canvas.height = Math.round(H * k * dpr);
    canvas.style.width = Math.round(W * k) + "px"; canvas.style.height = Math.round(H * k) + "px";
    const ctx = canvas.getContext("2d");
    const busy = root.querySelector(".se-busy");

    // ---- signature layer (re-built when background/contrast/density/ink change)
    function rebuildSignature() {
      const res = Core.extractSignature(sig.data, sig.w, sig.h, state.p);
      if (res.empty) { state.sigCanvas = null; return false; }
      const c = canvasOf(res.width, res.height);
      c.getContext("2d").putImageData(new ImageData(res.rgba, res.width, res.height), 0, 0);
      state.sigCanvas = c; state.aspect = res.width / res.height;
      return true;
    }

    function box() {                                                  // signature rectangle in photo units
      const w = state.scale * W, h = w / state.aspect;
      return { cx: state.x * W, cy: state.y * H, w, h };
    }

    function draw(c2, showUI) {
      c2.save();
      c2.fillStyle = "#fff"; c2.fillRect(0, 0, W, H);
      c2.drawImage(photo, 0, 0, W, H);
      if (state.sigCanvas) {
        const b = box();
        c2.translate(b.cx, b.cy); c2.rotate(state.rot * Math.PI / 180);
        c2.globalCompositeOperation = state.mode === "multiply" ? "multiply" : "source-over";
        c2.drawImage(state.sigCanvas, -b.w / 2, -b.h / 2, b.w, b.h);
        c2.globalCompositeOperation = "source-over";
        if (showUI) {
          const u = 1 / k;                                            // 1 screen px in photo units
          c2.lineWidth = 1.5 * u; c2.setLineDash([5 * u, 4 * u]); c2.strokeStyle = "#2563eb";
          c2.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
          c2.setLineDash([]);
          c2.beginPath(); c2.moveTo(0, -b.h / 2); c2.lineTo(0, -b.h / 2 - 16 * u); c2.stroke();
          const dot = (x, y, fill) => { c2.beginPath(); c2.arc(x, y, 6 * u, 0, Math.PI * 2); c2.fillStyle = fill; c2.fill(); c2.lineWidth = 1.5 * u; c2.strokeStyle = "#fff"; c2.stroke(); };
          dot(b.w / 2, b.h / 2, "#2563eb");                           // resize handle
          dot(0, -b.h / 2 - 16 * u, "#16a34a");                       // rotate handle
        }
      }
      c2.restore();
    }
    function redraw() {
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      draw(ctx, true);
    }

    // ---- controls <-> state
    const q = (s) => root.querySelector(s);
    function syncControls() {
      q('[data-s="size"]').value = Math.round(state.scale * 100);
      q('[data-s="rot"]').value = Math.round(state.rot);
      q('[data-s="thr"]').value = Math.round((state.p.threshold - 0.04) / 0.36 * 100);
      q('[data-s="con"]').value = state.p.contrast;
      q('[data-s="den"]').value = state.p.density;
      q('[data-v="size"]').textContent = Math.round(state.scale * 100) + "%";
      q('[data-v="rot"]').textContent = Math.round(state.rot) + "°";
      q('[data-v="thr"]').textContent = q('[data-s="thr"]').value;
      q('[data-v="con"]').textContent = state.p.contrast;
      q('[data-v="den"]').textContent = state.p.density + "%";
      root.querySelectorAll(".se-seg").forEach((g) => {
        const cur = g.dataset.g === "ink" ? state.p.ink : state.mode;
        g.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.val === cur));
      });
    }
    let rebuildTimer = null;
    function scheduleRebuild() {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => { rebuildSignature(); redraw(); }, 70);
    }

    root.querySelectorAll("input[type=range]").forEach((r) => r.addEventListener("input", () => {
      const v = Number(r.value);
      switch (r.dataset.s) {
        case "size": state.scale = v / 100; break;
        case "rot": state.rot = v; break;
        case "thr": state.p.threshold = 0.04 + v / 100 * 0.36; scheduleRebuild(); break;
        case "con": state.p.contrast = v; scheduleRebuild(); break;
        case "den": state.p.density = v; scheduleRebuild(); break;
      }
      syncControls(); redraw();
    }));
    root.querySelectorAll(".se-seg button").forEach((b) => b.addEventListener("click", () => {
      const g = b.parentElement.dataset.g;
      if (g === "ink") { state.p.ink = b.dataset.val; scheduleRebuild(); } else state.mode = b.dataset.val;
      syncControls(); redraw();
    }));

    // ---- mouse: move / resize / rotate / wheel
    const toPhoto = (e) => { const r = canvas.getBoundingClientRect(); const s = r.width / W; return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s, s }; };
    function hit(pt) {
      const b = box(), a = -state.rot * Math.PI / 180;
      const dx = pt.x - b.cx, dy = pt.y - b.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      const tol = 11 / (pt.s || k);
      if (Math.hypot(lx - b.w / 2, ly - b.h / 2) < tol) return "resize";
      if (Math.hypot(lx, ly + b.h / 2 + 16 * (1 / k)) < tol) return "rotate";
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return "move";
      return "";
    }
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (!state.sigCanvas) return;
      const pt = toPhoto(e), kind = hit(pt) || "move";
      const b = box();
      drag = { kind, offX: pt.x - b.cx, offY: pt.y - b.cy, d0: Math.hypot(pt.x - b.cx, pt.y - b.cy) || 1, s0: state.scale };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      const pt = toPhoto(e);
      if (!drag) { const h = hit(pt); canvas.style.cursor = h === "resize" ? "nwse-resize" : h === "rotate" ? "grab" : h === "move" ? "move" : "default"; return; }
      const b = box();
      if (drag.kind === "move") {
        state.x = Math.min(1.1, Math.max(-0.1, (pt.x - drag.offX) / W));
        state.y = Math.min(1.1, Math.max(-0.1, (pt.y - drag.offY) / H));
      } else if (drag.kind === "resize") {
        state.scale = Math.min(1.2, Math.max(0.03, drag.s0 * Math.hypot(pt.x - b.cx, pt.y - b.cy) / drag.d0));
      } else if (drag.kind === "rotate") {
        let deg = (Math.atan2(pt.y - b.cy, pt.x - b.cx) * 180 / Math.PI) + 90;
        if (deg > 180) deg -= 360;
        state.rot = Math.max(-180, Math.min(180, Math.round(deg)));
        if (Math.abs(state.rot) < 3) state.rot = 0;                   // snaps level
      }
      syncControls(); redraw();
    });
    const endDrag = () => { drag = null; };
    canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("wheel", (e) => {
      if (!state.sigCanvas) return;
      e.preventDefault();
      state.scale = Math.min(1.2, Math.max(0.03, state.scale * Math.exp(-e.deltaY * 0.0015)));
      syncControls(); redraw();
    }, { passive: false });
    function onKey(e) {
      if (e.key === "Escape") { close(); return; }
      const step = e.shiftKey ? 0.02 : 0.005;
      const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (m) { state.x += m[0]; state.y += m[1]; redraw(); e.preventDefault(); }
      else if (e.key === "+" || e.key === "=") { state.scale = Math.min(1.2, state.scale * 1.04); syncControls(); redraw(); }
      else if (e.key === "-") { state.scale = Math.max(0.03, state.scale / 1.04); syncControls(); redraw(); }
    }
    document.addEventListener("keydown", onKey, true);
    function close() { document.removeEventListener("keydown", onKey, true); root.remove(); }

    // ---- initial placement + automatic blend choice
    function placeDefault() {
      state.rot = 0;
      state.scale = Math.min(0.42, 0.17 * H * state.aspect / W);
      const hFrac = (state.scale * W / state.aspect) / H;
      state.x = Math.max(state.scale / 2 + 0.03, 0.97 - state.scale / 2);
      state.y = 1 - 0.05 - hFrac / 2;
    }
    function autoMode() {
      try {
        const sw = 160, sh = Math.max(1, Math.round(160 * H / W));
        const c = canvasOf(sw, sh), cx = c.getContext("2d", { willReadFrequently: true });
        cx.drawImage(photo, 0, 0, sw, sh);
        const b = box();
        const lum = Core.meanLuminance(cx.getImageData(0, 0, sw, sh).data, sw, sh,
          (b.cx - b.w / 2) / W * sw, (b.cy - b.h / 2) / H * sh, b.w / W * sw, b.h / H * sh);
        state.mode = lum < 115 ? "normal" : "multiply";
      } catch (e) { state.mode = "multiply"; }
    }

    if (!rebuildSignature()) {
      close();
      return toast("Is photo me signature nahi mila - saaf roshni me, safed kaagaz par dobara khinchein.", "warn");
    }
    placeDefault(); autoMode(); syncControls(); redraw();

    // ---- buttons
    root.addEventListener("click", async (e) => {
      if (e.target === root) { close(); return; }
      const act = e.target.dataset && e.target.dataset.a;
      if (!act) return;
      if (act === "cancel") { close(); return; }
      if (act === "reset") {
        state.p = { threshold: 0.14, contrast: 50, density: 100, ink: "auto" };
        rebuildSignature(); placeDefault(); autoMode(); syncControls(); redraw(); return;
      }
      if (act === "apply") {
        root.querySelectorAll(".se-btn").forEach((b) => { b.disabled = true; });
        busy.style.display = "flex";
        try {
          const file = await exportPhoto();
          close();
          originalFile = photoFile;
          setPhotoFile(file);
          removePanel();
          showUndo();
          toast("Signature photo par laga di (" + Math.round(file.size / 1024) + " KB).", "success");
        } catch (err) {
          console.warn("[signatureOnPhoto] export failed", err);
          busy.style.display = "none";
          root.querySelectorAll(".se-btn").forEach((b) => { b.disabled = false; });
          toast("Photo banane me dikkat aayi - dobara try karein.", "warn");
        }
      }
    });

    // flatten -> JPEG that fits the 20-350 KB window
    async function exportPhoto() {
      let scaleDown = Math.max(W, H) > 1400 ? 1400 / Math.max(W, H) : 1;
      for (let attempt = 0; attempt < 7; attempt++) {
        const ow = Math.max(1, Math.round(W * scaleDown)), oh = Math.max(1, Math.round(H * scaleDown));
        const c = canvasOf(ow, oh), c2 = c.getContext("2d");
        c2.setTransform(ow / W, 0, 0, oh / H, 0, 0);
        draw(c2, false);
        let blob = null;
        for (let qual = 0.92; qual >= 0.5; qual -= 0.07) {
          blob = await toBlob(c, qual);
          if (blob && blob.size <= MAX_KB * 1024) break;
        }
        if (blob && blob.size <= MAX_KB * 1024) {
          if (blob.size < MIN_KB * 1024) { const hi = await toBlob(c, 1); if (hi) blob = hi; }
          return new File([blob], "image.jpg", { type: "image/jpeg" });
        }
        scaleDown *= 0.85;
      }
      throw new Error("could not fit size window");
    }
  }

  // ------------------------------------------------------------ wiring to #image
  function init() {
    const input = $("image");
    if (!input || input.dataset.sigWired) return;
    input.dataset.sigWired = "1";
    input.addEventListener("change", () => {
      if (applying || window.__saathiRestoringImage) return;
      const f = input.files && input.files[0];
      if (!f) { removePanel(); removeUndo(); originalFile = null; dismissedFor = null; return; }
      removeUndo();
      originalFile = null;
      if (dismissedFor === f) return;
      showPanel();
    });
    // the form being reset / a profile being loaded clears the photo programmatically
    const form = $("dataForm");
    if (form) form.addEventListener("reset", () => { removePanel(); removeUndo(); originalFile = null; dismissedFor = null; });
  }

  window.SaathiSignature = { open: startWith };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
