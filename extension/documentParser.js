/**
 * documentParser.js  (v2 — advanced)
 * ------------------------------------------------------------
 * Turns raw OCR text (Aadhaar, ration card, voter ID, caste /
 * income / residence certificates …) into a partial object that
 * matches the #dataForm field IDs already used by this extension.
 *
 * Nothing here talks to content.js or popup.js directly — it only
 * produces plain JS objects. docsTab.js writes them into the form.
 *
 * Fixes / upgrades compared to v1:
 *   - Document type is now SCORED, not "first keyword wins" (an
 *     income certificate that merely mentions "Aadhaar" used to be
 *     classified as an Aadhaar card).
 *   - Name fields stop at the next label (v1 could swallow
 *     "Rahul Kumar Father Name" into one value) and work line-by-line.
 *   - D/O now means "daughter of FATHER" (v1 mapped it to mother).
 *   - Devanagari digits (०-९) and OCR look-alikes (O/l/I in numbers)
 *     are normalised before number extraction.
 *   - Aadhaar number is Verhoeff-validated; mobile must start 6-9;
 *     PIN prefers Bihar range (80-85) and labelled values.
 *   - Whole-word district matching (no more "Saran" inside a name),
 *     Hindi district names, address labels (VTC / PO / PS / Ward).
 *   - Category / profession only read where they make sense.
 *   - Extra info-only fields (info_dob, info_aadhaar, info_epic …)
 *     shown in the review table but never written into the form.
 * ------------------------------------------------------------
 */

