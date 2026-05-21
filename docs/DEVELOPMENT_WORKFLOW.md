# Development Workflow

Practical local workflow for contributors.

## Setup

```bash
npm install
npm run dev
```

Notes:

- `npm run dev` runs spellcheck first, then starts Vite.
- App routes are under the Vite base URL (often `/medianxl-db/`).

## Core scripts

- `npm run lint`: ESLint for JS/Vue files.
- `npm run spellcheck`: checks skill text placeholders/wording.
- `npm run build`: lint + spellcheck + Vite build + SPA 404 copy.
- `npm run preview`: serve the production build locally.

## Common contributor tasks

- **Add or update patch data**
  - Edit files in `public/tree_data/<major>_<minor>/`.
  - Update `public/tree_data/versions.json`.
  - Follow `docs/PATCH_RELEASE.md`.
- **Adjust planner allocation rules**
  - Work in `src/skills/domain/skill-allocation-rules.js` and `src/skills/domain/skill-restrictions.js`.
  - Integrate in `src/character/character-state.js`.
  - See `docs/ADDING_SKILL_RULES.md`.
- **Edit patch notes**
  - Add/update `public/patch_notes/*.md`.
  - Update `public/patch_notes/index.json`.
- **Use editor tools (dev only)**
  - Routes: `/editor` and `/editor/subskills`.
  - Exports are downloaded JSON files; replace repo files manually.

## Quick validation checklist

Before opening a PR:

1. Run `npm run lint`.
2. Run `npm run build`.
3. Smoke test `/skills`, `/planner`, `/patch-notes`.
4. If data changed, smoke test version switching in navbar selector.

## Current structure notes

- Canonical app modules live under `src/` (notably `src/character` and `src/skills`).
- Some root-level `tree/` modules remain as planner runtime/compatibility surfaces.
