# Item icon generation

Inventory icons are individual WebP files (variable size, not atlases), keyed by the
catalog `icon` field (e.g. `invpa4` → `public/icons/item_icons/invpa4.webp`).

Run the commands below from the repo root.

Item DC6s come from the game MPQs (`data/global/items/*.dc6` in `d2data.mpq`,
`d2exp.mpq`, and Median’s `itemsgfx` archive). Set `d2_game_dir` and `qdc6_exe`
in `tools/tools.local.json`.

1. Extract DC6s from the install and convert them to PNGs:

```bash
python tools/item_icons/extract_item_icons.py --version 2.14 --overwrite
```

Pass `--skip-mpq` to convert DC6s already in `tools/item_icons/input/`.

2. Publish WebPs (optionally filter to icons referenced by the version item files):

```bash
python tools/item_icons/publish_item_icons.py --version 2.14
```

Item data lives in `public/items/<version>/` as `baseitems.json`, `charms.json`,
`other.json`, and `socketables.json`.