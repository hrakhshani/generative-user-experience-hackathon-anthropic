const $ = (sel) => document.querySelector(sel);

function showResult(text, ok) {
  const el = $("#result");
  el.textContent = text;
  el.classList.remove("hidden", "ok", "err");
  el.classList.add(ok ? "ok" : "err");
}

// Sets the small "Active / Gateway" pill next to each provider name.
// Active = a key is stored locally and will override the gateway.
// Gateway = nothing stored, so calls fall through to the Vercel AI Gateway.
function setProviderPill(id, hasKey) {
  const pill = $(id);
  if (!pill) return;
  const text = pill.querySelector(".pill-text");
  pill.dataset.state = hasKey ? "active" : "gateway";
  if (text) text.textContent = hasKey ? "Active" : "Gateway";
}

// Re-evaluate both pills from the current input values. Called on
// load, after save, and on input so the indicator is always live.
function refreshProviderPills() {
  setProviderPill("#anthropicPill", !!$("#anthropicKey").value.trim());
  setProviderPill("#openaiPill", !!$("#openaiKey").value.trim());
}

async function load() {
  const { config } = await chrome.runtime.sendMessage({ type: "uwal:get-config" });
  if (config?.apiBase) $("#apiBase").value = config.apiBase;
  if (config?.token) $("#token").value = config.token;
  if (config?.anthropicKey) $("#anthropicKey").value = config.anthropicKey;
  if (config?.openaiKey) $("#openaiKey").value = config.openaiKey;
  refreshProviderPills();
}

function showKeyResult(text, ok) {
  const el = $("#keyResult");
  el.textContent = text;
  el.classList.remove("hidden", "ok", "err");
  el.classList.add(ok ? "ok" : "err");
}

async function saveKey() {
  const anthropicKey = $("#anthropicKey").value.trim();
  const openaiKey = $("#openaiKey").value.trim();

  // Light client-side prefix validation. Both providers prefix their
  // keys with `sk-` (Anthropic uses `sk-ant-`, OpenAI uses `sk-` or
  // `sk-proj-`). We don't try to verify against the live API here —
  // the server will surface a 401 the first time a key is actually
  // used and the user will see the gateway-fallback notice if it fails.
  if (anthropicKey && !/^sk-ant-/.test(anthropicKey)) {
    showKeyResult("Anthropic keys start with sk-ant-...", false);
    return;
  }
  if (openaiKey && !/^sk-/.test(openaiKey)) {
    showKeyResult("OpenAI keys start with sk-... (or sk-proj-...)", false);
    return;
  }

  const res = await chrome.runtime.sendMessage({
    type: "uwal:set-provider-keys",
    payload: { anthropicKey, openaiKey },
  });
  if (res?.ok) {
    const parts = [];
    if (anthropicKey) parts.push("Anthropic");
    if (openaiKey) parts.push("OpenAI");
    showKeyResult(
      parts.length === 0
        ? "Keys cleared. Using gateway."
        : `Saved. Calls now go directly to ${parts.join(" + ")}.`,
      true,
    );
    refreshProviderPills();
  } else {
    showKeyResult(res?.error || "Could not save keys.", false);
  }
}

async function clearKey() {
  $("#anthropicKey").value = "";
  $("#openaiKey").value = "";
  await saveKey();
}

function normalizeBase(value) {
  let v = (value || "").trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  return v.replace(/\/+$/, "");
}

async function save() {
  const apiBase = normalizeBase($("#apiBase").value);
  const token = $("#token").value.trim();

  if (!apiBase || !token) {
    showResult("Both API base URL and token are required.", false);
    return;
  }

  const res = await chrome.runtime.sendMessage({
    type: "uwal:set-config",
    payload: { apiBase, token },
  });

  if (res?.ok) {
    $("#apiBase").value = apiBase;
    showResult(`Connected as ${res.email || "your workspace"}.`, true);
  } else {
    showResult(res?.error || "Could not verify token.", false);
  }
}

async function test() {
  const apiBase = normalizeBase($("#apiBase").value);
  const token = $("#token").value.trim();

  if (!apiBase || !token) {
    showResult("Enter API base URL and token to test.", false);
    return;
  }

  const res = await chrome.runtime.sendMessage({
    type: "uwal:test-config",
    payload: { apiBase, token },
  });

  if (res?.ok) {
    showResult(`OK — connected as ${res.email || "workspace user"}.`, true);
  } else {
    showResult(res?.error || "Connection failed.", false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("#save").addEventListener("click", save);
  $("#test").addEventListener("click", test);
  $("#saveKey").addEventListener("click", saveKey);
  $("#clearKey").addEventListener("click", clearKey);
  // Live preview of the provider status pill as the user types — gives
  // immediate feedback that "yes, this counts as a key" without needing
  // to click Save first.
  $("#anthropicKey").addEventListener("input", refreshProviderPills);
  $("#openaiKey").addEventListener("input", refreshProviderPills);
});
