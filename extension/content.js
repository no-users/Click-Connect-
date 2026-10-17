/*
 * content.js  —  Click & Continue (v3.0.0)
 * ------------------------------------------------------------------
 * Yeh CONTENT SCRIPT hai (RTPS page ke andar chalta hai). popup.js se
 * aaye messages ("getDropdownValues", "trigger*Change", "autofill")
 * sunta hai aur portal ka form bharta hai.
 *
 * Is version me kya theek kiya gaya (purane version ke bugs):
 *  1. Dropdown ki value ab TAB set hoti hai jab uske options page par
 *     aa chuke hote hain (District -> Anumandal -> Prakhand -> Gram,
 *     Category -> Caste -> Sub-caste, State -> Police Station). Pehle
 *     value turant set ho jati thi aur options na hone se silently
 *     ghayab ho jati thi.
 *  2. Ek field/radio missing ho to poora fill band nahi hota (pehle
 *     radios[0].dispatchEvent TypeError se baaki form adhura rehta tha).
 *  3. Sub-caste wale purane code me Category / Caste / Sub-caste ki IDs
 *     ULTI thi (17188 ko caste, 17191 ko sub-caste maan liya tha) — isse
 *     Category dropdown corrupt ho sakta tha. Hata diya; ab sahi chain.
 *  4. Khaali naam (husband/mother) ko translate karke "अपरिभाषित" jaisa
 *     kachra Hindi field me nahi likha jata; translate fail ho to fill
 *     nahi rukta.
 *  5. Gram Panchayat ab residence type (Gram/Nagar Nigam/Parishad/
 *     Panchayat) ke hisaab se sahi dropdown me jata hai.
 *  6. formType() ab element IDs se pehchanta hai (table ke header par
 *     nirbhar nahi, jo kai pages par crash karta tha).
 *  7. Fill ke baad page par chhota summary toast: kya bhara, kya nahi.
 * ------------------------------------------------------------------
 */

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
const SAATHI_SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const $id = (id) => (id ? document.getElementById(id) : null);

function saathiFire(el, types) {
    (types || ["input", "change"]).forEach((t) => {
        try { el.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) { /* ignore */ }
    });
}

// Poll until fn() returns truthy (or timeout). Returns the truthy value / null.
async function saathiWaitFor(fn, timeout, interval) {
    const t0 = Date.now();
    const step = interval || 100;
    const max = typeof timeout === "number" ? timeout : 6000;
    for (;;) {
        let v = null;
        try { v = fn(); } catch (e) { v = null; }
        if (v) return v;
        if (Date.now() - t0 >= max) return null;
        await SAATHI_SLEEP(step);
    }
}

function saathiHasDevanagari(t) { return /[\u0900-\u097F]/.test(String(t || "")); }

// English -> Hindi (Google Translate unofficial endpoint). Kabhi throw nahi karta.
async function transliterate(text) {
    const clean = String(text == null ? "" : text).trim();
    if (!clean) return "";
    if (saathiHasDevanagari(clean)) return clean;
    try {
        const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), 5000) : null;
        const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&q=" +
            encodeURIComponent(clean);
        const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
        if (timer) clearTimeout(timer);
        const json = await res.json();
        const out = json && json[0] && json[0][0] && json[0][0][0];
        return typeof out === "string" ? out : "";
    } catch (e) {
        console.warn("[Click & Continue] transliterate failed for:", clean, e && e.message);
        return "";
    }
}

// <select> ke options ko [{value, text}] list me badalta hai
function getDropdownValues(id) {
    const el = $id(id);
    if (el && el.options) {
        return Array.from(el.options).map((opt) => ({ value: opt.value, text: opt.text }));
    }
    return [];
}

// ids me se pehla jo page par maujood ho
function saathiFirstEl(ids) {
    for (const id of ids) { const el = $id(id); if (el) return el; }
    return null;
}
// ids me se pehle maujood dropdown ki list (purana `a() || b()` galat tha: [] truthy hota hai)
function saathiFirstDropdown(ids) {
    const el = saathiFirstEl(ids);
    return el ? getDropdownValues(el.id) : [];
}

