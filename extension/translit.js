/**
 * translit.js
 * ------------------------------------------------------------
 * Hindi (Devanagari) -> English spelling for PERSON NAMES, fully
 * offline. Used when a receipt only has the applicant's name in
 * Hindi but the portal wants it in English.
 *
 * Two layers:
 *   1. A dictionary of very common Bihar name words (exact, the
 *      spelling people actually use: कुमार -> Kumar, सिंह -> Singh).
 *   2. A rule-based transliterator with Hindi "schwa deletion"
 *      (सुरेश -> Suresh, not Suresha) for everything else.
 * Always shown to the operator in an editable box — rare names can
 * still come out slightly off, and are quick to correct by hand.
 * ------------------------------------------------------------
 */
const Translit = (function () {

  const WORDS = {
    "कुमार": "Kumar", "कुमारी": "Kumari", "देवी": "Devi", "प्रसाद": "Prasad", "सिंह": "Singh", "सिन्हा": "Sinha",
    "यादव": "Yadav", "पासवान": "Paswan", "खातून": "Khatoon", "बेगम": "Begum", "मोहम्मद": "Md", "मो०": "Md", "मोहम्मद.": "Md",
    "मो.": "Md", "राम": "Ram", "लाल": "Lal", "शर्मा": "Sharma", "वर्मा": "Verma", "ठाकुर": "Thakur", "महतो": "Mahto",
    "मंडल": "Mandal", "मण्डल": "Mandal", "चौधरी": "Chaudhary", "पांडेय": "Pandey", "पाण्डेय": "Pandey", "पाठक": "Pathak",
    "मिश्रा": "Mishra", "मिश्र": "Mishra", "झा": "Jha", "गुप्ता": "Gupta", "गुप्त": "Gupta", "राय": "Rai", "साह": "Sah",
    "साहू": "Sahu", "पंडित": "Pandit", "पण्डित": "Pandit", "भारती": "Bharti", "कुशवाहा": "Kushwaha", "राउत": "Raut",
    "चंद्र": "Chandra", "चन्द्र": "Chandra", "शंकर": "Shankar", "शर्मा.": "Sharma", "नारायण": "Narayan", "किशोर": "Kishor",
    "रंजन": "Ranjan", "रंजीत": "Ranjit", "प्रिया": "Priya", "पूनम": "Poonam", "सुनीता": "Sunita", "सुनील": "Sunil",
    "राहुल": "Rahul", "अमित": "Amit", "रोहित": "Rohit", "मनोज": "Manoj", "संजय": "Sanjay", "विजय": "Vijay", "अजय": "Ajay",
    "राजेश": "Rajesh", "सुरेश": "Suresh", "रमेश": "Ramesh", "दिनेश": "Dinesh", "महेश": "Mahesh", "मुकेश": "Mukesh",
    "रीना": "Reena", "सीता": "Sita", "गीता": "Geeta", "रीता": "Rita", "ममता": "Mamta", "सरिता": "Sarita", "अनीता": "Anita",
    "कविता": "Kavita", "पूजा": "Pooja", "निशा": "Nisha", "रानी": "Rani", "मुन्ना": "Munna", "बबलू": "Bablu", "पप्पू": "Pappu",
    "दास": "Das", "ठाकुर.": "Thakur", "सहनी": "Sahani", "मल्लाह": "Mallah", "प्रजापति": "Prajapati", "रविदास": "Ravidas",
    "मांझी": "Manjhi", "माँझी": "Manjhi", "हसन": "Hasan", "हुसैन": "Hussain", "अली": "Ali", "आलम": "Alam", "अंसारी": "Ansari",
    "खान": "Khan", "शेख": "Shaikh", "परवीन": "Parveen", "नसीम": "Naseem", "रहमान": "Rahman", "अहमद": "Ahmad",
    "शबनम": "Shabnam", "श्री": "", "श्रीमती": "", "सुश्री": "", "स्व०": "", "स्व.": "",
  };

  // Independent vowels, matras, consonants (Devanagari -> Latin).
  const INDEP = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o" };
  const MATRA = { "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e" };
  const CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "f", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y", "ळ": "l",
  };
  const VIRAMA = "्", NUKTA = "़", ANUSVARA = "ं", CHANDRABINDU = "ँ", VISARGA = "ः";

  /** Split a word into syllable units: { c: consonant-latin|null, v: vowel-latin|null(inherent), explicit:bool } */
  function toUnits(word) {
    // Fold nukta forms (क + ़) into the single precomposed keys used above.
    word = word.normalize("NFC").replace(/([कखगजडढफय])़/g, "$1़");
    const chars = Array.from(word);
    const units = [];
    for (let i = 0; i < chars.length; i++) {
      let ch = chars[i];
      if (chars[i + 1] === NUKTA && CONS[ch + NUKTA]) { ch = ch + NUKTA; i++; }
      if (INDEP[ch]) { units.push({ c: "", v: INDEP[ch], explicit: true }); continue; }
      if (CONS[ch]) {
        const u = { c: CONS[ch], v: "a", explicit: false };
        // conjunct: consonant + virama + next consonant -> no vowel here
        if (chars[i + 1] === VIRAMA) { u.v = ""; i++; }
        else if (MATRA[chars[i + 1]]) { u.v = MATRA[chars[i + 1]]; u.explicit = true; i++; }
        units.push(u);
        continue;
      }
      if (ch === ANUSVARA || ch === CHANDRABINDU) {
        const prev = units[units.length - 1];
        if (prev) prev.tail = (prev.tail || "") + "n";
        continue;
      }
      if (ch === VISARGA) { const prev = units[units.length - 1]; if (prev) prev.tail = (prev.tail || "") + "h"; continue; }
      if (/[A-Za-z0-9.\-']/.test(ch)) { units.push({ c: ch, v: "", explicit: true, raw: true }); }
    }
    return units;
  }

  function schwaDelete(units) {
    // 1) final inherent 'a' is silent
    const last = units[units.length - 1];
    const beforeLast = units[units.length - 2];
    // Word-final "-dra / -tra / -ndra" (द्र, त्र): the र after a conjunct is pronounced "ra", so keep its "a".
    const conjunctRa = last && last.c === "r" && beforeLast && beforeLast.v === "" && !beforeLast.raw;
    if (last && !last.explicit && last.v === "a" && !last.raw && !conjunctRa) last.v = "";
    // 2) medial: C(a) between a vowel-bearing syllable and a syllable that keeps an explicit vowel
    for (let i = units.length - 2; i >= 1; i--) {
      const u = units[i];
      if (u.explicit || u.v !== "a" || u.raw) continue;
      const prev = units[i - 1], next = units[i + 1];
      if (!prev || !next) continue;
      const prevHasVowel = prev.v !== "";
      const nextKeepsVowel = next.v !== "" && (next.explicit || i + 1 < units.length - 1);
      // Delete only when it is a heavy-ish context: previous syllable has a LONG vowel,
      // or the next syllable carries an explicit vowel — e.g. रामचंद्र -> Ramchandra, अमरीश -> Amrish.
      const prevLong = /aa|ee|oo|ai|au|^o$|^e$/.test(prev.v);
      if (prevHasVowel && nextKeepsVowel && (prevLong || next.explicit)) u.v = "";
    }
    return units;
  }

  function wordToLatin(word) {
    const units = schwaDelete(toUnits(word));
    let out = "";
    for (const u of units) out += (u.c || "") + (u.v || "") + (u.tail || "");
    // tidy readable forms
    out = out.replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u") // names are written Rahul, Sunita, Poonam->Punam style
             .replace(/([^aeiou])ri(?=[^aeiou]|$)/g, "$1ri");
    return out;
  }

  function titleCase(s) {
    return s.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  /** Hindi (or mixed) name -> Title Case English name. Latin parts are kept. */
  function toEnglishName(text) {
    if (!text) return "";
    const words = text.replace(/[,;|]+/g, " ").split(/\s+/).filter(Boolean);
    const out = words.map(w => {
      if (!/[\u0900-\u097F]/.test(w)) return w;
      const clean = w.replace(/[.\-]+$/, "");
      // Spellings the operator corrected earlier win over everything else.
      const taught = (typeof OcrLexicon !== "undefined" && OcrLexicon.translitFor) ? OcrLexicon.translitFor(clean) : null;
      if (taught) return taught;
      if (Object.prototype.hasOwnProperty.call(WORDS, clean)) return WORDS[clean];
      if (Object.prototype.hasOwnProperty.call(WORDS, w)) return WORDS[w];
      return wordToLatin(clean);
    }).filter(Boolean);
    return titleCase(out.join(" "));
  }

  return { toEnglishName, wordToLatin };
})();

if (typeof module !== "undefined") module.exports = Translit;
