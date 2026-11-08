// Builds the HTML pages the Electron app needs: the editor preview shell and standalone
// checklist pages (for Export HTML / Export PDF). Mirrors page_html()/colour_vars() in build.py.
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
const LIB = path.join(APP_DIR, 'lib');

/** Read [colours] from colours.toml. Only the simple `key = "value"` form the file uses. */
function parseColours(text) {
  const colours = {};
  let inColours = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const section = line.match(/^\[(.+)\]$/);
    if (section) { inColours = section[1].trim() === 'colours'; continue; }
    if (!inColours) continue;
    const m = line.match(/^([\w-]+)\s*=\s*"([^"]*)"$/);
    if (!m) throw new Error(`colours.toml: can't read line: ${raw.trim()}`);
    colours[m[1]] = m[2];
  }
  return colours;
}

function colourVars(css, coloursFile) {
  const colours = parseColours(fs.readFileSync(coloursFile, 'utf8'));
  const used = new Set([...css.matchAll(/var\(--c-([\w-]+)\)/g)].map(m => m[1]));
  const missing = [...used].filter(k => !(k in colours)).sort();
  if (missing.length) throw new Error(`colours.toml: missing ${missing.join(', ')}`);
  for (const [k, v] of Object.entries(colours)) {
    if (/[;{}<>]/.test(v)) throw new Error(`colours.toml: ${k} = "${v}" isn't a valid colour`);
  }
  return ':root {\n' + Object.entries(colours).map(([k, v]) => `  --c-${k}: ${v};\n`).join('') + '}';
}

/** The stylesheet with colour variables prepended, and the renderer script. */
function assets(coloursFile) {
  let css = fs.readFileSync(path.join(LIB, 'checklist.css'), 'utf8');
  css = colourVars(css, coloursFile) + '\n' + css;
  const js = fs.readFileSync(path.join(LIB, 'checklist.js'), 'utf8');
  return { css, js };
}

const escHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function titleOf(name, body) {
  const m = body.match(/^\s*===\s*(.+?)\s*$/m);
  return m ? m[1] : name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function pageHtml({ title, css, js, toolbar = '', body = '' }) {
  // The source lives inside a <script> tag; only "</script" could break out of it.
  body = body.replace(/<\/(script)/gi, '<\\/$1');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<style>
${css}
</style>
</head>
<body>
${toolbar}
<main id="out"></main>
<script type="text/plain" id="checklist">
${body}
</script>
<script>
${js}
</script>
</body>
</html>
`;
}

/** Empty page the editor renders its preview into. */
function previewHtml(coloursFile) {
  return pageHtml({ title: 'Preview', ...assets(coloursFile) });
}

/** A standalone, printable checklist page (same as dist/*.html from build.py). */
function standaloneHtml(name, body, coloursFile) {
  const toolbar = `<div class="toolbar">
  <span></span>
  <button onclick="window.print()">Print / save as PDF</button>
</div>`;
  return pageHtml({ title: titleOf(name, body), toolbar, body, ...assets(coloursFile) });
}

module.exports = { APP_DIR, LIB, parseColours, previewHtml, standaloneHtml, titleOf };
