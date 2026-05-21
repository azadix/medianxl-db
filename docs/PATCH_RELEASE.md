# Patch release checklist

Ordered steps when adding a new game patch folder under `public/tree_data/<major>_<minor>/`.

## 1. Data folder

1. Copy the previous patch folder (e.g. `2_12` → `2_13`) or scaffold from templates in `README.md`.
2. Update JSON in the new folder: `skills.json`, `tree_struct.json`, `game_meta.json`, `character_stats.json`, optional `subskills.json`.
3. Add a row to `public/tree_data/versions.json` with `major`, `minor`, `name`, and `is_active` (set `is_active` on the new default row; clear others if only one active).

## 2. Validation

```bash
npm run spellcheck
python py/validate_skill_placeholders.py public/tree_data/<major>_<minor>
python spellcheck/check_spelling.py public/tree_data/<major>_<minor>
```

Optional: `python py/stat_counter_statistics.py public/tree_data/<major>_<minor>` for placeholder stat usage.

## 3. Atlases

Rebuild class icon atlases for the new version:

```bash
python atlas_generation/make_all_atlases.py --version <major>.<minor>
```

Confirm `class-*.png` (and `.webp` if generated) land in `public/tree_data/<major>_<minor>/`.

## 4. Patch notes

1. Add markdown under `public/patch_notes/` (version string in front matter or filename per existing convention).
2. Update `public/patch_notes/index.json` manifest.
3. Smoke-test `/patch-notes`: search, `{{Skill Name}}` markers, tooltips per folder.

## 5. App smoke routes

- `/skills` — list, detail, scaling
- `/planner` — tree load, allocate points, export/import build URL
- Version selector — switch to new folder, reload, confirm data matches

Dev-only (local `npm run dev`):

- `/editor`, `/editor/subskills` — edit and download JSON
- `/calculations` — formula smoke checks

## 6. Build

```bash
npm run build
```

Fix lint/spellcheck failures before merge.

## Shared version utilities

- Keys: `src/shared/version-constants.js`
- Planner/patch folder naming: `versionToTreeAssetFolder`, `patchVersionToFolderKey` in `src/shared/version-config.js`