/* ------------------------------------------------------------------ */
/* Form kaun sa hai: "Caste" / "Income" / "Residence"                  */
/* ------------------------------------------------------------------ */
function formType() {
    try {
        if ($id("17176") || $id("17191") || $id("41552")) return "Caste";
        if ($id("17154") || $id("17168")) return "Income";
        if ($id("78250") || $id("17287")) return "Residence";
    } catch (e) { /* fall through */ }
    try {
        const headerText = document.getElementsByTagName("table")[0].tBodies[0].rows[0].cells[1].textContent;
        if (headerText.includes("Cast")) return "Caste";
        if (headerText.includes("Income")) return "Income";
    } catch (e) { /* ignore */ }
    return "Residence";
}

/* ------------------------------------------------------------------ */
/* Per-form field map (portal ke asli element ids)                     */
/* ------------------------------------------------------------------ */
const SAATHI_FORMS = {
    Residence: {
        genderName: "17290", title: "63928",
        name: "78250", nameHi: "17287", father: "78251", fatherHi: "17288",
        mother: "41565", motherHi: "41567", husband: "64876", husbandHi: "64877",
        addressTypeName: "41566", residenceTypeName: "75290", docTypeName: "94358",
        mobile: "17293", email: "17294", pin: "90772", postoffice: "17300", purposeHi: "17301",
        state: "17391", district: "17297", anumandal: "17296", prakhand: "17298", police: "65015",
        ward: "56887", village: "17299",
        gramByType: { "1": "56886", "2": "75291", "3": "75292", "4": "75293" },
        image: "90837",
    },
    Caste: {
        genderName: "17177", title: "63930",
        name: "17176", nameHi: "17193", father: "17179", fatherHi: "17195",
        mother: "78252", motherHi: "41486", husband: "64882", husbandHi: "64883",
        addressTypeName: "41566", residenceTypeName: "75299", docTypeName: "93963",
        agree: "91902_1",
        mobile: "17180", email: "17332", pin: "90779", postoffice: "17186",
        state: "17392", district: "17183", anumandal: "17182", prakhand: "17184", police: "65034",
        ward: "56927", village: "17185",
        gramByType: { "1": "56891" },
        casteprofession: "17202", generalcaste: "91594",
        category: "17191", caste: "41552", subcaste: "17188",
        image: "17493",
    },
    Income: {
        genderName: "17155", title: "64058",
        name: "17154", nameHi: "17394", father: "17157", fatherHi: "17395",
        mother: "41395", motherHi: "41433", husband: "64810", husbandHi: "64811",
        addressTypeName: "41566", residenceTypeName: "75265", docTypeName: "94045",
        mobile: "17203", email: "17205", pin: "90777", postoffice: "17164",
        state: "17158", district: "17162", anumandal: "17159", prakhand: "17163", police: "65010",
        ward: "56894", village: "17160", purpose: "17172",
        gramByType: { "1": "56895" },
        profession: "17207",
        incomeGovt: "17168", incomeBusiness: "17169", incomeAgri: "17171", incomeOther: "17170",
        image: "17495",
    },
};

/* ------------------------------------------------------------------ */
/* Safe field setters (kabhi throw nahi karte, report me jodte hain)   */
/* ------------------------------------------------------------------ */
function saathiNewReport() { return { ok: 0, missing: [], failed: [], notes: [] }; }

function saathiSetText(rep, id, value, label, opts) {
    const el = $id(id);
    if (!el) { if (label) rep.missing.push(label); return false; }
    try {
        el.value = value == null ? "" : String(value);
        saathiFire(el, (opts && opts.events) || ["input", "change"]);
        rep.ok++;
        return true;
    } catch (e) { rep.failed.push(label || id); return false; }
}

// radio: name + value (value "94358_1" jaisa ho to prefix hata deta hai)
function saathiSetRadio(rep, name, value, label, stripPrefix) {
    if (value == null || value === "") return false;
    let v = String(value);
    if (stripPrefix) v = v.replace(stripPrefix, "");
    const el = document.querySelector('input[name="' + name + '"][value="' + v + '"]');
    if (!el) { rep.missing.push(label || name); return false; }
    try {
        if (!el.checked) el.click();
        el.checked = true;
        saathiFire(el, ["change"]);
        rep.ok++;
        return true;
    } catch (e) { rep.failed.push(label || name); return false; }
}

