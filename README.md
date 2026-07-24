# MedianDB

MedianDB is a Vue app for browsing MedianXL skills and planning builds.

- `Skills` page: search and inspect skill data
- `Planner` page: interactive skill tree and build planning
- `Version` selector: switch patch data

## Quick start

```bash
npm install
npm run dev
```

Open the Vite URL (usually under `/medianxl-db/`).

## Routes

- `/` - skills list and details
- `/planner` - build planner
- `/editor` - development-only tools (redirects to `/` in production)

## Build

```bash
npm run build
npm run preview
```

`npm run build` runs lint + spellcheck + Vite build.

## Testing

```bash
npm test            # all Vitest suites (unit + skill data)
npm run test:unit   # domain logic + tooltip expansion
npm run test:data   # schema, placeholders, refs, scaling, spellcheck
```

Update snapshots after intentional tooltip-output changes:

```bash
npx vitest run -u
```

Python is not required for tests (only for atlas generation and the optional `npm run spellcheck` CLI).

## Docs

- `docs/ARCHITECTURE.md` - app modules, data flow, and key folders
- `docs/DEVELOPMENT_WORKFLOW.md` - local setup, scripts, and common contributor tasks
- `docs/PLANNER_OVERVIEW.md` - planner route, runtime modules, and state flow
- `docs/EDITOR_OVERVIEW.md` - editor route modes, store, and JSON workflow
- `docs/PATCH_NOTES_OVERVIEW.md` - patch notes load/search/tooltip pipeline
- `docs/PATCH_RELEASE.md` - checklist for a new `tree_data` patch folder
- `docs/ADDING_SKILL_RULES.md` - how to add planner allocation rules
- `docs/DAMAGE_RANGES.md` - D2-style band damage for `{{*_damage}}` placeholders

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
- `py/` - Python utility scripts
- `spellcheck/` - dictionaries and spellcheck scripts
- `atlas_generation/` - class icon atlas generation scripts

## Useful scripts

- `npm run lint` - ESLint
- `npm run spellcheck` - spellcheck active version data (Python CLI)
- `npm test` / `npm run test:unit` / `npm run test:data` - Vitest suites
- `python py/validate_skill_placeholders.py public/tree_data/2_13` - validate placeholders
- `python py/stat_counter_statistics.py public/tree_data/2_13` - placeholder stat usage
- `python atlas_generation/make_all_atlases.py --version 2.13` - rebuild class atlases

## Atlas generation

Class icon atlases are built from sources in `atlas_generation/` and written to
`public/tree_data/<major>_<minor>/` as `class-*.png` (and matching `.webp` when generated).

Image sources come from game `.dc6` files:

1. Extract `.dc6` files from game `.mpq` archives with `Ladik's MPQ Editor`
2. Convert `.dc6` frames to `.png` with [`qdc6`](https://github.com/kambala-decapitator/qdc6)
3. Place/export the PNG sources into `atlas_generation/` and rebuild atlases

```bash
python atlas_generation/make_all_atlases.py --version 2.13
```

## Spellcheck

Spellcheck scans merged skill text (`description`, `restriction`, `skill_effect`) for
unknown words. It ignores placeholders like `{{...}}` and compares words against:

- `spellcheck/spelling-dict.txt` (known words)
- `spellcheck/ignore-dict.txt` (allowed exceptions)

If unknown words are found, it prints them by skill and exits with a non-zero status.

```bash
npm run spellcheck
python spellcheck/check_spelling.py public/tree_data/2_13
python spellcheck/generate_spelling_dict.py -o spellcheck/spelling-dict.txt
```

## Dependencies

- Node.js + npm - app runtime and build tooling
- Python 3.9+ - utility scripts (`py/`, `spellcheck/`, `atlas_generation/`)
- Pillow - required for atlas generation (`pip install pillow`)
- Vue 3, Vue Router, Pinia, Vite - frontend stack (managed in `package.json`)
