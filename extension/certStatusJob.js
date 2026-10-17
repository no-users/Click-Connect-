/**
 * certStatusJob.js
 * ------------------------------------------------------------
 * Shared state for the "Status Check" section (Certificates tab).
 * Loaded by the popup, the portal content script (certStatusFill.js)
 * and the background worker; all of them read/write the SAME storage
 * key, so nobody has to message anybody.
 *
 * job = {
 *   records: [{ id, ref, date, name, father, mother, status, result, file }],
 *       date    = application submission date, YYYY-MM-DD
 *       status  = pending | done | skipped | failed
 *       result  = { text, kind, at } once the portal showed the status
 *   idx: number,        // record being worked on
 *   running: boolean,
 *   autoSubmit: boolean,  // press Submit as soon as the captcha is typed
 *   (the next record is opened only when the operator presses "Agla record" on the result page)
 *   sound: boolean,
 * }
 * ------------------------------------------------------------
 */
const SaathiStatusJob = (function () {
  const KEY = "saathiStatusJob";
  const URL_KEY = "saathiStatusPageUrl";
  const WANT_KEY = "saathiStatusWantOpen";   // { at } — "open the status page from the portal home page now"
  const SEEN_KEY = "saathiStatusFlowSeen";   // timestamp — a Track Application page has loaded
  const RECOVER_KEY = "saathiStatusRecover"; // { n, at } — automatic re-open counter

  const HOME_URL = "https://serviceonline.bihar.gov.in/";
  // The Track Application page itself throws "FOLLOWING EXCEPTION OCCURRED..." when it is opened
  // straight from a link; the portal only accepts it when it is opened FROM the portal page
  // (the "आवेदन की स्थिति देखें" link). So the saved link is the portal page that carries that link.
  const DEFAULT_URL = HOME_URL;
  const STEP1_URL = "https://serviceonline.bihar.gov.in/officials/citizenApplication.html";
  // Pages of the Track-Application flow (step 1 / 2 / 3 / result all live under /officials/).
  const FLOW_PATH_RE = /\/officials\/(?:citizenApplication\.html|citizenServiceTrackList\.do|renderAdditionalFields\.do|[A-Za-z]*(?:Track|Status)[A-Za-z]*\.do)/i;
  const HOST_RE = /^https:\/\/serviceonline\.bihar\.gov\.in\//i;

  const EMPTY = () => ({ records: [], idx: 0, running: false, autoSubmit: true, sound: true });

  function get() {
    return new Promise((resolve) => {
      chrome.storage.local.get([KEY], (res) => resolve(Object.assign(EMPTY(), (res && res[KEY]) || {})));
    });
  }
  function set(job) {
    return new Promise((resolve) => chrome.storage.local.set({ [KEY]: job }, () => resolve(job)));
  }
  // Updates are chained: several receipts finish OCR at the same moment and each adds its
  // records — without the chain they would all start from the same old copy and overwrite each other.
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

  /** Mark a record finished and move the pointer on (only if it was the active one). */
  function finish(recId, status, result) {
    return update((job) => {
      const i = job.records.findIndex((r) => r.id === recId);
      if (i < 0) return;
      const rec = job.records[i];
      rec.status = status;
      if (result) {
        // re-check: compare with the status seen the last time (rec.prev, kept when the record was re-queued)
        const sig = (t) => String(t || "").replace(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
        if (rec.prev && rec.prev.text) {
          result.prevText = rec.prev.text; result.prevAt = rec.prev.at;
          result.changed = sig(rec.prev.text) !== sig(result.text);
        }
        rec.result = result;
        rec.prev = null;
      }
      if (job.idx === i) {
        const n = nextPendingIndex(job, i + 1);
        if (n >= 0) job.idx = n;
        else { const any = nextPendingIndex(job, 0); if (any >= 0) job.idx = any; else job.running = false; }
      }
    });
  }

  /** YYYY-MM-DD -> DD/MM/YYYY (the format the portal's date box shows). */
  function toPortalDate(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  }
  /** DD/MM/YYYY (or DD-MM-YYYY) -> YYYY-MM-DD, "" if not a real date. */
  function fromPortalDate(txt) {
    const m = String(txt || "").trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (!m) return "";
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return "";
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  /**
   * Make any portal address usable as the Status Check link: it must be on
   * serviceonline.bihar.gov.in. A Track Application page address (which
   * errors when opened directly) is replaced by the portal home page, from
   * where the status link is opened the way the portal expects.
   * Returns { url, changed } or null when the address cannot be used.
   */
  function normalizeLink(raw) {
    let u;
    try { u = new URL(String(raw || "").trim()); } catch (e) { return null; }
    if (u.protocol !== "https:" || u.hostname !== "serviceonline.bihar.gov.in") return null;
    if (FLOW_PATH_RE.test(u.pathname)) return { url: HOME_URL, changed: true };
    return { url: u.origin + u.pathname, changed: !!(u.search || u.hash) };
  }

  /** The portal's own error page for a request it refused. */
  const isExceptionText = (t) => /FOLLOWING\s+EXCEPTION\s+OCCURRED|EXCEPTION\s+OCCURRED\s+WHILE/i.test(String(t || ""));

  const isFlowPath = (p) => FLOW_PATH_RE.test(String(p || ""));

  return { KEY, URL_KEY, WANT_KEY, SEEN_KEY, RECOVER_KEY, HOME_URL, DEFAULT_URL, STEP1_URL, isExceptionText, HOST_RE, get, set, update, current, finish, nextPendingIndex, toPortalDate, fromPortalDate, normalizeLink, isFlowPath };
})();

if (typeof module !== "undefined") module.exports = SaathiStatusJob;
