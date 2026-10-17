/*
 * nclFill.js  —  Click & Continue  (NCL Bihar + NCL Central, RO level)
 * ---------------------------------------------------------------------
 * Yeh CONTENT SCRIPT hai. manifest.json me content.js ke BAAD load hona chahiye
 * (content.js ke helper functions: saathiSetText / saathiSetSelect / saathiSetRadio /
 *  saathiWaitFor / saathiFire / saathiToast / transliterate yahan use hote hain).
 *
 * Kaam:
 *  - Page par NCL (Bihar) ya NCL (Central) ka form mile to "autofill" message par
 *    purana fillFormFields() chalne ki jagah yeh wala fill chalta hai.
 *  - Baaki sab forms (Caste / Income / Residence) ke liye purana code ZARA bhi nahi badla.
 *
 * Form detection: element IDs se (Bihar: 63931+42079+41857, Central: 60093+60057+60068).
 *
 * Caste / Sub-caste: NCL page ki caste list ki values Caste-form se alag ho sakti hain,
 * isliye caste NAAM (text) se match hoti hai, value se nahi.
 *
 * NOT auto-done (jaan-boojhkar): "I Agree" declaration, Aadhaar OTP/verify, CAPTCHA,
 * Submit. Parents ki service/zameen/sampatti wali detail sections bhi haath se bharni hain.
 */
