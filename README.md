# Checklists

Plain-text checklists that build into printable HTML pages. Uses only Python 3, with nothing to install.

```
checklists/   your checklists, one .txt file each   ← edit these
colours.toml  colour settings for every checklist
lib/          shared stylesheet and renderer (the look and layout)
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
// comment      ignored
```

If a page's content doesn't fit, its text shrinks automatically, down to 6pt. If it still doesn't fit, split it with `===` or `---`.

## Settings

Optional lines at the top of a checklist file:

| Setting    | Values                                                    | Default |
|------------|-----------------------------------------------------------|---------|
| `@size`    | `A5`, `A4`, `Letter`, each also with `-landscape`         | `A5`    |
| `@font`    | starting font size in pt                                  | `8.5`   |
| `@columns` | columns per page                                          | `2`     |
| `@binding` | `on` (wider inside margin, mirrored) / `off`              | `on`    |
| `@footer`  | footer text on every page (see below)                     | none    |

`@footer` puts the same footer on every page. Use `|` to split it into left and right parts; without `|` the text is centred. `{page}` and `{pages}` are replaced with the page number and the page count:

```
@footer Version 2 · 8 Nov 2026 | Page {page} of {pages}
```

## Colours

All colours are in `colours.toml`, and each one has a comment saying where it's used. Edit a value, then rebuild (or leave `--watch` running). The build stops if a colour the stylesheet needs is missing, and warns about entries nothing uses.

To change the font, edit `lib/checklist.css`.
