const { invoke } = window.__TAURI__.core;
const $ = id => document.getElementById(id);
const settings = document.body;
const sidebarInput = $("show-sidebar");
const updateSidebar = () => { try { sidebarInput.checked = localStorage.getItem("sidebar") === "1"; } catch {} };
updateSidebar();
sidebarInput.onchange = () => { try { localStorage.setItem("sidebar", sidebarInput.checked ? "1" : "0"); } catch {} };
window.addEventListener("storage", e => { if (e.key === "sidebar" || e.key == null) updateSidebar(); });
if (/Mac/.test(navigator.platform)) settings.classList.add("mac-titlebar");
for (const link of settings.querySelectorAll("[data-about-link]")) {
  link.onclick = async e => {
    e.preventDefault();
    const error = $(link.dataset.aboutLink === "agent-setup" ? "mcp-status" : "about-error");
    error.hidden = true;
    try { await invoke("open_about_link", { destination: link.dataset.aboutLink }); }
    catch (err) {
      error.textContent = `Couldn't open the link: ${String(err)}`;
      error.hidden = false;
    }
  };
}
const macKeyboard = /Mac|iPhone|iPad/.test(navigator.platform);
for (const key of settings.querySelectorAll("[data-key]")) {
  const primary = key.dataset.key === "primary";
  key.textContent = primary ? (macKeyboard ? "⌘" : "Ctrl") : (macKeyboard ? "⌥" : "Alt");
  key.setAttribute("aria-label", primary ? (macKeyboard ? "Command" : "Control") : (macKeyboard ? "Option" : "Alt"));
}

for (const input of $("appearance-modes").querySelectorAll("input")) {
  input.onchange = () => { if (input.checked) tinyThemes.setMode(input.value); };
}
for (const theme of tinyThemes.catalog) {
  const card = document.createElement("label");
  card.className = "theme-card";
  card.innerHTML = '<input type="radio" name="theme"><span class="theme-preview" aria-hidden="true"><span class="theme-selected">✓</span><span class="theme-sample"><i></i><b></b></span><span class="theme-sample"><i></i><b></b></span></span><span class="theme-name"></span><span class="theme-description"></span>';
  const input = card.querySelector("input");
  input.value = theme.id;
  input.setAttribute("aria-label", theme.name);
  input.onchange = () => { if (input.checked) tinyThemes.select(theme.id); };
  card.querySelector(".theme-name").textContent = theme.name;
  card.querySelector(".theme-description").textContent = theme.description;
  $("themes").appendChild(card);
}
function updateThemes() {
  for (const input of $("appearance-modes").querySelectorAll("input")) input.checked = input.value === tinyThemes.mode;
  for (const card of $("themes").children) {
    const input = card.querySelector("input");
    input.checked = input.value === tinyThemes.current;
    tinyThemes.paint(card.querySelector(".theme-preview"), tinyThemes.catalog.find(t => t.id === input.value));
  }
}
window.addEventListener("themechange", updateThemes);
updateThemes();

let mcpConfiguration = "";
invoke("app_info").then(info => {
  $("installed-version").textContent = `Version ${info.version}`;
  mcpConfiguration = JSON.stringify(info.mcp, null, 2);
  $("mcp-config").textContent = mcpConfiguration;
  $("copy-mcp").disabled = false;
}).catch(() => {
  $("installed-version").textContent = "Version unavailable";
  $("mcp-config").textContent = "Could not load the server configuration. Reopen Settings to try again.";
});
$("copy-mcp").onclick = async () => {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(mcpConfiguration);
    else {
      const range = document.createRange(); range.selectNodeContents($("mcp-config"));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
      selection.removeAllRanges(); $("copy-mcp").focus();
    }
    $("mcp-status").textContent = "Configuration copied.";
  } catch { $("mcp-status").textContent = "Could not copy. Select the configuration above and copy it."; }
  $("mcp-status").hidden = false;
};
function showUpdate(status) {
  $("installed-version").textContent = `Version ${status.current_version}`;
  $("settings-download").hidden = !status.update_available;
  $("update-status").textContent = status.update_available ? `Version ${status.latest_version} is available.` : status.latest_version ? "You’re up to date." : "";
  $("update-status").hidden = !$("update-status").textContent;
}
async function checkUpdates(force) {
  $("check-updates").disabled = true;
  if (force) { $("update-status").textContent = "Checking…"; $("update-status").hidden = false; }
  try { showUpdate(await invoke("check_for_updates", { force })); }
  catch (err) { if (force) { $("update-status").textContent = String(err); $("update-status").hidden = false; } }
  finally { $("check-updates").disabled = false; }
}
$("check-updates").onclick = () => checkUpdates(true);
$("settings-download").onclick = async () => {
  try { await invoke("open_about_link", { destination: "releases" }); }
  catch (err) { $("update-status").textContent = `Couldn't open the download: ${String(err)}`; $("update-status").hidden = false; }
};
window.__TAURI__.event.listen("updates-changed", event => showUpdate(event.payload));
checkUpdates(false);

document.addEventListener("keydown", async e => {
  if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w")) {
    e.preventDefault();
    try { await invoke("close_settings"); }
    catch (err) {
      $("about-error").textContent = `Couldn't close Settings: ${String(err)}`;
      $("about-error").hidden = false;
    }
  }
});
