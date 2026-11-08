// Checklist renderer: turns checklist text into printable pages.
// Used by the built pages in dist/ and by the editor preview. Syntax is documented in README.md.
window.Checklist = (function () {
  const SIZES = { // name -> [width, height, @page size]
    'A5': ['148mm', '210mm', 'A5'],
    'A5-landscape': ['210mm', '148mm', 'A5 landscape'],
    'A4': ['210mm', '297mm', 'A4'],
    'A4-landscape': ['297mm', '210mm', 'A4 landscape'],
    'Letter': ['8.5in', '11in', 'letter'],
    'Letter-landscape': ['11in', '8.5in', 'letter landscape'],
  };
  const DEFAULTS = { size: 'A5', font: '8.5', columns: '2', binding: 'on', footer: '', paper: '' };
  const MIN_FS = 6;

  const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const split = s => { const i = s.indexOf('|'); return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()]; };

  const isColour = v => typeof CSS === 'undefined' || CSS.supports('color', v);

  /** Read @settings lines; returns {settings, errors}.
   *  @paper is the one per-page setting: after a === line it only colours that page (see render). */
  function readSettings(lines) {
    const settings = { ...DEFAULTS }, errors = [];
    settings.lineOf = {}; // setting -> source line, so the editor can jump to it
    let inPage = false;
    lines.forEach((raw, n) => {
      if (raw.trim().startsWith('===')) inPage = true;
      const m = raw.match(/^\s*@(\w+)\s+(.+?)\s*$/);
      if (!m) return;
      const key = m[1].toLowerCase(), val = m[2];
      if (!(key in DEFAULTS)) errors.push(`Line ${n + 1}: unknown setting @${key} (known: ${Object.keys(DEFAULTS).map(k => '@' + k).join(', ')})`);
      else if (key === 'size' && !(val in SIZES)) errors.push(`Line ${n + 1}: unknown @size ${val} (known: ${Object.keys(SIZES).join(', ')})`);
      else if ((key === 'font' || key === 'columns') && !(parseFloat(val) > 0)) errors.push(`Line ${n + 1}: @${key} must be a number`);
      else if (key === 'paper' && !isColour(val)) errors.push(`Line ${n + 1}: @paper ${val} is not a colour (try pink, #ffd6e0, rgb(255 214 224))`);
      else if (key === 'paper' && inPage) return; // page-only; applied in render
      else { settings[key] = val; settings.lineOf[key] = n + 1; }
    });
    return { settings, errors };
  }

  /** Apply page size, columns and binding to the document. */
  function applySettings(s, doc) {
    const [w, h, page] = SIZES[s.size];
    const root = doc.documentElement;
    root.style.setProperty('--pw', w);
    root.style.setProperty('--ph', h);
    root.style.setProperty('--cols', parseInt(s.columns, 10));
    root.classList.toggle('no-bind', !/^(on|yes|true)$/i.test(s.binding));
    let st = doc.getElementById('page-size');
    if (!st) { st = doc.createElement('style'); st.id = 'page-size'; doc.head.appendChild(st); }
    st.textContent = `@media print { @page { size: ${page}; } }`;
  }

  /** Render checklist text into `out`. Every element gets data-line (1-based source line). */
  function render(text, out) {
    const doc = out.ownerDocument;
    const lines = text.split('\n');
    const { settings, errors } = readSettings(lines);
    applySettings(settings, doc);
    out.innerHTML = '';
    if (errors.length) out.insertAdjacentHTML('beforeend', `<div class="errors">${errors.map(esc).join('<br>')}</div>`);

    let page, col, pageCount = 0, gap = false; // gap: a blank line since the last content line
    function newPage(title, line) {
      page = doc.createElement('section');
      page.className = 'page' + (pageCount++ % 2 ? ' back' : '');
      if (settings.paper) page.style.setProperty('--c-paper', settings.paper);
      if (title) page.insertAdjacentHTML('beforeend', `<div class="title" data-line="${line}">${esc(title)}</div>`);
      const cols = doc.createElement('div');
      cols.className = 'cols';
      page.appendChild(cols);
      out.appendChild(page);
      newCol();
    }
    function newCol() {
      col = doc.createElement('div');
      col.className = 'col';
      page.querySelector('.cols').appendChild(col);
    }

    lines.forEach((raw, n) => {
      const l = raw.trim(), ln = n + 1;
      if (!l) { gap = true; return; }
      if (l.startsWith('//')) return;
      const afterGap = gap;
      gap = false;
      const pagePaper = page && l.match(/^@paper\s+(.+)$/i);
      if (pagePaper) { if (isColour(pagePaper[1].trim())) page.style.setProperty('--c-paper', pagePaper[1].trim()); return; }
      if (/^@\w+\s/.test(l)) return;
      if (l.startsWith('===')) return newPage(l.slice(3).trim(), ln);
      if (!page) newPage('', ln);
      if (l === '---') return newCol();
      const add = (cls, inner) => col.insertAdjacentHTML('beforeend', `<div class="${cls}" data-line="${ln}">${inner}</div>`);
      const row = (cls, s) => { const [i, a] = split(s); add(cls, `<span class="i">${esc(i)}</span><span class="a">${esc(a)}</span>`); };
      // "A | B | C": table row. Consecutive rows share one table so columns line up;
      // a blank line between rows draws a heavier rule there (to mark groups).
      const tableRow = cells => {
        let t = col.lastElementChild;
        const cont = t && t.tagName === 'TABLE';
        if (!cont) { t = doc.createElement('table'); t.className = 'tbl'; col.appendChild(t); }
        const tr = t.insertRow();
        tr.dataset.line = ln;
        if (cont && afterGap) tr.className = 'group';
        for (const c of cells) tr.insertCell().textContent = c.trim();
      };
      if (l.startsWith('#!')) add('h red', esc(l.slice(2).trim()));
      else if (l.startsWith('#')) add('h', esc(l.slice(1).trim()));
      else if (l.startsWith('>!')) add('sub red', esc(l.slice(2).trim()));
      else if (l.startsWith('>')) add('sub', esc(l.slice(1).trim()));
      else if (l.startsWith('!!')) add('warn', esc(l.slice(2).trim()));
      else if (l.startsWith('!')) add('note', esc(l.slice(1).trim()));
      else if (l.startsWith('~')) row('row mn', l.slice(1));
      else if (l.split('|').length > 2) tableRow(l.split('|'));
      else row('row', l);
    });
    if (settings.footer) addFooters(out, settings);
    fit(out, parseFloat(settings.font));
    return { settings, errors, pages: pageCount };
  }

  // "@footer left | right": same footer on every page; {page} and {pages} are filled in.
  // Without "|" the text is centred.
  function addFooters(out, settings) {
    const pages = out.querySelectorAll('.page');
    pages.forEach((p, n) => {
      const fill = s => esc(s.replace(/\{page\}/g, n + 1).replace(/\{pages\}/g, pages.length));
      const i = settings.footer.indexOf('|');
      const inner = i < 0
        ? `<span class="c">${fill(settings.footer.trim())}</span>`
        : `<span>${fill(settings.footer.slice(0, i).trim())}</span><span>${fill(settings.footer.slice(i + 1).trim())}</span>`;
      p.insertAdjacentHTML('beforeend', `<div class="footer" data-line="${settings.lineOf.footer}">${inner}</div>`);
    });
  }

  // Shrink text on any page whose columns overflow the sheet. Pages that shrank or still
  // overflow get data-fit, which shows a badge on screen (never printed).
  function fit(out, maxFs) {
    out.querySelectorAll('.page').forEach((p, n) => {
      let fs = maxFs;
      const set = () => p.style.setProperty('--fs', fs + 'pt');
      const cols = p.querySelector('.cols');
      const over = () => [...p.querySelectorAll('.col')].some(c => c.scrollHeight > cols.clientHeight + 1);
      set();
      while (over() && fs > MIN_FS) { fs -= 0.25; set(); }
      if (over()) {
        p.dataset.fit = `Overflows at ${MIN_FS}pt: split with === or ---`;
        p.classList.add('overflow');
        console.warn(`Page ${n + 1} overflows even at ${MIN_FS}pt — split it with === or ---`);
      } else if (fs < maxFs) p.dataset.fit = `Text shrunk to ${fs}pt`;
      else delete p.dataset.fit;
    });
  }

  return { render, SIZES, DEFAULTS };
})();

// Built pages: render the embedded source once fonts are ready (so fitting measures real text).
(function () {
  const src = document.getElementById('checklist'), out = document.getElementById('out');
  if (!src || !out) return;
  const text = src.textContent.replace(/^\n/, '').replace(/<\\\/script/gi, '</script');
  if (!text.trim()) return; // editor preview shell: the editor renders into it
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => Checklist.render(text, out));
})();