// <select>: pehle option aane ka intezaar, phir value set + change.
// optionsFallbackHtml: agar page option na la paye to local list se bhar do.
async function saathiSetSelect(rep, elOrId, value, label, opts) {
    const o = opts || {};
    const v = value == null ? "" : String(value);
    if (!v) return false;
    const el = typeof elOrId === "string" ? $id(elOrId) : elOrId;
    if (!el) { rep.missing.push(label || String(elOrId)); return false; }
    const has = () => Array.from(el.options).some((op) => op.value === v);
    let found = await saathiWaitFor(has, o.timeout == null ? 6000 : o.timeout, 100);
    if (!found && o.fallbackHtml) {
        // Page ki AJAX list nahi aayi — local list se options daalo (value wahi hai jo portal ko jayegi)
        try {
            el.innerHTML = o.fallbackHtml;
            el.removeAttribute("disabled"); el.disabled = false;
        } catch (e) { /* ignore */ }
        found = has();
    }
    if (!found) { rep.failed.push((label || el.id) + " (option '" + v + "' nahi mila)"); return false; }
    try {
        el.value = v;
        saathiFire(el, ["input", "change"]);
        rep.ok++;
        return true;
    } catch (e) { rep.failed.push(label || el.id); return false; }
}

async function saathiAttachImage(rep, id, dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return;
    const input = $id(id);
    if (!input) { rep.missing.push("Photo upload"); return; }
    try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "image.jpg", { type: blob.type || "image/jpeg" });
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        rep.ok++;
    } catch (e) { rep.failed.push("Photo upload"); }
}

// Gram dropdown: residence type ke hisaab se id; na mile to jis visible select me wanted option ho
function saathiFindGramSelect(cfg, resType, wanted) {
    const known = new Set(Object.values(cfg).filter((x) => typeof x === "string"));
    const byType = cfg.gramByType[String(resType || "1")];
    const cand = byType && $id(byType);
    if (cand && Array.from(cand.options).some((o) => o.value === wanted)) return cand;
    const all = Array.from(document.querySelectorAll("select")).filter((s) => !known.has(s.id) && s.offsetParent !== null);
    const hit = all.find((s) => Array.from(s.options).some((o) => o.value === wanted));
    return hit || (cand && cand.offsetParent !== null ? cand : null) || null;
}


// "ऊपर के जैसा / Same as above" checkbox dhundo (id ya label text se)
function saathiFindSameAsAbove(cfg) {
    const byId = cfg.agree && $id(cfg.agree);
    if (byId) return byId;
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    return boxes.find((b) => {
        const lbl = (b.id && document.querySelector('label[for="' + b.id + '"]')) || b.closest("label") || b.parentElement;
        const t = lbl ? lbl.textContent : "";
        return /ऊपर\s*के\s*जैसा/.test(t) || /same\s*as\s*above/i.test(t);
    }) || null;
}

/* ------------------------------------------------------------------ */
/* Main fill                                                           */
/* ------------------------------------------------------------------ */
let saathiFillRunning = false;

