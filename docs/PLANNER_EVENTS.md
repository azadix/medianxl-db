# Planner window events

Custom events on `window` bridge legacy DOM modules, Vue components, and Pinia. Emitters dispatch; listeners refresh UI or recompute derived state.

## Skill allocation and character state

| Event | Emitters | Listeners | Purpose |
|-------|----------|-----------|---------|
| `skillPointsChanged` | `planner-instance.js`, `planner-core.js` (add/remove), `PlannerSidebarTabQuests.vue`, `saved-builds-ui.js` | Pinia `planner.js` (via `attachWindowSync`), `planner-init.js`, `tree-tooltip.js`, `planner-stats-panel.js`, `PlannerSidebarConfig.vue`, `PlannerSavedBuildsList.vue`, `saved-builds-ui.js` | Tree points, oSkills, or quest rewards changed; refresh tooltips, conditions, portraits |
| `plannerStateChanged` | `planner-instance.js`, `planner-init.js` | Pinia `planner.js`, `planner-stats-panel.js` | Broader planner mutations (class, level options, import, reset) |
| `characterLevelChanged` | `Character.js` | `planner-init.js`, `planner-stats-panel.js` | Manual level change; update skill pool display |
| `questCompletionChanged` | `Character.js` | `planner-init.js`, `planner-stats-panel.js`, `sidebarTabQuests.js` | Quest tab checkbox toggled |

## Stats panel and tooltips

| Event | Emitters | Listeners | Purpose |
|-------|----------|-----------|---------|
| `characterStatsChanged` | `Character.js`, `planner-core.js`, `planner-stats-panel.js`, `planner-init.js`, `planner-dom-handlers.js`, `saved-builds-ui.js` | `planner-init.js`, `planner-stats-panel.js`, `PlannerSavedBuildsList.vue` | Stat values or build load; refresh stat tooltips and portraits |
| `plannerStatsPanelRefresh` | `planner-core.js`, `planner-stats-panel.js` | `planner-stats-panel.js` | Re-render open stat tooltip after passive recompute |
| `statAllocationChanged` | `Character.js` | (quest/stat panel internals) | Stat point allocation from quest rewards |
| `tooltipRefresh` | `planner-ui-updates.js`, `SkillCard.vue` | `tree-tooltip.js` | Force skill tooltip HTML refresh |

## Planner UI sections

| Event | Emitters | Listeners | Purpose |
|-------|----------|-----------|---------|
| `plannerBuildNameChanged` | `planner-session.js` | `PlannerHeaderBar.vue` | Update header build name label |
| `plannerSidebarTabQuestsRefresh` | `planner-init.js`, `planner-dom-handlers.js`, `saved-builds-ui.js` | `sidebarTabQuests.js` | Reload quest tab DOM from character state |
| `plannerSidebarTabQuestsUiRefresh` | `sidebarTabQuests.js` | `PlannerSidebarTabQuests.vue` | Sync Vue quest tab after imperative refresh |
| `plannerSkillsRenderRequested` | `tree-render.js`, `planner-ui-updates.js` | `PlannerSkillsTree.vue` | Full tree re-render |
| `plannerSkillsLightUpdate` | `tree-render.js` | `PlannerSkillsTree.vue` | Update point badges without full render |
| `savedBuildsListRefresh` | `saved-builds-storage.js` | `PlannerSavedBuildsList.vue` | Refresh saved builds list |

## Config and data load

| Event | Emitters | Listeners | Purpose |
|-------|----------|-----------|---------|
| `plannerConfigChanged` | `planner-config-store.js` | `PlannerSidebarConfig.vue`, `tree-tooltip.js`, `planner-stats-panel.js` | Condition toggles (e.g. difficulty flags) |
| `skillDataStoreInitialized` | `skill-data-store.js` | `PlannerSidebarConfig.vue` | Game version JSON loaded; refresh condition UI |

## Pinia bridge

`stores/planner.js` listens to `skillPointsChanged`, `plannerStateChanged`, `characterStatsChanged`, `characterLevelChanged`, `questCompletionChanged`, and `plannerConfigChanged`, then bumps `revision`. Vue composables (`usePlannerRevisionRefresh`, `usePlannerSkillPoints`) watch that counter to avoid wiring every component to every event.

## Adding a new cross-layer feature

1. Prefer mutating character state in `planner-core.js` or slice modules, then dispatch the narrowest existing event.
2. If Vue needs to react, ensure the event is listed in `planner.js` `attachWindowSync` or listen directly in a composable.
3. Document new events in this file.
