#!/usr/bin/env python3
"""Build printable checklists.

  python3 build.py               build every checklists/*.txt into dist/*.html
  python3 build.py edit          open the editor in your browser (also rebuilds dist/ on every save)
  python3 build.py --watch       rebuild on every change and serve a live preview that reloads itself
  python3 build.py --watch --open   same, and open the preview in your browser
  python3 build.py new "Name"    start a new checklist from the starter template

Each output file is standalone (CSS and JS inlined), so it can be emailed or opened anywhere.
Settings (@size etc.) and layout are handled by lib/checklist.js, shared by the built pages and the editor.
"""
import functools
import html
import http.server
import json
import re
import sys
import threading
import time
import tomllib
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "checklists"
LIB = ROOT / "lib"
DIST = ROOT / "dist"
COLOURS = ROOT / "colours.toml"
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")  # checklist file names (without .txt)

# Live preview: when a page is served by `--watch`, it polls /__build and reloads after each
# rebuild, or shows the build error in a banner. Opened as a file, it does nothing.
STATE = {"id": "", "error": None}
RELOAD_JS = """<script>
if (location.protocol.startsWith('http')) (function poll(seen) {
  fetch('/__build', {cache: 'no-store'}).then(r => r.json()).then(s => {
    let bar = document.getElementById('build-error');
    if (s.error) {
      if (!bar) { bar = document.createElement('pre'); bar.id = 'build-error'; document.body.prepend(bar);
        bar.style.cssText = 'position:sticky;top:0;z-index:9;margin:0;padding:10px 16px;background:#b00020;color:#fff;font:14px monospace;white-space:pre-wrap'; }
      bar.textContent = 'Build error: ' + s.error;
    } else if (bar) bar.remove();
    if (seen && s.id !== seen) return location.reload();
    setTimeout(() => poll(s.id), 400);
  }).catch(() => setTimeout(() => poll(seen), 2000));
})();
</script>"""

STARTER = LIB / "starter.txt"  # new-checklist template; {name} is replaced


def starter(name):
    return STARTER.read_text(encoding="utf-8").replace("{name}", name)


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def title_of(path, body):
    m = re.search(r"^\s*===\s*(.+?)\s*$", body, re.M)
    return m.group(1) if m else path.stem.replace("-", " ").title()


def assets():
    """Return (css, js): the stylesheet with colours.toml variables prepended, and the renderer."""
    css = (LIB / "checklist.css").read_text(encoding="utf-8")
    css = colour_vars(css) + "\n" + css
    js = (LIB / "checklist.js").read_text(encoding="utf-8")
    return css, js


def page_html(title, css, js, toolbar, body="", note=""):
    # The source lives inside a <script> tag; only "</script" could break out of it.
    body = re.sub(r"</(script)", r"<\\/\1", body, flags=re.I)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
{css}
</style>
</head>
<body>
{toolbar}
<main id="out"></main>
{note}
<script type="text/plain" id="checklist">
{body}
</script>
<script>
{js}
</script>
{RELOAD_JS}
</body>
</html>
"""


def build_one(path, css, js):
    body = path.read_text(encoding="utf-8")
    title = title_of(path, body)
    toolbar = """<div class="toolbar">
  <a href="index.html">&larr; All checklists</a>
  <button onclick="window.print()">Print / save as PDF</button>
</div>"""
    note = f"<!-- Generated from checklists/{path.name} by build.py — edit that file, not this one. -->"
    dest = DIST / f"{path.stem}.html"
    dest.write_text(page_html(title, css, js, toolbar, body, note), encoding="utf-8")
    return dest, title


def colour_vars(css):
    """Turn colours.toml into a :root block of --c-* variables, checked against what the CSS uses."""
    try:
        colours = tomllib.loads(COLOURS.read_text(encoding="utf-8")).get("colours", {})
    except (OSError, tomllib.TOMLDecodeError) as e:
        raise SystemExit(f"colours.toml: {e}")
    used = set(re.findall(r"var\(--c-([\w-]+)\)", css))
    missing = sorted(used - colours.keys())
    if missing:
        raise SystemExit(f"colours.toml: missing {', '.join(missing)}")
    for key in sorted(colours.keys() - used):
        print(f"  warning: colours.toml: '{key}' isn't used by lib/checklist.css")
    for key, value in colours.items():
        if not isinstance(value, str) or re.search(r"[;{}<>]", value):
            raise SystemExit(f"colours.toml: {key} = {value!r} isn't a valid colour")
    return ":root {\n" + "".join(f"  --c-{k}: {v};\n" for k, v in colours.items()) + "}"


def build_all():
    DIST.mkdir(exist_ok=True)
    css, js = assets()
    built = []
    for path in sorted(SRC.glob("*.txt")):
        dest, title = build_one(path, css, js)
        built.append((dest.name, title))
        print(f"  {path.relative_to(ROOT)} -> {dest.relative_to(ROOT)}")
    # Remove outputs whose source was deleted
    keep = {name for name, _ in built} | {"index.html"}
    for stale in DIST.glob("*.html"):
        if stale.name not in keep:
            stale.unlink()
            print(f"  removed {stale.relative_to(ROOT)}")
    items = "\n".join(
        f'    <li><a href="{html.escape(n)}">{html.escape(t)}</a></li>' for n, t in built
    ) or "    <li>No checklists yet — run <code>python3 build.py new \"Name\"</code></li>"
    (DIST / "index.html").write_text(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Checklists</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font-family: Calibri, "Segoe UI", Carlito, Arial, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 16px; line-height: 1.6; }}
  h1 {{ color: #e4452f; }}
  a {{ font-size: 1.15rem; }}
  #edit {{ display: none; }}
</style>
</head>
<body>
  <h1>Checklists</h1>
  <ul>
{items}
  </ul>
  <p id="edit"><a href="/__editor">Open the editor &rarr;</a></p>
  <script>if (location.protocol.startsWith('http')) document.getElementById('edit').style.display = 'block';</script>
{RELOAD_JS}
</body>
</html>
""", encoding="utf-8")
    STATE.update(id=str(time.time()), error=None)


