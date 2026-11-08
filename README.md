# Checklists

Plain-text checklists that build into printable HTML pages. Uses only Python 3, with nothing to install.

```
checklists/   your checklists, one .txt file each   ← edit these
colours.toml  colour settings for every checklist
lib/          shared stylesheet, renderer, editor page and new-checklist template
app/          Electron desktop app (see "Desktop app" below)
dist/         generated HTML; open in a browser and print (don't edit)
build.py      the build script
```

## Usage

```sh
python3 build.py edit               # open the editor in your browser
python3 build.py --watch --open     # rebuild on save; open pages reload themselves
python3 build.py                    # build everything into dist/ once
python3 build.py new "Cessna 172"   # create checklists/cessna-172.txt from a starter
```

**Editor** (`python3 build.py edit`, at `http://localhost:8000/__editor`): the text is on the left and a live preview of the printed pages is on the right.
- Click a row in the preview to jump to its line.
- Ctrl+S saves.
- **Syntax** shows the cheat-sheet; click an entry to insert it.
- **Print / PDF** prints what's in the editor, including unsaved changes.

Saving rebuilds `dist/`. If you edit the same file in VS Code instead, the editor picks up the change as long as it has no unsaved edits of its own.

### Desktop app (Electron)

The same editor as a desktop app, with Export PDF (at the exact A5/A4 page size, no print dialog), Export HTML, and a native menu. It needs Node.js.

```sh
npm install          # once
npm start            # run the app
npm run install:linux     # install for this user: app menu entry + `checklist-editor` command (no sudo)
npm run uninstall:linux   # remove it again (your checklists are kept)
npm run dist:linux   # build release/Checklist Editor-<version>.AppImage (needs libfuse2t64 to run)
npm run dist:win     # Windows installer (best built on Windows)
npm run dist:mac     # Mac .dmg (must be built on a Mac)
npm run smoke        # headless check: load the editor, export a PDF, exit
```

Where it keeps checklists:
- **Run from source:** this project's `checklists/` folder.
- **Installed:** `~/Documents/Checklists/checklists/`.
- **File → Open Folder…** switches to another folder. A `colours.toml` in that folder overrides the default colours.

The app remembers the last folder you used.

Code: `app/main.js` (window, menu, files, PDF export), `app/preload.js` (the API the editor page can use), `app/assemble.js` (builds the preview and standalone pages, mirroring `build.py`). The editor page, renderer and stylesheet in `lib/` are shared with the browser editor.

**Printing:** open a page from `dist/` and click **Print / save as PDF**. Print at 100% scale with no margins; the page size is set for you. Each file in `dist/` is standalone, so you can send it to someone on its own.

On screen, a page whose text had to shrink shows a small note, and a page that overflows even at 6pt gets a red outline. Neither is printed.

## Syntax

```
=== Title       start a new page (title is optional). Every second page is mirrored for binding
---             move to the next column
# Text          navy section header
#! Text         red section header
> Text          small centred sub-label        >! Text   same, in red
! Text          yellow brief bar
!! Text         big red warning (e.g. CLEAR PROP!)
~ M | Text      mnemonic row (letter on the left, text centred)
Item | Action   normal row
A | B | C       table row: with two or more |, consecutive rows line up in columns.
                A blank line between table rows draws a heavier rule (e.g. to group by RPM).
                A blank cell after the first (Fuel | 48 | |) makes a taller write-in row
[img path]      image, e.g. [img images/cg-envelope.png] (path relative to checklists/)
// comment      ignored
```

### Images

`[img path]` puts an image (PNG, JPEG, GIF, WebP or SVG) from the `checklists/` folder on the page. It fills the column's width; if the column runs out of room, images shrink (keeping their shape) before any text does. For a big chart, give its page one column:

```
=== C172RG Weight & Balance
@columns 1
[img images/c172rg-loading-graph.png]
[img images/c172rg-cg-envelope.png]
```

Built and exported pages embed the images, so each file still works on its own. A white image background takes on the page's `@paper` colour. Scans print best cropped tight, rotated upright and cleaned to black on white; about 1400 px wide is plenty for an A5 page.

If a page's content doesn't fit, its text shrinks automatically, down to 6pt. If it still doesn't fit, split it with `===` or `---`.

## Settings

Optional lines at the top of a checklist file:

| Setting    | Values                                                    | Default |
|------------|-----------------------------------------------------------|---------|
| `@size`    | `A5`, `A4`, `Letter`, each also with `-landscape`         | `A5`    |
| `@font`    | starting font size in pt                                  | `8.5`   |
| `@columns` | columns per page (also per page, like `@paper`)           | `2`     |
| `@binding` | `on` (wider inside margin, mirrored) / `off`              | `on`    |
| `@footer`  | footer text on every page (see below)                     | none    |
| `@paper`   | sheet colour: any CSS colour (`pink`, `#ffd6e0`, …)       | `paper` in `colours.toml` |

`@paper` and `@columns` can also apply to a single page. At the top of the file they apply to every page; on a line after `===` they apply only to that page:

```
=== Emergency Checklist
@paper pink
```

`@footer` puts the same footer on every page. Use `|` to split it into left and right parts; without `|` the text is centred. `{page}` and `{pages}` are replaced with the page number and the page count:

```
@footer Version 2 · 8 Nov 2026 | Page {page} of {pages}
```

## Colours

All colours are in `colours.toml`, and each one has a comment saying where it's used. Edit a value, then rebuild (or leave `--watch` running). The build stops if a colour the stylesheet needs is missing, and warns about entries nothing uses.

To change the font, edit `lib/checklist.css`.
