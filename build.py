#!/usr/bin/env python3
"""Build printable checklists.

  python3 build.py               build every checklists/*.txt into dist/*.html
  python3 build.py --watch       rebuild whenever a checklist or lib/ file changes
  python3 build.py new "Name"    start a new checklist from the starter template

Each output file is standalone (CSS and JS inlined), so it can be emailed or opened anywhere.
"""
import html
import re
import sys
import time
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "checklists"
LIB = ROOT / "lib"
DIST = ROOT / "dist"
COLOURS = ROOT / "colours.toml"

SIZES = {  # name -> (width, height, @page size)
    "A5": ("148mm", "210mm", "A5"),
    "A5-landscape": ("210mm", "148mm", "A5 landscape"),
    "A4": ("210mm", "297mm", "A4"),
    "A4-landscape": ("297mm", "210mm", "A4 landscape"),
    "Letter": ("8.5in", "11in", "letter"),
    "Letter-landscape": ("11in", "8.5in", "letter landscape"),
}
DEFAULTS = {"size": "A5", "font": "8.5", "columns": "2", "binding": "on"}

STARTER = """\
// Settings (optional): @size A5 | A4 | Letter (add -landscape), @font 8.5, @columns 2, @binding on|off
@size A5

=== {name} Checklist
# 1. Before Start
Item | Action
Another item | Check
! A yellow brief bar
---
# 2. Next Section
>! A red sub-label
Item | Action
!! BIG WARNING
~ M | Mnemonic row
"""


def parse(path):
    """Split @directives off the top of the source; return (settings, body)."""
    settings, body = dict(DEFAULTS), []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*@(\w+)\s+(.+?)\s*$", line)
        if m:
            key = m.group(1).lower()
            if key not in DEFAULTS:
                raise SystemExit(f"{path.name}: unknown setting @{key} (known: {', '.join(DEFAULTS)})")
            settings[key] = m.group(2)
        else:
            body.append(line)
    if settings["size"] not in SIZES:
        raise SystemExit(f"{path.name}: unknown @size {settings['size']} (known: {', '.join(SIZES)})")
    return settings, "\n".join(body)


def title_of(path, body):
    m = re.search(r"^\s*===\s*(.+?)\s*$", body, re.M)
    return m.group(1) if m else path.stem.replace("-", " ").title()


def build_one(path, css, js):
    settings, body = parse(path)
    w, h, page = SIZES[settings["size"]]
    title = title_of(path, body)
    # The source lives inside a <script> tag; only "</script" could break out of it.
    body = re.sub(r"</(script)", r"<\\/\1", body, flags=re.I)
    bind = "" if settings["binding"].lower() in ("on", "yes", "true") else ' class="no-bind"'
    out = f"""<!DOCTYPE html>
<html lang="en"{bind}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
{css}
:root {{ --pw: {w}; --ph: {h}; --cols: {int(settings["columns"])}; }}
@media print {{ @page {{ size: {page}; }} }}
</style>
</head>
<body>
<div class="toolbar">
  <a href="index.html">&larr; All checklists</a>
  <button onclick="window.print()">Print / save as PDF</button>
</div>
<main id="out" data-font="{float(settings["font"])}"></main>
<!-- Generated from checklists/{path.name} by build.py — edit that file, not this one. -->
<script type="text/plain" id="checklist">
{body}
</script>
<script>
{js}
</script>
</body>
</html>
"""
    dest = DIST / f"{path.stem}.html"
    dest.write_text(out, encoding="utf-8")
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
    css = (LIB / "checklist.css").read_text(encoding="utf-8")
    css = colour_vars(css) + "\n" + css
    js = (LIB / "checklist.js").read_text(encoding="utf-8")
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
</style>
</head>
<body>
  <h1>Checklists</h1>
  <ul>
{items}
  </ul>
</body>
</html>
""", encoding="utf-8")


def snapshot():
    files = list(SRC.glob("*.txt")) + list(LIB.glob("*")) + [COLOURS]
    return {p: p.stat().st_mtime for p in files if p.exists()}


def main(argv):
    if argv[:1] == ["new"]:
        if len(argv) < 2:
            raise SystemExit('usage: python3 build.py new "Aircraft Name"')
        name = " ".join(argv[1:])
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        path = SRC / f"{slug}.txt"
        if path.exists():
            raise SystemExit(f"{path.relative_to(ROOT)} already exists")
        SRC.mkdir(exist_ok=True)
        path.write_text(STARTER.format(name=name), encoding="utf-8")
        print(f"Created {path.relative_to(ROOT)}")
        build_all()
        return
    build_all()
    if "--watch" in argv:
        print("Watching for changes (Ctrl+C to stop)…")
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
                    except SystemExit as e:
                        print("  error:", e)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main(sys.argv[1:])
