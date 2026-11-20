const closeBasics = () => window.__TAURI__.core.invoke('close_basics');
document.getElementById('basics-close').onclick = closeBasics;
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' || (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w') {
    event.preventDefault(); closeBasics();
  }
});
