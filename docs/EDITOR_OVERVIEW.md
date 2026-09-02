# Editor Overview

Developer-only JSON editor for skill data.

## Routes and modes

- Routes are defined in `src/shared/dev-routes.js` and added by `src/router/index.js` in dev mode.
- `/editor` uses mode `skills` and file `skills.json`.
- `/editor/subskills` uses mode `subskills` and file `subskills.json`.
- In production builds these routes redirect to `/`.

`src/views/EditorView.vue` is the single route component for both modes and passes mode props to sections.

## UI structure

- `src/components/editor/EditorListSection.vue`: table/list side.
- `src/components/editor/EditorEditSection.vue`: edit form side.
- `src/components/editor/EditorSkillsTable.vue`: table view for skills.
- `src/components/editor/EditorSubskillsTable.vue`: table view for subskills.

## Runtime/store modules

- `src/editor/editor-store.js`: in-memory buffer, load/reload, form apply, dirty state, version switching.
- `src/editor/editor-download.js`: downloads current buffer as JSON.
- `src/editor/editor-textarea-autocomplete.js`: textarea autocomplete for `{{stat}}`, `[[skill]]`, and `<<subskill>>` placeholders.
- `src/editor/editor.js`: compatibility export facade.

## Data sources

For selected version `<major>_<minor>`, editor reads:

- `tree_data/<major>_<minor>/skills.json` or `subskills.json` (active mode file)
- `tree_data/<major>_<minor>/game_meta.json` (class/tab/tag metadata)
- `tree_data/stats.json` (placeholder/stat helper data)
- `tree_data/versions.json` (version selector options)

The editor does not write to disk directly. It exports a file download, and contributors replace the repo file manually.

## Typical edit flow

1. Open `/editor` or `/editor/subskills`.
2. Select version from navbar selector.
3. Edit rows in-memory and click Apply.
4. Download JSON.
5. Replace the matching file under `public/tree_data/<major>_<minor>/`.
