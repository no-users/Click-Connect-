/*
 * ewsFill.js — Click & Continue (EWS: आर्थिक रूप से कमजोर वर्ग प्रमाण-पत्र, RO level)
 * ---------------------------------------------------------------------
 * Yeh CONTENT SCRIPT hai. manifest.json me nclFill.js ke BAAD load hona chahiye
 * (content.js ke helpers: saathiSetText / saathiSetSelect / saathiSetRadio /
 *  saathiWaitFor / saathiFire / saathiToast / saathiNewReport / saathiAttachImage /
 *  transliterate yahan use hote hain).
 *
 * Kaam:
 * - Page par EWS form mile to "autofill" par yeh wala fill chalta hai.
 * - Baaki sab forms (Caste / Income / Residence / NCL Bihar / NCL Central) ke liye
 *   purana code ZARA bhi nahi badla — sab seedha unhi ko pass ho jata hai.
 *
 * Element IDs "आर्थिक रूप से कमजोर.html" (portal ka saved page) se nikale gaye hain.
 * Form detection: 67538 + 67520 + 67501 (Name EN, Name HI, DOB).
 *
 * Caste: EWS ki jaati-list chhoti hai (Brahman, Rajput, Bhoomihar, Kayasth, ... + Others),
 * isliye caste NAAM (text) se match hoti hai. Agar list me nahi mili to "Others" chunkar
 * naam "please specify" box me likha jata hai aur toast me warning aati hai.
 *
 * NOT auto-done (jaan-boojhkar): "I Agree" declaration, Aadhaar verify/OTP, CAPTCHA, Submit.
 * 5 shartein (aay < 8 lakh, zameen / flat / plot) tabhi tick hoti hain jab popup me
 * operator ne "haan" chuna ho — yeh aavedak ka khud ka declaration hai.
 */
