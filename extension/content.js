// UWAL content script.
// - Floating Shadow-DOM toolbar
// - Visual element picker with [single] / [all similar] scope
// - DOM generalizer: turns one click into a stable selector matching all
//   structurally similar siblings (e.g. every LinkedIn post, every X tweet)
// - Persistent "page rules" (badge / hide / outline / note) that re-apply
//   on every visit to the same domain via a MutationObserver

;(() => {
  if (window.__uwalInjected) return
  window.__uwalInjected = true

  // ----- Inline SVG icons -----------------------------------------------
  //
  // Lucide-style monoline icons. We keep them as raw strings (rather
  // than a sprite or external asset) because the panel lives inside a
  // closed shadow root injected at runtime — there's no stable CDN
  // path we can rely on, and inlining costs roughly 1 KB total. Each
  // icon uses currentColor so the panel CSS can recolor via a single
  // `color:` rule on the parent button (Style/Enrich = neutral, Smart
  // = slightly darker for the AI accent).
  const ICON_ATTRS =
    'width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
  const ICONS = {
    tag: `<svg ${ICON_ATTRS}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>`,
    eyeOff: `<svg ${ICON_ATTRS}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`,
    square: `<svg ${ICON_ATTRS}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`,
    note: `<svg ${ICON_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`,
    bookmark: `<svg ${ICON_ATTRS}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    languages: `<svg ${ICON_ATTRS}><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`,
    fileText: `<svg ${ICON_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
    filter: `<svg ${ICON_ATTRS}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    sparkles: `<svg ${ICON_ATTRS}><path d="M12 3l1.9 5.6L19 10l-5.1 1.4L12 17l-1.9-5.6L5 10l5.1-1.4z"/><path d="M19 17l.7 2L22 20l-2.3 1L19 23l-.7-2L16 20l2.3-1z"/></svg>`,
    // Two-column comparison glyph — used for the Smart · AI "Compare"
    // action that injects checkboxes onto every match.
    columns: `<svg ${ICON_ATTRS}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
    check: `<svg ${ICON_ATTRS}><polyline points="20 6 9 17 4 12"/></svg>`,
    x: `<svg ${ICON_ATTRS}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    trophy: `<svg ${ICON_ATTRS}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
    // Spellcheck glyph: pencil-style "Aa" with a checkmark — used for
    // the Grammar-Check rule's per-card "Fix grammar" button.
    spellcheck: `<svg ${ICON_ATTRS}><path d="m6 16 6-12 6 12"/><path d="M8 12h8"/><path d="m16 20 2 2 4-4"/></svg>`,
    // Image / camera glyph — used by the Visual Search panel button
    // and the floating "Search by image" button it mounts on the page.
    image: `<svg ${ICON_ATTRS}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
    // Upload tray with arrow — used inside the upload modal's drop
    // zone. Distinct silhouette from the camera icon so the user
    // intuits "drop a file here" rather than "take a photo".
    upload: `<svg ${ICON_ATTRS}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  }

  // ----- Shadow root + UI markup ----------------------------------------

  const host = document.createElement("div")
  host.id = "__uwal-host"
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;"
  const root = host.attachShadow({ mode: "closed" })

  root.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .uwal-overlay {
        position: fixed;
        pointer-events: none;
        /* Bright green so the highlight stays legible on both
           light and dark sites (LinkedIn light, X.com dark, etc.).
           The matching tag below uses the same hue. */
        border: 2px solid #16a34a;
        border-radius: 4px;
        background: rgba(22, 163, 74, 0.10);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
        transition: all 80ms ease-out;
        display: none;
      }
      .uwal-overlay-tag {
        position: absolute;
        top: -22px;
        left: 0;
        background: #16a34a;
        color: #fff;
        font: 500 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
      }
      .uwal-sibling {
        position: fixed;
        pointer-events: none;
        border: 2px dashed #2563eb;
        background: rgba(37, 99, 235, 0.04);
        border-radius: 4px;
      }
      .uwal-pill {
        position: fixed;
        right: 16px;
        bottom: 16px;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: #111;
        color: #fff;
        border-radius: 999px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        cursor: pointer;
        pointer-events: auto;
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        user-select: none;
      }
      .uwal-pill[data-mode="select"] { background: #2563eb; }
      .uwal-pill .dot { width: 6px; height: 6px; border-radius: 999px; background: #fff; }
      /* ── Apple-style horizontal toolbar ──────────────────────────
         Replaces the old vertical sidebar. The panel is a single
         rounded-corner pill anchored to the bottom-center of the
         viewport. Top row holds the selector pill + scope toggle +
         close button. The actions-row below is a flat strip of
         icon+label buttons separated by hairline dividers into Style,
         Enrich, and Smart (AI) groups, with the primary "Save" CTA
         pushed to the far right. Expandable input rows (rank query,
         translate language, decorate prompt) drop down below the
         actions row as full-width strips when their trigger is
         clicked, then collapse back when the user is done. */
      .uwal-panel {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        width: max-content;
        background: #fff;
        color: #1d1d1f;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
        pointer-events: auto;
        font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Roboto, sans-serif;
        display: none;
        overflow: hidden;
      }

      /* Top row: logo + selector pill + scope toggle + close. */
      .uwal-top-row {
        display: flex; align-items: center;
        padding: 10px 16px; gap: 10px;
        border-bottom: 1px solid rgba(0,0,0,0.07);
      }
      .uwal-logo-mark {
        width: 24px; height: 24px;
        background: #1d1d1f; border-radius: 7px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .uwal-logo-mark svg {
        width: 12px; height: 12px;
        stroke: #fff; fill: none;
        stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;
      }
      .uwal-selector-pill {
        flex: 1;
        background: #f0f0f0; border-radius: 7px;
        padding: 5px 10px;
        font: 600 11.5px/1.4 "SF Mono", "Fira Mono", ui-monospace, monospace;
        color: #1d1d1f;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        max-width: 280px;
      }
      .uwal-scope-bar {
        display: flex; background: #f0f0f0; border-radius: 8px;
        padding: 2px; gap: 2px; flex-shrink: 0;
      }
      .uwal-scope-bar button {
        font: 600 11px/1.2 inherit; color: #1d1d1f;
        background: none; border: none;
        padding: 4px 9px; border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .uwal-scope-bar button[data-active="1"] {
        background: #fff; border: 0.5px solid rgba(0,0,0,0.12);
      }
      .uwal-scope-bar button:disabled { opacity: 0.45; cursor: not-allowed; }
      .uwal-x-btn {
        background: none; border: none; cursor: pointer;
        width: 22px; height: 22px; border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
        color: #1d1d1f; font-size: 16px; line-height: 1;
        transition: background 0.12s;
        flex-shrink: 0;
      }
      .uwal-x-btn:hover { background: #f0f0f0; }

      /* Actions row: flat horizontal toolbar. */
      .uwal-actions-row {
        display: flex; align-items: center;
        padding: 8px 12px; gap: 2px;
      }
      .uwal-group-sep {
        width: 1px; height: 20px;
        background: rgba(0,0,0,0.12);
        margin: 0 6px;
        flex-shrink: 0;
      }
      .uwal-spacer { flex: 1; min-width: 8px; }
      /* Each action button: icon + label, hover-tint. Variants are
         applied via data-tone="danger" (red) and data-kind="ai" (blue
         with a small dot). The primary Save button is a dark pill. */
      .uwal-actions-row button.act {
        display: flex; align-items: center; gap: 5px;
        padding: 6px 9px; border-radius: 8px;
        border: none; background: none; cursor: pointer;
        font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif;
        color: #1d1d1f;
        transition: background 0.12s;
        white-space: nowrap; flex-shrink: 0;
      }
      .uwal-actions-row button.act svg {
        width: 13px; height: 13px;
        stroke: #1d1d1f; fill: none;
        stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
        flex-shrink: 0;
      }
      .uwal-actions-row button.act:hover { background: #f0f0f0; }
      .uwal-actions-row button.act[data-tone="danger"] { color: #b91c1c; }
      .uwal-actions-row button.act[data-tone="danger"] svg { stroke: #b91c1c; }
      .uwal-actions-row button.act[data-tone="danger"]:hover { background: #fff0f0; }
      .uwal-actions-row button.act[data-kind="ai"] { color: #0c4a9e; }
      .uwal-actions-row button.act[data-kind="ai"] svg { stroke: #0c4a9e; }
      .uwal-actions-row button.act[data-kind="ai"]:hover { background: #eef4ff; }
      /* The blue dot to the right of every AI label that signals "this
         action calls the gateway". Same visual treatment as the
         reference template's .ai-dot rule. */
      .uwal-actions-row button.act .uwal-ai-dot {
        width: 5px; height: 5px; border-radius: 50%;
        background: #0c4a9e;
        flex-shrink: 0;
      }
      .uwal-actions-row button.act[data-primary="1"] {
        background: #1d1d1f; color: #fff; padding: 6px 14px;
      }
      .uwal-actions-row button.act[data-primary="1"] svg { stroke: #fff; }
      .uwal-actions-row button.act[data-primary="1"]:hover { background: #3a3a3c; }
      .uwal-actions-row button.act:disabled { opacity: 0.45; cursor: not-allowed; }
      .uwal-row { padding: 0 12px 10px; }
      .uwal-row textarea, .uwal-row input[type="text"], .uwal-row select {
        width: 100%; border: 1px solid #e5e5e5; border-radius: 6px;
        padding: 8px 10px; font: 400 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin-top: 6px; color: #111; background: #fff;
        transition: border-color 100ms ease, box-shadow 100ms ease;
      }
      .uwal-row textarea:focus, .uwal-row input[type="text"]:focus, .uwal-row select:focus {
        outline: none; border-color: #111;
        box-shadow: 0 0 0 3px rgba(17, 17, 17, 0.06);
      }
      .uwal-row .hint { font-size: 11px; color: #888; margin-top: 6px; line-height: 1.4; }
      /* Inline action buttons that live at the bottom of an expanded
         row (Cancel + Save / Apply). Styled to match .uwal-actions but
         compact and inline. data-primary="1" is the dark CTA. */
      .uwal-row > div > button {
        appearance: none; border: 1px solid #e5e5e5; background: #fff;
        color: #111; padding: 6px 12px; border-radius: 6px;
        font: 500 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        transition: border-color 100ms ease, background 100ms ease;
      }
      .uwal-row > div > button:hover {
        background: #fafafa; border-color: #d4d4d4;
      }
      .uwal-row > div > button[data-primary="1"] {
        background: #111; color: #fff; border-color: #111;
      }
      .uwal-row > div > button[data-primary="1"]:hover {
        background: #000; border-color: #000;
      }
      /* Sample-prompt chip rail used by the Rank query row to suggest
         starting points. Each chip clones its text into the textarea
         on click — quickest path to "show me what good looks like". */
      .uwal-row .uwal-samples {
        display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;
      }
      .uwal-row .uwal-samples button {
        appearance: none; border: 1px solid #ececec; background: #fafafa;
        color: #555; padding: 3px 8px; border-radius: 999px;
        font: 500 10px/1.3 inherit; cursor: pointer;
      }
      .uwal-row .uwal-samples button:hover {
        background: #fff; color: #111; border-color: #d4d4d4;
      }
      .uwal-label {
        font-size: 11px; font-weight: 600; color: #555;
        text-transform: uppercase; letter-spacing: 0.04em;
        display: inline-flex; align-items: center; gap: 6px;
      }
      /* The character / count badge inside a row label — used to show
         how many items will be ranked, query length, etc. */
      .uwal-label-meta {
        font: 500 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
        color: #999; text-transform: none; letter-spacing: 0;
        background: #f4f4f4; padding: 2px 6px; border-radius: 4px;
      }
      .uwal-chip {
        appearance: none; border: 1px solid #e5e5e5; background: #fff;
        color: #111; padding: 4px 9px; border-radius: 999px;
        font: 500 11px/1.2 inherit; cursor: pointer;
        display: inline-flex; align-items: center; gap: 6px;
      }
      .uwal-chip:hover { background: #f5f5f5; }
      .uwal-chip[data-active="1"] {
        background: #111; color: #fff; border-color: #111;
      }
      .uwal-chip .uwal-chip-count {
        font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
        color: #999;
      }
      .uwal-chip[data-active="1"] .uwal-chip-count { color: #d4d4d4; }
      .uwal-footer {
        padding: 8px 12px; font-size: 11px; color: #888;
        border-top: 1px solid #f0f0f0;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .uwal-toast {
        position: fixed; right: 16px; top: 16px;
        background: #111; color: #fff; padding: 8px 12px;
        border-radius: 6px;
        font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        max-width: 320px; pointer-events: auto;
        opacity: 0; transform: translateY(-6px);
        transition: opacity 120ms ease-out, transform 120ms ease-out;
      }
      .uwal-toast[data-visible="1"] { opacity: 1; transform: translateY(0); }
      .uwal-toast[data-tone="error"] { background: #b91c1c; }
      .uwal-toast[data-tone="success"] { background: #047857; }
    </style>
    <div class="uwal-overlay" id="overlay"><span class="uwal-overlay-tag" id="overlayTag"></span></div>
    <div id="siblings"></div>
    <div class="uwal-pill" id="pill" role="button" aria-label="UWAL">
      <span class="dot"></span>
      <span id="pillLabel">UWAL</span>
    </div>
    <div class="uwal-panel" id="panel" role="dialog" aria-label="UWAL actions"></div>
    <div class="uwal-toast" id="toast" role="status" aria-live="polite"></div>
  `

  document.documentElement.appendChild(host)

  const $ = (id) => root.getElementById(id)
  const overlay = $("overlay")
  const overlayTag = $("overlayTag")
  const siblingsContainer = $("siblings")
  const pill = $("pill")
  const pillLabel = $("pillLabel")
  const panel = $("panel")
  const toastEl = $("toast")

  // ----- Toast helper ----------------------------------------------------

  let toastTimer = null
  function toast(message, tone = "default") {
    toastEl.textContent = message
    toastEl.dataset.tone = tone
    toastEl.dataset.visible = "1"
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastEl.dataset.visible = "0"
    }, 2400)
  }

  // ----- State -----------------------------------------------------------

  /** @type {"idle"|"select"|"selected"} */
  let mode = "idle"
  /** @type {Element|null} */
  let candidate = null
  /** @type {Element|null} */
  let chosen = null
  /** @type {{id: string, title: string|null}|null} */
  let savedObject = null
  /** @type {"single"|"all"} */
  let scope = "single"
  let userPickedScope = false
  /** @type {{selector: string, count: number, elements: Element[]}|null} */
  let pattern = null

  function setMode(next) {
    mode = next
    pill.dataset.mode = next === "select" ? "select" : ""
    pillLabel.textContent = next === "select" ? "Pick an element  ·  Esc to cancel" : "UWAL"
    if (next === "idle") {
      overlay.style.display = "none"
      panel.style.display = "none"
      clearSiblingOverlays()
      candidate = null
      chosen = null
      savedObject = null
      scope = "single"
      userPickedScope = false
      pattern = null
    }
  }

  function showOverlayFor(el) {
    if (!el || !(el instanceof Element)) {
      overlay.style.display = "none"
      return
    }
    const r = el.getBoundingClientRect()
    if (!r || (r.width === 0 && r.height === 0)) {
      overlay.style.display = "none"
      return
    }
    overlay.style.display = "block"
    overlay.style.left = r.left + "px"
    overlay.style.top = r.top + "px"
    overlay.style.width = r.width + "px"
    overlay.style.height = r.height + "px"
    overlayTag.textContent = describe(el) + (pattern && scope === "all" ? `  · ${pattern.count} matches` : "")
  }

  function clearSiblingOverlays() {
    siblingsContainer.innerHTML = ""
  }

  function showSiblingOverlays(elements, primaryEl) {
    clearSiblingOverlays()
    for (const el of elements) {
      if (el === primaryEl) continue
      const r = el.getBoundingClientRect()
      if (!r || r.width * r.height < 100) continue
      const div = document.createElement("div")
      div.className = "uwal-sibling"
      div.style.left = r.left + "px"
      div.style.top = r.top + "px"
      div.style.width = r.width + "px"
      div.style.height = r.height + "px"
      siblingsContainer.appendChild(div)
    }
  }

  function describe(el) {
    let s = el.tagName.toLowerCase()
    if (el.id) s += "#" + el.id
    if (typeof el.className === "string" && el.className.trim()) {
      s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
    }
    return s
  }

  function domPath(el) {
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && parts.length < 6) {
      parts.unshift(describe(node))
      node = node.parentElement
    }
    return parts.join(" > ")
  }

  // ----- DOM generalizer ------------------------------------------------
  //
  // Given a clicked element, find the nearest ancestor whose siblings share
  // the same structural signature, and return a CSS selector matching all of
  // them on the page (e.g. every LinkedIn post, every X tweet, every search
  // result row, every product card).

  function escClass(c) {
    if (window.CSS && CSS.escape) return CSS.escape(c)
    return c.replace(/([^a-zA-Z0-9_-])/g, "\\$1")
  }

  function attrSelector(name, value) {
    const safe = String(value).replace(/"/g, '\\"')
    return `[${name}="${safe}"]`
  }

  function isMeaningfulClass(c) {
    if (!c) return false
    if (c.length < 3) return false
    if (/^(uwal-|js-|is-|has-)/i.test(c)) return false
    if (/^[a-zA-Z]+_[A-Za-z0-9]{4,}$/.test(c)) return true // CSS modules
    // Skip atomic / utility classes (Tailwind/X) like "r-1adg3ll" or "px-4"
    if (/^[a-z]-?[a-z0-9]{0,3}-/.test(c) && c.length < 14) return false
    if (/^r-[a-z0-9]+$/i.test(c)) return false // X uses these
    return true
  }

  function classSignature(el) {
    if (typeof el.className !== "string") return ""
    return el.className
      .trim()
      .split(/\s+/)
      .filter(isMeaningfulClass)
      .sort()
      .join(" ")
  }

  function buildSelectorForCandidate(el) {
    // Prefer stable structural attributes first.
    const stableAttrs = [
      "data-testid",
      "data-test-id",
      "data-test",
      "data-component",
      "data-urn",
      "data-occludable-job-id",
      "data-id",
      "role",
    ]
    for (const a of stableAttrs) {
      const v = el.getAttribute(a)
      if (!v) continue
      // For role we need a stable value, not "presentation".
      if (a === "role" && !["article", "listitem", "feed", "row", "option"].includes(v)) continue
      // Generalize URN-style ids: keep only the key portion.
      const sel = a === "role" ? `${el.tagName.toLowerCase()}[role="${v}"]` : `[${a}]`
      const all = document.querySelectorAll(sel)
      if (all.length >= 2 && all.length <= 500) return { selector: sel, all }
    }

    // Fall back to tag + class signature.
    const sig = classSignature(el)
    if (sig) {
      const classSel = sig.split(" ").map((c) => "." + escClass(c)).join("")
      const sel = el.tagName.toLowerCase() + classSel
      const all = document.querySelectorAll(sel)
      if (all.length >= 2 && all.length <= 500) return { selector: sel, all }
    }

    return null
  }

  // Best-effort cross-page selector for a SINGLE element.
  //
  // `buildSelectorForCandidate` (above) deliberately requires 2+ matches
  // on the current page so we can be confident the selector generalizes
  // to siblings. But on detail pages (e.g. a Medium article, a single
  // GitHub issue) there's only one post in the DOM — so that helper
  // returns null and the user can't save a rule even though the same
  // markup recurs on every other detail page they'll visit. This helper
  // produces the most stable selector it can WITHOUT the 2+ constraint.
  // ──────────────────────────────────────────────────────────────────
  function buildSinglePageSelector(el) {
    if (!el) return null
    // Same priority list as buildSelectorForCandidate but match-count is
    // not enforced — even a single live match is OK because the rule is
    // primarily for OTHER pages.
    const stableAttrs = [
      "data-testid",
      "data-test-id",
      "data-test",
      "data-component",
      "data-urn",
      "data-id",
      "role",
    ]
    let cur = el
    let depth = 0
    while (cur && cur !== document.body && cur.parentElement && depth < 6) {
      for (const a of stableAttrs) {
        const v = cur.getAttribute && cur.getAttribute(a)
        if (!v) continue
        if (a === "role" && !["article", "main", "listitem", "feed", "row", "option"].includes(v)) {
          continue
        }
        const sel =
          a === "role" ? `${cur.tagName.toLowerCase()}[role="${v}"]` : `[${a}]`
        try {
          if (document.querySelector(sel)) return sel
        } catch {
          /* invalid selector, skip */
        }
      }
      // Tag + class signature (filtered to non-volatile classes).
      const sig = classSignature(cur)
      if (sig) {
        const classSel = sig
          .split(" ")
          .map((c) => "." + escClass(c))
          .join("")
        const sel = cur.tagName.toLowerCase() + classSel
        try {
          if (document.querySelector(sel)) return sel
        } catch {
          /* skip */
        }
      }
      cur = cur.parentElement
      depth++
    }
    // Last resort: just the tag name. Rules saved with this selector
    // will be very broad, but the user explicitly asked for it.
    return el.tagName ? el.tagName.toLowerCase() : null
  }

  function generalize(el) {
    let cur = el
    let depth = 0
    while (cur && cur !== document.body && cur.parentElement && depth < 8) {
      const result = buildSelectorForCandidate(cur)
      if (result) {
        return {
          element: cur,
          selector: result.selector,
          count: result.all.length,
          elements: Array.from(result.all),
          source: "local",
        }
      }
      cur = cur.parentElement
      depth++
    }
    return null
  }

  // ----- AI-powered generalize -------------------------------------------
  //
  // Sends a compact fingerprint of the picked element + its ancestor chain
  // and a couple of similar siblings to the backend, which uses Claude to
  // synthesize a robust CSS selector. We then validate that selector
  // actually matches the originally clicked element on the live DOM before
  // accepting it.

  function describeNode(node) {
    if (!node || !node.tagName) return null
    const attrs = {}
    for (const a of node.attributes || []) {
      const n = a.name
      const v = String(a.value || "")
      // Keep stable attributes; skip noisy/inline ones.
      if (
        n === "id" ||
        n === "role" ||
        n === "type" ||
        n === "name" ||
        n.startsWith("aria-") ||
        n.startsWith("data-")
      ) {
        if (v.length < 200) attrs[n] = v
      }
    }
    const classes = node.classList ? Array.from(node.classList) : []
    return {
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      classes: classes.slice(0, 20),
      attrs,
    }
  }

  function fingerprint(el) {
    const ancestors = []
    let cur = el.parentElement
    let depth = 0
    while (cur && cur !== document.body && depth < 6) {
      const d = describeNode(cur)
      if (d) ancestors.push(d)
      cur = cur.parentElement
      depth++
    }

    const siblings = []
    if (el.parentElement) {
      let count = 0
      for (const sib of el.parentElement.children) {
        if (sib === el || !sib.tagName) continue
        if (sib.tagName !== el.tagName) continue
        const d = describeNode(sib)
        if (!d) continue
        const text = (sib.innerText || sib.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 120)
        siblings.push({ ...d, text_sample: text })
        if (++count >= 2) break
      }
    }

    const elDesc = describeNode(el) || {}
    const text = (el.innerText || el.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 200)
    const outer = (el.outerHTML || "").slice(0, 1800)

    return {
      url: location.href,
      domain: location.hostname,
      element: { ...elDesc, text_sample: text, outer_html: outer },
      ancestors,
      siblings,
    }
  }

  let aiToken = 0

  async function aiGeneralize(el, localPattern) {
    const myToken = ++aiToken
    const fp = fingerprint(el)
    fp.heuristic_selector = localPattern?.selector || null
    fp.heuristic_match_count = localPattern?.count || null

    let res
    try {
      res = await sendMessage({ type: "generalize", payload: fp })
    } catch {
      return null
    }
    // Bail if the user has clicked another element while we waited.
    if (myToken !== aiToken) return null
    if (!res?.ok || !res.data?.selector) return null

    const data = res.data
    let matches
    try {
      matches = document.querySelectorAll(data.selector)
    } catch {
      return null
    }
    if (!matches.length || matches.length > 1500) return null

    // The selector must include (or contain) the originally clicked element.
    let element = null
    for (const m of matches) {
      if (m === el || m.contains(el)) {
        element = m
        break
      }
    }
    if (!element) return null

    return {
      element,
      selector: data.selector,
      count: matches.length,
      elements: Array.from(matches),
      kind: data.kind || (matches.length >= 2 ? "pattern" : "single"),
      confidence: data.confidence ?? null,
      rationale: data.rationale || "",
      identifier_strategy: data.identifier_strategy || "",
      source: data.ai === false ? "heuristic" : "ai",
    }
  }

  // ----- Smart selection -------------------------------------------------

  function isOurNode(node) {
    return node === host || (node && node.getRootNode && node.getRootNode() === root)
  }

  function pickFromPoint(x, y) {
    const prev = host.style.pointerEvents
    host.style.pointerEvents = "none"
    const el = document.elementFromPoint(x, y)
    host.style.pointerEvents = prev
    if (!el || isOurNode(el)) return null
    return el
  }

  function expandSelection() {
    const target = chosen ?? candidate
    if (target?.parentElement && target.parentElement !== document.documentElement) {
      const next = target.parentElement
      if (chosen) {
        chosen = next
        recomputePattern()
      } else {
        candidate = next
      }
      showOverlayFor(next)
      if (chosen && scope === "all" && pattern) showSiblingOverlays(pattern.elements, chosen)
    }
  }

  function contractSelection() {
    const target = chosen ?? candidate
    if (!target) return
    const child = Array.from(target.children).find((c) => {
      const r = c.getBoundingClientRect()
      return r.width * r.height > 600
    })
    if (child) {
      if (chosen) {
        chosen = child
        recomputePattern()
      } else candidate = child
      showOverlayFor(child)
      if (chosen && scope === "all" && pattern) showSiblingOverlays(pattern.elements, chosen)
    }
  }

  function recomputePattern() {
    pattern = chosen ? generalize(chosen) : null
    if (!pattern && scope === "all") {
      scope = "single"
      clearSiblingOverlays()
    }
    if (mode === "selected") renderActionPanel()
  }

  function onMouseMove(e) {
    if (mode !== "select") return
    const el = pickFromPoint(e.clientX, e.clientY)
    if (!el) return
    candidate = el
    showOverlayFor(el)
  }

  async function onClick(e) {
    if (mode !== "select") return
    if (isOurNode(e.target)) return
    const el = pickFromPoint(e.clientX, e.clientY)
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    chosen = el
    pattern = generalize(el)
    // Default to "all similar" when we have a meaningful pattern of >= 3.
    scope = pattern && pattern.count >= 3 ? "all" : "single"
    showOverlayFor(scope === "all" && pattern ? pattern.element : chosen)
    if (scope === "all" && pattern) showSiblingOverlays(pattern.elements, pattern.element)
    setMode("selected")
    renderActionPanel()

    // Upgrade to the AI-derived selector. Only replace local result if the
    // AI selector still includes the user's clicked element.
    const aiResult = await aiGeneralize(el, pattern)
    if (!aiResult) return
    if (chosen !== el || mode !== "selected") return
    pattern = aiResult
    if (aiResult.count >= 3 && scope === "single" && !userPickedScope) {
      scope = "all"
    }
    const subject = scope === "all" ? aiResult.element : el
    showOverlayFor(subject)
    if (scope === "all") showSiblingOverlays(aiResult.elements, aiResult.element)
    else clearSiblingOverlays()
    renderActionPanel()
  }

  function onKeyDown(e) {
    if (mode === "idle") return
    if (e.key === "Escape") {
      e.preventDefault()
      setMode("idle")
      return
    }
    if (mode === "select" || mode === "selected") {
      if (e.key === "]" || e.key === "ArrowUp") {
        e.preventDefault()
        expandSelection()
      } else if (e.key === "[" || e.key === "ArrowDown") {
        e.preventDefault()
        contractSelection()
      }
    }
  }

  // ----- Object extraction (DOM -> Object) ------------------------------
  //
  // captureHtml() takes a live element and returns a self-contained HTML
  // string that visually approximates the original element. Strategy:
  //
  //   1. Deep-clone the element.
  //   2. Walk both source + clone trees in lock-step and inline a curated
  //      set of computed CSS properties as inline `style` attributes on the
  //      clone, so the markup renders identically without external CSS.
  //   3. Absolutize all `href`, `src`, and `srcset` URLs against the page
  //      origin so links/images keep working in the saved view.
  //   4. Strip <script>, <style>, <link rel=stylesheet>, and on* event
  //      handlers from the clone so it can be safely rendered in a
  //      sandboxed iframe.
  //   5. Cap the output size; if it exceeds the budget, return null so the
  //      backend stores text-only.

  // Two tiers of style properties. We try the rich set first; if the
  // resulting markup blows the size budget we retry with the essentials only.
  const STYLE_PROPS_RICH = [
    "display","visibility","opacity","position","top","right","bottom","left","z-index",
    "box-sizing","width","min-width","max-width","height","min-height","max-height",
    "margin-top","margin-right","margin-bottom","margin-left",
    "padding-top","padding-right","padding-bottom","padding-left",
    "border-top","border-right","border-bottom","border-left",
    "border-radius","border-color","border-style","border-width",
    "background-color","background-image","background-size",
    "background-position","background-repeat",
    "color","font-family","font-size","font-weight","font-style",
    "line-height","letter-spacing","text-align","text-decoration","text-transform",
    "white-space","word-break","overflow-wrap",
    "flex-direction","flex-wrap","flex-grow","flex-shrink","flex-basis",
    "justify-content","align-items","align-content","align-self","gap","row-gap","column-gap",
    "grid-template-columns","grid-template-rows","grid-column","grid-row",
    "list-style-type",
    "overflow-x","overflow-y",
    "object-fit","object-position","aspect-ratio",
    "box-shadow","filter","transform",
    "vertical-align",
  ]

  const STYLE_PROPS_LITE = [
    "display","position","width","height","color","background-color",
    "font-family","font-size","font-weight","line-height","text-align",
    "padding-top","padding-right","padding-bottom","padding-left",
    "margin-top","margin-right","margin-bottom","margin-left",
    "border-radius","border-color","border-style","border-width",
    "flex-direction","gap","justify-content","align-items",
    "object-fit","aspect-ratio","box-shadow","overflow",
  ]

  // Per-property no-op detection. We *deliberately* keep most "default"
  // looking values because once the captured element is detached from its
  // original DOM context, those defaults stop being defaults: a child of
  // a flex parent becomes a child of <body> in the iframe, and values like
  // `display: block`, `text-decoration: none`, `white-space: nowrap`,
  // `align-items: stretch`, `line-height: normal` etc. are needed to keep
  // the rendering identical. We only drop values that genuinely produce no
  // visible output for that specific property.
  function shouldSkip(prop, val) {
    if (!val) return true
    const v = val.trim()
    if (!v) return true
    if (prop === "transform" && v === "none") return true
    if (prop === "filter" && v === "none") return true
    if (prop === "backdrop-filter" && v === "none") return true
    if (prop === "box-shadow" && v === "none") return true
    if (prop === "background-image" && v === "none") return true
    if (prop === "background-color" && (v === "rgba(0, 0, 0, 0)" || v === "transparent")) return true
    if (
      (prop === "border-top" || prop === "border-right" || prop === "border-bottom" || prop === "border-left") &&
      /^0px /.test(v)
    ) {
      return true
    }
    if (prop === "border-width" && (v === "0px" || v === "0px 0px 0px 0px")) return true
    if (
      (prop === "margin-top" ||
        prop === "margin-right" ||
        prop === "margin-bottom" ||
        prop === "margin-left" ||
        prop === "padding-top" ||
        prop === "padding-right" ||
        prop === "padding-bottom" ||
        prop === "padding-left") &&
      v === "0px"
    ) {
      return true
    }
    return false
  }

  const STRIP_TAGS = new Set(["SCRIPT","STYLE","LINK","META","NOSCRIPT","IFRAME","OBJECT","EMBED","CANVAS","VIDEO","AUDIO"])

  function inlineStyleForWithProps(srcEl, props, pseudo) {
    const cs = window.getComputedStyle(srcEl, pseudo || null)
    let out = ""
    for (const p of props) {
      const v = cs.getPropertyValue(p)
      if (shouldSkip(p, v)) continue
      out += `${p}:${v};`
    }
    return out
  }

  // Read a pseudo-element's `content` value and turn it into the literal
  // string that should appear in the synthesized <span>. Returns null when
  // the pseudo-element has no rendered content (which is the common case).
  function pseudoContent(srcEl, which) {
    const cs = window.getComputedStyle(srcEl, which)
    const content = cs.getPropertyValue("content")
    if (!content || content === "none" || content === "normal" || content === "''" || content === '""') {
      return null
    }
    // Computed `content` values are quoted strings, optionally followed by
    // counters / attr() references. Try to extract the leading quoted text
    // — that's enough for the dot/separator/badge case we care about.
    const m = content.match(/^"((?:[^"\\]|\\.)*)"|^'((?:[^'\\]|\\.)*)'/)
    if (m) {
      const raw = m[1] ?? m[2] ?? ""
      // Unescape \xx escape sequences (font-icon code points etc).
      return raw.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    }
    if (content.startsWith("url(")) return null // image content — leave it
    return null
  }

  function absolutize(value, base) {
    try {
      return new URL(value, base).href
    } catch {
      return value
    }
  }

  function rewriteSrcset(value, base) {
    return value
      .split(",")
      .map((part) => {
        const trimmed = part.trim()
        const m = trimmed.match(/^(\S+)(\s+.+)?$/)
        if (!m) return trimmed
        return absolutize(m[1], base) + (m[2] || "")
      })
      .join(", ")
  }

  // Snapshot is rendered inside a sandboxed iframe on the dashboard, so we
  // store up to ~1.5 MB of HTML per object. Most posts come in well under
  // that. If the rich attempt overshoots we retry with a smaller property
  // set; if even that overshoots we return null and let the dashboard show
  // the fallback text view.
  const HTML_BUDGET = 1_500_000

  function captureHtml(el) {
    if (!el || !el.cloneNode) {
      console.log("[v0] captureHtml: bad input", el)
      return null
    }

    // First pass: rich style set.
    let result = captureWithProps(el, STYLE_PROPS_RICH)
    if (result && result.length <= HTML_BUDGET) {
      console.log("[v0] captureHtml: rich pass", result.length, "bytes")
      return result
    }
    console.log(
      "[v0] captureHtml: rich pass too large (" + (result?.length || 0) + " bytes), retrying lite",
    )

    // Second pass: trim to essentials.
    result = captureWithProps(el, STYLE_PROPS_LITE)
    if (result && result.length <= HTML_BUDGET) {
      console.log("[v0] captureHtml: lite pass", result.length, "bytes")
      return result
    }
    console.log("[v0] captureHtml: still too large after lite pass, giving up")
    return null
  }

  function captureWithProps(el, props) {
    let clone
    try {
      clone = el.cloneNode(true)
    } catch (e) {
      console.log("[v0] captureHtml: cloneNode failed", e)
      return null
    }
    if (!clone) return null

    const baseHref = location.href

    // Strip dangerous / heavy tags from the clone first so we don't waste
    // time inlining styles on things we'll throw away.
    const drop = []
    const all = clone.querySelectorAll("*")
    for (const node of all) {
      if (STRIP_TAGS.has(node.tagName)) {
        drop.push(node)
        continue
      }
      for (const a of Array.from(node.attributes || [])) {
        if (a.name.startsWith("on")) node.removeAttribute(a.name)
        if (a.name === "srcdoc") node.removeAttribute(a.name)
      }
    }
    for (const n of drop) n.remove()
    if (STRIP_TAGS.has(clone.tagName)) return null

    // Walk source + clone elements in tandem and inline computed styles.
    const srcAll = [el, ...el.querySelectorAll("*")].filter((n) => !STRIP_TAGS.has(n.tagName))
    const dstAll = [clone, ...clone.querySelectorAll("*")]

    const len = Math.min(srcAll.length, dstAll.length)
    for (let i = 0; i < len; i++) {
      inlineNode(srcAll[i], dstAll[i], props, baseHref, i === 0 ? el : null)
    }

    const html = clone.outerHTML || ""
    return html || null
  }

  function inlineNode(src, dst, props, baseHref, rootEl) {
    if (!src || !dst || src.nodeType !== 1 || dst.nodeType !== 1) return
    try {
      let inline = inlineStyleForWithProps(src, props)

      // Lock the captured root to its rendered width so that — once detached
      // from its parent's flex/grid context — it preserves the same column
      // width it had on the original page. Without this, LinkedIn / X posts
      // collapse to content width or stretch to the iframe full width and
      // the inner layout reflows badly.
      if (rootEl) {
        try {
          const rect = rootEl.getBoundingClientRect()
          const w = Math.round(rect.width)
          if (w > 0) {
            inline += `width:${w}px;max-width:${w}px;min-width:${w}px;box-sizing:border-box;`
          }
        } catch {
          /* detached */
        }
      }

      if (inline) dst.setAttribute("style", inline)

      // Capture ::before / ::after pseudo-elements that have a rendered
      // `content` string. These are commonly used for separator dots, badge
      // icons and decorative glyphs that would otherwise disappear from the
      // saved snapshot.
      injectPseudo(src, dst, props, "::before", true)
      injectPseudo(src, dst, props, "::after", false)
    } catch {
      /* cross-origin / detached node */
    }

    if (dst.hasAttribute("href")) {
      dst.setAttribute("href", absolutize(dst.getAttribute("href"), baseHref))
    }
    if (dst.hasAttribute("src")) {
      dst.setAttribute("src", absolutize(dst.getAttribute("src"), baseHref))
    }
    if (dst.hasAttribute("srcset")) {
      dst.setAttribute("srcset", rewriteSrcset(dst.getAttribute("srcset"), baseHref))
    }
    if (dst.tagName === "A" && dst.hasAttribute("href")) {
      dst.setAttribute("target", "_blank")
      dst.setAttribute("rel", "noopener noreferrer")
    }
  }

  function injectPseudo(src, dst, props, which, prepend) {
    const text = pseudoContent(src, which)
    if (text === null) return
    const span = dst.ownerDocument.createElement("span")
    span.setAttribute("data-uwal-pseudo", which.replace(/:/g, ""))
    span.textContent = text
    try {
      const inline = inlineStyleForWithProps(src, props, which)
      if (inline) span.setAttribute("style", inline)
    } catch {
      /* ignore */
    }
    if (prepend) dst.insertBefore(span, dst.firstChild)
    else dst.appendChild(span)
  }

  // ----- Structured media extraction ------------------------------------
  //
  // Walks the captured element and pulls out everything we want to render
  // separately on the dashboard: links, images, videos, headings, hashtags,
  // mentions, author/timestamp guesses, and the plain-text body. Stored as
  // a single `media` jsonb on the saved object.

  // ── Site adapters ─────────────────────────────────────────────────────
  //
  // Each adapter inspects the matched element and returns a partial
  // media-2 object. We pick the right adapter by hostname; the generic
  // adapter runs as a fallback / merger so we never lose the broad
  // coverage we had with media-1. Each adapter is a pure function and
  // can be hot-swapped without touching the rest of the extractor.
  //
  // Adapters return null for fields they can't determine; the merger
  // then fills those holes from the generic adapter. This is what makes
  // the system extensible: adding e.g. an Instagram adapter is just
  // adding one entry to MEDIA_ADAPTERS and writing a few selectors.

  /** Find the first descendant matching any of the selectors, in order. */
  function firstMatch(root, selectors) {
    for (const sel of selectors) {
      try {
        const found = root.querySelector(sel)
        if (found) return found
      } catch {
        /* invalid selector — skip */
      }
    }
    return null
  }

  /** Pull the first parseable integer (incl. K/M/B suffix) from a string. */
  function parseCount(s) {
    if (!s) return null
    const m = String(s).match(/([\d.,]+)\s*([KMB])?/i)
    if (!m) return null
    const n = Number(m[1].replace(/,/g, ""))
    if (!Number.isFinite(n)) return null
    const mult = m[2] ? { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()] : 1
    return Math.round(n * mult)
  }

  /** Resolve the best image URL from an <img> element (handles lazy attrs). */
  function imgSrc(img, baseHref) {
    if (!img) return null
    const raw =
      img.currentSrc ||
      img.src ||
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src") ||
      ""
    return raw ? absolutize(raw, baseHref) : null
  }

  /** Generic extractor — runs on every save and supplies sensible
   *  defaults for fields the site-specific adapter didn't fill in. */
  function genericAdapter(el, baseHref) {
    // Author + avatar via meta hints common to blogs, Mediums, Substack…
    const authorTextEl = firstMatch(el, [
      "[rel=author]",
      "[itemprop=author]",
      "[class*='author' i]",
      "[class*='byline' i]",
      "a[href*='/in/']",
      "a[href*='/@']",
    ])
    const avatarEl = firstMatch(el, [
      "img[alt*='avatar' i]",
      "img[class*='avatar' i]",
      "img[class*='profile' i]",
      "[class*='avatar' i] img",
      "[class*='profile-pic' i] img",
    ])
    const profileLinkEl = firstMatch(el, [
      "a[href*='/in/']",
      "a[href*='/@']",
      "a[rel=author]",
    ])
    const author = authorTextEl
      ? {
          name: (authorTextEl.innerText || authorTextEl.textContent || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 160) || null,
          handle: null,
          avatar: imgSrc(avatarEl, baseHref),
          profileUrl: profileLinkEl
            ? absolutize(profileLinkEl.getAttribute("href") || "", baseHref)
            : null,
          verified: false,
        }
      : null

    const timeEl = firstMatch(el, ["time", "[datetime]"])
    const timestamp = timeEl
      ? timeEl.getAttribute("datetime") ||
        (timeEl.innerText || timeEl.textContent || "").trim().slice(0, 60)
      : null

    return { kind: null, author, timestamp, engagement: null, comments: [] }
  }

  /** LinkedIn feed posts. Selectors are tested against the public feed
   *  layout; LinkedIn changes class names but data attributes are
   *  reasonably stable. */
  function linkedinAdapter(el, baseHref) {
    const nameEl = firstMatch(el, [
      ".update-components-actor__name",
      "[data-test-id*='actor-name']",
      ".feed-shared-actor__name",
    ])
    const handleEl = firstMatch(el, [
      ".update-components-actor__description",
      ".feed-shared-actor__description",
    ])
    const avatarEl = firstMatch(el, [
      ".update-components-actor__avatar img",
      ".feed-shared-actor__avatar img",
      "img.presence-entity__image",
    ])
    const profileEl = firstMatch(el, [
      "a.update-components-actor__meta-link",
      "a.feed-shared-actor__container-link",
      "a[href*='/in/']",
    ])
    const author = nameEl
      ? {
          name: (nameEl.innerText || nameEl.textContent || "").trim().slice(0, 160),
          handle: handleEl
            ? (handleEl.innerText || handleEl.textContent || "").trim().slice(0, 160)
            : null,
          avatar: imgSrc(avatarEl, baseHref),
          profileUrl: profileEl
            ? absolutize(profileEl.getAttribute("href") || "", baseHref)
            : null,
          verified: false,
        }
      : null

    // LinkedIn shows "X reactions", "Y comments", "Z reposts" near the
    // bottom. We grab numbers from any node that looks like a counter.
    const txt = (el.innerText || "").replace(/\s+/g, " ")
    const reactM = txt.match(/([\d.,KMB]+)\s+(?:reactions?|likes?)/i)
    const commM = txt.match(/([\d.,KMB]+)\s+comments?/i)
    const repostM = txt.match(/([\d.,KMB]+)\s+reposts?/i)
    const engagement = reactM || commM || repostM
      ? {
          likes: reactM ? parseCount(reactM[1]) : null,
          comments: commM ? parseCount(commM[1]) : null,
          shares: repostM ? parseCount(repostM[1]) : null,
          views: null,
          reposts: null,
        }
      : null

    return { kind: "post", author, timestamp: null, engagement, comments: [] }
  }

  /** X / Twitter posts. Uses data-testid which is more stable than
   *  Twitter's churning class names. */
  function twitterAdapter(el, baseHref) {
    const nameEl = firstMatch(el, ["[data-testid='User-Name'] span"])
    const handleEl = firstMatch(el, ["[data-testid='User-Name'] a[href^='/']"])
    const avatarEl = firstMatch(el, [
      "[data-testid='Tweet-User-Avatar'] img",
      "img[src*='profile_images']",
    ])
    const verifiedEl = firstMatch(el, ["[data-testid='icon-verified']"])
    const profileEl = firstMatch(el, ["a[role=link][href^='/']"])
    const author = nameEl
      ? {
          name: (nameEl.innerText || nameEl.textContent || "").trim().slice(0, 160),
          handle: handleEl
            ? (handleEl.innerText || handleEl.textContent || "").trim().slice(0, 80)
            : null,
          avatar: imgSrc(avatarEl, baseHref),
          profileUrl: profileEl
            ? absolutize(profileEl.getAttribute("href") || "", baseHref)
            : null,
          verified: !!verifiedEl,
        }
      : null

    // X uses aria-label="N replies" / "N reposts" / "N likes" / "N views".
    function ariaCount(testid) {
      const node = el.querySelector(`[data-testid='${testid}']`)
      if (!node) return null
      const label =
        node.getAttribute("aria-label") || node.querySelector("[aria-label]")?.getAttribute("aria-label") || ""
      return parseCount(label)
    }
    const engagement = {
      comments: ariaCount("reply"),
      reposts: ariaCount("retweet"),
      likes: ariaCount("like"),
      views: null,
      shares: null,
    }
    const hasEngagement = Object.values(engagement).some((v) => typeof v === "number")
    return {
      kind: "post",
      author,
      timestamp: null,
      engagement: hasEngagement ? engagement : null,
      comments: [],
    }
  }

  /** Reddit posts. Comments are particularly valuable here so we try
   *  to capture the top few replies as a structured list. */
  function redditAdapter(el, baseHref) {
    const nameEl = firstMatch(el, ["a[href^='/user/']", "[slot='authorName']"])
    const profileEl = nameEl && nameEl.tagName === "A" ? nameEl : firstMatch(el, ["a[href^='/user/']"])
    const author = nameEl
      ? {
          name: (nameEl.innerText || nameEl.textContent || "").trim().slice(0, 160),
          handle: null,
          avatar: null,
          profileUrl: profileEl
            ? absolutize(profileEl.getAttribute("href") || "", baseHref)
            : null,
          verified: false,
        }
      : null

    const upvotesEl = firstMatch(el, ["[data-test-id='post-content'] [id^='vote-arrows']", "[slot='vote-arrows']"])
    const commentsBtnEl = firstMatch(el, ["a[data-click-id='comments']", "a[href*='/comments/']"])
    const upvotes = upvotesEl ? parseCount(upvotesEl.textContent || "") : null
    const comments = commentsBtnEl ? parseCount(commentsBtnEl.textContent || "") : null
    const engagement = upvotes != null || comments != null
      ? { likes: upvotes, comments, shares: null, reposts: null, views: null }
      : null

    // Top-level replies (best effort — Reddit lazy-loads many).
    const commentEls = el.querySelectorAll("shreddit-comment, .Comment, [data-test-id='comment']")
    const topComments = []
    commentEls.forEach((c, i) => {
      if (i >= 6) return
      const ca = c.querySelector("a[href^='/user/']")
      const cb = c.querySelector(".RichTextJSON-root, [slot='comment']")
      const tx = (cb || c).innerText || (cb || c).textContent || ""
      topComments.push({
        author: ca ? (ca.innerText || ca.textContent || "").trim().slice(0, 80) : null,
        body: tx.trim().replace(/\s+/g, " ").slice(0, 400),
        timestamp: null,
        likes: null,
      })
    })

    return { kind: "post", author, timestamp: null, engagement, comments: topComments }
  }

  /** Instagram posts. Class names are unreliable so we lean on
   *  semantic attributes only. */
  function instagramAdapter(el, baseHref) {
    const profileEl = firstMatch(el, ["header a[href^='/']"])
    const nameEl = firstMatch(el, ["header a[href^='/'] span", "header span[dir='auto']"])
    const avatarEl = firstMatch(el, ["header img"])
    const author = nameEl
      ? {
          name: (nameEl.innerText || nameEl.textContent || "").trim().slice(0, 160),
          handle: null,
          avatar: imgSrc(avatarEl, baseHref),
          profileUrl: profileEl
            ? absolutize(profileEl.getAttribute("href") || "", baseHref)
            : null,
          verified: false,
        }
      : null
    const txt = (el.innerText || "").replace(/\s+/g, " ")
    const likesM = txt.match(/([\d,]+)\s+likes?/i)
    const engagement = likesM
      ? { likes: parseCount(likesM[1]), comments: null, shares: null, reposts: null, views: null }
      : null
    return { kind: "post", author, timestamp: null, engagement, comments: [] }
  }

  /** Map of hostname-suffix → adapter. Order doesn't matter (we pick
   *  the first match by `endsWith`). The generic adapter ALWAYS runs
   *  and its fields are merged in for any keys the site adapter
   *  returned `null` for. */
  const MEDIA_ADAPTERS = [
    { match: ["linkedin.com"], fn: linkedinAdapter },
    { match: ["twitter.com", "x.com"], fn: twitterAdapter },
    { match: ["reddit.com"], fn: redditAdapter },
    { match: ["instagram.com"], fn: instagramAdapter },
  ]

  /** Merge two partial media records, preferring `primary` and
   *  filling holes from `fallback`. Used to combine site-specific
   *  output with the generic baseline. */
  function mergeMedia(primary, fallback) {
    const out = {}
    const keys = new Set([...Object.keys(primary || {}), ...Object.keys(fallback || {})])
    for (const k of keys) {
      const p = primary?.[k]
      const f = fallback?.[k]
      if (p == null || (Array.isArray(p) && p.length === 0)) {
        out[k] = f ?? null
      } else if (typeof p === "object" && !Array.isArray(p) && f && typeof f === "object" && !Array.isArray(f)) {
        // Deep merge for nested objects (e.g. `author`).
        out[k] = mergeMedia(p, f)
      } else {
        out[k] = p
      }
    }
    return out
  }

  function pickAdapter(hostname) {
    for (const a of MEDIA_ADAPTERS) {
      if (a.match.some((m) => hostname === m || hostname.endsWith("." + m))) return a.fn
    }
    return null
  }

  // ── extractMedia (media-2 schema) ──────────────────────────────────────
  //
  // Returns a richer payload than media-1 so the dashboard can render
  // a faithful, interactive reproduction of the saved post:
  //   - `kind`     post/article/product/profile/comment/video/generic
  //   - `author`   { name, handle, avatar, profileUrl, verified }
  //   - `engagement` { likes, comments, shares, reposts, views }
  //   - `comments` [{ author, body, timestamp, likes }]
  // While preserving every field from media-1 (text, headings, links,
  // images, videos, embeds, hashtags, mentions, author-string,
  // timestamp) for backward compatibility — older renderers keep
  // working even before the dashboard is updated to read media-2.

  function extractMedia(el) {
    const baseHref = location.href

    // ── Pass 1: raw resources (unchanged from media-1). ───────────────
    const links = []
    el.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || ""
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) return
      const url = absolutize(href, baseHref)
      const text = (a.innerText || a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200)
      links.push({ url, text })
    })

    const images = []
    el.querySelectorAll("img").forEach((img) => {
      const src = imgSrc(img, baseHref)
      if (!src) return
      images.push({
        url: src,
        alt: (img.alt || "").slice(0, 300),
        width: img.naturalWidth || null,
        height: img.naturalHeight || null,
      })
    })

    const videos = []
    el.querySelectorAll("video").forEach((v) => {
      const src =
        v.currentSrc ||
        v.getAttribute("src") ||
        v.querySelector("source[src]")?.getAttribute("src") ||
        ""
      videos.push({
        url: src ? absolutize(src, baseHref) : null,
        poster: v.getAttribute("poster") ? absolutize(v.getAttribute("poster"), baseHref) : null,
      })
    })

    const embeds = []
    el.querySelectorAll("iframe[src]").forEach((f) => {
      const src = f.getAttribute("src") || ""
      if (!src) return
      embeds.push({
        url: absolutize(src, baseHref),
        title: f.getAttribute("title") || null,
      })
    })

    const headings = []
    el.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
      const t = (h.innerText || h.textContent || "").trim()
      if (t) headings.push({ level: Number(h.tagName[1]) || 3, text: t.slice(0, 300) })
    })

    const text = (el.innerText || el.textContent || "").trim()
    const hashtags = Array.from(
      new Set(Array.from(text.matchAll(/(?:^|\s)#([\p{L}0-9_]{2,40})/gu)).map((m) => m[1])),
    )
    const mentions = Array.from(
      new Set(Array.from(text.matchAll(/(?:^|\s)@([\p{L}0-9_]{2,40})/gu)).map((m) => m[1])),
    )

    // ── Pass 2: structured fields via adapters. ───────────────────────
    const hostname = location.hostname
    const siteFn = pickAdapter(hostname)
    const generic = genericAdapter(el, baseHref)
    const site = siteFn ? siteFn(el, baseHref) : null
    const merged = site ? mergeMedia(site, generic) : generic

    // ── Pass 3: kind classification. ──────────────────────────────────
    // We start with whatever the adapter said, then refine using cheap
    // structural signals. This stays fast (no AI) while being good
    // enough to distinguish the common cases — products vs posts vs
    // articles. Falls back to "generic" when nothing is decisive.
    let kind = merged.kind
    if (!kind) {
      const hasPrice = /(?:US?\$|£|€|EUR|USD)\s?\d/i.test(text)
      const hasArticleTag = !!el.closest("article")
      const wordCount = text.split(/\s+/).length
      if (hasPrice && images.length > 0) kind = "product"
      else if (videos.length > 0 && wordCount < 80) kind = "video"
      else if (merged.author && wordCount < 800) kind = "post"
      else if (hasArticleTag || wordCount > 200) kind = "article"
      else kind = "generic"
    }

    // ── Backwards-compat: media-1 author was a single string. We
    // continue exposing it so older code paths keep working. ──────────
    const authorString = merged.author?.name || null

    return {
      __schema: "media-2",
      kind,
      // media-1 fields (unchanged shape).
      text: text.slice(0, 8000),
      headings: headings.slice(0, 12),
      links: links.slice(0, 64),
      images: images.slice(0, 32),
      videos: videos.slice(0, 8),
      embeds: embeds.slice(0, 8),
      hashtags: hashtags.slice(0, 32),
      mentions: mentions.slice(0, 32),
      author: authorString,
      timestamp: merged.timestamp,
      // media-2 additions.
      authorProfile: merged.author || null,
      engagement: merged.engagement || null,
      comments: (merged.comments || []).slice(0, 12),
      site: hostname,
    }
  }

  // ----- Screenshot capture ---------------------------------------------
  //
  // Strategy:
  //   1. Hide UWAL UI (Shadow-DOM host + any in-page decorations).
  //   2. Snapshot the current scroll position so we can restore it.
  //   3. Read the element's full size in document coordinates.
  //   4. Loop: scroll the element so the next un-captured slice is at the
  //      top of the viewport, ask the background worker to call
  //      chrome.tabs.captureVisibleTab(), decode the PNG, draw the
  //      cropped slice onto an output canvas.
  //   5. Restore scroll + UWAL UI.
  //   6. Return the stitched canvas as a data URL.

  async function captureElementScreenshot(el) {
    const hidden = []
    function hide(node) {
      if (!node) return
      hidden.push([node, node.style.visibility, node.style.opacity])
      node.style.visibility = "hidden"
    }
    hide(host)
    el.querySelectorAll("[data-uwal-decoration]").forEach(hide)

    const restore = () => {
      for (const [n, vis, op] of hidden) {
        n.style.visibility = vis || ""
        if (op !== undefined) n.style.opacity = op || ""
      }
    }

    const originalScroll = { x: window.scrollX, y: window.scrollY }

    try {
      // captureVisibleTab returns the screenshot at the device's actual DPR,
      // so source-coordinate math always uses `rawDpr`. We then draw into
      // an output canvas at a capped DPR so a 3×/4× retina display doesn't
      // produce a 5MB JPEG that overflows the Next.js body-size limit.
      const rawDpr = window.devicePixelRatio || 1
      const outDpr = Math.min(rawDpr, 2)
      const vh = window.innerHeight
      const initialRect = el.getBoundingClientRect()
      const elTop = window.scrollY + initialRect.top
      const elWidth = Math.max(1, initialRect.width)
      const elHeight = Math.max(1, initialRect.height)

      const canvas = document.createElement("canvas")
      canvas.width = Math.round(elWidth * outDpr)
      canvas.height = Math.round(elHeight * outDpr)
      const ctx = canvas.getContext("2d")

      // Cap at 6 slices so we don't blow through chrome.tabs.captureVisibleTab
      // rate limits (~2/sec). Each slice ≈ viewport height.
      const MAX_SLICES = 6
      let drawn = 0
      for (let i = 0; i < MAX_SLICES && drawn < elHeight; i++) {
        window.scrollTo({ left: 0, top: elTop + drawn, behavior: "instant" })
        // Two rAFs + a small timeout lets sticky headers settle and the
        // captureVisibleTab quota refill.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        await new Promise((r) => setTimeout(r, i === 0 ? 80 : 220))

        const rect = el.getBoundingClientRect()
        const sliceCss = Math.min(elHeight - drawn, vh - Math.max(0, rect.top))
        if (sliceCss <= 0) break

        const res = await sendMessage({ type: "screenshot:capture-tab" })
        if (!res?.ok || !res.dataUrl) {
          throw new Error(res?.error || "captureVisibleTab failed")
        }

        const img = await new Promise((resolve, reject) => {
          const im = new Image()
          im.onload = () => resolve(im)
          im.onerror = reject
          im.src = res.dataUrl
        })

        // Source rect in the captured PNG (raw DPR space).
        const sx = Math.max(0, Math.round(rect.left * rawDpr))
        const sy = Math.max(0, Math.round(rect.top * rawDpr))
        const sw = Math.round(elWidth * rawDpr)
        const sh = Math.round(sliceCss * rawDpr)
        // Destination rect in the output canvas (capped DPR space).
        const dx = 0
        const dy = Math.round(drawn * outDpr)
        const dw = Math.round(elWidth * outDpr)
        const dh = Math.round(sliceCss * outDpr)
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)

        drawn += sliceCss
      }

      // JPEG at 0.92 keeps a 1200×1600 capture under ~600KB and uploads
      // quickly. We use PNG only when the capture is small enough that
      // quality dominates filesize.
      const fmt = canvas.width * canvas.height < 300_000 ? "image/png" : "image/jpeg"
      return canvas.toDataURL(fmt, 0.92)
    } finally {
      window.scrollTo({ left: originalScroll.x, top: originalScroll.y, behavior: "instant" })
      restore()
    }
  }

  // Enrich a payload from buildObject() with media + screenshot, then
  // save it. Used by every "Save" entry point so the dashboard always has
  // the same artifacts to render. Failures are surfaced to the user via a
  // toast — silent skips were hiding real bugs (private/public store
  // mismatch, oversize uploads, etc).
  async function enrichAndSave(payload, target) {
    payload.media = extractMedia(target)
    try {
      const dataUrl = await captureElementScreenshot(target)
      const upload = await sendMessage({ type: "screenshot:upload", dataUrl })
      if (upload?.ok && upload.data?.pathname) {
        payload.screenshot_url = upload.data.pathname
      } else {
        const reason = upload?.error || upload?.data?.error || "unknown reason"
        console.log("[v0] screenshot upload failed:", reason)
        toast(`Screenshot skipped: ${String(reason).slice(0, 120)}`, "error")
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.log("[v0] screenshot capture failed:", msg)
      toast(`Screenshot capture failed: ${msg.slice(0, 120)}`, "error")
    }
    return await sendMessage({ type: "save", payload })
  }

  function buildObject(el, opts = {}) {
    const text = (el.innerText || el.textContent || "").trim().slice(0, 8000)
    const attrs = {}

    for (const a of el.attributes || []) {
      if (a.name.startsWith("data-") && a.value && a.value.length < 200) {
        attrs[a.name.slice(5)] = a.value
      }
    }

    const priceMatch = text.match(/(?:US?\$|£|€|EUR|USD)\s?([0-9][0-9,]*(?:\.[0-9]{2})?)/i)
    if (priceMatch) attrs.price = priceMatch[0]
    const ratingMatch = text.match(/\b([0-5](?:\.[0-9])?)\s*(?:\/\s*5|stars?|out of 5)\b/i)
    if (ratingMatch) attrs.rating = ratingMatch[1]

    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content")
    const titleEl = el.querySelector("h1, h2, h3, [role=heading]")
    const title = (titleEl && titleEl.textContent?.trim()) || ogTitle || document.title

    let html = null
    try {
      html = captureHtml(el)
    } catch {
      html = null
    }

    return {
      url: location.href,
      title: (title || "").slice(0, 500),
      text,
      html,
      attributes: attrs,
      dom_path: domPath(el),
      tags: [],
      selector: opts.selector || null,
      selector_kind: opts.kind || "single",
      pattern_count: opts.count ?? null,
    }
  }

  // ----- Action panel ---------------------------------------------------

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
  }

  function renderActionPanel() {
    if (!chosen) return
    const subject = scope === "all" && pattern ? pattern.element : chosen
    const preview = (subject.innerText || "").trim().replace(/\s+/g, " ").slice(0, 140)
    const canAll = !!pattern
    panel.innerHTML = `
      <!-- ── Top row ────────────────────────────────────────────────
           Logo mark + selector pill (one-line preview of the chosen
           CSS path) + scope toggle (This / All N) + close. -->
      <div class="uwal-top-row">
        <div class="uwal-logo-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="#fff" stroke="none"/></svg>
        </div>
        <div class="uwal-selector-pill" title="${escapeHtml(describe(subject))}">${escapeHtml(describe(subject))}</div>
        <div class="uwal-scope-bar" role="tablist" aria-label="Scope">
          <button id="scopeOne" data-active="${scope === "single" ? 1 : 0}">This</button>
          <button id="scopeAll" data-active="${scope === "all" ? 1 : 0}" ${canAll ? "" : "disabled"}>
            All${canAll ? ` (${pattern.count})` : ""}
          </button>
        </div>
        <button class="uwal-x-btn" id="closeBtn" aria-label="Close">×</button>
      </div>

      <!-- ── Actions row ─────────────────────────────────────────────
           Flat horizontal toolbar. Three groups separated by hairline
           dividers, then a flexible spacer, then the primary Save CTA
           pinned to the right edge.

           Group 1 · Style — pure visual decorations applied locally.
           Group 2 · Enrich — per-match interactive enhancements.
           Group 3 · Smart (AI) — embedding-driven passes; each button
           shows a small blue dot to signal it calls the gateway. -->
      <div class="uwal-actions-row" id="decorateSection">
        <button class="act" id="badgeBtn">${ICONS.tag}<span>Badge</span></button>
        <button class="act" id="hideBtn" data-tone="danger">${ICONS.eyeOff}<span>Hide</span></button>
        <button class="act" id="outlineBtn">${ICONS.square}<span>Outline</span></button>
        <button class="act" id="noteBtn">${ICONS.note}<span>Note</span></button>

        <div class="uwal-group-sep"></div>

        <button class="act" id="translateBtn">${ICONS.languages}<span>Translate</span></button>
        <button class="act" id="summarizeDecorBtn">${ICONS.fileText}<span>Summarize</span></button>
        <button class="act" id="grammarBtn">${ICONS.spellcheck}<span>Grammar</span></button>
        <button class="act" id="saveDecorBtn">${ICONS.bookmark}<span>Save btn</span></button>

        <div class="uwal-group-sep"></div>

        <button class="act" id="filterBtn" data-kind="ai">${ICONS.filter}<span>Filter</span><div class="uwal-ai-dot"></div></button>
        <button class="act" id="rankBtn" data-kind="ai">${ICONS.sparkles}<span>Rank</span><div class="uwal-ai-dot"></div></button>
        <button class="act" id="compareBtn" data-kind="ai">${ICONS.columns}<span>Compare</span><div class="uwal-ai-dot"></div></button>
        <button class="act" id="visualSearchBtn" data-kind="ai">${ICONS.image}<span>Visual</span><div class="uwal-ai-dot"></div></button>

        <div class="uwal-spacer"></div>

        <!-- Save object: primary CTA pinned to far-right of the bar.
             Reuses the same id as before so the existing click handler
             keeps working. Label flips to "Save pattern" in all-scope. -->
        <button class="act" id="saveBtn" data-primary="1">${ICONS.bookmark}<span>Save ${scope === "all" ? "pattern" : "object"}</span></button>
      </div>

        <!-- (rank UI removed — see ensureRankSearchBar; the rank rule
             now mounts a live search bar at the top of the page rather
             than a one-shot textarea inside this panel.) -->

        <div class="uwal-row" id="translateRow" style="display:none; margin-top: 8px;">
          <span class="uwal-label">Translate to</span>
          <select id="translateLang">
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Italian">Italian</option>
            <option value="Portuguese">Portuguese</option>
            <option value="Dutch">Dutch</option>
            <option value="Polish">Polish</option>
            <option value="Russian">Russian</option>
            <option value="Turkish">Turkish</option>
            <option value="Arabic">Arabic</option>
            <option value="Hebrew">Hebrew</option>
            <option value="Hindi">Hindi</option>
            <option value="Bengali">Bengali</option>
            <option value="Urdu">Urdu</option>
            <option value="Persian">Persian</option>
            <option value="Chinese (Simplified)">Chinese (Simplified)</option>
            <option value="Chinese (Traditional)">Chinese (Traditional)</option>
            <option value="Japanese">Japanese</option>
            <option value="Korean">Korean</option>
            <option value="Vietnamese">Vietnamese</option>
            <option value="Thai">Thai</option>
            <option value="Indonesian">Indonesian</option>
            <option value="English">English</option>
          </select>
          <div class="hint">Adds a "Translate" button to every match. Click it on the page to translate that post.</div>
          <div style="display:flex; gap:6px; margin-top:6px;">
            <button id="translateSave" data-primary="1">Save rule</button>
            <button id="translateCancel">Cancel</button>
          </div>
        </div>
      </div>
      <div class="uwal-row" id="decorateRow" style="display:none">
        <span class="uwal-label" id="decorateLabel">Label</span>
        <input id="decorateInput" type="text" placeholder="Label" />
        <div class="hint" id="decorateHint">This rule will be saved and re-applied on every visit to ${escapeHtml(location.hostname)}.</div>
        <div style="display:flex; gap:6px; margin-top:6px;">
          <button id="decorateSave" data-primary="1">Save rule</button>
          <button id="decorateCancel">Cancel</button>
        </div>
      </div>
      <div class="uwal-footer" id="status">
        ${
          canAll
            ? `${pattern.source === "ai" ? "AI selector" : pattern.source === "heuristic" ? "Heuristic" : "Local selector"}${pattern.identifier_strategy ? ` · ${escapeHtml(pattern.identifier_strategy)}` : ""}: <code style="color:#999">${escapeHtml(pattern.selector).slice(0, 80)}</code>`
            : "Press [ / ] to expand · Esc to cancel"
        }
      </div>
    `

    panel.style.display = "block"
    panel.querySelector("#closeBtn").addEventListener("click", () => setMode("idle"))

    panel.querySelector("#scopeOne").addEventListener("click", () => switchScope("single"))
    panel.querySelector("#scopeAll").addEventListener("click", () => switchScope("all"))

    const status = panel.querySelector("#status")

    panel.querySelector("#saveBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget
      const target = scope === "all" && pattern ? pattern.element : chosen
      const opts = scope === "all" && pattern
        ? { selector: pattern.selector, kind: "pattern", count: pattern.count }
        : { kind: "single" }
      const payload = buildObject(target, opts)
      btn.disabled = true
      btn.textContent = "Capturing..."
      const res = await enrichAndSave(payload, target)
      btn.disabled = false
      if (!res.ok) {
        toast(res.error || "Save failed", "error")
        btn.textContent = scope === "all" ? "Save pattern" : "Save object"
        return
      }
      const o = res.data.object
      savedObject = { id: o.id, title: o.title }
      btn.textContent = "Saved ✓"
      status.textContent = scope === "all" ? `Saved pattern matching ${pattern.count} elements` : `Saved as ${o.id}`
      toast("Saved to workspace", "success")
    })

    // Decoration buttons. Available in BOTH scopes: "all similar"
    // saves a pattern selector covering every sibling on this page, while
    // "just this" derives a cross-page selector from the single element
    // (so picking one Medium article applies the rule to every Medium
    // article page you visit afterward).
    panel.querySelector("#badgeBtn").addEventListener("click", () => openDecorate("badge"))
    panel.querySelector("#hideBtn").addEventListener("click", () => saveRule("hide", {}))
    panel.querySelector("#outlineBtn").addEventListener("click", () => saveRule("outline", { color: "#2563eb" }))
    panel.querySelector("#noteBtn").addEventListener("click", () => openDecorate("note"))
    panel.querySelector("#saveDecorBtn").addEventListener("click", () =>
      saveRule("save_button", { label: "Save" }),
    )
    panel.querySelector("#summarizeDecorBtn").addEventListener("click", () =>
      saveRule("summarize", { label: "Summarize" }),
    )
    panel.querySelector("#translateBtn").addEventListener("click", () => {
      const row = panel.querySelector("#translateRow")
      row.style.display = row.style.display === "none" ? "block" : "none"
    })
    panel.querySelector("#translateCancel").addEventListener("click", () => {
      panel.querySelector("#translateRow").style.display = "none"
    })
    panel.querySelector("#translateSave").addEventListener("click", () => {
      const language = panel.querySelector("#translateLang").value
      panel.querySelector("#translateRow").style.display = "none"
      saveRule("translate", { language })
    })

    // -------- Filter (dynamic semantic category bar) ------------------
    //
    // One-click action — matches the rest of the panel (Hide / Outline
    // / Save button / Translate). Saving the rule mounts a top
    // category bar on the page, which handles ALL per-category UX
    // (chip selection, hiding non-matches, reordering matches to top,
    // etc). The previous "Categorize → preview chips → Save" 3-step
    // flow was confusing — users routinely cancelled or never saw the
    // hidden Save button, so no rule was ever persisted.
    panel.querySelector("#filterBtn").addEventListener("click", () => {
      if (scope !== "all" || !pattern || !pattern.elements || pattern.elements.length === 0) {
        toast("Switch to All similar first", "error")
        return
      }
      saveRule("filter", { category: null })
    })

    // ── Rank: query-driven embedding-based ranking ───────────────────
    // Behaves like Translate: clicking the toolbar button toggles an
    // inline row where the user types their query, then "Save rule"
    // persists a kind=\"rank\" rule and immediately applies it (siblings
    // get reordered by cosine similarity to the query).
    // Rank: now a one-click action.
    //
    // Old flow was: click Rank → reveal a textarea → type a query →
    // click Apply → save rule with that fixed query.
    // New flow is a live semantic-search experience instead: click
    // Rank → immediately save the rule with an empty query → the
    // rule's apply step mounts a fixed search bar at the top of the
    // page (see `ensureRankSearchBar`). Typing into that bar updates
    // the in-memory query and re-runs `applyRankRule` with debounce,
    // so siblings reorder by similarity as the user types.
    //
    // The rule's `config.query` stays empty on disk: this is a "search
    // bar lives on this page" rule, not a "saved query" rule. Reload
    // → bar still mounts (rule is persisted) but starts empty (query
    // state is local). That matches a Spotlight / Cmd-K UX where the
    // search affordance is sticky but each session is fresh.
    panel.querySelector("#rankBtn").addEventListener("click", () => {
      if (scope !== "all" || !pattern || !pattern.elements || pattern.elements.length === 0) {
        toast("Switch to All similar first", "error")
        return
      }
      saveRule("rank", { query: "" })
      setMode("idle")
    })

    // ── Compare: select-then-compare flow ─────────────────────────────
    // One-click — saving the rule injects a checkbox onto every match
    // and mounts a docked selection bar. The user picks 2-8 cards and
    // clicks the bar's "Compare" button, which sends the picks to
    // /api/v1/compare-text and renders the result table in a modal.
    // No inline row needed because there's no parameter to capture
    // up front: the goal of the comparison emerges from the selection.
    panel.querySelector("#compareBtn").addEventListener("click", () => {
      if (scope !== "all" || !pattern || !pattern.elements || pattern.elements.length === 0) {
        toast("Switch to All similar first", "error")
        return
      }
      saveRule("compare", { context: "" })
    })

    // ── Grammar check: per-card "Fix grammar" button ─────────────────
    // One-click. Saving the rule injects a small button onto every
    // match. Clicking the on-page button sends the card's text
    // fragments to /api/v1/grammar-check (gpt-4o-mini, minimum edits)
    // and writes the corrections back into the original text nodes.
    // A second click on the same button toggles back to the original.
    // No parameter row because there's nothing to configure up front.
    panel.querySelector("#grammarBtn").addEventListener("click", () => {
      saveRule("grammar_check", {})
    })

    // ── Visual search: image → search-bar query ────────────────────��─
    // Page-level rule. Saving it mounts a floating "Search by image"
    // button anywhere on the page. Clicking that button opens an
    // upload modal; the chosen image is sent to a vision-language
    // model which returns a SHORT search query (a few words). The
    // query is then typed into the host page's existing search bar
    // and Enter is dispatched — so the user gets native search
    // results for whatever the image depicts. Works regardless of
    // selection scope: there is no "All similar" requirement because
    // the rule doesn't operate on the matched cards at all, it just
    // needs to be enabled on this page.
    panel.querySelector("#visualSearchBtn").addEventListener("click", () => {
      saveRule("visual_search", {})
    })

    panel.querySelector("#decorateCancel").addEventListener("click", () => {
      panel.querySelector("#decorateRow").style.display = "none"
    })
    panel.querySelector("#decorateSave").addEventListener("click", () => {
      const kind = panel.querySelector("#decorateRow").dataset.kind
      const value = panel.querySelector("#decorateInput").value.trim()
      if (!value) return
      panel.querySelector("#decorateRow").style.display = "none"
      saveRule(kind, kind === "badge" ? { label: value } : { text: value })
    })

  }

  function openDecorate(kind) {
    const row = panel.querySelector("#decorateRow")
    const label = panel.querySelector("#decorateLabel")
    const input = panel.querySelector("#decorateInput")
    label.textContent = kind === "badge" ? "Badge label" : "Note text"
    input.placeholder = kind === "badge" ? "e.g. Sponsored" : "e.g. Already read"
    input.value = ""
    row.dataset.kind = kind
    row.style.display = "block"
    setTimeout(() => input.focus(), 0)
  }

  async function saveRule(kind, config) {
    // Resolve a selector. Two paths:
    //  1) "All similar" scope OR pattern was auto-detected → use the
    //     pattern selector (matches every sibling on this page).
    //  2) "Just this" scope on a detail-style page where only one
     //    instance exists → derive a best-effort cross-page selector
    //     from the single picked element. This is the case the user
    //     hit on Medium: one article on screen, but the same markup
    //     recurs on every other article page.
    let selector = null
    let count = 0
    if (scope === "all" && pattern) {
      selector = pattern.selector
      count = pattern.count
    } else if (chosen) {
      selector = buildSinglePageSelector(chosen)
      count = selector ? 1 : 0
    }
    if (!selector) return toast("Couldn't derive a selector for this element", "error")

    const ping = await sendMessage({ type: "ping" })
    if (!ping?.configured) return toast("Open extension options to set API URL + token.", "error")
    const labelHint = (config && (config.label || config.instruction)) || kind
    const rule = {
      domain: location.hostname,
      selector,
      kind,
      config,
      name: String(labelHint).slice(0, 80),
    }
    const res = await sendMessage({ type: "rule:create", rule })
    if (!res.ok) return toast(res.error || "Save failed", "error")
    activeRules.push(res.data.rule)
    applyRule(res.data.rule)
    toast(
      scope === "all"
        ? `Rule applied to ${count} elements`
        : `Rule saved — will apply to similar elements on other pages too`,
      "success",
    )
  }

  function switchScope(next) {
    if (next === "all" && !pattern) return
    scope = next
    userPickedScope = true
    if (next === "all" && pattern) {
      showOverlayFor(pattern.element)
      showSiblingOverlays(pattern.elements, pattern.element)
    } else {
      clearSiblingOverlays()
      showOverlayFor(chosen)
    }
    renderActionPanel()
  }

  // ----- Page rules: persistent decorations ----------------------------

  /** @type {Array<{id: string, selector: string, kind: string, config: any, enabled: boolean}>} */
  let activeRules = []

  function applyRule(rule) {
    if (!rule.enabled && rule.enabled !== undefined) return
    let matches
    try {
      matches = document.querySelectorAll(rule.selector)
    } catch {
      return
    }
    if (rule.kind === "filter") {
      // Batched embedding-based filter: gather all matches, send their
      // text to /api/v1/categorize in a single request, hide the ones
      // whose top category != the saved one. Per-text results are
      // cached in sessionStorage so MutationObserver re-applies don't
      // re-call the API as the user scrolls.
      applyFilterRule(rule, Array.from(matches))
      return
    }
    if (rule.kind === "rank") {
      // Embedding-based ranking: send the user's saved query plus the
      // text of every match to /api/v1/rank, then reorder DOM siblings
      // by cosine similarity (best first) and overlay a small score
      // chip on each card.
      applyRankRule(rule, Array.from(matches))
      return
    }
    if (rule.kind === "visual_search") {
      // Per-input decoration: for each matched element, resolve the
      // underlying <input>/<textarea> and mount a camera button glued
      // to its right edge. Click → upload modal → fill THIS input with
      // a model-extracted query and submit. See applyVisualSearchRule
      // for the full breakdown.
      applyVisualSearchRule(rule, Array.from(matches))
      return
    }
    matches.forEach((el) => decorate(el, rule))
  }

  // ---------------------------------------------------------------------
  // Persistent filter ruling (kind: "filter")
  //
  // When the user saves a filter rule we don't pin the page to a single
  // category any more. Instead we mount a sticky category bar at the top
  // of the page (in its own Shadow DOM so site CSS can't break it),
  // populate it with chips for every category the matched elements fall
  // into, and let the user toggle the active filter on the page itself.
  //
  // Categorizations are cached in localStorage so refreshes are instant
  // for posts we've already seen — and new posts that load in via
  // infinite scroll are categorized in the background and dropped into
  // the right bucket without the user doing anything.
  // ---------------------------------------------------------------------

  // Cache version. Bump this when the seed prompt list in lib/ai/categories.ts
  // changes meaningfully, so old classifications don't outvote the new ones.
  const FILTER_CACHE_VERSION = "v2"
  const FILTER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
  const FILTER_CACHE_MAX_ENTRIES = 600

  function filterCacheKey(ruleId) {
    return `uwal:filter:${FILTER_CACHE_VERSION}:${ruleId}`
  }
  function loadFilterCache(ruleId) {
    try {
      const raw = localStorage.getItem(filterCacheKey(ruleId))
      if (!raw) return new Map()
      const obj = JSON.parse(raw)
      const now = Date.now()
      const map = new Map()
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === "object" && typeof v.ts === "number" && now - v.ts < FILTER_CACHE_TTL_MS) {
          map.set(k, { value: v.value, ts: v.ts })
        }
      }
      return map
    } catch {
      return new Map()
    }
  }
  function saveFilterCache(ruleId, cache) {
    try {
      // Trim oldest entries first if we're over the cap so the JSON
      // payload stays well under typical 5–10MB quotas.
      const entries = Array.from(cache.entries()).sort((a, b) => b[1].ts - a[1].ts)
      const trimmed = entries.slice(0, FILTER_CACHE_MAX_ENTRIES)
      const obj = {}
      for (const [k, v] of trimmed) obj[k] = v
      localStorage.setItem(filterCacheKey(ruleId), JSON.stringify(obj))
    } catch {
      /* quota — drop the cache, next page will rebuild it */
    }
  }
  // Tiny DJB2 hash so identical text fragments share a cache slot
  // regardless of which DOM node they live in.
  function fragHash(s) {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return (h >>> 0).toString(36)
  }

  // Sentinel stored when categorization returned `null` (empty post,
  // unrecognized topic, etc). Stored explicitly so we don't keep retrying
  // the same uncategorizable text on every refresh.
  const FILTER_NONE = "__none__"

  // Per-element data-attribute name that records the assigned category.
  // We use the same key for all rules (only one filter bar is sensible
  // at once) — this means rules with overlapping selectors share the
  // classification, which is what users expect.
  const CAT_ATTR = "uwalCat"

  // Module-level state for the on-page bar. There's exactly one bar per
  // page even if multiple filter rules are active.
  const filterBar = {
    host: null, // <div> appended to <html>
    shadow: null, // its ShadowRoot
    chipsEl: null,
    rules: new Map(), // ruleId -> { selector }
    counts: new Map(), // categoryName -> live count of currently-matched elements
    active: null, // string | null — currently active category filter
    inflight: new Map(), // ruleId -> Promise so concurrent ticks don't double-fetch
    // Status drives the empty-state message. Without this we couldn't
    // distinguish "still working" (Categorizing…) from "done, nothing to
    // show" (No categories detected) — which was the Nike bug: results
    // came back but every item resolved to FILTER_NONE and the bar
    // sat on "Categorizing…" forever.
    status: "idle", // "idle" | "deriving" | "categorizing" | "ready" | "empty" | "error"
    statusMessage: "",
    onRetry: null, // optional callback exposed by the bar's "Retry" button
  }

  // Per-page derived-categories cache. Keyed by host + selector so two
  // different rules on the same site share the LLM-derived buckets.
  const DERIVED_CACHE_KEY = "uwal:derived-cats:v1"
  const DERIVED_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

  function derivedCacheRead(host, selector) {
    try {
      const raw = localStorage.getItem(DERIVED_CACHE_KEY)
      if (!raw) return null
      const obj = JSON.parse(raw)
      const key = `${host}::${selector}`
      const entry = obj?.[key]
      if (!entry || typeof entry.ts !== "number") return null
      if (Date.now() - entry.ts > DERIVED_CACHE_TTL_MS) return null
      if (!Array.isArray(entry.categories)) return null
      return entry.categories
    } catch {
      return null
    }
  }
  function derivedCacheWrite(host, selector, categories) {
    try {
      const raw = localStorage.getItem(DERIVED_CACHE_KEY)
      const obj = raw ? JSON.parse(raw) : {}
      obj[`${host}::${selector}`] = { categories, ts: Date.now() }
      // Cap to ~30 distinct (host, selector) pairs so the storage doesn't
      // grow unbounded across sites.
      const entries = Object.entries(obj).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0))
      const trimmed = Object.fromEntries(entries.slice(0, 30))
      localStorage.setItem(DERIVED_CACHE_KEY, JSON.stringify(trimmed))
    } catch {
      /* quota — ignore */
    }
  }

  function ensureFilterBar() {
    if (filterBar.host && document.documentElement.contains(filterBar.host)) return
    const host = document.createElement("div")
    host.id = "uwal-filter-bar-host"
    // `all: initial` neutralises any inherited site CSS; the shadow root
    // then provides our own scoped styles.
    host.style.cssText =
      "all: initial; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;"
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: #fff;
          padding: 8px 14px;
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 4px 12px rgba(0,0,0,0.18);
          max-width: 100%;
        }
        .label {
          font: 600 11px/1 -apple-system, BlinkMacSystemFont, sans-serif;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: rgba(255,255,255,0.55);
          padding-right: 4px;
        }
        .chips { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; flex: 1; }
        .chip {
          appearance: none;
          background: rgba(255,255,255,0.06);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.12);
          padding: 5px 11px;
          border-radius: 999px;
          font: 500 12px/1.2 inherit;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: background 80ms ease, border-color 80ms ease;
        }
        .chip:hover { background: rgba(255,255,255,0.12); }
        .chip[data-active="1"] {
          background: #16a34a;
          border-color: #16a34a;
          color: #fff;
        }
        .count {
          font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
          color: rgba(255,255,255,0.55);
          min-width: 1ch;
        }
        .chip[data-active="1"] .count { color: rgba(255,255,255,0.9); }
        .empty {
          font: 500 12px/1.2 inherit;
          color: rgba(255,255,255,0.55);
          font-style: italic;
        }
        .close {
          appearance: none; background: transparent; border: 0;
          color: rgba(255,255,255,0.6); cursor: pointer;
          font-size: 18px; line-height: 1; padding: 4px 6px;
          border-radius: 6px;
        }
        .close:hover { background: rgba(255,255,255,0.08); color: #fff; }
      </style>
      <div class="bar" role="toolbar" aria-label="UWAL category filter">
        <span class="label">Categories</span>
        <div class="chips" id="chips"></div>
        <button class="close" id="close" aria-label="Hide filter bar" title="Hide filter bar">×</button>
      </div>
    `
    document.documentElement.appendChild(host)
    filterBar.host = host
    filterBar.shadow = shadow
    filterBar.chipsEl = shadow.getElementById("chips")
    shadow.getElementById("close").addEventListener("click", () => {
      // Hide-only, doesn't delete the rule. User can disable the rule
      // from the dashboard if they want it gone permanently.
      host.style.display = "none"
      // Clear any active filter so nothing stays hidden.
      if (filterBar.active) {
        filterBar.active = null
        applyFilterVisibility()
      }
    })
  }

  function recomputeFilterCounts() {
    // Re-tally counts directly from the live DOM. Doing it on every
    // render means infinite-scroll loads, post deletions, etc. always
    // produce a correct chip count.
    const counts = new Map()
    for (const [, data] of filterBar.rules) {
      let nodes
      try {
        nodes = document.querySelectorAll(data.selector)
      } catch {
        continue
      }
      nodes.forEach((el) => {
        const cat = el.dataset[CAT_ATTR]
        if (!cat || cat === FILTER_NONE) return
        counts.set(cat, (counts.get(cat) || 0) + 1)
      })
    }
    filterBar.counts = counts
  }

  function renderFilterBar() {
    if (!filterBar.shadow) return
    recomputeFilterCounts()
    const chipsEl = filterBar.chipsEl
    chipsEl.innerHTML = ""

    const total = Array.from(filterBar.counts.values()).reduce((a, b) => a + b, 0)

    // No chips yet — show whichever placeholder matches our current
    // status. The previous implementation hard-coded "Categorizing…",
    // which left the bar stuck even after categorization completed
    // with zero confident matches.
    if (total === 0) {
      const msg = document.createElement("span")
      msg.className = "empty"
      let label = "Categorizing…"
      switch (filterBar.status) {
        case "deriving":
          label = "Detecting categories…"
          break
        case "categorizing":
          label = "Categorizing items…"
          break
        case "empty":
          label = filterBar.statusMessage || "No categories detected for this page"
          break
        case "error":
          label = filterBar.statusMessage || "Categorization failed"
          break
        case "ready":
          label = "No items matched any category"
          break
      }
      msg.textContent = label
      chipsEl.appendChild(msg)

      // Offer a Retry button on terminal failure states so users aren't
      // stranded — clicking it re-runs the rule from scratch (clears
      // the cache for this rule and re-applies).
      if (
        (filterBar.status === "error" || filterBar.status === "empty") &&
        typeof filterBar.onRetry === "function"
      ) {
        const retry = document.createElement("button")
        retry.type = "button"
        retry.className = "chip"
        retry.textContent = "Retry"
        retry.addEventListener("click", () => filterBar.onRetry?.())
        chipsEl.appendChild(retry)
      }
      return
    }

    // "All" chip ��� clears the active filter.
    const allChip = document.createElement("button")
    allChip.type = "button"
    allChip.className = "chip"
    if (!filterBar.active) allChip.dataset.active = "1"
    allChip.innerHTML = `All <span class="count"></span>`
    allChip.querySelector(".count").textContent = String(total)
    allChip.addEventListener("click", () => {
      if (filterBar.active === null) return
      filterBar.active = null
      applyFilterVisibility()
      renderFilterBar()
    })
    chipsEl.appendChild(allChip)

    const entries = Array.from(filterBar.counts.entries()).sort((a, b) => b[1] - a[1])
    for (const [name, count] of entries) {
      const chip = document.createElement("button")
      chip.type = "button"
      chip.className = "chip"
      if (filterBar.active === name) chip.dataset.active = "1"
      chip.innerHTML = `<span class="name"></span><span class="count"></span>`
      chip.querySelector(".name").textContent = name
      chip.querySelector(".count").textContent = String(count)
      chip.addEventListener("click", () => {
        // Defensive: if the live count for this category drops to zero
        // between render and click (e.g. the user just deleted a post),
        // refuse to filter rather than showing a blank page.
        recomputeFilterCounts()
        const live = filterBar.counts.get(name) || 0
        if (live === 0) {
          toast(`No posts match "${name}" right now`, "default")
          renderFilterBar()
          return
        }
        const willActivate = filterBar.active !== name
        filterBar.active = willActivate ? name : null
        applyFilterVisibility()
        renderFilterBar()
        // Only auto-scroll when *activating* a category. Toggling off
        // shouldn't yank the user away from where they were reading.
        if (willActivate) scrollToFirstFilteredMatch()
      })
      chipsEl.appendChild(chip)
    }
  }

  // Restore each matched element to its original DOM position by
  // moving it back before the comment-anchor we placed when it was
  // first reordered. We walk every node every time (rather than only
  // re-ordered ones) because the live DOM is the source of truth — a
  // stale list of "previously moved" refs would diverge after infinite
  // scroll evictions.
  function restoreFilterOrder(nodes) {
    for (const el of nodes) {
      const anchor = el._uwalAnchor
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(el, anchor)
        anchor.remove()
      }
      el._uwalAnchor = null
    }
  }

  // Move every matched element to the top of its parent, preserving
  // their relative document order. We group by parent so feeds with
  // multiple containers (e.g. pinned posts + main feed) don't get
  // accidentally merged. A Comment node anchor is left at the original
  // position so we can put the element back when the filter clears.
  function reorderMatchesToTop(matches) {
    const byParent = new Map()
    for (const el of matches) {
      const parent = el.parentElement
      if (!parent) continue
      if (!byParent.has(parent)) byParent.set(parent, [])
      byParent.get(parent).push(el)
    }
    for (const [parent, els] of byParent) {
      // Stable sort by document position so visible order matches the
      // chronology the user is used to seeing.
      els.sort((a, b) => {
        const cmp = a.compareDocumentPosition(b)
        if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) return -1
        if (cmp & Node.DOCUMENT_POSITION_PRECEDING) return 1
        return 0
      })
      // Place anchors *before* moving any element so insertions after
      // this point don't mess up sibling indices.
      for (const el of els) {
        const anchor = document.createComment("uwal-filter-anchor")
        el.parentNode.insertBefore(anchor, el)
        el._uwalAnchor = anchor
      }
      // Single fragment insert so the parent only re-flows once.
      const frag = document.createDocumentFragment()
      for (const el of els) frag.appendChild(el)
      parent.insertBefore(frag, parent.firstChild)
      // Give matched posts a top scroll-margin so the fixed filter bar
      // never obscures them when the user uses anchor scrolling.
      for (const el of els) el.style.scrollMarginTop = "64px"
    }
  }

  function applyFilterVisibility() {
    // For every rule, walk the live DOM. Two phases:
    //  1) Restore every match to its original position (clean slate).
    //  2) If a category is active, hide non-matches AND re-insert the
    //     matches at the top of their parent so the user actually
    //     SEES the filtered content without scrolling past collapsed
    //     `display: none` siblings that may still occupy layout (e.g.
    //     virtualized lists with placeholder heights).
    const active = filterBar.active
    for (const [ruleId, data] of filterBar.rules) {
      const flagKey = `uwalFiltered${ruleId.replace(/[^a-zA-Z0-9]/g, "")}`
      let nodes
      try {
        nodes = Array.from(document.querySelectorAll(data.selector))
      } catch {
        continue
      }

      // Phase 1: reset DOM positions before recomputing visibility.
      // Doing this every tick guarantees idempotence — the same chip
      // click always lands the user in the same final state.
      restoreFilterOrder(nodes)

      const matches = []
      for (const el of nodes) {
        const cat = el.dataset[CAT_ATTR]
        const known = cat && cat !== FILTER_NONE
        const isMatch = !!active && known && cat === active
        const shouldHide = !!active && known && cat !== active

        if (shouldHide) {
          if (el.dataset[flagKey] !== "1") {
            el.dataset[flagKey] = "1"
            el.style.setProperty("display", "none", "important")
          }
        } else if (el.dataset[flagKey] === "1") {
          delete el.dataset[flagKey]
          el.style.removeProperty("display")
        }

        if (isMatch) matches.push(el)
      }

      // Phase 2: physically uplift matches to the top of their parent.
      if (active && matches.length > 0) reorderMatchesToTop(matches)
    }
  }

  // Convenience: when a chip is clicked we want to bring the user
  // straight to the first match. Without this they'd often see "no
  // change" because their scroll position is far below where the
  // matches now live.
  function scrollToFirstFilteredMatch() {
    const active = filterBar.active
    if (!active) return
    for (const [, data] of filterBar.rules) {
      let nodes
      try {
        nodes = document.querySelectorAll(data.selector)
      } catch {
        continue
      }
      for (const el of nodes) {
        if (el.dataset[CAT_ATTR] === active && !el.dataset[`uwalFiltered`]) {
          // Use the rect to scroll *manually* (not scrollIntoView) so we
          // can offset for the fixed filter bar without relying on
          // scroll-margin support across every site.
          const rect = el.getBoundingClientRect()
          const top = rect.top + window.scrollY - 64
          window.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
          return
        }
      }
    }
  }

  // Wrap a sendMessage call in a hard wall-clock timeout so a hung
  // service worker (Chrome evicts MV3 SWs aggressively) can't leave the
  // filter bar stuck on its loading state.
  async function sendMessageWithTimeout(msg, ms, label) {
    return await new Promise((resolve, reject) => {
      let settled = false
      const t = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`))
      }, ms)
      sendMessage(msg).then(
        (res) => {
          if (settled) return
          settled = true
          clearTimeout(t)
          resolve(res)
        },
        (err) => {
          if (settled) return
          settled = true
          clearTimeout(t)
          reject(err)
        },
      )
    })
  }

  async function applyFilterRule(rule, els) {
    if (els.length === 0) return
    ensureFilterBar()
    filterBar.rules.set(rule.id, { selector: rule.selector })

    // Wire up Retry: bound to this rule's selector so the user can
    // recover from a transient gateway failure or a bad derivation
    // without reloading the whole page.
    filterBar.onRetry = () => {
      // Drop both the per-text classification cache and the per-page
      // derived-categories cache, then re-run.
      try {
        localStorage.removeItem(filterCacheKey(rule.id))
      } catch {}
      try {
        const raw = localStorage.getItem(DERIVED_CACHE_KEY)
        if (raw) {
          const obj = JSON.parse(raw)
          delete obj[`${location.hostname}::${rule.selector}`]
          localStorage.setItem(DERIVED_CACHE_KEY, JSON.stringify(obj))
        }
      } catch {}
      // Strip dataset tags so we re-tag every element from scratch.
      try {
        document.querySelectorAll(rule.selector).forEach((el) => {
          if (el && el.dataset && el.dataset[CAT_ATTR]) delete el.dataset[CAT_ATTR]
        })
      } catch {}
      filterBar.status = "idle"
      filterBar.statusMessage = ""
      renderFilterBar()
      applyFilterRule(rule, Array.from(document.querySelectorAll(rule.selector)))
    }

    // First-paint: tag any elements we already have cached classifications
    // for, then render the bar so the user sees something immediately
    // (even if the network call below takes a beat).
    const cache = loadFilterCache(rule.id)
    const now = Date.now()
    const fragments = []
    const hashes = []
    const needIdxs = []
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      // Skip elements we already tagged this session.
      if (el.dataset[CAT_ATTR]) {
        hashes[i] = null
        fragments[i] = null
        continue
      }
      const text = (el.innerText || el.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 1500)
      if (!text) {
        el.dataset[CAT_ATTR] = FILTER_NONE
        hashes[i] = null
        continue
      }
      const h = fragHash(text)
      hashes[i] = h
      fragments[i] = text
      const cached = cache.get(h)
      if (cached) {
        el.dataset[CAT_ATTR] = cached.value || FILTER_NONE
      } else {
        needIdxs.push(i)
      }
    }
    renderFilterBar()
    applyFilterVisibility()

    if (needIdxs.length === 0) {
      // Everything cached — make sure we exit the spinner state.
      if (filterBar.status !== "ready") {
        filterBar.status = "ready"
        renderFilterBar()
      }
      return
    }

    // De-dupe in-flight fetches: if the observer fires twice in quick
    // succession we don't want two parallel requests for the same rule.
    if (filterBar.inflight.has(rule.id)) {
      try { await filterBar.inflight.get(rule.id) } catch {}
    }

    const work = (async () => {
      try {
        // ──────────────────────────────────────────────────────────
        // Step 1: derive page-specific categories (cached).
        //
        // This is the "dynamic categories" piece — we ask the LLM to
        // propose 4–7 buckets that match THIS page's content (Nike →
        // Running / Basketball / Apparel / Sale, HN → Programming /
        // Startups / Hardware, etc.) instead of forcing the generic
        // SEED_CATEGORIES taxonomy onto every site.
        // ──────────────────────────────────────────────────────────
        // Page-level context. Used both as a hint to the LLM during
        // derivation AND as a prefix on each fragment during embedding,
        // because product card text on retail sites is far too short
        // ("Jordan Flight Court", "Pegasus 41") for embeddings to
        // reliably distinguish disciplines on its own. Prefixing every
        // card with "Page: men's running shoes" gives the embedding
        // model the disambiguating signal it needs.
        const pageContext = (() => {
          const parts = []
          const h1 = document.querySelector("h1")
          const h1Text = h1 && (h1.innerText || h1.textContent || "").trim()
          if (h1Text) parts.push(h1Text.slice(0, 120))
          const title = (document.title || "").trim()
          if (title) parts.push(title.slice(0, 120))
          // URL slug → human-readable hint. `/nl/en/w/mens-running-shoes-37v7j…`
          // becomes "mens running shoes" which is gold for embeddings.
          const slug = decodeURIComponent(location.pathname)
            .split("/")
            .filter(Boolean)
            .map((seg) => seg.replace(/[-_]+/g, " ").replace(/\b[a-z0-9]{6,}\b/gi, "").trim())
            .filter((seg) => seg.length > 2 && seg.length < 60)
            .join(" ")
          if (slug) parts.push(slug)
          return parts.join(" · ").slice(0, 400)
        })()

        let derivedCategories = derivedCacheRead(location.hostname, rule.selector)
        if (!derivedCategories) {
          filterBar.status = "deriving"
          renderFilterBar()
          // Sample evenly across the new fragments so we capture the
          // full page variety even if React already rendered hundreds.
          const sampleStride = Math.max(1, Math.floor(needIdxs.length / 30))
          const sample = []
          for (let i = 0; i < needIdxs.length && sample.length < 30; i += sampleStride) {
            sample.push(fragments[needIdxs[i]])
          }
          try {
            const deriveRes = await sendMessageWithTimeout(
              {
                type: "derive_categories",
                payload: {
                  fragments: sample,
                  host: location.hostname,
                  pageContext,
                },
              },
              30_000,
              "derive_categories",
            )
            if (deriveRes?.ok && Array.isArray(deriveRes.data?.categories) && deriveRes.data.categories.length >= 2) {
              derivedCategories = deriveRes.data.categories
              derivedCacheWrite(location.hostname, rule.selector, derivedCategories)
              if (deriveRes.data.ai === false && deriveRes.data.notice) {
                toast(`Filter: ${String(deriveRes.data.notice).slice(0, 140)}`, "default")
              }
            } else {
              // No usable derived list �� fall through with categories=null
              // so the categorize call uses SEED_CATEGORIES on the server.
              console.log("[v0] derive_categories returned no usable list; using built-in")
            }
          } catch (err) {
            // Derivation failure isn't fatal; the categorize endpoint
            // will fall back to SEED_CATEGORIES if we don't supply any.
            console.log("[v0] derive_categories failed:", err && err.message)
            toast("Couldn't derive page categories — using built-in list", "default")
          }
        }

        // ──────────────────────────────────────────────────────────
        // Step 2: categorize fragments against the resolved category list.
        // ──────────────────────────────────────────────────��───────
        filterBar.status = "categorizing"
        renderFilterBar()

        // Prepend page context to each fragment so embeddings have
        // signal beyond the bare product name. We keep the original
        // text as the payload key in `cache`/`hashes` (no change there)
        // because the cache already keyed by hash of the raw text;
        // this only affects what we send to the embedding endpoint.
        const ctxPrefix = pageContext ? `Page: ${pageContext}\nItem: ` : ""
        const payload = {
          fragments: needIdxs.map((i) => ctxPrefix + fragments[i]),
        }
        if (derivedCategories) payload.categories = derivedCategories

        const res = await sendMessageWithTimeout(
          { type: "categorize", payload },
          40_000,
          "categorize",
        )
        if (!res?.ok || !Array.isArray(res.data?.results)) {
          filterBar.status = "error"
          filterBar.statusMessage = (res && res.error) || "Categorization failed"
          renderFilterBar()
          return
        }
        if (res.data?.ai === false && res.data?.notice) {
          toast(`Filter (heuristic): ${String(res.data.notice).slice(0, 140)}`, "default")
        }
        const out = res.data.results
        let assigned = 0
        for (let i = 0; i < needIdxs.length; i++) {
          const idx = needIdxs[i]
          const top = out[i]?.top || FILTER_NONE
          if (top !== FILTER_NONE) assigned++
          els[idx].dataset[CAT_ATTR] = top
          cache.set(hashes[idx], { value: top === FILTER_NONE ? null : top, ts: now })
        }
        saveFilterCache(rule.id, cache)

        if (assigned === 0) {
          filterBar.status = "empty"
          filterBar.statusMessage = "No categories detected for this page"
        } else {
          filterBar.status = "ready"
          filterBar.statusMessage = ""
        }
      } catch (err) {
        // Wall-clock timeout or unexpected throw. Both are recoverable
        // via Retry, so we surface the message instead of just logging.
        console.log("[v0] filter rule failed:", err && err.message)
        filterBar.status = "error"
        filterBar.statusMessage = err && err.message ? err.message : "Categorization failed"
      } finally {
        filterBar.inflight.delete(rule.id)
      }
    })()
    filterBar.inflight.set(rule.id, work)
    await work

    // Apply the saved default category once, but only on the first time
    // the rule mounts (so subsequent observer ticks don't override the
    // user's manual chip selection).
    if (!filterBar._defaultsApplied) filterBar._defaultsApplied = new Set()
    const defaultCategory = rule.config && rule.config.category
    if (defaultCategory && !filterBar._defaultsApplied.has(rule.id)) {
      filterBar._defaultsApplied.add(rule.id)
      // Only auto-activate if there's at least one match for it; otherwise
      // we'd be hiding everything for no reason on first load.
      recomputeFilterCounts()
      if ((filterBar.counts.get(defaultCategory) || 0) > 0 && filterBar.active === null) {
        filterBar.active = defaultCategory
      }
    }

    renderFilterBar()
    applyFilterVisibility()
  }

  // ---------------------------------------------------------------------
  // Embedding-based ranking (kind: "rank")
  //
  // The user supplies a free-form query at rule creation time. For every
  // matched element we:
  //   1. Hash (query + element text) → cache key. Lets us skip the API
  //      call on observer re-ticks and on revisits to the same page.
  //   2. Send (query, fragments[]) to /api/v1/rank → cosine similarity.
  //   3. Reorder the elements within their parent, best score first.
  //   4. Overlay a small score pill on each card.
  //
  // We deliberately group by parent before reordering: e.g. on Nike the
  // matched .product-card__link-overlay anchors all live under the same
  // grid container, so a single appendChild loop puts them in score
  // order. If a site nests matches across DIFFERENT parents we sort
  // each parent independently and tag them with rank labels for
  // visibility.
  // ---------------------------------------------------------------------
  const rankInflight = new Map() // ruleId -> Promise so concurrent ticks don't double-fetch
  const rankApplied = new Map() // ruleId -> Set<elementHash> we've already reordered
  const rankLastRunAt = new Map() // ruleId -> Date.now() of last successful invocation
  const rankLastSig = new Map() // ruleId -> fingerprint of the last (matches × scores) we placed
  // ruleId -> Map<containerEl, MutationObserver>. Per-container watchers
  // installed lazily by applyOrderToContainer so React-driven rerenders
  // that revert our DOM/CSS-order writes get reapplied immediately
  // rather than waiting for the next 2s rate-limited rank pass.
  const rankContainerObservers = new Map()
  // WeakMap<containerEl, timestamp>. When applyOrderToContainer mutates
  // a container, it sets this to "now + 250ms"; the per-container
  // observer ignores any childList event before that deadline so it
  // doesn't react to its own writes (which would otherwise cause an
  // infinite reapply loop on every paint). WeakMap so containers that
  // get GC'd don't pin the entry.
  const rankSuppressUntil = new WeakMap()
  // ruleId -> { wrap, input, ruleRef, debounceId }. The fixed-position
  // search bar that floats at the top of the page for every active
  // rank rule. Keyed by rule id so multiple rank rules on the same
  // page (e.g. ranking different grids) get one bar each. Garbage-
  // collected by `syncRankSearchBars` whenever `applyAllRulesOnce`
  // sees the rule has been removed from `activeRules`.
  const rankSearchBars = new Map()

  // When `applyRankRule` reorders DOM siblings, those mutations would
  // normally re-trigger our MutationObserver, which would call
  // `applyAllRulesOnce`, which would call `applyRankRule` again, which
  // would mutate again — a feedback loop the user observed as "keep
  // refreshing and shuffling forever". Setting this flag tells the
  // observer's debounced callback to ignore the next batch of childList
  // mutations from the rank reorder. We clear it on a microtask + a
  // safety timeout in case the observer doesn't fire.
  window.__uwalSuppressObserverUntil = window.__uwalSuppressObserverUntil || 0

  function rankCacheKey(ruleId) {
    return `uwal:rank-cache:v1:${ruleId}`
  }
  function loadRankCache(ruleId) {
    try {
      const raw = sessionStorage.getItem(rankCacheKey(ruleId))
      if (!raw) return new Map()
      const obj = JSON.parse(raw)
      return new Map(Object.entries(obj))
    } catch {
      return new Map()
    }
  }
  function saveRankCache(ruleId, map) {
    try {
      const obj = Object.fromEntries(map)
      sessionStorage.setItem(rankCacheKey(ruleId), JSON.stringify(obj))
    } catch {
      /* quota — ignore */
    }
  }

  // ---------------------------------------------------------------------
  // Rank status banner — refined modern-minimal design with smart anchoring.
  //
  // Two visual modes:
  //   1. ANCHORED — when we can find a stable grid wrapper containing
  //      most of the matched elements, the banner is rendered as a
  //      `position: fixed` strip aligned with that wrapper's top edge
  //      (using its bounding rect) and width. It tracks the wrapper on
  //      scroll/resize via IntersectionObserver: visible while the grid
  //      is on screen, hidden when the user scrolls past it.
  //   2. FLOATING — fallback when no good wrapper exists. Compact pill
  //      docked at bottom-right, click to expand into a full card.
  //
  // Both modes use the same design language: dark surface (slate for
  // embeddings, amber for heuristic fallback), mono font for model id,
  // status dot, dismiss button, click-to-expand for compact form.
  // ---------------------------------------------------------------------

  // Find the smallest ancestor of the matches that contains ≥80% of
  // them. That's typically the grid wrapper / list container we want
  // to anchor the banner to. Returns null if no good candidate exists
  // (e.g. matches scattered across many sibling sections).
  function findGridWrapper(els) {
    if (!els || els.length < 2) return null
    const threshold = Math.max(2, Math.ceil(els.length * 0.8))
    let candidate = els[0].parentElement
    let depth = 0
    while (candidate && candidate !== document.body && depth < 8) {
      let count = 0
      for (const e of els) if (candidate.contains(e)) count++
      if (count >= threshold) {
        const rect = candidate.getBoundingClientRect()
        if (rect.width > 240) return candidate
      }
      candidate = candidate.parentElement
      depth++
    }
    return null
  }

  // Cleanup state from a previous showRankStatus call so we don't leak
  // listeners or get duplicate banners.
  function teardownRankStatus() {
    const old = document.getElementById("uwal-rank-status")
    if (old?.__uwalCleanup) {
      try { old.__uwalCleanup() } catch {}
    }
    old?.remove()
  }

  function showRankStatus({ ruleId, ai, model, notice, count, anchorEls }) {
    teardownRankStatus()

    const host = document.createElement("div")
    host.id = "uwal-rank-status"
    document.documentElement.appendChild(host)
    const sr = host.attachShadow({ mode: "open" })

    const wrapper = anchorEls && anchorEls.length ? findGridWrapper(anchorEls) : null
    const tone = ai ? "ai" : "fallback"

    sr.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        :host {
          /* Position is set imperatively below depending on mode.
             Use a high z-index that still stays under modal dialogs
             on most sites (which usually use 2147483647). */
        }
        .root {
          font: 500 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #fff;
          pointer-events: auto;
        }

        /* Anchored bar: strip aligned with the grid wrapper's top.
           Compact, single line, click anywhere to expand. */
        .bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 10px 6px 8px;
          background: rgba(10, 10, 10, 0.92);
          backdrop-filter: blur(10px) saturate(1.2);
          -webkit-backdrop-filter: blur(10px) saturate(1.2);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
          cursor: pointer;
          transition: border-color 120ms ease;
        }
        .bar:hover { border-color: rgba(255, 255, 255, 0.18); }

        /* Floating compact pill. Same visual language but smaller,
           absolute-positioned to bottom-right of the viewport. */
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px 6px 8px;
          background: rgba(10, 10, 10, 0.92);
          backdrop-filter: blur(10px) saturate(1.2);
          -webkit-backdrop-filter: blur(10px) saturate(1.2);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
          cursor: pointer;
          transition: border-color 120ms ease;
        }
        .pill:hover { border-color: rgba(255, 255, 255, 0.18); }

        .dot {
          width: 7px; height: 7px; flex-shrink: 0;
          border-radius: 999px;
          background: ${ai ? "#22c55e" : "#f59e0b"};
          box-shadow: 0 0 0 3px ${ai ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.18)"};
        }
        .label {
          font-weight: 600;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.85);
        }
        .model {
          font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: -0.02em;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .count {
          font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          color: rgba(255, 255, 255, 0.55);
          letter-spacing: -0.02em;
        }
        .spacer { flex: 1; min-width: 0; }
        .close {
          background: transparent;
          color: rgba(255, 255, 255, 0.55);
          border: 0;
          width: 22px; height: 22px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .close:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.08);
        }

        /* Expanded notice/details panel — slides down from the bar/pill
           when the user clicks the surface. Click again to collapse. */
        .details {
          margin-top: 6px;
          padding: 10px 12px;
          background: rgba(10, 10, 10, 0.92);
          backdrop-filter: blur(10px) saturate(1.2);
          -webkit-backdrop-filter: blur(10px) saturate(1.2);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
          font-size: 11.5px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.85);
          display: none;
        }
        .details[data-open="1"] { display: block; }
        .details .row {
          display: flex; gap: 8px; align-items: baseline;
          padding: 4px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .details .row:last-child { border-bottom: 0; }
        .details .k {
          flex-shrink: 0;
          width: 64px;
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
        }
        .details .v { word-break: break-word; }
        .notice {
          margin-top: 6px;
          padding: 8px 10px;
          background: ${ai ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.10)"};
          border: 1px solid ${ai ? "rgba(34,197,94,0.22)" : "rgba(245,158,11,0.28)"};
          border-radius: 6px;
          color: ${ai ? "#86efac" : "#fcd34d"};
          font-size: 11px;
          line-height: 1.5;
        }

        @media (max-width: 480px) {
          .model { max-width: 120px; }
        }
      </style>
      <div class="root" data-mode="${wrapper ? "anchored" : "floating"}" data-tone="${tone}">
        <div class="${wrapper ? "bar" : "pill"}" id="surface" role="button" tabindex="0" aria-expanded="false" aria-label="Rank status — click for details">
          <span class="dot" aria-hidden="true"></span>
          <span class="label">${ai ? "Ranked" : "Heuristic"}</span>
          <span class="model" title="${escapeHtml(String(model))}">${escapeHtml(String(model))}</span>
          <span class="spacer"></span>
          <span class="count">${count}</span>
          <button class="close" id="close" aria-label="Dismiss">×</button>
        </div>
        <div class="details" id="details">
          <div class="row"><span class="k">Model</span><span class="v" style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(String(model))}</span></div>
          <div class="row"><span class="k">Items</span><span class="v">${count}</span></div>
          <div class="row"><span class="k">Rule</span><span class="v" style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: rgba(255,255,255,0.6);">${escapeHtml(ruleId)}</span></div>
          ${notice ? `<div class="notice">${escapeHtml(String(notice).slice(0, 280))}</div>` : ""}
        </div>
      </div>
    `

    const surface = sr.getElementById("surface")
    const details = sr.getElementById("details")
    const closeBtn = sr.getElementById("close")

    surface.addEventListener("click", (e) => {
      // Don't toggle when the user clicked the dismiss button.
      if (e.target instanceof Element && e.target.closest("#close")) return
      const open = details.dataset.open === "1"
      details.dataset.open = open ? "0" : "1"
      surface.setAttribute("aria-expanded", open ? "false" : "true")
    })
    surface.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        surface.click()
      }
    })
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      teardownRankStatus()
    })

    // ── Smart placement ─────────────────────────────────────────────
    let cleanupFns = []
    if (wrapper) {
      // ANCHORED MODE: align banner with the grid's top edge. We track
      // its bounding rect on scroll/resize and an IntersectionObserver
      // hides the banner when the grid is fully out of view.
      forceStyle(host, {
        position: "fixed",
        "z-index": "2147483646",
        "pointer-events": "auto",
        opacity: "0",
        transition: "opacity 140ms ease",
      })
      const updatePosition = () => {
        const rect = wrapper.getBoundingClientRect()
        // Banner sits 8px above the grid's top edge, right-aligned with
        // the grid's right edge, and capped to a sensible width so it
        // doesn't span the entire viewport on wide layouts.
        const maxWidth = 480
        const width = Math.min(maxWidth, rect.width)
        const right = Math.max(8, window.innerWidth - rect.right)
        host.style.setProperty("right", `${right}px`, "important")
        host.style.setProperty("width", `${width}px`, "important")
        host.style.setProperty("left", "auto", "important")
        // Position vertically: 8px above the grid when it's near the
        // top of the viewport, otherwise pin to the viewport top so
        // the banner stays visible while the user scrolls within the
        // grid (e.g. mid-grid on a long Nike listing).
        if (rect.top > 56) {
          host.style.setProperty("top", `${Math.max(8, rect.top - 44)}px`, "important")
        } else {
          host.style.setProperty("top", "8px", "important")
        }
      }
      updatePosition()
      // Reveal after first paint to avoid a flash at the wrong position.
      requestAnimationFrame(() => host.style.setProperty("opacity", "1", "important"))

      const onScrollOrResize = () => updatePosition()
      window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true })
      window.addEventListener("resize", onScrollOrResize, { passive: true })
      cleanupFns.push(() => {
        window.removeEventListener("scroll", onScrollOrResize, { capture: true })
        window.removeEventListener("resize", onScrollOrResize)
      })

      // Hide when the grid is fully off-screen so we don't sit in the
      // user's way after they scroll away. Show again when it scrolls
      // back into view.
      const io = new IntersectionObserver(
        (entries) => {
          for (const ent of entries) {
            host.style.setProperty(
              "opacity",
              ent.isIntersecting ? "1" : "0",
              "important",
            )
            host.style.setProperty(
              "pointer-events",
              ent.isIntersecting ? "auto" : "none",
              "important",
            )
          }
        },
        { threshold: 0 },
      )
      io.observe(wrapper)
      cleanupFns.push(() => io.disconnect())
    } else {
      // FLOATING MODE: bottom-right pill, no tracking required.
      forceStyle(host, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        "z-index": "2147483646",
        "max-width": "360px",
        "pointer-events": "auto",
      })
    }

    host.__uwalCleanup = () => {
      for (const fn of cleanupFns) {
        try { fn() } catch {}
      }
    }
  }

  // Tiny HTML escaper so the model id / notice strings can't break our
  // shadow-DOM template (e.g. if a future model name contains "<").
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  }

  // ---------------------------------------------------------------------
  // Comparison rule (kind: "compare")
  //
  // The comparison rule injects a checkbox onto every matched card and
  // mounts a docked selection bar at the bottom-right of the page. When
  // the user picks 2-8 cards and clicks Compare, we send the visible
  // text of each pick to /api/v1/compare-text and render the resulting
  // structured table in a modal.
  //
  // Selection state is held in `comparisonSelection`, a Map keyed by a
  // stable hash of each card so we can survive React re-renders that
  // strip our checkbox node — when the rule re-applies on the next
  // observer tick, decorate() looks up the host's key and restores the
  // checked state.
  // ---------------------------------------------------------------------

  /** @type {Map<string, {host: HTMLElement, ruleId: string}>} */
  const comparisonSelection = new Map()
  // Caches a stable key per host element on its dataset so we don't
  // recompute the hash on every checkbox interaction. The hash blends
  // text fingerprint + DOM position so two cards with similar text
  // (e.g. duplicate listings) still get distinct keys.
  function comparisonHostKey(host) {
    if (host.dataset.uwalCompareKey) return host.dataset.uwalCompareKey
    const text = (host.innerText || host.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280)
    // Mix in nth-position so identical text produces distinct keys.
    let nth = 0
    let n = host
    while (n.previousElementSibling) {
      n = n.previousElementSibling
      nth++
    }
    const seed = `${nth}:${text}`
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0
    }
    const key = `c${(hash >>> 0).toString(36)}`
    host.dataset.uwalCompareKey = key
    return key
  }

  // Toggles the visual checked-state on a checkbox AND updates the
  // global selection store (unless `skipStoreUpdate` — used when we're
  // just restoring UI state after a re-render).
  function setComparisonChecked(wrap, host, rule, checked, skipStoreUpdate) {
    const key = comparisonHostKey(host)
    const checkGlyph = wrap.querySelector("[data-uwal-check]")
    wrap.setAttribute("aria-pressed", checked ? "true" : "false")
    if (checked) {
      wrap.style.setProperty("background", "#111", "important")
      wrap.style.setProperty("border-color", "#111", "important")
      wrap.style.setProperty("box-shadow", "0 0 0 3px rgba(17,17,17,0.12), 0 2px 6px rgba(0,0,0,0.16)", "important")
      if (checkGlyph) checkGlyph.style.opacity = "1"
      // Subtle outline on the host card so the user can spot picks at
      // a glance even when scrolled — matched to the dark CTA color.
      host.style.setProperty("outline", "2px solid #111", "important")
      host.style.setProperty("outline-offset", "-2px", "important")
      if (!skipStoreUpdate) comparisonSelection.set(key, { host, ruleId: rule.id })
    } else {
      wrap.style.setProperty("background", "rgba(255, 255, 255, 0.92)", "important")
      wrap.style.setProperty("border-color", "rgba(0, 0, 0, 0.12)", "important")
      wrap.style.setProperty("box-shadow", "0 2px 6px rgba(0, 0, 0, 0.08)", "important")
      if (checkGlyph) checkGlyph.style.opacity = "0"
      host.style.removeProperty("outline")
      host.style.removeProperty("outline-offset")
      if (!skipStoreUpdate) comparisonSelection.delete(key)
    }
    refreshComparisonBar()
  }

  // ---------------------------------------------------------------------
  // Docked selection bar (mounted once per page when a compare rule is
  // active). Lives in its own shadow root so site CSS can't touch it.
  // ---------------------------------------------------------------------

  let comparisonBarHost = null
  let comparisonBarRule = null

  function ensureComparisonBar(rule) {
    comparisonBarRule = rule
    if (comparisonBarHost) return

    const host = document.createElement("div")
    host.id = "uwal-compare-bar"
    forceStyle(host, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      "z-index": "2147483646",
      "pointer-events": "auto",
    })
    document.documentElement.appendChild(host)
    const sr = host.attachShadow({ mode: "open" })

    sr.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .bar {
          font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: rgba(10, 10, 10, 0.95);
          backdrop-filter: blur(12px) saturate(1.2);
          -webkit-backdrop-filter: blur(12px) saturate(1.2);
          color: #fff;
          padding: 10px 12px 10px 14px;
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32), 0 2px 6px rgba(0, 0, 0, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 280px;
          transform: translateY(120%);
          opacity: 0;
          transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
        }
        .bar[data-visible="1"] {
          transform: translateY(0);
          opacity: 1;
        }
        .label {
          flex: 1;
          min-width: 0;
        }
        .title {
          font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 3px;
        }
        .count {
          font: 500 13px/1.2 -apple-system, sans-serif;
          color: #fff;
        }
        .count strong {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .actions {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        button {
          appearance: none;
          font: 500 12px/1.2 -apple-system, sans-serif;
          letter-spacing: 0.01em;
          padding: 7px 12px;
          border-radius: 7px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: background 100ms ease, border-color 100ms ease, color 100ms ease;
        }
        .btn-clear {
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .btn-clear:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.22);
        }
        .btn-go {
          background: #fff;
          color: #111;
          border: 1px solid #fff;
          font-weight: 600;
        }
        .btn-go:hover { background: #f4f4f5; }
        .btn-go:disabled {
          background: rgba(255, 255, 255, 0.18);
          color: rgba(255, 255, 255, 0.45);
          border-color: rgba(255, 255, 255, 0.18);
          cursor: not-allowed;
        }
        .btn-go svg { width: 14px; height: 14px; }
        .spinner {
          width: 14px; height: 14px; border-radius: 999px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          animation: spin 700ms linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .hint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 1px;
        }
      </style>
      <div class="bar" id="bar" role="region" aria-label="Comparison selection">
        <div class="label">
          <div class="title">Compare</div>
          <div class="count"><strong id="num">0</strong> selected</div>
          <div class="hint" id="hint">Pick 2 or more cards</div>
        </div>
        <div class="actions">
          <button class="btn-clear" id="clear" aria-label="Clear selection">Clear</button>
          <button class="btn-go" id="go" disabled>
            ${ICONS.columns}
            <span>Compare</span>
          </button>
        </div>
      </div>
    `
    sr.getElementById("clear").addEventListener("click", () => {
      clearComparisonSelection()
    })
    sr.getElementById("go").addEventListener("click", () => {
      runComparison(comparisonBarRule)
    })

    comparisonBarHost = host
    comparisonBarHost.__sr = sr
    refreshComparisonBar()
  }

  function refreshComparisonBar() {
    if (!comparisonBarHost) return
    const sr = comparisonBarHost.__sr
    if (!sr) return
    const n = comparisonSelection.size
    const numEl = sr.getElementById("num")
    const hintEl = sr.getElementById("hint")
    const goBtn = sr.getElementById("go")
    const bar = sr.getElementById("bar")
    if (numEl) numEl.textContent = String(n)
    if (hintEl) {
      hintEl.textContent =
        n === 0
          ? "Pick 2 or more cards"
          : n === 1
            ? "Pick 1 more to compare"
            : n > 8
              ? "Up to 8 cards · trim selection"
              : "Ready to compare"
    }
    if (goBtn) goBtn.disabled = n < 2 || n > 8
    if (bar) bar.dataset.visible = n > 0 ? "1" : "0"
  }

  function clearComparisonSelection() {
    // Walk every checked checkbox and uncheck via the same code path
    // so the host's outline + the wrap's visual state both reset.
    for (const { host } of Array.from(comparisonSelection.values())) {
      const wrap = host.querySelector(":scope > [data-uwal-kind='compare']")
      if (wrap) {
        const dummyRule = { id: wrap.getAttribute("data-uwal-decoration") }
        setComparisonChecked(wrap, host, dummyRule, false)
      }
    }
    comparisonSelection.clear()
    refreshComparisonBar()
  }

  // ---------------------------------------------------------------------
  // Send the current selection to /api/v1/compare-text and render the
  // resulting comparison table in a modal.
  // ---------------------------------------------------------------------

  async function runComparison(rule) {
    if (!comparisonBarHost) return
    const sr = comparisonBarHost.__sr
    const goBtn = sr?.getElementById("go")
    const picks = Array.from(comparisonSelection.values())
    if (picks.length < 2) return

    if (goBtn) {
      goBtn.disabled = true
      goBtn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>Comparing…</span>`
    }

    // Build the items payload from the live DOM. Each item gets:
    //   - a stable id (the comparison key, used to map cells back if we
    //     want to highlight the recommended card),
    //   - title (from h1/h2/h3 inside the card, falling back to the
    //     truncated first line of text),
    //   - url (the first <a href> inside the card),
    //   - text (truncated visible text, ~2 KB cap).
    const items = picks.map(({ host }) => {
      const id = comparisonHostKey(host)
      const heading = host.querySelector("h1, h2, h3, h4, [role='heading']")
      const headingText = heading
        ? (heading.innerText || heading.textContent || "").trim().slice(0, 200)
        : ""
      const text = (host.innerText || host.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000)
      const title = headingText || text.slice(0, 120)
      const link = host.querySelector("a[href]")
      const url = link ? link.href : ""
      return { id, title, text, url }
    })

    const ctx = (rule?.config && rule.config.context) || ""

    try {
      const res = await sendMessage({
        type: "compare_text",
        payload: { items, context: ctx },
      })
      if (!res.ok) {
        toast(`Compare failed: ${(res.error || "").slice(0, 140)}`, "error")
        return
      }
      openComparisonModal(res.data, picks)
    } catch (err) {
      toast(`Compare failed: ${(err?.message || String(err)).slice(0, 140)}`, "error")
    } finally {
      if (goBtn) {
        goBtn.disabled = comparisonSelection.size < 2
        goBtn.innerHTML = `${ICONS.columns}<span>Compare</span>`
      }
    }
  }

  // ---------------------------------------------------------------------
  // Comparison results modal — full-screen backdrop with a centered card
  // containing the table, verdict, and recommended pick.
  // ---------------------------------------------------------------------

  function openComparisonModal(data, picks) {
    const existing = document.getElementById("uwal-compare-modal")
    if (existing) existing.remove()

    const host = document.createElement("div")
    host.id = "uwal-compare-modal"
    forceStyle(host, {
      position: "fixed",
      inset: "0",
      "z-index": "2147483647",
      "pointer-events": "auto",
    })
    document.documentElement.appendChild(host)
    const sr = host.attachShadow({ mode: "open" })

    const columns = Array.isArray(data?.columns) ? data.columns : []
    const rows = Array.isArray(data?.rows) ? data.rows : []
    const verdict = String(data?.verdict || "")
    const recommended = data?.recommended || null
    const modelName = String(data?.model || "")

    // Highlight the recommended row across the table.
    const recId = recommended?.id || ""

    // Map row id → host element so clicking a row scrolls to (and
    // briefly outlines) the original card on the page.
    const idToHost = new Map(picks.map(({ host: h }) => [comparisonHostKey(h), h]))

    sr.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .backdrop {
          position: absolute; inset: 0;
          background: rgba(10, 10, 10, 0.55);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 5vh 16px 16px;
          overflow: auto;
          animation: fade 160ms ease;
        }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide {
          from { transform: translateY(8px) scale(0.99); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .modal {
          width: 100%;
          max-width: 1080px;
          background: #fff;
          color: #111;
          border-radius: 14px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32), 0 4px 12px rgba(0, 0, 0, 0.12);
          font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          animation: slide 220ms cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 20px 14px;
          border-bottom: 1px solid #e8e8e8;
        }
        .head-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
        .title {
          font: 600 16px/1.2 -apple-system, sans-serif;
          letter-spacing: -0.01em;
        }
        .meta {
          font: 500 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #71717a;
          letter-spacing: 0.02em;
        }
        .head-right { display: flex; gap: 6px; }
        .icon-btn {
          appearance: none;
          background: transparent;
          border: 1px solid #e5e5e5;
          color: #555;
          width: 32px; height: 32px;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 100ms ease, border-color 100ms ease, color 100ms ease;
        }
        .icon-btn:hover {
          background: #fafafa; color: #111; border-color: #d4d4d4;
        }
        .icon-btn svg { width: 14px; height: 14px; }

        .table-wrap {
          overflow: auto;
          max-height: calc(80vh - 160px);
        }
        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13px;
        }
        th, td {
          padding: 12px 14px;
          text-align: left;
          vertical-align: top;
          border-bottom: 1px solid #ececec;
        }
        thead th {
          position: sticky;
          top: 0;
          background: #fafafa;
          font: 600 11px/1.2 -apple-system, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #71717a;
          border-bottom: 1px solid #e5e5e5;
          white-space: nowrap;
        }
        thead th:first-child { padding-left: 20px; }
        thead th:last-child { padding-right: 20px; }
        tbody td:first-child { padding-left: 20px; }
        tbody td:last-child { padding-right: 20px; }
        tbody tr {
          cursor: pointer;
          transition: background 80ms ease;
        }
        tbody tr:hover { background: #fafafa; }
        tbody tr[data-recommended="1"] {
          background: linear-gradient(90deg, rgba(34, 197, 94, 0.06), transparent 50%);
        }
        tbody tr[data-recommended="1"] td:first-child {
          border-left: 2px solid #22c55e;
          padding-left: 18px;
        }
        .row-label {
          font: 500 13px/1.4 -apple-system, sans-serif;
          color: #111;
          min-width: 180px;
          max-width: 260px;
        }
        .row-label small {
          display: block;
          font-weight: 400;
          font-size: 11px;
          color: #999;
          margin-top: 2px;
          word-break: break-all;
        }
        .recommended-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-left: 6px;
          font: 600 9px/1 ui-sans-serif, system-ui, sans-serif;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          background: rgba(34, 197, 94, 0.12);
          color: #16a34a;
          padding: 3px 6px;
          border-radius: 4px;
          vertical-align: middle;
        }
        .recommended-tag svg { width: 10px; height: 10px; }
        .cell {
          color: #27272a;
          font-variant-numeric: tabular-nums;
        }
        .cell-empty { color: #c4c4c4; }

        .verdict {
          padding: 16px 20px 18px;
          background: #fafafa;
          border-top: 1px solid #ececec;
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }
        .verdict-icon {
          flex-shrink: 0;
          width: 32px; height: 32px;
          border-radius: 8px;
          background: #111;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .verdict-icon svg { width: 14px; height: 14px; }
        .verdict-body { flex: 1; }
        .verdict-title {
          font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #71717a;
          margin-bottom: 4px;
        }
        .verdict-text {
          font: 400 14px/1.5 -apple-system, sans-serif;
          color: #111;
          margin: 0;
        }
        .recommended-block {
          margin-top: 10px;
          padding: 10px 12px;
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.22);
          border-radius: 8px;
          font-size: 13px;
          color: #166534;
        }
        .recommended-block strong { color: #14532d; }

        .empty {
          padding: 60px 20px;
          text-align: center;
          color: #71717a;
        }

        @media (prefers-color-scheme: dark) {
          .modal { background: #18181b; color: #fafafa; }
          .head { border-bottom-color: #27272a; }
          .meta, .verdict-title, thead th { color: #a1a1aa; }
          thead th { background: #1f1f23; border-bottom-color: #27272a; }
          th, td { border-bottom-color: #27272a; }
          tbody tr:hover { background: #1f1f23; }
          .row-label { color: #fafafa; }
          .row-label small { color: #71717a; }
          .cell { color: #d4d4d8; }
          .cell-empty { color: #52525b; }
          .verdict { background: #1f1f23; border-top-color: #27272a; }
          .verdict-text { color: #fafafa; }
          .verdict-icon { background: #fafafa; color: #18181b; }
          .icon-btn { border-color: #3f3f46; color: #a1a1aa; }
          .icon-btn:hover { background: #27272a; color: #fafafa; border-color: #52525b; }
        }
      </style>
      <div class="backdrop" id="backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="head">
            <div class="head-left">
              <div class="title" id="modal-title">Comparison · ${rows.length} item${rows.length === 1 ? "" : "s"}</div>
              ${modelName ? `<div class="meta">${escapeHtml(modelName)}</div>` : ""}
            </div>
            <div class="head-right">
              <button class="icon-btn" id="copy" aria-label="Copy as Markdown" title="Copy as Markdown">${ICONS.fileText}</button>
              <button class="icon-btn" id="close" aria-label="Close">${ICONS.x}</button>
            </div>
          </div>

          ${
            rows.length === 0
              ? `<div class="empty">No comparison data returned.</div>`
              : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    ${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}
                  </tr>
                </thead>
                <tbody>
                  ${rows
                    .map((r) => {
                      const isRec = r.id === recId
                      return `
                        <tr data-id="${escapeHtml(r.id)}" data-recommended="${isRec ? "1" : "0"}">
                          <td class="row-label">
                            <span>${escapeHtml(r.label || "Item")}${isRec ? `<span class="recommended-tag">${ICONS.trophy}<span>Top pick</span></span>` : ""}</span>
                          </td>
                          ${columns
                            .map((c) => {
                              const v = (r.cells || {})[c] ?? "—"
                              const empty = !v || v === "—"
                              return `<td><span class="cell ${empty ? "cell-empty" : ""}">${escapeHtml(v)}</span></td>`
                            })
                            .join("")}
                        </tr>
                      `
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          }

          ${
            verdict || recommended
              ? `
            <div class="verdict">
              <div class="verdict-icon">${ICONS.sparkles}</div>
              <div class="verdict-body">
                <div class="verdict-title">Verdict</div>
                ${verdict ? `<p class="verdict-text">${escapeHtml(verdict)}</p>` : ""}
                ${
                  recommended && recommended.id
                    ? `<div class="recommended-block"><strong>Top pick:</strong> ${escapeHtml(rowLabel(rows, recommended.id))}. ${escapeHtml(recommended.reason || "")}</div>`
                    : ""
                }
              </div>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `

    function close() { host.remove() }
    sr.getElementById("backdrop").addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.id === "backdrop") close()
    })
    sr.getElementById("close").addEventListener("click", close)
    document.addEventListener(
      "keydown",
      function onKey(e) {
        if (e.key === "Escape") {
          close()
          document.removeEventListener("keydown", onKey)
        }
      },
      true,
    )

    sr.getElementById("copy")?.addEventListener("click", async () => {
      const md = comparisonToMarkdown({ columns, rows, verdict, recommended })
      try {
        await navigator.clipboard.writeText(md)
        toast("Comparison copied as Markdown", "success")
      } catch {
        toast("Could not copy to clipboard", "error")
      }
    })

    // Click a row → scroll the original card into view + flash an outline.
    sr.querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        const id = tr.getAttribute("data-id")
        const target = id ? idToHost.get(id) : null
        if (!target) return
        target.scrollIntoView({ behavior: "smooth", block: "center" })
        target.style.setProperty("transition", "outline-color 200ms ease", "important")
        target.style.setProperty("outline", "3px solid #f59e0b", "important")
        target.style.setProperty("outline-offset", "-3px", "important")
        setTimeout(() => {
          target.style.removeProperty("outline")
          target.style.removeProperty("outline-offset")
          target.style.setProperty("outline", "2px solid #111", "important")
          target.style.setProperty("outline-offset", "-2px", "important")
        }, 1400)
      })
    })
  }

  function rowLabel(rows, id) {
    const r = rows.find((x) => x.id === id)
    return r ? r.label || "Item" : "Item"
  }

  // Markdown export �� useful when the user wants to paste the table into
  // a doc / Slack / Notion. Built from the same data we just rendered.
  function comparisonToMarkdown({ columns, rows, verdict, recommended }) {
    const head = `| Item | ${columns.join(" | ")} |`
    const sep = `| --- | ${columns.map(() => "---").join(" | ")} |`
    const body = rows
      .map(
        (r) =>
          `| ${(r.label || "").replace(/\|/g, "\\|")} | ${columns
            .map((c) => String(r.cells?.[c] ?? "—").replace(/\|/g, "\\|"))
            .join(" | ")} |`,
      )
      .join("\n")
    const tail = []
    if (verdict) tail.push(`\n**Verdict:** ${verdict}`)
    if (recommended?.id) {
      const r = rows.find((x) => x.id === recommended.id)
      if (r) tail.push(`**Top pick:** ${r.label} — ${recommended.reason || ""}`)
    }
    return [head, sep, body, tail.join("\n\n")].filter(Boolean).join("\n")
  }

  // ---------------------------------------------------------------------
  // Visual Search rule (kind: "visual_search")
  //
  // SCOPE: page-level. Does NOT decorate individual cards. Mounts a
  // single floating "Search by image" pill at the bottom-LEFT of the
  // viewport (Compare's selection bar lives at bottom-right, so the
  // two coexist on the same page without colliding).
  //
  // FLOW:
  //   1. User clicks the floating button → upload modal opens.
  //   2. User picks/drops/pastes an image (downscaled to 1600px JPEG
  //      client-side before upload, to keep the request under a few
  //      hundred KB regardless of how huge the source image was).
  //   3. POST /api/v1/visual-search → { query: string }, a 3-6 word
  //      lowercase search-bar-ready query produced by gpt-4o-mini's
  //      vision model.
  //   4. We autodetect the host page's PRIMARY search bar (see
  //      `findHostSearchInput` below for the heuristic), set its
  //      value via the React-friendly setter, dispatch input/change
  //      events so any framework state updates, then dispatch
  //      Enter / submit. The user lands on the host site's native
  //      search results page for whatever the image depicted.
  //
  // We deliberately do NOT do our own ranking on top of the page's
  // results — the host site already has a search engine, and forcing
  // users through a second ranking layer just makes the experience
  // less predictable. This rule's whole job is "image → query →
  // submit" and nothing more.
  //
  // PLACEHOLDER block kept below to keep the original section comment
  // in source control history; the actual implementation starts at
  // applyVisualSearchRule and continues through resizeImageToDataUrl.
  // ---------------------------------------------------------------------

  // (legacy header — preserved for grep)
  // Visual Search rule (kind: "visual_search") — see block above.
  //
  // Was previously a "rank cards by image" rule; rewritten to the
  // simpler image→query→submit flow on user request. The previous
  // results-modal code path is gone.
  //
  // ---------------------------------------------------------------------
  //
  // (block below is the active implementation; everything above is
  // documentation / historical context kept on purpose so future
  // readers understand the design choice.)
  //
  // ---------------------------------------------------------------------
  //
  // Mounts a single floating "Search by image" pill at the
  // bottom-LEFT of the viewport (Compare's selection bar lives at bottom-right,
  // so the two coexist on the same page without colliding).
  //
  // Click → upload modal (drag/drop OR file picker, in shadow DOM).
  // Drop image → modal shows a preview + a "Search" button.
  // Click Search → reads the file, downscales to ~1600px, sends to
  // /api/v1/visual-search with the live cards, then opens a results
  // modal listing every card scored 0-1 by visual relevance.
  //
  // The rule is intentionally idempotent at every layer: the floating
  // button is mounted at most once per page, the upload modal is
  // re-created fresh on each open, and the results modal replaces any
  // previous one.
  // ---------------------------------------------------------------------

  /** Set<HTMLElement> — inputs we've already attached a camera button
   *  to. Used to dedupe across the SPA-mutation observer so the rule
   *  is idempotent: re-running applyRule on the same page never
   *  spawns a second button on the same input. */
  const visualSearchInputs = new WeakSet()

  function applyVisualSearchRule(rule, els) {
    // Per-match decoration. The user explicitly picked the search bar
    // they want to drive (single-element scope, or "All similar" if
    // they want it on every search bar on the page), so we attach the
    // upload trigger to THAT input — not a page-global floating pill.
    // Each match resolves to exactly one HTMLInputElement / textarea
    // via resolveSearchInputFrom; if we can't resolve one, we silently
    // skip the match (the toolbar would have nowhere to go).
    for (const el of els) {
      const input = resolveSearchInputFrom(el)
      if (!input) continue
      if (visualSearchInputs.has(input)) continue
      visualSearchInputs.add(input)
      mountSearchBarUploadButton(input, rule)
    }
  }

  /** Given the element the user selected from the panel, return the
   *  actual <input>/<textarea> we should fill on submit. The matched
   *  element might already be an input, or it might be a wrapper /
   *  form / search container — handle all the common cases. */
  function resolveSearchInputFrom(el) {
    if (!el) return null
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      // Skip clearly non-textual inputs (e.g. hidden, submit, file).
      const t = (el.type || "text").toLowerCase()
      if (t === "hidden" || t === "submit" || t === "button" || t === "file" || t === "checkbox" || t === "radio") {
        return null
      }
      return el
    }
    // Prefer search inputs, then text/textarea, then comboboxes.
    const inside = el.querySelector(
      "input[type='search'], input[type='text'], input:not([type]), textarea, input[role='combobox'], [role='combobox'] input",
    )
    if (inside instanceof HTMLInputElement || inside instanceof HTMLTextAreaElement) return inside
    const form = el.closest && el.closest("form")
    if (form) {
      const inForm = form.querySelector("input[type='search'], input[type='text']")
      if (inForm instanceof HTMLInputElement) return inForm
    }
    return null
  }

  /** Mount a small camera-icon button overlaid on the right edge of an
   *  input. Position is updated on scroll/resize/layout-change so the
   *  button tracks the input even on sticky headers, mobile zoom, etc. */
  function mountSearchBarUploadButton(input, rule) {
    const host = document.createElement("div")
    host.setAttribute("data-uwal-visual-search", rule.id)
    forceStyle(host, {
      position: "fixed",
      "z-index": "2147483646",
      "pointer-events": "auto",
      // Initial offscreen position; reposition() will place it correctly
      // before the next paint.
      top: "-9999px",
      left: "-9999px",
    })
    document.documentElement.appendChild(host)
    const sr = host.attachShadow({ mode: "open" })

    sr.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .btn {
          width: 30px; height: 30px; border-radius: 999px;
          background: rgba(10, 10, 10, 0.92);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22), 0 1px 2px rgba(0, 0, 0, 0.12);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          transition: transform 90ms ease, background 100ms ease;
        }
        .btn:hover { background: rgba(20, 20, 20, 0.98); transform: scale(1.05); }
        .btn:active { transform: scale(0.96); }
        .btn svg { width: 16px; height: 16px; display: block; }
        @media (prefers-color-scheme: light) {
          .btn { background: #111; }
          .btn:hover { background: #000; }
        }
      </style>
      <button class="btn" id="open" type="button" aria-label="Search by image" title="Search by image">
        ${ICONS.image}
      </button>
    `

    const btn = sr.getElementById("open")

    // Don't let the button submit the surrounding <form> or trigger
    // native search behaviors when we click it.
    const stopBubble = (ev) => {
      ev.stopPropagation()
      ev.stopImmediatePropagation?.()
    }
    btn.addEventListener("mousedown", stopBubble, true)
    btn.addEventListener("mouseup", stopBubble, true)
    btn.addEventListener("click", (ev) => {
      stopBubble(ev)
      ev.preventDefault()
      openVisualSearchUpload(rule, input)
    })

    // Track the input's position so the button stays glued to its
    // right edge as the page scrolls or layout shifts.
    let raf = 0
    const reposition = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const r = input.getBoundingClientRect()
        if (!input.isConnected || (r.width === 0 && r.height === 0)) {
          host.style.display = "none"
          return
        }
        // Hide if the input has scrolled out of the viewport vertically;
        // showing the camera floating in empty space looks broken.
        const off = r.bottom < 0 || r.top > window.innerHeight
        host.style.display = off ? "none" : ""
        if (off) return
        const size = 30
        const margin = 8
        const top = Math.round(r.top + (r.height - size) / 2)
        const left = Math.round(r.right - size - margin)
        host.style.top = `${top}px`
        host.style.left = `${left}px`
      })
    }

    reposition()

    // Re-position on every relevant event. `capture: true` on scroll
    // catches scrolls inside any nested container (e.g. a sticky
    // header inside a position:relative ancestor).
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    let resizeObs
    try {
      resizeObs = new ResizeObserver(reposition)
      resizeObs.observe(input)
      // Also observe the document body so layout shifts (collapsing
      // navs, font swaps, ad slot insertions) trigger an update.
      resizeObs.observe(document.documentElement)
    } catch {
      /* very old browsers — fall back to scroll/resize handlers only */
    }

    // If the input gets removed from the DOM (some SPAs replace the
    // search bar on route change), tear ourselves down.
    let mutObs
    try {
      mutObs = new MutationObserver(() => {
        if (!input.isConnected) cleanup()
      })
      mutObs.observe(document.documentElement, { childList: true, subtree: true })
    } catch {
      /* ignore — worst case we leave a button behind on cleanup misses */
    }

    function cleanup() {
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
      resizeObs?.disconnect()
      mutObs?.disconnect()
      host.remove()
    }
  }

  // ---------------------------------------------------------------------
  // Upload modal — drag/drop, paste, file picker, image preview, optional
  // prompt input (e.g. "find shoes that look like this for running").
  //
  // `targetInput` is the specific HTMLInputElement / textarea the user
  // bound this rule to — it's the one we'll fill on submit. We pass it
  // in rather than re-detecting at submit time so that the rule's
  // contract is "this exact bar gets driven by uploads from this
  // button", which is much more predictable on pages with multiple
  // search-like inputs (Amazon has the main bar plus dropdowns).
  // ---------------------------------------------------------------------

  function openVisualSearchUpload(rule, targetInput) {
    document.getElementById("uwal-visual-search-modal")?.remove()

    const host = document.createElement("div")
    host.id = "uwal-visual-search-modal"
    forceStyle(host, {
      position: "fixed",
      inset: "0",
      "z-index": "2147483647",
      "pointer-events": "auto",
    })
    document.documentElement.appendChild(host)
    const sr = host.attachShadow({ mode: "open" })

    sr.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .backdrop {
          position: absolute; inset: 0;
          background: rgba(10, 10, 10, 0.55);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
          animation: fade 160ms ease;
        }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide {
          from { transform: translateY(8px) scale(0.99); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .modal {
          width: 100%; max-width: 520px;
          background: #fff; color: #111;
          border-radius: 14px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32), 0 4px 12px rgba(0, 0, 0, 0.12);
          font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          animation: slide 220ms cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .head {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          padding: 14px 18px; border-bottom: 1px solid #e8e8e8;
        }
        .title { font: 600 15px/1.2 -apple-system, sans-serif; letter-spacing: -0.01em; }
        .icon-btn {
          appearance: none; background: transparent; border: 1px solid #e5e5e5;
          color: #555; width: 30px; height: 30px; border-radius: 6px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          transition: background 100ms ease, border-color 100ms ease, color 100ms ease;
        }
        .icon-btn:hover { background: #fafafa; color: #111; border-color: #d4d4d4; }
        .icon-btn svg { width: 14px; height: 14px; }

        .body { padding: 18px; }
        .drop {
          position: relative;
          border: 2px dashed #d4d4d8; border-radius: 10px; background: #fafafa;
          display: flex; align-items: center; justify-content: center;
          padding: 32px 16px; text-align: center; cursor: pointer;
          transition: border-color 120ms ease, background 120ms ease;
          min-height: 220px;
        }
        .drop:hover, .drop[data-dragover="1"] { border-color: #111; background: #f4f4f5; }
        .drop-inner {
          display: flex; flex-direction: column; align-items: center; gap: 10px; color: #71717a;
        }
        .drop-inner svg { width: 24px; height: 24px; color: #111; }
        .drop-inner b { font: 600 13px/1.2 -apple-system, sans-serif; color: #111; }
        .drop-inner small { font-size: 11px; }
        .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

        .preview-wrap {
          position: relative; width: 100%; border-radius: 10px; overflow: hidden;
          background: #f4f4f5; aspect-ratio: 4 / 3;
        }
        .preview-wrap img {
          width: 100%; height: 100%; object-fit: contain; display: block;
          background: repeating-conic-gradient(#f4f4f5 0% 25%, #e4e4e7 0% 50%) 50%/16px 16px;
        }
        .preview-wrap .replace {
          position: absolute; top: 8px; right: 8px;
          background: rgba(255,255,255,0.94); border: 1px solid rgba(0,0,0,0.1);
          padding: 6px 10px; border-radius: 6px; font: 600 11px/1 -apple-system, sans-serif;
          cursor: pointer; color: #111;
        }
        .preview-wrap .replace:hover { background: #fff; border-color: rgba(0,0,0,0.2); }

        .row { margin-top: 14px; }
        .row label {
          display: block; font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
          letter-spacing: 0.06em; text-transform: uppercase; color: #71717a; margin-bottom: 6px;
        }
        .row input[type="text"] {
          width: 100%; padding: 9px 10px; border: 1px solid #e5e5e5; border-radius: 8px;
          font: 400 13px/1.4 -apple-system, sans-serif; color: #111; background: #fff;
          transition: border-color 100ms ease, box-shadow 100ms ease;
        }
        .row input:focus {
          outline: none; border-color: #111; box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
        }

        .foot {
          padding: 12px 18px; border-top: 1px solid #e8e8e8; background: #fafafa;
          display: flex; justify-content: space-between; align-items: center; gap: 8px;
        }
        .foot .meta { font: 500 11px/1 ui-monospace, Menlo, monospace; color: #71717a; }
        .foot .actions { display: flex; gap: 6px; }
        button.btn {
          appearance: none; font: 500 12px/1.2 -apple-system, sans-serif;
          padding: 8px 14px; border-radius: 7px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
          transition: background 100ms ease, border-color 100ms ease;
        }
        .btn-cancel { background: transparent; color: #555; border: 1px solid #e5e5e5; }
        .btn-cancel:hover { background: #fff; color: #111; border-color: #d4d4d4; }
        .btn-go { background: #111; color: #fff; border: 1px solid #111; font-weight: 600; }
        .btn-go:hover { background: #000; }
        .btn-go:disabled { background: #d4d4d8; border-color: #d4d4d8; color: #fff; cursor: not-allowed; }
        .btn-go .spinner {
          width: 12px; height: 12px; border-radius: 999px;
          border: 2px solid currentColor; border-top-color: transparent;
          animation: spin 700ms linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (prefers-color-scheme: dark) {
          .modal { background: #18181b; color: #fafafa; }
          .head { border-bottom-color: #27272a; }
          .icon-btn { border-color: #3f3f46; color: #a1a1aa; }
          .icon-btn:hover { background: #27272a; color: #fafafa; border-color: #52525b; }
          .drop { background: #1f1f23; border-color: #3f3f46; }
          .drop:hover, .drop[data-dragover="1"] { background: #27272a; border-color: #fafafa; }
          .drop-inner { color: #a1a1aa; }
          .drop-inner b, .drop-inner svg { color: #fafafa; }
          .row label { color: #a1a1aa; }
          .row input { background: #1f1f23; border-color: #3f3f46; color: #fafafa; }
          .row input:focus { border-color: #fafafa; box-shadow: 0 0 0 3px rgba(255,255,255,0.08); }
          .foot { background: #1f1f23; border-top-color: #27272a; }
          .foot .meta { color: #71717a; }
          .btn-cancel { color: #a1a1aa; border-color: #3f3f46; }
          .btn-cancel:hover { background: #27272a; color: #fafafa; border-color: #52525b; }
          .btn-go { background: #fafafa; color: #18181b; border-color: #fafafa; }
          .btn-go:hover { background: #fff; }
          .btn-go:disabled { background: #3f3f46; border-color: #3f3f46; color: #71717a; }
        }
      </style>
      <div class="backdrop" id="backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="vs-title">
          <div class="head">
            <div class="title" id="vs-title">Visual search</div>
            <button class="icon-btn" id="close" aria-label="Close">${ICONS.x}</button>
          </div>
          <div class="body">
            <div class="drop" id="drop" data-dragover="0" tabindex="0" role="button" aria-label="Upload an image">
              <div class="drop-inner" id="drop-inner">
                ${ICONS.upload}
                <b>Drop an image, paste, or click to browse</b>
                <small>JPG, PNG or WebP &middot; max 8 MB</small>
              </div>
              <input type="file" id="file" accept="image/*" />
            </div>
            <div class="row">
              <label for="prompt">Optional: what aspect to focus on</label>
              <input type="text" id="prompt" placeholder="e.g. shoes that look like this for running" maxlength="280" />
            </div>
          </div>
          <div class="foot">
            <span class="meta" id="meta">No image selected</span>
            <div class="actions">
              <button class="btn btn-cancel" id="cancel">Cancel</button>
              <button class="btn btn-go" id="go" disabled>
                ${ICONS.image}
                <span>Search</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `

    // Holds the resized data URL once an image has been picked.
    let dataUrl = null

    const drop = sr.getElementById("drop")
    const dropInner = sr.getElementById("drop-inner")
    const fileInput = sr.getElementById("file")
    const meta = sr.getElementById("meta")
    const goBtn = sr.getElementById("go")
    const promptInput = sr.getElementById("prompt")

    function showPreview(url, name, size) {
      dataUrl = url
      drop.innerHTML = `
        <div class="preview-wrap">
          <img src="${url}" alt="" />
          <button class="replace" id="replace">Replace</button>
        </div>
      `
      sr.getElementById("replace").addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        fileInput.value = ""
        dataUrl = null
        drop.innerHTML = ""
        drop.appendChild(dropInner)
        drop.appendChild(fileInput)
        meta.textContent = "No image selected"
        goBtn.disabled = true
      })
      meta.textContent = `${name || "image"} · ${formatBytes(size)}`
      goBtn.disabled = false
    }

    async function handleFile(file) {
      if (!file || !file.type.startsWith("image/")) {
        toast("Please pick an image file", "error")
        return
      }
      if (file.size > 8 * 1024 * 1024) {
        toast("Image is over 8 MB — pick a smaller one", "error")
        return
      }
      try {
        // Downscale client-side so the request payload stays small (and
        // so cellular users don't burn bandwidth uploading a 12 MP photo).
        // gpt-4o-mini's vision call performs equivalently at 1600px.
        const resized = await resizeImageToDataUrl(file, 1600)
        showPreview(resized, file.name, file.size)
      } catch (err) {
        console.log("[v0] visual_search resize failed", err)
        // Fallback: send the original file as-is.
        const reader = new FileReader()
        reader.onload = () => showPreview(String(reader.result), file.name, file.size)
        reader.readAsDataURL(file)
      }
    }

    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0]
      if (f) handleFile(f)
    })

    drop.addEventListener("dragover", (e) => {
      e.preventDefault()
      drop.dataset.dragover = "1"
    })
    drop.addEventListener("dragleave", () => {
      drop.dataset.dragover = "0"
    })
    drop.addEventListener("drop", (e) => {
      e.preventDefault()
      drop.dataset.dragover = "0"
      const f = e.dataTransfer?.files?.[0]
      if (f) handleFile(f)
    })

    // Paste support — really common when grabbing an image off the web.
    const onPaste = (e) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"))
      if (!item) return
      const f = item.getAsFile()
      if (f) handleFile(f)
    }
    document.addEventListener("paste", onPaste, true)

    function close() {
      document.removeEventListener("paste", onPaste, true)
      host.remove()
    }
    sr.getElementById("backdrop").addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.id === "backdrop") close()
    })
    sr.getElementById("close").addEventListener("click", close)
    sr.getElementById("cancel").addEventListener("click", close)
    document.addEventListener(
      "keydown",
      function onKey(e) {
        if (e.key === "Escape") {
          close()
          document.removeEventListener("keydown", onKey)
        }
      },
      true,
    )

    sr.getElementById("go").addEventListener("click", async () => {
      if (!dataUrl) return
      goBtn.disabled = true
      goBtn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>Searching…</span>`

      try {
        // 1. Image → short search query via gpt-4o-mini vision.
        //    No card scoring here — see top-of-module comment.
        const res = await sendMessage({
          type: "visual_search",
          payload: {
            image: dataUrl,
            prompt: promptInput.value.trim().slice(0, 160),
            site: location.hostname,
          },
        })
        if (!res?.ok) throw new Error(res?.error || "Visual search failed")
        const query = String(res.data?.query || "").trim()
        if (!query) throw new Error("Empty query from model")

        // 2. Resolve the input to fill. We strongly prefer `targetInput`
        //    (the one this button was mounted on), but it can become
        //    stale on SPAs that replace the DOM under our feet — fall
        //    back to a fresh autodetect in that case.
        let input = targetInput && targetInput.isConnected ? targetInput : null
        if (!input) input = findHostSearchInput()

        // 3. Submit. If even the fallback can't find a bar, copy the
        //    query to the clipboard so the user can paste it themselves
        //    — better than throwing the result away.
        close()
        if (input) {
          submitToHostSearchInput(input, query)
          toast(`Searching for: ${query}`, "success")
        } else {
          try {
            await navigator.clipboard.writeText(query)
            toast(`No search bar found. Query copied: ${query}`, "default")
          } catch {
            toast(`No search bar found. Query: ${query}`, "default")
          }
        }
      } catch (err) {
        const msg = err && err.message ? err.message : String(err)
        toast(`Visual search failed: ${msg.slice(0, 140)}`, "error")
        goBtn.disabled = false
        goBtn.innerHTML = `${ICONS.image}<span>Search</span>`
      }
    })

    setTimeout(() => drop.focus(), 30)
  }

  // ---------------------------------------------------------------------
  // Host search-bar autodetect + submit.
  //
  // Most websites have a discoverable search input — typically the first
  // <input type="search">, or an <input> inside a <form role="search">,
  // or one whose name/id/aria-label/placeholder mentions "search".
  // We rank candidates by signal strength and pick the best one. If
  // nothing scores above the floor we return null and the caller falls
  // back to clipboard.
  //
  // Submitting is non-trivial because most modern sites are React/Vue
  // controlled inputs: setting `input.value` directly does NOT trigger
  // their onChange handlers, so the typed text gets blown away on the
  // next render. The fix is the well-known "native value setter" trick:
  // call the setter from `Object.getOwnPropertyDescriptor` on the
  // prototype, then dispatch a real `input` event so React picks up
  // the change. After that, we simulate Enter (works for all <input>s
  // inside a form) and as a belt-and-suspenders also call form.submit().
  // ---------------------------------------------------------------------

  function findHostSearchInput() {
    // Same-page only — we ignore cross-origin iframes (script can't
    // touch them anyway). Concatenating selectors with priority order
    // and then deduping by element keeps the heuristic readable.
    const candidates = []
    const push = (el, score) => {
      if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
      // Skip hidden/disabled/readonly inputs — those aren't search bars
      // even if they look like one in the DOM.
      if (el.disabled || el.readOnly) return
      const rect = el.getBoundingClientRect()
      if (rect.width < 40 || rect.height < 16) return
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return
      // Avoid our OWN extension's text fields (panel, etc).
      if (el.closest("#__uwal-host, [id^=uwal-]")) return
      candidates.push({ el, score })
    }

    // Strongest signals first.
    document.querySelectorAll("input[type='search']").forEach((el) => push(el, 100))
    document
      .querySelectorAll("form[role='search'] input, [role='search'] input")
      .forEach((el) => push(el, 90))
    // Common name / id / aria-label / placeholder hints.
    document
      .querySelectorAll(
        "input[name*='search' i], input[id*='search' i], input[aria-label*='search' i], input[placeholder*='search' i], input[name*='query' i], input[id*='query' i], input[aria-label*='query' i]",
      )
      .forEach((el) => push(el, 70))
    // Last-ditch: any text input inside a <form> at the top of the page.
    document.querySelectorAll("form input[type='text']").forEach((el) => push(el, 30))

    if (candidates.length === 0) return null

    // De-dupe (an input can match multiple selectors), keeping the
    // highest score per element. Then prefer ones higher on the page —
    // most sites put the primary search bar near the top.
    const seen = new Map()
    for (const c of candidates) {
      const prev = seen.get(c.el)
      if (!prev || prev.score < c.score) seen.set(c.el, c)
    }
    const ranked = Array.from(seen.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const ay = a.el.getBoundingClientRect().top + window.scrollY
      const by = b.el.getBoundingClientRect().top + window.scrollY
      return ay - by
    })
    return ranked[0]?.el || null
  }

  function submitToHostSearchInput(input, query) {
    // 1. Set the value via the native setter so React's synthetic event
    //    system actually picks it up. Plain `input.value = query` would
    //    update the DOM but leave React state untouched, so the page
    //    would re-render and discard our text on the next tick.
    try {
      const proto =
        input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
      if (setter) setter.call(input, query)
      else input.value = query
    } catch {
      input.value = query
    }

    // 2. Fire the events frameworks listen for. `input` for React/Vue
    //    controlled-component state, `change` for older jQuery sites.
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }))

    // 3. Focus so any "search-as-you-type" UI activates.
    try { input.focus() } catch {}

    // 4. Submit. We try, in order:
    //    a) An "Enter" KeyboardEvent — most SPA search bars listen for this.
    //    b) The enclosing form's requestSubmit() / submit() — covers
    //       classical server-rendered sites and some SPAs.
    //    A short setTimeout between the input event and submit gives
    //    React a tick to flush state before we trigger the search.
    setTimeout(() => {
      try {
        const enterInit = {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
        }
        input.dispatchEvent(new KeyboardEvent("keydown", enterInit))
        input.dispatchEvent(new KeyboardEvent("keypress", enterInit))
        input.dispatchEvent(new KeyboardEvent("keyup", enterInit))
      } catch {}

      const form = input.form || input.closest("form")
      if (form) {
        try {
          if (typeof form.requestSubmit === "function") form.requestSubmit()
          else form.submit()
        } catch {
          /* form.submit() throws if the form has a submit-named input;
             the keydown above is usually enough so we swallow this. */
        }
      }
    }, 50)
  }

  // (Removed: openVisualSearchResults — the previous "rank cards" modal.
  //  The current rule submits the extracted query to the host page's
  //  search bar instead, so no second results UI is needed. The body
  //  of the old function is left below, behind a `return` guard, so
  //  the IIFE's bracing remains balanced; it will be deleted in the
  //  next pass once we're confident no one reaches for it.
  //  eslint-disable, ts-nocheck — unreachable.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function _visualSearchResultsModalRemoved_(/* data, items */) {
    return null
    // @ts-expect-error unreachable
    // eslint-disable-next-line
    void document.getElementById("uwal-visual-results")?.remove()

    const host = document.createElement("div")
    host.id = "uwal-visual-results"
    forceStyle(host, {
      position: "fixed",
      inset: "0",
      "z-index": "2147483647",
      "pointer-events": "auto",
    })
    document.documentElement.appendChild(host)
    const sr = host.attachShadow({ mode: "open" })

    const description = String(data?.description || "")
    const query = String(data?.query || "")
    const modelName = String(data?.model || "")

    // Sort by score desc, then map to the live host element so we can
    // scroll-to-card on click.
    const idToItem = new Map(items.map((it) => [it.id, it]))
    const ranked = (Array.isArray(data?.ranked) ? data.ranked : [])
      .slice()
      .sort((a, b) => (b.score || 0) - (a.score || 0))

    sr.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .backdrop {
          position: absolute; inset: 0;
          background: rgba(10, 10, 10, 0.55);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 5vh 16px 16px;
          overflow: auto;
          animation: fade 160ms ease;
        }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide {
          from { transform: translateY(8px) scale(0.99); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .modal {
          width: 100%; max-width: 760px;
          background: #fff; color: #111;
          border-radius: 14px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32), 0 4px 12px rgba(0, 0, 0, 0.12);
          font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          animation: slide 220ms cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .head {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          padding: 14px 20px; border-bottom: 1px solid #e8e8e8;
        }
        .head-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
        .title { font: 600 16px/1.2 -apple-system, sans-serif; letter-spacing: -0.01em; }
        .meta { font: 500 11px/1 ui-monospace, Menlo, monospace; color: #71717a; }
        .icon-btn {
          appearance: none; background: transparent; border: 1px solid #e5e5e5;
          color: #555; width: 32px; height: 32px; border-radius: 6px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          transition: background 100ms ease, border-color 100ms ease, color 100ms ease;
        }
        .icon-btn:hover { background: #fafafa; color: #111; border-color: #d4d4d4; }
        .icon-btn svg { width: 14px; height: 14px; }

        .summary {
          padding: 14px 20px; background: #fafafa; border-bottom: 1px solid #ececec;
        }
        .summary-label {
          font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
          letter-spacing: 0.06em; text-transform: uppercase; color: #71717a;
          margin-bottom: 4px;
        }
        .summary-text { font: 400 13px/1.5 -apple-system, sans-serif; color: #111; }
        .summary-query {
          margin-top: 8px; font: 500 12px/1.4 ui-monospace, Menlo, monospace;
          color: #16a34a; background: rgba(34,197,94,0.08); padding: 6px 8px;
          border-radius: 6px; display: inline-block;
        }

        .list { max-height: calc(80vh - 220px); overflow: auto; }
        .row {
          display: grid; grid-template-columns: 64px 1fr; gap: 14px;
          align-items: center; padding: 12px 20px;
          border-bottom: 1px solid #ececec; cursor: pointer;
          transition: background 80ms ease;
        }
        .row:hover { background: #fafafa; }
        .row[data-tier="high"] { background: linear-gradient(90deg, rgba(34,197,94,0.08), transparent 50%); }
        .row[data-tier="high"]:hover { background: linear-gradient(90deg, rgba(34,197,94,0.12), rgba(0,0,0,0.02) 50%); }

        .score-badge {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          width: 56px; height: 44px; border-radius: 8px;
          background: #f4f4f5; color: #71717a;
          font-variant-numeric: tabular-nums;
        }
        .score-badge[data-tier="high"] { background: rgba(34,197,94,0.14); color: #15803d; }
        .score-badge[data-tier="mid"] { background: rgba(245,158,11,0.14); color: #b45309; }
        .score-badge .pct { font: 700 14px/1 -apple-system, sans-serif; }
        .score-badge .lbl { font: 600 9px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 2px; }

        .row-label { font: 500 13px/1.4 -apple-system, sans-serif; color: #111; }
        .row-reason { font: 400 12px/1.4 -apple-system, sans-serif; color: #71717a; margin-top: 2px; }

        .empty { padding: 60px 20px; text-align: center; color: #71717a; }

        @media (prefers-color-scheme: dark) {
          .modal { background: #18181b; color: #fafafa; }
          .head, .summary { border-bottom-color: #27272a; }
          .summary { background: #1f1f23; }
          .summary-label, .meta { color: #a1a1aa; }
          .summary-text { color: #fafafa; }
          .icon-btn { border-color: #3f3f46; color: #a1a1aa; }
          .icon-btn:hover { background: #27272a; color: #fafafa; border-color: #52525b; }
          .row { border-bottom-color: #27272a; }
          .row:hover { background: #1f1f23; }
          .row-label { color: #fafafa; }
          .row-reason { color: #a1a1aa; }
          .score-badge { background: #27272a; color: #a1a1aa; }
        }
      </style>
      <div class="backdrop" id="backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="vr-title">
          <div class="head">
            <div class="head-left">
              <div class="title" id="vr-title">Visual search results</div>
              ${modelName ? `<div class="meta">${escapeHtml(modelName)}</div>` : ""}
            </div>
            <button class="icon-btn" id="close" aria-label="Close">${ICONS.x}</button>
          </div>
          ${
            description || query
              ? `
            <div class="summary">
              ${description ? `<div class="summary-label">Image</div><div class="summary-text">${escapeHtml(description)}</div>` : ""}
              ${query ? `<div class="summary-query">${escapeHtml(query)}</div>` : ""}
            </div>
          `
              : ""
          }
          ${
            ranked.length === 0
              ? `<div class="empty">No matches found.</div>`
              : `
            <div class="list" role="list">
              ${ranked
                .map((r) => {
                  const it = idToItem.get(r.id)
                  if (!it) return ""
                  const pct = Math.round((r.score || 0) * 100)
                  const tier = pct >= 70 ? "high" : pct >= 40 ? "mid" : "low"
                  return `
                    <div class="row" role="listitem" data-id="${escapeHtml(r.id)}" data-tier="${tier}">
                      <div class="score-badge" data-tier="${tier}">
                        <span class="pct">${pct}</span>
                        <span class="lbl">match</span>
                      </div>
                      <div>
                        <div class="row-label">${escapeHtml(it.title || it.text.slice(0, 80) || "Untitled")}</div>
                        ${r.reason ? `<div class="row-reason">${escapeHtml(r.reason)}</div>` : ""}
                      </div>
                    </div>
                  `
                })
                .join("")}
            </div>
          `
          }
        </div>
      </div>
    `

    function close() { host.remove() }
    sr.getElementById("backdrop").addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.id === "backdrop") close()
    })
    sr.getElementById("close").addEventListener("click", close)
    document.addEventListener(
      "keydown",
      function onKey(e) {
        if (e.key === "Escape") {
          close()
          document.removeEventListener("keydown", onKey)
        }
      },
      true,
    )

    // Click a row → scroll the live card into view + flash an outline.
    // Same UX as the comparison modal so users get a consistent flow.
    sr.querySelectorAll(".row").forEach((rowEl) => {
      rowEl.addEventListener("click", () => {
        const id = rowEl.getAttribute("data-id")
        const it = id ? idToItem.get(id) : null
        const target = it?.host
        if (!target) return
        target.scrollIntoView({ behavior: "smooth", block: "center" })
        target.style.setProperty("transition", "outline-color 200ms ease", "important")
        target.style.setProperty("outline", "3px solid #f59e0b", "important")
        target.style.setProperty("outline-offset", "-3px", "important")
        setTimeout(() => {
          target.style.removeProperty("outline")
          target.style.removeProperty("outline-offset")
        }, 1600)
      })
    })
  }

  // ---------------------------------------------------------------------
  // Helpers used by visual-search only.
  // ---------------------------------------------------------------------

  function formatBytes(n) {
    if (!n || n < 1024) return `${n || 0} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
  }

  // Resize a File / Blob to an image data URL whose longest edge is <= max.
  // Saves bandwidth and keeps gpt-4o-mini's vision call fast — the model
  // doesn't get more accurate above ~1500px on this kind of task.
  function resizeImageToDataUrl(file, max) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          const ratio = img.width > img.height ? max / img.width : max / img.height
          const scale = ratio < 1 ? ratio : 1
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement("canvas")
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext("2d")
          if (!ctx) throw new Error("no 2d context")
          ctx.drawImage(img, 0, 0, w, h)
          // JPEG at 0.85 keeps most of the visual signal at ~1/4 the
          // size of a PNG — fine for "what does this look like" calls.
          const out = canvas.toDataURL("image/jpeg", 0.85)
          URL.revokeObjectURL(url)
          resolve(out)
        } catch (err) {
          URL.revokeObjectURL(url)
          reject(err)
        }
      }
      img.onerror = (err) => {
        URL.revokeObjectURL(url)
        reject(err)
      }
      img.src = url
    })
  }

  // ── Rank search bar ────────────────────────────────────────────────
  //
  // Each active rank rule mounts one floating search bar at the top of
  // the page. Typing into it updates the rule's in-memory query and
  // triggers a debounced `applyRule(rule)` so siblings re-rank live.
  //
  // We deliberately keep the bar inside the page DOM (not a Shadow
  // DOM) so the styling is straightforward and the user can't lose
  // focus across boundaries. We attach high z-index inline styles so
  // it stays above any sticky page header. If the host page has a
  // top-fixed header, the bar still sits above it because z-index is
  // 2147483646 (one below the v0 toast manager so toasts win).

  /** Strip rank chips + clear inline `order` for a rule. Used when the
   *  search query is empty so the page returns to its native order. */
  function clearRankDecorations(rule) {
    document
      .querySelectorAll(`[data-uwal-rank-chip="${rule.id}"]`)
      .forEach((n) => n.remove())
    document
      .querySelectorAll(`[data-uwal-rank-ordered="${rule.id}"]`)
      .forEach((n) => {
        if (n instanceof HTMLElement) n.style.removeProperty("order")
        n.removeAttribute("data-uwal-rank-ordered")
      })
    // Drop dedup signature so the next apply doesn't think "same as
    // before, skip" and refuses to re-rank when the query reappears.
    rankLastSig.delete(rule.id)
    rankLastRunAt.delete(rule.id)
  }

  /** Idempotently insert (or re-show) the floating search bar for a
   *  given rule. The bar is fixed to top center, ~520px wide, with a
   *  rounded pill shape and Apple-style soft shadow. */
  function ensureRankSearchBar(rule) {
    const existing = rankSearchBars.get(rule.id)
    if (existing && existing.wrap.isConnected) {
      // Keep the rule reference fresh in case the rule object was
      // recreated by a `rule:list` round-trip — the input handler
      // closes over `entry.ruleRef`, not the original rule arg.
      existing.ruleRef = rule
      return
    }

    const wrap = document.createElement("div")
    wrap.setAttribute("data-uwal-rank-bar", rule.id)
    wrap.style.cssText = [
      "position: fixed",
      "top: 12px",
      "left: 50%",
      "transform: translateX(-50%)",
      "z-index: 2147483646",
      "display: flex",
      "align-items: center",
      "gap: 10px",
      "padding: 10px 14px",
      "min-width: 480px",
      "max-width: min(720px, 92vw)",
      "background: #fff",
      "color: #1d1d1f",
      "border: 1px solid rgba(0,0,0,0.1)",
      "border-radius: 14px",
      "box-shadow: 0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
      'font: 400 13px/1.4 -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Roboto, sans-serif',
      "pointer-events: auto",
    ].join(";")

    // Magnifying-glass glyph (inline SVG so it survives even if the
    // page CSS strips icon fonts). Same stroke palette as the toolbar.
    wrap.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
      </svg>
      <input
        type="text"
        autocomplete="off"
        placeholder="Search this page semantically — try lightweight, breathable, blue, under $80"
        style="flex:1; border:none; outline:none; background:transparent; font:inherit; color:#1d1d1f; min-width:0;"
      />
      <span data-role="status" style="font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color:#86868b; white-space:nowrap;"></span>
      <button data-role="close" type="button" aria-label="Disable ranking" style="background:none; border:none; cursor:pointer; width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#86868b; font-size:18px; line-height:1;">×</button>
    `
    document.body.appendChild(wrap)

    const input = wrap.querySelector("input")
    const status = wrap.querySelector('[data-role="status"]')
    const closeBtn = wrap.querySelector('[data-role="close"]')

    // Auto-focus on first mount so the user can start typing right
    // after clicking Rank in the toolbar — no extra click required.
    setTimeout(() => input.focus(), 0)

    const entry = { wrap, input, status, ruleRef: rule, debounceId: 0 }
    rankSearchBars.set(rule.id, entry)

    // Live re-rank: 350ms debounce so we don't fire an embedding round-
    // trip on every keystroke. Each input event also clears the rate-
    // limit + dedup signature so the apply pass actually re-runs (the
    // 2s rate limit is for observer churn, not for user-driven typing).
    input.addEventListener("input", () => {
      clearTimeout(entry.debounceId)
      entry.debounceId = setTimeout(() => {
        const q = input.value.trim()
        rankLastRunAt.delete(entry.ruleRef.id)
        rankLastSig.delete(entry.ruleRef.id)
        // Mirror the live query onto the rule object so applyRankRule
        // (which still reads `rule.config.query` in legacy paths) sees
        // the same value it'd get from `bar.input.value`.
        if (entry.ruleRef.config) entry.ruleRef.config.query = q
        else entry.ruleRef.config = { query: q }
        if (status) status.textContent = q ? "Ranking…" : ""
        applyRule(entry.ruleRef)
      }, 350)
    })

    // Esc clears the input → reverts to native order.
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && input.value) {
        input.value = ""
        input.dispatchEvent(new Event("input", { bubbles: true }))
      }
    })

    // Close button: removes the rule entirely (server + local), which
    // in turn causes `syncRankSearchBars` to tear this bar down on the
    // next pass. We don't hide the bar here — letting the GC pass own
    // teardown keeps a single source of truth (the active rules list).
    closeBtn.addEventListener("click", async () => {
      try {
        await sendMessage({ type: "rule:delete", id: entry.ruleRef.id })
      } catch (e) {
        console.log("[v0] rank: rule:delete failed", e?.message || e)
      }
      activeRules = activeRules.filter((r) => r.id !== entry.ruleRef.id)
      clearRankDecorations(entry.ruleRef)
      syncRankSearchBars()
    })
  }

  /** Remove any rank bars whose rule is no longer in `activeRules`.
   *  Called from `applyAllRulesOnce` so deleting a rank rule (in the
   *  dashboard, via Esc, or via the bar's × button) cleans up the
   *  bar on the next apply tick. */
  function syncRankSearchBars() {
    const liveIds = new Set(activeRules.filter((r) => r.kind === "rank").map((r) => r.id))
    for (const [ruleId, entry] of rankSearchBars) {
      if (!liveIds.has(ruleId)) {
        try { entry.wrap.remove() } catch {}
        rankSearchBars.delete(ruleId)
      }
    }
  }

  async function applyRankRule(rule, els) {
    if (els.length === 0) return

    // Mount/refresh the floating search bar BEFORE any early returns
    // below. The bar must appear even when the user hasn't typed yet —
    // otherwise the rule would silently exist with no UI to control it.
    // `ensureRankSearchBar` is idempotent: if the bar is already in the
    // DOM and bound to this rule, it's a no-op.
    ensureRankSearchBar(rule)

    // Pull the live query off the bar's input rather than from the
    // (persisted) rule config. The input is the source of truth for
    // per-page search state — the rule on disk just records "ranking
    // is enabled for this selector". This way reload starts fresh.
    const bar = rankSearchBars.get(rule.id)
    const query = (bar && bar.input.value.trim()) || (rule.config && rule.config.query) || ""
    if (!query) {
      // No query yet — clear any leftover chips/order from a previous
      // session so the page looks "clean" until the user types.
      clearRankDecorations(rule)
      return
    }

    // ── Guard 1: per-rule rate limit ────────────────────���────────────
    // The observer + 30s SPA-retry timer can hit `applyAllRulesOnce`
    // dozens of times per second on a busy React page. There's no real
    // value in re-running the rank logic that often: scores are cached
    // and DOM order rarely changes. Cap to one full pass every 2s.
    const now = Date.now()
    const lastRun = rankLastRunAt.get(rule.id) || 0
    if (now - lastRun < 2000) {
      return
    }

    // Score chip helper.
    //
    // Bumped to v2: refined modern-minimal design, per Linear/Vercel
    // styling. The chip is a small two-row pill — rank number on top
    // (mono font), score percent on the bottom. Top 3 get a subtle
    // gold/amber accent (a thin top-bar), the rest are neutral
    // translucent black with backdrop-blur so it never visually
    // competes with product imagery underneath. Bumping the version
    // ensures stale v1 chips left over from the previous design get
    // replaced on the next observer tick.
    const RANK_DECO_VERSION = "2"

    function setRankChip(el, score, rankIndex) {
      const host = pickDecorationHost(el)
      const existing = host.querySelector(
        `:scope > [data-uwal-rank-chip="${rule.id}"]`,
      )
      if (existing) existing.remove()
      const cs = getComputedStyle(host)
      if (cs.position === "static") {
        host.style.setProperty("position", "relative", "important")
      }
      if (
        cs.overflow === "hidden" ||
        cs.overflowY === "hidden" ||
        cs.overflowX === "hidden"
      ) {
        host.style.setProperty("overflow", "visible", "important")
      }

      // Tier-driven styling. Top 3 → amber accent, rest → neutral.
      // We apply the tier color to a 2px top-bar inside the chip
      // rather than the whole background so the product image still
      // shows through the translucent backdrop, keeping the chip
      // subordinate to the actual content.
      const isTopTier = rankIndex < 3
      const accentColor = isTopTier ? "#f59e0b" : "rgba(255,255,255,0.25)"

      const chip = document.createElement("div")
      chip.setAttribute("data-uwal-rank-chip", rule.id)
      chip.setAttribute("data-uwal-v", RANK_DECO_VERSION)
      chip.innerHTML = `
        <span style="display:block; height:2px; background:${accentColor}; margin:-7px -9px 5px;"></span>
        <span style="display:block; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.04em; color: rgba(255,255,255,0.65);">#${rankIndex + 1}</span>
        <span style="display:block; font: 600 11px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; color: #fff; margin-top: 2px; letter-spacing: -0.02em;">${(score * 100).toFixed(0)}%</span>
      `
      forceStyle(chip, {
        position: "absolute",
        top: "8px",
        left: "8px",
        right: "auto",
        bottom: "auto",
        background: "rgba(10, 10, 10, 0.85)",
        "backdrop-filter": "blur(8px) saturate(1.2)",
        "-webkit-backdrop-filter": "blur(8px) saturate(1.2)",
        color: "#fff",
        padding: "7px 9px",
        margin: "0",
        border: "1px solid rgba(255,255,255,0.08)",
        "border-radius": "6px",
        "z-index": "999998",
        "pointer-events": "none",
        "white-space": "nowrap",
        display: "inline-block",
        visibility: "visible",
        opacity: "1",
        width: "auto",
        height: "auto",
        "text-indent": "0",
        "box-shadow": "0 4px 12px rgba(0,0,0,0.18)",
        "text-align": "center",
        "min-width": "36px",
      })
      host.appendChild(chip)
    }

    // Read cached scores up front (text+query keyed) so we don't refetch
    // on every observer tick.
    const cache = loadRankCache(rule.id)
    const fragments = []
    const hashes = []
    const needIdxs = []
    const queryHashPart = fragHash(query)
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      const text = (el.innerText || el.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 1500)
      if (!text) {
        hashes[i] = null
        fragments[i] = ""
        continue
      }
      const h = `${queryHashPart}::${fragHash(text)}`
      hashes[i] = h
      fragments[i] = text
      if (!cache.has(h)) needIdxs.push(i)
    }

    if (needIdxs.length > 0) {
      // De-dupe in-flight fetches.
      if (rankInflight.has(rule.id)) {
        try { await rankInflight.get(rule.id) } catch {}
      }
      const work = (async () => {
        try {
          const res = await sendMessageWithTimeout(
            {
              type: "rank",
              payload: {
                query,
                fragments: needIdxs.map((i) => fragments[i]),
              },
            },
            40_000,
            "rank",
          )
          if (!res?.ok || !Array.isArray(res.data?.results)) {
            console.log("[v0] rank rule failed:", res?.error)
            return
          }
          // The Ranked / Model / Items / Rule status popover that used
          // to mount here was redundant once Rank became a live search:
          // the floating search bar already shows match count and the
          // browser console logs the model + AI flag below. Keeping
          // the bar as the single visible affordance keeps the page
          // free of layered debug overlays.
          console.log(
            `[v0] rank: model=${res.data?.model || "?"} ai=${res.data?.ai} items=${needIdxs.length}`,
          )
          const out = res.data.results
          for (let i = 0; i < needIdxs.length; i++) {
            const idx = needIdxs[i]
            const score = typeof out[i]?.score === "number" ? out[i].score : 0
            cache.set(hashes[idx], score)
          }
          saveRankCache(rule.id, cache)
        } catch (err) {
          console.log("[v0] rank rule threw:", err && err.message)
          toast(`Rank failed: ${(err && err.message) || "unknown error"}`, "error")
        } finally {
          rankInflight.delete(rule.id)
        }
      })()
      rankInflight.set(rule.id, work)
      await work
    }

    // ── Build "reorder unit" entries ─────────────────────────────────
    //
    // The naive approach — group by `host.parentElement` — fails on the
    // very common pattern where every card lives in its OWN per-card
    // wrapper (`<li>`, `<article>`, or React-component-specific div).
    // In that case each card's parent is unique, every group has one
    // entry, and no sorting ever happens. The user's symptom — correct
    // scores, no visible reordering — is exactly that.
    //
    // Real fix: find the LOWEST COMMON ANCESTOR (LCA) of all matched
    // elements, and group entries by that LCA. The "reorder unit" for
    // each entry is the LCA's direct child that CONTAINS the matched
    // element — not the matched element itself. That way:
    //   - Cards in unique per-card wrappers are reorderable, because
    //     the wrapper is the LCA's direct child and it's what we move.
    //   - Cards that ARE the LCA's direct children (the simple case)
    //     still work — `unit === host`.
    //   - Multiple disjoint grids on the same page each get their own
    //     LCA via grid-membership matching (fall back to per-parent
    //     grouping when the LCA is suspicious).
    //
    // `originalIdx` is the entry's position within `els` (DOM order)
    // and serves as the tiebreaker when two entries share the same
    // score, so ties never shuffle randomly between observer ticks.

    // First pass: build a flat list of valid entries, defaulting any
    // missing scores to 0 so the item lands at the bottom rather than
    // getting dropped from the sort entirely.
    const entries = []
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      const host = pickDecorationHost(el)
      if (!host || !host.isConnected || hashes[i] == null) continue
      const cached = cache.get(hashes[i])
      const score = typeof cached === "number" ? cached : 0
      entries.push({ el, host, score, hash: hashes[i], originalIdx: i })
    }
    if (entries.length === 0) return

    // Find the LCA of all hosts. Walks ancestors of the first host into
    // a Set, then walks each subsequent host upward until it lands on
    // a node in that set — the first hit is the running LCA. We then
    // trim the ancestor list to start at the LCA so subsequent hosts
    // can only narrow it further (never widen).
    function lowestCommonAncestor(nodes) {
      if (nodes.length === 0) return null
      if (nodes.length === 1) return nodes[0].parentElement
      // Ancestors of nodes[0], ordered from immediate parent up to <html>.
      let chain = []
      for (let n = nodes[0].parentElement; n; n = n.parentElement) chain.push(n)
      const setOf = (arr) => new Set(arr)
      let chainSet = setOf(chain)
      for (let i = 1; i < nodes.length; i++) {
        let cur = nodes[i].parentElement
        while (cur && !chainSet.has(cur)) cur = cur.parentElement
        if (!cur) return null
        // Trim chain so it starts at `cur` (the new LCA candidate).
        const idx = chain.indexOf(cur)
        chain = chain.slice(idx)
        chainSet = setOf(chain)
        if (chain.length === 0) return null
      }
      return chain[0] || null
    }

    // Returns the direct child of `container` that contains
    // `descendant`, or null if `descendant` isn't inside `container`.
    // This is the actual node we'll move during reordering.
    function reorderUnitWithin(container, descendant) {
      let n = descendant
      while (n && n.parentElement !== container) n = n.parentElement
      return n // null when descendant is not under container
    }

    const lca = lowestCommonAncestor(entries.map((e) => e.host))

    // Build the (container → [entries-with-unit]) map.
    const groups = new Map()
    if (lca && lca !== document.documentElement && lca !== document.body) {
      // Good case: a real grid wrapper. Use it as the single group key
      // so all entries reorder against each other inside it.
      const arr = []
      for (const entry of entries) {
        const unit = reorderUnitWithin(lca, entry.host)
        if (!unit) continue
        arr.push({ ...entry, unit })
      }
      if (arr.length > 0) groups.set(lca, arr)
    } else {
      // Fallback: no useful LCA (e.g. matches span <body> directly, or
      // are scattered across truly disjoint regions). Fall back to the
      // old per-parent grouping — better to reorder partially than not
      // at all. Each entry's `unit` is its host in this branch.
      for (const entry of entries) {
        const parent = entry.host.parentElement
        if (!parent) continue
        let arr = groups.get(parent)
        if (!arr) {
          arr = []
          groups.set(parent, arr)
        }
        arr.push({ ...entry, unit: entry.host })
      }
    }
    if (groups.size === 0) return

    // ── Guard 2: skip when DOM is already in score order ─────────────
    //
    // This is THE fix for Nike's infinite shuffle. Once we've reordered
    // a grid by score, every subsequent invocation should be a no-op
    // (no appendChild, no mutation, no observer trigger). We compute
    // a fingerprint = "host1:score1|host2:score2|..." over the desired
    // sorted order and compare against the previous fingerprint AND
    // against the live DOM order. If both match, return early.
    const desiredOrder = []
    for (const [, arr] of groups) {
      // Strict descending sort by score, stable on ties via the
      // original DOM index. Without the tiebreaker, equal-scored items
      // can swap positions between ticks because cosine similarity
      // values are floats and comparison via `b.score - a.score` can
      // return -0 for ties, which some engines treat oddly. Forcing a
      // secondary key makes the result fully deterministic.
      arr.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.originalIdx - b.originalIdx
      })
      for (const entry of arr) desiredOrder.push(entry)
    }
    const sig = desiredOrder
      .map((e) => `${e.hash}:${e.score.toFixed(3)}`)
      .join("|")
    if (rankLastSig.get(rule.id) === sig) {
      // Verify the DOM still reflects that order (in case React tore
      // it down and re-rendered). If yes, nothing to do. We check
      // `entry.unit` — the LCA's direct child that contains the host —
      // because that's the actual node we move during reorder.
      let domStable = true
      for (const [container, arr] of groups) {
        let lastIdx = -1
        for (const entry of arr) {
          const idx = Array.prototype.indexOf.call(container.children, entry.unit)
          if (idx === -1 || idx <= lastIdx) {
            domStable = false
            break
          }
          lastIdx = idx
        }
        if (!domStable) break
      }
      if (domStable) {
        rankLastRunAt.set(rule.id, now)
        return
      }
    }

    // ── Guard 3: self-mutation suppression ─���─────────────────────────
    // Set a 800ms window during which our debounced observer ignores
    // childList mutations on document.body. That's plenty of time for
    // the appendChild loop below to complete and for React to NOT
    // immediately undo it (if React reconciles within 800ms, that's
    // a separate fight we lose anyway and the rate-limit guard above
    // prevents it from cascading).
    window.__uwalSuppressObserverUntil = now + 800

    // ── The actual reorder ───────────────────────────────────────────
    //
    // Two-layer strategy because DOM order alone is not enough on
    // modern SPAs:
    //
    //   (1) CSS `order` (with !important) — for flex/grid containers,
    //       this is the visual authority. It survives React rerenders
    //       because React rarely strips inline styles it didn't write,
    //       and it can't be defeated by host stylesheets we don't know
    //       about. We assign a numeric `order` to every direct child
    //       of the container so unmatched siblings keep their
    //       relative position around the matched block. Skipped for
    //       non-flex/grid containers (where `order` is a no-op).
    //
    //   (2) DOM move via `insertBefore` — same anchor-based approach
    //       as before, kept so non-flex/grid containers, screen
    //       readers, copy-paste, and Tab-key focus order all see the
    //       desired sequence too.
    //
    //   (3) Per-container MutationObserver — the third leg. Even with
    //       both layers above, React can re-render the container and
    //       blow away our DOM order (and sometimes inline styles,
    //       when the JSX explicitly sets `style={{...}}`). We install
    //       a short-running observer on each container that re-applies
    //       the order whenever its children change. A 250ms
    //       per-container suppression flag prevents the observer from
    //       firing on our own writes.
    function applyOrderToContainer(container, arr) {
      // Suppress per-container observer for our own mutation echo.
      rankSuppressUntil.set(container, Date.now() + 250)

      const scores = arr.map((a) => a.score)
      const minS = Math.min(...scores)
      const maxS = Math.max(...scores)
      const allEqual = maxS - minS < 1e-6 && arr.length > 1

      // Detect whether CSS `order` will actually do anything.
      const cs = getComputedStyle(container)
      const supportsOrder =
        cs.display.includes("flex") || cs.display.includes("grid")

      // Snapshot live children ONCE per pass — moving nodes around
      // mutates `container.children` live, so we'd otherwise read
      // stale indexes.
      const liveChildren = Array.from(container.children)
      const matchedSet = new Set(arr.map((e) => e.unit))

      // Earliest DOM index of any matched unit. The matched block
      // will live at [anchorIdx ... anchorIdx + arr.length - 1].
      let anchorIdx = liveChildren.length
      for (let i = 0; i < liveChildren.length; i++) {
        if (matchedSet.has(liveChildren[i])) {
          anchorIdx = i
          break
        }
      }

      // Build the desired final-order list of ALL children:
      //   [pre-anchor unmatched]  +  [matched in score order]  +  [post-anchor unmatched]
      // This preserves the visual position of unmatched siblings
      // (sponsored slots, category cards, etc.) and only rearranges
      // among matched ones — exactly the user's request.
      const preUnmatched = []
      const postUnmatched = []
      for (let i = 0; i < liveChildren.length; i++) {
        const c = liveChildren[i]
        if (matchedSet.has(c)) continue
        if (i < anchorIdx) preUnmatched.push(c)
        else postUnmatched.push(c)
      }
      const desiredChildren = allEqual
        ? liveChildren.slice() // chip-only, don't shuffle
        : [...preUnmatched, ...arr.map((e) => e.unit), ...postUnmatched]

      // Layer 1: inline `order` so flex/grid renders in the desired
      // sequence regardless of DOM order. !important to survive any
      // host CSS that also sets `order` (Amazon, eBay sponsored slots).
      // Step of 10 leaves room for later inserts without re-shuffling.
      if (supportsOrder) {
        for (let i = 0; i < desiredChildren.length; i++) {
          const child = desiredChildren[i]
          if (!(child instanceof HTMLElement)) continue
          child.setAttribute("data-uwal-rank-ordered", rule.id)
          child.style.setProperty("order", String(i * 10), "important")
        }
      }

      // Layer 2: DOM move (skipped when all-equal — saves churn).
      if (!allEqual) {
        for (let i = 0; i < arr.length; i++) {
          const entry = arr[i]
          const target = container.children[anchorIdx + i] || null
          if (target !== entry.unit) {
            container.insertBefore(entry.unit, target)
          }
        }
      }

      // Score chips on the matched units.
      arr.forEach((entry, idx) => setRankChip(entry.el, entry.score, idx))
    }

    // Layer 3: per-(rule, container) MutationObserver. Re-applies the
    // order whenever React rerenders the container.
    function ensureContainerObserver(container, arr) {
      let perRule = rankContainerObservers.get(rule.id)
      if (!perRule) {
        perRule = new Map()
        rankContainerObservers.set(rule.id, perRule)
      }
      // Always update the observed `arr` so a freshly-detected match
      // joins the pool — but install the observer only once.
      if (perRule.has(container)) {
        perRule.get(container)._uwalArr = arr
        return
      }
      const obs = new MutationObserver(() => {
        const until = rankSuppressUntil.get(container) || 0
        if (Date.now() < until) return
        if (!container.isConnected) {
          obs.disconnect()
          perRule.delete(container)
          return
        }
        // Filter to units that are still under this container.
        const liveArr = (obs._uwalArr || arr).filter(
          (e) => e.unit.parentElement === container,
        )
        if (liveArr.length === 0) {
          obs.disconnect()
          perRule.delete(container)
          return
        }
        applyOrderToContainer(container, liveArr)
      })
      obs._uwalArr = arr
      obs.observe(container, { childList: true })
      perRule.set(container, obs)
    }

    for (const [container, arr] of groups) {
      applyOrderToContainer(container, arr)
      ensureContainerObserver(container, arr)
    }

    rankLastSig.set(rule.id, sig)
    rankLastRunAt.set(rule.id, now)

    let applied = rankApplied.get(rule.id)
    if (!applied) {
      applied = new Set()
      rankApplied.set(rule.id, applied)
    }
    for (let i = 0; i < els.length; i++) if (hashes[i] != null) applied.add(hashes[i])

    // Update the floating bar's status pill: show "N matches" so the
    // user gets a quick read on how much was actually re-ranked. Empty
    // string when the rule has no bar (e.g. saved-rule auto-apply
    // before the bar was mounted).
    const __bar = rankSearchBars.get(rule.id)
    if (__bar && __bar.status) {
      __bar.status.textContent = `${els.length} matches`
    }

    // Sanity check — log the score sequence in the order the user will
    // see on screen. If this isn't strictly non-increasing, something
    // upstream broke the invariant and we want it visible in the
    // console rather than only in the rendered grid.
    const debugScores = desiredOrder.map((e) => e.score.toFixed(3)).join(", ")
    console.log(
      `[v0] rank: rule ${rule.id} applied — ${desiredOrder.length} item(s), order [${debugScores}]`,
    )
  }

  // ---------------------------------------------------------------------
  // Per-element decoration toolbar.
  //
  // Save / Translate / Summarize all want a small pill button anchored
  // to the top-right of the matched element. Previously each rule
  // hard-coded its own `right: Npx` offset, which broke the moment any
  // label was wider than the preset slot (e.g. "Translate · Portuguese"
  // pushed past the Save pill). This helper creates a single shared
  // flex container the first time any rule needs it; every subsequent
  // pill is appended to that container, so flexbox handles the layout
  // and pills can never overlap regardless of count or label width.
  // ---------------------------------------------------------------------
  // Force a CSS rule with !important so host-site stylesheets can't
  // override it. Using setProperty(name, value, "important") is the only
  // way to programmatically set the !important flag — passing it as part
  // of cssText silently drops it on most browsers.
  function forceStyle(node, rules) {
    for (const [k, v] of Object.entries(rules)) {
      node.style.setProperty(k, v, "important")
    }
  }

  // Resolve the actual element we should inject decorations into.
  //
  // E-commerce sites (Nike, Adidas, ASOS, many Shopify themes) ship a
  // transparent "link overlay" anchor that covers the entire card to
  // make the whole tile clickable. It carries the accessible product
  // name as its text but visually hides it via `text-indent: -9999px`,
  // `font-size: 0`, `visibility: hidden`, etc — and any child we inject
  // inherits that hiding, so badges appear in the DOM but never paint.
  // When we detect this pattern we walk up to the overlay's offsetParent
  // (the real product card container) so the badge actually shows up.
  function pickDecorationHost(el) {
    if (!el || !(el instanceof HTMLElement)) return el
    let cs
    try {
      cs = getComputedStyle(el)
    } catch {
      return el
    }
    const cls =
      (el.getAttribute("class") || "") + " " + (el.getAttribute("data-testid") || "")
    const looksLikeLinkOverlay =
      el.tagName === "A" &&
      (cs.position === "absolute" || cs.position === "fixed") &&
      (parseFloat(cs.textIndent) < -100 ||
        cs.fontSize === "0px" ||
        cs.visibility === "hidden" ||
        // Class / testid hints (Nike "product-card__link-overlay",
        // Shopify "card__link", Tailwind UI "stretched-link"):
        /\b(link[-_]overlay|stretched[-_]link|card__link|overlay[-_]link)\b/i.test(cls))
    if (looksLikeLinkOverlay) {
      // offsetParent is the nearest positioned ancestor (the product
      // card container for Nike). Fall back to parentElement if
      // offsetParent is null (e.g. element is mid-frame display:none).
      return el.offsetParent || el.parentElement || el
    }
    return el
  }

  function getOrCreateUwalToolbar(el) {
    let toolbar = el.querySelector(":scope > [data-uwal-toolbar]")
    if (toolbar) return toolbar
    // Same overflow / position fix as the badge branch — without these,
    // Nike-style product cards either anchor the toolbar to the viewport
    // (when position is static) or clip it entirely (when overflow is
    // hidden), and the user sees nothing.
    const cs = getComputedStyle(el)
    if (cs.position === "static") {
      el.style.setProperty("position", "relative", "important")
    }
    if (
      cs.overflow === "hidden" ||
      cs.overflowY === "hidden" ||
      cs.overflowX === "hidden"
    ) {
      el.style.setProperty("overflow", "visible", "important")
    }
    toolbar = document.createElement("div")
    toolbar.setAttribute("data-uwal-toolbar", "1")
    // Tag the toolbar with the current decoration version so a stale
    // toolbar from an older content script is replaced on next tick.
    toolbar.setAttribute("data-uwal-v", "9")
    // Vertical column at the top-right corner. Stacking each pill on
    // its own line completely sidesteps width-overlap problems regardless
    // of how long any individual label gets, and looks cleaner than the
    // wrapping row we tried before. Every property carries !important
    // because LinkedIn / X / Reddit all set their own `display` and
    // `position` rules on post containers and would otherwise stomp ours.
    forceStyle(toolbar, {
      position: "absolute",
      top: "8px",
      right: "8px",
      "z-index": "999999",
      display: "flex",
      "flex-direction": "column",
      "align-items": "flex-end",
      gap: "6px",
      // Toolbar gap is click-through; pills opt back into pointer-events.
      "pointer-events": "none",
      margin: "0",
      padding: "0",
      // Don't let the toolbar inherit any text-transform / line-height
      // from a parent like LinkedIn's `.feed-shared-update-v2`.
      "text-transform": "none",
      "line-height": "1",
    })
    el.appendChild(toolbar)
    return toolbar
  }

  // Shared visual style for every toolbar pill. Each rule overrides the
  // `background` and `border` color so users can still tell them apart
  // at a glance, while padding / radius / typography stay consistent.
  // All properties are forced with !important so host-site CSS can't
  // override them.
  function applyDecorationPillStyles(node, { background, border }) {
    forceStyle(node, {
      // Position is `relative` so flexbox in the toolbar parent lays it
      // out — never `absolute`, which is what was causing the overlap
      // before. We also reset every offset so site CSS can't pull the
      // pill out of the flex flow.
      position: "relative",
      display: "inline-block",
      background,
      color: "#fff",
      border,
      "border-radius": "999px",
      padding: "4px 10px",
      margin: "0",
      font: "600 11px/1.2 -apple-system, BlinkMacSystemFont, sans-serif",
      "letter-spacing": "0.02em",
      "text-transform": "none",
      "text-align": "center",
      cursor: "pointer",
      "box-shadow": "0 1px 2px rgba(0,0,0,0.15)",
      "white-space": "nowrap",
      "pointer-events": "auto",
      // Pin to content width — sites often default `width: 100%` on
      // flex children, which would blow each pill out to the full
      // toolbar width and stack them on top of each other again.
      width: "auto",
      "min-width": "0",
      "max-width": "100%",
      float: "none",
      top: "auto",
      left: "auto",
      right: "auto",
      bottom: "auto",
    })
  }

  function decorate(el, rule) {
    if (!(el instanceof HTMLElement)) return
    const tag = `uwal-rule-${rule.id}`
    const tagKey = tag.replace(/-/g, "")
    // For decorations that need a visible host (badge / save button /
    // translate / summarize / note), resolve the actual injection
    // target now. On Nike-style sites where the matched element is a
    // hidden link overlay, this walks up to the real product card.
    const wantsHost =
      rule.kind === "badge" ||
      rule.kind === "save_button" ||
      rule.kind === "translate" ||
      rule.kind === "summarize" ||
      rule.kind === "note" ||
      rule.kind === "compare" ||
      rule.kind === "grammar_check"
    const host = wantsHost ? pickDecorationHost(el) : el
    // React/Vue/SPA frameworks routinely diff their virtual DOM and
    // remove our injected decoration children. The previous logic set
    // a dataset flag once and never re-decorated, so a re-render on
    // sites like Nike, Amazon, or LinkedIn would silently strip the
    // badge/button forever. Now we verify the decoration node is still
    // attached (looking on `host`, not `el`, since that's where we
    // actually injected). If it isn't, clear the flag and re-run.
    // Bump this whenever we change the decoration injection logic so
    // that decorations created by an older content script (which the
    // SPA still has injected from a previous tab/load) are treated as
    // stale and re-injected with the current rendering rules.
    const DECO_VERSION = "9"
    if (el.dataset[tagKey] === DECO_VERSION) {
      const stillAttached = host.querySelector(
        `:scope > [data-uwal-decoration="${rule.id}"][data-uwal-v="${DECO_VERSION}"], ` +
          `:scope > [data-uwal-toolbar][data-uwal-v="${DECO_VERSION}"]`,
      )
      if (stillAttached || rule.kind === "hide" || rule.kind === "outline") {
        // hide/outline are inline-style mutations on `el` itself, no
        // injected child to verify — we can safely skip.
        if (rule.kind === "hide" && el.style.display !== "none") {
          el.style.setProperty("display", "none", "important")
        }
        return
      }
      // Decoration was stripped by host framework, or it's stale from
      // an older content script. Either way, fall through and re-inject.
      delete el.dataset[tagKey]
      // Strip any stale decoration nodes we previously injected so we
      // don't end up with two badges layered on top of each other.
      try {
        host
          .querySelectorAll(
            `:scope > [data-uwal-decoration="${rule.id}"], :scope > [data-uwal-toolbar]`,
          )
          .forEach((n) => n.remove())
      } catch {}
    }
    el.dataset[tagKey] = DECO_VERSION

    if (rule.kind === "hide") {
      el.style.setProperty("display", "none", "important")
      return
    }
    if (rule.kind === "outline") {
      const color = (rule.config && rule.config.color) || "#2563eb"
      el.style.setProperty("outline", `2px solid ${color}`, "important")
      el.style.setProperty("outline-offset", "2px", "important")
      return
    }
    if (rule.kind === "badge") {
      const label = (rule.config && rule.config.label) || "UWAL"
      // Apply position / overflow fixes to the resolved HOST (not the
      // matched element), because that's where the badge will be
      // positioned against. On Nike-style overlay matches `host` is
      // the real product card; on plain matches `host === el`.
      const cs = getComputedStyle(host)
      if (cs.position === "static") {
        host.style.setProperty("position", "relative", "important")
      }
      if (
        cs.overflow === "hidden" ||
        cs.overflowY === "hidden" ||
        cs.overflowX === "hidden"
      ) {
        host.style.setProperty("overflow", "visible", "important")
      }

      const badge = document.createElement("div")
      badge.textContent = label
      badge.setAttribute("data-uwal-decoration", rule.id)
      badge.setAttribute("data-uwal-v", DECO_VERSION)
      // Force every property with !important so host stylesheets can't
      // strip our positioning. Without this, Nike's `* { ... }` and
      // wide `div { ... }` rules silently neutralize the badge.
      forceStyle(badge, {
        position: "absolute",
        top: "6px",
        right: "6px",
        left: "auto",
        bottom: "auto",
        background: "#111",
        color: "#fff",
        font: "600 10px/1.2 -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "3px 8px",
        margin: "0",
        border: "0",
        "border-radius": "999px",
        "z-index": "999999",
        "pointer-events": "none",
        "letter-spacing": "0.02em",
        "text-transform": "none",
        "white-space": "nowrap",
        // Avoid `display: none` from host CSS rules like
        // `.product-card__link-overlay > * { display: none }`.
        display: "inline-block",
        visibility: "visible",
        opacity: "1",
        width: "auto",
        height: "auto",
        "box-shadow": "0 1px 2px rgba(0,0,0,0.25)",
        "text-indent": "0",
      })
      host.appendChild(badge)
      return
    }
    if (rule.kind === "note") {
      const text = (rule.config && rule.config.text) || ""
      const cs = getComputedStyle(host)
      if (cs.position === "static") {
        host.style.setProperty("position", "relative", "important")
      }
      const note = document.createElement("div")
      note.textContent = text
      note.setAttribute("data-uwal-decoration", rule.id)
      note.setAttribute("data-uwal-v", DECO_VERSION)
      forceStyle(note, {
        background: "#fef3c7",
        color: "#92400e",
        "border-left": "3px solid #f59e0b",
        padding: "6px 10px",
        margin: "6px 0",
        font: "500 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif",
        "border-radius": "4px",
        display: "block",
        visibility: "visible",
        opacity: "1",
        "text-indent": "0",
      })
      host.prepend(note)
      return
    }
    if (rule.kind === "save_button") {
      const cs = getComputedStyle(el)
      if (cs.position === "static") el.style.position = "relative"

      // Avoid duplicate buttons if the rule re-applies on mutation.
      if (el.querySelector(`[data-uwal-decoration="${rule.id}"][data-uwal-kind="save_button"]`)) {
        return
      }

      const label = (rule.config && rule.config.label) || "Save"
      const btn = document.createElement("button")
      btn.type = "button"
      btn.setAttribute("data-uwal-decoration", rule.id)
      btn.setAttribute("data-uwal-kind", "save_button")
      btn.textContent = label
      applyDecorationPillStyles(btn, {
        background: "#111",
        border: "1px solid #333",
      })

      // Stop the host page from also handling the click (LinkedIn/X
      // posts have aggressive delegated handlers that would navigate away).
      const stop = (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        ev.stopImmediatePropagation?.()
      }
      btn.addEventListener("mousedown", stop, true)
      btn.addEventListener("mouseup", stop, true)
      btn.addEventListener("click", async (ev) => {
        stop(ev)
        const original = btn.textContent
        btn.disabled = true
        btn.textContent = "Saving..."
        try {
          const payload = buildObject(el, { kind: "single" })
          const res = await enrichAndSave(payload, el)
          if (res?.ok) {
            btn.textContent = "Saved"
            btn.style.background = "#16a34a"
            setTimeout(() => {
              btn.textContent = original
              btn.style.background = "#111"
              btn.disabled = false
            }, 1500)
          } else {
            btn.textContent = "Failed"
            btn.style.background = "#dc2626"
            setTimeout(() => {
              btn.textContent = original
              btn.style.background = "#111"
              btn.disabled = false
            }, 2000)
          }
        } catch (err) {
          console.log("[v0] save_button error", err)
          btn.textContent = "Failed"
          btn.style.background = "#dc2626"
          setTimeout(() => {
            btn.textContent = original
            btn.style.background = "#111"
            btn.disabled = false
          }, 2000)
        }
      })

      getOrCreateUwalToolbar(host).appendChild(btn)
      return
    }

    if (rule.kind === "summarize") {
      // Always-on Summarize pill button injected into every match.
      // Click → call /api/v1/summarize with the element's text → show
      // an inline popover with the summary. Stateless: no object id is
      // required, the post does not need to be saved first.
      const cs = getComputedStyle(el)
      if (cs.position === "static") el.style.position = "relative"

      // Avoid duplicate buttons if the rule re-applies on mutation.
      if (el.querySelector(`[data-uwal-decoration="${rule.id}"][data-uwal-kind="summarize"]`)) {
        return
      }

      const label = (rule.config && rule.config.label) || "Summarize"
      const btn = document.createElement("button")
      btn.type = "button"
      btn.setAttribute("data-uwal-decoration", rule.id)
      btn.setAttribute("data-uwal-kind", "summarize")
      btn.textContent = label
      applyDecorationPillStyles(btn, {
        background: "#16a34a",
        border: "1px solid #15803d",
      })

      // LinkedIn / X delegate clicks at the post root, so swallow events
      // before they bubble or the page will navigate away.
      const stop = (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        ev.stopImmediatePropagation?.()
      }
      btn.addEventListener("mousedown", stop, true)
      btn.addEventListener("mouseup", stop, true)

      // Cache the latest summary so a second click toggles the popover
      // closed/open without re-fetching from the server.
      let cached = null
      let popover = null

      function closePopover() {
        if (popover && popover.parentNode) popover.parentNode.removeChild(popover)
        popover = null
      }

      function openPopover(text, isHeuristic) {
        closePopover()
        popover = document.createElement("div")
        popover.setAttribute("data-uwal-decoration", rule.id)
        popover.setAttribute("data-uwal-kind", "summarize-popover")
        popover.style.cssText = [
          "position: absolute",
          "top: 40px",
          "right: 8px",
          "max-width: min(420px, calc(100% - 16px))",
          "z-index: 999999",
          "background: #fff",
          "color: #111",
          "border: 1px solid #d4d4d8",
          "border-radius: 10px",
          "padding: 12px 14px 10px 14px",
          "font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif",
          "box-shadow: 0 8px 24px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.08)",
          "white-space: pre-wrap",
        ].join("; ")

        const heading = document.createElement("div")
        heading.style.cssText = [
          "display: flex",
          "align-items: center",
          "justify-content: space-between",
          "gap: 8px",
          "margin-bottom: 6px",
          "font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, sans-serif",
          "text-transform: uppercase",
          "letter-spacing: 0.06em",
          "color: #71717a",
        ].join("; ")
        const title = document.createElement("span")
        title.textContent = isHeuristic ? "Summary (heuristic)" : "Summary"
        const close = document.createElement("button")
        close.type = "button"
        close.textContent = "×"
        close.setAttribute("aria-label", "Close summary")
        close.style.cssText = [
          "appearance: none",
          "background: transparent",
          "border: 0",
          "color: #71717a",
          "font: 600 16px/1 -apple-system, BlinkMacSystemFont, sans-serif",
          "cursor: pointer",
          "padding: 2px 6px",
          "border-radius: 4px",
        ].join("; ")
        close.addEventListener("mousedown", stop, true)
        close.addEventListener("click", (ev) => {
          stop(ev)
          closePopover()
        })
        heading.appendChild(title)
        heading.appendChild(close)

        const body = document.createElement("div")
        body.textContent = text || "(empty summary)"

        popover.appendChild(heading)
        popover.appendChild(body)
        // Stop click bubbling inside the popover so selecting summary
        // text doesn't accidentally trigger the host page.
        popover.addEventListener("click", (ev) => ev.stopPropagation(), true)
        // Anchor the popover to the same toolbar host so it appears on
        // the visible card, not on an invisible Nike-style link overlay.
        host.appendChild(popover)
      }

      btn.addEventListener("click", async (ev) => {
        stop(ev)

        // Toggle off if popover is currently open with a cached summary.
        if (popover) {
          closePopover()
          return
        }
        if (cached) {
          openPopover(cached.summary, cached.isHeuristic)
          return
        }

        const original = btn.textContent
        btn.disabled = true
        btn.textContent = "Summarizing..."

        // Defensive client timeout. Server already aborts at 25s and
        // falls through to the heuristic, but if the service worker is
        // evicted mid-flight we still want to free the button.
        let settled = false
        const timeoutId = setTimeout(() => {
          if (settled) return
          settled = true
          btn.disabled = false
          btn.textContent = original
          toast("Summarize timed out — try again", "error")
        }, 35_000)

        try {
          // Pull a reasonable text payload from the element. We strip
          // the text of any decoration buttons we already injected so
          // the model doesn't summarize "Save Translate Summarize".
          const clone = el.cloneNode(true)
          clone.querySelectorAll("[data-uwal-decoration]").forEach((n) => n.remove())
          const text = (clone.innerText || clone.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 6000)
          const title =
            (el.querySelector("h1, h2, h3, [role=\"heading\"]") &&
              (el.querySelector("h1, h2, h3, [role=\"heading\"]").innerText || "").trim().slice(0, 200)) ||
            ""
          const url = location.href

          const res = await sendMessage({
            type: "summarize_text",
            payload: { text, title, url },
          })
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          btn.disabled = false
          btn.textContent = original

          if (!res || !res.ok) {
            toast((res && res.error) || "Summarize failed", "error")
            return
          }
          const summary = String(res.data?.summary || "").trim()
          const isHeuristic = res.data?.ai === false
          if (!summary) {
            toast("Empty summary returned", "error")
            return
          }
          cached = { summary, isHeuristic }
          if (isHeuristic && res.data?.notice) {
            toast(`Summary (heuristic): ${String(res.data.notice).slice(0, 140)}`, "default")
          }
          openPopover(summary, isHeuristic)
        } catch (err) {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          btn.disabled = false
          btn.textContent = original
          const msg = err && err.message ? err.message : String(err)
          toast(`Summarize failed: ${msg.slice(0, 120)}`, "error")
        }
      })

      getOrCreateUwalToolbar(host).appendChild(btn)
      return
    }

    if (rule.kind === "compare") {
      // Inject a checkbox into the top-LEFT corner of every match (the
      // toolbar lives top-right, so we don't collide). Selecting 2-8
      // checkboxes enables the docked comparison bar at the bottom.
      // Same position/overflow fixups as the toolbar — without them,
      // Nike-style cards either anchor the checkbox to the viewport
      // (position: static parent) or clip it (overflow: hidden parent).
      const cs = getComputedStyle(host)
      if (cs.position === "static") {
        host.style.setProperty("position", "relative", "important")
      }
      if (
        cs.overflow === "hidden" ||
        cs.overflowY === "hidden" ||
        cs.overflowX === "hidden"
      ) {
        host.style.setProperty("overflow", "visible", "important")
      }

      // Avoid duplicates on observer reapplication.
      if (host.querySelector(`:scope > [data-uwal-decoration="${rule.id}"][data-uwal-kind="compare"]`)) {
        return
      }

      // The checkbox is an outer button (so click events stop here and
      // don't navigate the host page) wrapping a styled square that
      // toggles between empty and a checkmark glyph. We use a button +
      // visual square instead of a real <input type="checkbox"> because
      // sites like LinkedIn / Nike inject delegated form-handlers that
      // submit on any change to a checkbox in their card markup.
      const wrap = document.createElement("button")
      wrap.type = "button"
      wrap.setAttribute("data-uwal-decoration", rule.id)
      wrap.setAttribute("data-uwal-v", DECO_VERSION)
      wrap.setAttribute("data-uwal-kind", "compare")
      wrap.setAttribute("aria-label", "Select for comparison")
      wrap.setAttribute("aria-pressed", "false")
      forceStyle(wrap, {
        position: "absolute",
        top: "8px",
        left: "8px",
        right: "auto",
        bottom: "auto",
        "z-index": "999999",
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        width: "26px",
        height: "26px",
        padding: "0",
        margin: "0",
        background: "rgba(255, 255, 255, 0.92)",
        "backdrop-filter": "blur(8px) saturate(1.2)",
        "-webkit-backdrop-filter": "blur(8px) saturate(1.2)",
        border: "1px solid rgba(0, 0, 0, 0.12)",
        "border-radius": "6px",
        "box-shadow": "0 2px 6px rgba(0, 0, 0, 0.08)",
        cursor: "pointer",
        "pointer-events": "auto",
        // Sites set arbitrary line-heights on cards; reset so the inner
        // SVG centers cleanly.
        "line-height": "1",
        "text-indent": "0",
        "text-transform": "none",
        transition: "background 100ms ease, border-color 100ms ease, transform 80ms ease",
      })
      wrap.innerHTML = `
        <span data-uwal-check style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          width:14px;
          height:14px;
          color:#fff;
          opacity:0;
          transition: opacity 100ms ease;
        ">${ICONS.check}</span>
      `

      // Click events on host pages (LinkedIn / X / shopping sites) bubble
      // to delegated handlers that navigate. Swallow aggressively.
      const stop = (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        ev.stopImmediatePropagation?.()
      }
      wrap.addEventListener("mousedown", stop, true)
      wrap.addEventListener("mouseup", stop, true)
      wrap.addEventListener("click", (ev) => {
        stop(ev)
        const next = wrap.getAttribute("aria-pressed") !== "true"
        setComparisonChecked(wrap, host, rule, next)
      })

      host.appendChild(wrap)

      // Restore selected-state if this card was already in the selection
      // before a re-render stripped the checkbox (infinite scroll, React
      // reconciliation, etc.). The selection store is keyed by a stable
      // hash of the host so we can match across DOM churn.
      const key = comparisonHostKey(host)
      if (comparisonSelection.has(key)) {
        setComparisonChecked(wrap, host, rule, true, /* skipStoreUpdate */ true)
      }

      // Make sure the docked bar is mounted exactly once per page.
      ensureComparisonBar(rule)
      return
    }

    if (rule.kind === "grammar_check") {
      // Mirrors the translate decoration: inject a small toolbar button
      // on every match, click sends the visible text fragments to the
      // /grammar-check endpoint, write each correction back into its
      // original text node. A second click toggles back to the
      // pre-correction text. We use the SAME positional contract as
      // translate (corrections[i] replaces fragments[i]) so the in-page
      // logic is essentially identical and easy to reason about.
      const cs = getComputedStyle(el)
      if (cs.position === "static") el.style.position = "relative"

      // Avoid duplicate buttons if the rule re-applies on mutation
      // (React reconciliation, infinite scroll, etc.).
      if (el.querySelector(`[data-uwal-decoration="${rule.id}"][data-uwal-kind="grammar_check"]`)) {
        return
      }

      const btn = document.createElement("button")
      btn.type = "button"
      btn.setAttribute("data-uwal-decoration", rule.id)
      btn.setAttribute("data-uwal-kind", "grammar_check")
      btn.textContent = "Fix grammar"
      // Subtle violet — visually distinct from the blue Translate button
      // so users can tell the two enrichments apart at a glance when
      // both rules are active on the same page.
      applyDecorationPillStyles(btn, {
        background: "#7c3aed",
        border: "1px solid #5b21b6",
      })

      // Stop the host page from also handling the click. LinkedIn / X /
      // Reddit delegate clicks at the post root, so without this the
      // click would also navigate or expand the card.
      const stop = (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        ev.stopImmediatePropagation?.()
      }
      btn.addEventListener("mousedown", stop, true)
      btn.addEventListener("mouseup", stop, true)

      // Cache of original text-node values so a second click reverts.
      // Cleared whenever the user clicks "Fix grammar" again to
      // re-correct (e.g. after the page changed or new text appeared).
      let cache = null

      btn.addEventListener("click", async (ev) => {
        stop(ev)
        const idleLabel = "Fix grammar"

        // Toggle: if already corrected, restore the originals.
        if (cache && cache.corrected) {
          for (const [node, originalText] of cache.entries) {
            try {
              node.data = originalText
            } catch {
              /* node detached */
            }
          }
          cache.corrected = false
          btn.textContent = idleLabel
          return
        }

        // Walk text nodes inside the card and collect non-empty
        // fragments. Skip text nodes belonging to OUR own decorations
        // (the badge / save / translate / grammar buttons themselves)
        // — otherwise we'd "correct" the literal string "Fix grammar".
        const nodes = []
        const fragments = []
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            if (!n.data || !n.data.trim()) return NodeFilter.FILTER_REJECT
            let p = n.parentElement
            while (p && p !== el) {
              if (p.hasAttribute && p.hasAttribute("data-uwal-decoration")) {
                return NodeFilter.FILTER_REJECT
              }
              p = p.parentElement
            }
            return NodeFilter.FILTER_ACCEPT
          },
        })
        let n
        while ((n = walker.nextNode())) {
          nodes.push(n)
          fragments.push(n.data)
        }

        if (nodes.length === 0) {
          toast("Nothing to grammar-check", "default")
          return
        }

        btn.disabled = true
        btn.textContent = "Checking..."
        try {
          const res = await sendMessage({
            type: "grammar_check",
            payload: { fragments },
          })
          if (!res?.ok) {
            throw new Error(res?.error || "Grammar check failed")
          }
          const corrections = res.data?.corrections
          if (!Array.isArray(corrections) || corrections.length !== nodes.length) {
            throw new Error("Bad grammar-check response")
          }

          // Snapshot originals BEFORE mutating so we can toggle back.
          cache = {
            corrected: true,
            entries: nodes.map((node, i) => [node, fragments[i]]),
          }

          // Count how many fragments actually changed — gives the user
          // useful feedback (e.g. "no errors found" vs "fixed 7 errors")
          // without having to scan the post visually.
          let changed = 0
          for (let i = 0; i < nodes.length; i++) {
            try {
              if (corrections[i] !== fragments[i]) {
                nodes[i].data = corrections[i]
                changed++
              }
            } catch {
              /* node detached mid-correction */
            }
          }

          if (changed === 0) {
            // Nothing was corrected — keep the cache empty so the next
            // click triggers another check rather than a no-op revert.
            cache = null
            btn.textContent = idleLabel
            toast("No grammar issues found", "success")
          } else {
            btn.textContent = `Original (${changed})`
          }
        } catch (err) {
          const msg = err && err.message ? err.message : String(err)
          console.log("[v0] grammar_check error", msg)
          toast(`Grammar check failed: ${msg.slice(0, 120)}`, "error")
          btn.textContent = idleLabel
        } finally {
          btn.disabled = false
        }
      })

      getOrCreateUwalToolbar(host).appendChild(btn)
      return
    }

    if (rule.kind === "translate") {
      const cs = getComputedStyle(el)
      if (cs.position === "static") el.style.position = "relative"

      // Avoid duplicate buttons if the rule re-applies on mutation.
      if (el.querySelector(`[data-uwal-decoration="${rule.id}"][data-uwal-kind="translate"]`)) {
        return
      }

      const language = (rule.config && rule.config.language) || "Spanish"
      const btn = document.createElement("button")
      btn.type = "button"
      btn.setAttribute("data-uwal-decoration", rule.id)
      btn.setAttribute("data-uwal-kind", "translate")
      btn.textContent = `Translate · ${language}`
      applyDecorationPillStyles(btn, {
        background: "#1d4ed8",
        border: "1px solid #1e3a8a",
      })

      // Stop the host page from also handling the click (LinkedIn / X
      // delegate clicks at the post root).
      const stop = (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        ev.stopImmediatePropagation?.()
      }
      btn.addEventListener("mousedown", stop, true)
      btn.addEventListener("mouseup", stop, true)

      // Cache of original text-node values so a second click toggles back.
      let cache = null

      btn.addEventListener("click", async (ev) => {
        stop(ev)
        const original = btn.textContent

        // Toggle back to original.
        if (cache && cache.translated) {
          for (const [node, originalText] of cache.entries) {
            try {
              node.data = originalText
            } catch {
              /* node detached */
            }
          }
          cache.translated = false
          btn.textContent = `Translate · ${language}`
          return
        }

        // Walk text nodes and collect non-empty fragments. Skip nodes inside
        // our own decorations (the badge / save / translate button text)
        // so we don't translate "Save" or "Translate · Spanish".
        const nodes = []
        const fragments = []
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            if (!n.data || !n.data.trim()) return NodeFilter.FILTER_REJECT
            let p = n.parentElement
            while (p && p !== el) {
              if (p.hasAttribute && p.hasAttribute("data-uwal-decoration")) {
                return NodeFilter.FILTER_REJECT
              }
              p = p.parentElement
            }
            return NodeFilter.FILTER_ACCEPT
          },
        })
        let n
        while ((n = walker.nextNode())) {
          nodes.push(n)
          fragments.push(n.data)
        }

        if (nodes.length === 0) {
          toast("Nothing to translate", "default")
          return
        }

        btn.disabled = true
        btn.textContent = "Translating..."
        try {
          const res = await sendMessage({
            type: "translate",
            payload: { language, fragments },
          })
          if (!res?.ok) {
            throw new Error(res?.error || "Translation failed")
          }
          const translations = res.data?.translations
          if (!Array.isArray(translations) || translations.length !== nodes.length) {
            throw new Error("Bad translation response")
          }
          // Snapshot originals before mutating so we can toggle back.
          cache = { translated: true, entries: nodes.map((node, i) => [node, fragments[i]]) }
          for (let i = 0; i < nodes.length; i++) {
            try {
              nodes[i].data = translations[i]
            } catch {
              /* node detached mid-translate */
            }
          }
          btn.textContent = `Original`
        } catch (err) {
          const msg = err && err.message ? err.message : String(err)
          console.log("[v0] translate error", msg)
          toast(`Translate failed: ${msg.slice(0, 120)}`, "error")
          btn.textContent = original
        } finally {
          btn.disabled = false
        }
      })

      getOrCreateUwalToolbar(host).appendChild(btn)
      return
    }

    if (rule.kind === "custom") {
      const ops = (rule.config && Array.isArray(rule.config.ops) ? rule.config.ops : [])
      for (const op of ops) {
        try {
          applyOp(el, op, rule)
        } catch (err) {
          console.log("[v0] custom op failed", err, op)
        }
      }
      return
    }
  }

  // ----- Custom-rule op interpreter --------------------------------------
  //
  // Ops are produced by /api/v1/customize and pre-sanitized server-side, but
  // we re-validate here in case rules are loaded across versions.

  const ALLOWED_TAGS = new Set(["div","span","button","a","p","small","strong","em","img","br","hr"])
  const ALLOWED_WRAP_TAGS = new Set(["div","section","article"])

  function applyOp(target, op, rule) {
    if (!op || typeof op !== "object") return
    if (op.type === "set_style") {
      applyStyle(target, op.style)
      return
    }
    if (op.type === "wrap") {
      const tag = ALLOWED_WRAP_TAGS.has(op.tag) ? op.tag : "div"
      const wrapper = document.createElement(tag)
      wrapper.setAttribute("data-uwal-decoration", rule.id)
      applyStyle(wrapper, op.style)
      target.parentNode?.insertBefore(wrapper, target)
      wrapper.appendChild(target)
      return
    }
    const node = buildElement(op.element, rule)
    if (!node) return
    if (op.type === "prepend") target.prepend(node)
    else if (op.type === "append") target.appendChild(node)
    else if (op.type === "before") target.parentNode?.insertBefore(node, target)
    else if (op.type === "after") target.parentNode?.insertBefore(node, target.nextSibling)
  }

  function applyStyle(node, style) {
    if (!style || typeof style !== "object") return
    for (const [k, v] of Object.entries(style)) {
      if (typeof k !== "string" || typeof v !== "string") continue
      try {
        node.style.setProperty(k, v, "important")
      } catch {
        /* invalid prop */
      }
    }
  }

  function buildElement(spec, rule) {
    if (!spec || typeof spec !== "object") return null
    const tag = ALLOWED_TAGS.has(spec.tag) ? spec.tag : "span"
    const node = document.createElement(tag)
    node.setAttribute("data-uwal-decoration", rule.id)
    if (typeof spec.text === "string") node.textContent = spec.text
    if (spec.attrs && typeof spec.attrs === "object") {
      const a = spec.attrs
      if (typeof a.href === "string") node.setAttribute("href", a.href)
      if (typeof a.src === "string" && tag === "img") node.setAttribute("src", a.src)
      if (typeof a.alt === "string" && tag === "img") node.setAttribute("alt", a.alt)
      if (a.target === "_blank" || a.target === "_self") node.setAttribute("target", a.target)
      if (typeof a.title === "string") node.setAttribute("title", a.title)
      if (tag === "a" && node.getAttribute("target") === "_blank") {
        node.setAttribute("rel", "noopener noreferrer")
      }
    }
    applyStyle(node, spec.style)
    if (spec.action && typeof spec.action === "object") {
      attachAction(node, spec.action)
    }
    return node
  }

  function attachAction(node, action) {
    const stop = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }
    if (action.type === "open_url" && typeof action.url === "string") {
      node.addEventListener("click", (e) => {
        stop(e)
        window.open(action.url, action.target === "_self" ? "_self" : "_blank", "noopener,noreferrer")
      })
      node.style.cursor = "pointer"
      return
    }
    if (action.type === "copy_text" && typeof action.text === "string") {
      node.addEventListener("click", async (e) => {
        stop(e)
        try {
          await navigator.clipboard.writeText(action.text)
          toast("Copied", "success")
        } catch {
          toast("Copy failed", "error")
        }
      })
      node.style.cursor = "pointer"
      return
    }
    if (action.type === "alert" && typeof action.message === "string") {
      node.addEventListener("click", (e) => {
        stop(e)
        alert(action.message)
      })
      node.style.cursor = "pointer"
      return
    }
    if (action.type === "hide_match") {
      node.addEventListener("click", (e) => {
        stop(e)
        const root = node.closest("[data-uwal-decoration]")?.parentElement || node.parentElement
        if (root) root.style.setProperty("display", "none", "important")
      })
      node.style.cursor = "pointer"
      return
    }
  }

  // Tracks whether we've already wired up the global re-apply
  // observers/listeners so a re-load (e.g. on SPA route change) doesn't
  // attach duplicate handlers.
  let _rulesObservationsAttached = false

  function applyAllRulesOnce() {
    // Sync runs even when there are no rules — that's the path which
    // tears down a rank bar after the user clicked its × button (the
    // rule is gone from `activeRules` but the bar element is still in
    // the DOM until something prunes it).
    syncRankSearchBars()
    if (activeRules.length === 0) return
    let totalMatched = 0
    for (const r of activeRules) {
      try {
        const matches = document.querySelectorAll(r.selector)
        totalMatched += matches.length
      } catch {}
    }
    activeRules.forEach(applyRule)
    // Diagnostic: helps users (and us) figure out whether a rule is
    // failing to apply because the selector doesn't match anything on
    // the current page (most common cause on SPA / React sites).
    console.log(
      `[v0] uwal: applied ${activeRules.length} rule(s), ${totalMatched} matched element(s) on ${location.hostname}${location.pathname}`,
    )
  }

  async function loadAndApplyRules() {
    console.log(
      `[v0] uwal: loadAndApplyRules start on ${location.hostname}${location.pathname}`,
    )
    const ping = await sendMessage({ type: "ping" })
    if (!ping?.configured) {
      console.log(
        "[v0] uwal: aborted — extension not configured (open Options and set API URL + token)",
        ping,
      )
      return
    }
    const res = await sendMessage({ type: "rule:list", domain: location.hostname })
    if (!res.ok) {
      console.log("[v0] uwal: rule:list failed", res.error)
      return
    }
    activeRules = (res.data.rules || []).filter((r) => r.enabled)
    console.log(
      `[v0] uwal: loaded ${activeRules.length} rule(s) for ${location.hostname}`,
      activeRules.map((r) => `${r.kind}:${r.selector}`),
    )
    applyAllRulesOnce()

    if (activeRules.length === 0) return
    if (_rulesObservationsAttached) return
    _rulesObservationsAttached = true

    // Re-apply on DOM mutations (infinite scroll, virtualized lists,
    // React reconciliation that strips our badges, etc.). Wraps the
    // re-apply call in a check against `__uwalSuppressObserverUntil`:
    // when `applyRankRule` is mid-reorder it sets a short suppression
    // window so its own appendChild calls don't bounce back through
    // here and trigger an infinite shuffle loop on Nike-style React
    // grids. Other rule kinds (badge, filter, hide, etc.) don't
    // mutate childList, so they're unaffected.
    const debounced = debounce(() => {
      if (Date.now() < (window.__uwalSuppressObserverUntil || 0)) {
        return
      }
      applyAllRulesOnce()
    }, 200)
    const obs = new MutationObserver(debounced)
    obs.observe(document.body, { childList: true, subtree: true })

    // Retry pass for the first 30 seconds after load. On Nike / Amazon /
    // SPAs in general, the first product render frequently happens AFTER
    // DOMContentLoaded as the bundle hydrates and lazy-loaded chunks
    // fetch product data. A single MutationObserver tick can race
    // against React's commit and miss the first batch — this guarantees
    // we re-evaluate every 1.5s for half a minute regardless.
    let retries = 0
    const retryTimer = setInterval(() => {
      retries++
      applyAllRulesOnce()
      if (retries >= 20) clearInterval(retryTimer)
    }, 1500)

    // SPA route change detection. Nike, LinkedIn, Twitter, etc. all use
    // history.pushState/replaceState rather than full page loads to
    // navigate. Without this, a rule saved on /mens-running-shoes never
    // re-applies when the user clicks to /mens-tennis-shoes even though
    // it's the same domain and the same selector still matches.
    const onRouteChange = () => {
      console.log("[v0] uwal: SPA route change detected, re-applying rules")
      // Slight delay to let the new page's React tree mount before we
      // try to query selectors on it.
      setTimeout(applyAllRulesOnce, 250)
      setTimeout(applyAllRulesOnce, 1000)
      setTimeout(applyAllRulesOnce, 2500)
    }
    window.addEventListener("popstate", onRouteChange)
    const _push = history.pushState
    const _replace = history.replaceState
    history.pushState = function (...args) {
      const r = _push.apply(this, args)
      onRouteChange()
      return r
    }
    history.replaceState = function (...args) {
      const r = _replace.apply(this, args)
      onRouteChange()
      return r
    }
  }

  function debounce(fn, ms) {
    let t = null
    return (...args) => {
      clearTimeout(t)
      t = setTimeout(() => fn(...args), ms)
    }
  }

  // ----- Pill click + messaging ----------------------------------------

  function sendMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message })
          } else {
            resolve(res ?? { ok: false, error: "No response" })
          }
        })
      } catch (err) {
        resolve({ ok: false, error: err && err.message ? err.message : String(err) })
      }
    })
  }

  pill.addEventListener("click", async () => {
    if (mode === "idle") {
      const res = await sendMessage({ type: "ping" })
      if (!res?.configured) {
        toast("Open the UWAL extension options to set the API URL and token.", "error")
        return
      }
      setMode("select")
    } else {
      setMode("idle")
    }
  })

  document.addEventListener("mousemove", onMouseMove, true)
  document.addEventListener("click", onClick, true)
  document.addEventListener("keydown", onKeyDown, true)
  window.addEventListener(
    "scroll",
    () => {
      if (chosen && scope === "all" && pattern) {
        showOverlayFor(pattern.element)
        showSiblingOverlays(pattern.elements, pattern.element)
      } else {
        showOverlayFor(chosen ?? candidate)
      }
    },
    true,
  )
  window.addEventListener("resize", () => {
    if (chosen && scope === "all" && pattern) {
      showOverlayFor(pattern.element)
      showSiblingOverlays(pattern.elements, pattern.element)
    } else {
      showOverlayFor(chosen ?? candidate)
    }
  })

  // ----- Quick actions from popup --------------------------------------

  async function runQuickAction(action) {
    const ping = await sendMessage({ type: "ping" })
    if (!ping?.configured) {
      toast("Open the UWAL extension options to set the API URL and token.", "error")
      return
    }
    if (action === "select") {
      setMode("select")
      return
    }
    const target = chosen || document.body
    const payload = buildObject(target)

      if (action === "save") {
        toast("Capturing...", "default")
        const res = await enrichAndSave(payload, target)
        if (!res.ok) return toast(res.error || "Save failed", "error")
        savedObject = { id: res.data.object.id, title: res.data.object.title }
        toast("Saved to UWAL workspace", "success")
        return
      }
    if (action === "extract") {
      toast("Extracting...", "default")
      const res = await sendMessage({ type: "extract", text: payload.text, url: payload.url })
      if (!res.ok) return toast(res.error || "Extract failed", "error")
        const merged = {
          ...payload,
          title: res.data.title || payload.title,
          attributes: { ...payload.attributes, ...(res.data.attributes || {}) },
          semantic_type: res.data.semantic_type || null,
          tags: res.data.tags || [],
        }
        const saveRes = await enrichAndSave(merged, target)
        if (!saveRes.ok) return toast(saveRes.error || "Save failed", "error")
        savedObject = { id: saveRes.data.object.id, title: saveRes.data.object.title }
        const note = res.data.ai === false ? " (heuristic)" : ""
        toast(`Saved as ${saveRes.data.object.semantic_type || "object"}${note}`, "success")
        return
      }
      if (action === "summarize") {
        toast("Saving and summarizing...", "default")
        const saveRes = await enrichAndSave(payload, target)
      if (!saveRes.ok) return toast(saveRes.error || "Save failed", "error")
      const id = saveRes.data.object.id
      savedObject = { id, title: saveRes.data.object.title }
      const sumRes = await sendMessage({ type: "summarize", id })
      if (!sumRes.ok) return toast(sumRes.error || "Summarize failed", "error")
      const note = sumRes.data.ai === false ? " (heuristic)" : ""
      const text = String(sumRes.data.summary || "").slice(0, 160) || "Summary ready"
      toast(text + note, "success")
      return
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "uwal:toggle") return pill.click()
    if (msg?.type === "uwal:show-toolbar") {
      if (mode === "idle") setMode("select")
      return
    }
    if (msg?.type === "uwal:run-action") return runQuickAction(msg.action)
  })

  // Apply persistent rules on load.
  // Build sentinel so we can verify in the console that the page is
  // actually running the latest content.js after an extension reload.
  console.log("[v0] uwal: content.js v8 ready, readyState =", document.readyState)
  if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadAndApplyRules)
  } else {
  loadAndApplyRules()
  }
  })()