async function fillFormFields(data) {
    if (saathiFillRunning) { saathiToast("Fill pehle se chal raha hai, thoda ruko…", "info"); return; }
    saathiFillRunning = true;
    const type = formType();
    const cfg = SAATHI_FORMS[type];
    const rep = saathiNewReport();
    saathiToast("Page ko haath mat lagayein.", "info", 60000, { title: "Form bhar raha hai…", spinner: true });
    try {
        // --- Hindi naam (parallel, fail-safe) ---
        const hiPromise = Promise.all([
            transliterate(data.name), transliterate(data.fathername),
            transliterate(data.mothername), transliterate(data.husbandname),
            type === "Residence" ? transliterate(data.purpose) : Promise.resolve(""),
        ]);

        // --- Gender / title ---
        saathiSetRadio(rep, cfg.genderName, data.gender, "Gender");
        const titleEl = $id(cfg.title);
        if (titleEl) { titleEl.value = "4"; saathiFire(titleEl, ["change"]); }

        // --- Names ---
        saathiSetText(rep, cfg.name, data.name, "Name");
        saathiSetText(rep, cfg.father, data.fathername, "Father name");
        saathiSetText(rep, cfg.mother, data.mothername, "Mother name");
        saathiSetText(rep, cfg.husband, data.husbandname, "Husband name");
        const hi = await hiPromise;
        if (hi[0]) saathiSetText(rep, cfg.nameHi, hi[0], "Name (Hindi)");
        if (hi[1]) saathiSetText(rep, cfg.fatherHi, hi[1], "Father name (Hindi)");
        if (hi[2]) saathiSetText(rep, cfg.motherHi, hi[2], "Mother name (Hindi)");
        if (hi[3]) saathiSetText(rep, cfg.husbandHi, hi[3], "Husband name (Hindi)");
        if (!hi[0] && data.name) rep.failed.push("Hindi naam (internet/translate chala nahi — haath se likhein)");

        // --- Radios ---
        saathiSetRadio(rep, cfg.addressTypeName, data.addressType, "Address type");
        saathiSetRadio(rep, cfg.residenceTypeName, data.residenceType, "Residence type", new RegExp("^" + cfg.residenceTypeName + "_"));
        const docVal = type === "Residence" ? data.documentType : type === "Caste" ? data.castedocumenttype : data.incomeDocumentType;
        saathiSetRadio(rep, cfg.docTypeName, docVal, "Document type", new RegExp("^" + cfg.docTypeName + "_"));

        // --- Contact ---
        saathiSetText(rep, cfg.mobile, data.mobile, "Mobile");
        saathiSetText(rep, cfg.email, data.email, "Email");
        saathiSetText(rep, cfg.pin, data.pin, "PIN");
        saathiSetText(rep, cfg.postoffice, data.postoffice, "Post office");
        if (type === "Residence" && hi[4]) saathiSetText(rep, cfg.purposeHi, hi[4], "Purpose");
        if (type === "Income") saathiSetText(rep, cfg.purpose, data.purpose, "Purpose");

        // --- Location chain: State -> District -> Anumandal -> Prakhand -> (Gram) ---
        if (data.state) {
            await saathiSetSelect(rep, cfg.state, data.state, "State", { timeout: 4000 });
            const policeJob = (async () => {
                if (data.policeStation && data.district) {
                    await saathiSetSelect(rep, cfg.police, data.policeStation, "Police Station", { timeout: 8000 });
                }
            })();
            if (data.district) {
                const okD = await saathiSetSelect(rep, cfg.district, data.district, "District");
                if (okD && data.anumandal) {
                    const okA = await saathiSetSelect(rep, cfg.anumandal, data.anumandal, "Anumandal");
                    if (okA && data.prakhand) {
                        const okP = await saathiSetSelect(rep, cfg.prakhand, data.prakhand, "Prakhand");
                        if (okP) {
                            // Gram list prakhand + residence type par depend karti hai — radio dobara fire
                            const rr = document.querySelector('input[name="' + cfg.residenceTypeName + '"]:checked');
                            if (rr) saathiFire(rr, ["change"]);
                            const pk = $id(cfg.prakhand);
                            if (pk) saathiFire(pk, ["blur"]);
                            if (data.gram) {
                                const gramEl = await saathiWaitFor(() => saathiFindGramSelect(cfg, data.residenceType, String(data.gram)), 8000, 150);
                                if (gramEl) await saathiSetSelect(rep, gramEl, data.gram, "Gram Panchayat", { timeout: 1000 });
                                else rep.failed.push("Gram Panchayat (list nahi aayi)");
                            }
                        }
                    }
                }
            }
            await policeJob;
        }
        saathiSetText(rep, cfg.ward, data.wardNo, "Ward no.");
        saathiSetText(rep, cfg.village, data.village, "Village / Mohalla");

        // --- Caste form: profession, Category -> Caste -> Sub-caste ---
        if (type === "Caste") {
            if (data.casteprofession) await saathiSetSelect(rep, cfg.casteprofession, data.casteprofession, "Caste profession", { timeout: 3000 });
            if (data.generalcaste) saathiSetText(rep, cfg.generalcaste, data.generalcaste, "General caste");
            if (data.castecategory) {
                const okC = await saathiSetSelect(rep, cfg.category, data.castecategory, "Category", { timeout: 4000 });
                if (okC && data.caste) {
                    const casteFallback = (typeof casteData !== "undefined" && casteData[data.castecategory]) ? casteData[data.castecategory].options : "";
                    const okCaste = await saathiSetSelect(rep, cfg.caste, data.caste, "Caste", { timeout: 6000, fallbackHtml: casteFallback });
                    if (okCaste && data.subcaste) {
                        const subFallback = (typeof subCasteData !== "undefined" && subCasteData[data.caste]) ? subCasteData[data.caste].options : "";
                        await saathiSetSelect(rep, cfg.subcaste, data.subcaste, "Sub-caste", { timeout: 6000, fallbackHtml: subFallback });
                    }
                }
            }
        }

        // --- Income form ---
        if (type === "Income") {
            if (data.profession) await saathiSetSelect(rep, cfg.profession, data.profession, "Profession", { timeout: 3000 });
            [["incomeGovt", data.incomefromgovt, "Income (Govt)"], ["incomeBusiness", data.incomefrombusiness, "Income (Business)"],
             ["incomeAgri", data.incomefromagriculture, "Income (Agriculture)"], ["incomeOther", data.incomefromothers, "Income (Other)"]]
                .forEach(([k, val, lbl]) => {
                    if (saathiSetText(rep, cfg[k], val, lbl)) { const el = $id(cfg[k]); if (el) saathiFire(el, ["blur"]); }
                });
        }

        // --- "ऊपर के जैसा / Same as above": address bhar jane ke BAAD, thoda ruk kar ---
        if (cfg.agree) {
            await SAATHI_SLEEP(1200);
            const ag = saathiFindSameAsAbove(cfg);
            if (!ag) rep.missing.push("Same as above checkbox");
            else {
                try {
                    if (!ag.checked) ag.click();
                    else ag.dispatchEvent(new Event("click", { bubbles: true }));
                    ag.checked = true;
                    saathiFire(ag, ["change"]);
                    rep.ok++;
                } catch (e) { rep.failed.push("Same as above checkbox"); }
            }
        }

        // --- Photo ---
        await saathiAttachImage(rep, cfg.image, data.image);

        const mob = $id(cfg.mobile); if (mob) saathiFire(mob, ["change"]);
        const pk2 = $id(cfg.prakhand); if (pk2) saathiFire(pk2, ["blur"]);
    } catch (err) {
        console.error("[Click & Continue] fill error:", err);
        rep.failed.push("Unexpected error: " + (err && err.message));
    } finally {
        saathiFillRunning = false;
    }

    saathiReportToast("", rep);
    return undefined;
}

