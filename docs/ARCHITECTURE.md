# Architecture

Short map of how the app is organized.

For folder cleanup history and remaining notes, see [SRC_STRUCTURE_AUDIT.md](SRC_STRUCTURE_AUDIT.md).

## App surfaces

- `src/views/HomeView.vue` + `src/skills/skills-index.js`: skills browse/detail page.
- `src/views/PlannerView.vue`: planner shell (menu / tree / load sections).
- `src/views/PatchNotesView.vue`: patch notes list/search with skill tooltips.
- `src/views/EditorView.vue` (dev only): JSON editor for `skills.json` / `subskills.json`.

Routes are declared in `src/router/index.js`. Dev routes are centralized in `src/shared/dev-routes.js`.

## Main folders

- `src/components/`: Vue UI by area (`planner`, `editor`, `skills`).
- `src/composables/`: feature composables (`usePatch*`, `usePlanner*`).
- `src/skills/`: skills domain models, restrictions, calculations, search/index runtime.
- `src/character/`: character model, allocation, stats, quests, build I/O normalization.
- `src/planner/`: planner page shell — init/session, DOM handlers, saved builds UI, URL/file I/O, Pinia bridge.
- `src/tree/`: skill tree UI — render, arrows, tooltips, variants, `Tree` class, tree_struct merge.
- `src/shared/`: version config, skill catalog store (`skill-data-store`), tooltip helpers, utils.
- `src/styles/`: shared CSS (tree layout, character sidebar, dropdown).

## Planner layers

- **Character domain:** `src/character/planner-core.js` (facade) + `Character.js` and `planner-*` slices.
- **Tree UI:** `src/tree/tree-render.js`, `tree-tooltip.js`, `tree-arrows.js`, `tree-data.js`, `skill-variants.js`, `Tree.js`.
- **Planner shell:** `src/planner/planner-init.js`, `planner-session.js`, `planner-dom-handlers.js`, `planner-ui-updates.js`, `saved-builds-ui.js`, plus URL/storage helpers.
- Vue planner components import these modules directly (no `tree-core` facade).

## Data flow

1. `public/tree_data/versions.json` selects active/default game version.
2. `src/shared/skill-data-store.js` loads catalog and details from `public/tree_data/<major>_<minor>/`.
3. Feature layer maps loaded rows into view/domain models:
   - Skills page via `src/skills/skills-index.js`
   - Planner via `src/planner/*` + `src/tree/*` + `src/character/*`
   - Patch notes tooltip expansion via `src/composables/usePatchNotesData.js`
4. Version selection/override is managed in `src/shared/version-config.js`.

## Public data layout

- `public/tree_data/stats.json`: stat definitions and formats.
- `public/tree_data/<major>_<minor>/skills.json`: primary skill data.
- `public/tree_data/<major>_<minor>/subskills.json`: optional linked subskills.
- `public/tree_data/<major>_<minor>/tree_struct.json`: planner tree positions + prerequisites.
- `public/patch_notes/index.json` + `public/patch_notes/*.md`: patch notes manifest/content.