(function () {
  "use strict";
  if (window.__saathiEwsLoaded) return;
  window.__saathiEwsLoaded = true;

  const g = (id) => (id ? document.getElementById(id) : null);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ------------------------------------------------------------------ */
  /* Field map (portal ke asli element ids)                              */
  /* ------------------------------------------------------------------ */
  const EWS = {
    label: "EWS",
    detect: ["67538", "67520", "67501"],
    certFormat: "70125",
    genderName: "67535", salutation: "67489",
    name: "67538", nameHi: "67520", dob: "67501", aadhaar: "68163_txt",
    state: "67502", district: "67503", anumandal: "67504", prakhand: "67505",
    residenceTypeName: "77725",
    gramByType: { 1: "67492", 2: "77726", 3: "77727", 4: "77728" },
    ward: "67508", village: "67523", postoffice: "67522", police: "67510", pin: "68199",
    holding: "67543", circle: "67540", religion: "67545",
    categoryName: "93019", caste: "67546", casteOther: "70113", subcaste: "67547",
    father: "67517", fatherHi: "67518", mother: "67532", motherHi: "67533",
    husband: "67534", husbandHi: "67500",
    mobile: "67496", email: "67491", photo: "68140",
    income: "67563",
    formII: "68417_1",
    criteriaName: "71940", // value 1..5 (5 shartein)
  };

  function isEws() {
    return EWS.detect.every((id) => g(id));
  }

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */
  const ZW = /[\u200b-\u200d\ufeff]/g;
  const norm = (s) => String(s == null ? "" : s).replace(ZW, "").toLowerCase().replace(/\s+/g, " ").trim();
  const full = (s) => norm(s).replace(/[^a-z0-9\u0900-\u097f]/g, "");
  const partEn = (s) => full(norm(s).split("/")[0]);
  const partHi = (s) => full(norm(s).split("/").slice(1).join("/"));
  const pad2 = (n) => (String(n).length < 2 ? "0" + n : String(n));
  const digits = (s) => String(s == null ? "" : s).replace(/\D+/g, "");

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

  // Saved profile se caste / sub-caste ka NAAM
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
    const opts = Array.from(el.options).filter((o) => o.value !== "" && o.value !== "0");
    if (!opts.length) return null;
    const wFull = full(wantedText), wEn = partEn(wantedText), wHi = partHi(wantedText);
    return (
      opts.find((o) => full(o.text) === wFull) ||
      (wEn && opts.find((o) => partEn(o.text) === wEn && (!wHi || partHi(o.text) === wHi))) ||
      (wEn && opts.find((o) => partEn(o.text) === wEn)) ||
      (wHi && opts.find((o) => partHi(o.text) === wHi)) ||
      null
    );
  }

  const sig = (el) => (el ? Array.from(el.options).map((o) => o.value).join("|") : "");

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

  function salutationFor(data) {
    const s = data.ncl_salutation;
    if (s && s !== "auto") return String(s);
    if (String(data.gender) === "1") return "1"; // श्री
    if (String(data.gender) === "2") return data.husbandname ? "2" : "3"; // श्रीमती / सुश्री
    return "4";
  }

  function tickCheckbox(rep, name, value, label) {
    const el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (!el) { rep.missing.push(label); return false; }
    try {
      if (!el.checked) el.click();
      el.checked = true;
      saathiFire(el, ["change"]);
      rep.ok++;
      return true;
    } catch (e) { rep.failed.push(label); return false; }
  }

  /* ------------------------------------------------------------------ */
  /* Main fill                                                           */
  /* ------------------------------------------------------------------ */
  let running = false;

  async function ewsFill(data) {
    if (running) { saathiToast("Fill pehle se chal raha hai, thoda ruko…", "info"); return; }
    running = true;
    const cfg = EWS;
    const rep = saathiNewReport();
    saathiToast("Page ko haath mat lagayein.", "info", 90000, { title: cfg.label + " bhar raha hai…", spinner: true });

    try {
      // ---- Hindi naam (parallel, fail-safe) ----
      const hiPromise = Promise.all([
        transliterate(data.name), transliterate(data.fathername),
        transliterate(data.mothername), transliterate(data.husbandname),
      ]);

      // ---- Certificate language + Gender + Salutation ----
      await saathiSetSelect(rep, cfg.certFormat, data.ncl_certFormat || "1", "Certificate format", { timeout: 2500 });
      saathiSetRadio(rep, cfg.genderName, data.gender, "Gender");
      await saathiSetSelect(rep, cfg.salutation, salutationFor(data), "Salutation", { timeout: 2500 });

      // ---- Names ----
      saathiSetText(rep, cfg.name, data.name, "Name");
      saathiSetText(rep, cfg.father, data.fathername, "Father name");
      saathiSetText(rep, cfg.mother, data.mothername, "Mother name");
      saathiSetText(rep, cfg.husband, data.husbandname, "Husband / Wife name");
      const hi = await hiPromise;
      if (hi[0]) saathiSetText(rep, cfg.nameHi, hi[0], "Name (Hindi)");
      if (hi[1]) saathiSetText(rep, cfg.fatherHi, hi[1], "Father name (Hindi)");
      if (hi[2]) saathiSetText(rep, cfg.motherHi, hi[2], "Mother name (Hindi)");
      if (hi[3]) saathiSetText(rep, cfg.husbandHi, hi[3], "Husband / Wife name (Hindi)");
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
      saathiSetRadio(rep, cfg.residenceTypeName, data.residenceType, "Residence type", /^\d+_/);

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
                  const rt = String(data.residenceType || "1").replace(/^\d+_/, "");
                  const gramId = cfg.gramByType[rt] || cfg.gramByType[1];
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
          await policeJob;
        }
      }

      // ---- Religion ----
      if (data.ncl_religion) saathiSetText(rep, cfg.religion, data.ncl_religion, "Religion");
      else rep.missing.push("Religion (popup me bharein)");

      // ---- EWS category radio (क / ख) ----
      saathiSetRadio(rep, cfg.categoryName, String(data.ews_category || "1"), "EWS category (क/ख)");
      await sleep(500);

      // ---- Caste (NAAM se match; na mile to Others + specify) ----
      const ct = wantedCasteTexts(data);
      const typedCaste = String(data.ews_casteText || "").trim();
      const wantedCaste = typedCaste || ct.casteText;
      const casteEl = g(cfg.caste);
      if (!wantedCaste) {
        rep.missing.push("Caste (popup me 'EWS jaati' ya profile ki jaati bharein)");
      } else if (casteEl) {
        const hit = await saathiWaitFor(() => findOptionByText(casteEl, wantedCaste), 3000, 120);
        if (hit) {
          const subBefore = sig(g(cfg.subcaste));
          casteEl.value = hit.value;
          saathiFire(casteEl, ["input", "change"]);
          rep.ok++;
          if (!typedCaste && ct.subText) {
            await saathiWaitFor(() => sig(g(cfg.subcaste)) !== subBefore, 4000, 120);
            await pickByText(rep, cfg.subcaste, ct.subText, "Sub-caste", 4000);
          }
        } else {
          const okO = await saathiSetSelect(rep, casteEl, "0", "Caste (Others)", { timeout: 2000 });
          if (okO) {
            await sleep(300);
            const hiPart = wantedCaste.indexOf("/") >= 0 ? wantedCaste.split("/").slice(1).join("/").trim() : wantedCaste;
            saathiSetText(rep, cfg.casteOther, hiPart || wantedCaste, "Caste (specify)");
          }
          rep.failed.push("Caste '" + wantedCaste + "' EWS list me nahi — 'Others' chuna, jaanch lein (EWS general jaati ke liye hota hai)");
        }
      }

      // ---- Income: ews_income, nahi to profile ki income ka yog ----
      let inc = digits(data.ews_income);
      if (!inc) {
        const sum = [data.incomefromgovt, data.incomefrombusiness, data.incomefromagriculture, data.incomefromothers, data.ncl_pension]
          .reduce((a, v) => a + (parseInt(digits(v), 10) || 0), 0);
        if (sum > 0) inc = String(sum);
      }
      if (inc) {
        if (inc.length > 7) rep.failed.push("Parivar ki aay (7 ank se zyada nahi ho sakti)");
        else if (saathiSetText(rep, cfg.income, inc, "Parivar ki kul aay")) {
          const el = g(cfg.income);
          if (el) saathiFire(el, ["keyup", "blur"]);
        }
      } else rep.missing.push("Parivar ki kul aay (popup me EWS aay bharein)");

      // ---- 5 shartein + Form-II (sirf operator ke 'haan' par) ----
      if (String(data.ews_criteria) === "1") {
        for (let v = 1; v <= 5; v++) tickCheckbox(rep, cfg.criteriaName, v, "EWS shart " + v);
      } else {
        rep.missing.push("EWS ki 5 shartein tick nahi ki (aavedak se poochkar popup me 'haan' chunein ya haath se tick karein)");
      }
      if (data.ews_formII === true || data.ews_formII === "true" || data.ews_formII === "1") {
        tickCheckbox(rep, cfg.formII, "1", "Prapatra-II self declaration");
      }

      // ---- Photo ----
      await saathiAttachImage(rep, cfg.photo, data.image);
    } catch (err) {
      console.error("[Click & Continue][EWS] fill error:", err);
      rep.failed.push("Unexpected error: " + (err && err.message));
    } finally {
      running = false;
    }

    saathiReportToast("EWS", rep);
    if (rep.missing.length || rep.failed.length) console.warn("[Click & Continue][EWS] fill report:", rep);
  }

  /* ------------------------------------------------------------------ */
  /* nclFill.js ke wrapper ke upar wrap: EWS page par hum, baaki sab     */
  /* par pehle wala code (NCL / Caste / Income / Residence).             */
  /* ------------------------------------------------------------------ */
  const prevFill = typeof window.fillFormFields === "function" ? window.fillFormFields : null;
  window.fillFormFields = async function (data) {
    if (isEws()) return ewsFill(data || {});
    return prevFill ? prevFill.apply(this, arguments) : undefined;
  };

  // Debug helper: console me __saathiEwsDetect() -> true/false
  window.__saathiEwsDetect = isEws;
})();