/* ------------------------------------------------------------------ */
/* On-page toast                                                       */
/* ------------------------------------------------------------------ */
// brand mark (data URI: no web_accessible_resources needed). Shared with the other content scripts.
window.SAATHI_LOGO_URI = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiI+CiAgPGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJ0IiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjOUIwMEQyIi8+PHN0b3Agb2Zmc2V0PSIuNTUiIHN0b3AtY29sb3I9IiNGRTI4QUYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNERDYwM0UiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz4KICA8cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9IjExMiIgZmlsbD0idXJsKCN0KSIvPgogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDk2IDk2KSBzY2FsZSg1KSIgZmlsbD0ibm9uZSI+CiAgIDxwYXRoIGQ9Ik00Ny41NiAxNi40NEEyMiAyMiAwIDEgMCA0Ny41NiA0Ny41NiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjYuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgIDxsaW5lIHgxPSI0Ny41NiIgeTE9IjIzIiB4Mj0iNDcuNTYiIHkyPSI0MSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWRhc2hhcnJheT0iMC41IDYiLz4KICAgPGNpcmNsZSBjeD0iNDcuNTYiIGN5PSIxNi40NCIgcj0iNS4yIiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iNDcuNTYiIGN5PSI0Ny41NiIgcj0iNS4yIiBmaWxsPSIjZmZmIi8+CiAgIDxwYXRoIGQ9Ik0yMiAxOHYyNS41bDYuOC02LjIgNC42IDEwLjIgNC42LTIuMS00LjYtOS44SDQyLjV6IiBmaWxsPSIjZmZmIi8+PC9nPgo8L3N2Zz4=";

