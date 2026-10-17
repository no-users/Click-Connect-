/**
 * profileTopCollapse.js
 * ------------------------------------------------------------
 * The Profile tab (#content-saved) accumulates several separate
 * widgets above the actual saved-profile list — the "📈 Last 7 Days"
 * usage chart and "Today/This Month" counter (premiumFeatures.js /
 * premiumFeatures2.js), the profile search box (premiumFeatures.js),
 * the "⚙️ Action" tools drawer (profileToolsPanel.js), and the
 * "🖨️ Print Monthly Report" button (premiumFeatures5.js) — each
 * inserted independently by its own file via
 * `contentSaved.insertBefore(el, contentSaved.firstChild)`.
 *
 * This file doesn't touch any of those — it folds whatever ends up
 * there into ONE collapsible section with a single toggle, collapsed
 * by default, so opening the extension shows the saved-profile list
 * first instead of a stack of dashboard widgets.
 *
 * Uses a MutationObserver (rather than a one-time pass) because those
 * other scripts insert their elements at different times, some of
 * them asynchronously (chrome.storage callbacks etc.) — this way
 * whatever shows up, and whenever, gets folded into the same
 * collapsible section automatically without this file needing to
 * know anything about those features individually.
 * ------------------------------------------------------------
 */

(function () {
  const WRAPPER_ID = "saathiTopCollapseWrap";
  const BODY_ID = "saathiTopCollapseBody";
  const TOGGLE_ID = "saathiTopCollapseToggle";
  const STYLE_ID = "saathiTopCollapseStyle";

  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${WRAPPER_ID} { margin-bottom: 12px; }

      #${TOGGLE_ID} {
        position: relative;
        width: 100%; display: flex; align-items: center; gap: 10px;
        font-size: 11.5px; font-weight: 700; padding: 11px 14px;
        border-radius: var(--radius-lg, 14px);
        border: 1.5px solid var(--border-color, #dbe4f0);
        background:
          radial-gradient(120% 160% at 0% 0%, rgba(217,164,78,0.10) 0%, transparent 55%),
          linear-gradient(135deg, var(--card-bg, #fff) 0%, var(--input-bg, #f4f8fd) 100%);
        color: var(--accent-navy, #2f6fb8);
        cursor: pointer; overflow: hidden;
        box-shadow: var(--shadow-card, 0 8px 20px -8px rgba(47,111,184,.18));
        transition: box-shadow .25s var(--ease-out, ease), transform .15s var(--ease-out, ease), border-color .25s ease;
      }
      #${TOGGLE_ID}::before {
        /* soft diagonal sheen sweep on hover -- premium "glass" touch */
        content: ""; position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.55) 40%, transparent 60%);
        transform: translateX(-120%);
        transition: transform .65s var(--ease-out, ease);
      }
      #${TOGGLE_ID}:hover::before { transform: translateX(120%); }
      #${TOGGLE_ID}:hover {
        box-shadow: var(--shadow-lift, 0 14px 30px -10px rgba(47,111,184,.28));
        border-color: var(--accent-gold, #d9a43e);
        transform: translateY(-1px);
      }
      #${TOGGLE_ID}:active { transform: translateY(0) scale(0.985); }

      #${TOGGLE_ID} .saathi-tc-icon {
        font-size: 15px; display: flex; align-items: center; justify-content: center;
        width: 26px; height: 26px; border-radius: 9px; flex-shrink: 0;
        background: var(--accent-navy-gradient, linear-gradient(135deg,#5b9de0,#2f6fb8));
        box-shadow: 0 3px 8px -2px rgba(47,111,184,.45);
        animation: saathiFloat 3.2s ease-in-out infinite;
      }
      #${TOGGLE_ID} .saathi-tc-label { flex: 1; text-align: left; letter-spacing: .1px; }
      #${TOGGLE_ID} .saathi-tc-sub {
        display: block; font-size: 9px; font-weight: 600; color: var(--text-muted, #64748b);
        margin-top: 1px; letter-spacing: .2px;
      }
      #${TOGGLE_ID} .saathi-tc-chevron {
        font-size: 10px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
        border-radius: 50%; background: var(--input-bg, #f4f8fd); color: var(--text-muted, #64748b);
        transition: transform .3s var(--ease-out, ease), background .2s ease, color .2s ease;
      }
      #${TOGGLE_ID}.saathi-tc-open .saathi-tc-chevron {
        transform: rotate(180deg);
        background: var(--accent-gradient, linear-gradient(135deg,#e2b158,#c28d29));
        color: #1c2233;
      }
      #${TOGGLE_ID}.saathi-tc-open { border-color: var(--accent-gold, #d9a43e); }

      #${BODY_ID} {
        overflow: hidden; max-height: 0; opacity: 0;
        transition: max-height .32s var(--ease-out, ease), opacity .22s ease, margin-top .32s var(--ease-out, ease);
        margin-top: 0;
      }
      #${BODY_ID}.saathi-tc-visible { max-height: 900px; opacity: 1; margin-top: 10px; }
      /* Gentle staggered entrance for whatever widgets land inside */
      #${BODY_ID}.saathi-tc-visible > * {
        animation: saathiFadeUp .38s var(--ease-out, ease) backwards;
      }
      #${BODY_ID}.saathi-tc-visible > *:nth-child(1) { animation-delay: .02s; }
      #${BODY_ID}.saathi-tc-visible > *:nth-child(2) { animation-delay: .06s; }
      #${BODY_ID}.saathi-tc-visible > *:nth-child(3) { animation-delay: .10s; }
      #${BODY_ID}.saathi-tc-visible > *:nth-child(4) { animation-delay: .14s; }
      #${BODY_ID}.saathi-tc-visible > *:nth-child(5) { animation-delay: .18s; }
      #${BODY_ID}.saathi-tc-visible > *:nth-child(n+6) { animation-delay: .22s; }
    `;
    document.head.appendChild(style);
  }

  function sweepExisting(contentSaved, wrapper, body, savedList) {
    let node = contentSaved.firstChild;
    while (node && node !== savedList) {
      const next = node.nextSibling;
      if (node !== wrapper) body.appendChild(node);
      node = next;
    }
  }

  function init() {
    const contentSaved = document.getElementById("content-saved");
    const savedList = document.getElementById("savedList");
    if (!contentSaved || !savedList) return;
    if (document.getElementById(WRAPPER_ID)) return; // already set up

    injectStyleOnce();

    const wrapper = document.createElement("div");
    wrapper.id = WRAPPER_ID;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = TOGGLE_ID;
    toggle.innerHTML = `
      <span class="saathi-tc-icon">✨</span>
      <span class="saathi-tc-label">Dashboard aur Tools
        <span class="saathi-tc-sub">Usage, backup &amp; quick actions</span>
      </span>
      <span class="saathi-tc-chevron">▾</span>
    `;

    const body = document.createElement("div");
    body.id = BODY_ID;

    wrapper.appendChild(toggle);
    wrapper.appendChild(body);
    contentSaved.insertBefore(wrapper, savedList);

    toggle.addEventListener("click", () => {
      const opening = !body.classList.contains("saathi-tc-visible");
      body.classList.toggle("saathi-tc-visible", opening);
      toggle.classList.toggle("saathi-tc-open", opening);
    });

    sweepExisting(contentSaved, wrapper, body, savedList);

    // Catch anything the other scripts insert later (async init) —
    // fold it in the moment it lands, regardless of where exactly it
    // was inserted relative to the wrapper.
    const observer = new MutationObserver(() => sweepExisting(contentSaved, wrapper, body, savedList));
    observer.observe(contentSaved, { childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