(function () {
    "use strict";
    if (window.__saathiNclLoaded) return;
    window.__saathiNclLoaded = true;

    const g = (id) => (id ? document.getElementById(id) : null);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    /* ------------------------------------------------------------------ */
    /* Field maps (portal ke asli element ids, saved HTML se nikale gaye)  */
    /* ------------------------------------------------------------------ */
    const FORMS = {
        NCL_BIHAR: {
            label: "NCL (Bihar)",
            detect: ["63931", "42079", "41857"],
            oldCert: "61752",
            genderName: "41855", salutation: "63931",
            name: "54228", nameHi: "41813", dob: "41857", aadhaar: "56117_txt",
            state: "41827", district: "41828", anumandal: "41829", prakhand: "41831",
            village: "41830", ward: "56372", police: "64990", postoffice: "41853",
            holding: "41948", circle: "41947", residenceTypeName: "85734", pin: "90781",
            gramByType: { 1: "85744", 2: "85745", 3: "85746", 4: "85747" },
            same: "41873_1",
            religion: "41958", category: "42079", caste: "42078", subcaste: "42080",
            occupation: "42349", occupationOther: "54328",
            father: "41821", fatherHi: "41823", husband: "41951", husbandHi: "41952",
            mother: "41822", motherHi: "41824", mobile: "41825", email: "41826",
            incGovt: "60676", incBusiness: "60686", incPension: "85729", incAgri: "85733",
            incTotal: "60677",
            taxRadioName: "60678",
        },
        NCL_CENTRAL: {
            label: "NCL (Central)",
            detect: ["60093", "60057", "60068"],
            certFormat: "93029", commissionary: "93031",
            genderName: "60088", salutation: "60093",
            name: "60091", nameHi: "60094", dob: "60068", aadhaar: "60062_txt",
            state: "60069", district: "60070", anumandal: "60071", prakhand: "60072",
            village: "60097", ward: "60073", police: "91081", postoffice: "60098",
            holding: "60103", circle: "60099", residenceTypeName: "91079", pin: "60100",
            gramByType: { 1: "60059", 2: "91083", 3: "91084", 4: "91085" },
            same: "60101_1",
            religion: "60105", category: "60057", caste: "60106", casteSerial: "60065",
            subcaste: "60107",
            occupation: "60082", occupationOther: "60066",
            father: "60083", fatherHi: "60084", fatherCaste: "91110", fatherCasteSerial: "91111",
            mother: "60085", motherHi: "60086", husband: "60087", husbandHi: "60067",
            mobile: "60063", email: "60058", photo: "91123",
            incGovt: "60336", incBusiness: "60340", incPension: "91100", incAgri: "91103",
            incTotal: "60344",
            itReturnRadioName: "60345", taxRadioName: "91102",
        },
    };

    function nclFormType() {
        for (const k of Object.keys(FORMS)) {
            if (FORMS[k].detect.every((id) => g(id))) return k;
        }
        return null;
    }

    /* ------------------------------------------------------------------ */
    /* Small helpers                                                       */
    /* ------------------------------------------------------------------ */
    const ZW = /[\u200b-\u200d\ufeff]/g;
    const norm = (s) => String(s == null ? "" : s).replace(ZW, "").toLowerCase().replace(/\s+/g, " ").trim();
    // sirf letters/digits/devanagari rakho (space, '/', ',', '(' ... sab hata do)
    const full = (s) => norm(s).replace(/[^a-z0-9\u0900-\u097f]/g, "");
    const partEn = (s) => full(norm(s).split("/")[0]);
    const partHi = (s) => full(norm(s).split("/").slice(1).join("/"));
    const sig = (el) => (el ? Array.from(el.options).map((o) => o.value).join("|") : "");
    const pad2 = (n) => (String(n).length < 2 ? "0" + n : String(n));

    function normDob(s) {
        s = String(s == null ? "" : s).trim();
        if (!s) return "";
        let m;
        if ((m = s.match(/^(\d{4})[-\/. ](\d{1,2})[-\/. ](\d{1,2})$/))) return pad2(m[3]) + "/" + pad2(m[2]) + "/" + m[1];
        if ((m = s.match(/^(\d{1,2})[-\/. ](\d{1,2})[-\/. ](\d{4})$/))) return pad2(m[1]) + "/" + pad2(m[2]) + "/" + m[3];
        if ((m = s.match(/^(\d{2})(\d{2})(\d{4})$/))) return m[1] + "/" + m[2] + "/" + m[3];
        return s;
    }

    // <option> html string se value -> text
    function optText(html, value) {
        try {
            const d = document.createElement("select");
            d.innerHTML = html || "";
            const o = Array.from(d.options).find((x) => x.value === String(value));
            return o ? o.textContent : "";
        } catch (e) { return ""; }
    }

    // Saved profile se caste / sub-caste ka NAAM nikalo
    function wantedCasteTexts(data) {
        let casteText = data.casteText || "";
        let subText = data.subcasteText || "";
        try {
            if (!casteText && data.caste && data.castecategory && typeof casteData !== "undefined" && casteData[data.castecategory]) {
                casteText = optText(casteData[data.castecategory].options, data.caste);
            }
            if (!subText && data.subcaste && data.caste && typeof subCasteData !== "undefined" && subCasteData[data.caste]) {
                subText = optText(subCasteData[data.caste].options, data.subcaste);
            }
        } catch (e) { /* ignore */ }
        return { casteText, subText };
    }

    function findOptionByText(el, wantedText) {
        const opts = Array.from(el.options).filter((o) => o.value !== "");
        if (!opts.length) return null;
        const wFull = full(wantedText), wEn = partEn(wantedText), wHi = partHi(wantedText);
        return (
            opts.find((o) => full(o.text) === wFull) ||
            (wEn && opts.find((o) => partEn(o.text) === wEn && (!wHi || partHi(o.text) === wHi))) ||
            (wEn && opts.find((o) => partEn(o.text) === wEn)) ||
            (wHi && opts.find((o) => partHi(o.text) === wHi)) ||
            // sirf Hindi YA sirf English naam likha ho to bhi match
            opts.find((o) => partEn(o.text) === wFull || partHi(o.text) === wFull) ||
            null
        );
    }

    // select me TEXT se option chuno (list AJAX se aati hai to intezaar)
    async function pickByText(rep, id, wantedText, label, timeoutMs) {
        if (!wantedText) return false;
        const el = g(id);
        if (!el) { rep.missing.push(label); return false; }
        const hit = await saathiWaitFor(() => findOptionByText(el, wantedText), timeoutMs || 6000, 120);
        if (!hit) { rep.failed.push(label + " ('" + wantedText + "' page ki list me nahi mila)"); return false; }
        try {
            el.value = hit.value;
            saathiFire(el, ["input", "change"]);
            rep.ok++;
            return true;
        } catch (e) { rep.failed.push(label); return false; }
    }

    function findSameAsAbove(cfg) {
        const byId = cfg.same && g(cfg.same);
        if (byId) return byId;
        const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        return boxes.find((b) => {
            const lbl = (b.id && document.querySelector('label[for="' + b.id + '"]')) || b.closest("label") || b.parentElement;
            const t = lbl ? lbl.textContent : "";
            return /ऊपर\s*जैसा/.test(t) || /same\s*as\s*above/i.test(t);
        }) || null;
    }

    function salutationFor(data) {
        const s = data.ncl_salutation;
        if (s && s !== "auto") return String(s);
        if (String(data.gender) === "1") return "1";                      // श्री
        if (String(data.gender) === "2") return data.husbandname ? "2" : "3"; // श्रीमती / सुश्री
        return "4";
    }

    // Central: pita ki jaati ka serial khaali ho to aavedak wali jaati ka serial copy karo
    async function copyFatherSerial(cfg) {
        await sleep(700);
        const fs = g(cfg.fatherCasteSerial), cs = g(cfg.casteSerial);
        if (fs && !fs.value && cs && cs.value) { fs.value = cs.value; saathiFire(fs, ["input", "change"]); }
    }

    function digits(s) { return String(s == null ? "" : s).replace(/\D+/g, ""); }

    /* ------------------------------------------------------------------ */
    /* "संलग्नक चुनें" checkboxes (Form-XIII / IV / XVI ...)                  */
    /* ------------------------------------------------------------------ */
    function checkboxLabelText(cb) {
        const lbl = (cb.id && document.querySelector('label[for="' + cb.id + '"]')) || cb.closest("label");
        if (lbl) return lbl.textContent.trim();
        let t = "";
        let n = cb.nextSibling;                      // plain text right after the box, up to the next box / line break
        while (n && t.length < 160) {
            if (n.nodeType === 3) t += n.textContent;
            else if (n.nodeType === 1 && !/^(INPUT|BR|LABEL)$/.test(n.tagName)) t += n.textContent;
            else break;
            n = n.nextSibling;
        }
        t = t.trim();
        if (t) return t;
        return cb.parentElement ? cb.parentElement.textContent.trim().slice(0, 160) : "";
    }

    // Ticks the attachment checkboxes of the documents this customer has: the ones ticked in the profile's NCL
    // checklist, or - if nothing is ticked there - every NCL document that is saved in the vault.
    async function tickAttachments(rep, data) {
        const EM = window.SaathiEnclosureMatch;
        if (!EM) return;
        const items = [];
        document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            const text = checkboxLabelText(cb);
            if (!text || /ऊपर\s*जैसा|same\s*as\s*above|i\s*agree/i.test(text)) return;
            const form = EM.detectRomanForm(text);
            const type = form && EM.FORM_TYPES[form];
            if (type) items.push({ cb, type, form });
        });
        if (!items.length) return;

        const ticked = new Set(Object.keys(data || {}).filter((k) => /^doc_ncl_/.test(k) && (data[k] === true || data[k] === "true" || data[k] === "1")).map((k) => k.slice(4)));
        let want = ticked;
        if (!want.size) {
            try { if (typeof DocStore !== "undefined") want = new Set(await DocStore.listDocTypes()); } catch (e) { /* vault unreadable */ }
        }
        const done = [];
        for (const it of items) {
            if (it.cb.disabled || !want.has(it.type)) continue;      // locked boxes (e.g. the mandatory Form-VIII) stay as the portal set them
            if (!it.cb.checked) {
                it.cb.click();                                       // a real click, so the portal's own handler runs
                if (!it.cb.checked) { it.cb.checked = true; saathiFire(it.cb, ["input", "change"]); }
                rep.ok++;
                done.push("Form-" + it.form);
                await sleep(180);
            }
        }
        if (done.length) rep.notes.push("Attachment tick kiye: " + done.join(", "));
    }

    /* ------------------------------------------------------------------ */
    /* Main fill                                                           */
    /* ------------------------------------------------------------------ */
    let running = false;

    async function nclFill(type, data) {
        if (running) { saathiToast("Fill pehle se chal raha hai, thoda ruko…", "info"); return; }
        running = true;
        const cfg = FORMS[type];
        const rep = saathiNewReport();
        saathiToast("Page ko haath mat lagayein.", "info", 90000, { title: cfg.label + " bhar raha hai…", spinner: true });

        try {
            // ---- Hindi naam (parallel, fail-safe) ----
            const hiPromise = Promise.all([
                transliterate(data.name), transliterate(data.fathername),
                transliterate(data.mothername), transliterate(data.husbandname),
            ]);

            // ---- Certificate format / old certificate ----
            if (cfg.certFormat) await saathiSetSelect(rep, cfg.certFormat, data.ncl_certFormat || "1", "Certificate format", { timeout: 2500 });
            if (cfg.oldCert) await saathiSetSelect(rep, cfg.oldCert, data.ncl_oldCert || "1", "Old certificate (haan/nahi)", { timeout: 2500 });

            // ---- Gender + Salutation ----
            saathiSetRadio(rep, cfg.genderName, data.gender, "Gender");
            await saathiSetSelect(rep, cfg.salutation, salutationFor(data), "Salutation", { timeout: 2500 });

            // ---- Names ----
            saathiSetText(rep, cfg.name, data.name, "Name");
            saathiSetText(rep, cfg.father, data.fathername, "Father name");
            saathiSetText(rep, cfg.mother, data.mothername, "Mother name");
            saathiSetText(rep, cfg.husband, data.husbandname, "Husband name");
            const hi = await hiPromise;
            if (hi[0]) saathiSetText(rep, cfg.nameHi, hi[0], "Name (Hindi)");
            if (hi[1]) saathiSetText(rep, cfg.fatherHi, hi[1], "Father name (Hindi)");
            if (hi[2]) saathiSetText(rep, cfg.motherHi, hi[2], "Mother name (Hindi)");
            if (hi[3]) saathiSetText(rep, cfg.husbandHi, hi[3], "Husband name (Hindi)");
            if (!hi[0] && data.name) rep.failed.push("Hindi naam (internet/translate nahi chala — haath se likhein)");

            // ---- DOB, Aadhaar (sirf number; verify/OTP trigger nahi karte) ----
            const dob = normDob(data.ncl_dob);
            if (dob) saathiSetText(rep, cfg.dob, dob, "Date of Birth (DD/MM/YYYY)", { events: ["input", "change"] });
            else rep.missing.push("Date of Birth (popup me bharein)");
            const aad = digits(data.ncl_aadhaar);
            if (aad) saathiSetText(rep, cfg.aadhaar, aad, "Aadhaar", { events: ["input"] });

            // ---- Contact ----
            saathiSetText(rep, cfg.mobile, data.mobile, "Mobile");
            saathiSetText(rep, cfg.email, data.email, "Email");

            // ---- Address text fields ----
            saathiSetText(rep, cfg.pin, data.pin, "PIN");
            saathiSetText(rep, cfg.postoffice, data.postoffice, "Post office");
            saathiSetText(rep, cfg.village, data.village, "Village / Mohalla");
            saathiSetText(rep, cfg.ward, data.wardNo, "Ward no.");
            saathiSetText(rep, cfg.holding, data.ncl_holding, "Holding no.");
            saathiSetText(rep, cfg.circle, data.ncl_circle, "Circle no.");
            saathiSetRadio(rep, cfg.residenceTypeName, data.residenceType, "Residence type");

            // ---- Location chain: State -> District -> Anumandal -> Prakhand -> Gram ----
            if (data.state) {
                await saathiSetSelect(rep, cfg.state, data.state, "State", { timeout: 4000 });
                let policeJob = Promise.resolve();
                if (data.district) {
                    const okD = await saathiSetSelect(rep, cfg.district, data.district, "District", { timeout: 6000 });
                    if (okD && data.policeStation) {
                        policeJob = saathiSetSelect(rep, cfg.police, data.policeStation, "Police Station", { timeout: 8000 });
                    }
                    if (okD && data.anumandal) {
                        const okA = await saathiSetSelect(rep, cfg.anumandal, data.anumandal, "Anumandal", { timeout: 6000 });
                        if (okA && data.prakhand) {
                            const okP = await saathiSetSelect(rep, cfg.prakhand, data.prakhand, "Prakhand", { timeout: 6000 });
                            if (okP) {
                                const rr = document.querySelector('input[name="' + cfg.residenceTypeName + '"]:checked');
                                if (rr) saathiFire(rr, ["change"]);
                                const pk = g(cfg.prakhand);
                                if (pk) saathiFire(pk, ["blur"]);
                                if (data.gram) {
                                    const gramId = cfg.gramByType[String(data.residenceType || "1")];
                                    const gramEl = await saathiWaitFor(() => {
                                        const e = gramId && g(gramId);
                                        return e && Array.from(e.options).some((o) => o.value === String(data.gram)) ? e : null;
                                    }, 8000, 150);
                                    if (gramEl) await saathiSetSelect(rep, gramEl, data.gram, "Gram / Nagar nikay", { timeout: 1000 });
                                    else rep.failed.push("Gram / Nagar nikay (list nahi aayi)");
                                }
                            }
                        }
                    }
                }
                await policeJob;
            }

            // ---- "ऊपर जैसा / Same as above" (address bhar jaane ke BAAD) ----
            await sleep(1200);
            const same = findSameAsAbove(cfg);
            if (!same) rep.missing.push("Same as above checkbox");
            else {
                try {
                    if (!same.checked) same.click();
                    else same.dispatchEvent(new Event("click", { bubbles: true }));
                    same.checked = true;
                    saathiFire(same, ["change"]);
                    rep.ok++;
                } catch (e) { rep.failed.push("Same as above checkbox"); }
            }

            // ---- Religion ----
            if (data.ncl_religion) saathiSetText(rep, cfg.religion, data.ncl_religion, "Religion");
            else rep.missing.push("Religion (popup me bharein)");

            // ---- Category -> Caste -> Sub-caste (NAAM se match) ----
            const ct = wantedCasteTexts(data);
            const catEl = g(cfg.category);
            const casteEl = g(cfg.caste);
            const centralVal = type === "NCL_CENTRAL" ? String(data.ncl_centralCaste || "") : "";
            const fatherSame = data.ncl_fatherSameCaste !== false && data.ncl_fatherSameCaste !== "0";
            if (centralVal && catEl && casteEl) {
                // Central: popup ki "केंद्रीय OBC सूची" se chuni jaati — value seedhi match hoti hai
                await saathiSetSelect(rep, catEl, "1", "Category (OBC)", { timeout: 3000 });
                await sleep(300);
                const subSel = g(cfg.subcaste);
                const subBefore = sig(subSel);
                const okCaste = await saathiSetSelect(rep, cfg.caste, centralVal, "Caste (Central list)", { timeout: 6000 });
                if (okCaste && subSel) {
                    // Sub-caste list jaati chunne ke baad page khud laata hai
                    const wantSub = String(data.ncl_centralSubCaste || "").trim();
                    const listed = await saathiWaitFor(() => (sig(subSel) !== subBefore && subSel.options.length > 1) || null, wantSub ? 5000 : 2500, 150);
                    if (wantSub) await pickByText(rep, cfg.subcaste, wantSub, "Sub-caste (Central)", 4000);
                    else if (listed) rep.missing.push("Sub-caste (is jaati ki sub-caste list hai — popup me chunein)");
                }
                if (okCaste && cfg.fatherCaste && fatherSame) {
                    const okF = await saathiSetSelect(rep, cfg.fatherCaste, centralVal, "Father's caste", { timeout: 4000 });
                    if (okF && cfg.fatherCasteSerial) await copyFatherSerial(cfg);
                }
            } else if (data.castecategory && catEl && casteEl) {
                // Central me sirf ek category hai (1 = अन्य पिछड़ा वर्ग); Bihar me 1 / 2
                const catVal = type === "NCL_CENTRAL" ? "1" : String(data.castecategory);
                if (type === "NCL_BIHAR" && catVal !== "1" && catVal !== "2") {
                    rep.failed.push("Category (NCL Bihar me sirf अत्यंत पिछड़ा / पिछड़ा वर्ग hote hain)");
                } else {
                    const before = sig(casteEl);
                    const okC = await saathiSetSelect(rep, catEl, catVal, "Category", { timeout: 3000 });
                    if (okC && ct.casteText) {
                        if (catEl.value !== "" && before.length > 0 && sig(casteEl) === before && casteEl.options.length > 1) {
                            await sleep(300); // category pehle se wahi thi — list wahi hai
                        } else {
                            await saathiWaitFor(() => sig(casteEl) !== before && casteEl.options.length > 1, 5000, 120);
                        }
                        const subBefore = sig(g(cfg.subcaste));
                        const okCaste = await pickByText(rep, cfg.caste, ct.casteText, "Caste", 6000);
                        if (okCaste && ct.subText) {
                            await saathiWaitFor(() => sig(g(cfg.subcaste)) !== subBefore, 4000, 120);
                            await pickByText(rep, cfg.subcaste, ct.subText, "Sub-caste", 4000);
                        }
                        // Central: pita ki jaati (default: aavedak wali hi)
                        if (okCaste && cfg.fatherCaste && fatherSame) {
                            const okF = await pickByText(rep, cfg.fatherCaste, ct.casteText, "Father's caste", 4000);
                            if (okF && cfg.fatherCasteSerial) await copyFatherSerial(cfg);
                        }
                    }
                }
            } else if (!data.castecategory) {
                rep.missing.push(type === "NCL_CENTRAL" ? "Jaati (popup me \"[Central] जाति\" chunein)" : "Category / Caste (profile me chunein)");
            }

            // ---- Occupation ----
            const occ = String(data.ncl_occupation || data.casteprofession || data.profession || "");
            if (occ) {
                const okO = await saathiSetSelect(rep, cfg.occupation, occ, "Occupation", { timeout: 2500 });
                if (okO && occ === "7") {
                    await sleep(300);
                    if (data.ncl_occupationOther) saathiSetText(rep, cfg.occupationOther, data.ncl_occupationOther, "Occupation (specify)");
                    else rep.missing.push("Occupation 'Others' — specify likhein");
                }
            } else rep.missing.push("Occupation (popup me chunein)");

            // ---- Income (Total page khud calculate karta hai) ----
            [[cfg.incGovt, data.incomefromgovt, "Income: Naukri"], [cfg.incBusiness, data.incomefrombusiness, "Income: Vyavsay"],
             [cfg.incAgri, data.incomefromagriculture, "Income: Krishi"], [cfg.incPension, data.ncl_pension, "Income: Pension"]]
                .forEach(([id, val, lbl]) => {
                    if (val !== undefined && val !== null && String(val) !== "" && saathiSetText(rep, id, val, lbl)) {
                        const el = g(id);
                        if (el) saathiFire(el, ["keyup", "blur"]);
                    }
                });
            if (data.incomefromothers) rep.notes.push("'Other income' NCL form me nahi hota — pension me daalna ho to popup ka Pension field use karein");

            // ---- Tax / return radios ----
            if (cfg.taxRadioName) saathiSetRadio(rep, cfg.taxRadioName, data.ncl_propTax || data.ncl_taxPaid, "Tax / property tax (haan/nahi)");
            if (cfg.itReturnRadioName) saathiSetRadio(rep, cfg.itReturnRadioName, data.ncl_itReturn, "Income-tax return (haan/nahi)");

            // ---- Central-only ----
            if (cfg.commissionary) {
                if (data.ncl_commissionary) await saathiSetSelect(rep, cfg.commissionary, data.ncl_commissionary, "Commissionary (Pramandal)", { timeout: 2500 });
                else rep.missing.push("Commissionary / Pramandal (popup me chunein)");
            }
            try { await tickAttachments(rep, data); } catch (e) { console.warn("[NCL] attachment tick failed", e); }
            if (cfg.photo) await saathiAttachImage(rep, cfg.photo, data.image);
        } catch (err) {
            console.error("[Click & Continue][NCL] fill error:", err);
            rep.failed.push("Unexpected error: " + (err && err.message));
        } finally {
            running = false;
        }

        saathiReportToast(cfg.label, rep);
        if (rep.missing.length || rep.failed.length) console.warn("[Click & Continue][NCL] fill report:", rep);
    }

    /* ------------------------------------------------------------------ */
    /* content.js ke fillFormFields ko wrap karo: NCL page par hum, baaki  */
    /* sab par purana code.                                                */
    /* ------------------------------------------------------------------ */
    const origFill = typeof window.fillFormFields === "function" ? window.fillFormFields : null;
    window.fillFormFields = async function (data) {
        const t = nclFormType();
        if (t) return nclFill(t, data || {});
        return origFill ? origFill.apply(this, arguments) : undefined;
    };

    /* ------------------------------------------------------------------ */
    /* Sub-caste list "seekho": Central page jaati chunne ke baad sub-caste */
    /* list laata hai. Wo list storage me jama hoti hai (jaati-value ke     */
    /* hisaab se) taaki popup me dropdown-suggestions dikh sakein.          */
    /* ------------------------------------------------------------------ */
    function startSubCasteLearning() {
        try {
            if (!(window.chrome && chrome.storage && chrome.storage.local)) return;
            if (nclFormType() !== "NCL_CENTRAL") return;
            const cfg = FORMS.NCL_CENTRAL;
            const sub = g(cfg.subcaste), caste = g(cfg.caste);
            if (!sub || !caste || typeof MutationObserver === "undefined") return;
            let timer = null;
            const save = () => {
                const cv = caste.value;
                const opts = Array.from(sub.options).filter((o) => o.value !== "");
                if (!cv || !opts.length) return;
                const list = opts.map((o) => [o.value, String(o.text).replace(/\s+/g, " ").trim()]);
                chrome.storage.local.get("nclCentralSubCastes", (r) => {
                    const all = (r && r.nclCentralSubCastes) || {};
                    if (JSON.stringify(all[cv]) === JSON.stringify(list)) return;
                    all[cv] = list;
                    chrome.storage.local.set({ nclCentralSubCastes: all });
                });
            };
            new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(save, 400); }).observe(sub, { childList: true });
        } catch (e) { /* ignore */ }
    }
    startSubCasteLearning();

    /* "Sab sub-caste ek baar seekho": Central page par ek button. Saari jaatiyon ko ek-ek karke
       chunta hai, har jaati ki sub-caste list (page se) jama karta hai. ~3-4 minute lagte hain.
       Khaali form par chalayein (jaati field badalti hai). Dobara click = ruk jao. */
    let learning = false, stopLearning = false;

    async function learnAllSubCastes() {
        if (learning) { stopLearning = true; return; }
        const cfg = FORMS.NCL_CENTRAL;
        const caste = g(cfg.caste), sub = g(cfg.subcaste), cat = g(cfg.category);
        if (!caste || !sub) return;
        if (!window.confirm("Saari jaatiyon ki sub-caste list seekhne me ~3-4 minute lagenge.\nIs dauran jaati wali field badlegi — isliye khaali form par chalayein aur tab tak page na chhuyein.\n\nShuru karein?")) return;
        learning = true; stopLearning = false;
        const btn = g("saathiLearnBtn");
        const setBtn = (t) => { if (btn) btn.textContent = t; };
        try {
            if (cat && cat.value !== "1") { cat.value = "1"; saathiFire(cat, ["input", "change"]); await sleep(500); }
            const values = Array.from(caste.options).filter((o) => o.value !== "").map((o) => o.value);
            const store = await new Promise((res) => chrome.storage.local.get("nclCentralSubCastes", (r) => res((r && r.nclCentralSubCastes) || {})));
            let withSub = 0;
            for (let i = 0; i < values.length; i++) {
                if (stopLearning) break;
                const v = values[i];
                setBtn("⏳ " + (i + 1) + "/" + values.length + " (rokne ke liye click)");
                sub.innerHTML = '<option value="">Please Select</option>';   // purani list hatao
                const before = sig(sub);
                caste.value = v;
                saathiFire(caste, ["input", "change"]);
                await saathiWaitFor(() => (sig(sub) !== before ? true : null), 1800, 100);
                const opts = Array.from(sub.options).filter((o) => o.value !== "");
                store[v] = opts.map((o) => [o.value, String(o.text).replace(/\s+/g, " ").trim()]);
                if (opts.length) withSub++;
                if ((i + 1) % 10 === 0) chrome.storage.local.set({ nclCentralSubCastes: store });
            }
            chrome.storage.local.set({ nclCentralSubCastes: store });
            caste.value = ""; saathiFire(caste, ["input", "change"]);
            saathiToast((stopLearning ? "Ruk gaya. " : "✓ Ho gaya. ") + Object.keys(store).length + " jaatiyan check hui, " + withSub + " me sub-caste list mili. Popup me ab dropdown aayega.", stopLearning ? "warn" : "ok", 12000);
        } catch (e) {
            console.error("[Click & Continue][NCL] learn error", e);
            saathiToast("Sub-caste seekhne me error: " + (e && e.message), "warn", 10000);
        } finally {
            learning = false; stopLearning = false; setBtn("📚 Sab sub-caste seekho");
        }
    }

    function addLearnButton() {
        try {
            if (nclFormType() !== "NCL_CENTRAL" || g("saathiLearnBtn") || !document.body) return;
            const b = document.createElement("button");
            b.id = "saathiLearnBtn"; b.type = "button";
            b.textContent = "📚 Sab sub-caste seekho";
            b.title = "Central NCL ki saari jaatiyon ki sub-caste list extension me save karta hai (ek baar)";
            b.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483000;padding:8px 12px;border:none;border-radius:8px;background:#2f6fb8;color:#fff;font:700 12px Arial;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)";
            b.addEventListener("click", learnAllSubCastes);
            document.body.appendChild(b);
        } catch (e) { /* ignore */ }
    }
    // The "📚 Sab sub-caste seekho" button was removed from the page (it sat on top of the profile pill).
    // The feature still works from the console:  __saathiLearnAll()
    window.__saathiLearnAll = learnAllSubCastes;   // debug / test

    // Debug helper: console me  __saathiNclDetect()  -> kaun sa form pehchana
    window.__saathiNclDetect = nclFormType;
})();
