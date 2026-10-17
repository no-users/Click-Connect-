> **v3.1.0** — see `CHANGELOG_3_1_0.md` (NCL save/upload fixes, restored missing features, Health check, smarter enclosure matching).

# Click & Continue v3.0.1 — bug-fix release (pehle ye padho)

**Kya theek hua**
- `content.js` poora naye sire se: dropdown ki value ab tab lagti hai jab uske options page par aa jate hain
  (State -> District -> Anumandal -> Prakhand -> Gram / Police Station, Category -> Caste -> Sub-caste).
  Ek field/radio missing ho to baaki form ab nahi rukta. Fill ke baad page par summary toast (kya bhara / kya nahi).
- Sub-caste: purane code me Category/Caste/Sub-caste ki IDs ulti thi (Category dropdown corrupt ho sakta tha) — hata diya.
- Popup: Caste/Income page par District list khaali ho jati thi (page ke `[]` jawab se overwrite) — ab lists local data se banti hain.
- Update (edit) / Load / Save: sub-caste, caste, district, gram, police station, photo ab restore hote hain; edit-save silently fail nahi hota;
  image size error ka alert 2 baar aata tha — ek baar.
- Hindi naam: khaali husband/mother naam ka garbage translate nahi, internet na ho to fill nahi rukta.
- Rename: Click & Continue (manifest + popup header).

---

# Documents → Auto-fill feature (added to Digital Saathi)

## What it does

New **Documents** tab in the popup:

1. Customer uploads however many documents they have (any mix — Aadhaar,
   ration card, voter ID, an old caste/income/residence certificate,
   images or PDFs).
2. Each document is OCR'd **fully offline** (Tesseract.js, no internet
   call, no third-party API) — important since these documents carry
   caste/income/identity data.
3. Extracted text is scanned for known fields (name, father's/mother's/
   husband's name, gender, mobile, email, PIN, district, profession,
   caste, caste category, total income).
4. If one document is missing a field, the next document is checked —
   whichever document actually contains a field wins. Caste-related
   fields prefer a document detected as a caste certificate, income
   fields prefer an income certificate, etc.
5. Before anything touches the real form, you get an **editable review
   table** showing each extracted field + which document it came from —
   so OCR mistakes can be fixed by hand before applying.
6. "Apply to Form" writes the values into the existing `#dataForm`
   fields (same IDs `content.js`/`popup.js` already use) and fires
   `change` events so your existing cascading dropdowns (district →
   anumandal → prakhand, caste → subcaste) still update correctly.
7. User lands back on the Form tab to give it one final look, then
   clicks the extension's own **Save Data** button as usual — nothing
   is auto-submitted anywhere.

## What I deliberately did NOT do

- **Did not touch `content.js` or `popup.js`.** Both are obfuscated by a
  commercial packer, which makes them unsafe to hand-edit — a wrong
  edit in minified code is very hard to debug. All new code lives in
  separate files and only interacts with the form through the DOM
  (`document.getElementById(...)`), the same way a human filling the
  form would.
- **Did not auto-submit anything.** The review step exists specifically
  because OCR on scanned/photographed government documents is never
  100% accurate — a caste category or PIN code mistake would be a real
  problem for the customer's application.
- **Did not send documents anywhere online.** OCR is fully local
  (Tesseract.js). See `vendor/README.md` for the one-time setup this
  requires.

## Files added/changed

| File | Change |
|---|---|
| `manifest.json` | added CSP entry so Tesseract's WASM engine is allowed to run |
| `popup.html` | added "Documents" tab button, panel, and CSS |
| `documentParser.js` | **new** — turns OCR text into field values |
| `ocrEngine.js` | **new** — wraps Tesseract.js + pdf.js |
| `docsTab.js` | **new** — UI wiring for the Documents tab (upload, drag-drop, review table, toast) |
| `profileCardEnhancer.js` | **new** — dresses up the Profile tab cards (avatar, serial badge, ID pill) after popup.js renders them |
| `uiFixes.js` | **new** — defensive fix so radio-group selections always stick |
| `vendor/` | you need to drop OCR library files here — see `vendor/README.md` |

## Recent fixes (this round)

