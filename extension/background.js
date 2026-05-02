// UWAL background service worker.
// Owns: settings (apiBase, token, email), API calls, command routing.
// Content scripts, popup, and options page message us via chrome.runtime.sendMessage.

const STORAGE_KEYS = ["apiBase", "token", "email", "anthropicKey", "openaiKey"];

async function getConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS);
  return {
    apiBase: (stored.apiBase || "").replace(/\/+$/, ""),
    token: stored.token || "",
    email: stored.email || "",
    anthropicKey: stored.anthropicKey || "",
    openaiKey: stored.openaiKey || "",
  };
}

async function apiFetch(path, init = {}, override) {
  const cfg = override || (await getConfig());
  if (!cfg.apiBase) throw new Error("API base URL not configured");
  if (!cfg.token) throw new Error("Workspace token not configured");

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${cfg.token}`,
    ...(init.headers || {}),
  };
  // Per-user provider keys. When set, the corresponding server route
  // skips the Vercel AI Gateway and calls the provider directly with
  // this key (billed to the user's own account). Useful when the
  // gateway requires a card on file. Anthropic powers chat /
  // generation; OpenAI powers embeddings (Rank rules, category filter).
  if (cfg.anthropicKey) headers["x-anthropic-key"] = cfg.anthropicKey;
  if (cfg.openaiKey) headers["x-openai-key"] = cfg.openaiKey;

  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = body && body.error ? body.error : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return body;
}

async function verifyAndPersist({ apiBase, token }) {
  const cleanBase = (apiBase || "").replace(/\/+$/, "");
  const me = await apiFetch("/api/v1/me", {}, { apiBase: cleanBase, token });
  const email = me?.user?.email || "";
  await chrome.storage.local.set({ apiBase: cleanBase, token, email });
  return { ok: true, email };
}

async function verifyOnly({ apiBase, token }) {
  const cleanBase = (apiBase || "").replace(/\/+$/, "");
  const me = await apiFetch("/api/v1/me", {}, { apiBase: cleanBase, token });
  return { ok: true, email: me?.user?.email || "" };
}

async function forwardToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab" };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return { ok: true };
  } catch {
    return { ok: false, error: "Content script not available on this page" };
  }
}

// ----- Message router --------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        // Config (popup + options)
        case "uwal:get-config": {
          const config = await getConfig();
          sendResponse({ ok: true, config });
          return;
        }
        case "uwal:set-config": {
          const out = await verifyAndPersist(msg.payload || {});
          sendResponse(out);
          return;
        }
        case "uwal:test-config": {
          const out = await verifyOnly(msg.payload || {});
          sendResponse(out);
          return;
        }
        case "uwal:set-anthropic-key": {
          // Legacy single-key handler kept for any older popup builds
          // that might still reference it. New code uses
          // `uwal:set-provider-keys` below which handles both keys.
          const key = (msg.payload?.anthropicKey || "").trim();
          await chrome.storage.local.set({ anthropicKey: key });
          sendResponse({ ok: true });
          return;
        }
        case "uwal:set-provider-keys": {
          // Persist Anthropic + OpenAI keys in one shot. Empty strings
          // clear the stored value for that provider, which makes the
          // server route fall back to the Vercel AI Gateway.
          const anthropicKey = (msg.payload?.anthropicKey || "").trim();
          const openaiKey = (msg.payload?.openaiKey || "").trim();
          await chrome.storage.local.set({ anthropicKey, openaiKey });
          sendResponse({ ok: true });
          return;
        }

        // Health (content script)
        case "ping": {
          const cfg = await getConfig();
          sendResponse({ ok: true, configured: Boolean(cfg.apiBase && cfg.token) });
          return;
        }
        case "me": {
          const data = await apiFetch("/api/v1/me");
          sendResponse({ ok: true, data });
          return;
        }

        // Actions
        case "extract": {
          const data = await apiFetch("/api/v1/extract", {
            method: "POST",
            body: JSON.stringify({ text: msg.text || "", url: msg.url || "" }),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "generalize": {
          const data = await apiFetch("/api/v1/generalize", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "customize": {
          const data = await apiFetch("/api/v1/customize", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "translate": {
          const data = await apiFetch("/api/v1/translate", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "grammar_check": {
          // Grammar correction: takes a parallel array of text fragments
          // pulled from the matched element's text nodes, returns the
          // same array shape with corrections applied. The content
          // script writes corrections back into their original text
          // nodes (same flow as /translate).
          const data = await apiFetch("/api/v1/grammar-check", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "visual_search": {
          // Multimodal: payload = { image: dataURL, prompt?, site? }.
          // Server sends the image to gpt-4o-mini (vision) and returns
          // a SHORT lowercase search query — the content script types
          // it into the host page's search bar and presses Enter.
          // Goes through apiFetch like every other action so auth +
          // base-URL config stay centralized.
          const data = await apiFetch("/api/v1/visual-search", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "categorize": {
          const data = await apiFetch("/api/v1/categorize", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "derive_categories": {
          // Asks the LLM to propose a small set of page-specific
          // categories to use as classification anchors. The extension
          // calls this once per (host, selector) and caches the result
          // in localStorage, then passes the categories back into
          // `categorize` requests.
          const data = await apiFetch("/api/v1/derive-categories", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "rank": {
          // Embedding-based ranking: send a user query plus the text of
          // every matched element, get back a similarity score per
          // element. The content script reorders DOM siblings by score
          // descending and overlays a small score chip on each card.
          const data = await apiFetch("/api/v1/rank", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "save": {
          const data = await apiFetch("/api/v1/objects", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "screenshot:capture-tab": {
          // Use the sender's tab so the screenshot matches the page that
          // triggered the save, even if another tab gains focus mid-capture.
          const windowId =
            _sender?.tab?.windowId ?? (await chrome.windows.getCurrent()).id;
          const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
            format: "png",
          });
          sendResponse({ ok: true, dataUrl });
          return;
        }
        case "screenshot:upload": {
          const data = await apiFetch("/api/v1/screenshot", {
            method: "POST",
            body: JSON.stringify({ dataUrl: msg.dataUrl || "" }),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "summarize": {
          const data = await apiFetch(
            `/api/v1/objects/${encodeURIComponent(msg.id)}/summarize`,
            { method: "POST" },
          );
          sendResponse({ ok: true, data });
          return;
        }
        case "summarize_text": {
          // Stateless summary used by the in-page Summarize decoration
          // button. Sends raw text (no object id), returns a summary
          // without persisting anything.
          const data = await apiFetch("/api/v1/summarize", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "annotate": {
          const data = await apiFetch(
            `/api/v1/objects/${encodeURIComponent(msg.id)}/annotations`,
            {
              method: "POST",
              body: JSON.stringify({ body: msg.body || "", field: msg.field || null }),
            },
          );
          sendResponse({ ok: true, data });
          return;
        }
        case "track": {
          const data = await apiFetch(
            `/api/v1/objects/${encodeURIComponent(msg.id)}/track`,
            {
              method: "POST",
              body: JSON.stringify({
                fields: msg.fields || [],
                interval_minutes: msg.intervalMinutes ?? 1440,
              }),
            },
          );
          sendResponse({ ok: true, data });
          return;
        }
        case "list": {
          const data = await apiFetch(
            `/api/v1/objects?limit=${encodeURIComponent(msg.limit ?? 20)}`,
          );
          sendResponse({ ok: true, data });
          return;
        }
        case "compare": {
          const data = await apiFetch("/api/v1/compare", {
            method: "POST",
            body: JSON.stringify({ object_ids: msg.ids || [] }),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "compare_text": {
          // Stateless side-by-side comparison used by the in-page
          // "Compare" rule. Sends the visible text of selected matches
          // (no object id required, nothing persisted) and gets back a
          // structured comparison TABLE (columns + rows + verdict)
          // ready for the modal to render.
          const data = await apiFetch("/api/v1/compare-text", {
            method: "POST",
            body: JSON.stringify(msg.payload || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }

        // Page rules: persistent decorations applied per domain.
        case "rule:list": {
          const qs = msg.domain ? `?domain=${encodeURIComponent(msg.domain)}` : "";
          const data = await apiFetch(`/api/v1/page-rules${qs}`);
          sendResponse({ ok: true, data });
          return;
        }
        case "rule:create": {
          const data = await apiFetch("/api/v1/page-rules", {
            method: "POST",
            body: JSON.stringify(msg.rule || {}),
          });
          sendResponse({ ok: true, data });
          return;
        }
        case "rule:delete": {
          const data = await apiFetch(
            `/api/v1/page-rules/${encodeURIComponent(msg.id)}`,
            { method: "DELETE" },
          );
          sendResponse({ ok: true, data });
          return;
        }

        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  })();
  return true; // keep channel open for async sendResponse
});

// ----- Keyboard commands -> content script -----------------------------

chrome.commands.onCommand.addListener(async (command) => {
  let payload = null;
  if (command === "toggle-toolbar") payload = { type: "uwal:toggle" };
  else if (command === "save-page") payload = { type: "uwal:run-action", action: "save" };
  else if (command === "pick-element") payload = { type: "uwal:run-action", action: "select" };
  if (!payload) return;
  await forwardToActiveTab(payload);
});

// Browser action click is handled by the popup, but this is a safe fallback
// for when the popup is unavailable.
chrome.action.onClicked.addListener(async () => {
  await forwardToActiveTab({ type: "uwal:toggle" });
});
