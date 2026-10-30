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
npm test            # Vitest suites except TSW build audit (unit + skill data)
npm run test:unit   # domain logic + tooltip expansion (excludes TSW audit)
npm run test:data   # schema, placeholders, refs, scaling, spellcheck
npm run audit       # TSW dump vs planner requirement audit
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
- `tools/item_generation/` - wiki/TSW item catalog generators
- `tools/atlas_generation/` - class icon atlas generation scripts
- `tools/item_icons/` - inventory icon extraction / publish scripts
- `public/items/<major>_<minor>/` - item catalogs (`baseitems.json`, `charms.json`, `other.json`)
- `public/icons/item_icons/` - inventory icon WebPs (shared across versions)

## Useful scripts

- `npm run lint` - ESLint
- `npm test` / `npm run test:unit` / `npm run test:data` - Vitest suites (excludes TSW audit)
- `npm run audit` - TSW dump vs planner requirement audit
- `npm run spellcheck` - skill text spelling (`tools/spellcheck/`)
- `npm run generate:items` - refresh unique-stats, relics, and runewords from wiki HTML
- `npm run generate:items -- charms` - refresh charms from the TSW API
- `python tools/py/validate_skill_placeholders.py public/tree_data/2_13` - validate placeholders
- `python tools/py/stat_counter_statistics.py public/tree_data/2_13` - placeholder stat usage
- `python tools/atlas_generation/extract_icons.py --input-dir path/to/dc6` - convert icons-*.dc6 via qdc6 into class folders
- `python tools/atlas_generation/make_all_atlases.py --version 2.13` - rebuild class atlases
- `python tools/item_icons/extract_item_icons.py --version 2.14` - pull item DC6s from the game MPQs, then convert via qdc6
- `python tools/item_icons/publish_item_icons.py --version 2.14` - PNG → WebP under `public/icons/item_icons/`

## Tools

- [Atlas generation](tools/atlas_generation/README.md)
- [Item icon generation](tools/item_icons/README.md)
- [Spellcheck](tools/spellcheck/README.md)
- [Skill animator](tools/skill_animator/README.md)