- **Theme toggle** was in the HTML/CSS but had zero JS behind it — added (persists via `chrome.storage.local`).
- **Profile card**: avatar/serial/ID redesign was accidentally wiping the Load/Update/Delete buttons (they turned out to live inside the same wrapper div as the name/mobile) — fixed to move only the name+mobile, leaving the buttons untouched. Button colours are now assigned by their text ("Load"/"Update"/"Delete") instead of sibling position, so they can't silently break again if the layout changes.
- **Radio buttons** (gender / address type / residence type): redesigned as clearly-highlighted pill/chip selections instead of relying on the tiny native radio dot, so selection state is always obvious. Added a small JS safety net that re-asserts the checked state a frame after click, in case anything else in the app resets it.
- **Documents tab**: drag-and-drop upload, a remove (✕) button per queued file, and toast notifications instead of `alert()` popups.
- **Header redesign**: brand-styled title bar + a gold pill-button link in the subheading, sized to fit the existing fixed-header layout exactly (no overlap).
- **Icon**: replaced the placeholder icon with a navy/gold "official seal" (document + checkmark) at 16/32/48/128px, wired into `manifest.json`.
- **Export / Import backup** (Profile tab): "Export Backup" downloads a `.json` file containing the *entire* local storage (all saved profiles + settings) — no dependency on knowing popup.js's internal data format. "Import Backup" reads that file back in on any PC and **merges** it into whatever is already saved there: array data (where profiles live) is combined and de-duplicated, existing settings (like the theme) are left alone, and nothing already saved is ever deleted. This lets a customer's saved profile move between computers, or serve as a manual backup.
- **Quick Profile panel** — added and then removed per feedback; see "Landing screen" below instead.
- **Landing screen** (`landingScreen.js`): the popup now opens to a minimal overlay — just a profile dropdown + "⚡ Fill Karo" button, plus a "+ Create Profile" button underneath. The full app (header, Form/Profile/Documents tabs, everything previously built) is completely untouched — it's just covered by this overlay until "Create Profile" is pressed, which hides the overlay and clicks the real `#addNewRecord` button to reveal the full app exactly as it already was. "Fill Karo" proxy-clicks the matching saved-profile card's real Load button — no storage logic was reimplemented.
- **Landing screen v2**: made compact (popup shrinks to 330px while it's showing, instead of inheriting the full app's larger size — fixed by hiding the full app's top-level elements via a body class rather than just visually covering them), English labels, and uses the real `icon128.png` as its logo.
- **Light colour palette**: the default (non-dark-mode) theme's CSS variables in `:root` were changed from the parchment/navy "official record" look to a lighter sky-blue-and-white palette (`--bg-app`, `--card-bg`, `--accent-navy`, etc.). The Theme toggle's dark mode is untouched and still available. The generated icon and the profile-avatar colour palette were left as-is (navy/gold) since they're static/decorative and still read well against the new lighter background — happy to relight those too if wanted.
- **Firefox / cross-browser support**: added `browser_specific_settings.gecko` (required by Firefox; **change the placeholder id `digital-saathi@example.com` to something unique before publishing**), and added a `background.scripts` fallback alongside `service_worker` since Firefox's MV3 service-worker background support varies by version — Firefox will use `scripts`, Chromium browsers will use `service_worker`. All the JS added in this project uses the `chrome.*` API namespace, which Firefox implements as a compatibility layer, so no code changes were needed there. To test in Firefox: `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `manifest.json` (temporary add-ons reset on browser restart; permanent install requires signing via addons.mozilla.org).
- **Premium features batch #1** (`premiumFeatures.js`) — all additive/proxy-based, none of them touch popup.js/content.js:
  - 🔍 Search box on the Profile tab (filters cards by name/mobile, client-side, instant)
  - ✅ Live validation hints on Mobile (10-digit) and PIN (6-digit) fields in the Form tab — non-blocking, just a red border + message
  - ⚠️ Duplicate-mobile warning toast on Save (informational only — never blocks the actual save)
  - 📊 Daily/monthly "forms filled" counter badge on the Profile tab
  - 💾 Weekly backup reminder toast if `saathiLastBackupAt` is more than 7 days old (or never set)
  - 🔒 Optional PIN lock on the landing screen — off by default; enable/change/remove via the "🔒 Set/Change PIN Lock" button in the Profile tab
  - 🌗 Auto light/dark theme — follows the OS's `prefers-color-scheme` the first time, until the user manually picks a theme (after which their manual choice always wins)
  - ⭐ Favorite profiles — a star toggle on each card pins it to the top of the list

**Deliberately not built:** an auto-CAPTCHA-solver for the government portal's "Word verification" step — that check exists specifically to block automated/bot submissions, and building a bypass for it isn't something this project will do regardless of the underlying intent.

## Critical fixes (this round)
- **PIN-lock screen was breaking the whole popup** — it used `position: fixed`, which (same as the earlier landing-screen bug) leaves no normal-flow content for Chrome to size the popup against, so the popup collapsed to a near-unusable sliver. Fixed the same way the landing screen was fixed: normal in-flow layout instead of `position: fixed`.
- **Import could silently turn PIN-lock on** — if an imported backup happened to contain a `saathiAppPin` (e.g. from testing on another device), it would get merged in and silently lock the importing device too. `saathiAppPin` is now on a permanent do-not-import list.
- Added a **"Forgot PIN?"** link on the PIN screen (clears the PIN after a confirm) so nobody can get permanently locked out, including anyone already affected by the two bugs above.

## Premium features batch #2 (`premiumFeatures2.js`)
- 📋 **Same Address as Last** button in the Form tab — copies district/anumandal/prakhand/village/PIN/post office/police station/ward from whatever was saved last, useful when filling many people from the same area back-to-back.
- 🧾 **Receipt** button — opens a small printable slip (name, mobile, purpose, date) for the customer.
- 📱 **WhatsApp** button — sends that same summary via a wa.me share link.
- 💰 **Fee ledger** — optional prompt on Save for the fee collected; totals show in the dashboard.
- 🔔 **Follow-up reminders** — optional reminder date on Save; a toast warns when one is due within 3 days.
- 🏆 **Milestones** — a congratulations toast at 10 / 50 / 100 / 500 / 1000 forms saved.
- 📈 **7-day usage bar chart** on the Profile tab, plus today's fee total.
- ☑️ **Export Selected Only** — checkboxes on each profile card, then export just the ticked ones instead of everything.
- 📊 **OCR confidence score** — the Documents tab now shows how confident the OCR was per file, and a collapsible "raw text" preview per document for manually double-checking what was actually read.

**Still queued** (deferred for complexity/fragility, not forgotten): camera capture for documents, auto-rotate/crop before OCR, encrypted backups, a full Hindi/English toggle across every label, an onboarding tutorial walkthrough, high-contrast mode, and photo-thumbnail avatars (using the customer's actual uploaded photo instead of initials). Happy to take these on next, in the same tested-batch way.

## Premium features batch #3 (`premiumFeatures3.js`)
- 📷 **Use Camera Instead** button on the Documents tab — captures a photo via `getUserMedia` and feeds it straight into the same OCR pipeline as an upload.
- ⟳ **Rotate** button per queued document (90° at a time) before running OCR — a lighter, more reliable substitute for full auto-deskew, which is hard to get right without live testing.
- 🌐 / ◐ **Language and high-contrast toggle icons** on the landing screen (language toggle currently swaps the tagline; wired so more strings can be added to the dictionary later without touching other files). High-contrast mode thickens borders and adds stronger outlines for low-vision use.
- 👋 **One-time onboarding tip** on first launch (dismissable, never shown again after).
- 🖼️ **Photo-thumbnail avatars** — if a photo was attached in the Form tab's photo field when saving, that photo (resized small, stored locally) now shows on the profile card instead of initials.
- 🔒 **Encrypted Export** / 🔐 **Import Encrypted** — separate, clearly-labelled buttons (kept apart from the plain Export/Import so the two flows can't interfere with each other) that password-protect a backup using AES-GCM with a PBKDF2-derived key — the file is unreadable without the password.

**Everything from the original feature list is now built**, except the auto-CAPTCHA-solver (declined — see above) and full auto-crop/deskew (replaced with the simpler, safer manual rotate button, since automatic skew-detection is the kind of thing that needs real photos to tune properly, and getting it wrong would make OCR worse, not better).

## Premium features batch #4 (`premiumFeatures4.js`) — final batch
- 🏷️ **Tags/categories** on each profile card — click the chip to set any label (village name, "Pending", "Submitted", whatever's useful). Saving a profile right after an OCR extraction auto-tags it with the detected document type(s), unless a tag was already set manually.
- ⚠️ **Conflicting-document flag** in the Documents tab's review table — if two uploaded documents disagree on a field (e.g. two different castes), that row is now a dropdown showing both values with their source file, instead of silently picking one.
- 🗑️ **Delete Selected** — a safe bulk-delete using the same checkboxes as "Export Selected Only". It proxy-clicks each selected profile's real Delete button one at a time (so any confirmation dialog popup.js shows still appears normally, just for each one).
- 📝 **Auto-draft save** in the Form tab — typing is saved locally every ~1s; if the popup closes before you hit Save Data, reopening offers to restore that draft (only when the form looks freshly empty, so it never overwrites a profile you just loaded).

**One thing I did *not* attempt:** live status feedback for the actual auto-fill happening on the government website tab (e.g. "✅ Filled successfully" inside the popup). Building that correctly means understanding the exact message-passing protocol between the obfuscated `popup.js` and `content.js` — reverse-engineering that blind, without being able to test against the real portal, risks either doing nothing or silently misreporting success/failure, which is worse than not having the feature. If you can tell me what `chrome.tabs.sendMessage` call popup.js currently makes (or can share an unobfuscated version of that one function), I can wire this up properly.

## ⚠️ IMPORTANT — the OCR "always errors" bug
If Documents-tab uploads always fail with "file ko padhne me error aayi", check
`vendor/tesseract/tesseract.min.js` and `vendor/pdfjs/pdf.min.js`: if either
is only a few KB / a few dozen lines, **it is a fake placeholder, not the
real library**, and OCR was never actually going to work with it — Claude
has no internet access to fetch these itself and always said so; see
`vendor/README.md` for exactly where to get the genuine files (real
`tesseract.min.js` is several hundred KB; a few-line stub is not it).

## ⚠️ PDF-specific fix: "pdfjsLib is not defined"
Current pdf.js releases ship as ES modules (`export { ... }` syntax), which
a plain `<script src="...">` tag cannot execute — it silently fails to
run, so `pdfjsLib` never gets defined even though the file itself loaded
fine (this only affected PDFs — images worked, since they don't need
pdf.js at all). Fixed by importing it via `<script type="module">` in
`popup.html` and reading `pdfjsLib.GlobalWorkerOptions` lazily (at the
moment a PDF is actually processed) instead of at page-load time, since
module scripts execute after classic scripts.

## Bonus: Customer-facing typed-entry form (external link)
The bundled `customer-form.html` file was removed per feedback — instead,
the **"🔗 Customer Form Link Kholein"** button in the Documents tab lets
you paste in your *own* hosted link (e.g. from Netlify Drop) the first
time you click it, remembers it, and opens that link in a new tab from
then on. Right-click the button any time to update the saved link. The
standalone `digital-saathi-customer-form.html` file (bilingual, premium
image/PDF output) delivered earlier in this conversation is still the
file to host — just paste its URL into this button once it's live.

## Layout fix (this round)
Several batches each added extra buttons (Same Address as Last, Receipt,
WhatsApp, Copy as Text) directly into the Form tab's Clear/Save Data row,
which became cramped and broke the layout once enough of them piled up.
`formActionsPanel.js` moves those extra buttons (never Clear/Save Data
themselves) into their own wrapped row just above, without touching any
of their click handlers.

## Small cleanups (this round)
- Removed unused leftover CSS from the earlier "Quick Profile Panel"
  experiment that was replaced by the landing screen.
- Fixed a rare timing edge case in `profileToolsPanel.js` where the
  usage counter badge could occasionally land outside the organized
  tools panel if it was created a few milliseconds late.

## Premium features batch #5 (`premiumFeatures5.js`) — new ground
- 🔢 **Aadhaar checksum validation** — after an OCR extraction, any
  12-digit Aadhaar-shaped number found in the raw text is checked
  against the real Aadhaar Verhoeff checksum algorithm. If it fails,
  a warning banner appears in the review table telling you to
  double-check that number by eye — this catches OCR misreads (like a
  0 read as an 8) before they end up in a saved profile.
- ↩️ **Undo Delete** — deleting a profile now shows a toast with an
  "Undo" button for a few seconds. It works by snapshotting the
  *entire* local storage right before the delete click, and restoring
  that snapshot if Undo is pressed — so nothing about the internal
  data format needed to be known or guessed.
- 📋 **Copy as Text** button in the Form tab — puts a plain-text
  summary of the key fields on the clipboard, for pasting into SMS,
  Notes, Telegram, or anywhere that isn't WhatsApp-image-based.
- 🖨️ **Print Monthly Report** (in the Tools drawer) — a one-page
  printable summary of this month's forms filled, fees collected, and
  the all-time total, built from the usage stats already being tracked.
Every earlier batch added its own toolbar to the top of the Profile tab,
which stacked into a cluttered, inconsistently-styled column. This file
doesn't touch any of that logic — it **moves** the already-working
buttons into one organized panel:
- Search box + 7-day dashboard stay always visible at the top.
- Everything else (backup, encrypted backup, PIN, bulk export/delete)
  is now under a collapsed **"⚙️ More Tools"** drawer, grouped under
  clear section labels, all buttons the same consistent size/style.
- Bulk-select checkboxes on each card are hidden by default now —
  toggle **"☑️ Select Mode"** in the drawer to show them only when
  actually doing a bulk export/delete.
- The landing screen's 🌐 and ◐ icons now have visible text labels
  ("EN/HI", "Contrast") instead of being bare, unlabeled circles.

`content.js`, `background.js`, `casteData.js`, `icon.png`, `popup.js` are
unchanged (copied as-is).

## Per-profile documents fix (this round)
Previously every uploaded document was tied to one generic "active
session" — so documents didn't reliably follow the right customer
when switching between saved profiles, and there was no way to
view/change/delete a profile's documents from the Profile tab.

- **`docStore.js`** — documents are now keyed by the customer's
  **mobile number** (`switchToProfile`, `migrateActiveSessionTo`,
  `deleteProfileDocs`) instead of a random session id. A brand-new
  profile still starts under a temporary session (mobile not typed
  in yet); the moment a full 10-digit mobile number is entered, its
  documents are automatically moved onto that mobile's profile.
- **`docProfileLink.js`** — **new file.** Wires the Profile tab's
  existing Load / Update / Delete buttons on each saved-profile card:
  clicking **Load** or **Update** switches the Documents panel over
  to that customer's own documents (view, add, remove — same place
  as before, inside the Form tab); clicking **Delete** (after the
  usual confirm) also removes that customer's saved documents so
  nothing is left orphaned.
- **`enclosureDocsPanel.js`** — the separate "quick upload" button
  per document type has been replaced with **one combined dropdown**
  (grouped by Aadhaar / Caste / Income / Residence / Other, matching
  the real government page's own document-type picker) followed by a
  single "Choose PDF" control, plus one list of everything uploaded
  so far for the current customer with a ✕ to remove each.
- Also typing/editing the mobile number live in the Form tab now
  keeps the Documents panel's "documents for <name>" line and list in
  sync immediately, without waiting for Save.

## Per-profile documents fix (this round)
Previously every uploaded document was tied to one generic "active
session" — so documents didn't reliably follow the right customer
when switching between saved profiles, and there was no way to
view/change/delete a profile's documents from the Profile tab.

- **`docStore.js`** — documents are now keyed by the customer's
  **mobile number** (`switchToProfile`, `migrateActiveSessionTo`,
  `deleteProfileDocs`) instead of a random session id. A brand-new
  profile still starts under a temporary session (mobile not typed
  in yet); the moment a full 10-digit mobile number is entered, its
  documents are automatically moved onto that mobile's profile.
- **`docProfileLink.js`** — **new file.** Wires the Profile tab's
  existing Load / Update / Delete buttons on each saved-profile card:
  clicking **Load** or **Update** switches the Documents panel over
  to that customer's own documents (view, add, remove — same place
  as before, inside the Form tab); clicking **Delete** (after the
  usual confirm) also removes that customer's saved documents so
  nothing is left orphaned.
- **`enclosureDocsPanel.js`** — the separate "quick upload" button
  per document type has been replaced with **one combined dropdown**
  (grouped by Aadhaar / Caste / Income / Residence / Other, matching
  the real government page's own document-type picker) followed by a
  single "Choose PDF" control, plus one list of everything uploaded
  so far for the current customer with a ✕ to remove each.
- Also typing/editing the mobile number live in the Form tab now
  keeps the Documents panel's "documents for <name>" line and list in
  sync immediately, without waiting for Save.

## Documents section polish (this round)
- The document-type dropdown's **Caste / Income / Residence** groups
  now list the exact evidence-document options from the real
  government form's own "साक्ष्य हेतु अभिलेख चुनें" pages (खतियान,
  दानपत्र, राजस्व अभिलेख, वेतन/पेंशन पर्ची, आयकर रिटर्न, विद्युत/दूरभाष
  विपत्र, etc.) instead of one generic placeholder per category —
  taken from screenshots of the actual portal. The **Caste** group's
  options are a best-effort match (no screenshot of that specific
  page yet); happy to correct the exact wording if you send that one
  too.
- Each uploaded document now has a **👁 view button** next to the ✕
  remove button — opens the saved PDF in a new tab to double-check it
  before relying on it, without needing to re-upload from disk.
- The uploaded-documents list is now **grouped the same way as the
  dropdown** (with a small count badge per group), and the
  "📎 Documents" heading itself shows a total count badge — easier to
  see at a glance whether everything needed for a given certificate
  has actually been uploaded yet.

## Documents section — round 2 (this update)
- **Caste (जाति) group now matches the real portal exactly** — खतियान,
  दानपत्र, भूमि संबंधी दस्तावेज, भूमिहीनों वाला अभिलेख, अन्य राजस्व
  अभिलेख, and the "स्थल निरीक्षण हेतु आग्रह" option, taken straight from
  your screenshot of the actual government page.
- **Size limit raised from 1MB to 2MB** (`docStore.js`'s
  `MAX_BYTES_PER_DOC` and `enclosureDocsPanel.js`'s `MAX_MB`), per your
  request.
- **Fixed a real "docs going missing / feeling mixed up" bug**: the
  Documents-tab OCR flow (`docsTab.js`) saves documents under generic
  keys — `caste_certificate`, `income_certificate`,
  `residence_certificate` — that weren't in the enclosure panel's
  dropdown list at all, so anything uploaded that way was saved but
  invisible here. All three are now included (marked "पुराना / OCR se
  upload") in their matching group, so nothing uploaded through either
  route ever disappears from view.
- **Stronger per-profile isolation** (`docProfileLink.js`): the
  mobile-number lookup used to switch profiles now prefers the
  dedicated ID line profileCardEnhancer.js writes (guaranteed to be
  exactly that customer's number, cleaned of formatting) instead of
  scanning the whole card's text, removing a possible source of one
  customer's documents bleeding into another's.
- **Overwrite confirmation** — re-uploading a document type that
  already has a saved file now asks first ("...pehle se upload hai,
  replace karna chahte hain?") instead of silently replacing it.
- **File size + upload date** now shown per document in the uploaded
  list (e.g. "412 KB · Aaj, 3:40 PM"), so it's easy to see at a glance
  which files are recent/how close to the 2MB limit they are.
- **"🗑 Sabhi saaf karein"** — a new button next to the uploaded-docs
  list clears every document for the *currently open* customer only
  (with a confirm) — separate from the ✕ per-document remove and from
  "🔄 Naya Customer" (which just switches away without deleting).

## Documents section — round 3 (this update)
- The "आवेदक का पहचान दस्तावेज / Identification document" dropdown
  (निर्वाचन पहचान पत्र, मतदाता पहचान पत्र, पेंशन दस्तावेज, ड्राइविंग
  लाइसेंस, आधार कार्ड, पासबुक, पासपोर्ट, स्मार्ट कार्ड, स्वास्थ्य बीमा
  स्मार्ट कार्ड, पैन कार्ड, सरकारी पहचान पत्र, सर्विस पहचान पत्र) is
  common across all three certificates on the real portal — all 12 of
  these now live together under one "common" group at the top of the
  dropdown, exactly matching your screenshot's order, instead of being
  split between "common" (just Aadhaar) and a separate "Other" group.
- Removed the duplicate "निर्वाचन पहचान पत्र" entry that used to also
  sit inside the Residence group — it's now only in the common group,
  so it isn't listed (and can't accidentally get uploaded) twice.

## Documents section — round 4 (this update)
Added a full set of extra features on top of the core upload/organize
system, plus fixed one real bug found while wiring them up:

- **🐛 Bug fix: `pdfTools.js` existed on disk but was never loaded**
  (missing `<script>` tag in `popup.html`) — camera-scan, ZIP download,
  and auto-compress would all have silently failed. Added the missing
  `<script src="pdfTools.js">` tag, right after `docStore.js`.
- **📷 Camera se scan karke seedha PDF** — "📷 Camera se scan" button
  next to the file picker opens the device camera, lets you capture
  multiple pages, and turns them into one PDF (hand-written PDF
  writer, no external library).
- **🗜️ Auto-compress oversized PDFs** — a PDF over 2MB is
  automatically re-rendered through the bundled pdf.js at a lower
  resolution/quality and re-packed, retried at a few presets, before
  being rejected. Photos-turned-PDF via the camera are already small,
  so this mainly helps PDFs uploaded from elsewhere.
- **🖱️ Drag-and-drop** — drop a file directly onto the upload area
  (after picking its type) instead of only using the file picker.
- **📤 Copy doc to another profile** — every uploaded document has a
  📤 button to copy it onto another saved customer (e.g. a shared
  ration card / electricity bill across family members), without
  needing to re-upload the same file twice.
- **📋 "Poori list" checklist view** — toggle between "only uploaded"
  and a full checklist showing missing document types too (marked
  "missing"), so it's obvious at a glance what's still needed.
- **🔍 Search** — filter the list by document type or file name.
- **↩️ Undo** — removing a document shows an 8-second "↩️ Undo" toast
  before it's really gone.
- **📦 Download all as ZIP** — bundles every uploaded document for the
  current customer into one `.zip` (hand-written ZIP writer, no
  library) for easy backup/handover.
- **💾 Storage usage line** — shows total `chrome.storage.local` bytes
  in use (the extension already has the `unlimitedStorage` permission,
  so this is informational, not a hard cap warning).
- **✅ Doc-completion badge on profile cards** (`docProfileLink.js`) —
  each saved profile on the Profile tab now shows a small "📎 N" badge
  with how many documents that customer has uploaded; it now also
  live-updates the moment a document is added/removed for whichever
  customer is currently open, not just when the Profile tab is
  reopened.
- **🔒 PIN lock** — turns out this already existed as an app-wide
  landing-screen PIN gate (`premiumFeatures.js` → "🔒 Set/Change PIN
  Lock" button on the Profile tab), which covers Documents too since
  they live in the same locked popup — no separate documents-only PIN
  was added on top of it.

## Bug fix — "भूमि संबंधी दस्तावेज upload nahi hai" (real portal side)
On the actual government "Attach Enclosure(s)" page, several evidence-
document options (खतियान, दानपत्र, भूमि संबंधी दस्तावेज, भूमिहीनों वाला
अभिलेख, अन्य राजस्व अभिलेख) appear with **identical text** under both
the Caste and Residence certificate sections — but `enclosureDocsPanel.js`
saves them under different keys (`caste_*` vs `revenue_*`) so a customer
who only has evidence for one certificate isn't forced to fill both.

`enclosureAutoFill.js` (the content script that runs the "📎 Digital
Saathi se Bharein" button on the real portal) already HAD an `altTypes`
field on each of those entries meant to also try the sibling key — but
`matchCandidates()` never actually read it, so if a document was saved
under, say, `caste_land_doc` but that particular row on the real page
matched to `revenue_land_doc`, it reported "no saved document found"
even though the document clearly existed under the other key. Ration
card / Aadhaar etc. worked fine because those only ever have one key.

Fixed: `matchCandidates()` now also generates a candidate for every
`altTypes` entry, so `fillOneRow()` tries both keys for that row and
uses whichever one was actually uploaded.

## Merged your own edits + fixed what broke (this update)
You'd re-labelled a lot of the on-screen text to a shorter/cleaner
style (button labels, notes, group titles) — kept every one of those
exactly as you set them. Only touched what was actually broken:

- **🐛 Real bug: 3 document types silently disappeared.** While
  reordering/renaming the groups, `caste_certificate`,
  `income_certificate`, and `residence_certificate` got dropped
  entirely from `enclosureDocsPanel.js`'s `GROUPS` list. These three
  are exactly what `docsTab.js`'s OCR flow saves a scanned certificate
  under — so anything uploaded that way was silently invisible again
  (the same bug from a few rounds ago, reintroduced by accident). Added
  all three back, one into each of your Caste/Residence/Income groups,
  keeping your new group order, titles, and icons exactly as you set
  them.
- **🐛 Small inconsistency: checklist toggle button.** Its starting
  label was shortened to "🔸 List", but clicking it made it jump back
  to the old long text ("✅ Sirf uploaded" / "📋 Poori list...") and
  stay that way — the dynamic label in the click handler had been
  missed. Now both states use your shorter style consistently
  ("🔸 List" ↔ "🔸 Uploaded").
- **🔍 Search bar — asked to make it nicer, so:** added a 🔍 icon
  inside the box and a ✕ clear button that appears once you type
  something (click it to clear instantly). Also switched its colours
  from hardcoded hex values to the extension's own theme variables —
  it was fixed white/blue-bordered before regardless of dark/light
  mode; now it matches the rest of the panel either way.
- The now-empty "storage usage" line (you'd cleared its text) was
  still reserving a blank strip of space — it's now hidden entirely
  when there's nothing to show, instead of leaving a gap.
- Everything else — your emoji choices, shortened labels, removed
  hint text, the "➦" group-title style — untouched.

## Removed on request: search box + camera scan (this update)
- Also noticed the file you uploaded for this request was actually an
  older copy (missing the last few fixes — the 3 OCR document keys,
  the checklist-toggle label fix, the themed search bar). Applied
  these two removals on top of the latest fixed version instead of
  that older one, so those fixes aren't lost.
- **🔍 Search bar removed** — box, clear button, its CSS, and the
  filtering logic in the uploaded-documents list.
- **📷 Camera-scan-to-PDF removed** — the "📲 scan" button, the camera
  preview panel, and all of `openCamera` / `captureFrame` /
  `finishCameraToPdf` / `renderCameraThumbs`.
- Everything else — drag-and-drop, auto-compress, copy-to-another-
  profile, checklist view, undo, ZIP download, storage line — still
  there, untouched.
- `pdfTools.js`'s `imagesToPdf()` function is now unused (only the
  camera feature called it) but was left in place rather than removed,
  since `compressPdfFile()` and `zipFiles()` from the same file are
  still very much in use.

## Fixed the "अन्य अभिलेख (Income) upload nahi ho raha" bug
`enclosureAutoFill.js` (real government page ka auto-attach) me
`income_other` ke liye sirf EK exact Hindi text match tha —
`"अन्यन्च अभिलेख"` (screenshot me jo dikha tha, uska hi likha hua).
Agar asli portal ke us dropdown me text thoda alag hai (jaise
`"अन्य अभिलेख"`), to match hi nahi hota tha aur extension bolta
tha document upload nahi hai, jabki save to thi.

Fix: ab `income_other` teen variants try karta hai — `"अन्यन्च
अभिलेख"`, `"अन्य अभिलेख"`, `"अन्यान्य अभिलेख"` — jo bhi asli page
par likha ho, match ho jayega. Baaki kisi bhi dusre document type se
takraav nahi hai (jaise Caste/Residence ka "अन्य राजस्व अभिलेख" alag
hi rehta hai).

**Note:** is baar tumne khud jo file bheji thi usme `caste_certificate`
/ `residence_certificate` / `income_certificate` (OCR fallback wale 3
items) phir se hataye hue the — jaisa poocha gaya tha, unhe wapas add
nahi kiya, sirf yehi upar wali reported bug fix ki hai. Bas dhyan
rahe: Documents-tab ke OCR scan se agar koi poora certificate scan
karke save kiya, to wo ab bhi enclosure-panel ki list me nahi dikhega
(pehle jaisa) — agar future me chahiye ho to bata dena.

## Corrected "अन्यान्य अभिलेख" spelling (real portal confirmed)
You sent a screenshot of the actual Income-certificate evidence
checklist — confirms the real text is **"अन्यान्य अभिलेख"**, not
"अन्यन्च अभिलेख" (a typo from an earlier screenshot) or "अन्य
अभिलेख". Updated the dropdown label in `enclosureDocsPanel.js` to the
correct spelling, and made it the first/primary match in
`enclosureAutoFill.js` (kept the other two spellings as fallbacks, in
case the exact rendering differs by district/version of the portal).

## Full audit pass (this update) — "koi mistake to nahi hai" check
Went through the whole documents feature (`enclosureDocsPanel.js`,
`enclosureAutoFill.js`, `docStore.js`, `docProfileLink.js`,
`pdfTools.js`, `importExport.js`) systematically — cross-checked every
document key, label, and matcher term against each other and against
your screenshots, instead of waiting for the next thing to break.
Found and fixed:

- **🐛 Real bug — Import Backup could silently lose documents.**
  `docStore.js`'s document storage is one object keyed by customer
  (mobile number). The generic import-merge logic in
  `importExport.js` only knew how to combine arrays or fill in a
  completely-missing key — for any object key that already existed
  locally (which the documents key always does, the moment any device
  has ever saved one document), the entire incoming value was
  discarded. Restoring a backup onto a device that already had *any*
  document saved would silently drop every customer's documents from
  that backup. Added a dedicated per-customer, per-document-type merge
  for this one key — a document already saved locally always wins on
  conflict, but nothing incoming is dropped anymore.
- **🐛 Small bug — size-limit warning always said "2 MB".** The actual
  per-row limit is read live from the real government page (it can
  differ by row), but the message shown when a file was too big for
  that specific row was hardcoded to say "2 MB" regardless. Now shows
  the real limit for that row.
- **🐛 Small inconsistency — "Copy to another profile" picker** used a
  less careful way of reading a saved profile's mobile number (scanned
  the whole card's text) than the rest of the file does elsewhere —
  same class of risk as the original profile-mixing bug, just in a
  more minor feature. Now uses the same reliable method everywhere.
- Removed a couple of small dead-code leftovers (computed values that
  were never actually used) and a few stray blank lines.
- **Verified clean, no changes needed:** all 29 document keys used by
  the dropdown and the real-page auto-fill matcher line up exactly
  (no gaps either direction); the hand-written PDF and ZIP file
  formats check out byte-for-byte against the standard spec; every
  document label matches what's in the screenshots you've sent; and
  `documentParser.js`'s own (unrelated) mobile-number extraction — it
  reads a phone number printed on a scanned ID document, not a
  customer profile — was already correctly designed and didn't need
  touching.

## New: CAPTCHA assist (typing faster, not solving) — this update
Explicitly does **not** read or auto-solve the CAPTCHA — that's the
one check specifically meant to stop automated/bot form-submission,
so bypassing it isn't something this extension does. New
`captchaAssist.js` instead makes typing it faster for a human:
- Shows a magnified copy of the CAPTCHA image right below the input
  box (2.5x), so it's readable without squinting/zooming the page.
- Auto-focuses the CAPTCHA input the moment it's found — but **only**
  if nothing else on the page is already focused, so it never steals
  the cursor away mid-typing elsewhere in the form.
- Clicking the magnified image also jumps the cursor into the real
  input, as a shortcut.

Registered in `manifest.json` alongside `enclosureAutoFill.js`.
Detection is heuristic (`id`/`class`/`alt`/`name`/`placeholder`
containing "captcha") since the exact markup for this portal's
CAPTCHA wasn't available to pin down precisely — if it doesn't find
the real one on your page, send a screenshot of that section and the
selector can be made exact.

## CAPTCHA zoom — now targeting the exact real markup (this update)
You sent the actual page source for the Residence-certificate form's
CAPTCHA step. Confirmed the exact ids: `<img id="captchaImage">` and
`<input id="captchaAnswer">`. `captchaAssist.js` now checks these
exact ids FIRST (fast, guaranteed-correct match on this portal), and
only falls back to the generic "id/class/alt contains captcha" scan
for any other page where the ids might differ. The refresh icon
(`captchaResetImage()`, which just changes `#captchaImage`'s `src`)
is already handled — the zoom preview updates automatically since it
watches for `src` attribute changes.

**If the zoom box still doesn't show up:** the extension needs a full
reload for a content-script change like this to take effect on an
already-open tab — go to `chrome://extensions`, click the reload icon
on Digital Saathi, then refresh the government page tab itself (a
plain popup-close/reopen isn't enough for content-script files).

**Declined again, same reason as before:** an icon that reads the
CAPTCHA text and fills it in — even one that only acts on a manual
click — is still an automated CAPTCHA solver. The trigger being manual
doesn't change what it defeats (proving a human, not a script, is
submitting the form), so this isn't something added here.

## Profile tab decluttered — collapsible dashboard (this update)
The Profile tab used to always show the "📈 Last 7 Days" usage chart,
"Today/This Month" counter, search box, "⚙️ Action" tools drawer, and
"🖨️ Print Monthly Report" button stacked above the actual saved-
profile list — every time the extension opened. New
`profileTopCollapse.js` folds all of that behind one "📊 Dashboard aur
Tools" toggle bar, **collapsed by default**, so opening the extension
now shows the saved-profile list first; tap the bar to reveal the rest
when needed.

This doesn't touch `premiumFeatures*.js` or `profileToolsPanel.js` at
all — those files still create their widgets exactly as before; this
file just moves whatever they create into one collapsible section
using a MutationObserver, so it keeps working even though those
widgets get created at different, sometimes-async times.

## CAPTCHA fast-fill — 3 more assistive features (this update)
Still doesn't read/solve the CAPTCHA — same reason as before. Added:
- **Alt+R anywhere on the page** instantly loads a fresh CAPTCHA image
  — same effect as clicking the small refresh icon, without needing
  to find/click it. Reproduces the page's own confirmed
  `captchaResetImage(imageId, focusId)` (its exact source — a plain
  `img.src` reload — was in the page dump you sent) via direct DOM
  manipulation, since a content script's isolated JS world can't call
  a page-defined function directly.
- **Higher-contrast zoom** — the magnified CAPTCHA copy now also gets
  `contrast(1.5) saturate(1.4) brightness(1.05)` applied (only to this
  copy, never the real page), so distorted/noisy characters stand out
  more clearly.
- **Enter in the CAPTCHA box jumps to "Proceed"** — searches the page
  for a button/link whose text is exactly "Proceed" and clicks it.
  Deliberately NOT tied to a guessed character count (e.g. "after 6
  chars") — the real `<input id="captchaAnswer">` has no `maxlength`
  in the page source, so a fixed-count guess risked cutting off a
  longer CAPTCHA. Enter only fires once the operator says they're
  done, which is exactly correct however long or short it is.
- The zoom box also shows a one-line reminder of these three shortcuts.

The "Proceed" button lookup is a live by-text search (couldn't find a
fixed id/class for it in the page dump provided) — if it doesn't find
it on your Proceed/Close/Reset screen, send a screenshot of that
button's HTML (right-click → Inspect) and the selector can be pinned
down exactly, same as was done for the CAPTCHA image/input ids.

## Fixed: Category → Caste dropdown chain (this update)
Reported as "Sub Cast wala option kaam nahi karta" — turned out to be
bigger than just Sub-Caste. Checked every file (`content.js`,
`popup.js`, `documentParser.js`): **nothing anywhere** ever listened
for `#castecategory` (वर्ग/Category) changing and populated `#caste`
(जाति/Caste) — it was always stuck on "Please Select" no matter what
category was picked, even though `casteData.js` already has the real
data for it (`casteData[categoryId].options`, matching #castecategory's
own values 1–4). New `casteChainWiring.js` connects the two. Also
hooked into `docProfileLink.js` so opening a saved profile re-populates
`#caste` right away instead of only working on a fresh manual pick.

**Sub-Caste (`#subcaste`) is still unresolved** — there's no sub-caste
data anywhere in this project for any caste to wire it to (checked
`casteData.js`'s structure: each category only holds its list of
castes, nothing nested per-caste for sub-castes). If you have the
actual sub-caste list per caste — e.g. a screenshot of that dropdown
on the real government form the way you've sent for everything else —
send it and it can be added the same way.

**Known remaining gap:** opening a saved profile now correctly shows
that profile's caste OPTIONS, but doesn't reselect the specific caste
value that profile had saved (only the raw form field values are
accessible here, not popup.js's own internal saved-profile record) —
so the dropdown will show "Please Select" again even though the right
list is now there, and it'll need picking again for that profile.

## Fixed: Load a saved profile now reselects the right Caste too
The gap noted right above this — a `<select>.value = X` assignment to
an option that doesn't exist yet is normally silently thrown away by
the browser, with no way to recover it afterwards. Fixed by
intercepting `#caste`'s own `value` property (installed once, on page
load, before any Load click can happen) so whatever value gets
assigned to it — including by popup.js's own Load logic — is
remembered in a data-attribute even when it couldn't apply yet; then
the moment the real option list is built (`populateCaste`), that
remembered value is reapplied for real. Opening a saved profile now
shows both the correct caste list AND the correct caste already
selected.

## Current limitations / things to extend later

- Fields NOT auto-extracted yet (too document-specific/unreliable to
  guess safely): anumandal, prakhand, gram panchayat, ward number,
  village, post office, police station, address type, residence type,
  income sub-splits (govt/business/agriculture/other), document-type
  dropdowns. These still need manual entry — the feature's job is to
  remove the *bulk* of repetitive typing, not 100% of it.
- Caste matching is a simple substring match against the exact option
  text in `casteData.js`. It'll work well when a document literally
  prints the caste name, but won't correct spelling variants.
- OCR accuracy on blurry phone photos will vary — that's exactly why
  the review table exists.

## Testing without the real portal

1. Add the vendor files (see `vendor/README.md`).
2. `chrome://extensions` → Developer mode → "Load unpacked" → select this
   folder.
3. Click the extension icon → "Documents" tab → upload a couple of test
   images/PDFs → "Extract & Fill" → check the review table → "Apply to
   Form" → confirm the Form tab now has the right values.

## Fixed real bugs in your edited captchaAssist.js + new PDF auto-export
You sent your own edited copy of the extension with a rewritten,
more automation-heavy `captchaAssist.js`. Found and fixed:

- **🐛 Actual syntax error — this was crashing the whole file.**
  `controlPanel.style.cssText = [...]` mixed `"border": "value"`
  object-style entries into a plain array of CSS strings — invalid
  JS (`Unexpected token ':'`), which means the entire IIFE threw
  immediately on load and NONE of the CAPTCHA features (refresh
  shortcut, Enter-to-Proceed, auto-submit, focus) were actually
  running at all. This is almost certainly the "error" you noticed.
  Fixed by making both entries plain `"prop:value"` strings like the
  rest.
- **🐛 Refresh button icon was invisible.** `class="fas fa-sync-alt"`
  is Font Awesome 5+ syntax — the real page loads Font Awesome 4.7.0
  (confirmed from its own `<link>` tag), which uses the plain `fa`
  prefix and calls this icon `fa-refresh`. Fixed to `class="fa
  fa-refresh"`.
- **🐛 A stray `.includes("5555")` check** would have wiped out a
  legitimately-typed CAPTCHA answer any time it happened to contain
  that exact digit sequence — removed (kept the `length > 6` stale-
  value cleanup, which makes sense on its own).
- **🐛 Invisible profile-card serial badge** (unrelated file,
  `popup.html`) — `.saathi-serial` had `background: white` AND
  `color: #ffffff` at the same time, so the number was white text on
  a white circle. Changed the text colour to navy so it's readable
  again; kept your white background choice.
- **Kept as you designed it, not reverted:** the floating refresh
  panel (replacing the old zoom-box), and the "auto-click Proceed the
  moment 6 characters are typed" behaviour. Worth knowing: the real
  `<input id="captchaAnswer">` has no `maxlength` in the page source
  you sent earlier, so if this portal ever serves a CAPTCHA longer
  than 6 characters, this would submit an incomplete answer at the
  6th character. The Enter-key trigger (also present) doesn't have
  that risk. Not changed since it's what you built — flagging so it's
  a known, deliberate trade-off rather than a surprise.

**New: `autoExportPdf.js`** — on the final "application submitted"
page (recognised by having both "Export to PDF" and "Close" buttons —
the exact markup wasn't available to pin down an id), automatically
clicks "Export to PDF" once, so the submitted application downloads
immediately without a manual click. Registered in `manifest.json`
alongside the other content scripts. If it doesn't fire on the real
page (or fires somewhere it shouldn't), send a screenshot of that
button's HTML (right-click → Inspect) the same way as for the CAPTCHA
fields, and the selector can be made exact.

## CAPTCHA widgets no longer overlap + auto-dismiss "OK" popup
- **Positioning fix:** the floating "Refresh Captcha" panel
  (`captchaAssist.js`) and the "🟢 Digital Saathi Active" badge
  (`enclosureAutoFill.js`) were both pinned at almost the exact same
  bottom-right spot, stacking on top of each other. Moved the refresh
  panel to sit cleanly above the badge (`bottom:54px` vs the badge's
  `bottom:14px`) and matched its colour/shape (navy pill,
  `border-radius:20px`) so they read as one consistent pair instead of
  two unrelated boxes.
- **New: auto-dismiss the "OK" popup after Proceed.** Scoped so it
  ONLY fires on this same page, after the CAPTCHA was actually seen
  there first (`sawCaptchaHere`) — it will never touch an "OK" button
  anywhere else on the portal. If the popup you're seeing turns out to
  be a native browser `alert()` box (not a styled in-page popup) rather
  than a real button, this can't dismiss it — a content script cannot
  interact with native browser dialogs at all, that would need a
  different approach. Try it and let me know what happens if it
  doesn't disappear.

## Fixed: CAPTCHA box was stealing focus before the form was even filled
Reported as "form fill kiye bina hi captcha box me bhej de raha hai".
The old "focus shield" auto-focused the CAPTCHA input the moment it
was found on the page — which in practice is right after the page
loads, exactly when the operator is about to click into the FIRST
form field, not the CAPTCHA. So typing was landing in the wrong box.

Removed that automatic on-load focus entirely. Focus now only jumps to
the CAPTCHA box when explicitly asked for — pressing **Alt+R** (or
clicking the floating refresh panel) does both: refreshes the image
AND focuses the input, in one press, only when the operator actually
wants it.

## Fixed: the "OK" popup was a NATIVE browser dialog, not in-page
Your screenshot ("serviceonline.bihar.gov.in says...") confirmed it —
this is a real `confirm()` browser dialog, not a styled HTML popup.
A normal content script (isolated world) genuinely cannot click,
close, or read a native alert()/confirm()/prompt() at all; the
`autoDismissOk()` DOM-based attempt in `captchaAssist.js` was never
going to find anything for this one (left in place — harmless, and
might still catch a different, real in-page "OK" popup if one exists
elsewhere in the flow).

**New: `overrideConfirm.js`**, registered as its OWN content-script
entry in `manifest.json` with `"world": "MAIN"` and
`"run_at": "document_start"` — the only way to actually stop a native
dialog is to override `window.confirm` before the page calls it,
which requires running in the page's own JS world (a normal isolated-
world content script has a separate `window` and can't affect the
page's). Installed as early as possible (`document_start`) so it's in
place long before this dialog would ever fire.

**Deliberately narrow, per "is page par, baaki kahi nahi":** only
auto-confirms a `confirm()` whose message contains "नाम की शुद्धता" —
unique to this exact instructions dialog. Any other `confirm()` on the
site, including ones for actually destructive actions, still shows
normally and needs a real click.

## Cleanup: removed genuinely unused files/permissions
Audited every file against what `popup.html` and `manifest.json`
actually reference — every `.js` file turned out to be used
somewhere, except these 3 things, which were removed:
- **`icon.png`** — the root-level icon wasn't referenced by
  `manifest.json` at all (only `icon16/32/48/128.png` are used
  anywhere).
- **`background.js`** — was completely empty (0 bytes) and did
  nothing; nothing in the codebase uses `chrome.runtime.onMessage`,
  `sendMessage`, or `alarms`, so there was no reason for a background
  service worker at all. Removed the file AND the `"background"` key
  from `manifest.json` (Manifest V3 doesn't require one).
- **`"contextMenus"` permission** — requested in `manifest.json` but
  never used anywhere in the code (checked for any
  `chrome.contextMenus` call — none exist). Removed; fewer requested
  permissions also means a less scary install prompt.

`Setup file/` and `vendor/` (pdf.js + Tesseract OCR libraries) are all
genuinely in use and were left alone.

## Certificates → Status Check (merged into the OCR-memory build)
Certificates tab has two sections: 📥 Download | 🔎 Status Check. Status Check uses the same OCR engine
(+ OcrLexicon: fixing a name in Status Check teaches the OCR memory), chained job updates, and the
portal flow: home → "आवेदन की स्थिति देखें" → captcha (you) → docs Yes → names → status saved.
New files: certStatusJob.js, certStatus.js, certStatusFill.js.