function saathiToastStyle() {
    if (document.getElementById("saathi-cc-style")) return;
    const st = document.createElement("style");
    st.id = "saathi-cc-style";
    st.textContent = `
      #saathi-cc-toast{position:fixed;right:18px;bottom:72px;width:340px;max-width:calc(100vw - 36px);z-index:2147483647;display:none;
        font:13px/1.45 system-ui,"Segoe UI",Roboto,Arial,sans-serif;color:#1e293b;background:#fff;border-radius:16px;overflow:hidden;
        box-shadow:0 18px 40px -12px rgba(15,23,42,.35),0 0 0 1px rgba(15,23,42,.06);animation:saathi-slide .28s cubic-bezier(.2,.9,.3,1.2);}
      #saathi-cc-toast .st-top{display:flex;gap:11px;align-items:flex-start;padding:13px 14px 11px;}
      #saathi-cc-toast .st-ico{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;}
      #saathi-cc-toast .st-ok .st-ico{background:linear-gradient(135deg,#22c55e,#15803d);}
      #saathi-cc-toast .st-warn .st-ico{background:linear-gradient(135deg,#f59e0b,#d97706);}
      #saathi-cc-toast .st-info .st-ico{background:linear-gradient(135deg,#3b82f6,#1d4ed8);}
      #saathi-cc-toast .st-title{font-weight:800;font-size:14px;color:#0f172a;}
      #saathi-cc-toast .st-sub{font-size:12px;color:#64748b;margin-top:1px;}
      #saathi-cc-toast .st-brand{margin-left:auto;width:18px;height:18px;border-radius:5px;flex:none;opacity:.95;}
      #saathi-cc-toast .st-x{margin-left:6px;border:none;background:transparent;color:#94a3b8;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;}
      #saathi-cc-toast .st-x:hover{color:#334155;}
      #saathi-cc-toast .st-list{max-height:150px;overflow:auto;padding:0 14px 10px 55px;display:flex;flex-direction:column;gap:5px;}
      #saathi-cc-toast .st-item{font-size:11.5px;padding:5px 9px;border-radius:8px;background:#f1f5f9;color:#334155;}
      #saathi-cc-toast .st-item.bad{background:#fee2e2;color:#991b1b;} #saathi-cc-toast .st-item.miss{background:#fef3c7;color:#92400e;}
      #saathi-cc-toast .st-bar{height:3px;background:rgba(15,23,42,.06);} #saathi-cc-toast .st-bar i{display:block;height:100%;width:100%;transform-origin:left;}
      #saathi-cc-toast .st-ok .st-bar i{background:#22c55e;} #saathi-cc-toast .st-warn .st-bar i{background:#f59e0b;} #saathi-cc-toast .st-info .st-bar i{background:#3b82f6;}
      #saathi-cc-toast .st-spin{width:15px;height:15px;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:saathi-rot .8s linear infinite;}
      @keyframes saathi-slide{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
      @keyframes saathi-rot{to{transform:rotate(360deg)}}
      @keyframes saathi-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}
      #saathi-cc-toast:hover .st-bar i{animation-play-state:paused !important;}`;
    (document.head || document.documentElement).appendChild(st);
}

