/**
 * ocrLexicon.js
 * ------------------------------------------------------------
 * Domain knowledge + memory for the OCR engine.
 *
 *  1. LEXICON — the words that really appear on Bihar RTPS receipts,
 *     Aadhaar / voter / ration cards and certificates (Hindi + English
 *     labels, district names). A badly-read label word ("आवेदिका क नाम",
 *     "Applcant Narne") is snapped to the nearest real word — but only
 *     when the engine itself was unsure about it, and only when exactly
 *     one real word is that close, so correct text is never "fixed".
 *
 *  2. LEARNED CORRECTIONS — the nearest thing to "training" that works
 *     fully offline: whenever the operator fixes a name in the review
 *     screens, the wrong -> right pair is remembered on this device and
 *     applied to every later scan. Corrections can be listed and deleted
 *     from the Documents tab ("🧠 OCR ne kya seekha").
 *
 * Nothing here leaves the browser.
 * ------------------------------------------------------------
 */
const OcrLexicon = (function () {

  const HI = ("सेवा का की के नाम निर्दिष्ट लोक सेवक राजस्व अधिकारी आवेदन संख्या आवेदक आवेदिका पिता माता पति पत्नी जिला अनुमंडल प्रखंड " +
    "ग्राम गाँव गांव पंचायत वार्ड मोहल्ला डाकघर थाना मोबाइल प्रदान करने प्रस्तावित तिथि समय अवधि कार्यदिवस उपलब्ध कराए गए दस्तावेजों " +
    "सूची फॉर्म स्वयं शपथ पत्र अभिलेख भूमि संबंधी दस्तावेज जाति प्रमाण निर्गमन आय निवास आवासीय बिहार सरकार भारत जन्म लिंग पुरुष महिला पता " +
    "राज्य पिन कोड दिनांक हस्ताक्षर पावती पंजीकरण प्रमाणपत्र अंचल राशन कार्ड निर्वाचन आयोग पहचान मतदाता आधार विशिष्ट प्राधिकरण " +
    "मेरा मेरी आम आदमी अधिकार कुल वार्षिक आय पेशा व्यवसाय श्रेणी वर्ग पिछड़ा अनुसूचित जनजाति अत्यंत खतियान दानपत्र वेतन पेंशन पर्ची " +
    "आयकर रिटर्न विद्युत विपत्र दूरभाष पासबुक बैंक पासपोर्ट ड्राइविंग लाइसेंस स्थायी वर्तमान पोस्ट पुलिस स्टेशन आवेदन पत्रांक " +
    "अनुमंडल पदाधिकारी राजस्व कर्मचारी सत्यापन स्वीकृत लंबित निष्पादन").split(/\s+/);

  const EN = ("Application Reference Number Applicant Name Father Mother Husband Wife District Block Village Panchayat Ward Post Office Police Station " +
    "Mobile Service Certificate Income Caste Residence Residential Date Birth Gender Male Female Address State Pincode Bihar Government India Unique " +
    "Identification Authority Receipt Acknowledgement Download Proposed Days Documents Revenue Officer Designated Public Servant Total Annual " +
    "Category Profession Occupation Election Commission Elector Electors Photo Identity Card Ration Domicile Issue Issued Status Delivery Expected " +
    "Subdivision Sub Ward Locality Landmark Relation Signature Declaration Affidavit Verification Approved Pending Rejected").split(/\s+/);

  const DISTRICTS = [
    ["Araria", "अररिया"], ["Arwal", "अरवल"], ["Aurangabad", "औरंगाबाद"], ["Banka", "बांका"], ["Begusarai", "बेगूसराय"], ["Bhagalpur", "भागलपुर"],
    ["Bhojpur", "भोजपुर"], ["Buxar", "बक्सर"], ["Darbhanga", "दरभंगा"], ["Motihari", "मोतिहारी"], ["Gaya", "गया"], ["Gopalganj", "गोपालगंज"],
    ["Jamui", "जमुई"], ["Jehanabad", "जहानाबाद"], ["Kaimur", "कैमूर"], ["Katihar", "कटिहार"], ["Khagaria", "खगड़िया"], ["Kishanganj", "किशनगंज"],
    ["Lakhisarai", "लखीसराय"], ["Madhepura", "मधेपुरा"], ["Madhubani", "मधुबनी"], ["Munger", "मुंगेर"], ["Muzaffarpur", "मुजफ्फरपुर"],
    ["Nalanda", "नालंदा"], ["Nawada", "नवादा"], ["Patna", "पटना"], ["Purnia", "पूर्णिया"], ["Rohtas", "रोहतास"], ["Saharsa", "सहरसा"],
    ["Samastipur", "समस्तीपुर"], ["Saran", "सारण"], ["Sheikhpura", "शेखपुरा"], ["Sheohar", "शिवहर"], ["Sitamarhi", "सीतामढ़ी"], ["Siwan", "सिवान"],
    ["Supaul", "सुपौल"], ["Vaishali", "वैशाली"], ["Bettiah", "बेतिया"],
  ];

  const vocabHi = new Set(HI.concat(DISTRICTS.map((d) => d[1])).filter(Boolean));
  const vocabEn = new Map(EN.concat(DISTRICTS.map((d) => d[0])).map((w) => [w.toLowerCase(), w]));
  const hiList = Array.from(vocabHi);
  const enList = Array.from(vocabEn.keys());

  // ---------- helpers ----------

  const DEV = /[\u0900-\u097F]/;
  const cpLen = (s) => Array.from(s).length;

  function lev(a, b, max) {
    const x = Array.from(a), y = Array.from(b);
    if (Math.abs(x.length - y.length) > max) return max + 1;
    let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
    for (let i = 1; i <= x.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= y.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[y.length];
  }

  function nearest(token, list, max) {
    let best = null, bestD = max + 1, tie = false;
    for (const w of list) {
      const d = lev(token, w, max);
      if (d < bestD) { best = w; bestD = d; tie = false; }
      else if (d === bestD && d <= max) tie = true;
    }
    return !tie && best && bestD <= max && bestD > 0 ? best : null;
  }

  function matchCase(original, repl) {
    if (original === original.toUpperCase()) return repl.toUpperCase();
    if (original[0] === original[0].toUpperCase()) return repl[0].toUpperCase() + repl.slice(1);
    return repl.toLowerCase();
  }

  /** Strip punctuation around a token but remember it, so it can be put back. */
  function split(tok) {
    const m = /^([^A-Za-z\u0900-\u097F0-9]*)(.*?)([^A-Za-z\u0900-\u097F0-9]*)$/.exec(tok);
    return { pre: m[1], core: m[2], post: m[3] };
  }

  // ---------- learned corrections (device-local memory) ----------

  const KEY = "saathiOcrLearned";           // { "wrong": "right" }  (tokens / phrases)
  const KEY_TR = "saathiTranslitLearned";   // { "हिंदी शब्द": "English" }
  const KEY_CONF = "saathiOcrConfusions";   // { "O>0": 3 }  letter/digit slips the operator fixed
  const KEY_REC = "saathiOcrRecords";       // { "<ref as OCR read it>": { ref,name,father,mother,mobile,date,at } }  corrected receipts
  let learned = {}, learnedTr = {}, conf = {}, recMem = {};
  let loaded = null;

  function load() {
    if (loaded) return loaded;
    loaded = new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY, KEY_TR, KEY_CONF, KEY_REC], (res) => { learned = (res && res[KEY]) || {}; learnedTr = (res && res[KEY_TR]) || {}; conf = (res && res[KEY_CONF]) || {}; recMem = (res && res[KEY_REC]) || {}; resolve(); });
        chrome.storage.onChanged.addListener((ch, area) => {
          if (area !== "local") return;
          if (ch[KEY]) learned = ch[KEY].newValue || {};
          if (ch[KEY_TR]) learnedTr = ch[KEY_TR].newValue || {};
          if (ch[KEY_CONF]) conf = ch[KEY_CONF].newValue || {};
          if (ch[KEY_REC]) recMem = ch[KEY_REC].newValue || {};
        });
      } catch (e) { resolve(); }
    });
    return loaded;
  }

  function persist() {
    try { chrome.storage.local.set({ [KEY]: learned, [KEY_TR]: learnedTr, [KEY_CONF]: conf, [KEY_REC]: recMem }); } catch (e) { /* ignore */ }
  }

  const tokensOf = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);
  const okName = (s) => /^[A-Za-z\u0900-\u097F .'\-]{2,60}$/.test(s);

  /**
   * The operator corrected an OCR'd name: remember `wrong -> right`.
   * `kind` "ocr": the wrong value is literal OCR text (English name line).
   * `kind` "translit": the wrong value came from Hindi -> English conversion;
   * `hindi` is the Hindi original (words are paired up when counts match).
   */
  function learnName(wrong, right, kind, hindi) {
    wrong = String(wrong || "").trim(); right = String(right || "").trim();
    if (!wrong || !right || wrong === right || !okName(wrong) || !okName(right)) return false;
    if (kind === "translit") {
      const h = tokensOf(hindi), r = tokensOf(right), w = tokensOf(wrong);
      if (!h.length || h.length !== r.length || w.length !== r.length) return false;
      let any = false;
      h.forEach((hw, i) => { if (DEV.test(hw) && w[i].toLowerCase() !== r[i].toLowerCase()) { learnedTr[hw] = r[i]; any = true; } }); // a Hindi word's English spelling is a pure preference, any edit is fine
      if (any) persist();
      return any;
    }
    const w = tokensOf(wrong), r = tokensOf(right);
    // Only OCR-sized slips are learned. A bigger change means the operator typed a
    // DIFFERENT name, and remembering that would corrupt later scans of the old one.
    const close = (a, b) => lev(a.toLowerCase(), b.toLowerCase(), 4) <= Math.max(1, Math.floor(Math.min(a.length, b.length) * 0.34));
    let any = false;
    if (w.length === r.length) {
      w.forEach((t, i) => { if (t !== r[i] && t.length >= 3 && close(t, r[i]) && !vocabEn.has(t.toLowerCase())) { learned[t] = r[i]; any = true; } });
    } else if (lev(wrong.toLowerCase(), right.toLowerCase(), 4) <= 3) { learned[wrong] = right; any = true; }
    if (any) persist();
    return any;
  }

  // ---------- numbers (ref no. / mobile) ----------

  /** Same-length wrong -> right: remember which characters get mixed up (O/0, I/1 ...). */
  function learnChars(wrong, right) {
    if (wrong.length !== right.length) return false;
    let any = false;
    for (let i = 0; i < wrong.length; i++) {
      const a = wrong[i], b = right[i];
      if (a !== b && /[A-Za-z]/.test(a) !== /[A-Za-z]/.test(b) && /\d/.test(a + b)) {
        const letter = /[A-Za-z]/.test(a) ? a.toUpperCase() : b.toUpperCase();
        const digit = /\d/.test(a) ? a : b;
        if (/\d/.test(b)) { const k = letter + ">" + digit; conf[k] = (conf[k] || 0) + 1; any = true; } // letter was read where a digit belongs
      }
    }
    return any;
  }
  /** Replace letters the operator has taught us are digits inside digit-only stretches. */
  function fixDigits(s) {
    const map = {};
    Object.keys(conf).forEach((k) => { const [l, d] = k.split(">"); if (!map[l] || conf[k] > conf[l + ">" + map[l]]) map[l] = d; });
    if (!Object.keys(map).length) return s;
    return String(s || "").split("/").map((seg) => {
      const digits = (seg.match(/\d/g) || []).length;
      if (seg.length < 4 || digits < seg.length * 0.6) return seg;
      return seg.replace(/[A-Za-z]/g, (c) => map[c.toUpperCase()] || c);
    }).join("/");
  }

  /**
   * The operator edited a field of a record. `rec.ocr` holds what OCR originally read.
   * Learn from that original value (so a second edit still teaches), return a short
   * human message when something was learned, else "".
   */
  function learnEdit(rec, field, value) {
    try {
      if (!rec || !rec.ocr) return "";
      const wrong = String(rec.ocr[field] || "").trim(), right = String(value || "").trim();
      if (!wrong || !right || wrong === right) return "";
      if (field === "name" || field === "father" || field === "mother") {
        const tr = field === "name" && rec.ocrSrc === "translit";
        return learnName(wrong, right, tr ? "translit" : "ocr", rec.hindi) ? wrong + " → " + right : "";
      }
      if (field === "ref" || field === "mobile") {
        const w = wrong.replace(/\s+/g, "").toUpperCase(), r = right.replace(/\s+/g, "").toUpperCase();
        if (w === r || lev(w, r, 3) > 3) return "";
        learned[w] = r; learnChars(w, r); persist();
        return w + " → " + r;
      }
    } catch (e) { /* learning is optional */ }
    return "";
  }

  // ---------- whole-receipt memory ----------
  // Every field the operator fixes is stored against the ref no. exactly as OCR read it. When the same
  // receipt / certificate is scanned again, the corrected values are filled straight away.

  const REC_FIELDS = ["ref", "name", "father", "mother", "mobile", "date"];
  /** Remember one corrected field of a record. Returns a short message when stored, else "". */
  function rememberField(rec, field, value) {
    try {
      if (REC_FIELDS.indexOf(field) < 0 || !rec) return "";
      const key = String(rec.ocrKey || (rec.ocr && rec.ocr.ref) || rec.ref || "").replace(/\s+/g, "").toUpperCase();
      value = String(value || "").trim();
      if (!key || !value) return "";
      const orig = field === "date" ? String((rec.ocr && rec.ocr.date) || "") : String((rec.ocr0 && rec.ocr0[field]) || (rec.ocr && rec.ocr[field]) || "");
      const slot = recMem[key] || {};
      if (!orig && !slot[field] && field !== "date") { /* OCR found nothing: the typed value is still worth remembering */ }
      if (orig === value && !slot[field]) return "";
      slot[field] = value; slot.at = Date.now(); recMem[key] = slot;
      const keys = Object.keys(recMem);
      if (keys.length > 500) keys.sort((a, b) => (recMem[a].at || 0) - (recMem[b].at || 0)).slice(0, keys.length - 500).forEach((k) => delete recMem[k]);
      persist();
      return field;
    } catch (e) { return ""; }
  }
  /** Fill an OCR entry with what was corrected for this same receipt before. Returns the list of fields applied. */
  function applyMemory(entry) {
    try {
      const key = String((entry && entry.ref) || "").replace(/\s+/g, "").toUpperCase();
      const m = key && recMem[key];
      if (!m) return [];
      const done = [];
      REC_FIELDS.forEach((f) => { if (m[f] && entry[f] !== m[f]) { entry[f] = m[f]; done.push(f); } });
      if (done.length) { entry.fromMemory = done; if (done.indexOf("name") >= 0) entry.nameSource = "memory"; }
      return done;
    } catch (e) { return []; }
  }

  function list() { return { ocr: Object.assign({}, learned), translit: Object.assign({}, learnedTr), records: JSON.parse(JSON.stringify(recMem)) }; }
  function forget(kind, key) { if (kind === "rec") delete recMem[key]; else { const t = kind === "translit" ? learnedTr : learned; delete t[key]; } persist(); }
  function clearAll() { learned = {}; learnedTr = {}; conf = {}; recMem = {}; persist(); }
  function translitFor(hindiWord) { return Object.prototype.hasOwnProperty.call(learnedTr, hindiWord) ? learnedTr[hindiWord] : null; }

  // ---------- correction of OCR words ----------

  /** Whole-text pass: exact learned replacements (phrases first, then words). */
  function applyLearned(text) {
    if (!text) return text;
    let out = text;
    const keys = Object.keys(learned).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      if (k.indexOf(" ") >= 0) out = out.split(k).join(learned[k]);
      else out = out.replace(new RegExp("(^|[^A-Za-z\\u0900-\\u097F])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z\\u0900-\\u097F])", "g"), (m, p) => p + learned[k]);
    }
    return out;
  }

  /**
   * Snap a badly-read token to the nearest real vocabulary word.
   * `conf` is Tesseract's word confidence; confident words are never touched.
   * `isLabel` is true for words before the first ":" on a line.
   */
  function correctToken(tok, conf, isLabel) {
    const { pre, core, post } = split(tok);
    if (!core || /\d/.test(core)) return tok;
    const limit = isLabel ? 82 : 62;
    if (typeof conf === "number" && conf >= limit) return tok;
    if (DEV.test(core)) {
      if (vocabHi.has(core) || cpLen(core) < 4) return tok;
      const max = cpLen(core) >= 7 ? 2 : 1;
      if (!isLabel && cpLen(core) < 5) return tok;
      const hit = nearest(core, hiList, max);
      return hit ? pre + hit + post : tok;
    }
    if (core.length < 5 || !/^[A-Za-z]+$/.test(core)) return tok;
    const low = core.toLowerCase();
    if (vocabEn.has(low)) return tok;
    const hit = nearest(low, enList, core.length >= 8 ? 2 : 1);
    return hit ? pre + matchCase(core, vocabEn.get(hit)) + post : tok;
  }

  /** words: [{text, conf}] of one line -> same shape with corrected text. */
  function correctWords(words) {
    let seenColon = false;
    return words.map((w) => {
      const isLabel = !seenColon;
      if (/[:：]/.test(w.text)) seenColon = true;
      const fixed = correctToken(w.text, w.conf, isLabel);
      return fixed === w.text ? w : Object.assign({}, w, { text: fixed, fixed: true });
    });
  }

  return { load, ready: load, rememberField, applyMemory, learnName, learnEdit, fixDigits, list, forget, clearAll, translitFor, applyLearned, correctToken, correctWords, lev };
})();

if (typeof module !== "undefined") module.exports = OcrLexicon;
