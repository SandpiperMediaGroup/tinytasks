// Apply before first paint; the same preference is shared by task and note windows.
(() => {
  const keys = ['bg', 'bg-hover', 'bg-menu', 'ink', 'soft', 'muted', 'line', 'accent', 'danger', 'p0', 'p1', 'p2', 'p3'];
  const palette = (scheme, values, note = []) => ({ scheme, colors: Object.fromEntries(keys.map((key, i) => [key, values[i]])), note });
  const parchment = palette('light', ['#fff8e2', '#fbefcc', '#fffdf5', '#2a2620', '#6e6555', '#8b8170', '#efe2bd', '#e0a52a', '#c2492f', '#c93c2a', '#d0721f', '#a8811c', '#8b8170'], ['#fff1b8', '#f7e8ab']);
  const charcoal = palette('dark', ['#1f1d19', '#2a2721', '#2b2823', '#ece5d5', '#aaa190', '#8f8676', '#34302a', '#f2c14e', '#e77a5f', '#f07a62', '#f0a35a', '#e2c25c', '#9a917f'], ['#302b1c', '#3a3321']);
  const catalog = [
    { id: 'parchment', name: 'Parchment', description: 'Warm & familiar', light: parchment, dark: charcoal },
    { id: 'solarized', name: 'Solarized', description: 'Teal & blue', light: palette('light', ['#fdf6e3', '#eee8d5', '#fdf6e3', '#586e75', '#657b83', '#657b83', '#ddd6c3', '#268bd2', '#dc322f', '#dc322f', '#cb4b16', '#b58900', '#657b83']), dark: palette('dark', ['#002b36', '#073642', '#073642', '#93a1a1', '#839496', '#839496', '#174651', '#2aa198', '#ff756c', '#ff756c', '#e99357', '#bfa238', '#839496']) },
    { id: 'paper', name: 'Paper', description: 'Crisp & quiet', light: palette('light', ['#fafaf8', '#edeeeb', '#ffffff', '#272b2b', '#606967', '#707976', '#dcdfda', '#486f60', '#b8433e', '#b8433e', '#ab6628', '#8b731d', '#707976']),
      dark: palette('dark', ['#202423', '#2c3230', '#282e2b', '#e5e9e5', '#b2bcb5', '#929e95', '#3c453f', '#a1c0ad', '#ee978d', '#ee978d', '#e0af7d', '#d7c68c', '#929e95']) },
    { id: 'forest', name: 'Forest', description: 'Moss & sage',
      light: palette('light', ['#edf3e9', '#dee8d8', '#f5f8f1', '#2e402e', '#526850', '#677b62', '#cfddc8', '#537a43', '#b94e41', '#b94e41', '#a96328', '#897323', '#677b62']), dark: palette('dark', ['#202c28', '#2b3b33', '#29372f', '#e2e9dc', '#b2c0ac', '#93a88f', '#3b4c3e', '#afd09a', '#ee9787', '#ee9787', '#deb37f', '#d2ca8f', '#93a88f']) },
    { id: 'midnight', name: 'Midnight', description: 'Ink & lavender',
      light: palette('light', ['#f2f1fa', '#e5e2f3', '#faf9ff', '#333349', '#62617b', '#77738f', '#d8d4e9', '#7662ae', '#b84b61', '#b84b61', '#a56834', '#8d7529', '#77738f']), dark: palette('dark', ['#1b2032', '#292f48', '#242a40', '#e3e5f2', '#b0b6d0', '#929cbd', '#373e58', '#b7a9f4', '#f19ba8', '#f19ba8', '#e8b78a', '#ddcc93', '#929cbd']) },
  ];
  const media = matchMedia('(prefers-color-scheme: dark)');
  const defaults = { theme: 'parchment', mode: 'auto' };
  let preference = { ...defaults };
  function normalize(value) {
    return { theme: catalog.some(t => t.id === value?.theme) ? value.theme : defaults.theme,
      mode: ['auto', 'light', 'dark'].includes(value?.mode) ? value.mode : defaults.mode };
  }
  function read() {
    try {
      const saved = localStorage.getItem('appearance');
      if (saved != null) return normalize(JSON.parse(saved));
      const legacy = localStorage.getItem('theme');
      if (legacy === 'solarized-light' || legacy === 'solarized-dark') return { theme: 'solarized', mode: legacy.endsWith('dark') ? 'dark' : 'light' };
      if (catalog.some(t => t.id === legacy)) return { theme: legacy, mode: ['forest', 'midnight'].includes(legacy) ? 'dark' : 'light' };
    } catch {}
    return { ...defaults };
  }
  function scheme() { return preference.mode === 'auto' ? (media.matches ? 'dark' : 'light') : preference.mode; }
  function paint(element, theme) {
    const p = theme[scheme()];
    for (const [key, value] of Object.entries(p.colors)) element.style.setProperty(`--${key}`, value);
    element.style.setProperty('--note-bg', p.note[0] || p.colors.bg);
    element.style.setProperty('--note-hover', p.note[1] || p.colors['bg-hover']);
    element.style.setProperty('--shadow', p.scheme === 'dark' ? '0 6px 24px #0006, 0 1px 3px #0004' : '0 6px 24px #30281024, 0 1px 3px #30281018');
    element.style.colorScheme = p.scheme;
  }
  function apply(value) {
    preference = normalize(value);
    document.documentElement.dataset.theme = preference.theme;
    document.documentElement.dataset.appearance = preference.mode;
    document.documentElement.dataset.scheme = scheme();
    paint(document.documentElement, catalog.find(t => t.id === preference.theme));
    window.dispatchEvent(new Event('themechange'));
  }
  function save(value) {
    apply(value);
    // One stored value keeps palette and appearance changes atomic across note windows.
    try { localStorage.setItem('appearance', JSON.stringify(preference)); } catch {}
  }
  window.tinyThemes = { catalog, paint,
    get current() { return preference.theme; }, get mode() { return preference.mode; },
    select(theme) { save({ ...preference, theme }); },
    setMode(mode) { save({ ...preference, mode }); },
  };
  media.addEventListener('change', () => apply(preference));
  window.addEventListener('storage', e => { if (['appearance', 'theme', null].includes(e.key)) apply(read()); });
  apply(read());
})();
