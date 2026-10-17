# v3.1.0 — bug-fix + feature release

## Fixed
1. **NCL data never saved** (`nclFields.js`): `collect()` called a non-existent `selTest()` (typo for `selText`), so the save hook threw and *every* NCL field — DOB, Aadhaar, religion, caste text, document ticks — was silently dropped. Fixed; every block of `collect()` is now isolated.
2. **NCL document not selected / uploaded** (`enclosureAutoFill.js` + new `enclosureMatch.js`): option text such as `Form–XI`, `Form - XIII`, `प्रपत्र-IV` never matched, and `Form-XI` is a substring of `Form-XIII`. New matcher detects roman-numeral forms with proper boundaries, handles Hindi/English spelling variants, picks Aadhaar first for identity rows, honours Caste/Residence variants and falls back to token-overlap for unknown wording. Selection uses `selectedIndex` (safe with duplicate option values), re-queries nodes the portal re-renders, and reports exactly why a row was skipped.
3. **Missing code restored**: `initSameAsLast`, `initReceiptShare` (premiumFeatures2) and `initCopyAsText` (premiumFeatures5) were called but did not exist; the ReferenceError aborted `init()`, so the fee ledger, follow-up reminders, dashboard, bulk export and monthly report never started. Functions re-implemented (📍 Same Address as Last, 🧾 Receipt, 💬 WhatsApp, 📋 Copy as Text) and every feature `init()` is now fault-isolated.
4. **NCL checklist did nothing**: ticks / "Save Annexure bhi karo" were stored but nothing read them. Now read by the enclosure step (only ticked NCL docs are attached when any are ticked; Save Annexure pressed after a clean run if enabled).
5. **Form-VIII (Central) missing from the NCL document card** — added.
6. **Doc Vault dropdown closing by itself**: finishing OCR rebuilt the queue while you were choosing a document type. Re-renders are now postponed while a select/input has focus.
7. **Keyboard shortcut (Ctrl+Shift+L)** ignored every customer created by docStore v2 (`cust_…` ids). It now resolves the customer from the registry.
8. **Firefox**: manifest lacked `background.scripts` (driveSync/certJob were never loaded there). Added.
9. OCR read DOB/Aadhaar but they were "info only" — now filled into the NCL fields when empty and trustworthy.

## Also fixed after first field test
- Portal size limit was read as bytes (hidden field holds KB, e.g. 200) so every row showed "limit 0.0 MB" and blocked all uploads. Limit now read from the row text / hidden field with unit detection.
- New 📉 button in Doc Vault (per document + "≤200 KB" for all) shrinks PDFs to fit small portal limits; Undo supported.

## New
- **👁 Check** button on the enclosure page (dry run) + per-row status and a one-line summary.
- **Auto Save Annexure** (opt-in via the profile checklist).
- **NCL checklist auto-tick** when a document is added to the customer's vault.
- **Smarter Doc Vault type guessing** (NCL forms, electricity bill, passbook, DL, passport, khatiyan).
- **🩺 Health check** (Ctrl+K → "Health check"): verifies modules, that NCL fields really save, storage, orphan/duplicate data and the open portal page.
- DOB / Aadhaar (Verhoeff checksum) live hints in the NCL section.
- Size limit is now only a hint: files are always attached and the portal's own check decides (a hand-uploaded identical file was accepted, so blocking was wrong).

## UI / flow update (field test 2)
- NCL fill now ticks the "संलग्नक चुनें" checkboxes (Form-XIII / IV / XVI): the ones ticked in the profile checklist, or every NCL document saved in the vault. Locked boxes (e.g. mandatory Form-VIII) are left alone.
- New result toast for every fill (general / NCL / EWS): clean card with icon, progress bar, pause on hover, and per-item list. "Other income" is now an info line, not a warning.
- Enclosure step: every row shows a status card ("✓ Document Uploaded" + document, file name, size; spinner while uploading) and a chip summary.
- Removed the "📚 Sab sub-caste seekho" button from the page (still available from console: __saathiLearnAll()).

## ✍️ Signature on photo (new)
- Pick the customer photo -> a "Signature" box appears right beside it (click / drag-drop / Ctrl+V; "↻ Pichla signature" reuses the last one).
- Background is removed automatically (local paper-brightness estimate, so shadows and uneven light do not leave grey patches; dust is despeckled; ink colour auto / black / blue).
- Editor: drag with the mouse, wheel or corner handle = size, green top handle = rotate (snaps level), sliders for size, rotation, background safai, contrast, light/dark; "Asli look" (multiply, ink looks printed on the photo - auto-switches to Normal on dark photos) or Normal; arrow keys nudge.
- "✓ Photo par lagao" flattens into the photo as JPEG kept inside the 20-350 KB window, the box disappears, and "↩ Signature hatao" restores the original photo.
- Photo preview in the popup is larger (92 px).
- Health check also verifies the signature modules.

## 🎨 New logo (Click & Connect · Cyber Cafe Suite)
- Toolbar / extension-page icons (16/32/48/128) regenerated from the new app icon; full brand set in `brand/` (SVG + PNG).
- Popup header: logo mark + brand-gradient accent text + gradient underline (works on light and dark theme).
- Landing and PIN screens: rounded-square app icon with brand glow.
- On the portal: logo chip in the result toast and in the enclosure panel, "Update Page" button in the brand gradient.
- Receipt print window shows the logo.
- Texts were NOT renamed: manifest/header still say "Click & Continue", landing/receipt "Digital Saathi" - the logo wordmark says "Click & Connect".
