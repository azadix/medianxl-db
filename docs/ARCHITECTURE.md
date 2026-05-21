# Architecture

Short map of how the app is organized.

## App surfaces

- `src/views/HomeView.vue` + `src/skills/skillsIndex.js`: skills browse/detail page.
- `src/views/PlannerView.vue`: planner shell (menu/src/tree/load sections).
- `src/views/PatchNotesView.vue`: patch notes list/search with skill tooltips.
- `src/views/EditorView.vue` (dev only): JSON editor for `skills.json` / `subskills.json`.

Routes are declared in `src/router/index.js`. Dev routes are centralized in `src/shared/dev-routes.js`.

## Main folders

- `src/components/`: Vue UI by area (`planner`, `editor`, `skills`).
- `src/composables/`: feature composables (`usePatch*`, `usePlanner*`).
- `src/skills/`: skills domain models, restrictions, calculations, search/index runtime.
- `src/character/`: character/planner state, allocation logic, stats, quests, import/export.
- `src/planner/`: URL codec/sync, saved builds, planner bridges.
- `src/shared/`: version config, tooltip HTML helpers, tree struct helpers, generic utils.

## Planner runtime split

Planner still uses the `src/tree/` runtime modules for rendering and DOM plumbing, but these are now thinly split and partially bridged to `src/*` modules:

- `src/tree/tree-core.js`: compatibility facade that re-exports planner modules.
- `src/tree/planner-*.js`, `src/tree/tree-render.js`, `src/tree/tree-tooltip.js`: tree render and interactions.
- `src/tree/skill-data-store.js`: loaded skill/catalog store used by planner, skills index, and patch-note tooltips.

Character state is implemented in `src/character/character-state.js` (canonical location).

## Data flow

1. `public/tree_data/versions.json` selects active/default game version.
2. `src/tree/skill-data-store.js` loads catalog and details from `public/tree_data/<major>_<minor>/`.
3. Feature layer maps loaded rows into view/domain models:
   - Skills page via `src/skills/skillsIndex.js`
   - Planner via `src/tree/*` + `src/character/*`
   - Patch notes tooltip expansion via `src/composables/usePatchNotesData.js`
4. Version selection/override is managed in `src/shared/version-config.js`.

## Public data layout

- `public/tree_data/stats.json`: stat definitions and formats.
- `public/tree_data/<major>_<minor>/skills.json`: primary skill data.
- `public/tree_data/<major>_<minor>/subskills.json`: optional linked subskills.
- `public/tree_data/<major>_<minor>/tree_struct.json`: planner tree positions + prerequisites.
- `public/patch_notes/index.json` + `public/patch_notes/*.md`: patch notes manifest/content.
