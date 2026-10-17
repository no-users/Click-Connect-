/*
 * ewsFields.js — Click & Continue (popup side)
 * ---------------------------------------------------------------------
 * EWS (आर्थिक रूप से कमजोर वर्ग) form ke liye jo extra fields popup me nahi the,
 * unko "Form" tab me ek naye section me jodta hai, aur profile ke saath
 * SAVE / UPDATE / LOAD karta hai (nclFields.js jaisa hi tareeka).
 *
 * Naye fields: EWS category (क/ख), EWS jaati (general list se), parivar ki kul aay,
 * 5 shartein (haan/nahi), Prapatra-II self declaration.
 * DOB / Aadhaar / Religion / Salutation / Holding / Circle / Certificate language
 * nclFields.js wale fields se hi liye jaate hain — dobara nahi poochhe jaate.
 *
 * popup.js ko EDIT nahi kiya gaya — sirf uske readForm() aur loadEntry() ko wrap kiya
 * gaya hai. popup.html me yeh script nclFields.js ke BAAD load hona chahiye.
 */
(function () {
  "use strict";
  if (window.__saathiEwsFieldsLoaded) return;
  window.__saathiEwsFieldsLoaded = true;

  const FIELDS = [
    { key: "ews_category", label: "[EWS] वर्ग / Category", type: "select",
      opts: [["1", "(क) OBC / SC / ST / पिछड़ा / अति-पिछड़ा सूची में नहीं (सामान्य)"],
             ["2", "(ख) बिहार SC/ST सूची में नहीं, पर पिछड़ा/अति-पिछड़ा सूची में हैं"]] },
    { key: "ews_casteText", label: "[EWS] जाति (सामान्य सूची से) — खाली = profile की जाति", type: "text",
      ph: "जैसे राजपूत / Rajput" },
    { key: "ews_income", label: "[EWS] परिवार की कुल वार्षिक आय ₹ — खाली = आय वाले fields का योग", type: "text",
      ph: "जैसे 120000", max: 7 },
    { key: "ews_criteria", label: "[EWS] 5 शर्तें आवेदक ने मानी हैं? (आय < 8 लाख, भूमि/फ्लैट/प्लॉट सीमा)", type: "select",
      opts: [["", "— (हाथ से tick करूँगा)"], ["1", "हाँ — 5 शर्तें auto-tick करें"]] },
    { key: "ews_formII", label: "[EWS] प्रपत्र-II स्व-घोषणा पत्र संलग्न है", type: "checkbox", def: false },
  ];

  const elId = (key) => "f_" + key;

  function buildField(f) {
    const grp = document.createElement("div");
    grp.className = "form-group";
    const lab = document.createElement("label");
    lab.setAttribute("for", elId(f.key));
    lab.textContent = f.label;
    grp.appendChild(lab);
    let inp;
    if (f.type === "select") {
      inp = document.createElement("select");
      f.opts.forEach(([v, t], i) => {
        const o = document.createElement("option");
        o.value = v; o.textContent = t;
        if (i === 0) o.defaultSelected = true;
        inp.appendChild(o);
      });
    } else if (f.type === "checkbox") {
      inp = document.createElement("input");
      inp.type = "checkbox";
      inp.defaultChecked = !!f.def;
      inp.checked = !!f.def;
      inp.style.width = "auto";
    } else {
      inp = document.createElement("input");
      inp.type = "text";
      if (f.ph) inp.placeholder = f.ph;
      if (f.max) inp.maxLength = f.max;
    }
    inp.id = elId(f.key);
    grp.appendChild(inp);
    return grp;
  }

  function inject() {
    if (document.getElementById("ewsExtraSection")) return true;
    const cont = document.querySelector("#dataForm .form-container");
    if (!cont) return false;
    const anchor = cont.querySelector(".form-actions");

    const head = document.createElement("div");
    head.className = "form-group";
    head.id = "ewsExtraSection";
    head.setAttribute("style", "grid-column: span 3;");
    const h3 = document.createElement("h3");
    h3.textContent = "EWS ke extra details";
    head.appendChild(h3);

    const frag = document.createDocumentFragment();
    frag.appendChild(head);
    FIELDS.forEach((f) => frag.appendChild(buildField(f)));
    if (anchor) cont.insertBefore(frag, anchor); else cont.appendChild(frag);
    return true;
  }

  function collect() {
    const out = {};
    FIELDS.forEach((f) => {
      const e = document.getElementById(elId(f.key));
      if (!e) return;
      out[f.key] = f.type === "checkbox" ? !!e.checked : String(e.value == null ? "" : e.value).trim();
    });
    return out;
  }

  function restore(entry) {
    FIELDS.forEach((f) => {
      const e = document.getElementById(elId(f.key));
      if (!e) return;
      const v = entry ? entry[f.key] : undefined;
      if (f.type === "checkbox") {
        e.checked = v === undefined ? !!f.def : (v === true || v === "1" || v === "true");
      } else {
        e.value = v == null ? (f.type === "select" ? f.opts[0][0] : "") : v;
      }
    });
  }

  /* ---- popup.js (aur nclFields.js) ke functions ke upar wrap ---- */
  const origRead = typeof window.readForm === "function" ? window.readForm : null;
  if (origRead) {
    window.readForm = function () {
      const o = origRead.apply(this, arguments);
      try { Object.assign(o, collect()); } catch (e) { console.warn("[EWS] collect failed", e); }
      return o;
    };
  }

  const origLoad = typeof window.loadEntry === "function" ? window.loadEntry : null;
  if (origLoad) {
    window.loadEntry = async function (id) {
      const r = await origLoad.apply(this, arguments);
      try {
        const entries = (await storage.get("formEntries")) || [];
        const entry = entries.find((x) => x.id === id);
        if (entry) restore(entry);
      } catch (e) { console.warn("[EWS] restore failed", e); }
      return r;
    };
  }

  function init() {
    if (!inject()) return;
    const form = document.getElementById("dataForm");
    if (form && window.MutationObserver) {
      new MutationObserver(function () { inject(); }).observe(form, { childList: true, subtree: false });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  setTimeout(init, 400); // late-built form ke liye safety
})();
