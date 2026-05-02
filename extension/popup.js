const $ = (sel) => document.querySelector(sel);

function showStatus(text, ok = true) {
  const el = $("#status");
  el.textContent = text;
  el.style.borderColor = ok ? "var(--border-strong)" : "var(--danger)";
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2400);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshAuthUI() {
  const { config } = await chrome.runtime.sendMessage({ type: "uwal:get-config" });
  const authed = !!(config && config.token && config.apiBase);

  $("#auth-state").classList.toggle("hidden", !authed);
  $("#signin-state").classList.toggle("hidden", authed);

  document
    .querySelectorAll(".action")
    .forEach((b) => (b.disabled = !authed));

  if (authed) {
    $("#auth-email").textContent = config.email || "Connected";
    try {
      $("#auth-host").textContent = new URL(config.apiBase).host;
    } catch {
      $("#auth-host").textContent = config.apiBase;
    }
  }
}

async function sendToContent(message) {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    showStatus("Open a regular web page first", false);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await refreshAuthUI();

  $("#settings-btn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  $("#open-settings-link").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  $("#open-dashboard").addEventListener("click", async (e) => {
    e.preventDefault();
    const { config } = await chrome.runtime.sendMessage({ type: "uwal:get-config" });
    const base = config?.apiBase || "https://example.com";
    chrome.tabs.create({ url: `${base.replace(/\/$/, "")}/dashboard` });
  });

  $("#open-toolbar").addEventListener("click", async (e) => {
    e.preventDefault();
    await sendToContent({ type: "uwal:show-toolbar" });
    window.close();
  });

  document.querySelectorAll(".action").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      await sendToContent({ type: "uwal:run-action", action });
      window.close();
    });
  });
});
