/**
 * docStore.js  (v2 — customer registry)
 * ------------------------------------------------------------
 * Shared storage for each customer's scanned documents, so they can
 * be re-used on the government page's "Attach Enclosure(s)" step.
 *
 * WHAT CHANGED IN v2 — "same mobile number, different person"
 * ------------------------------------------------------------
 * v1 keyed a customer's documents by MOBILE NUMBER (profile_<mobile>).
 * Families often register several people on one number, so two
 * customers silently shared (and overwrote) one document set.
 *
 * v2 keeps a small customer registry (saathiCustomers):
 *     [{ id, name, mobile, note, createdAt }]
 * Documents are stored by the customer's unique id, NOT by number, so
 * any number of customers can share a mobile number and each keeps
 * their own documents. People are told apart by NAME when a saved
 * profile is opened (Load/Update) or a mobile is typed in the form.
 *
 * Existing v1 data keeps working: documents already stored under
 * profile_<mobile> are adopted as the first customer of that number.
 *
 * Each stored document can also carry its own metadata:
 *     holderName (whose document), docNumber (Aadhaar / EPIC / PAN …)
 *
 * Uses chrome.storage.local only — everything stays on this device.
 * Loaded by popup.html AND by the enclosureAutoFill.js content script
 * (chrome.storage.local is the bridge between them); the portal-side
 * script still just calls getDocAsFile / listDocTypes / getActiveProfileLabel.
 * ------------------------------------------------------------
 */

