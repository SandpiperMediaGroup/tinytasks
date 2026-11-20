// Named Markdown links and plain URLs become direct, keyboard-accessible chips.
// Keep the original details text for editing; never treat task content as HTML.
const DetailLinks = (() => {
  const allowed = /^(https?:|mailto:|claude:|cursor:|vscode:|vscode-insiders:|windsurf:|zed:|slack:|linear:|notion:|figma:|obsidian:|msteams:|discord:)/i;
  function parse(text, taskLink = "", display = false) {
    const links = [], occupied = [];
    const add = (label, url) => {
      if (!allowed.test(url) || /[\s<>]/.test(url)) return false;
      if (!links.some(link => link.url === url)) links.push({ label: label || labelFor(url), url });
      return true;
    };
    const named = /\[([^\]\n]+)\]\(/g;
    let match;
    while ((match = named.exec(text))) {
      let end = named.lastIndex, depth = 1;
      while (end < text.length && depth) { if (text[end] === '(') depth++; if (text[end] === ')') depth--; end++; }
      if (depth) continue;
      const accepted = add(match[1], text.slice(named.lastIndex, end - 1)); occupied.push([match.index, end, accepted ? match[1] : null]); named.lastIndex = end;
    }
    const plain = /(?:https?:\/\/|mailto:)[^\s<>]+|\blocalhost:\d+(?:\/[^\s<>]*)?/gi;
    while ((match = plain.exec(text))) {
      if (occupied.some(([a, b]) => match.index >= a && match.index < b)) continue;
      let url = match[0].replace(/[.,;!?]+$/, '');
      while (url.endsWith(')') && (url.match(/\)/g)?.length || 0) > (url.match(/\(/g)?.length || 0)) url = url.slice(0, -1);
      if (url.startsWith('localhost:')) url = `http://${url}`;
      add('', url);
    }
    if (taskLink) add('', taskLink);
    if (display) {
      let value = '', offset = 0;
      for (const [start, end, label] of occupied) { value += text.slice(offset, start) + (label ?? text.slice(start, end)); offset = end; }
      return value + text.slice(offset);
    }
    return links;
  }
  function labelFor(url) { try { const u = new URL(url); return u.host || url; } catch { return url; } }
  let tooltip = null, timer = null;
  function hide() { clearTimeout(timer); tooltip?.remove(); tooltip = null; document.querySelectorAll('[aria-describedby="link-chip-tooltip"]').forEach(el => el.removeAttribute('aria-describedby')); }
  function show(button, url) {
    hide(); timer = setTimeout(() => {
      if (!button.isConnected) return;
      tooltip = Object.assign(document.createElement('div'), { id: 'link-chip-tooltip', className: 'link-chip-tooltip', textContent: url });
      tooltip.setAttribute('role', 'tooltip'); document.body.append(tooltip); button.setAttribute('aria-describedby', tooltip.id);
      const rect = button.getBoundingClientRect();
      tooltip.style.left = `${Math.max(8, Math.min(innerWidth - tooltip.offsetWidth - 8, rect.left))}px`;
      tooltip.style.top = `${Math.max(8, rect.top - tooltip.offsetHeight - 6)}px`;
    }, 650);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  document.addEventListener('scroll', hide, true);
  function render(container, task, invoke, onError) {
    const links = parse(task.details || '', task.link || ''); container.hidden = !links.length;
    container.replaceChildren(...links.map(({ label, url }) => {
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'link-chip', textContent: label });
      button.setAttribute('aria-label', `Open ${label}`);
      button.onclick = e => { e.stopPropagation(); hide(); invoke('open_detail_link', { url }).catch(onError); };
      button.onpointerdown = e => e.stopPropagation(); button.onkeydown = e => e.stopPropagation();
      button.onmouseenter = () => show(button, url); button.onmouseleave = hide;
      button.onfocus = () => show(button, url); button.onblur = hide;
      return button;
    }));
  }
  return { parse, render, hide, displayText: text => parse(text, "", true) };
})();
