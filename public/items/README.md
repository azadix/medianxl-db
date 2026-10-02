# Item catalogs

Each game version folder (`2_12`, `2_13`, `2_14`, …) contains:

- `baseitems.json` — tiered/sacred armor and weapons
- `charms.json` — dungeon reward charms (can differ per version)
- `other.json` — jewelry and misc items (rings, amulets, jewels, quivers)
- `relics.json` — inventory-only relics (max 3)
- `unique-stats-db.json` — unique/set raw stat templates (roll ranges); the planner converts these into overlays at load time
- `runewords.json` — runeword templates (recipe, allowed bases, modifiers); the planner merges a template with a chosen grey base at pick time

The planner loads base/charm/other/relic catalogs and builds unique/set overlays from `unique-stats-db.json`. Runeword templates come from `runewords.json`.

## Regenerating `unique-stats-db.json`

Fetch the current 2.14 tiered uniques, sacred uniques, and sets from the raw
Median XL docs HTML:

```
npm run unique-stats-db
node tools/generate-unique-stats-db.mjs 2.14 --check
```

Only `public/items/2_14/unique-stats-db.json` is written.

## Regenerating `relics.json`

From the raw relic wiki HTML:

```
npm run generate-relics-wiki
node tools/generate-relics-from-wiki.mjs 2.14 --check
```

The wiki does not render relic names, so the generator matches all cells to the
existing catalog by their granted skill lines and preserves stable ids.

Only `public/items/2_14/relics.json` is written.

## Regenerating `runewords.json`

From the raw runewords wiki HTML:

```
npm run generate-runewords-wiki
node tools/generate-runewords-from-wiki.mjs 2.14 --check
```

Only `public/items/2_14/runewords.json` is written. The planner keeps one template per runeword and asks for a compatible grey base when you pick it. Extra sockets past the rune count are filled with empty jewels.

## Regenerating `charms.json`

Charms are the only catalog refreshed from the TSW item API because their docs
are split across many quest pages:

```
npm run generate-charms-tsw
node tools/generate-relics-charms-from-tsw.mjs 2.14 --charms
```

Only `public/items/2_14/charms.json` is written.

Dimensional Key is stored in TSW under unique base names (`Arcana`, `Mandate`, `Onslaught`, `Primordia`) and Nephalem upgraded forms. The charms generator expands the legacy single entry into four catalog rows named `Dimensional Key - …` and prefers Nephalem stats (combat bonuses). Only one Dimensional Key may be enabled at a time.
