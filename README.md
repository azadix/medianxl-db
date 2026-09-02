# MedianDB

MedianDB is a Vue app for browsing MedianXL skills and planning builds.

- `Skills` page: search and inspect skill data
- `Planner` page: interactive skill tree and build planning
- `Patch notes` page: searchable notes with skill tooltips
- `Version` selector: switch patch data
- Installable **PWA** (production build): offline app shell plus cached `tree_data` / icons / patch notes after first visit

## Quick start

```bash
npm install
npm run dev
```

Open the Vite URL (usually under `/medianxl-db/`).

## Routes

- `/` - redirects to `/skills`
- `/skills` - skills list and details
- `/planner` - build planner
- `/patch-notes` - searchable patch notes
- `/editor`, `/editor/subskills` - development-only tools (redirect to `/` in production)

## Build

```bash
npm run build
npm run preview
```

`npm run build` runs lint + Vitest + Vite build.
`npm run dev` runs Vitest first, then starts Vite.

### PWA testing

The service worker registers only in production builds. To try install / offline locally:

```bash
npm run build
npm run preview
```

Open the preview URL under `/medianxl-db/` (not the site root). Use Chromium-based browsers (Chrome, Brave, Edge) for “Install app”; Firefox still gets offline caching via the service worker but no desktop install UI.

Icons live under `public/icons/pwa/`. After changing icon art, rebuild before `preview` so `dist/` picks up the new files.

## Testing

```bash
npm test            # all Vitest suites (unit + skill data)
npm run test:unit   # domain logic + tooltip expansion
npm run test:data   # schema, placeholders, refs, scaling, spellcheck
npm run spellcheck  # skill text spelling only (dicts in tools/spellcheck/)
```

Update snapshots after intentional tooltip-output changes:

```bash
npx vitest run -u
```

Python is not required for tests (only for atlas generation / `tools/py/` utilities).

## Docs

- `docs/ARCHITECTURE.md` - app modules, data flow, and key folders
- `docs/DEVELOPMENT_WORKFLOW.md` - local setup, scripts, and common contributor tasks
- `docs/PLANNER_OVERVIEW.md` - planner route, runtime modules, and state flow
- `docs/EDITOR_OVERVIEW.md` - editor route modes, store, and JSON workflow
- `docs/PATCH_NOTES_OVERVIEW.md` - patch notes load/search/tooltip pipeline
- `docs/PATCH_RELEASE.md` - checklist for a new `tree_data` patch folder
- `docs/ADDING_SKILL_RULES.md` - how to add planner allocation rules

## Data layout

- `public/tree_data/versions.json` - available patch versions (`is_active` is default)
- `public/tree_data/stats.json` - global stat definitions
- `public/tree_data/<major>_<minor>/skills.json` - skill data for a patch
- `public/tree_data/<major>_<minor>/subskills.json` - optional subskills linked by `parentSkillId`

## Project layout

- `src/` - app code (Vue components, views, router, stores)
- `src/skills/` - skills page logic and domain models
- `src/character/` - character/planner domain state and rules
- `src/editor/` - dev-only editor runtime
- `src/tree/` - planner runtime/render modules (with compatibility facades)
- `tools/` - build helpers, Python utilities (`tools/py/`), spellcheck, atlas generation
- `tools/atlas_generation/` - class icon atlas generation scripts
- `tools/item_icons/` - inventory icon extraction / publish scripts
- `public/items/<major>_<minor>/` - item catalogs (`baseitems.json`, `charms.json`, `other.json`)
- `public/icons/item_icons/` - inventory icon WebPs (shared across versions)

## Useful scripts

