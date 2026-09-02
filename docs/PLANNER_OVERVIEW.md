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

- `src/planner/planner-init.js`, `planner-session.js`, `planner-dom-handlers.js`, `planner-ui-updates.js`, `saved-builds-ui.js`: planner page shell/runtime.
- `src/planner/build-url-codec.js` + `src/planner/tree-url-sync.js`: build URL encode/decode + URL sync helpers.
- Vue components import these modules directly.

## Character and allocation layer

Canonical character domain lives in `src/character/`:

- `src/character/planner-core.js`: planner singleton, allocation, quests, stats, import/export.
- `src/character/Character.js`: character class.
- `src/character/planner-*.js`: stat/quest helper modules.
- `src/tree/Tree.js`: loaded class skill-list wrapper for the tree UI.

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

- Catalog and skill details are loaded through `src/shared/skill-data-store.js`.
- Active version is controlled by `src/shared/version-config.js` and the navbar version selector.
