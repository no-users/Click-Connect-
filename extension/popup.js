/*
 * popup.js  (Click & Continue v3.0.0 — bug-fixed)
 * ------------------------------------------------------------------
 * Original popup.js ek custom bytecode-VM obfuscator se protect thi
 * (65 bytecode chunks) + kuch normal JS (data strings, listeners).
 * Yeh file dono ko jodkar wapas normal JS me likhi gayi hai.
 * Function ke naam original wrapper declarations se liye gaye hain
 * (isliye sahi hain); local variable names context se rakhe gaye hain.
 *
 * Globals jo is file ke bahar se aate hain (popup.html ke dusre scripts):
 *   casteData   -> { <category>: { options: "<option>..." } }
 * ------------------------------------------------------------------
 */
var filePath = ""; // selected image ka data-URL
let currentEditingId = null; // jis saved entry ko edit kar rahe hain
// <option> lists (original file me plain strings the)
const districtdata = "<option value=''>Please Select</option> <option value='188'>ARARIA/अररिया</option> <option value='611'>ARWAL/अरवल</option> <option value='189'>AURANGABAD/औरंगाबाद</option> <option value='190'>BANKA/बांका</option> <option value='191'>BEGUSARAI/बेगूसराय</option> <option value='192'>BHAGALPUR/भागलपुर</option> <option value='193'>BHOJPUR/भोजपुर</option> <option value='194'>BUXAR/बक्सर</option> <option value='195'>DARBHANGA/दरभंगा</option> <option value='196'>GAYA/गया</option> <option value='197'>GOPALGANJ/गोपालगंज</option> <option value='198'>JAMUI/जमुई</option> <option value='199'>JEHANABAD/जहानाबाद</option> <option value='200'>KAIMUR (BHABUA)/कैमूर ( भभुआ )</option> <option value='201'>KATIHAR/कटिहार</option> <option value='202'>KHAGARIA/खगड़िया</option> <option value='203'>KISHANGANJ/किशनगंज</option> <option value='204'>LAKHISARAI/लखीसराय</option> <option value='205'>MADHEPURA/मधेपुरा</option> <option value='206'>MADHUBANI/मधुबनी</option> <option value='207'>MUNGER/मुंगेर</option> <option value='208'>MUZAFFARPUR/मुजफ्फरपुर</option> <option value='209'>NALANDA/नालंदा</option> <option value='210'>NAWADA/नवादा</option> <option value='211'>PASHCHIM CHAMPARAN/पश्चिम चम्पारण</option> <option value='212'>PATNA/पटना</option> <option value='213'>PURBI CHAMPARAN/पूर्वी चंपारण</option> <option value='214'>PURNIA/पूर्णिया</option> <option value='215'>ROHTAS/रोहतास</option> <option value='216'>SAHARSA/सहरसा</option> <option value='217'>SAMASTIPUR/समस्तीपुर</option> <option value='218'>SARAN/सारण</option> <option value='219'>SHEIKHPURA/शेखपुरा</option> <option value='220'>SHEOHAR/शिवहर</option> <option value='221'>SITAMARHI/सीतामढी</option> <option value='222'>SIWAN/सिवान</option> <option value='223'>SUPAUL/सुपौल</option> <option value='224'>VAISHALI/वैशाली</option>";
const anumandaldata = "<option value=\"\" autocomplete=\"off\"> Please Select</option><option value=\"17456\" data-entity-level=\"null\">BAGAHA/बगहा</option><option value=\"17447\" data-entity-level=\"null\">BETTIAH/बेत्तिया</option><option value=\"17457\" data-entity-level=\"null\">NARKATIYAGANJ/नरकटियागंज</option>";
const policeSt = "<option value=\"\"> Please Select</option> <option value=\"1256783\">Bagaha/बगहा</option> <option value=\"1256882\">Bairia Police Station/बैरिया थाना</option> <option value=\"1256936\">Balthar Police Station/बलथर थाना</option> <option value=\"1988636\">Banuchhapar thana/बानुछापर थाना</option> <option value=\"1256802\">Bathwariya/बथवरिया</option> <option value=\"1256793\">Bhairoganj/भैरोगंज</option> <option value=\"1256977\">Bhangaha Police Station/भंगहा थाना</option> <option value=\"1256799\">Bhitaha/भितहॉ</option> <option value=\"1256865\">Chanpatia Police Station/चनपटिया थाना</option> <option value=\"1256792\">Chautarwa/चौतरवा</option> <option value=\"1256804\">Chiutaha OP/चिऊटाहॉ ओ0पी0</option> <option value=\"1256809\">Dhanha/धनहा</option> <option value=\"1256801\">Gabarahiya/गोबरहिया</option> <option value=\"1256886\">Gaunaha Police Station/गौनाहा थाना</option> <option value=\"1256830\">Gobardhana/गोबर्धना</option> <option value=\"1256879\">Gopalpur Police Station/गोपालपुर थाना</option> <option value=\"1256935\">Inarwa Police Station/इनरवा थाना</option> <option value=\"1256944\">Jagdispur Police Station/जगदीशपुर थाना</option> <option value=\"1988633\">Kalibagh Police Station/कालीबाग थाना</option> <option value=\"1256984\">Kangli Police Station/कंगली थाना</option> <option value=\"1988639\">Kumarbagh Police Station/कुमारबाग थाना</option> <option value=\"1256842\">Laukariya/लौकरिया</option> <option value=\"1256931\">Lauria Police Station/लौरिया थाना</option> <option value=\"1256976\">Mainatand Police Station/मैनाटॉड थाना</option> <option value=\"1256860\">Majhaulia Police Station/मझौलिया थाना</option> <option value=\"1256934\">Manpur Police Station/मानपुर थाना</option> <option value=\"1256856\">Manuapul Police Station/मनुआपुल थाना</option> <option value=\"1256929\">Matiyariya Police Station/मटिअरिया थाना</option> <option value=\"1256853\">Muffasil Police Station/मुफ्फसिल थाना</option> <option value=\"2169131\">Nadi/नदी</option> <option value=\"1256849\">Nagar Police Station/नगर थाना</option> <option value=\"1256881\">Nautan Police Station/नौतन थाना</option> <option value=\"1256880\">Nawalpur Police Station/नवलपुर थाना</option> <option value=\"1256794\">Nawrangiya/नौरंगिया</option> <option value=\"1256786\">Patkhauli OP/पटखौली ओ0पी0</option> <option value=\"1256797\">Piprasi/पीपरासी</option> <option value=\"1256933\">Purushottampur Police Station/पुरुषोतमपुर थाना</option> <option value=\"1256800\">Ramnagar/रामनगर</option> <option value=\"1256885\">Sahodra Police Station/सहोदरा थाना</option> <option value=\"1256889\">Sanichari Police Station/शनिचरी थाना</option> <option value=\"1256947\">Sathi Police Station/साठी थाना</option> <option value=\"1256840\">Semra/सेमरा</option> <option value=\"1256884\">Shikarpur Police Station/शिकारपुर थाना</option> <option value=\"1256883\">Shrinagar Police Station/श्रीनगर थाना</option> <option value=\"1256937\">Sikta Police Station/सिकटा थाना</option> <option value=\"1256869\">Sirisiya Police Station/सिरिसिया थाना</option> <option value=\"1256796\">Thakraha/ठकराहां</option> <option value=\"1256795\">Valmikinagar/वाल्मीकिनगर</option> <option value=\"1256875\">Yogapatti Police Station/योगापट्टी थाना</option>";
/* ------------------------------------------------------------------ */
/* Storage wrapper: chrome.storage.local, warna localStorage fallback  */
/* ------------------------------------------------------------------ */
const storage = {
    async get(key) {
        return new Promise((resolve) => {
            if (window.chrome && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(key, (result) => resolve(result[key]));
            }
            else {
                const v = localStorage.getItem(key);
                resolve(v ? JSON.parse(v) : undefined);
            }
        });
    },
    async set(obj) {
        return new Promise((resolve) => {
            if (window.chrome && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set(obj, () => resolve());
            }
            else {
                Object.keys(obj).forEach((k) => localStorage.setItem(k, JSON.stringify(obj[k])));
                resolve();
            }
        });
    },
};
/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
// Active tab ke content script se dropdown ki values maangta hai
async function fetchDropdownValues(dropdownId) {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || !tabs[0])
            throw new Error("No active tab found");
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
            action: "getDropdownValues",
            dropdownId: dropdownId,
        });
        if (response && response.status === "success") {
            return response.dropdownValues;
        }
        throw new Error("Failed to fetch dropdown values");
    }
    catch (error) {
        console.error("Error fetching dropdown values:", error);
        return [];
    }
}
// <select> ko [{value, text}] list se bharta hai (pehle se chuni hui value bachi rehti hai)
function populateDropdown(selectEl, options) {
    const keep = selectEl.value;
    selectEl.innerHTML = "";
    (options || []).forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.text;
        selectEl.appendChild(option);
    });
    if (keep && Array.from(selectEl.options).some((o) => o.value === keep)) selectEl.value = keep;
}
// select me value ensure karo — option na ho to add kar do taaki save hui value kho na jaye
function keepValue(selectId, value, label) {
    const el = document.getElementById(selectId);
    if (!el || value == null || value === "") return;
    el.value = value;
    if (el.value !== String(value)) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label || (value + " (saved)");
        el.appendChild(o);
        el.value = value;
    }
}
// Active RTPS tab ko message bhejo; kabhi throw nahi karta (jawab ya null)
function sendToPage(message) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (chrome.runtime.lastError || !tabs || !tabs[0]) return resolve(null);
                chrome.tabs.sendMessage(tabs[0].id, message, (resp) => {
                    if (chrome.runtime.lastError) return resolve(null);
                    resolve(resp || null);
                });
            });
        } catch (e) { resolve(null); }
    });
}
// English -> Hindi (Google Translate unofficial endpoint) — fail-safe
async function transliterate(text) {
    const clean = String(text == null ? "" : text).trim();
    if (!clean || /[\u0900-\u097F]/.test(clean)) return clean;
    try {
        const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&q=" +
            encodeURIComponent(clean);
        const res = await fetch(url);
        const data = await res.json();
        const out = data && data[0] && data[0][0] && data[0][0][0];
        return typeof out === "string" && out ? out : clean;
    } catch (e) {
        console.warn("transliterate failed:", e && e.message);
        return clean; // internet na ho to jo likha hai wahi rehne do
    }
}
// "purpose" field se bahar nikalte hi text Hindi me badal jata hai
document.getElementById("purpose").addEventListener("blur", async function () {
    const value = this.value;
    if (value.trim() === "") return;
    const hi = await transliterate(value);
    if (this.value === value) this.value = hi;
});
function escapeHtml(str) {
    if (!str)
        return "";
    return str.replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}
