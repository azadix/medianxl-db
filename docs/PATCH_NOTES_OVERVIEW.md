# Patch Notes Overview

How patch notes content, search, and skill tooltips work.

## Entry points

- Route: `/patch-notes` in `src/router/index.js`.
- View: `src/views/PatchNotesView.vue`.
- Composables:
  - `src/composables/usePatchNotesData.js`
  - `src/composables/usePatchNotesSearch.js`
  - `src/composables/usePatchSkillTooltip.js`

## Data pipeline

1. Load patch file list from `public/patch_notes/index.json`.
2. Fetch each markdown file from `public/patch_notes/*.md`.
3. Convert version labels (for example `2.13.5`) to tree-data folder keys (`2_13`) with `patchVersionToFolderKey` from `src/shared/version-config.js`.
4. Preload skill matcher maps from `tree_data/<folder>/skills.json` for marker lookup.
5. Render markdown with `marked`.

## Skill marker and tooltip pipeline

- Skill markers use `{{Skill Name}}` syntax in markdown.
- `usePatchNotesData.js` replaces markers with interactive highlight spans.
- On hover/focus, `usePatchSkillTooltip.js` resolves the referenced skill and requests tooltip HTML.
- Tooltip HTML is built from expanded skill text via:
  - `buildTooltipHtmlForSkill` in `usePatchNotesData.js`
  - shared builders in `src/shared/tooltip-html.js`
- Placeholder expansion uses `expandPlaceholdersWithScaling` and tree skill store data for the matching folder/version.

## Search behavior

- Search is line-based and case-insensitive (`usePatchNotesSearch.js`).
- Results are grouped as cards with one matched line per card.
- "View full patch" clears search, opens the target section, then scrolls/highlights matching text.
- "Jump to Top" scrolls to the top of the current visible section below sticky search controls.

## Version handling

- Patch-note tooltip expansion sets a temporary build version override via `setBuildVersionOverride`.
- Folder-aware loading ensures tooltip expansion uses the same `tree_data/<major>_<minor>` as the patch section being viewed.
