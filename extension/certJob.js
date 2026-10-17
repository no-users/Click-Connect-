/**
 * certJob.js
 * ------------------------------------------------------------
 * Shared state for the "Certificate Download" section. Loaded by the
 * popup, by the content script on the portal page, and by the
 * background worker — all three read/write the SAME storage key, so
 * nobody has to message anybody: change the job, everyone sees it.
 *
 * job = {
 *   records: [{ id, ref, name, file, status }],   // status: pending|done|skipped|failed
 *   idx: number,            // index of the record being worked on
 *   running: boolean,       // auto mode on/off
 *   autoSubmit: boolean,    // press Download as soon as the captcha is typed
 * }
 * ------------------------------------------------------------
 */
const SaathiCertJob = (function () {
  const KEY = "saathiCertJob";
  const URL_KEY = "saathiCertPageUrl";

  // Certificate kinds and the 2-letter code used in the saved file name.
  const SERVICE_LABELS = {
    income: "आय / Income", caste: "जाति / Caste", residence: "निवास / Residence", ews: "EWS",
    ncl: "Non-Creamy Layer", birth: "जन्म / Birth", death: "मृत्यु / Death", marriage: "विवाह / Marriage", other: "अन्य / Other",
  };
  const DEFAULT_CODES = { income: "IN", caste: "CA", residence: "RE", ews: "EW", ncl: "NC", birth: "BR", death: "DT", marriage: "MR", other: "RT" };
  const DEFAULT_TEMPLATE = "{PFX}{YY}-{NAME}";

  const DEFAULT_SETTINGS = () => ({ template: DEFAULT_TEMPLATE, folder: "RTPS_Certificates", sound: true, codes: Object.assign({}, DEFAULT_CODES) });
  const EMPTY = () => ({ records: [], idx: 0, running: false, autoSubmit: true, settings: DEFAULT_SETTINGS() });

  function withSettings(job) {
    const d = DEFAULT_SETTINGS(), st = job.settings || {};
    job.settings = Object.assign(d, st, { codes: Object.assign({}, DEFAULT_CODES, st.codes || {}) });
    return job;
  }

  function get() {
    return new Promise((resolve) => {
      chrome.storage.local.get([KEY], (res) => resolve(withSettings(Object.assign(EMPTY(), (res && res[KEY]) || {}))));
    });
  }

  function set(job) {
    return new Promise((resolve) => chrome.storage.local.set({ [KEY]: job }, () => resolve(job)));
  }

  /**
   * Read-modify-write helper. fn gets the job and may mutate it.
   * Calls are chained so two of them can never interleave: several receipts
   * finish OCR at the same moment and each one adds its records — without the
   * chain, every update would start from the same old copy and overwrite the others.
   */
  let chain = Promise.resolve();
  function update(fn) {
    const run = chain.then(async () => {
      const job = await get();
      fn(job);
      return set(job);
    });
    chain = run.catch(() => {});
    return run;
  }

  function nextPendingIndex(job, from) {
    for (let i = from; i < job.records.length; i++) if (job.records[i].status === "pending") return i;
    return -1;
  }

  function current(job) {
    const rec = job.records[job.idx];
    return rec && rec.status === "pending" ? rec : null;
  }

  /**
   * Mark a record finished and move on to the next pending one.
   * Only moves the pointer if that record is the one currently active,
   * so a late "download complete" can never skip a record by mistake.
   */
  function finish(recId, status) {
    return update((job) => {
      const i = job.records.findIndex((r) => r.id === recId);
      if (i < 0) return;
      job.records[i].status = status;
      if (status === "done" || status === "failed") job.records[i].at = Date.now();   // for the ETA shown in the popup
      if (job.idx === i) {
        const n = nextPendingIndex(job, i + 1);
        if (n >= 0) job.idx = n;
        else { const any = nextPendingIndex(job, 0); if (any >= 0) job.idx = any; else job.running = false; }
      }
    });
  }

  const cleanPart = (str) => String(str == null ? "" : str).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").replace(/^[\s.\-]+|[\s.]+$/g, "").trim();

  /** 4-digit year of the application, taken from its reference number (BICCO/2026/...). */
  function yearOf(rec) {
    const m = String(rec.ref || "").match(/\/(20\d{2})\//);
    return m ? m[1] : String(new Date().getFullYear());
  }

  /**
   * Saved file name, e.g. income + BICCO/2026/00123 + "Reshmi Kiran" -> "RTPS_Certificates/IN26-Reshmi Kiran.pdf".
   * Tokens in the template: {PFX} {YY} {YYYY} {NAME} {REF} {SERIAL} {TYPE}
   */
  function fileNameFor(rec, settings) {
    const st = settings || DEFAULT_SETTINGS();
    const codes = Object.assign({}, DEFAULT_CODES, st.codes || {});
    const year = yearOf(rec);
    const serial = (String(rec.ref || "").split("/")[2]) || "";
    const map = {
      PFX: cleanPart(codes[rec.type] || codes.other || ""),
      YY: year.slice(2), YYYY: year,
      NAME: cleanPart(rec.name).slice(0, 80) || "Applicant",
      REF: cleanPart(String(rec.ref || "").replace(/\//g, "-")),
      SERIAL: cleanPart(serial),
      TYPE: cleanPart(rec.type || "other"),
    };
    let base = (st.template || DEFAULT_TEMPLATE).replace(/\{(\w+)\}/g, (_, k) => (k.toUpperCase() in map ? map[k.toUpperCase()] : ""));
    base = cleanPart(base).replace(/\.pdf$/i, "") || "certificate";
    const folder = String(st.folder || "").split(/[\\/]+/).map(cleanPart).filter(p => p && p !== "..").join("/");
    return (folder ? folder + "/" : "") + base + ".pdf";
  }

  const safeFileName = (rec, settings) => fileNameFor(rec, settings);

  return { KEY, URL_KEY, get, set, update, current, finish, nextPendingIndex, safeFileName, fileNameFor, yearOf, SERVICE_LABELS, DEFAULT_CODES, DEFAULT_TEMPLATE, DEFAULT_SETTINGS };
})();

if (typeof module !== "undefined") module.exports = SaathiCertJob;
