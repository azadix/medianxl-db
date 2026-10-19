# Atlas generation

Class icon atlases are built from sources in this folder and written to
`public/tree_data/<major>_<minor>/` as `class-*.webp`.

Run the commands below from the repo root. Image sources come from game `.dc6` files.

1. Extract `.dc6` files from game `.mpq` archives with `Ladik's MPQ Editor`
   (skill icons live under `data/global/themes/classic_sigma/game/skills/icons-*.dc6`)
2. Copy `tools/tools.local.json.example` to `tools/tools.local.json` and set `qdc6_exe`
3. Convert icon DC6s and install PNGs into `tools/atlas_generation/<class>/`:

```bash
python tools/atlas_generation/extract_icons.py --input-dir path/to/dc6/folder
```

4. Rebuild atlases:

```bash
python tools/atlas_generation/make_all_atlases.py --version 2.13
```

Pass `--qdc6` to override the path in `tools/tools.local.json`. Use `--overwrite` when replacing existing PNGs.