/* saathiToast(text, kind, ms, opts)  kind: ok | warn | info.   opts: { title, details:[{kind:"bad"|"miss"|"note", text}], spinner } */
function saathiToast(text, kind, ms, opts) {
    try {
        opts = opts || {};
        saathiToastStyle();
        let box = document.getElementById("saathi-cc-toast");
        if (!box) {
            box = document.createElement("div");
            box.id = "saathi-cc-toast";
            (document.body || document.documentElement).appendChild(box);
        }
        const k = kind === "ok" ? "ok" : kind === "warn" ? "warn" : "info";
        const dur = ms || 5000;
        // legacy callers pass only one string: strip the leading symbol and use it as the title
        const title = opts.title || String(text || "").replace(/^[✓⚠ⓘ✅❌\s]+/, "");
        const sub = opts.title ? String(text || "") : "";

        box.textContent = "";
        const wrap = document.createElement("div");
        wrap.className = "st-" + k;
        const top = document.createElement("div"); top.className = "st-top";
        const ico = document.createElement("div"); ico.className = "st-ico";
        if (opts.spinner) { const sp = document.createElement("div"); sp.className = "st-spin"; ico.appendChild(sp); }
        else ico.textContent = k === "ok" ? "✓" : k === "warn" ? "!" : "i";
        const tx = document.createElement("div");
        const t1 = document.createElement("div"); t1.className = "st-title"; t1.textContent = title;
        tx.appendChild(t1);
        if (sub) { const t2 = document.createElement("div"); t2.className = "st-sub"; t2.textContent = sub; tx.appendChild(t2); }
        const x = document.createElement("button"); x.type = "button"; x.className = "st-x"; x.textContent = "×"; x.title = "Band karein";
        x.addEventListener("click", () => { box.style.display = "none"; });
        const brand = document.createElement("img"); brand.className = "st-brand"; brand.src = window.SAATHI_LOGO_URI; brand.alt = "";
        top.appendChild(ico); top.appendChild(tx); top.appendChild(brand); top.appendChild(x);
        wrap.appendChild(top);

        if (opts.details && opts.details.length) {
            const list = document.createElement("div"); list.className = "st-list";
            opts.details.forEach((d) => {
                const it = document.createElement("div");
                it.className = "st-item" + (d.kind === "bad" ? " bad" : d.kind === "miss" ? " miss" : "");
                it.textContent = d.text;
                list.appendChild(it);
            });
            wrap.appendChild(list);
        }
        const bar = document.createElement("div"); bar.className = "st-bar";
        const fill = document.createElement("i"); fill.style.animation = "saathi-shrink " + dur + "ms linear forwards";
        bar.appendChild(fill); wrap.appendChild(bar);
        box.appendChild(wrap);
        box.style.display = "block";
        clearTimeout(box._t);
        box._t = setTimeout(() => { box.style.display = "none"; }, dur);
        box.onmouseenter = () => clearTimeout(box._t);                       // hover = keep reading
        box.onmouseleave = () => { clearTimeout(box._t); box._t = setTimeout(() => { box.style.display = "none"; }, 2500); };
    } catch (e) { /* ignore */ }
}

/* One tidy result card for every form fill (general / NCL / EWS). */
function saathiReportToast(label, rep) {
    const failed = rep.failed || [], missing = rep.missing || [], notes = rep.notes || [];
    const details = []
        .concat(failed.map((t) => ({ kind: "bad", text: "✕ " + t })))
        .concat(missing.map((t) => ({ kind: "miss", text: "• " + t })))
        .concat(notes.map((t) => ({ kind: "note", text: "ⓘ " + t })));
    if (!failed.length && !missing.length) {
        saathiToast("Ek baar check karke aage badhein.", "ok", notes.length ? 12000 : 7000,
            { title: rep.ok + " fields bhar diye" + (label ? " · " + label : ""), details });
    } else {
        const n = failed.length + missing.length;
        saathiToast(n + " cheez dhyaan maangti hai — neeche dekhein.", "warn", 22000,
            { title: rep.ok + " fields bhare" + (label ? " · " + label : ""), details });
        console.warn("[Click & Continue] fill report:", rep);
    }
}

/* ------------------------------------------------------------------ */
/* popup.js se aane wale messages                                      */
/* ------------------------------------------------------------------ */
const SAATHI_IDS = {
    state: ["17391", "17392", "17158"],
    district: ["17297", "17183", "17162"],
    anumandal: ["17296", "17182", "17159"],
    prakhand: ["17298", "17184", "17163"],
    police: ["65015", "65034", "65010"],
    residenceRadioNames: ["75290", "75299", "75265"],
};