/* ------------------------------------------------------------------ */
/* Cascading dropdowns (State -> District -> Anumandal -> Prakhand)    */
/* ------------------------------------------------------------------ */
function updateDistricts() {
    const stateEl = document.getElementById("state");
    const districtEl = document.getElementById("district");
    const state = stateEl.value;
    if (state == "10") {
        // List sirf tab dobara banao jab abhi poori na ho (chuni hui value kho na jaye)
        if (districtEl.options.length <= 1 || !districtEl.querySelector("option[value='188']")) {
            const keep = districtEl.value;
            districtEl.innerHTML = districtdata;
            if (keep) districtEl.value = keep;
        }
    }
    else if (!state) {
        districtEl.innerHTML = '<option value="">Select District</option>';
    }
    if (!districtEl.value) {
        document.getElementById("anumandal").innerHTML = '<option value="">Select Anumandal</option>';
        document.getElementById("prakhand").innerHTML = '<option value="">Select Prakhand</option>';
    }
}
function updateAnumandals() {
    // Anumandal/Prakhand/Gram lists ab locationCascade.js (locationData.js se) banata hai.
    const district = document.getElementById("district").value;
    if (!district) {
        document.getElementById("prakhand").innerHTML = '<option value="">Select Prakhand</option>';
    }
    updatePoliceStations();
}
function updatePrakhands() {
    const prakhandEl = document.getElementById("prakhand");
    if (prakhandEl.options.length <= 1) prakhandEl.innerHTML = '<option value="">Select Prakhand</option>';
}
function updatePoliceStations() {
    // Hardcoded thana list sirf PASHCHIM CHAMPARAN (211) ki hai. Baaki zillon ki list
    // page se aati hai (neeche district-change handler). Galat zille ki list na dikhe.
    const el = document.getElementById("policeStation");
    if (!el) return;
    const district = document.getElementById("district").value;
    if (district === "211" || (!district && el.options.length <= 1)) {
        const keep = el.value;
        el.innerHTML = policeSt;
        if (keep) el.value = keep;
    }
    else if (el.querySelector("option[value='1256783']")) {
        el.innerHTML = '<option value="">Select Police Station</option>';
    }
}
/* ------------------------------------------------------------------ */
/* Image upload (size limit 20KB - 350KB)                              */
/* ------------------------------------------------------------------ */
// #image change: size check (20KB-350KB) + preview + data-URL ko `filePath` me rakhna
// (pehle yeh do alag listeners the — size error ka alert 2 baar dikhta tha)
window.__saathiRestoringImage = false;
document.getElementById("image").addEventListener("change", function () {
    const file = this.files && this.files[0];
    const preview = document.getElementById("imagePreview");
    if (!file) {
        preview.src = "";
        preview.style.display = "none";
        if (!window.__saathiRestoringImage) filePath = "";
        return;
    }
    const sizeKB = file.size / 1024;
    const minKB = 20;
    const maxKB = 350;
    if (!window.__saathiRestoringImage && (sizeKB < minKB || sizeKB > maxKB)) {
        alert(sizeKB < minKB
            ? "Image size is too small. Minimum size: " + minKB + "KB. Current size: " + sizeKB.toFixed(2) + "KB"
            : "Image size is too large. Maximum size: " + maxKB + "KB. Current size: " + sizeKB.toFixed(2) + "KB");
        this.value = "";
        preview.src = "";
        preview.style.display = "none";
        filePath = "";
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        filePath = e.target.result;
        preview.src = e.target.result;
        preview.style.display = "block";
    };
    reader.readAsDataURL(file);
});
/* ------------------------------------------------------------------ */
/* Form read / clear / save                                            */
/* ------------------------------------------------------------------ */
function readForm() {
    const imageInput = document.getElementById("image");
    // NOTE: image/id ke ternaries bytecode me partially hi dikhe;
    // yeh sabse closest reconstruction hai.
    const image = filePath || "";
    const id = currentEditingId || "id_" + Date.now();
    const $ = (x) => { const e = document.getElementById(x); return e ? String(e.value == null ? "" : e.value).trim() : ""; };
    const checked = (name) => document.querySelector('input[name="' + name + '"]:checked')?.value;
    return {
        id: id,
        name: $("name"),
        fathername: $("fathername"),
        mothername: $("mothername"),
        husbandname: $("husbandname"),
        gender: checked("gender"),
        addressType: checked("addressType"),
        residenceType: checked("residenceType"),
        mobile: $("mobile"),
        email: $("email"),
        pin: $("pin"),
        postoffice: $("postoffice"),
        purpose: $("purpose"),
        state: $("state"),
        district: $("district"),
        anumandal: $("anumandal"),
        prakhand: $("prakhand"),
        gram: $("gram"),
        policeStation: $("policeStation"),
        village: $("village"),
        image: image,
        documentType: $("documentType"),
        wardNo: $("wardNo"),
        profession: $("profession"),
        incomefromgovt: $("incomefromgovt"),
        incomefrombusiness: $("incomefrombusiness"),
        incomefromagriculture: $("incomefromagriculture"),
        incomefromothers: $("incomefromothers"),
        totalincome: $("totalincome"),
        incomeDocumentType: $("incomeDocumentType"),
        casteprofession: $("casteprofession"),
        castecategory: $("castecategory"),
        caste: $("caste"),
        subcaste: $("subcaste"),
        generalcaste: $("generalcaste"),
        castedocumenttype: $("casteDocumentType"),
        savedAt: new Date().toISOString(),
    };
}
function clearForm() {
    document.getElementById("dataForm").reset();
    currentEditingId = null;
    document.getElementById("state").value = "";
    document.getElementById("district").innerHTML = '<option value="">Select District</option>';
    document.getElementById("anumandal").innerHTML = '<option value="">Select Anumandal</option>';
    document.getElementById("prakhand").innerHTML = '<option value="">Select Prakhand</option>';
    document.getElementById("gram").innerHTML = '<option value="">Select Gram</option>';
    document.getElementById("policeStation").innerHTML = '<option value="">Select Police Station</option>';
    document.getElementById("castecategory").value = "";
    if (typeof window.saathiResetCasteChain === "function") window.saathiResetCasteChain();
    const preview = document.getElementById("imagePreview");
    preview.src = "";
    preview.style.display = "none";
    currentEditingId = null;
    filePath = "";
}
async function saveFormData(e) {
    e.preventDefault();
    const entry = readForm();
    const entries = (await storage.get("formEntries")) || [];
    // Edit mode: purani entry replace. Agar wo ab storage me nahi mili (delete/import ho gayi)
    // to ab silently kuch nahi hota tha — ab nayi entry ki tarah save hoti hai.
    const idx = currentEditingId ? entries.findIndex((x) => x.id === currentEditingId) : -1;
    let msg;
    if (idx !== -1) {
        entries[idx] = entry;
        msg = "Entry updated successfully!";
    }
    else {
        entries.unshift(entry);
        msg = "New entry saved successfully!";
    }
    await storage.set({ formEntries: entries });
    alert(msg);
    clearForm();
    currentEditingId = null;
    showTab("saved");
}
/* ------------------------------------------------------------------ */
/* Saved entries: delete / clear-all / load into form / list           */
/* ------------------------------------------------------------------ */
async function deleteEntry(id) {
    const entries = (await storage.get("formEntries")) || [];
    const remaining = entries.filter((x) => x.id !== id);
    await storage.set({ formEntries: remaining });
    renderSavedList();
}
async function clearAllEntries() {
    await storage.set({ formEntries: [] });
    renderSavedList();
}
// "Update" button: saved entry ko popup ke form me wapas bharta hai (edit ke liye)
async function loadEntry(id) {
    showTab("form");
    const entries = (await storage.get("formEntries")) || [];
    const entry = entries.find((x) => x.id === id);
    if (!entry) return;
    currentEditingId = id;
    const $ = (x) => document.getElementById(x);
    const setVal = (elId, v) => { const el = $(elId); if (el) el.value = v == null ? "" : v; };
    const setRadio = (name, v) => {
        if (!v) return;
        const r = document.querySelector('input[name="' + name + '"][value="' + v + '"]');
        if (r) r.checked = true;
    };
    setVal("name", entry.name);
    setVal("fathername", entry.fathername);
    setVal("mothername", entry.mothername);
    setVal("husbandname", entry.husbandname);
    setRadio("gender", entry.gender);
    setRadio("addressType", entry.addressType);
    setRadio("residenceType", entry.residenceType);
    setVal("mobile", entry.mobile);
    setVal("email", entry.email);
    setVal("pin", entry.pin);
    setVal("postoffice", entry.postoffice);
    setVal("purpose", entry.purpose);
    // State -> District -> Anumandal -> Prakhand -> Gram.
    // Yeh lists locationCascade.js ke value-hooks se order-independent bharti hain, isliye
    // yahan page ke response ka intezaar (purana 5 second wala timer) nahi chahiye.
    $("state").value = entry.state || "";
    updateDistricts();
    if (entry.state && entry.district) {
        $("district").value = entry.district;
        if (entry.anumandal) $("anumandal").value = entry.anumandal;
        if (entry.prakhand) $("prakhand").value = entry.prakhand;
        if (entry.gram) $("gram").value = entry.gram;
    }
    // Police station: hardcoded list sirf 211 ki hai, baaki page se aati hai
    if (entry.policeStation) {
        updatePoliceStations();
        keepValue("policeStation", entry.policeStation);
        if (entry.district) {
            sendToPage({ action: "triggerDistrictChange", districtValue: entry.district }).then((resp) => {
                if (resp && resp.status === "success" && resp.policeStationDropdown && resp.policeStationDropdown.length > 1) {
                    populateDropdown($("policeStation"), resp.policeStationDropdown);
                    keepValue("policeStation", entry.policeStation);
                }
            });
        }
    }
    setVal("wardNo", entry.wardNo);
    setVal("village", entry.village);
    setVal("documentType", entry.documentType);
    setVal("profession", entry.profession);
    setVal("incomefromgovt", entry.incomefromgovt);
    setVal("incomefrombusiness", entry.incomefrombusiness);
    setVal("incomefromagriculture", entry.incomefromagriculture);
    setVal("incomefromothers", entry.incomefromothers);
    setVal("totalincome", entry.totalincome);
    setVal("incomeDocumentType", entry.incomeDocumentType);
    setVal("casteprofession", entry.casteprofession);
    // Category -> Caste -> Sub-caste (ek saath, sahi order me)
    if (typeof window.saathiSetCasteChain === "function") {
        window.saathiSetCasteChain(entry.castecategory, entry.caste, entry.subcaste);
    }
    else {
        setVal("castecategory", entry.castecategory);
        $("castecategory").dispatchEvent(new Event("change"));
        setVal("caste", entry.caste);
        $("caste").dispatchEvent(new Event("change"));
        setVal("subcaste", entry.subcaste);
    }
    setVal("generalcaste", entry.generalcaste);
    setVal("casteDocumentType", entry.castedocumenttype);
    // Saved photo wapas file-input me daalna
    filePath = entry.image || "";
    const preview = $("imagePreview");
    if (entry.image && entry.image.startsWith("data:")) {
        preview.src = entry.image;
        preview.style.display = "block";
        try {
            const blob = await (await fetch(entry.image)).blob();
            const file = new File([blob], "image.jpg", { type: blob.type || "image/jpeg" });
            const dt = new DataTransfer();
            dt.items.add(file);
            window.__saathiRestoringImage = true;
            $("image").files = dt.files;
            $("image").dispatchEvent(new Event("change", { bubbles: true }));
            setTimeout(() => { window.__saathiRestoringImage = false; }, 300);
        } catch (err) {
            window.__saathiRestoringImage = false;
            console.warn("Saved image restore failed:", err);
        }
    }
    else {
        preview.src = "";
        preview.style.display = "none";
    }
    showTab("form");
}
// "Load" button: saved entry ko active web-page par autofill karne ke liye bhejta hai
async function loadFormWithSavedData(id) {
    const entries = (await storage.get("formEntries")) || [];
    const entry = entries.find((x) => x.id === id);
    if (!entry) {
        alert("Saved entry not found");
        return;
    }
    if (chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs || !tabs[0]) {
                alert("No active tab to autofill");
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { action: "autofill", formData: entry }, function (response) {
                if (chrome.runtime.lastError) {
                    console.error("Error sending message to tab:", chrome.runtime.lastError.message);
                    alert("Could not send autofill message to the page. Make sure the page allows content scripts.");
                }
            });
        });
    }
    else {
        alert("chrome.tabs API not available");
    }
}
async function renderSavedList() {
    const listEl = document.getElementById("savedList");
    const noSaved = document.getElementById("noSaved");
    listEl.innerHTML = "";
    const entries = (await storage.get("formEntries")) || [];
    if (Array.isArray(entries)) {
        entries.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    }
    if (!entries.length) {
        noSaved.style.display = "block";
        return;
    }
    noSaved.style.display = "none";
    let counter = 0;
    entries.forEach((entry) => {
        counter++;
        const row = document.createElement("div");
        row.style.borderBottom = "1px solid #eee";
        row.style.padding = "8px 0";
        const top = document.createElement("div");
        top.style.display = "flex";
        top.style.justifyContent = "space-between";
        top.style.alignItems = "center";
        const info = document.createElement("div");
        info.innerHTML = `<div style="font-weight:bold; color:#ffffffff;">
          <h2 style="margin:0"> ${counter}. ${escapeHtml(entry.name || "—")}</h2>
        </div><div style="font-size:12px;color:#ffffffff;">Mobile:
        ${escapeHtml(entry.mobile || "")}</div>`;
        const buttons = document.createElement("div");
        const loadBtn = document.createElement("button");
        loadBtn.textContent = " Load ";
        loadBtn.className = "btn btn-success";
        loadBtn.style.marginRight = "8px";
        loadBtn.addEventListener("click", () => loadFormWithSavedData(entry.id));
        const updateBtn = document.createElement("button");
        updateBtn.textContent = "Update";
        updateBtn.className = "btn";
        updateBtn.style.marginRight = "8px";
        updateBtn.addEventListener("click", () => loadEntry(entry.id));
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.className = "btn btn-danger";
        deleteBtn.addEventListener("click", function () {
            if (!confirm("Do you want to delete ?"))
                return;
            deleteEntry(entry.id);
        });
        buttons.appendChild(loadBtn);
        buttons.appendChild(updateBtn);
        buttons.appendChild(deleteBtn);
        top.appendChild(info);
        top.appendChild(buttons);
        row.appendChild(top);
        const meta = document.createElement("div");
        meta.style.fontSize = "12px";
        meta.style.color = "#ffffffff";
        meta.style.marginTop = "6px";
        meta.innerHTML =
            "<div>Father Name: " + escapeHtml(entry.fathername || "") +
                " • Mother Name: " + escapeHtml(entry.mothername || "") +
                "</div><div>Saved: " + new Date(entry.savedAt).toLocaleString() + "</div>";
        row.appendChild(meta);
        listEl.appendChild(row);
    });
}
/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */
function showTab(name) {
    const formBox = document.getElementById("content-form");
    const savedBox = document.getElementById("content-saved");
    formBox.style.display = name === "form" ? "block" : "none";
    savedBox.style.display = name === "saved" ? "block" : "none";
    document.getElementById("tab-form").classList.toggle("active", name === "form");
    document.getElementById("tab-saved").classList.toggle("active", name === "saved");
    if (name === "saved")
        renderSavedList();
}
// Start par: saved entries ho to "saved" tab, warna "form" tab
async function show() {
    const entries = (await storage.get("formEntries")) || [];
    if (entries && entries.length)
        showTab("saved");
    else
        showTab("form");
}
/* ------------------------------------------------------------------ */
/* DOM ready: event listeners (main entry)                              */
/* ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
    // NOTE: ab district/anumandal/prakhand/gram ki lists popup me LOCAL data se banti hain
    // (popup.js + locationCascade.js). Page ko sirf sync ke liye message jata hai, aur page ke
    // jawab se popup ki list overwrite NAHI hoti (purana bug: Caste/Income page par page ke
    // jawab me [] aata tha aur District list khaali ho jati thi). Sirf Police Station ki list
    // page se li jati hai (uski values page-specific hain).
    // --- State changed
    document.getElementById("state").addEventListener("change", function () {
        updateDistricts();
        sendToPage({ action: "triggerStateChange", stateValue: this.value });
    });
    // --- District changed
    document.getElementById("district").addEventListener("change", async function () {
        const districtValue = this.value;
        updatePoliceStations();
        const resp = await sendToPage({ action: "triggerDistrictChange", districtValue: districtValue });
        if (!resp || resp.status !== "success" || document.getElementById("district").value !== districtValue) return;
        const psEl = document.getElementById("policeStation");
        if (resp.policeStationDropdown && resp.policeStationDropdown.length > 1) {
            populateDropdown(psEl, resp.policeStationDropdown);
        }
        const anumandalEl = document.getElementById("anumandal");
        if (anumandalEl.options.length <= 1 && resp.anumandalDropdown && resp.anumandalDropdown.length > 1) {
            populateDropdown(anumandalEl, resp.anumandalDropdown);
        }
    });
    // --- Anumandal changed
    document.getElementById("anumandal").addEventListener("change", async function () {
        const anumandalValue = this.value;
        const resp = await sendToPage({ action: "triggerAnumandalChange", anumandalValue: anumandalValue });
        const prakhandEl = document.getElementById("prakhand");
        if (resp && resp.status === "success" && prakhandEl.options.length <= 1 &&
            resp.prakhandDropdown && resp.prakhandDropdown.length > 1 &&
            document.getElementById("anumandal").value === anumandalValue) {
            populateDropdown(prakhandEl, resp.prakhandDropdown);
        }
    });
    // --- Prakhand changed
    document.getElementById("prakhand").addEventListener("change", async function () {
        const prakhandValue = this.value;
        const resp = await sendToPage({ action: "triggerPrakhandChange", prakhandValue: prakhandValue });
        if (resp && resp.status === "success") {
            const checked = document.querySelector('input[name="residenceType"]:checked');
            if (checked) checked.dispatchEvent(new Event("change", { bubbles: true }));
        }
        else if (resp && resp.status === "error") {
            console.error("Error changing prakhand on webpage:", resp.message);
        }
    });
    // --- Residence type radios -> web-page par bhi change karo (gram list popup me local hai)
    document.querySelectorAll('input[name="residenceType"]').forEach((radio) => {
        radio.addEventListener("change", async function () {
            const resp = await sendToPage({ action: "triggerResidenceTypeChange", residenceTypeValue: this.value });
            const gramEl = document.getElementById("gram");
            if (resp && resp.status === "success" && gramEl.options.length <= 1 &&
                resp.gramOptions && resp.gramOptions.length > 1) {
                populateDropdown(gramEl, resp.gramOptions);
            }
            else if (resp && resp.status === "error") {
                console.error("Error changing residence type on webpage:", resp.message);
            }
        });
    });
    // (Category -> Caste -> Sub-caste ka chain neeche attachPopupCascadingLogic me hai)
    // --- "Add new record" button
    const addNew = document.getElementById("addNewRecord");
    if (addNew) {
        addNew.addEventListener("click", function () {
            currentEditingId = null;
            filePath = "";
            document.getElementById("dataForm").reset();
            const preview = document.getElementById("imagePreview");
            preview.src = "";
            preview.style.display = "none";
            showTab("form");
        });
    }
    // --- Form submit / tabs
    document.getElementById("dataForm").addEventListener("submit", saveFormData);
    document.getElementById("tab-form").addEventListener("click", () => showTab("form"));
    document.getElementById("tab-saved").addEventListener("click", () => showTab("saved"));
    // --- Help/tutorial link (naye tab me kholta hai)
    const newRecordLink = document.getElementById("newRecordLink");
    if (newRecordLink) {
        newRecordLink.addEventListener("click", function (e) {
            e.preventDefault();
            chrome.tabs.create({ url: "https://qrgo.page.link/8YEcD" });
        });
    }
    // --- Form reset: preview + image attribute saaf karo
    document.getElementById("dataForm").addEventListener("reset", function () {
        filePath = "";
        const preview = document.getElementById("imagePreview");
        preview.src = "";
        preview.style.display = "none";
        document.getElementById("image").removeAttribute("data-image");
    });
    show();
    clearForm();
});













// ========================================================
// Click & Continue Popup - Category -> Caste -> Sub-Caste chain
// ========================================================
// Purane code ki dikkat: Sub-caste ki value options banne se PEHLE set ho jati thi (browser
// use chupchap hata deta hai), phir 300ms poller list banata aur "Please Select" dikhata —
// isliye Load/Update/OCR par sub-caste (aur kabhi-kabhi caste) kho jata tha.
// Ab #castecategory / #caste / #subcaste ki `.value` hook hai: koi bhi script value set kare,
// pehle sahi parent list ban jati hai, phir value lagti hai (order ki zaroorat nahi).
(function attachPopupCascadingLogic() {
  const catEl = document.getElementById("castecategory");
  const casteEl = document.getElementById("caste");
  const subEl = document.getElementById("subcaste");
  if (!catEl || !casteEl || !subEl) return;

  const PLEASE = '<option value="" autocomplete="off">Please Select</option>';
  const CD = (typeof casteData !== "undefined") ? casteData : (globalThis.casteData || {});
  const SD = (typeof subCasteData !== "undefined") ? subCasteData : (globalThis.subCasteData || {});
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  const nget = (el) => desc.get.call(el);
  const nset = (el, v) => desc.set.call(el, v);

  function optValues(html) {
    const out = [];
    String(html || "").replace(/value=["']([^"']*)["']/g, function (m, v) { if (v !== "") out.push(v); return m; });
    return out;
  }
  // value -> parent index
  const casteToCat = {}, subToCaste = {};
  Object.keys(CD).forEach(function (cat) { optValues(CD[cat].options).forEach(function (v) { if (!(v in casteToCat)) casteToCat[v] = cat; }); });
  Object.keys(SD).forEach(function (c) { optValues(SD[c].options).forEach(function (v) { if (!(v in subToCaste)) subToCaste[v] = c; }); });

  const hasOpt = (el, v) => Array.prototype.some.call(el.options, function (o) { return o.value === v; });
  function addOpt(el, v, label) {
    const o = document.createElement("option");
    o.value = v; o.textContent = label;
    el.appendChild(o);
  }

  let wantedSub = "";
  function buildCaste(cat) {
    casteEl.innerHTML = (cat && CD[cat]) ? CD[cat].options : PLEASE;
    casteEl.disabled = false;
    nset(casteEl, "");
  }
  function buildSub(caste) {
    const want = wantedSub || nget(subEl);
    if (caste && SD[caste]) {
      subEl.innerHTML = SD[caste].options;
      subEl.disabled = false;
    } else {
      subEl.innerHTML = PLEASE;
      subEl.disabled = true;
    }
    nset(subEl, "");
    if (want && hasOpt(subEl, want)) nset(subEl, want);
  }

  function hook(el, onSet) {
    Object.defineProperty(el, "value", {
      configurable: true,
      get: function () { return nget(this); },
      set: function (v) { onSet(v === null || v === undefined ? "" : String(v)); },
    });
  }

  hook(catEl, function (v) {
    const changed = nget(catEl) !== v;
    nset(catEl, v);
    if (changed) { wantedSub = ""; buildCaste(v); buildSub(""); }
  });

  hook(casteEl, function (v) {
    if (v) {
      const cat = nget(catEl);
      const inCurrent = cat && CD[cat] && optValues(CD[cat].options).indexOf(v) !== -1;
      if (!inCurrent && casteToCat[v]) {            // caste kisi aur category ki hai -> category theek karo
        nset(catEl, casteToCat[v]);
        buildCaste(casteToCat[v]);
        buildSub("");
      }
      if (!hasOpt(casteEl, v)) addOpt(casteEl, v, "Saved caste (" + v + ")");   // data kho na jaye
    }
    const changed = nget(casteEl) !== v;
    nset(casteEl, v);
    if (changed) buildSub(v);
  });

  hook(subEl, function (v) {
    if (v) {
      const owner = subToCaste[v];
      if (owner && nget(casteEl) !== owner) casteEl.value = owner;               // parent chain pehle
      if (!hasOpt(subEl, v)) { addOpt(subEl, v, "Saved sub-caste (" + v + ")"); subEl.disabled = false; }
    }
    wantedSub = v;
    nset(subEl, v);
  });

  // User khud select kare
  catEl.addEventListener("change", function () { wantedSub = ""; buildCaste(nget(catEl)); buildSub(""); });
  casteEl.addEventListener("change", function () { buildSub(nget(casteEl)); wantedSub = ""; });
  subEl.addEventListener("change", function () { wantedSub = nget(subEl); });

  // Public API (loadEntry / dusre scripts ke liye)
  window.saathiSetCasteChain = function (cat, caste, sub) {
    catEl.value = cat || "";
    casteEl.value = caste || "";
    subEl.value = sub || "";
  };
  window.saathiResetCasteChain = function () {
    wantedSub = "";
    nset(catEl, "");
    buildCaste("");
    buildSub("");
  };

  const form = catEl.closest("form");
  if (form) form.addEventListener("reset", function () { setTimeout(window.saathiResetCasteChain, 0); });

  buildSub("");   // shuru me sub-caste band (jab tak caste na chuni ho)
})();
