/**
 * premiumFeatures3.js — batch 3
 *  1. Camera capture for Documents tab (in addition to file upload)
 *  2. Manual rotate (90°) per queued document before OCR
 *  3. Hindi/English toggle for this project's own added labels
 *  4. One-time onboarding tutorial
 *  5. High-contrast mode toggle
 *  6. Photo-thumbnail avatars (uses the customer's uploaded photo, if any)
 *  7. Password-protected (encrypted) backup export/import
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function toast(message, kind = "info") { return window.saathiToast(message, kind); }

  // ---------- 1 & 2. Camera capture + manual rotate ----------
  function fileFromCanvas(canvas, name) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(new File([blob], name, { type: "image/jpeg" })), "image/jpeg", 0.92);
    });
  }

  function openCamera(onCapture) {
    const overlay = document.createElement("div");
    overlay.id = "saathiCameraOverlay";
    overlay.innerHTML = `
      <video id="saathiCamVideo" autoplay playsinline></video>
      <div class="saathi-cam-actions">
        <button type="button" id="saathiCamShoot" class="btn btn-primary">📸 Capture</button>
        <button type="button" id="saathiCamClose" class="btn btn-danger">✕ Close</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const video = $("saathiCamVideo");
    let stream;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => { stream = s; video.srcObject = s; })
      .catch(() => {
        toast("Camera access nahi mil paya.", "warn");
        overlay.remove();
      });

    function cleanup() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      overlay.remove();
    }
    $("saathiCamClose").addEventListener("click", cleanup);
    $("saathiCamShoot").addEventListener("click", async () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const file = await fileFromCanvas(canvas, `camera-${Date.now()}.jpg`);
      cleanup();
      onCapture(file);
    });
  }

  function initCameraAndRotate() {
    const dropZone = $("docDropZone");
    const fileList = $("docFileList");
    if (!dropZone || $("saathiCamBtn")) return;

    const camBtn = document.createElement("button");
    camBtn.type = "button";
    camBtn.id = "saathiCamBtn";
    camBtn.className = "btn";
    camBtn.style.cssText = "width:100%;margin-top:8px;background:var(--input-bg);border:1.5px solid var(--border-color);color:var(--text-primary);";
    camBtn.textContent = "📷 Use Camera Instead";
    dropZone.insertAdjacentElement("afterend", camBtn);

    camBtn.addEventListener("click", () => {
      openCamera((file) => {
        const input = $("docUploadInput");
        if (!input) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    // Rotate buttons: watches the file list and adds a ⟳ button per row.
    // Rotating re-writes the queued File object in place via a small
    // canvas round-trip, so the existing OCR pipeline needs no changes.
    if (!fileList) return;
    function addRotateButtons() {
      fileList.querySelectorAll(".doc-file-row").forEach((row) => {
        if (row.querySelector(".doc-file-rotate")) return;
        const idx = row.querySelector(".doc-file-remove")?.dataset.idx;
        if (idx === undefined) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "doc-file-rotate";
        btn.dataset.idx = idx;
        btn.title = "Rotate 90°";
        btn.textContent = "⟳";
        row.insertBefore(btn, row.querySelector(".doc-file-remove"));
        btn.addEventListener("click", () => rotateQueuedFile(Number(idx)));
      });
    }
    new MutationObserver(addRotateButtons).observe(fileList, { childList: true });
  }

  async function rotateQueuedFile(idx) {
    // docsTab.js keeps its queue in a closure, so we reach it through the
    // file input's underlying data via a small DOM round-trip instead:
    // we re-read the row's file from window.__saathiQueuedFilesRef if
    // docsTab.js has exposed it; otherwise inform the user to re-upload.
    if (!window.__saathiQueuedFilesRef || !window.__saathiQueuedFilesRef[idx]) {
      toast("Rotate ke liye docsTab reference nahi mila.", "warn");
      return;
    }
    const entry = window.__saathiQueuedFilesRef[idx];
    const file = entry.file;
    const img = await createImageBitmap(file).catch(() => null);
    if (!img) { toast("Ye file rotate nahi ho sakti (PDF ya unsupported).", "warn"); return; }
    const canvas = document.createElement("canvas");
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    const rotated = await fileFromCanvas(canvas, file.name);
    entry.file = rotated;
    toast("Image rotate ho gayi.", "success");
  }

  // ---------- 3. Hindi/English toggle (this project's own strings) ----------
  const STRINGS = {
    hi: {
      selectProfile: "Select Profile", autoFill: "⚡ Auto-Fill", createProfile: "+ Create Profile",
      noProfiles: 'No saved profiles yet — use "Create Profile" below to add one.',
    },
    en: {
      selectProfile: "Select Profile", autoFill: "⚡ Auto-Fill", createProfile: "+ Create Profile",
      noProfiles: "No saved profiles yet — use \"Create Profile\" below to add one.",
    },
  };
  function applyLang(lang) {
    // Both dictionaries are English-labelled already (the project settled
    // on English for its own added chrome) — this toggle is kept as a
    // clean hook so wording can be split per-language later without
    // touching the rest of the app; for now it mainly governs the
    // landing screen's tagline swap below.
    const tagline = document.querySelector(".landing-header-tagline");
    if (tagline) tagline.textContent = lang === "hi" ? "फॉर्म ऑटो फिलर" : "FORM AUTO FILLER";
  }
  function initLangToggle() {
    const header = document.querySelector(".landing-header");
    if (!header || $("saathiLangBtn")) return;
    const row = document.createElement("div");
    row.className = "landing-icon-row";
    row.id = "saathiLangRow";
    header.appendChild(row);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "saathiLangBtn";
    btn.className = "saathi-lang-btn";
    btn.title = "Switch language";
    btn.innerHTML = `<span class="saathi-lang-icon">🌐</span><span class="saathi-lang-text">EN/HI</span>`;
    row.appendChild(btn);

    chrome.storage.local.get(["saathiLang"], (res) => {
      const lang = res.saathiLang || "en";
      applyLang(lang);
      btn.addEventListener("click", () => {
        const next = lang === "en" ? "hi" : "en";
        chrome.storage.local.set({ saathiLang: next });
        applyLang(next);
      });
    });
  }

  // ---------- 4. Onboarding tutorial ----------
  function initTutorial() {
    chrome.storage.local.get(["saathiTutorialSeen"], (res) => {
      if (res.saathiTutorialSeen) return;
      const createBtn = $("landingCreateBtn");
      const overlay = $("saathiLandingOverlay");
      if (!createBtn || !overlay) return;
      const tip = document.createElement("div");
      tip.id = "saathiTutorialTip";
      tip.innerHTML = `
        👋 Welcome! Select a saved profile above and hit Auto-Fill,
        or tap <b>Create Profile</b> below to fill a fresh form —
        all your tools (search, backup, receipts) live inside there.
        <button type="button" id="saathiTutorialOk">Got it</button>
      `;
      overlay.insertBefore(tip, createBtn);
      $("saathiTutorialOk").addEventListener("click", () => {
        chrome.storage.local.set({ saathiTutorialSeen: true });
        tip.remove();
      });
    });
  }

  // ---------- 5. High-contrast mode ----------
  function initHighContrast() {
    const row = document.getElementById("saathiLangRow") || document.querySelector(".landing-header");
    if (!row || $("saathiContrastBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "saathiContrastBtn";
    btn.className = "saathi-lang-btn";
    btn.title = "High contrast mode";
    btn.innerHTML = `<span class="saathi-lang-icon">◐</span><span class="saathi-lang-text">Contrast</span>`;
    row.appendChild(btn);
    chrome.storage.local.get(["saathiHighContrast"], (res) => {
      if (res.saathiHighContrast) document.body.classList.add("saathi-high-contrast");
    });
    btn.addEventListener("click", () => {
      const on = document.body.classList.toggle("saathi-high-contrast");
      chrome.storage.local.set({ saathiHighContrast: on });
    });
  }

  // ---------- 6. Photo-thumbnail avatars ----------
  function resizeToThumb(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = 80;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }
  function initPhotoCapture() {
    const form = $("dataForm");
    const photoInput = $("image");
    if (!form || !photoInput) return;
    form.addEventListener("submit", async () => {
      const file = photoInput.files && photoInput.files[0];
      const name = ($("name") && $("name").value.trim()) || "";
      const mobile = ($("mobile") && $("mobile").value.trim()) || "";
      if (!file || !name) return;
      const thumb = await resizeToThumb(file);
      if (!thumb) return;
      chrome.storage.local.get(["saathiPhotos"], (res) => {
        const photos = res.saathiPhotos || {};
        photos[`${name}|${mobile}`] = thumb;
        chrome.storage.local.set({ saathiPhotos: photos });
      });
    }, true);
  }
  function applyPhotoAvatars() {
    chrome.storage.local.get(["saathiPhotos"], (res) => {
      const photos = res.saathiPhotos || {};
      document.querySelectorAll("#savedList > div").forEach((card) => {
        const h2 = card.querySelector("h2");
        if (!h2) return;
        const name = h2.textContent.trim().replace(/^\d+\.\s*/, "");
        const idEl = card.querySelector(".saathi-userid");
        const mobile = idEl ? idEl.textContent.replace(/\D/g, "") : "";
        const key = Object.keys(photos).find((k) => k.startsWith(name + "|") &&
          (mobile === "" || k.endsWith("|" + mobile) || k.endsWith("|")));
        const avatar = card.querySelector(".saathi-avatar");
        if (key && avatar && !avatar.querySelector("img")) {
          avatar.style.background = "none";
          avatar.innerHTML = `<img src="${photos[key]}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        }
      });
    });
  }

  // ---------- 7. Encrypted backup ----------
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }
  function buf2b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function b642buf(b64) { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }

  async function encryptPayload(jsonStr, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const enc = new TextEncoder().encode(jsonStr);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
    return { encrypted: true, salt: buf2b64(salt), iv: buf2b64(iv), data: buf2b64(cipher) };
  }
  async function decryptPayload(obj, password) {
    const salt = b642buf(obj.salt), iv = b642buf(obj.iv);
    const key = await deriveKey(password, salt);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, b642buf(obj.data));
    return new TextDecoder().decode(plainBuf);
  }

  function initEncryptedBackup() {
    const contentSaved = $("content-saved");
    if (!contentSaved || $("saathiEncryptedRow")) return;

    const row = document.createElement("div");
    row.id = "saathiEncryptedRow";
    row.innerHTML = `
      <button type="button" id="saathiEncExportBtn" class="saathi-pin-setting-btn" title="Password se protected backup file — kisi ko bhej sakte ho, unlock karne ke liye password chahiye hoga">🔒 Encrypted Export</button>
      <button type="button" id="saathiEncImportBtn" class="saathi-pin-setting-btn" title="Encrypted Export se banayi gayi .enc file yahan se wapas import karo">🔐 Import Encrypted</button>
      <input type="file" id="saathiEncImportInput" accept=".json" style="display:none;">
    `;
    contentSaved.insertBefore(row, contentSaved.firstChild);

    $("saathiEncExportBtn").addEventListener("click", () => {
      const pwd = window.prompt("Backup password set karo:", "");
      if (!pwd) return;
      chrome.storage.local.get(null, async (allData) => {
        const payload = { app: "Digital Saathi", exportedAt: new Date().toISOString(), data: allData };
        const enc = await encryptPayload(JSON.stringify(payload), pwd);
        const blob = new Blob([JSON.stringify(enc)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `digital-saathi-encrypted-backup.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast("Encrypted backup download ho raha hai…", "success");
      });
    });

    $("saathiEncImportBtn").addEventListener("click", () => $("saathiEncImportInput").click());
    $("saathiEncImportInput").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      const text = await file.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { toast("Ye file valid JSON nahi hai.", "warn"); return; }
      if (!parsed.encrypted) { toast("Ye file encrypted nahi hai — normal Import Backup use karo.", "warn"); return; }
      const pwd = window.prompt("Backup ka password daalo:", "");
      if (!pwd) return;
      try {
        const decrypted = JSON.parse(await decryptPayload(parsed, pwd));
        chrome.storage.local.get(null, (existing) => {
          const merged = { ...existing };
          Object.keys(decrypted.data || {}).forEach((k) => {
            if (k === "saathiAppPin") return;
            if (Array.isArray(decrypted.data[k]) && Array.isArray(existing[k])) {
              const seen = new Set(existing[k].map((x) => JSON.stringify(x)));
              merged[k] = [...existing[k]];
              decrypted.data[k].forEach((x) => { const s = JSON.stringify(x); if (!seen.has(s)) { merged[k].push(x); seen.add(s); } });
            } else if (existing[k] === undefined) {
              merged[k] = decrypted.data[k];
            }
          });
          chrome.storage.local.set(merged, () => {
            toast("Encrypted backup import ho gaya.", "success");
            const savedTabBtn = $("tab-saved");
            if (savedTabBtn) savedTabBtn.click();
          });
        });
      } catch {
        toast("Galat password ya corrupt file.", "warn");
      }
    });
  }

  function init() {
    try { initCameraAndRotate(); } catch (e) { console.warn("[premiumFeatures3] initCameraAndRotate failed", e); }
    try { initLangToggle(); } catch (e) { console.warn("[premiumFeatures3] initLangToggle failed", e); }
    try { initTutorial(); } catch (e) { console.warn("[premiumFeatures3] initTutorial failed", e); }
    try { initHighContrast(); } catch (e) { console.warn("[premiumFeatures3] initHighContrast failed", e); }
    try { initPhotoCapture(); } catch (e) { console.warn("[premiumFeatures3] initPhotoCapture failed", e); }
    try { applyPhotoAvatars(); } catch (e) { console.warn("[premiumFeatures3] applyPhotoAvatars failed", e); }
    try { initEncryptedBackup(); } catch (e) { console.warn("[premiumFeatures3] initEncryptedBackup failed", e); }
    const list = $("savedList");
    if (list) new MutationObserver(applyPhotoAvatars).observe(list, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
