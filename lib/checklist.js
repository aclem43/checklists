// Renders the plain-text checklist in <script type="text/plain" id="checklist"> into printable pages.
// Syntax is documented in README.md.
(function () {
  const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const out = document.getElementById('out');
  const lines = document.getElementById('checklist').textContent.split('\n');
  const maxFs = parseFloat(out.dataset.font) || 8.5;
  let page, col, pageCount = 0;

  function newPage(title) {
    page = document.createElement('section');
    page.className = 'page' + (pageCount++ % 2 ? ' back' : '');
    if (title) page.insertAdjacentHTML('beforeend', `<div class="title">${esc(title)}</div>`);
    const cols = document.createElement('div');
    cols.className = 'cols';
    page.appendChild(cols);
    out.appendChild(page);
    newCol();
  }
  function newCol() {
    col = document.createElement('div');
    col.className = 'col';
    page.querySelector('.cols').appendChild(col);
  }
  const add = html => col.insertAdjacentHTML('beforeend', html);
  const split = s => { const i = s.indexOf('|'); return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()]; };

  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('//')) continue;
    if (l.startsWith('===')) { newPage(l.slice(3).trim()); continue; }
    if (!page) newPage('');
    if (l === '---') { newCol(); continue; }
    if (l.startsWith('#!')) add(`<div class="h red">${esc(l.slice(2).trim())}</div>`);
    else if (l.startsWith('#')) add(`<div class="h">${esc(l.slice(1).trim())}</div>`);
    else if (l.startsWith('>!')) add(`<div class="sub red">${esc(l.slice(2).trim())}</div>`);
    else if (l.startsWith('>')) add(`<div class="sub">${esc(l.slice(1).trim())}</div>`);
    else if (l.startsWith('!!')) add(`<div class="warn">${esc(l.slice(2).trim())}</div>`);
    else if (l.startsWith('!')) add(`<div class="note">${esc(l.slice(1).trim())}</div>`);
    else if (l.startsWith('~')) { const [i, a] = split(l.slice(1)); add(`<div class="row mn"><span class="i">${esc(i)}</span><span class="a">${esc(a)}</span></div>`); }
    else { const [i, a] = split(l); add(`<div class="row"><span class="i">${esc(i)}</span><span class="a">${esc(a)}</span></div>`); }
  }

  // Shrink text on any page whose columns overflow the sheet; warn if it still doesn't fit
  function fit() {
    document.querySelectorAll('.page').forEach((p, n) => {
      let fs = maxFs;
      const set = () => p.style.setProperty('--fs', fs + 'pt');
      const over = () => [...p.querySelectorAll('.col')].some(c => c.scrollHeight > p.querySelector('.cols').clientHeight + 1);
      set();
      while (over() && fs > 6) { fs -= 0.25; set(); }
      if (over()) console.warn(`Page ${n + 1} overflows even at 6pt — split it with === or ---`);
    });
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fit);
})();
