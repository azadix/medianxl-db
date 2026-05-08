# MedianDB

**MedianDB** is a browser-based reference and planning tool for **MedianXL** skills. You can look up how skills work, compare classes, and plan character builds on an interactive skill tree. Everything runs locally in your browser; you do not need an account or a game install to use the site.

Use the top navigation to switch between the main areas below.

## Skills

The **Skills** page is a searchable catalog of skills for the selected **game version**. You can filter and sort the list, open a skill to read its full description, effects, scaling, and restrictions, and follow links or URL parameters to share a specific skill view.

## Planner

The **Planner** is where you plan a character build on the MedianXL skill tree:

- Pick a class and work through the tree the way you would in the game.
- See requirements, synergies, and skill details with tooltips as you hover or focus skills.
- Adjust character options (such as level, quests, or configuration that affects skill points) so point totals match how you want to plan.
- Use load/save style flows when you want to keep or restore a build (exact labels depend on the current UI).

Sections like **Menu**, **Tree**, and **Load** switch different parts of the planner workflow; the tree view is the main interactive grid of skills.

## Game version

A **Version** control in the navigation bar selects which MedianXL patch the data represents (for example different minor patches). Stats, skill text, and icons follow that version. Change the version when you want numbers and wording to match the patch you care about.

## Data and accuracy

Skill text, numbers, and icons come from curated game data shipped with the app. If something looks wrong for your patch, it may be a data or display bug; improvements are welcome via the repository.

## For developers

Web app for browsing MedianXL skills: a **skills catalog** (home) and an **interactive skill tree / build planner**. Data is loaded from **`public/tree_data/`** (JSON + class atlas PNGs). The UI is a **Vue 3** SPA built with **Vite**; it runs fully in the browser after build (no backend required).

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (with this repo’s base path, usually **`/medianxl-db/`** on the dev server, e.g. `http://localhost:5173/medianxl-db/`).

| Route | Role |
|-------|------|
| `/` | Skills list and detail |
| `/planner` | Skill tree, character / build planner |

In **development** only, **`/editor`** is available for editing-oriented tooling; production builds redirect it to `/`.

Patch selection uses **`public/tree_data/versions.json`** (`is_active` marks the default). Skill text and balance live in **`public/tree_data/<major>_<minor>/skills.json`**; global stat definitions in **`public/tree_data/stats.json`**.

## Layout

| Path | Role |
|------|------|
| `src/` | Vue app (views, components, router, Pinia) |
| `src/shared/` | Shared runtime modules (utils, version config, tree_struct loader) |
| `src/editor/` | Dev-only editor runtime + styles (used by `/editor`) |
| `public/tree_data/` | `versions.json`, `stats.json`, per-version folders (`2_13/`, …) with `skills.json` and `class-*.png` atlases |
| `tree/` | Planner / tree UI assets (e.g. styles, editor integration) |
| `character/` | Build and character state for the planner |
| `src/skills/domain/` | Skill model classes, formulas, and restrictions used by planner/home |
| `src/skills/` | Skills page index/search/route helpers |
| `atlas_generation/` | Per-icon sources by class + `make_all_atlases.py` to rebuild `class-*.png` |
| `py/` | Python helpers (validation, extracts); import `tree_data_loader` |
| `spellcheck/` | Spelling dictionaries and check scripts for skill text |
| `scripts/` | Node helpers used by npm (`run-spellcheck.mjs`, `copy-spa-404.mjs` for GitHub Pages) |

## Production build and deploy

```bash
npm run build
npm run preview   # optional local check of dist/
```

`build` runs **ESLint**, **spellcheck** (Python, active version from `public/tree_data/versions.json`), **Vite build**, then writes **`dist/404.html`** as a copy of **`dist/index.html`** so **GitHub Pages** can serve deep links to the SPA (`scripts/copy-spa-404.mjs`). The app base URL is set in **`vite.config.js`** (`base: '/medianxl-db/'`).

## Class icon atlases

Atlases shipped to the app live under **`public/tree_data/<major>_<minor>/`** (e.g. `class-ama.png`, `class-shared.png`). Source frames are organized under **`atlas_generation/`** (per-class subfolders). Rebuild all classes for a patch:

```bash
python atlas_generation/make_all_atlases.py --version 2.13
```

The script prefers **`atlas_generation/<version>/<class>/`** when present, otherwise **`atlas_generation/<class>/`**. Output files are written next to that version’s `skills.json`.

## Python utilities (`py/`)

Scripts load merged skills via **`py/tree_data_loader.py`**. Pass a data directory explicitly from the repo root when you target a patch, e.g. **`public/tree_data/2_13`** (many tools default via `resolve_data_dir`; spellcheck from npm resolves the active version automatically).

| Script | Purpose |
|--------|---------|
| `tree_data_loader.py` | Shared helpers (`load_merged_skills`, `resolve_data_dir`, …) |
| `validate_skill_placeholders.py` | Validate `{{stat}}` placeholders against `stats.json` and `scalingConstants` |
| `extract_placeholder_skills.py` | List skills whose text contains `{{…}}` |
| `extract_skills_without_placeholders.py` | List skills with text but no `{{…}}` |
| `extract_non_placeholder_lines.py` | Dump non-placeholder lines from description / effect / restriction text |
| `analyze_export_usage.py` | Scan `*.js` exports and report in-repo usage (excludes `icons/`) |
| `calculate_mana_params.py` | Helper to fit mana-cost parameters from level/cost pairs |

Run from the **repo root**, for example: `python py/validate_skill_placeholders.py public/tree_data/2_13`.

## Spellcheck (`spellcheck/`)

Uses merged skill text (same sources as the app). Dictionary files live under **`spellcheck/`** (e.g. **`spelling-dict.txt`**, **`ignore-dict.txt`**).

| Script | Purpose |
|--------|---------|
| `generate_spelling_dict.py` | Build a word list from skill text (use `-o` to target `spellcheck/spelling-dict.txt`) |
| `check_spelling.py` | Compare skill text to dictionaries; non-zero exit if unknown words remain |
| `search_text.py` | Substring search across merged skill text |

Examples:

```bash
npm run spellcheck
python spellcheck/generate_spelling_dict.py -o spellcheck/spelling-dict.txt
python spellcheck/check_spelling.py public/tree_data/2_13
python spellcheck/search_text.py "mana cost"
```

## Dependencies

### Frontend (app)

| Library | Role |
|---------|------|
| [Vue 3](https://vuejs.org/) | UI framework |
| [Vue Router](https://router.vuejs.org/) | Client-side routing |
| [Pinia](https://pinia.vuejs.org/) | Store |
| [Vite](https://vitejs.dev/) | Dev server and production bundle |

**CDN** (see root **`index.html`**): [Bulma](https://bulma.io/) 1.0.1, [Font Awesome](https://fontawesome.com/) 6 (free).

### Tooling

| Tool | Role |
|------|------|
| [ESLint](https://eslint.org/) + `eslint-plugin-vue` | Lint (`npm run lint`) |
| [Python](https://www.python.org/) 3.9+ | Scripts under `py/`, `spellcheck/`, `atlas_generation/` |
| [Pillow](https://pypi.org/project/pillow/) | `atlas_generation/make_all_atlases.py` |