class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    """Serves dist/, plus the editor and its small file API under /__."""

    def send_body(self, body, content_type="text/html; charset=utf-8", status=200):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, obj, status=200):
        self.send_body(json.dumps(obj), "application/json", status)

    def checklist_path(self, query):
        name = parse_qs(query).get("name", [""])[0]
        return SRC / f"{name}.txt" if NAME_RE.match(name) else None

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/__build":
            return self.send_json(STATE)
        if url.path == "/__editor":
            return self.send_body((LIB / "editor.html").read_text(encoding="utf-8"))
        if url.path == "/__preview":
            # Empty page shell the editor renders into, with the same CSS and renderer as dist/.
            try:
                css, js = assets()
            except SystemExit as e:
                return self.send_body(str(e), "text/plain; charset=utf-8", 500)
            return self.send_body(page_html("Preview", css, js, ""))
        if url.path == "/__api/list":
            return self.send_json([p.stem for p in sorted(SRC.glob("*.txt"))])
        if url.path == "/__api/file":
            path = self.checklist_path(url.query)
            if not path or not path.exists():
                return self.send_json({"error": "not found"}, 404)
            return self.send_body(path.read_text(encoding="utf-8"), "text/plain; charset=utf-8")
        if url.path == "/__api/starter":
            name = parse_qs(url.query).get("name", ["New"])[0]
            return self.send_body(starter(name), "text/plain; charset=utf-8")
        return super().do_GET()

    def do_PUT(self):
        # Only accept saves from pages served by this server (blocks other sites writing files).
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            return self.send_json({"error": "forbidden"}, 403)
        url = urlsplit(self.path)
        path = self.checklist_path(url.query) if url.path == "/__api/file" else None
        if not path:
            return self.send_json({"error": "bad name: use lowercase letters, digits and dashes"}, 400)
        if "create" in parse_qs(url.query, keep_blank_values=True) and path.exists():
            return self.send_json({"error": f"{path.name} already exists"}, 409)
        length = int(self.headers.get("Content-Length", 0))
        text = self.rfile.read(length).decode("utf-8")
        SRC.mkdir(exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return self.send_json({"saved": path.name})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def serve():
    """Serve dist/ on the first free port from 8000; return the URL."""
    handler = functools.partial(PreviewHandler, directory=str(DIST))
    for port in range(8000, 8020):
        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            continue
    else:
        raise SystemExit("No free port between 8000 and 8019 for the preview server")
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://localhost:{port}/"


def snapshot():
    files = list(SRC.glob("*.txt")) + list(LIB.glob("*")) + [COLOURS]
    return {p: p.stat().st_mtime for p in files if p.exists()}


def watch(open_path=None):
    """Serve the preview, optionally open `open_path` in the browser, and rebuild on changes."""
    url = serve()
    print(f"Live preview: {url}  (pages reload after each rebuild)")
    print(f"Editor:       {url}__editor")
    print("Watching for changes (Ctrl+C to stop)…")
    if open_path is not None:
        webbrowser.open(url + open_path)
    last = snapshot()
    try:
        while True:
            time.sleep(0.5)
            now = snapshot()
            if now != last:
                last = now
                print(time.strftime("%H:%M:%S"), "rebuilding")
                try:
                    build_all()
                except (SystemExit, Exception) as e:
                    print("  error:", e)
                    STATE["error"] = str(e)
    except KeyboardInterrupt:
        pass


def main(argv):
    if argv[:1] == ["new"]:
        if len(argv) < 2:
            raise SystemExit('usage: python3 build.py new "Aircraft Name"')
        name = " ".join(argv[1:])
        path = SRC / f"{slugify(name)}.txt"
        if path.exists():
            raise SystemExit(f"{path.relative_to(ROOT)} already exists")
        SRC.mkdir(exist_ok=True)
        path.write_text(starter(name), encoding="utf-8")
        print(f"Created {path.relative_to(ROOT)}")
        build_all()
        return
    build_all()
    if argv[:1] == ["edit"]:
        watch(open_path="__editor")
    elif "--watch" in argv:
        watch(open_path="" if "--open" in argv else None)


if __name__ == "__main__":
    main(sys.argv[1:])
