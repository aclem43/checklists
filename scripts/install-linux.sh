#!/usr/bin/env bash
# Install Checklist Editor for the current user on Linux. No sudo, no FUSE needed.
#   App:      ~/.local/opt/checklist-editor/
#   Menu:     ~/.local/share/applications/checklist-editor.desktop
#   Icons:    ~/.local/share/icons/hicolor/{16x16..512x512,scalable}/apps/checklist-editor.{png,svg}
#   Command:  ~/.local/bin/checklist-editor
# Run again to update. Uninstall with: scripts/install-linux.sh --uninstall
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="$HOME/.local/opt/checklist-editor"
DESKTOP="$HOME/.local/share/applications/checklist-editor.desktop"
ICONS="$HOME/.local/share/icons/hicolor"
BIN="$HOME/.local/bin/checklist-editor"

refresh_menus() {
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  gtk-update-icon-cache -q -t "$ICONS" 2>/dev/null || true
  # KDE Plasma keeps its own menu and icon caches
  if command -v kbuildsycoca6 >/dev/null; then kbuildsycoca6 >/dev/null 2>&1 || true
  elif command -v kbuildsycoca5 >/dev/null; then kbuildsycoca5 >/dev/null 2>&1 || true; fi
  rm -f "$HOME/.cache/icon-cache.kcache"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -rf "$DEST"
  rm -f "$DESKTOP" "$BIN" "$ICONS"/*/apps/checklist-editor.png "$ICONS/scalable/apps/checklist-editor.svg"
  refresh_menus
  echo "Uninstalled. Your checklists and settings were not touched."
  exit 0
fi

echo "Building…"
npx electron-builder --linux dir >/dev/null

echo "Installing to $DEST"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -r release/linux-unpacked "$DEST"

# PNGs at the standard sizes (what every launcher can read) plus the SVG
for png in build/icons/*x*.png; do
  size=$(basename "$png" .png)
  install -Dm644 "$png" "$ICONS/$size/apps/checklist-editor.png"
done
install -Dm644 build/icon.svg "$ICONS/scalable/apps/checklist-editor.svg"

mkdir -p "$(dirname "$BIN")"
ln -sf "$DEST/checklist-editor" "$BIN"

mkdir -p "$(dirname "$DESKTOP")"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Checklist Editor
Comment=Edit aircraft checklists with a live print preview
Exec="$DEST/checklist-editor" %U
Icon=checklist-editor
Categories=Utility;
StartupWMClass=checklist-editor
Terminal=false
EOF

refresh_menus
echo "Done. Find \"Checklist Editor\" in your app menu, or run: checklist-editor"
