# Planner Overview

How the planner route is wired today.

## Entry points

- Route: `/planner` in `src/router/index.js`.
- View shell: `src/views/PlannerView.vue`.
- Main UI sections:
  - `src/components/planner/PlannerMenuSection.vue`
  - `src/components/planner/PlannerTreeSection.vue`
  - `src/components/planner/PlannerLoadSection.vue`
  - `src/components/planner/SkillTooltipHost.vue`

## State and refresh model

- Store: `src/stores/planner.js`
  - Tracks visible section (`menu`, `tree`, `load`, `defaults`)
  - Exposes `revision` counter used for reactive refresh.
- Bridge composable: `src/composables/usePlannerRevisionRefresh.js`
  - Attaches legacy window event listeners once.
  - Converts event updates into Pinia revision bumps.

## Planner modules

- `src/tree/tree-core.js`: planner facade exports used by Vue components.
- `src/tree/planner-init.js`, `src/tree/planner-dom-handlers.js`, `src/tree/planner-ui-updates.js`, `src/tree/saved-builds-ui.js`: planner runtime split from previous monolith.
- `src/planner/build-url-codec.js` + `src/planner/tree-url-sync.js`: build URL encode/decode + URL sync helpers.

## Character and allocation layer

Canonical character domain now lives in `src/character/`:

- `src/character/character-state.js`: planner singleton, allocation, quests, stats, import/export.
- `src/character/Character.js`, `src/character/Tree.js`: core domain classes.
- `src/character/planner-*.js`: stat/quest helper modules.

Allocation rules and restrictions are in `src/skills/domain/`:

- `skill-allocation-rules.js`
- `skill-restrictions.js`
- `skill-calculations.js`

## Skills tree rendering

- Vue tree UI: `src/components/planner/PlannerSkillsTree.vue`.
- Planner tree composable: `src/composables/usePlannerSkillsTree.js`.
- Render/tooltip helpers: `src/tree/tree-render.js`, `src/tree/tree-tooltip.js`, `src/tree/tree-arrows.js`.
- Layout and prerequisites from `public/tree_data/<version>/tree_struct.json`, applied through `src/shared/tree-struct.js`.

## Data dependencies

- Catalog and skill details are loaded through `src/tree/skill-data-store.js`.
- Active version is controlled by `src/shared/version-config.js` and the navbar version selector.
