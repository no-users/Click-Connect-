# OCR Upgrade — kya badla

Naye files: `ocrPreprocess.js`, `ocrUpgrade.css`
Badli hui files: `ocrEngine.js`, `documentParser.js`, `docsTab.js`, `popup.html` (sirf 1 script tag, 1 css link, hint text)
Baaki sab file bilkul waisi hi hai.

## Features
- Ek saath 10 PDF/image (duplicate, 25MB+ aur galat type reject)
- Parallel OCR (worker pool), har file ka progress bar, Cancel, per-file Retry (↻)
- PDF ka text layer seedha padhta hai (instant); sirf scanned pages par OCR
- Password-protected e-Aadhaar PDF (password: naam ke pehle 4 CAPITAL + janm saal, jaise RAHU1995)
- Image clean-up: contrast, tilt seedha, shadow hatana, size theek karna
- Sideways / ulti photo auto-rotate
- Dobara Extract dabane par sirf nayi/fail/rotate hui files process hoti hain

## Bugs jo theek hue
- District dropdown me value kabhi set nahi hoti thi (options numeric code hain) -> ab text se match + State/District cascade
- Income certificate me "Aadhaar" word aane par type aadhaar ban jata tha -> ab scoring
- Naam "Rahul Kumar Father Name" jaisa lamba capture hota tha -> ab next label par ruk jata hai
- D/O ko mother maan liya jata tha -> ab father
- Hindi (Devanagari) ke saath regex \b kaam nahi karta tha, Hindi digits ०-९ ignore hote the
- "गया" (kiya gaya) ko Gaya district samajh liya jata tha
- PIN me income amount pakad lena
- Naye fields: village, post office, police station, ward, plus info-only: DOB, Aadhaar no (Verhoeff check), EPIC no

---

# Certificates tab (naya) — receipt se certificate download

Naye files: `translit.js`, `certJob.js`, `certDownload.js`, `certDownloadFill.js`
Badli: `documentParser.js` (extractReceipts), `ocrEngine.js` (pageTexts), `background.js` (download rename + done-mark), `manifest.json` (1 content-script entry), `popup.html` (3 script tags)

Flow:
1. Certificates tab me "Download Certificate" page ka link save karein (ya us page par jaakar "Current tab ka link lo").
2. Max 10 receipts (PDF/screenshot/photo) upload -> "Receipts padho". Har receipt se Ref No. + English naam (Hindi naam auto English) -> alag-alag rows. Jinme Ref No. nahi mila wo "alag" box me aate hain, wahan haath se daal sakte hain.
3. Start -> page khulta hai, Service=RTPS, Ref No., Name fill, cursor Captcha me.
4. Aap captcha type karein -> Download khud dabta hai. File `RTPS_Certificates/<Naam>_<RefNo>.pdf` se save, phir agla record fill + captcha refresh.
Captcha ko extension kabhi padhta/solve nahi karta.

## Update: swcs.bihar.gov.in + "आवेदिका" fix
- Download Certificate page: https://swcs.bihar.gov.in/RtpsReportView/certificate_download.jsp (default link, manifest + permissions me add)
- Receipt me "आवेदिका का नाम : रेशमी किरण (Reshmi Kiran)" ab padha jata hai: brackets wala English naam use hota hai, nahi ho to Hindi -> English
- आवेदक / आवेदिका / आवेदनकर्ता / Applicant Name — sab labels support

## Update: Certificates tab v2
- Naam detection: 4 tareeke (applicant label tolerant to OCR galtiyan / "… का नाम" / "Hindi (English)" line / English Name:), aur nahi mile to 💡 suggestion chips (ek click me naam)
- Certificate type receipt se (आय/जाति/निवास/EWS/NCL/जन्म/मृत्यु/विवाह) -> file ka code
- File naming: default `{PFX}{YY}-{NAME}.pdf`  ->  income = IN26-Naam.pdf, caste = CA26-Naam.pdf (year = Ref No. ka saal)
  Format, folder aur har type ka code Certificates tab ke "File ka naam kaisa ho?" me badal sakte hain (live preview)
- Naya UI: steps, stats, filters, record cards, sticky Start bar, CSV export, Fail wale dobara, portal panel me progress bar + Alt+N / Alt+S