- `npm run lint` - ESLint
- `npm test` / `npm run test:unit` / `npm run test:data` - Vitest suites
- `npm run spellcheck` - skill text spelling (`tools/spellcheck/`)
- `npm run build:item-icons` - publish inventory WebPs to `public/icons/item_icons/`
- `python tools/py/validate_skill_placeholders.py public/tree_data/2_13` - validate placeholders
- `python tools/py/stat_counter_statistics.py public/tree_data/2_13` - placeholder stat usage
- `python tools/py/diff_skills_vs_docs.py` - compare `skills.json` to mxl-extractor docs
- `python tools/py/convert_extractor_missing_skills.py` - build `skills_missing.json` from extractor exports
- `python tools/atlas_generation/extract_icons.py --input-dir path/to/dc6` - convert icons-*.dc6 via qdc6 into class folders
- `python tools/atlas_generation/make_all_atlases.py --version 2.13` - rebuild class atlases
- `python tools/item_icons/extract_item_icons.py --version 2.14` - convert `tools/item_icons/icons/*.dc6` via qdc6
- `python tools/item_icons/publish_item_icons.py --version 2.14` - PNG → WebP under `public/icons/item_icons/`

Extractor scripts resolve `mxl-extractor` via `--extractor`, `MXL_EXTRACTOR_ROOT`,
`tools/tools.local.json` (`mxl_extractor_root`), or a sibling `../mxl-extractor` clone.

## Atlas generation

Class icon atlases are built from sources in `tools/atlas_generation/` and written to
`public/tree_data/<major>_<minor>/` as `class-*.webp`.

Image sources come from game `.dc6` files:

1. Extract `.dc6` files from game `.mpq` archives with `Ladik's MPQ Editor`
   (skill icons live under `data/global/themes/classic_sigma/game/skills/icons-*.dc6`)
2. Copy `tools/tools.local.json.example` to `tools/tools.local.json` and set `qdc6_exe`
   (same file is used for `mxl_extractor_root` by the Python data scripts)
3. Convert icon DC6s and install PNGs into `tools/atlas_generation/<class>/`:

```bash
python tools/atlas_generation/extract_icons.py --input-dir path/to/dc6/folder
```

4. Rebuild atlases:

```bash
python tools/atlas_generation/make_all_atlases.py --version 2.13
```

Pass `--qdc6` to override the path in `tools/tools.local.json`. Use `--overwrite` when replacing existing PNGs.

## Item icon generation

Inventory icons are individual WebP files (variable size, not atlases), keyed by the
catalog `icon` field (e.g. `invpa4` → `public/icons/item_icons/invpa4.webp`).

Source DC6s live in `tools/item_icons/icons/` (inventory / item sprites from game `.mpq`
archives — typically under `data/global/ui/inv/` or the Median XL classic_sigma UI path).

1. Ensure `tools/tools.local.json` has `qdc6_exe` set (same as skill atlases)
2. Convert DC6s into working PNGs (defaults to `tools/item_icons/icons/`):

```bash
python tools/item_icons/extract_item_icons.py --version 2.14
```

3. Publish WebPs (optionally filter to icons referenced by the version item files):

```bash
python tools/item_icons/publish_item_icons.py --version 2.14
```

Item data lives in `public/items/<version>/` as `baseitems.json`, `charms.json`, and `other.json`.

Note: the current catalog mostly uses vanilla inventory stems (`invpa4`, `invamu`, …).
Custom MXL DC6s in `tools/item_icons/icons/` are published by filename stem and will
show up once matching catalog `icon` values exist.

## Spellcheck

Skill text spelling is checked as part of Vitest (`npm run test:data` / `npm test`),
or alone with `npm run spellcheck`.
It scans `description`, `restriction`, and `skillEffect`, ignores placeholders like
`{{...}}` / `[[...]]`, and compares words against:

- `tools/spellcheck/spelling-dict.txt` (known words)
- `tools/spellcheck/ignore-dict.txt` (allowed exceptions)

Add new game words to those dictionaries when tests fail on legitimate terms.

## Dependencies

- Node.js + npm - app runtime, build, and tests
- Python 3.9+ - atlas generation and utility scripts (`tools/atlas_generation/`, `tools/item_icons/`, `tools/py/`)
- Pillow - required for atlas / item icon generation (`pip install pillow`)
- Vue 3, Vue Router, Pinia, Vite - frontend stack (managed in `package.json`)
