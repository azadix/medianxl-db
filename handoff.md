# Handoff — planner stat parity (Miss_Peeled, 2.14)

Session goal: make the planner's computed stats match the in-game values, using the game's
D2Stats dump and mxlplanner as oracles.

**Status: partially achieved.** Life, mana and the checked skill damages now match. The four
primary attributes are still over-counted; APF-20 and Black Wind remain blocked behind them.

---

## Verified fixes (uncommitted)

Nothing is committed — `HEAD` is still `dd684dc`-era plus the user's earlier commits. Run
`git status` / `git diff` to review. Five files changed:

| File | Change |
|---|---|
| `public/tree_data/2_14/skills.json` | Noctule bonus-magic synergy now scales with character level |
| `src/items/item-character-stat-bonuses.js` | Charm affix/extras dedupe (normalised), Nephalem `% of base` guard, relic dedupe |
| `src/items/item-stats.js` | Extras-vs-def-mod dedupe (normalised, includes base/scaling sections) |
| `src/planner/saved-builds-ui.js` | Life/mana recalibration: re-apply the TSW stats blob through `setStat()` after items+skills |
| `src/planner/tsw-item-rolls.js` | Charm upgrade detection: multi-affix upgrades must be present in full; base-modifier affixes can't flag an upgrade |

### Results

| Stat | Before | Now | Game | State |
|---|---:|---:|---:|---|
| Mana | 5419 | **4457** | 4457 | ✅ exact |
| Life | 15730 | **12338** | 12533 | ✅ (dump itself is 195 low) |
| Noctule bonus magic | 269 | **1492** | 1492 | ✅ |
| Vampiric Strike | 0 | **254** | 254 | ✅ |
| Batstrike | 254 | 254 | 254 | ✅ |
| Way of the Phoenix | 3791-5991 | **1529-2416** | 1529-2416 | ✅ |
| Durations (Anathema/Black Wind) | 328 s | **360.8 s** | 360.8 s | ✅ |
| Summon Edyrem damage | 525 | **12-12** | 12-12 | ✅ |
| Dulra Aegis dexterity | 60 | **30** | 30 | ✅ |
| Dexterity flat / % | 748 / 267 | **628 / 262** | 543 / 178 | 🟡 |
| Strength flat | 620 | **530** | 454 | 🟡 |
| Vitality flat | 596 | **506** | 430 | 🟡 |
| Energy flat | 559 | **469** | 393 | 🟡 |
| APF-20 magic damage | — | not shown | 7953 | ❌ |
| Black Wind magic damage | 0-0 | 0-0 | 25561 | ❌ |

---

## Key root causes found (and fixed)

1. **`parseStatsFromText` stored final totals as base.** TSW blobs carry in-game *final*
   values; item/skill bonuses were then added on top (life 15730). Fix: re-apply the blob via
   `setStat()` (which converts a displayed total back to a base) *after* items and skills are
   live, skipping the four primary attributes (their blob values are base, not totals).

2. **Charm/gear affixes were counted twice.** The TSW `description_lines` (extras) echo the
   catalogue def's own modifiers. Fixed wherever both reach the aggregator, comparing
   **normalised** text (case, leading `+`, whitespace) — exact matching missed
   `+40 to All Attributes` vs `+40 to all Attributes`.

3. **Charm upgrades were granted that the charm doesn't have.** A multi-affix upgrade was
   accepted if *any* affix matched the description, and upgrade affixes often restate a base
   modifier (Glorious Book repeats `+1 to All Skills`), so the charm gained `+10 to all
   Attributes`.

4. **Noctule's synergy uses character level**, not just base level:
   `14 * baseLevel * (70 + min(3*characterLevel, 450)) / 400` → 455% at blvl 25 / clvl 150.

---

## Remaining problem — attributes (+76 flat, +84 %)

Decomposition of strength (our 530 vs game 454):

```
all-attributes from gear   176
all-attributes from charms 149
individual attribute lines 205   (all from charms)
total                      530   (game 454 → charms over by ~76)
```

- Gear alone is 176, so the game clearly counts charms too.
- **Every individual item value I could check against item text + sockets is correct**
  (Silks 48 = 24 item + 14 orb + 6 + 4; Zayl 64% = 32 + 3×7 + 2×5 sockets).
