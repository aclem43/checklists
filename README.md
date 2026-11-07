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
python3 build.py                    # build everything into dist/
python3 build.py --watch            # rebuild on save; refresh the browser to see changes
python3 build.py new "Cessna 172"   # create checklists/cessna-172.txt from a starter
```

Open `dist/index.html`, pick a checklist, and click **Print / save as PDF**. Print at 100% scale with no margins; the page size is set for you. Each file in `dist/` is standalone, so you can send it to someone on its own.

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

## Colours

All colours are in `colours.toml`, and each one has a comment saying where it's used. Edit a value, then rebuild (or leave `--watch` running). The build stops if a colour the stylesheet needs is missing, and warns about entries nothing uses.

To change the font, edit `lib/checklist.css`.
