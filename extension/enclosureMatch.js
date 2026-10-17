/**
 * enclosureMatch.js  (v3.1)
 * ------------------------------------------------------------
 * Pure, DOM-free matching logic shared by
 *   - enclosureAutoFill.js (portal "Attach Enclosure(s)" step), and
 *   - docVault.js           (guess the type of an uploaded file).
 *
 * WHY THIS FILE EXISTS
 * The old matcher compared dropdown option TEXT against a short keyword
 * list. That broke in exactly the cases reported:
 *   - NCL options are written as "Form-XI", "Form - XIII", "Form–IV"
 *     (different dashes / spaces / Hindi "प्रपत्र") -> never matched, so
 *     the NCL document was never selected and never uploaded.
 *   - "Form-XI" is a substring of "Form-XIII", so a plain `includes`
 *     picks the wrong form.
 *   - Small spelling variants (ड्राईविंग / ड्राइविंग, सम्बन्धी / संबंधी)
 *     silently failed.
 * This engine detects roman-numeral forms with proper boundaries, knows
 * the spelling variants, scores every (option, saved document) pair and
 * falls back to a token-overlap match for labels it has never seen.
 *
 * Works both as a classic content/popup script (window.SaathiEnclosureMatch)
 * and under node (module.exports) so it can be unit-tested.
 * ------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SaathiEnclosureMatch = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- labels (Hindi) for every document type ----------
  const LABELS = {
    election_id: "निर्वाचन पहचान पत्र",
    voter_id: "मतदाता पहचान पत्र",
    pension_doc: "पेंशन दस्तावेज",
    driving_license: "ड्राइविंग लाइसेंस",
    aadhaar: "आधार कार्ड",
    passbook: "पासबुक",
    passport: "पासपोर्ट",
    smart_card_labour: "स्मार्ट कार्ड (श्रम मंत्रालय)",
    health_insurance_card: "स्वास्थ्य बीमा स्मार्ट कार्ड",
    pan_card: "पैन कार्ड",
    govt_id: "सरकारी पहचान पत्र",
    service_id: "सर्विस पहचान पत्र",
    revenue_khatiyan: "राजस्व अभिलेख - खतियान",
    caste_khatiyan: "राजस्व अभिलेख - खतियान",
    revenue_danpatra: "राजस्व अभिलेख - दानपत्र",
    caste_danpatra: "राजस्व अभिलेख - दानपत्र",
    revenue_land_doc: "राजस्व अभिलेख - भूमि संबंधी दस्तावेज",
    caste_land_doc: "राजस्व अभिलेख - भूमि संबंधी दस्तावेज",
    revenue_landless_allotment: "राजस्व अभिलेख - भूमिहीनों को आवंटित जमीन से संबंधित अभिलेख",
    caste_landless_allotment: "राजस्व अभिलेख - भूमिहीनों को आवंटित जमीन से संबंधित अभिलेख",
    revenue_other: "अन्य राजस्व अभिलेख",
    caste_other_revenue: "अन्य राजस्व अभिलेख",
    caste_site_inspection_request: "स्थल निरीक्षण हेतु आग्रह",
    ration_card: "राशन कार्ड",
    electricity_bill: "विद्युत विपत्र",
    telephone_bill: "दूरभाष विपत्र",
    salary_pension_slip: "वेतन / पेंशन पर्ची",
    income_tax_return: "आयकर रिटर्न",
    income_other: "अन्यान्य अभिलेख",
    ncl_b_affidavit_form11: "NCL बिहार — Form-XI स्वयं शपथ पत्र",
    ncl_c_affidavit_form8: "NCL केंद्र — Form-VIII स्वयं शपथ पत्र",
    ncl_form13_residence: "Form-XIII आवास प्रमाण पत्र",
    ncl_form4_caste: "Form-IV जाति प्रमाण पत्र",
    ncl_form16_income: "Form-XVI आय प्रमाण पत्र",
    ncl_b_irrigated_land_pct: "सिंचित जमीन का प्रतिशत (सिलिंग)",
  };

  // Roman-numeral NCL forms -> document type
  const FORM_TYPES = {
    XI: "ncl_b_affidavit_form11",
    VIII: "ncl_c_affidavit_form8",
    XIII: "ncl_form13_residence",
    IV: "ncl_form4_caste",
    XVI: "ncl_form16_income",
  };
  const ARABIC_FORM = { 4: "IV", 8: "VIII", 11: "XI", 13: "XIII", 16: "XVI" };

  // Identity documents: when a customer has several, this is the order we prefer.
  const PRIORITY = [
    "aadhaar", "voter_id", "election_id", "pan_card", "driving_license", "passport",
    "passbook", "smart_card_labour", "health_insurance_card", "pension_doc", "govt_id", "service_id",
  ];

  // type -> keyword rules. `alt` = other keys the SAME real-world document may
  // have been saved under (Caste vs Residence evidence). `not` = veto terms.
  const RULES = [
    { type: "election_id", terms: ["निर्वाचन पहचान", "election id", "election photo"] },
    { type: "voter_id", terms: ["मतदाता पहचान", "voter id", "voter card", "मतदाता पत्र"] },
    { type: "pension_doc", terms: ["पेंशन दस्तावेज", "पेन्शन दस्तावेज", "pension document"] },
    { type: "driving_license", terms: ["ड्राइविंग", "ड्राईविंग", "driving licen", "driving lic", "डीएल"] },
    { type: "aadhaar", terms: ["आधार", "aadhaar", "aadhar", "adhar", "uidai"] },
    { type: "passbook", terms: ["पासबुक", "पास बुक", "passbook", "pass book"] },
    { type: "passport", terms: ["पासपोर्ट", "passport"] },
    { type: "health_insurance_card", terms: ["स्वास्थ्य बीमा", "health insurance"] },
    { type: "smart_card_labour", terms: ["स्मार्ट कार्ड", "smart card"], not: ["स्वास्थ्य बीमा", "health insurance"] },
    { type: "pan_card", terms: ["पैन कार्ड", "पेन कार्ड", "pan card"] },
    { type: "govt_id", terms: ["सरकारी पहचान", "government id", "govt id", "govt. id"] },
    { type: "service_id", terms: ["सर्विस पहचान", "सेवा पहचान", "service id"] },

    { type: "revenue_khatiyan", alt: ["caste_khatiyan"], terms: ["खतियान", "khatiyan", "khatian"] },
    { type: "revenue_danpatra", alt: ["caste_danpatra"], terms: ["दानपत्र", "दान पत्र", "danpatra"] },
    { type: "revenue_land_doc", alt: ["caste_land_doc"], terms: ["भूमि संबंधी", "भूमि सम्बन्धी", "भूमि सम्बंधी", "भूमि संबन्धी", "land document", "land related"] },
    { type: "revenue_landless_allotment", alt: ["caste_landless_allotment"], terms: ["भूमिहीन", "landless"] },
    { type: "revenue_other", alt: ["caste_other_revenue"], terms: ["अन्य राजस्व", "other revenue"] },

    { type: "caste_site_inspection_request", terms: ["स्थल निरीक्षण", "site inspection"] },
    { type: "ration_card", terms: ["राशन कार्ड", "ration card", "राशनकार्ड"] },
    { type: "electricity_bill", terms: ["विद्युत विपत्र", "विद्युत बिल", "बिजली बिल", "बिजली विपत्र", "electricity bill", "electric bill"] },
    { type: "telephone_bill", terms: ["दूरभाष विपत्र", "दूरभाष बिल", "टेलीफोन बिल", "telephone bill", "phone bill"] },

    { type: "salary_pension_slip", terms: ["पेंशन पर्ची", "पेन्शन पर्ची", "वेतन", "salary slip", "pension slip"] },
    { type: "income_tax_return", terms: ["आयकर", "income tax", "income-tax"] },
    { type: "income_other", terms: ["अन्यान्य अभिलेख", "अन्यन्च अभिलेख", "अन्य अभिलेख", "any other record"] },

    // NCL — non-form wording (the roman-form detector below is stronger)
    { type: "ncl_b_irrigated_land_pct", terms: ["सिंचित", "सिलिंग", "सीलिंग", "ceiling", "irrigated"] },
  ];
  // NCL wording WITHOUT a roman form number: weaker (generic) evidence.
  const GENERIC_RULES = [
    { types: ["ncl_b_affidavit_form11", "ncl_c_affidavit_form8"], terms: ["शपथ पत्र", "शपथपत्र", "शपथ-पत्र", "affidavit"] },
    { types: ["ncl_form13_residence"], terms: ["आवास प्रमाण", "आवासीय प्रमाण", "निवास प्रमाण", "residence certificate"] },
    { types: ["ncl_form4_caste"], terms: ["जाति प्रमाण", "caste certificate"] },
    { types: ["ncl_form16_income"], terms: ["आय प्रमाण", "income certificate"] },
  ];

  const SCORE_FORM = 100, SCORE_RULE = 60, SCORE_GENERIC = 55, SCORE_FUZZY_BASE = 30;

  // ---------- text helpers ----------
  function norm(s) {
    let t = String(s == null ? "" : s);
    try { t = t.normalize("NFC"); } catch (e) { /* old engines */ }
    return t
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\u093c/g, "")                          // Devanagari nukta
      .toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, "-")          // every kind of dash -> "-"
      .replace(/\s+/g, " ")
      .trim();
  }

  const ROMAN = "(xvi|xiii|xiv|xii|xv|xi|viii|vii|vi|iv|ix|iii|ii|v|x|i)";
  const FORM_WORD = "(?:form|फॉर्म|फार्म|फ़ॉर्म|प्रपत्र)";
  const RE_FORM_ROMAN = new RegExp(FORM_WORD + "\\s*[-.:]?\\s*(?:no\\.?\\s*)?" + ROMAN + "(?![a-z])", "i");
  const RE_FORM_ARABIC = new RegExp(FORM_WORD + "\\s*[-.:]?\\s*(?:no\\.?\\s*)?(\\d{1,2})(?!\\d)", "i");

  /** "Form - XIII (…)" -> "XIII"; "प्रपत्र-4" -> "IV"; no form number -> "". */
  function detectRomanForm(text) {
    const t = norm(text);
    let m = t.match(RE_FORM_ROMAN);
    if (m) return m[1].toUpperCase();
    m = t.match(RE_FORM_ARABIC);
    if (m && ARABIC_FORM[Number(m[1])]) return ARABIC_FORM[Number(m[1])];
    return "";
  }

  /** Every document type one dropdown option's text could stand for: [{type, score}] */
  function classify(optionText) {
    const t = norm(optionText);
    const out = new Map();
    const add = (type, score) => { if (!out.has(type) || out.get(type) < score) out.set(type, score); };
    if (!t) return [];

    const rf = detectRomanForm(t);
    if (rf && FORM_TYPES[rf]) add(FORM_TYPES[rf], SCORE_FORM);

    for (const rule of RULES) {
      if (rule.not && rule.not.some((n) => t.includes(norm(n)))) continue;
      if (rule.terms.some((term) => t.includes(norm(term)))) {
        add(rule.type, SCORE_RULE);
        (rule.alt || []).forEach((a) => add(a, SCORE_RULE));
      }
    }
    if (!rf) {
      for (const g of GENERIC_RULES) {
        if (g.terms.some((term) => t.includes(norm(term)))) g.types.forEach((ty) => add(ty, SCORE_GENERIC));
      }
    }
    return Array.from(out, ([type, score]) => ({ type, score })).sort((a, b) => b.score - a.score);
  }

  // ---------- fuzzy fallback ----------
  const STOP = new Set(("का की के से में और एवं तथा हेतु द्वारा जारी form certificate document documents of the and card कार्ड " +
    "प्रमाण पत्र दस्तावेज अभिलेख आवेदक स्वयं please select").split(/\s+/));
  function tokens(s) {
    return new Set(norm(s).split(/[^a-z0-9\u0900-\u097f]+/).filter((w) => w.length >= 2 && !STOP.has(w)));
  }
  function tokenSim(a, b) {
    const A = tokens(a), B = tokens(b);
    const min = Math.min(A.size, B.size);
    if (!min) return 0;
    let inter = 0;
    A.forEach((w) => { if (B.has(w)) inter++; });
    if (inter === 0) return 0;
    if (inter < 2 && min > 1) return 0;               // one shared word out of several is not evidence
    return inter / min;
  }

  // ---------- service hint ----------
  function serviceBonus(type, service) {
    if (!service) return /^revenue_/.test(type) ? 1 : 0;           // old behaviour: revenue_* first
    if (service === "caste") return /^caste_/.test(type) ? 2 : 0;
    if (service === "residence") return /^revenue_/.test(type) ? 2 : 0;
    return /^revenue_/.test(type) ? 1 : 0;
  }
  const rankOf = (type) => { const i = PRIORITY.indexOf(type); return i === -1 ? 100 : i; };

  /**
   * Choose what to select in ONE enclosure row.
   *  options : [{ value, text, disabled? }]   (placeholder rows with empty value are ignored)
   *  avail   : Set / array of document types the customer has saved
   *  ctx     : { service?, allowed?(type)->bool, labels? }
   * returns   { pick: {type, option, index, score, via}|null, accepted: [type...], blocked: [type...] }
   */
  function planRow(options, avail, ctx) {
    ctx = ctx || {};
    const have = avail instanceof Set ? avail : new Set(avail || []);
    const cands = [];
    const accepted = new Set();
    const blocked = new Set();
    const real = [];
    (options || []).forEach((opt, index) => {
      if (!opt || opt.value === "" || opt.value == null || opt.disabled) return;
      real.push({ opt, index });
      classify(opt.text).forEach(({ type, score }) => {
        accepted.add(type);
        if (!have.has(type)) return;
        if (typeof ctx.allowed === "function" && !ctx.allowed(type)) { blocked.add(type); return; }
        cands.push({ type, option: opt, index, score: score + serviceBonus(type, ctx.service), via: "rule" });
      });
    });

    if (!cands.length) {
      // fuzzy: only for labels we could not classify at all
      const labels = ctx.labels || LABELS;
      real.forEach(({ opt, index }) => {
        if (classify(opt.text).length) return;
        have.forEach((type) => {
          if (typeof ctx.allowed === "function" && !ctx.allowed(type)) return;
          const sim = tokenSim(opt.text, labels[type] || "");
          if (sim >= 0.6) cands.push({ type, option: opt, index, score: SCORE_FUZZY_BASE + sim * 10, via: "fuzzy" });
        });
      });
    }

    cands.sort((a, b) => b.score - a.score || rankOf(a.type) - rankOf(b.type) || a.index - b.index);
    return { pick: cands[0] || null, alternatives: cands.slice(1), accepted: Array.from(accepted), blocked: Array.from(blocked) };
  }

  /** Types a row could accept at all (for the "upload one of these" hint). */
  function acceptedTypes(options) {
    return planRow(options, [], {}).accepted;
  }

  const labelFor = (type) => LABELS[type] || type;

  // ---------- OCR text -> document type (used by Doc Vault "smart add") ----------
  function guessFromText(text) {
    const t = norm(text);
    if (!t) return "";
    const rf = detectRomanForm(t);
    if (rf === "XI" && /शपथ|affidavit/.test(t)) return FORM_TYPES.XI;
    if (rf === "VIII" && /शपथ|affidavit/.test(t)) return FORM_TYPES.VIII;
    if (rf === "XIII") return FORM_TYPES.XIII;
    if (rf === "XVI") return FORM_TYPES.XVI;
    if (rf === "IV" && /जाति|caste/.test(t)) return FORM_TYPES.IV;
    if (/सिंचित|सिलिंग|सीलिंग/.test(t) && /प्रतिशत|percent|%/.test(t)) return "ncl_b_irrigated_land_pct";
    if (/खतियान/.test(t)) return "revenue_khatiyan";
    if (/विद्युत\s*(?:विपत्र|बिल)|बिजली\s*(?:बिल|विपत्र)|electricity\s*bill/.test(t)) return "electricity_bill";
    if (/driving\s*licen[cs]e|ड्राइविंग\s*लाइसेंस|ड्राईविंग\s*लाइसेंस/.test(t)) return "driving_license";
    if (/passport|पासपोर्ट/.test(t) && /republic of india|भारत गणराज्य/.test(t)) return "passport";
    if (/passbook|पासबुक/.test(t)) return "passbook";
    return "";
  }

  // ---------- which certificate page are we on (light hint only) ----------
  function pageService(doc) {
    try {
      const d = doc || (typeof document !== "undefined" ? document : null);
      if (!d) return "";
      const heads = Array.from(d.querySelectorAll("h1,h2,h3,h4,legend,.box-title,.page-title,title"))
        .map((e) => e.textContent || "").join(" ").slice(0, 3000);
      const t = norm((d.title || "") + " " + heads);
      if (/नॉन\s*क्रीमी|non[\s-]*creamy|\bncl\b/.test(t)) return "ncl";
      if (/आर्थिक\s*रूप\s*से\s*कमजोर|\bews\b/.test(t)) return "ews";
      if (/जाति|caste/.test(t)) return "caste";
      if (/निवास|आवास|residen|domicile/.test(t)) return "residence";
      if (/आय|income/.test(t)) return "income";
    } catch (e) { /* hint only */ }
    return "";
  }

  return {
    LABELS, FORM_TYPES, PRIORITY,
    norm, detectRomanForm, classify, planRow, acceptedTypes, labelFor, tokenSim,
    guessFromText, pageService,
  };
});