// parent set karo -> child ki options badalne ka intezaar -> jawab
function saathiCascadeMessage(parentIds, value, childIds, extra, respond) {
    (async () => {
        try {
            const parent = saathiFirstEl(parentIds);
            if (!parent) { respond({ status: "error", message: "Dropdown not found on webpage." }); return; }
            const childEl = childIds ? saathiFirstEl(childIds) : null;
            const before = childEl ? Array.from(childEl.options).map((o) => o.value).join("|") : "";
            const v = value == null ? "" : String(value);
            if (parent.value !== v) parent.value = v;
            saathiFire(parent, ["change"]);
            if (childEl && v) {
                await saathiWaitFor(() => {
                    const now = Array.from(childEl.options).map((o) => o.value).join("|");
                    return now !== before && childEl.options.length > 1;
                }, 2500, 100);
            }
            respond(Object.assign({ status: "success" }, extra ? extra() : {}));
        } catch (error) {
            respond({ status: "error", message: error.message });
        }
    })();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action) return undefined;

    // Health Check: tells the popup which portal page this is and which extension modules are alive here.
    if (request.action === "ping") {
        let ncl = "", ews = false, rows = 0;
        try { ncl = typeof window.__saathiNclDetect === "function" ? (window.__saathiNclDetect() || "") : ""; } catch (e) { /* ignore */ }
        try { ews = typeof window.__saathiEwsDetect === "function" ? !!window.__saathiEwsDetect() : false; } catch (e) { /* ignore */ }
        try { rows = typeof window.__saathiEnclosureRows === "function" ? window.__saathiEnclosureRows() : 0; } catch (e) { /* ignore */ }
        sendResponse({
            status: "success", url: location.href, ncl: ncl, ews: ews, enclosureRows: rows,
            modules: { ncl: !!window.__saathiNclLoaded, ews: !!window.__saathiEwsLoaded, enclosureMatch: !!window.SaathiEnclosureMatch, docStore: typeof DocStore !== "undefined" },
        });
        return true;
    }

    if (request.action === "getDropdownValues") {
        sendResponse({ status: "success", dropdownValues: getDropdownValues(request.dropdownId) });
        return true;
    }
    if (request.action === "triggerStateChange") {
        saathiCascadeMessage(SAATHI_IDS.state, request.stateValue, SAATHI_IDS.district, () => ({
            districtDropdown: saathiFirstDropdown(SAATHI_IDS.district),
        }), sendResponse);
        return true;
    }
    if (request.action === "triggerDistrictChange") {
        saathiCascadeMessage(SAATHI_IDS.district, request.districtValue, SAATHI_IDS.anumandal, () => ({
            anumandalDropdown: saathiFirstDropdown(SAATHI_IDS.anumandal),
            policeStationDropdown: saathiFirstDropdown(SAATHI_IDS.police),
        }), sendResponse);
        return true;
    }
    if (request.action === "triggerAnumandalChange") {
        saathiCascadeMessage(SAATHI_IDS.anumandal, request.anumandalValue, SAATHI_IDS.prakhand, () => ({
            prakhandDropdown: saathiFirstDropdown(SAATHI_IDS.prakhand),
        }), sendResponse);
        return true;
    }
    if (request.action === "triggerPrakhandChange") {
        try {
            const el = saathiFirstEl(SAATHI_IDS.prakhand);
            if (!el) { sendResponse({ status: "error", message: "Prakhand dropdown not found on webpage." }); return true; }
            el.value = request.prakhandValue;
            saathiFire(el, ["change", "blur"]);
            sendResponse({ status: "success", message: "Prakhand changed on webpage successfully" });
        } catch (error) {
            sendResponse({ status: "error", message: error.message });
        }
        return true;
    }
    if (request.action === "triggerResidenceTypeChange") {
        (async () => {
            try {
                const sel = SAATHI_IDS.residenceRadioNames.map((n) => 'input[name="' + n + '"]').join(", ");
                const radios = Array.from(document.querySelectorAll(sel));
                if (!radios.length) { sendResponse({ status: "error", message: "Residence type field not found on webpage." }); return; }
                const target = radios.find((r) => r.value === String(request.residenceTypeValue));
                if (!target) { sendResponse({ status: "error", message: "Residence type option not found on webpage." }); return; }
                if (!target.checked) target.click();
                target.checked = true;
                saathiFire(target, ["change", "blur"]);
                await SAATHI_SLEEP(600);
                const cfg = SAATHI_FORMS[formType()];
                const gramId = cfg.gramByType[String(request.residenceTypeValue)] ||
                    SAATHI_FORMS.Residence.gramByType[String(request.residenceTypeValue)];
                sendResponse({
                    status: "success",
                    message: "Residence type changed on webpage successfully",
                    gramOptions: gramId && $id(gramId) ? getDropdownValues(gramId) : [],
                });
            } catch (error) {
                sendResponse({ status: "error", message: error.message });
            }
        })();
        return true;
    }
    if (request.action === "autofill") {
        if (request.formData) {
            fillFormFields(request.formData);
            sendResponse({ status: "success" });
            return undefined;
        }
        chrome.storage.local.get("formEntries", function (result) {
            const list = result && result.formEntries;
            if (list && list.length > 0) {
                fillFormFields(list[0]);
                sendResponse({ status: "success" });
            } else {
                sendResponse({ status: "no_data" });
            }
        });
        return true;
    }
    return undefined;
});