const DocumentParser = (function () {

  // ---- Reference data ---------------------------------------------------

  // [English, Hindi] — English is what gets returned (matches option text "PATNA/पटना").
  const DISTRICTS = [
    ["Araria","अररिया"],["Arwal","अरवल"],["Aurangabad","औरंगाबाद"],["Banka","बांका"],
    ["Begusarai","बेगूसराय"],["Bhagalpur","भागलपुर"],["Bhojpur","भोजपुर"],["Buxar","बक्सर"],
    ["Darbhanga","दरभंगा"],["East Champaran","पूर्वी चंपारण"],["Motihari","मोतिहारी"],
    ["Gaya","गया"],["Gopalganj","गोपालगंज"],["Jamui","जमुई"],["Jehanabad","जहानाबाद"],
    ["Kaimur","कैमूर"],["Bhabua","भभुआ"],["Katihar","कटिहार"],["Khagaria","खगड़िया"],
    ["Kishanganj","किशनगंज"],["Lakhisarai","लखीसराय"],["Madhepura","मधेपुरा"],
    ["Madhubani","मधुबनी"],["Munger","मुंगेर"],["Muzaffarpur","मुजफ्फरपुर"],["Nalanda","नालंदा"],
    ["Nawada","नवादा"],["Patna","पटना"],["Purnia","पूर्णिया"],["Purnea","पूर्णिया"],
    ["Rohtas","रोहतास"],["Saharsa","सहरसा"],["Samastipur","समस्तीपुर"],["Saran","सारण"],
    ["Sheikhpura","शेखपुरा"],["Sheohar","शिवहर"],["Sitamarhi","सीतामढ़ी"],["Siwan","सिवान"],
    ["Supaul","सुपौल"],["Vaishali","वैशाली"],["West Champaran","पश्चिमी चंपारण"],["Bettiah","बेतिया"],
  ];
  // Kept for any other file that reads DocumentParser.BIHAR_DISTRICTS.
  const BIHAR_DISTRICTS = DISTRICTS.map(d => d[0]);

  const PROFESSION_MAP = [
    { value: "1", terms: ["student", "छात्र"] },
    { value: "2", terms: ["govt. service", "government service", "govt service", "सरकारी सेवा"] },
    { value: "3", terms: ["private service", "निजी सेवा"] },
    { value: "4", terms: ["business", "व्यापार"] },
    { value: "5", terms: ["farmer", "किसान", "agriculture", "कृषि"] },
    { value: "6", terms: ["housewife", "गृहिणी"] },
  ];

  // Caste category dropdown (#castecategory) — most specific phrase first.
  const CASTE_CATEGORY_MAP = [
    { value: "1", terms: ["अत्यंत पिछड़ा", "अति पिछड़ा", "extremely backward", "\\bebc\\b"] },
    { value: "4", terms: ["अनुसूचित जनजाति", "scheduled tribe", "\\bst\\b"] },
    { value: "3", terms: ["अनुसूचित जाति", "scheduled caste", "\\bsc\\b"] },
    { value: "2", terms: ["पिछड़ा वर्ग", "backward class", "\\bobc\\b", "\\bbc\\b"] },
    { value: "5", terms: ["गैर आरक्षित", "general category", "unreserved"] },
  ];

  // Weighted signatures. Strong "title" phrases outweigh incidental mentions.
  const DOC_SIGNATURES = {
    aadhaar: [
      [/unique identification authority/i, 5], [/uidai/i, 4], [/भारतीय\s*विशिष्ट\s*पहचान/, 5],
      [/मेरा\s*आधार/, 5], [/आम\s*आदमी\s*का\s*अधिकार/, 5], [/aadhaar|aadhar/i, 1.5], [/आधार/, 1.5],
      [/government of india|भारत\s*सरकार/i, 1], [/\bVTC\b/i, 3], [/\bVID\b\s*:?\s*\d/i, 3],
    ],
    voter_id: [
      [/election commission of india/i, 5], [/निर्वाचन\s*आयोग/, 5], [/electors?\s*photo/i, 5],
      [/\belector\b/i, 3], [/मतदाता|निर्वाचक/, 3], [/\bepic\b/i, 2],
    ],
    ration_card: [
      [/ration\s*card/i, 5], [/राशन\s*कार्ड/, 5], [/public distribution/i, 2], [/अंत्योदय|antyodaya/i, 2],
      [/food\s*(?:and|&)\s*consumer/i, 2], [/खाद्य\s*(?:एवं|और)\s*उपभोक्ता/, 2], [/राशन/, 1],
    ],
    caste_certificate: [
      [/caste\s*certificate/i, 6], [/जाति\s*प्रमाण/, 6], [/scheduled caste|scheduled tribe|backward class/i, 1],
      [/अनुसूचित\s*जाति|पिछड़ा\s*वर्ग|जनजाति/, 1], [/\bcaste\b|जाति/i, 1],
    ],
    income_certificate: [
      [/income\s*certificate/i, 6], [/आय\s*प्रमाण/, 6], [/annual\s*income|वार्षिक\s*आय/i, 2], [/कुल\s*आय|total\s*income/i, 1],
    ],
    residence_certificate: [
      [/resid(?:ence|ential)\s*certificate/i, 6], [/(?:निवास|आवासीय|निवासी)\s*प्रमाण/, 6], [/domicile/i, 4],
    ],
  };

  // ---- Generic helpers ------------------------------------------------------

  const DEV_DIGITS = "०१२३४५६७८९";

  function normalizeDigits(s) {
    return (s || "").replace(/[०-९]/g, d => String(DEV_DIGITS.indexOf(d)));
  }

  /** O/o→0, l/I/|→1, S→5, B→8 — ONLY for tokens we already know are meant to be numbers. */
  function fixDigitLookalikes(tok) {
    return tok.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
  }

  function norm(text) { return (text || "").replace(/\s+/g, " ").trim(); }

  // JS \b only understands ASCII word characters, so it NEVER fires next to
  // Devanagari. These lookaround pieces are the Hindi-safe replacement.
  const NOT_DEV_BEFORE = "(?<![\\u0900-\\u097F])";
  const NOT_DEV_AFTER = "(?![\\u0900-\\u097F])";
  const HON_PREFIX_RE = /^(?:श्री(?:मती)?|सुश्री|कुमारी|शिवश्री|shri|smt\.?|mr\.?|mrs\.?|ms\.?|kumari|late|स्व\.?)\s+/i;
  function stripHonorific(v) {
    let prev;
    do { prev = v; v = v.replace(HON_PREFIX_RE, ""); } while (v !== prev);
    return v;
  }

  function toLines(text) {
    return (text || "").split(/\r?\n/).map(l => norm(l)).filter(Boolean);
  }

  const NAME_CHARS = "A-Za-z\\u0900-\\u097F\\s\\.'\\-";

  // Next-label detector: a captured value is cut where any of these begins.
  const STOP_LABELS = [
    "father'?s?\\s*name", "mother'?s?\\s*name", "husband'?s?\\s*name", "पिता", "माता", "पति", "पत्नी",
    "\\bS\\/O\\b", "\\bD\\/O\\b", "\\bW\\/O\\b", "\\bC\\/O\\b", "\\bDOB\\b", "date\\s*of\\s*birth", "year\\s*of\\s*birth",
    "जन्म", "\\bgender\\b", "\\bsex\\b", "लिंग", "\\baddress\\b", "पता", "\\bvillage\\b", "\\bvill\\b", "\\bVTC\\b",
    "\\bP\\.?O\\b\\.?", "\\bP\\.?S\\b\\.?", "post\\s*office", "police\\s*station", "थाना", "डाकघर", "पोस्ट",
    "sub\\s*district", "\\bdist(?:rict)?\\b", "जिला", "\\bstate\\b", "राज्य", "\\bpin\\b", "पिन",
    "mobile", "phone", "मोबाइल", "\\bward\\b", "वार्ड", "\\bblock\\b", "प्रखंड", "\\bincome\\b", "\\bcaste\\b",
    "जाति", "\\bcategory\\b", "\\bage\\b", "\\bmale\\b", "\\bfemale\\b", "पुरुष", "महिला", "ग्राम", "गाँव", "गांव",
    "\\bname\\b", "नाम",
  ];
  const STOP_RE = new RegExp("(?:" + STOP_LABELS.join("|") + ")", "i");

  function stripEdges(v) {
    return norm(v).replace(/^[\s:;\-–—|_.,()\[\]]+/, "").replace(/[\s:;\-–—|_.,()\[\]]+$/, "");
  }

  /** Cuts value at the next label and tidies OCR junk. Returns "" if nothing sensible is left. */
  function cutAtNextLabel(value) {
    const m = STOP_RE.exec(value);
    const v = m && m.index > 0 ? value.slice(0, m.index) : value;
    return stripEdges(v);
  }

  function isPlausibleName(v) {
    if (!v) return false;
    if (v.length < 3 || v.length > 60) return false;
    if (/\d/.test(v)) return false;
    const letters = v.replace(/[^A-Za-z\u0900-\u097F]/g, "");
    if (letters.length < 3) return false;
    if (v.split(/\s+/).length > 6) return false;
    // Pure label words that slipped through (e.g. "Male", "Government of India").
    if (/^(male|female|government of india|india|bihar|govt)$/i.test(v)) return false;
    return true;
  }

  /** Drops 1-char stray tokens OCR leaves at the end ("Suresh Prasad i", "Rahul Kumar |"). */
  function tidyName(v) {
    let parts = v.split(/\s+/).filter(Boolean);
    while (parts.length > 1) {
      const last = parts[parts.length - 1];
      const letters = last.replace(/[^A-Za-z\u0900-\u097F]/g, "");
      const strayChar = letters.length < 2 && !/\.$/.test(last);
      const lowerNoise = /^[a-z]{1,2}$/.test(last); // "os", "i" — names are capitalised, OCR junk is not
      if (strayChar || lowerNoise) parts.pop(); else break;
    }
    return parts.join(" ").replace(/\s+\./g, ".");
  }

  /**
   * Find the value that follows any of the label regexes.
   * Looks on the same line first, then the next line (OCR often puts the
   * value on its own line). `allowedChars` keeps junk symbols out.
   */
  function valueAfterLabel(lines, labelRes, opts) {
    opts = opts || {};
    const chars = opts.chars || NAME_CHARS;
    const valueRe = new RegExp(`^[\\s:;\\-–—|=]*([${chars}]{2,80})`);
    const found = [];
    for (let i = 0; i < lines.length; i++) {
      for (const labelRe of labelRes) {
        const m = labelRe.exec(lines[i]);
        if (!m) continue;
        if (opts.notAfter && opts.notAfter.test(lines[i].slice(Math.max(0, m.index - 16), m.index))) continue;
        const rest = lines[i].slice(m.index + m[0].length);
        const candidates = [rest];
        if (i + 1 < lines.length && !opts.sameLineOnly) candidates.push(lines[i + 1]);
        for (const c of candidates) {
          const vm = valueRe.exec(c);
          if (!vm) continue;
          let v = cutAtNextLabel(vm[1]);
          if (opts.commaStop) v = stripEdges(v.split(/[,;]/)[0]);
          if (opts.honorific !== false) v = stripHonorific(v);
          if (opts.validate ? opts.validate(v) : isPlausibleName(v)) {
            found.push(opts.tidy === false ? v : tidyName(v));
            break;
          }
        }
      }
      // Without preferLatin the first hit wins immediately (cheap path).
      if (found.length && opts.preferLatin === false) return found[0];
    }
    if (!found.length) return null;
    // Cards print both a Hindi and an English line — the English one is
    // what the portal's name/address boxes expect, so prefer it.
    return found.find(v => /[A-Za-z]/.test(v)) || found[0];
  }

  // ---- Verhoeff (Aadhaar checksum) -----------------------------------------

  const V_D = [
    [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],
    [5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0],
  ];
  const V_P = [
    [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
    [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
  ];
  function verhoeffValid(num) {
    let c = 0;
    const digits = num.split("").reverse().map(Number);
    for (let i = 0; i < digits.length; i++) c = V_D[c][V_P[i % 8][digits[i]]];
    return c === 0;
  }

  // ---- Document type ------------------------------------------------------

  function findAadhaarNumbers(flat) {
    const out = [];
    const re = /(?<!\d)(\d{4})\s?(\d{4})\s?(\d{4})(?!\d)/g;
    let m;
    while ((m = re.exec(flat))) {
      const num = m[1] + m[2] + m[3];
      if (/^[01]/.test(num)) continue; // Aadhaar never starts with 0 or 1
      out.push({ num, valid: verhoeffValid(num), index: m.index });
    }
    return out;
  }

  function findEpic(flat) {
    const m = flat.toUpperCase().match(/\b([A-Z]{3}[0-9]{7})\b/);
    return m ? m[1] : null;
  }

  function detectDocType(text) {
    const flat = norm(normalizeDigits(text));
    const scores = {};
    for (const [type, sigs] of Object.entries(DOC_SIGNATURES)) {
      scores[type] = sigs.reduce((s, [re, w]) => s + (re.test(flat) ? w : 0), 0);
    }
    const nums = findAadhaarNumbers(flat);
    if (nums.some(n => n.valid)) scores.aadhaar += 3;
    if (findEpic(flat)) scores.voter_id += 4;

    let best = "unknown", bestScore = 0;
    for (const [type, s] of Object.entries(scores)) if (s > bestScore) { best = type; bestScore = s; }
    return bestScore >= 3 ? best : "unknown";
  }

  // ---- Field extractors ---------------------------------------------------

  const NOT_AFTER_RELATION = /(father'?s?|mother'?s?|husband'?s?|wife'?s?|पिता|माता|पति|पत्नी|village|ग्राम|गाँव|गांव|post|police|office|district|block|panchayat|पंचायत|relation'?s?|nominee|कार्यालय|दुकान|shop|dealer|डीलर)\s*(?:का|के)?\s*$/i;

  const HON = "(?:श्री(?:मती)?|सुश्री|कुमारी|shri|smt\\.?|mr\\.?|mrs\\.?|ms\\.?|kumari)";

  function extractNames(flat, lines, rawText) {
    const out = {};

    // --- Relations (explicit labels first, then S/O D/O W/O) ---
    out.fathername =
      valueAfterLabel(lines, [new RegExp(`father'?s?\\s*name|पिता\\s*(?:\\/\\s*पति\\s*)?(?:का\\s*)?नाम|पिता\\s*का|\\bfather\\b|पिता${NOT_DEV_AFTER}`, "i")]) ||
      valueAfterLabel(lines, [/\bS\s*\/\s*O\b\.?/i, /\bD\s*\/\s*O\b\.?/i, /\bson\s*of\b|\bdaughter\s*of\b/i, new RegExp(`सुपुत्र(?:ी)?|${NOT_DEV_BEFORE}पुत्र(?:ी)?${NOT_DEV_AFTER}`)], { sameLineOnly: false });

    out.mothername =
      valueAfterLabel(lines, [new RegExp(`mother'?s?\\s*name|माता\\s*का\\s*नाम|माता\\s*का|\\bmother\\b|माता${NOT_DEV_AFTER}`, "i")]);

    out.husbandname =
      valueAfterLabel(lines, [new RegExp(`husband'?s?\\s*name|पति\\s*का\\s*नाम|पति\\s*का|\\bhusband\\b`, "i"), /\bW\s*\/\s*O\b\.?/i, /\bwife\s*of\b/i]);

    // --- Own name ---
    out.name =
      valueAfterLabel(
        lines,
        [new RegExp(`\\bname\\b|${NOT_DEV_BEFORE}नाम${NOT_DEV_AFTER}`, "i")],
        { notAfter: NOT_AFTER_RELATION }
      ) ||
      // Certificate wording: "श्री राहुल कुमार, पिता ... की जाति ..."
      valueAfterLabel(lines, [new RegExp(`(?<![A-Za-z\\u0900-\\u097F])${HON}(?=\\s)`, "i")], { sameLineOnly: true, commaStop: true, honorific: false }) ||
      // Aadhaar: no "Name:" label — the name sits right above the DOB / gender line.
      extractNameNearDob(rawText || flat);

    // A person is never their own father: if OCR duplicated the line, drop the relation.
    ["fathername", "mothername", "husbandname"].forEach(k => {
      if (out[k] && out.name && out[k].toLowerCase() === out.name.toLowerCase()) out[k] = null;
    });
    return out;
  }

  // Lines printed on every Aadhaar card — never a person's name.
  const AADHAAR_BOILERPLATE = [
    /government of india/i, /भारत सरकार/, /unique identification authority/i, /uidai/i, /आधार/, /aadhaar/i,
    /आम आदमी का अधिकार/, /\b(?:male|female)\b|पुरुष|महिला/i, /^\d[\d\s]{6,}$/, /भारतीय\s*विशिष्ट/, /मेरा\s*आधार/,
    /help@|www\.|1947|dob|जन्म/i, /^vid\b/i, /download|issue|date/i,
  ];

  function extractNameNearDob(text) {
    // stripEdges: OCR often leaves a stray "|" or "." at the end of a name line.
    const lines = toLines(normalizeDigits(text)).map(stripEdges).filter(Boolean);
    if (lines.length < 2) return null;
    const isBoilerplate = l => AADHAAR_BOILERPLATE.some(re => re.test(l));
    const isNameLike = l => new RegExp(`^[${NAME_CHARS}]{3,50}$`).test(l) && l.replace(/[^A-Za-z\u0900-\u097F]/g, "").length >= 3;
    const pickBest = cands => {
      const ok = cands.filter(l => isNameLike(l) && !isBoilerplate(l));
      const latin = ok.find(l => /^[A-Za-z]/.test(l));
      const pick = latin || ok[0];
      return pick ? tidyName(stripEdges(pick)) : null;
    };

    const dobIdx = lines.findIndex(l => /जन्म[\s\-]*(?:तारीख|तिथि)|\bdob\b|date of birth|year of birth|\byob\b/i.test(l));
    if (dobIdx > 0) { const f = pickBest(lines.slice(Math.max(0, dobIdx - 3), dobIdx).reverse()); if (f) return f; }

    const genderIdx = lines.findIndex(l => /\b(male|female)\b|पुरुष|महिला|ट्रांसजेंडर/i.test(l));
    if (genderIdx > 0) { const f = pickBest(lines.slice(Math.max(0, genderIdx - 4), genderIdx).reverse()); if (f) return f; }

    const govIdx = lines.findIndex(l => /government of india|भारत सरकार/i.test(l));
    if (govIdx >= 0) { const f = pickBest(lines.slice(govIdx + 1, govIdx + 4)); if (f) return f; }
    return null;
  }

  function extractGender(flat, lines, docType) {
    const labelled = flat.match(/(?:gender|sex|लिंग)\s*[:\-]?\s*(female|male|महिला|स्त्री|पुरुष|f\b|m\b)/i);
    if (labelled) {
      const v = labelled[1].toLowerCase();
      return /^(female|महिला|स्त्री|f)$/.test(v) ? "2" : "1";
    }
    // A line that is JUST the gender, e.g. "पुरुष / MALE" on an Aadhaar front.
    for (const l of lines) {
      if (/^(?:महिला|स्त्री)?\s*[\/|]?\s*female$|^महिला\s*(?:[\/|]\s*female)?$/i.test(l)) return "2";
      if (/^(?:पुरुष)?\s*[\/|]?\s*male$|^पुरुष\s*(?:[\/|]\s*male)?$/i.test(l)) return "1";
    }
    // Last resort only on ID cards, where those words are reliably the holder's gender.
    if (docType === "aadhaar" || docType === "voter_id") {
      if (/\bfemale\b|महिला/i.test(flat)) return "2";
      if (/\bmale\b|पुरुष/i.test(flat)) return "1";
    }
    return null;
  }

  function extractMobile(flat) {
    const labelled = flat.match(/(?:mobile|phone|mob|contact|मोबाइल|फोन|संपर्क)[^0-9A-Za-z]{0,12}((?:\+?91[\s\-]?)?[6-9][0-9OolI|\s\-]{9,13})/i);
    if (labelled) {
      const digits = fixDigitLookalikes(labelled[1]).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
      if (/^[6-9]\d{9}$/.test(digits)) return digits;
    }
    const re = /(?<![\d])([6-9]\d{9})(?![\d])/g;
    let m;
    while ((m = re.exec(flat))) {
      const around = flat.slice(Math.max(0, m.index - 6), m.index + 16);
      if (/\d{4}\s\d{4}\s\d{4}/.test(around)) continue; // part of an Aadhaar number
      return m[1];
    }
    return null;
  }

  function extractEmail(flat) {
    const m = flat.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/i);
    return m && !/uidai\.gov\.in$/i.test(m[0]) ? m[0] : null; // skip printed UIDAI help address
  }

  function extractPin(flat) {
    const labelled = flat.match(/(?:pin\s*-?\s*code|pincode|\bpin\b|पिन\s*(?:कोड)?)[^0-9A-Za-z]{0,8}([0-9OolI]{6})(?!\d)/i);
    if (labelled) {
      const v = fixDigitLookalikes(labelled[1]);
      if (/^\d{6}$/.test(v)) return v;
    }
    const all = (flat.match(/(?<!\d)[1-9]\d{5}(?!\d)/g) || []);
    return all.find(p => /^8[0-5]/.test(p)) || null; // Bihar PINs only; a random 6-digit amount is not a PIN
  }

  function matchDistrict(text, allowHindi) {
    const lower = text.toLowerCase();
    for (const [en, hi] of DISTRICTS) {
      const enRe = new RegExp(`(?<![a-z])${en.toLowerCase().replace(/\s+/g, "\\s+")}(?![a-z])`);
      if (enRe.test(lower)) return en;
      // "गया" is also an ordinary Hindi word ("किया गया"), so Hindi names are
      // only trusted right after a District label — never from free text.
      if (allowHindi && new RegExp(`${NOT_DEV_BEFORE}${hi}${NOT_DEV_AFTER}`).test(text)) return en;
    }
    return null;
  }

  function extractDistrict(flat, lines) {
    // 1) The value right after a District label is the most trustworthy.
    //    "Sub District: Danapur" must not be mistaken for it.
    const re = /(?<!sub\s)(?<!sub-)(?:\bdist(?:rict)?\b|जिला|जिले)\s*[:\-\.]?\s*([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F ]{2,30})/gi;
    let m;
    while ((m = re.exec(flat))) {
      const hit = matchDistrict(m[1], true);
      if (hit) return hit;
    }
    // 2) Fallback: an English district name anywhere in an address-like text.
    return matchDistrict(flat, false);
  }

  function extractProfession(flat, docType) {
    // Free-floating words like "business" appear in many unrelated sentences,
    // so only trust them on certificates (or right after a Profession label).
    const labelled = flat.match(/(?:profession|occupation|पेशा|व्यवसाय)\s*[:\-]?\s*([A-Za-z\u0900-\u097F. ]{3,30})/i);
    const scope = labelled ? labelled[1] : (/(?:income|caste|residence)_certificate/.test(docType) ? flat : "");
    const lower = scope.toLowerCase();
    for (const entry of PROFESSION_MAP) if (entry.terms.some(t => lower.includes(t.toLowerCase()))) return entry.value;
    return null;
  }

  function extractCasteCategory(flat, docType) {
    if (docType !== "caste_certificate" && !/(?:category|वर्ग|श्रेणी)/i.test(flat)) return null;
    const lower = flat.toLowerCase();
    for (const entry of CASTE_CATEGORY_MAP) if (entry.terms.some(t => new RegExp(t, "i").test(lower))) return entry.value;
    return null;
  }

  function extractTotalIncome(flat) {
    const m = flat.match(/(?:total\s*income|annual\s*income|वार्षिक\s*आय|कुल\s*आय|आय)[^0-9]{0,25}(?:rs\.?|₹|रु\.?|रुपये)?\s*(\d[\d,]{2,10})/i);
    return m ? m[1].replace(/,/g, "") : null;
  }

  function extractAddressParts(flat, lines) {
    const addr = {};
    const placeChars = "A-Za-z\\u0900-\\u097F0-9\\s\\.\\-'";
    const place = v => v && /[A-Za-z\u0900-\u097F]{2,}/.test(v) && v.length <= 40;

    addr.village = valueAfterLabel(lines, [/\bVTC\b\s*[:\-]?/i, /\bvillage\b(?:\s*\/\s*town)?/i, /\bvill\b\.?/i, /(?:ग्राम|गाँव|गांव)(?:\s*\/\s*(?:कस्बा|शहर))?/], { chars: placeChars, validate: place, commaStop: true, sameLineOnly: true, tidy: false });
    addr.postoffice = valueAfterLabel(lines, [/\bP\.?\s?O\b\.?\s*[:\-]/i, /post\s*office/i, /डाकघर|पोस्ट\s*ऑफिस|पोस्ट/], { chars: placeChars, validate: place, commaStop: true, sameLineOnly: true, tidy: false });
    addr.policeStation = valueAfterLabel(lines, [/\bP\.?\s?S\b\.?\s*[:\-]/i, /police\s*station/i, /थाना|पुलिस\s*स्टेशन/], { chars: placeChars, validate: place, commaStop: true, sameLineOnly: true, tidy: false });

    const ward = flat.match(/(?:ward\s*(?:no\.?|number|संख्या)?|वार्ड\s*(?:संख्या|सं\.?|नं\.?|नंबर)?)\s*[:\-]?\s*(\d{1,3})(?!\d)/i);
    if (ward) addr.wardNo = ward[1];
    return addr;
  }

  function extractInfoOnly(flat, docType) {
    const info = {};
    const nums = findAadhaarNumbers(flat);
    const aad = nums.find(n => n.valid) || (docType === "aadhaar" ? nums[0] : null);
    if (aad) info.info_aadhaar = `${aad.num.slice(0, 4)} ${aad.num.slice(4, 8)} ${aad.num.slice(8)}${aad.valid ? "" : " (?)"}`;

    const epic = findEpic(flat);
    if (epic && docType === "voter_id") info.info_epic = epic;

    const dob = flat.match(/(?:dob|date\s*of\s*birth|जन्म\s*(?:तिथि|तारीख|दिनांक)|d\.o\.b\.?)[^0-9]{0,15}([0-9OolI]{1,2})\s*[\/\-.]\s*([0-9OolI]{1,2})\s*[\/\-.]\s*([0-9OolI]{4})/i);
    if (dob) {
      const [d, mo, y] = [dob[1], dob[2], dob[3]].map(fixDigitLookalikes);
      if (/^\d{1,2}$/.test(d) && /^\d{1,2}$/.test(mo) && /^\d{4}$/.test(y)) info.info_dob = `${d.padStart(2, "0")}/${mo.padStart(2, "0")}/${y}`;
    }
    else {
      const yob = flat.match(/(?:year\s*of\s*birth|yob|जन्म\s*वर्ष)[^0-9]{0,10}(\d{4})/i);
      if (yob) info.info_dob = yob[1];
    }
    return info;
  }

  // ---- Public API -----------------------------------------------------

  /**
   * Extract everything we can find from one document's OCR text.
   * Returns { fields, docType, rawTextLength, filled }
   */
  function extractFields(text) {
    const digitsFixed = normalizeDigits(text || "");
    const lines = toLines(digitsFixed);
    const flat = norm(digitsFixed);
    const docType = detectDocType(text);
    const fields = {};

    Object.assign(fields, extractNames(flat, lines, digitsFixed));

    const gender = extractGender(flat, lines, docType);
    if (gender) fields.gender = gender;

    const mobile = extractMobile(flat);
    if (mobile) fields.mobile = mobile;

    const email = extractEmail(flat);
    if (email) fields.email = email;

    const pin = extractPin(flat);
    if (pin) fields.pin = pin;

    const district = extractDistrict(flat, lines);
    if (district) fields.district = district;

    Object.assign(fields, extractAddressParts(flat, lines));

    const profession = extractProfession(flat, docType);
    if (profession) { fields.profession = profession; fields.casteprofession = profession; }

    const category = extractCasteCategory(flat, docType);
    if (category) fields.castecategory = category;

    const totalIncome = extractTotalIncome(flat);
    if (totalIncome) fields.totalincome = totalIncome;

    Object.assign(fields, extractInfoOnly(flat, docType));

    Object.keys(fields).forEach(k => {
      if (fields[k] === null || fields[k] === undefined || fields[k] === "") delete fields[k];
    });

    const filled = Object.keys(fields).filter(k => !k.startsWith("info_")).length;
    return { fields, docType, rawTextLength: flat.length, filled };
  }

  // Which document is the best source for a given field.
  const FIELD_PREFERRED_DOC_TYPE = {
    name: "aadhaar",
    caste: "caste_certificate",
    castecategory: "caste_certificate",
    casteprofession: "caste_certificate",
    totalincome: "income_certificate",
    profession: "income_certificate",
    district: "residence_certificate",
    pin: "residence_certificate",
    village: "residence_certificate",
    postoffice: "residence_certificate",
    policeStation: "residence_certificate",
    wardNo: "residence_certificate",
    info_aadhaar: "aadhaar",
    info_dob: "aadhaar",
    info_epic: "voter_id",
  };

  /**
   * Merge extraction results from multiple documents into one object.
   * Priority: a document whose type matches the field's "home" document wins;
   * otherwise the document with the higher OCR confidence wins; ties -> first.
   * Returns { merged, sources, alternates }
   */
  function mergeExtractions(perDocResults) {
    const merged = {}, sources = {}, alternates = {};

    function recordAlternate(key, val, idx) {
      if (!alternates[key]) alternates[key] = [];
      if (!alternates[key].some(a => a.value.toLowerCase() === String(val).toLowerCase())) alternates[key].push({ value: val, docIdx: idx });
    }

    // Order candidates: preferred doc type first, then higher OCR confidence, then upload order.
    const order = perDocResults.map((r, i) => i).sort((a, b) => (perDocResults[b].confidence || 0) - (perDocResults[a].confidence || 0) || a - b);

    // Pass 1: preferred document type.
    perDocResults.forEach((res, idx) => {
      Object.entries(res.fields).forEach(([key, val]) => {
        if (key.startsWith("_")) return;
        recordAlternate(key, val, idx);
        const preferredType = FIELD_PREFERRED_DOC_TYPE[key];
        if (preferredType && res.docType === preferredType && merged[key] === undefined) {
          merged[key] = val; sources[key] = idx;
        }
      });
    });

    // Pass 2: anything still missing — most confident document wins.
    order.forEach(idx => {
      Object.entries(perDocResults[idx].fields).forEach(([key, val]) => {
        if (key.startsWith("_")) return;
        if (merged[key] === undefined) { merged[key] = val; sources[key] = idx; }
      });
    });

    // Only keep an alternates entry where documents genuinely disagreed.
    Object.keys(alternates).forEach(k => { if (alternates[k].length < 2) delete alternates[k]; });

    return { merged, sources, alternates };
  }


  // ---- RTPS receipt reader (Certificate Download section) ---------------

  // e.g. BICCO/2021/00000 — letters / 4-digit year / serial. OCR often swaps
  // O<->0 and I/l<->1, so both are tolerated and repaired.
  // The serial may be printed / read with ONE stray space inside ("11725539" -> "1 1725539").
  const REF_RE = /(?<![A-Za-z0-9])([A-Z0]{3,10})\s*[\/\\|]\s*([0-9OIl]{4})\s*[\/\\|]\s*([0-9OolI]{1,10}(?: [0-9OolI]{1,10})?)(?![A-Za-z0-9])/g;

  function findReferences(text) {
    const out = [];
    let m;
    REF_RE.lastIndex = 0;
    while ((m = REF_RE.exec(text))) {
      const prefix = m[1].replace(/0/g, "O");
      const year = fixDigitLookalikes(m[2]);
      // A stray space is only an OCR split when the pieces make a long serial and one piece is tiny
      // ("1 1725539"); "12345 6" is a serial followed by something else.
      let serialRaw = m[3];
      if (serialRaw.indexOf(" ") >= 0) {
        const parts = serialRaw.split(" ");
        serialRaw = (parts[0].length + parts[1].length >= 7 && Math.min(parts[0].length, parts[1].length) <= 2) ? parts.join("") : parts[0];
      }
      const serial = fixDigitLookalikes(serialRaw);
      if (!/^20\d{2}$/.test(year) || !/^\d{2,10}$/.test(serial)) continue;
      out.push({ ref: `${prefix}/${year}/${serial}`, index: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  // ---------- applicant name ----------
  //
  // OCR of Devanagari labels is never perfectly clean, so the name is searched
  // with several independent strategies, strongest first:
  //   1. an "applicant name" label (आवेदक / आवेदिका / आवेदनकर्ता का नाम …, tolerant of OCR slips)
  //   2. any other "… का नाम" label that is not father / mother / service / place …
  //   3. a "Hindi (English)" line — the portal prints the applicant that way
  //   4. a plain English "Name :" line
  // Whatever else looks like a person's name is returned as `candidates`, so the
  // operator can fix a miss with one click instead of typing.

  const APPLICANT_LABEL = new RegExp(
    "applicant'?s?\\s*name|name\\s*of\\s*(?:the\\s*)?applicant|" +
    "आवेद[\\u0900-\\u097F]{0,8}\\s*(?:का|की|के)?\\s*नाम|आवेद[\\u0900-\\u097F]{0,8}\\s*[:：]", "i");

  // Words that mark a line as being about something other than the applicant.
  const NOT_APPLICANT = new RegExp(
    "पिता|माता|पति|पत्नी|जिला|अनुमंडल|प्रखंड|पंचायत|वार्ड|ग्राम|मोहल्ला|गाँव|गांव|डाकघर|थाना|सेवा|लोक\\s*सेवक|अधिकारी|निर्दिष्ट|मोबाइल|तिथि|अवधि|दस्तावेज|संख्या|कार्यदिवस|" +
    "father|mother|husband|wife|district|block|village|post|police|service|officer|mobile|date|document|number|ref|authority|designated|panchayat", "i");

  const LATIN_BOILERPLATE = /receipt|acknowledg|application|government|bihar|certificate|service|department|public|rtps|officer|status|download|print|date|number|district|block|village|police|post|reference|please|thank/i;

  function titleCaseName(v) {
    return v.split(/\s+/).filter(Boolean).map(w => /^[A-Za-z.'\-]+$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
  }

  /** "रेशमी किरण (Reshmi Kiran)" / "Reshmi Kiran" / "रेशमी किरण" -> { name, source, hindi? } or null */
  function nameFromValue(raw) {
    let v = raw.replace(/^[\s:;：\-–—|=\/]+/, "");
    // Receipts print "Hindi (English)": the bracketed English spelling is the one to use.
    const paren = v.match(/\(\s*([A-Za-z][A-Za-z .'\-]{2,60}?)\s*[|)]?\s*\)/) || v.match(/\(\s*([A-Za-z][A-Za-z .'\-]{2,60})/);
    if (paren) {
      const en = titleCaseName(tidyName(stripEdges(paren[1])));
      if (isPlausibleName(en)) return { name: en, source: "english", hindi: stripEdges(v.slice(0, paren.index).replace(/[^\u0900-\u097F\s]/g, " ")) || undefined };
    }
    v = v.replace(/\([^)]*\)?/g, " ");
    // Stop at the next printed label on the same line (e.g. "... माता का नाम : ...").
    const cut = cutAtNextLabel(v.replace(/[^A-Za-z\u0900-\u097F\s.'\-]/g, " ").replace(/\s+/g, " "));
    const val = tidyName(stripHonorific(stripEdges(cut)));
    if (!isPlausibleName(val)) return null;
    if (/[\u0900-\u097F]/.test(val)) {
      const english = (typeof Translit !== "undefined" && Translit.toEnglishName) ? Translit.toEnglishName(val) : "";
      return { name: english, source: english ? "translit" : "", hindi: val };
    }
    return { name: titleCaseName(val), source: "english" };
  }

  function labelPart(line) { const i = line.search(/[:：]/); return i < 0 ? "" : line.slice(0, i); }

  /** Possible person names found anywhere in the segment (for one-click fixing). */
  function nameCandidates(lines) {
    const out = [];
    const add = (n) => { if (n && isPlausibleName(n) && !out.some(o => o.toLowerCase() === n.toLowerCase())) out.push(n); };
    for (const l of lines) {
      const label = labelPart(l);
      if (label && NOT_APPLICANT.test(label)) continue;
      const m = l.match(/\(\s*([A-Za-z][A-Za-z .'\-]{2,50}?)\s*[|)]/);
      if (m) { add(titleCaseName(tidyName(stripEdges(m[1])))); continue; }
      const plain = stripEdges(l.replace(/^[^:：]*[:：]/, ""));
      // Hindi-only value after a label (no English given): offer the transliteration.
      if (label && /^[\u0900-\u097F][\u0900-\u097F ]{3,40}$/.test(plain) && plain.split(/\s+/).length >= 2 && plain.split(/\s+/).length <= 4 &&
          typeof Translit !== "undefined" && !NOT_APPLICANT.test(plain)) { add(Translit.toEnglishName(stripHonorific(plain))); continue; }
      if (/^[A-Za-z][A-Za-z .'\-]{3,40}$/.test(plain) && plain.split(/\s+/).length >= 2 && plain.split(/\s+/).length <= 4 && !LATIN_BOILERPLATE.test(plain)) add(titleCaseName(plain));
    }
    return out.slice(0, 5);
  }

  /** Applicant name inside one receipt segment, always returned in English. */
  function applicantNameFrom(segment) {
    const lines = toLines(segment);
    const candidates = nameCandidates(lines);
    const result = (r, method) => Object.assign({ candidates, method }, r);

    // 1. explicit applicant label
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      const m = APPLICANT_LABEL.exec(lines[i]);
      if (!m) continue;
      let rest = lines[i].slice(m.index + m[0].length);
      // Bilingual label: "Applicant Name / आवेदक का नाम : value" — skip the second label.
      rest = rest.replace(new RegExp("^\\s*[\\/|(]\\s*(?:" + APPLICANT_LABEL.source + ")\\s*\\)?", "i"), "");
      if (!/[A-Za-z\u0900-\u097F]/.test(rest) && lines[i + 1]) rest = lines[i + 1];
      const r = nameFromValue(rest);
      if (r && r.name) hits.push(r);
      else if (r) hits.push(r);
    }
    if (hits.length) return result(hits.find(h => h.source === "english") || hits[0], "label");

    // 2. any other "… का नाम" label that is not father / mother / service / place …
    for (const l of lines) {
      const label = labelPart(l);
      if (!/(?:का|की)\s*नाम/.test(label) || NOT_APPLICANT.test(label)) continue;
      const r = nameFromValue(l.slice(label.length));
      if (r) return result(r, "generic-label");
    }

    // 3. a "Hindi (English)" line that is not about a relative / service / place
    for (const l of lines) {
      const label = labelPart(l);
      if (NOT_APPLICANT.test(label || l.replace(/\([^)]*\)/g, ""))) continue;
      const m = l.match(/\(\s*([A-Za-z][A-Za-z .'\-]{2,50}?)\s*[|)]/);
      if (m) {
        const en = titleCaseName(tidyName(stripEdges(m[1])));
        if (isPlausibleName(en)) return result({ name: en, source: "english" }, "bracket");
      }
    }

    // 4. plain English "Name :"
    for (const l of lines) {
      const m = /(?:^|\s)name\s*[:\-]\s*(.+)$/i.exec(l);
      if (!m || NOT_APPLICANT.test(l.slice(0, m.index + 5))) continue;
      const r = nameFromValue(m[1]);
      if (r) return result(r, "english-label");
    }
    return { name: "", source: "", candidates, method: "none" };
  }

  // ---------- which certificate is this? ----------

  const SERVICE_TYPES = [
    ["ews", /आर्थिक\s*रूप\s*से\s*कमजोर|आर्थिक\s*कमजोर|\bews\b|economically\s*weaker/i],
    ["ncl", /क्रीमी|creamy|\bncl\b/i],
    ["income", /आय\s*प्रमाण|आय\s*एवं|आय\s*का|आय\s*सम्बन्धी|आय\s*संबंधी|income/i],
    ["caste", /जाति|caste/i],
    ["residence", /आवासीय|निवास|residen|domicile|स्थायी\s*प्रमाण/i],
    ["birth", /जन्म\s*प्रमाण|जन्म\s*निबंधन|birth/i],
    ["death", /मृत्यु|death/i],
    ["marriage", /विवाह|marriage/i],
  ];

  function detectService(text) {
    const lines = toLines(text);
    const svcLine = lines.find(l => /सेवा\s*का\s*नाम|service\s*name|name\s*of\s*(?:the\s*)?service/i.test(l));
    const serviceText = svcLine ? stripEdges(svcLine.replace(/^[^:：]*[:：]/, "").replace(/\s+/g, " ")) : "";
    const probe = (t, strict) => {
      for (const [key, re] of SERVICE_TYPES) {
        if (strict && !/प्रमाण|certificate/i.test(t.match(re) ? t : "")) continue;
        if (re.test(t)) return key;
      }
      return null;
    };
    const key = (serviceText && probe(serviceText, false)) || probe(text, true) || "other";
    return { serviceKey: key, serviceText };
  }

  /** Proposed delivery date (-> YYYY-MM-DD) and applicant mobile printed on a receipt. */
  function receiptExtras(segment) {
    const flat = norm(segment);
    const out = { due: "", mobile: "" };
    const d = flat.match(/(?:प्रस्तावित\s*(?:तिथि|दिनांक)|proposed\s*date|expected\s*(?:date|delivery)|due\s*date|delivery\s*date)[^0-9]{0,20}([0-9OolI]{1,2})\s*[\/\-.]\s*([0-9OolI]{1,2})\s*[\/\-.]\s*([0-9OolI]{4})/i);
    if (d) {
      const [dd, mm, yy] = [d[1], d[2], d[3]].map(fixDigitLookalikes);
      if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31 && /^20\d{2}$/.test(yy)) out.due = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    const m = flat.match(/(?:मोबाइल|mobile|phone|contact)[^0-9A-Za-z]{0,30}((?:\+?91[\s\-]?)?[6-9][0-9OolI\s\-]{9,12})/i);
    if (m) {
      const digits = fixDigitLookalikes(m[1]).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
      if (/^[6-9]\d{9}$/.test(digits)) out.mobile = digits;
    }
    return out;
  }

  /**
   * Read RTPS receipts. `pages` is an array with one OCR text per page
   * (or a single string). Returns one record per unique reference number:
   *   [{ ref, name, nameSource, hindi?, candidates[], serviceKey, serviceText, page }]
   * A page with several references is cut into one segment per reference.
   */
  function extractReceipts(pages) {
    const list = Array.isArray(pages) ? pages : [pages];
    const found = new Map();
    list.forEach((raw, pageIdx) => {
      const text = normalizeDigits(raw || "");
      const refs = findReferences(text);
      refs.forEach((r, i) => {
        let segment = text;
        if (refs.length > 1) {
          const from = r.index; // on multi-receipt pages the name follows its own reference
          const to = i + 1 < refs.length ? refs[i + 1].index : r.end + 450;
          segment = text.slice(from, to);
        }
        if (found.has(r.ref)) { if (found.get(r.ref).name) return; }
        const n = applicantNameFrom(segment);
        const svc = detectService(segment);
        const extra = receiptExtras(segment);
        found.set(r.ref, {
          due: extra.due, mobile: extra.mobile,
          ref: r.ref, name: n.name, nameSource: n.source, hindi: n.hindi, candidates: n.candidates,
          serviceKey: svc.serviceKey, serviceText: svc.serviceText, page: pageIdx + 1,
        });
      });
    });
    return Array.from(found.values());
  }

  // ---- Application-status reader (Certificates -> Status Check) ---------
  //
  // Reads a receipt and/or certificate and returns what the portal's
  // "Track Application" form asks for:
  //   Ref No + Application Submission Date  (step 1)
  //   Name of Applicant / Father / Mother   (step 3)
  // A page with no reference number (e.g. a certificate that only carries
  // names) comes back with ref "" so the caller can match it by name.

  const DATE_TOKEN = /([0-9OolI]{1,2})\s*[\/\-.]\s*([0-9OolI]{1,2})\s*[\/\-.]\s*(20[0-9OolI]{2})(?![0-9])/g;

  function toIsoDate(dd, mm, yy) {
    [dd, mm, yy] = [dd, mm, yy].map(fixDigitLookalikes);
    if (!(+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31 && /^20\d{2}$/.test(yy))) return "";
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  function allDates(flat) {
    const out = [];
    let m;
    DATE_TOKEN.lastIndex = 0;
    while ((m = DATE_TOKEN.exec(flat))) {
      const iso = toIsoDate(m[1], m[2], m[3]);
      if (iso) out.push({ iso, index: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  const SUBMIT_DATE_LABEL = /(?:आवेदन\s*(?:की|का)?\s*(?:तिथि|दिनांक|तारीख|जमा)|application\s*(?:submission\s*)?date|submission\s*date|submitted\s*on|date\s*of\s*(?:application|submission)|applied\s*on|date\s*of\s*apply)/i;
  const NOT_SUBMIT_DATE = /(?:प्रस्तावित|proposed|expected|delivery|due|वितरण|डिलीवरी|valid|वैध|issue\s*date|जारी)/i;

  /** Application submission date of one receipt segment -> YYYY-MM-DD ("" if none). */
  function submissionDateFrom(segment) {
    const flat = norm(segment);
    const dates = allDates(flat);
    if (!dates.length) return "";
    // 1. a date right after a "submission date" style label
    const lab = new RegExp(SUBMIT_DATE_LABEL.source, "ig");
    let lm;
    while ((lm = lab.exec(flat))) {
      const after = dates.find(d => d.index >= lm.index && d.index - (lm.index + lm[0].length) <= 40);
      if (after) return after.iso;
    }
    // 2. otherwise the earliest date that is not labelled as a delivery / due / issue date
    const ok = dates.filter(d => !NOT_SUBMIT_DATE.test(flat.slice(Math.max(0, d.index - 45), d.index)));
    const pool = (ok.length ? ok : dates).map(d => d.iso).sort();
    return pool[0] || "";
  }

  function englishOf(v) {
    if (!v) return "";
    v = tidyName(stripHonorific(stripEdges(String(v))));
    if (/[ऀ-ॿ]/.test(v)) {
      const en = (typeof Translit !== "undefined" && Translit.toEnglishName) ? Translit.toEnglishName(v) : "";
      return en ? titleCaseName(en) : "";
    }
    return /[A-Za-z]/.test(v) ? titleCaseName(v) : "";
  }

  function relationNames(segment) {
    let f = {};
    try { f = extractFields(segment).fields || {}; } catch (e) { f = {}; }
    // "Hindi (English)" values: the bracketed English spelling wins.
    const pick = (v) => { if (!v) return ""; const m = String(v).match(/\(\s*([A-Za-z][A-Za-z .'\-]{2,60}?)\s*\)/); return englishOf(m ? m[1] : v); };
    return { father: pick(f.fathername), mother: pick(f.mothername), ownName: pick(f.name) };
  }

  /**
   * pages: array of OCR texts (one per page) or a single string.
   * -> [{ ref, date (YYYY-MM-DD), name, father, mother, nameSource, candidates[], page }]
   */
  function extractStatusInfo(pages) {
    const list = Array.isArray(pages) ? pages : [pages];
    const found = new Map();
    const loose = [];
    list.forEach((raw, pageIdx) => {
      const text = normalizeDigits(raw || "");
      const refs = findReferences(text);
      const build = (segment, ref) => {
        const n = applicantNameFrom(segment);
        const rel = relationNames(segment);
        let name = n.name, source = n.source;
        if (!name && rel.ownName && rel.ownName.toLowerCase() !== (rel.father || "").toLowerCase()) { name = rel.ownName; source = "english"; }
        return { ref, date: submissionDateFrom(segment), mobile: receiptExtras(segment).mobile || "", name: name || "", nameSource: source || "", hindi: n.hindi || "",
          father: rel.father, mother: rel.mother, candidates: n.candidates || [], page: pageIdx + 1 };
      };
      if (!refs.length) {
        const r = build(text, "");
        if (r.name || r.father || r.mother || r.date) loose.push(r);
        return;
      }
      refs.forEach((r, i) => {
        let segment = text;
        if (refs.length > 1) segment = text.slice(r.index, i + 1 < refs.length ? refs[i + 1].index : r.end + 450);
        const rec = build(segment, r.ref);
        const ex = found.get(r.ref);
        if (!ex) { found.set(r.ref, rec); return; }
        ["date", "name", "father", "mother", "mobile"].forEach(k => { if (!ex[k] && rec[k]) ex[k] = rec[k]; });
      });
    });
    return Array.from(found.values()).concat(loose);
  }

  return { extractFields, mergeExtractions, detectDocType, verhoeffValid, normalizeDigits, extractReceipts, extractStatusInfo, BIHAR_DISTRICTS };
})();

if (typeof module !== "undefined") module.exports = DocumentParser;
