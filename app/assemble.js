// Builds the HTML pages the Electron app needs: the editor preview shell and standalone
// checklist pages (for Export HTML / Export PDF). Mirrors page_html()/colour_vars() in build.py.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

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

const IMG_RE = /^\s*\[img\s+(.+?)\s*\]\s*$/gim; // same as IMG_RE in lib/checklist.js
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/** The file an [img] path names, if it's an image inside the checklists folder (paths are relative to it). */
function imageFile(checklistsDir, rel) {
  const root = path.resolve(checklistsDir), file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !IMAGE_TYPES[path.extname(file).toLowerCase()]) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

/** {path: data URI} for every [img] in the checklist, so an exported page works on its own. */
function embeddedImages(body, checklistsDir) {
  const images = {};
  for (const [, rel] of body.matchAll(IMG_RE)) {
    const file = checklistsDir && imageFile(checklistsDir, rel);
    if (file) images[rel] = `data:${IMAGE_TYPES[path.extname(file).toLowerCase()]};base64,${fs.readFileSync(file).toString('base64')}`;
  }
  return images;
}

const escHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function titleOf(name, body) {
  const m = body.match(/^\s*===\s*(.+?)\s*$/m);
  return m ? m[1] : name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function pageHtml({ title, css, js, toolbar = '', body = '', images = {}, imageBase = '' }) {
  // The source lives inside a <script> tag; only "</script" could break out of it.
  body = body.replace(/<\/(script)/gi, '<\\/$1');
  const imageJson = JSON.stringify(images).replace(/<\//g, '<\\/');
  const baseMeta = imageBase ? `<meta name="checklist-images" content="${escHtml(imageBase)}">\n` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${baseMeta}<title>${escHtml(title)}</title>
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
<script type="application/json" id="checklist-images">${imageJson}</script>
<script>
${js}
</script>
</body>
</html>
`;
}

/** Empty page the editor renders its preview into. Images load straight from the checklists folder. */
function previewHtml(coloursFile, checklistsDir) {
  const imageBase = checklistsDir ? pathToFileURL(checklistsDir).href.replace(/\/?$/, '/') : '';
  return pageHtml({ title: 'Preview', imageBase, ...assets(coloursFile) });
}

/** A standalone, printable checklist page (same as dist/*.html from build.py). */
function standaloneHtml(name, body, coloursFile, checklistsDir) {
  const toolbar = `<div class="toolbar">
  <span></span>
  <button onclick="window.print()">Print / save as PDF</button>
</div>`;
  return pageHtml({ title: titleOf(name, body), toolbar, body, images: embeddedImages(body, checklistsDir), ...assets(coloursFile) });
}

module.exports = { APP_DIR, LIB, parseColours, previewHtml, standaloneHtml, titleOf };