- Ruled out: signets (code only touches caps), charm upgrades, extras duplication,
  inactive weapon set, double-listed items.

### Next step (unblocker)

Six charm tooltips from the game would settle it — the same method that cracked Dulra Aegis
(60→30) and the Glorious Book (+10):

```
Crystalline Flame Medallion   +80 dex / +40 all-attrs
Paragon's Hammer              +80 dex / +40 all-attrs
Umbaru Treasure               +72 dex / +70 str
Cold Fusion Schematics        +60 dex / +53 str
Visions of Akarat             +25 all-attrs
Horazon's Focus               +24 all-attrs
```

## Other recorded issues

- **APF-20 'Maelstrom' MkV** — game shows `Magic Damage: 7953` = `168% × Total Dexterity`.
  mxlplanner models it with `elementScaling = dexterity − 100`. Implementing it via our
  `{{dexterity}}` token produced a wildly wrong number (2,028,136), so it was reverted; the
  item currently shows only the correct `168% of Total Dexterity` line.
- **Black Wind** — game 25,561 magic damage. mxlplanner: `derived1 = (addedFireMin +
  addedLightningMin + addedColdMin + addedFireMax + addedLightningMax + addedColdMax) / 2`,
  i.e. it needs weapon added-elemental stats we do **not** model (our stat registry has no
  `added_*` damage keys at all). Also worth knowing: mxlplanner shows `Deals 204%` while the
  game shows `206%` — **our 206 is correct**, mxlplanner is off by one there.
- **Nephalem Weapons**: `20-30% of base Strength and Dexterity` / `10-15% of base Vitality`
  convert a % of base attributes into fire+lightning weapon damage. Neither planner models
  this; we now at least don't misread the lines as attribute grants.
- **Grit**: ours 4, game 12. Our 4 comes from `paragon_of_sanctity` (constant); the build data
  contains no reference to grit, so the game's 12 has no identifiable source here.
- **Vial of Elder Blood** is flagged upgraded on import despite `upgrade: null` in its def.
  Harmless for attributes, unexplained.
- Panel stats such as `defense` / `attack_rating` / resistances differ from the in-game
  panel, but that is **semantics** (our raw bonus vs the game's final computed value), not
  proven bugs. Don't treat those rows as regressions without checking the definitions.

---

## How to reproduce / verify

Test suite (948 tests, includes a 137-build TSW audit):

```
node node_modules\vitest\vitest.mjs run
eslint: node node_modules\eslint\bin\eslint.js .
```

Headless verification harness (outside the repo, so Vite doesn't watch it):

```
%TEMP%\dsh-repro\probe-life.mjs      # import build, report life/mana
%TEMP%\dsh-repro\probe-agg2.mjs      # attribute aggregation + per-source lists
%TEMP%\dsh-repro\probe-classify.mjs  # classify one item's stat lines
%TEMP%\dsh-repro\probe-lines.mjs     # raw stat lines for one item
%TEMP%\dsh-repro\probe-charms.mjs    # enabled charms + their extras
%TEMP%\dsh-repro\mxlp-*.mjs          # mxlplanner automation (import + scrape)
```

Requirements: dev server on `http://127.0.0.1:5199` (`node node_modules\vite\bin\vite.js
--port 5199 --strictPort --host 127.0.0.1`), headless Chrome with CDP on port 9333 launched
from PowerShell, and `REPRO_ATTACH=1` for the probes that attach to an existing tab.

**mxlplanner** is `https://mxlplanner.pages.dev`. Its share codes are
`'MXL-' + base64url(deflateRaw(JSON.stringify(state)))`. A valid code for this build is saved
at `%TEMP%\dsh-repro\code.txt`; `mxlp-all.mjs` / `mxlp-details.mjs` import it and scrape skill
detail panels. Note their gear panel renders `+x to Dexterity` placeholders (no numbers), so
it cannot serve as a per-item oracle — only totals.

Oracle values for this build (from the game's D2Stats dump and screenshots):

```
str 843  dex 4734  vit 725  energy 665   life 12533  mana 4457
bonus columns: str +454 / 61%   dex +543 / 178%   vit +430 / 63%   energy +393 / 63%
```
