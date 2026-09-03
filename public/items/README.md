# Item catalogs

Each game version folder (`2_12`, `2_13`, `2_14`, …) contains:

- `baseitems.json` — tiered/sacred armor and weapons
- `charms.json` — dungeon reward charms (can differ per version)
- `other.json` — jewelry and misc items (rings, amulets, jewels, quivers)
- `relics.json` — inventory-only relics (max 3)
- `unique-stats-db.json` — unique/set raw stat templates (roll ranges); the planner converts these into overlays at load time. T4+/SU/sets come from the TSW item API. For 2.14, TU T1–T4 and TU jewelry/quivers are filled from the wiki HTML.

The planner loads base/charm/other/relic catalogs and builds unique/set overlays from `unique-stats-db.json`. Runewords are not included yet.

## Regenerating `unique-stats-db.json`

Crawl the public item API locally (can take ~15–20 minutes; CI IPs are often blocked):

```
npm run unique-stats-db
```

Defaults to `2.14` → `public/items/2_14/unique-stats-db.json`:

```
node tools/generate-unique-stats-db.mjs 2.14
node tools/generate-unique-stats-db.mjs 2.14 --resume
node tools/generate-unique-stats-db.mjs 2.14 --wiki-only
```

`--resume` skips names already present. Existing `setName` values are preserved onto matching names when rewriting.

For 2.14 the generator fetches raw HTML from https://docs.median-xl.com/doc/items/tiereduniques and replaces TU rows with T1–T4 (plus un-tiered jewelry/quivers). Sacred uniques stay on the TSW `SU` path. `--wiki-only` skips the TSW crawl.

## Regenerating `relics.json`

From TSW item API (preferred when your IP is allowed — same gate as unique-stats):

```
npm run generate-relics-charms-tsw
node tools/generate-relics-charms-from-tsw.mjs 2.14 --relics
node tools/generate-relics-charms-from-tsw.mjs 2.14 --charms
node tools/generate-relics-charms-from-tsw.mjs 2.14 --resume
```

Writes `relics.json` / refreshes `charms.json` under `2_14` and mirrors the same files to `2_13`.

Dimensional Key is stored in TSW under unique base names (`Arcana`, `Mandate`, `Onslaught`, `Primordia`) and Nephalem upgraded forms. The charms generator expands the legacy single entry into four catalog rows named `Dimensional Key - …` and prefers Nephalem stats (combat bonuses). Only one Dimensional Key may be enabled at a time.