## Update: poore app ka naya look + naye features
Naye files: appTheme.css, appearance.js, appearanceBoot.js, cmdk.js
- Look: tab bar icons wala pill design, dark theme ke gaye hue tab labels theek, nikhre inputs/buttons/cards/scrollbar, saare tabs ek jaisa
- 🎨 button: 5 rang (Ocean, Emerald, Violet, Sunset, Rose) + Aaram se / Compact layout; saved rehta hai
- ⌘ button / Ctrl+K (ya "/"): quick actions palette — "cert", "dark", "naya", "ocr", "rang" likh kar Enter
- Certificates: receipt ki "प्रस्तावित तिथि" se ready-date chip (kitne din baaki / aaj / ready), 🟢 Ready filter, "↕ Ready pehle" sort
- Certificates: receipt ka mobile padh kar 💬 WhatsApp "certificate ready" message
- Download hone par beep (2 beep = sab ho gaya, 🔔 Awaaz se band), extension icon par baaki certificates ka badge

## Update: Doc Vault tab (documents ka alag tab)
Naye files: extraTabs.js, docVault.js, docVault.css
Badli: docStore.js (customer registry), docProfileLink.js, enclosureDocsPanel.js, miniProfileSwitcher.js, shortcutAutoLoad.js, certDownload.js, appTheme.css, cmdk.js, popup.html
- Same mobile number par alag-alag log: documents ab mobile se nahi, har customer ki apni id se store hote hain. Profile cards / form / on-page switcher naam se alag pehchante hain. Purane docs (mobile-key) pehle customer ko mil jate hain.
- Har document ke saath apna Naam aur Number (Aadhaar checksum, EPIC, PAN, Passport format check)
- Smart add: 10 files ek saath, OCR se type + naam + number, photo -> PDF, 2MB se badi -> chhoti
- Customers list (search, edit, delete, note), "same number xN" chip, saved profiles se jodo
- Documents checklist (पहचान/जाति/निवास/आय), view / download / replace / doosre customer ko copy / delete + undo, ZIP (details.txt ke saath)
- Form tab ka bada uploader ek chhoti bar me badal gaya (purana code hata nahi, sirf chhupa hai)

## Update: OCR engine v3 (accuracy engine)
Naye files: ocrLexicon.js, ocrMemoryPanel.js | Badli: ocrEngine.js, ocrPreprocess.js, documentParser.js, translit.js, docsTab.js, certDownload.js, popup.html
Pipeline: PREPARE -> READ -> FUSE -> REPAIR -> FILTER -> CORRECT -> REPORT
- Prepare: dark background ulta, desk/border crop, tilt seedha, table lines hatana, denoise+sharpen
- Read: alag-alag clean-up par kai pass (auto / block / sparse); table-heavy page par line-free + original dono padhkar milana
- Fuse: har ROW me jis pass ne sabse acha padha wahi chuna (do-column label|value forms bhi ek row me)
- Repair: kam-confidence row ko crop + bada karke alag Hindi-only / English-only / block model se dobara padhna
- Blur rescue: Richardson-Lucy deblur (blur model OCR se chunna)
- Filter: kam-confidence junk words / symbol soup / garbage rows hatana (raw text alag se milta hai)
- Correct: label shabd lexicon se (sirf jab engine ko khud shak ho), Aadhaar number checksum se galat digit wali row dobara
- Learn: operator ka name-correction yaad rakhna (Documents tab -> "OCR ne kya seekha")
- Report: dhundhli / kam resolution / "padhne layak nahi" warning
Benchmark (18 kharab images): average error 18.6% -> 7.6%, junk lines 25 -> 4 (table lines 76.6% -> 0.6%, phone-desk photo 8% -> 0%)

## Update: OCR engine v3 (accuracy engine)
Naye files: ocrLexicon.js, ocrMemoryPanel.js | Badli: ocrEngine.js, ocrPreprocess.js, translit.js, certJob.js, certDownload.js, docsTab.js
- Page tayyari: dark background ulta, desk/border crop, tilt seedha, table/ruled lines hatana, denoise + sharpen
- Padhna: alag-alag clean-up par kai pass (auto / block / sparse), phir har ROW me sabse acha reading chunna
- Marammat: kam bharose wali line ko crop + bada karke Hindi-only / English-only / block model se dobara padhna
- Junk filter: confetti words, symbol soup, ek-akshar kachra hata deta hai; kharab page par kam-bharose wali lines dikhata hi nahi + saaf warning
- Label dictionary: "आवेदिका क नाम" jaise bigde labels asli shabd par (sirf jab engine khud unsure ho)
- Blur rescue: defocus / hilne wali blur ka andaza lagakar deblur (sirf jab confidence kam ho)
- Seekhna: naam ki chhoti spelling theek karne par yaad rakhta hai (OCR galti + Hindi->English). Documents tab -> "🧠 OCR ne kya seekha"
- Quality warnings: dhundhli image, kam resolution, kitni lines saaf nahi padhi
- Raw text: filter se pehle ka poora text bhi dekh sakte hain
- Bug fix: Certificates me receipts ek saath save hote waqt records kabhi-kabhi gum ho jate the (race) — ab theek
