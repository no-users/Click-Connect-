/* locationCascade.js
 * Fills the dependent location dropdowns from locationData.js (window.SAATHI_LOCATION):
 *   district -> anumandal -> prakhand -> gram panchayat
 * and shows the Division (प्रमंडल) of the chosen district.
 *
 * Loaded AFTER popup.js, so it never edits the obfuscated popup.js. It works in 3 ways:
 *   1. normal user changes   -> change listeners
 *   2. programmatic fills    -> select.value hook (profile load, "same address", OCR apply):
 *                               if the option is missing, the right parent lists are built first
 *   3. popup.js overwriting  -> MutationObserver restores the correct list
 */
(function () {
  'use strict';
  var L = window.SAATHI_LOCATION;
  if (!L || !L.d) { console.warn('[locationCascade] data missing'); return; }

  var $ = function (id) { return document.getElementById(id); };
  var elD = $('district'), elA = $('anumandal'), elP = $('prakhand'), elG = $('gram'), elPS = $('policeStation');
  if (!elD || !elA || !elP || !elG) return;

  var nativeVal = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  var getV = function (el) { return nativeVal.get.call(el); };
  var setV = function (el, v) { nativeVal.set.call(el, v); };
  var wanted = {};                    // last known/requested value per select id (restored if popup.js rewrites a list)
  var setW = function (el, v) { wanted[el.id] = v; nativeVal.set.call(el, v); };

  /* ---------- indexes (id -> parents) ---------- */
  var subToDist = {}, blockToSubs = {}, gramToBlocks = {};
  Object.keys(L.d).forEach(function (did) {
    var subs = L.d[did][1];
    Object.keys(subs).forEach(function (sid) {
      subToDist[sid] = did;
      var blocks = subs[sid][1];
      Object.keys(blocks).forEach(function (bid) {
        (blockToSubs[bid] = blockToSubs[bid] || []).push(sid);
        blocks[bid][1].forEach(function (g) { (gramToBlocks[g[0]] = gramToBlocks[g[0]] || []).push(bid); });
      });
    });
  });
  var distToDivision = {};
  Object.keys(L.div || {}).forEach(function (dn) { L.div[dn].forEach(function (id) { distToDivision[id] = dn; }); });

  /* ---------- helpers ---------- */
  var busy = 0;                       // our own mutations -> ignore in observer
  function sig(items) { return items.map(function (i) { return i[0]; }).join('|'); }
  function currentSig(sel) {
    var out = [];
    for (var i = 1; i < sel.options.length; i++) out.push(sel.options[i].value);
    return out.join('|');
  }
  function render(sel, placeholder, items) {
    if (currentSig(sel) === sig(items) && sel.options.length) return;     // already correct
    var keep = getV(sel) || wanted[sel.id] || '';
    busy++;
    try {
      sel.innerHTML = '';
      var ph = document.createElement('option'); ph.value = ''; ph.textContent = placeholder; sel.appendChild(ph);
      items.forEach(function (it) {
        var o = document.createElement('option'); o.value = it[0]; o.textContent = it[1]; sel.appendChild(o);
      });
      setV(sel, '');
      if (keep) {
        for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === keep) { setV(sel, keep); break; }
      }
      wanted[sel.id] = getV(sel);
    } finally { busy--; }
  }

  function anumandalItems(did) {
    var d = L.d[did]; if (!d) return [];
    return Object.keys(d[1]).map(function (sid) { return [sid, d[1][sid][0]]; });
  }
  function prakhandItems(did, sid) {
    var d = L.d[did]; if (!d || !d[1][sid]) return [];
    var b = d[1][sid][1];
    return Object.keys(b).map(function (bid) { return [bid, b[bid][0]]; });
  }
  function gramItems(did, sid, bid) {
    var d = L.d[did]; if (!d || !d[1][sid] || !d[1][sid][1][bid]) return [];
    return d[1][sid][1][bid][1];
  }

  /* ---------- fillers (read parents, rebuild one level) ---------- */
  function fillAnumandal() { render(elA, 'Select Anumandal', anumandalItems(getV(elD))); }
  function fillPrakhand() {
    var did = getV(elD), sid = getV(elA);
    render(elP, 'Select Prakhand', sid && subToDist[sid] === did ? prakhandItems(did, sid) : []);
  }
  function fillGram() {
    var did = getV(elD), sid = getV(elA), bid = getV(elP);
    render(elG, 'Select Grampanchayat', bid && subToDist[sid] === did ? gramItems(did, sid, bid) : []);
  }
  function fillPolice() {
    // Real thana lists are only used if provided in L.ps[districtId]; otherwise popup.js's own list stays.
    if (!elPS || !L.ps) return;
    var list = L.ps[getV(elD)];
    if (list && list.length) render(elPS, 'Select Police Station', list);
  }
  function updateDivision() {
    var chip = $('saathiDivisionValue'); if (!chip) return;
    var dn = distToDivision[getV(elD)];
    chip.textContent = dn ? dn.split('/').reverse().join(' / ') : '';
    chip.classList.toggle('is-empty', !dn);
  }
  function refillAll() { fillAnumandal(); fillPrakhand(); fillGram(); fillPolice(); updateDivision(); }

  /* ---------- value hook: make programmatic sets order-independent ---------- */
  function hook(sel, ensure) {
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get: function () { return getV(this); },
      set: function (v) {
        v = (v === null || v === undefined) ? '' : String(v);
        wanted[sel.id] = v;
        if (v) { try { ensure(v); } catch (e) { console.warn('[locationCascade]', e); } }
        setV(this, v);
      }
    });
  }
  hook(elD, function () { /* districts are owned by popup.js */ });
  hook(elA, function (sid) {
    var did = subToDist[sid]; if (!did) return;
    if (getV(elD) !== did) { setW(elD, did); updateDivision(); }
    fillAnumandal();
  });
  hook(elP, function (bid) {
    var subs = blockToSubs[bid]; if (!subs) return;
    var sid = (subs.indexOf(getV(elA)) >= 0) ? getV(elA) : subs[0];
    var did = subToDist[sid];
    if (getV(elD) !== did) { setW(elD, did); updateDivision(); }
    if (getV(elA) !== sid) { fillAnumandal(); setW(elA, sid); }
    fillAnumandal(); fillPrakhand();
  });
  hook(elG, function (gid) {
    var blocks = gramToBlocks[gid]; if (!blocks) return;
    var bid = (blocks.indexOf(getV(elP)) >= 0) ? getV(elP) : blocks[0];
    var subs = blockToSubs[bid];
    var sid = (subs.indexOf(getV(elA)) >= 0) ? getV(elA) : subs[0];
    var did = subToDist[sid];
    if (getV(elD) !== did) { setW(elD, did); updateDivision(); }
    fillAnumandal(); if (getV(elA) !== sid) setW(elA, sid);
    fillPrakhand(); if (getV(elP) !== bid) setW(elP, bid);
    fillGram();
  });

  /* ---------- user events (run after popup.js handlers, so ours win) ---------- */
  elD.addEventListener('change', function () {
    wanted.district = getV(elD); wanted.anumandal = wanted.prakhand = wanted.gram = '';
    fillAnumandal(); setV(elA, ''); fillPrakhand(); fillGram(); fillPolice(); updateDivision();
  });
  elG.addEventListener('change', function () { wanted.gram = getV(elG); });
  elA.addEventListener('change', function () { wanted.anumandal = getV(elA); wanted.prakhand = wanted.gram = ''; fillPrakhand(); setV(elP, ''); fillGram(); });
  elP.addEventListener('change', function () { wanted.prakhand = getV(elP); wanted.gram = ''; fillGram(); });

  /* ---------- if popup.js rewrites a list, put the right one back ---------- */
  var obs = new MutationObserver(function () { if (!busy) refillAll(); });
  [elA, elP, elG].forEach(function (s) { obs.observe(s, { childList: true }); });
  elD.addEventListener('input', updateDivision);
  // district list is filled by popup.js; refresh the chip whenever it changes
  new MutationObserver(function () { if (!busy) updateDivision(); }).observe(elD, { childList: true });

  /* ---------- expose for other scripts (docsTab / "same address" call these by name) ---------- */
  window.updateAnumandals = function () { fillAnumandal(); fillPrakhand(); fillGram(); updateDivision(); };
  window.updatePrakhands = function () { fillPrakhand(); fillGram(); };
  window.updateGramPanchayats = function () { fillGram(); };
  if (elPS) {
    var origPS = window.updatePoliceStations;
    window.updatePoliceStations = function () {
      var r; if (typeof origPS === 'function') { try { r = origPS.apply(this, arguments); } catch (e) { } }
      fillPolice(); return r;
    };
  }

  /* ---------- Division (प्रमंडल) chip, display-only, placed under District ---------- */
  (function addDivisionChip() {
    var grp = elD.closest('.form-group'); if (!grp || $('saathiDivisionValue')) return;
    var box = document.createElement('div');
    box.className = 'form-group'; box.id = 'saathiDivisionGroup';
    box.innerHTML = '<label>प्रमंडल (Optional) <span style="font-weight:400;opacity:.65"></span></label>' +
      '<div id="saathiDivisionValue" class="is-empty" style="padding:9px 12px;border:1px dashed var(--border,#cbd5e1);' +
      'border-radius:8px;font-size:14px;min-height:18px;opacity:.9"></div>';
    grp.parentNode.insertBefore(box, grp.nextSibling);
  })();

  /* form reset -> clear dependents */
  var form = elD.closest('form');
  if (form) form.addEventListener('reset', function () { wanted = {}; setTimeout(refillAll, 0); });

  refillAll();
})();
