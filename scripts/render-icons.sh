#!/usr/bin/env bash
# Render every icon from build/icon.svg (run after editing the SVG; needs google-chrome or chromium):
#   build/icon.png             1024px, used by electron-builder for the .ico/.icns and the window icon
#   build/icons/<N>x<N>.png    standard Linux sizes, installed by scripts/install-linux.sh
#   lib/editor.html            the editor's tab icon (embedded SVG)
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[[ -n "$CHROME" ]] || { echo "Needs google-chrome or chromium to render the SVG" >&2; exit 1; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

render() { # size, output
  printf '<!DOCTYPE html><style>html,body{margin:0;background:transparent}img{display:block;width:%spx;height:%spx}</style><img src="file://%s/build/icon.svg">' \
    "$1" "$1" "$PWD" > "$TMP/r.html"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars --default-background-color=00000000 \
    --window-size="$1,$1" --screenshot="$2" "file://$TMP/r.html" 2>/dev/null
}

render 1024 build/icon.png
mkdir -p build/icons
for n in 16 24 32 48 64 128 256 512; do render "$n" "build/icons/${n}x${n}.png"; done

python3 - <<'EOF'
import re, urllib.parse
from pathlib import Path
svg = Path("build/icon.svg").read_text()
svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
svg = re.sub(r">\s+<", "><", svg).strip().replace('"', "'")  # single quotes: safe inside href="..."
uri = "data:image/svg+xml," + urllib.parse.quote(svg, safe=" =:/,.-'")  # '#' must stay encoded
page = Path("lib/editor.html")
html, n = re.subn(r'<link rel="icon" href="[^\n]*\n', f'<link rel="icon" href="{uri}">\n', page.read_text(), count=1)
if n != 1:
    raise SystemExit("lib/editor.html: no <link rel=\"icon\"> line to replace")
page.write_text(html)
EOF
echo "Rendered build/icon.png, build/icons/*.png and the editor favicon."
