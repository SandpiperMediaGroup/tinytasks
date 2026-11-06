const { invoke } = window.__TAURI__.core;
const $ = id => document.getElementById(id);
const settings = document.body;
if (/Mac/.test(navigator.platform)) settings.classList.add("mac-titlebar");
for (const link of settings.querySelectorAll("[data-about-link]")) {
  link.onclick = async e => {
    e.preventDefault();
    $("about-error").hidden = true;
    try { await invoke("open_about_link", { destination: link.dataset.aboutLink }); }
    catch (err) {
      $("about-error").textContent = `Couldn't open the link: ${String(err)}`;
      $("about-error").hidden = false;
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