const DocStore = (function () {

  const STORAGE_KEY = "saathiDocStoreByProfile"; // { [customerId]: { [docType]: entry } }
  const CUSTOMERS_KEY = "saathiCustomers";       // [{ id, name, mobile, note, createdAt }]
  const ACTIVE_ID_KEY = "saathiActiveProfileId";
  const ACTIVE_LABEL_KEY = "saathiActiveProfileLabel";
  const INDEX_KEY = "saathiProfileIndex";        // mirror of saved-profile cards (name + mobile)
  const MAX_BYTES_PER_DOC = 2 * 1024 * 1024;     // 2MB per document (portal limit)
  const PROFILE_PREFIX = "profile_";             // legacy v1 key = customer's mobile number

  const digitsOf = (m) => String(m || "").replace(/\D/g, "");
  const makeSessionId = () => "cust_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const keyForMobile = (mobile) => PROFILE_PREFIX + digitsOf(mobile);

  // ---------- low-level storage ----------

  function getAllProfiles() {
    return new Promise((resolve) => chrome.storage.local.get([STORAGE_KEY], (res) => resolve((res && res[STORAGE_KEY]) || {})));
  }

  function setAllProfiles(all) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: all }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError); else resolve();
      });
    });
  }

  // ---------- customer registry ----------

  function getCustomers() {
    return new Promise((resolve) => chrome.storage.local.get([CUSTOMERS_KEY], (res) => resolve((res && res[CUSTOMERS_KEY]) || [])));
  }

  function setCustomers(list) {
    return new Promise((resolve) => chrome.storage.local.set({ [CUSTOMERS_KEY]: list }, resolve));
  }

  const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z\u0900-\u097f]+/g, " ").trim();

  /**
   * Same person? Names match when one is made of the other's words
   * ("Rahul" ~ "Rahul Kumar") but NOT when they merely share a first word
   * ("Anita Devi" vs "Anita Kumari"). An empty name never matches.
   */
  function sameName(a, b) {
    const x = normName(a).split(" ").filter(Boolean), y = normName(b).split(" ").filter(Boolean);
    if (!x.length || !y.length) return false;
    const [small, big] = x.length <= y.length ? [x, y] : [y, x];
    return small.every((w) => big.includes(w));
  }

  const labelOf = (c) => [c.name, c.mobile].filter(Boolean).join(" · ");

  async function legacyDocsExist(id) {
    const all = await getAllProfiles();
    return !!(all[id] && Object.keys(all[id]).length);
  }

  /**
   * Find (or, with create:true, make) the customer for a mobile + name.
   *  - one customer on that number and no name given  -> that customer
   *  - a customer whose name matches                    -> that customer
   *  - a nameless customer on that number               -> adopts the name
   *  - otherwise                                        -> a NEW customer (same number, different person)
   * Returns the customer id, or null when it cannot be decided safely
   * (several customers share the number and no name was given).
   */
  async function resolveCustomerId(mobile, name, opts) {
    opts = opts || {};
    const digits = digitsOf(mobile);
    if (digits.length !== 10) return null;
    const list = await getCustomers();
    const cands = list.filter((c) => c.mobile === digits);
    const cleanName = String(name || "").trim();

    let hit = null;
    if (cleanName) {
      hit = cands.find((c) => sameName(c.name, cleanName)) || null;
      if (!hit) {
        const blank = cands.find((c) => !c.name);
        if (blank) { blank.name = cleanName; await setCustomers(list); hit = blank; }
      }
    } else if (cands.length === 1) {
      hit = cands[0];
    } else if (cands.length > 1) {
      if (opts.pickFirst) hit = cands.find((c) => c.id === opts.preferId) || cands[0];
      else return null;
    }
    if (hit) return hit.id;
    if (opts.create === false) return null;

    // v1 documents (profile_<mobile>) become the FIRST customer of that number.
    const legacyId = keyForMobile(digits);
    const adoptLegacy = cands.length === 0 && !list.some((c) => c.id === legacyId) && (await legacyDocsExist(legacyId));
    const customer = { id: adoptLegacy ? legacyId : makeSessionId(), name: cleanName, mobile: digits, note: "", createdAt: Date.now() };
    list.push(customer);
    await setCustomers(list);
    return customer.id;
  }

  /** Always creates a NEW customer — used by the Vault's "naya customer" form. */
  async function registerCustomer(data) {
    const list = await getCustomers();
    const customer = {
      id: makeSessionId(), name: String((data && data.name) || "").trim(),
      mobile: digitsOf(data && data.mobile), note: String((data && data.note) || "").trim(), createdAt: Date.now(),
    };
    list.push(customer);
    await setCustomers(list);
    return customer;
  }

  async function updateCustomer(id, patch) {
    const list = await getCustomers();
    const c = list.find((x) => x.id === id);
    if (!c) return null;
    if (patch.name !== undefined) c.name = String(patch.name).trim();
    if (patch.mobile !== undefined) c.mobile = digitsOf(patch.mobile);
    if (patch.note !== undefined) c.note = String(patch.note).trim();
    await setCustomers(list);
    if ((await getActiveProfileId()) === id) await setActiveLabelFor(c);
    return c;
  }

  async function deleteCustomer(id) {
    const list = (await getCustomers()).filter((c) => c.id !== id);
    await setCustomers(list);
    const all = await getAllProfiles();
    if (all[id]) { delete all[id]; await setAllProfiles(all); }
    if ((await getActiveProfileId()) === id) await startNewProfile();
  }

  async function getCustomer(id) {
    return (await getCustomers()).find((c) => c.id === id) || null;
  }

  /** Make sure a legacy profile_<mobile> id (with documents) is present in the registry. */
  async function ensureRegistered(id) {
    if (!id || id.indexOf(PROFILE_PREFIX) !== 0) return null;
    const list = await getCustomers();
    let c = list.find((x) => x.id === id);
    if (c) return c;
    const mobile = id.slice(PROFILE_PREFIX.length);
    const idx = await new Promise((r) => chrome.storage.local.get([INDEX_KEY], (res) => r((res && res[INDEX_KEY]) || [])));
    const known = idx.find((p) => digitsOf(p.mobile) === mobile);
    c = { id, name: (known && known.name) || "", mobile, note: "", createdAt: Date.now() };
    list.push(c);
    await setCustomers(list);
    return c;
  }

  /** Register every v1 document set and every saved profile card that is not a customer yet. */
  async function syncRegistry() {
    const all = await getAllProfiles();
    for (const id of Object.keys(all)) await ensureRegistered(id);
    const idx = await new Promise((r) => chrome.storage.local.get([INDEX_KEY], (res) => r((res && res[INDEX_KEY]) || [])));
    for (const p of idx) {
      if (digitsOf(p.mobile).length === 10) await resolveCustomerId(p.mobile, p.name, { create: true });
    }
    return getCustomers();
  }

  // ---------- active customer (shared with the Form panel and the portal script) ----------

  function getActiveProfileId() {
    return new Promise((resolve) => {
      chrome.storage.local.get([ACTIVE_ID_KEY], (res) => {
        const existing = res && res[ACTIVE_ID_KEY];
        if (existing) { resolve(existing); return; }
        const id = makeSessionId();
        chrome.storage.local.set({ [ACTIVE_ID_KEY]: id }, () => resolve(id));
      });
    });
  }

  async function setActiveLabelFor(c) {
    return new Promise((resolve) => chrome.storage.local.set({ [ACTIVE_LABEL_KEY]: labelOf(c) }, resolve));
  }

  /** Make a registered customer the active one (Form panel + portal "Attach" button follow). */
  async function setActiveCustomer(id) {
    const c = (await getCustomer(id)) || (await ensureRegistered(id));
    await new Promise((resolve) => chrome.storage.local.set({ [ACTIVE_ID_KEY]: id, [ACTIVE_LABEL_KEY]: c ? labelOf(c) : "" }, resolve));
    return c;
  }

  /** Starts a fresh, not-yet-registered session (form "Clear" / "+ Create Profile"). */
  function startNewProfile() {
    return new Promise((resolve) => {
      const id = makeSessionId();
      chrome.storage.local.set({ [ACTIVE_ID_KEY]: id, [ACTIVE_LABEL_KEY]: "" }, () => resolve(id));
    });
  }

  /** Human-readable label of the active customer — registry first, then whatever is typed in the form. */
  async function getActiveProfileLabel() {
    const id = await getActiveProfileId();
    const reg = await getCustomer(id);
    if (reg && (reg.name || reg.mobile)) return labelOf(reg);
    return new Promise((resolve) => {
      const nameEl = typeof document !== "undefined" ? document.getElementById("name") : null;
      const mobileEl = typeof document !== "undefined" ? document.getElementById("mobile") : null;
      const name = nameEl ? nameEl.value.trim() : "";
      const mobile = mobileEl ? mobileEl.value.trim() : "";
      if (name || mobile) {
        const label = [name, mobile].filter(Boolean).join(" · ");
        chrome.storage.local.set({ [ACTIVE_LABEL_KEY]: label });
        resolve(label);
        return;
      }
      chrome.storage.local.get([ACTIVE_LABEL_KEY], (res) => resolve((res && res[ACTIVE_LABEL_KEY]) || null));
    });
  }

  /**
   * A saved profile was opened (Load / Update): switch to ITS customer.
   * Matched by mobile AND name, so two people on one number stay separate.
   */
  async function switchToProfile(mobile, name) {
    const digits = digitsOf(mobile);
    let id;
    if (digits.length === 10) {
      const current = await getActiveProfileId();
      id = await resolveCustomerId(digits, name, { create: true, pickFirst: true, preferId: current });
    }
    if (!id) {
      id = makeSessionId();
      await new Promise((resolve) => chrome.storage.local.set({ [ACTIVE_ID_KEY]: id, [ACTIVE_LABEL_KEY]: name || "" }, resolve));
      return id;
    }
    await setActiveCustomer(id);
    return id;
  }

  /**
   * A full mobile number was typed in the Form tab. Documents uploaded
   * under a TEMPORARY session are attached to the right customer; a
   * customer that already exists is never touched (so nobody's documents
   * are dragged onto someone else who shares the number).
   */
  async function migrateActiveSessionTo(mobile) {
    const digits = digitsOf(mobile);
    if (digits.length !== 10) return null;
    const currentId = await getActiveProfileId();
    await ensureRegistered(currentId);
    const list = await getCustomers();
    const reg = list.find((c) => c.id === currentId);
    const nameEl = typeof document !== "undefined" ? document.getElementById("name") : null;
    const formName = nameEl ? nameEl.value.trim() : "";

    if (reg) {
      // Already a real customer: just complete their details, never move documents.
      let changed = false;
      if (!reg.mobile) { reg.mobile = digits; changed = true; }
      if (!reg.name && formName) { reg.name = formName; changed = true; }
      if (changed) { await setCustomers(list); await setActiveLabelFor(reg); }
      return reg.id;
    }

    // Temporary session: find / create the customer this number + name belongs to.
    const targetId = await resolveCustomerId(digits, formName, { create: !!formName || !list.some((c) => c.mobile === digits) });
    if (!targetId) return null; // number is shared and no name yet — wait until the name is typed
    const all = await getAllProfiles();
    const fromDocs = all[currentId];
    if (fromDocs && Object.keys(fromDocs).length) {
      all[targetId] = Object.assign({}, fromDocs, all[targetId] || {});
      delete all[currentId];
      await setAllProfiles(all);
    }
    await setActiveCustomer(targetId);
    return targetId;
  }

  // ---------- lookups by mobile (+ name) used by the Profile cards ----------

  const lookupId = (mobile, name) => resolveCustomerId(mobile, name, { create: false });

  async function deleteProfileDocs(mobile, name) {
    const id = await lookupId(mobile, name);
    if (id) await deleteCustomer(id);
  }

  async function clearActiveProfileDocs() {
    const id = await getActiveProfileId();
    const all = await getAllProfiles();
    if (all[id]) { delete all[id]; await setAllProfiles(all); }
  }

  async function getDocsCountForMobile(mobile, name) {
    const id = await lookupId(mobile, name);
    if (!id) return 0;
    const all = await getAllProfiles();
    return all[id] ? Object.keys(all[id]).length : 0;
  }

  async function hasDocsForMobile(mobile, name) {
    return (await getDocsCountForMobile(mobile, name)) > 0;
  }

  /** Copies a document from the active customer onto another one (by mobile + name). */
  async function copyDocToProfile(docType, targetMobile, targetName) {
    const sourceId = await getActiveProfileId();
    const targetId = await resolveCustomerId(targetMobile, targetName, { create: true, pickFirst: true });
    if (!targetId || targetId === sourceId) return false;
    return copyDocBetween(docType, sourceId, targetId);
  }

  async function copyDocBetween(docType, sourceId, targetId) {
    const all = await getAllProfiles();
    const entry = all[sourceId] && all[sourceId][docType];
    if (!entry || !targetId) return false;
    if (!all[targetId]) all[targetId] = {};
    all[targetId][docType] = Object.assign({}, entry, { savedAt: Date.now() });
    await setAllProfiles(all);
    return true;
  }

  // ---------- files ----------

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function base64ToFile(dataUrl, fileName, mimeType) {
    const arr = dataUrl.split(",");
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], fileName, { type: mimeType });
  }

  /** meta (optional): { holderName, docNumber, note } — kept per document. */
  async function saveDoc(docType, file, profileId, meta) {
    if (!docType || docType === "unknown" || !file) return false;
    if (file.size > MAX_BYTES_PER_DOC) {
      console.warn("DocStore: skipped saving", file.name, "— bigger than 2MB cap.");
      return false;
    }
    const id = profileId || (await getActiveProfileId());
    const dataUrl = await fileToBase64(file);
    const all = await getAllProfiles();
    if (!all[id]) all[id] = {};
    const old = all[id][docType] || {};
    all[id][docType] = {
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      dataUrl,
      savedAt: Date.now(),
      holderName: meta && meta.holderName !== undefined ? String(meta.holderName).trim() : (old.holderName || ""),
      docNumber: meta && meta.docNumber !== undefined ? String(meta.docNumber).trim() : (old.docNumber || ""),
      note: meta && meta.note !== undefined ? String(meta.note).trim() : (old.note || ""),
    };
    await setAllProfiles(all);
    return true;
  }

  async function updateDocMeta(docType, patch, profileId) {
    const id = profileId || (await getActiveProfileId());
    const all = await getAllProfiles();
    const entry = all[id] && all[id][docType];
    if (!entry) return false;
    ["holderName", "docNumber", "note"].forEach((k) => { if (patch[k] !== undefined) entry[k] = String(patch[k]).trim(); });
    await setAllProfiles(all);
    return true;
  }

  async function getDoc(docType, profileId) {
    const id = profileId || (await getActiveProfileId());
    const all = await getAllProfiles();
    return (all[id] && all[id][docType]) || null;
  }

  async function getDocAsFile(docType, profileId) {
    const entry = await getDoc(docType, profileId);
    if (!entry) return null;
    return base64ToFile(entry.dataUrl, entry.name, entry.type);
  }

  async function listDocTypes(profileId) {
    const id = profileId || (await getActiveProfileId());
    const all = await getAllProfiles();
    return Object.keys(all[id] || {});
  }

  /** Every document entry of one customer: { [docType]: entry } (includes dataUrl). */
  async function getCustomerDocs(id) {
    const all = await getAllProfiles();
    return all[id] || {};
  }

  /** { [customerId]: number of documents } — for the Vault's customer list. */
  async function getDocCounts() {
    const all = await getAllProfiles();
    const out = {};
    Object.keys(all).forEach((id) => { out[id] = Object.keys(all[id] || {}).length; });
    return out;
  }

  async function removeDoc(docType, profileId) {
    const id = profileId || (await getActiveProfileId());
    const all = await getAllProfiles();
    if (all[id]) delete all[id][docType];
    await setAllProfiles(all);
  }

  /** Writes back a doc entry exactly as previously saved (used for undo). */
  async function restoreDoc(docType, entry, profileId) {
    const id = profileId || (await getActiveProfileId());
    const all = await getAllProfiles();
    if (!all[id]) all[id] = {};
    all[id][docType] = entry;
    await setAllProfiles(all);
    return true;
  }

  function getStorageBytesInUse() {
    return new Promise((resolve) => {
      if (chrome.storage.local.getBytesInUse) chrome.storage.local.getBytesInUse(null, (bytes) => resolve(bytes || 0));
      else resolve(0);
    });
  }

  return {
    // documents
    saveDoc, getDoc, getDocAsFile, listDocTypes, removeDoc, restoreDoc, updateDocMeta, getCustomerDocs, getDocCounts,
    // active customer
    getActiveProfileId, startNewProfile, getActiveProfileLabel, setActiveCustomer,
    switchToProfile, migrateActiveSessionTo,
    // customers
    getCustomers, getCustomer, registerCustomer, updateCustomer, deleteCustomer, resolveCustomerId, syncRegistry, sameName, labelOf,
    // by mobile (+name) — Profile cards
    deleteProfileDocs, clearActiveProfileDocs, hasDocsForMobile, getDocsCountForMobile, copyDocToProfile, copyDocBetween,
    keyForMobile, getStorageBytesInUse,
  };
})();

if (typeof module !== "undefined") module.exports = DocStore;
