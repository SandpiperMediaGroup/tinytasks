// Apply before first paint; the same preference is shared by task and note windows.
(() => {
  const keys = ['bg', 'bg-hover', 'bg-menu', 'ink', 'soft', 'muted', 'line', 'accent', 'danger', 'p0', 'p1', 'p2', 'p3'];
  const palette = (scheme, values, note = []) => ({ scheme, colors: Object.fromEntries(keys.map((key, i) => [key, values[i]])), note });
  const parchment = palette('light', ['#fff8e2', '#fbefcc', '#fffdf5', '#2a2620', '#6e6555', '#8b8170', '#efe2bd', '#e0a52a', '#c2492f', '#c93c2a', '#d0721f', '#a8811c', '#8b8170'], ['#fff1b8', '#f7e8ab']);
  const charcoal = palette('dark', ['#1f1d19', '#2a2721', '#2b2823', '#ece5d5', '#aaa190', '#8f8676', '#34302a', '#f2c14e', '#e77a5f', '#f07a62', '#f0a35a', '#e2c25c', '#9a917f'], ['#302b1c', '#3a3321']);
  const catalog = [
    { id: 'system', name: 'System', description: 'Follows your Mac', palette: null },
    { id: 'parchment', name: 'Parchment', description: 'Warm & familiar', palette: parchment },
    { id: 'solarized-light', name: 'Solarized Light', description: 'Cream & blue', palette: palette('light', ['#fdf6e3', '#eee8d5', '#fdf6e3', '#586e75', '#657b83', '#657b83', '#ddd6c3', '#268bd2', '#dc322f', '#dc322f', '#cb4b16', '#b58900', '#657b83']) },
    { id: 'solarized-dark', name: 'Solarized Dark', description: 'Deep teal & blue', palette: palette('dark', ['#002b36', '#073642', '#073642', '#93a1a1', '#839496', '#839496', '#174651', '#2aa198', '#ff756c', '#ff756c', '#e99357', '#bfa238', '#839496']) },
    { id: 'paper', name: 'Paper', description: 'Crisp & quiet', palette: palette('light', ['#fafaf8', '#edeeeb', '#ffffff', '#272b2b', '#606967', '#707976', '#dcdfda', '#486f60', '#b8433e', '#b8433e', '#ab6628', '#8b731d', '#707976']) },
    { id: 'forest', name: 'Forest', description: 'Moss & sage', palette: palette('dark', ['#202c28', '#2b3b33', '#29372f', '#e2e9dc', '#b2c0ac', '#93a88f', '#3b4c3e', '#afd09a', '#ee9787', '#ee9787', '#deb37f', '#d2ca8f', '#93a88f']) },
    { id: 'midnight', name: 'Midnight', description: 'Ink & lavender', palette: palette('dark', ['#1b2032', '#292f48', '#242a40', '#e3e5f2', '#b0b6d0', '#929cbd', '#373e58', '#b7a9f4', '#f19ba8', '#f19ba8', '#e8b78a', '#ddcc93', '#929cbd']) },
  ];
  const media = matchMedia('(prefers-color-scheme: dark)');
  let current = 'system';
  function read() { try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; } }
  function resolve(theme) { return theme.palette || (media.matches ? charcoal : parchment); }
  function paint(element, theme) {
    const p = resolve(theme);
    for (const [key, value] of Object.entries(p.colors)) element.style.setProperty(`--${key}`, value);
    element.style.setProperty('--note-bg', p.note[0] || p.colors.bg);
    element.style.setProperty('--note-hover', p.note[1] || p.colors['bg-hover']);
    element.style.setProperty('--shadow', p.scheme === 'dark' ? '0 6px 24px #0006, 0 1px 3px #0004' : '0 6px 24px #30281024, 0 1px 3px #30281018');
    element.style.colorScheme = p.scheme;
  }
  function apply(id) {
    const theme = catalog.find(t => t.id === id) || catalog[0];
    current = theme.id;
    document.documentElement.dataset.theme = current;
    paint(document.documentElement, theme);
    window.dispatchEvent(new Event('themechange'));
  }
  window.tinyThemes = { catalog, paint, get current() { return current; }, select(id) {
    apply(id);
    try { localStorage.setItem('theme', current); } catch {}
  } };
  media.addEventListener('change', () => apply(current));
  window.addEventListener('storage', e => { if (e.key === 'theme' || e.key === null) apply(read()); });
  apply(read());
})();
