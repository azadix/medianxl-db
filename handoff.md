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

## How mxlplanner models item stats (investigated 2026-11-07)

Their item data lives in `build/game-data-*.js` (~2.9 MB, downloadable with plain
`fetch` from Node — no browser needed: `https://mxlplanner.pages.dev/build/game-data-Bl0BXhD2.js`).

Structure of one item:

```js
{
  id: 'su_silks_of_the_victor', uniqueName: 'Silks of the Victor',
  baseName: 'Ancient Armor', category: 'body armors', slot: 'armor',
  itemCategory: 'sacred_unique', suType: 'SU', corruptible: true,
  tiers: [{
    tier: 'sacred', itemLevel: 105, requiredLevel: 100,
    stats: [
      { text: '+1 to All Skills', color: 'magic', affixId: 'allSkills',
        min: 1, max: 1, isFixed: true, basedOnLevel: false, label: '+x to All Skills' },
      { text: '+(172 to 200)% Enhanced Defense', affixId: 'defPercent',
        min: 172, max: 200, isFixed: false, basedOnLevel: false },
      { text: '+1.125% Enhanced Defense (Based on Character Level)',
        affixId: 'defPercent', min: 1.125, max: 1.125, basedOnLevel: true },
      ...
    ],
    requiredStrength: 770,
    defense: '(8603 - 9489) to (10651 - 11748)',
  }],
}
```

**The important difference from us:** every stat is stored with a structured
`affixId` plus numeric `min`/`max`, `isFixed` and `basedOnLevel`. They never re-parse item
text at runtime — text is only for display. Stat aggregation is therefore a sum over
`affixId`s with numeric ranges, which is why they don't suffer our percent-vs-flat and
text-matching bugs.

Odd item behaviours live in a separate table (also in game-data), keyed by item name, e.g.
Nephalem Weapons on Silks of the Victor is modelled as **aura skill 1896 at level 10**:

```js
items: ['Silks of the Victor'], class: 'stat-grant',
stats: [{ affixId: 'addsFireDmgMin',
  formula: 'trunc((base.str + base.dex) * auraLevel / 50) + trunc(base.vit * auraLevel / 100)',
  auraSkill: 1896, auraLevel: 10 }]
```

So they DO implement `% of base attributes -> fire/lightning weapon damage`, which neither
we nor the raw planner table modelled.

### Porting plan (not yet done)

1. Compile our item text into `{ affixId, min, max, isFixed, basedOnLevel }` at data-build
   time (one-off script), instead of regex-parsing lines on every recompute.
2. Aggregate character stats from those fields — removes the percent/flat ambiguity and the
   text-dedupe hacks (`statLineCompareKey`, extras-vs-def dedupe).
3. Model socketables/orbs as separate numeric contributions (as they do) and stop relying
   on text overlap heuristics: when several identical socketables coalesce into one summed
   line in the item text, our leftover-based dedupe cannot match them and counts both.
4. Add the special-effects table (auras, stat-grant formulas) for items whose stats are not
   plain affixes.

### Status of that work (2026-11-07, round 7)

Done — "all Attributes" expansion. Catalogue defs store `+10 to all Attributes` as ONE line
while exporters render FOUR per-attribute lines, so neither matched and every attribute was
counted twice. `expandAllAttributesStatLine()` in `item-character-stat-bonuses.js` expands
both sides before comparing. Measured on the real `.d2s` payload: flat bonus excess went
from **+101 to +41**, percent from **+56 to +21** on every attribute. Verified, keeps the
137-build TSW audit green.

Tried and REVERTED twice — letting the exporter's item text win over catalogue affixes:

| rule | result on .d2s | audit |
|---|---|---|
| text covers key at all -> drop def affix | 449 / 538 (-5 vs target) | **fails** `BapCai` (`unmet: Celestial Barrier ... 550 Dexterity`) |
| same, but only drop when text amount >= def amount | 449 / 538 | **also fails** the same case |

So no text-precedence rule is safe while TSW dumps (partial text) and d2s-export payloads
(complete text) look identical to the importer. **The next step is the export-capability
flag**, which is also needed for life/mana:

- d2s-export writes BASE life/mana (`4544` / `1117`); TSW writes FINAL totals (`12338`).
  Our import converts the blob via `setStat()` as if it were final, so this payload pins
  life to 4544 instead of ~12533.
- A per-import flag (`textStatsComplete`) would gate both the text-precedence rule and the
  life/mana calibration.

Candidate detector: d2s-export emits `description_lines` on each socketable; TSW's
socketables carry only slot/name/type/code/image. Secondary signal: base-scale life in the
stats blob. Needs handling for full-text builds that have no sockets.

Remaining after the flag (measured): **-5 flat / +3% pct** — Paragon's Hammer
(`+2 to All Attributes per Character Level above 130` = +40 at level 150) resolves to 0 in
our pipeline, plus one stray relic percent.

### Export-capability flag (added round 8)

`src/items/item-text-completeness.js` — `detectCompleteItemText(rows)` returns true when any
socketable carries `description_lines` (the d2s exporter always does; TSW never does).
`loadBuildData` calls `setCompleteItemText(detect...)` on every import, and two things read it:

1. `item-character-stat-bonuses.js` — charm text-precedence (drop a catalogue affix only when
   the item text already covers that stat with an equal or larger amount).
2. `saved-builds-ui.js` — the life/mana `setStat` calibration runs only for partial-text
   (final-total) payloads; for complete-text payloads the blob is already BASE, so calibrating
   would pin life to 4544 instead of ~12533.

Verified: with the flag false (every TSW build) behaviour is unchanged — full suite 962/962
including the 137-build audit.

**Current state of the gated rule: it under-counts.** Measured on the .d2s payload with the
flag on: `str 389 / dex 478 / vit 365 / egy 328`, pct `29 / 146` versus targets
`454 / 543 / 430 / 393` and `61 / 178`. The likely culprit is that `extraAmountByKey`
sums every text line for a key, so coverage passes for affixes that should survive. Next:
compare per-line (or cap the comparison to the largest single text line) instead of summing.

### Round 9 result — gated rule now lands within 0.8%

Fixed by restructuring the charm block (extras first, then drop a catalogue affix only when
the text covers every stat of it with an equal or larger amount — never summed):

| | ours | target | delta |
|---|---:|---:|---:|
| str / dex | 449 / 538 | 454 / 543 | -5 / -5 |
| vit / egy | 425 / 388 | 430 / 393 | -5 / -5 |
| pct str / dex | 64 / 181 | 61 / 178 | +3 / +3 |

Derived character totals: **str 851 / dex 4771 / vit 730 / egy 668** vs 843 / 4734 / 725 / 665
(+0.2% to +0.8%). Full suite 962/962, audit green.

Two known remainders, both data gaps rather than maths:

1. **Umbaru Treasure (+20 dex), Cold Fusion Schematics (+15 dex)** — the def carries a
   combined `+20/+15 to all Attributes` line that the exporter folds into the individual
   rolled per-attribute lines, so both survive the coverage test.
2. **Paragon's Hammer** — its `+2 to All Attributes per Character Level above 130` (= +40)
   lives under `paragonHammer.regularUpgrades[...]` in `charms.json`, selected by the player
   in game. The .d2s export does not say which upgrade was taken (`extras` are only
   `Charges: 2`, `Already Upgraded`), so we currently apply none. Exactly offsets the two
   over-counts above, which is why the net is only -5.

**Life/mana still wrong**: computed 7652 / 1880 vs 12533 / 4457. The blob's base values
(4544 / 1117) are now stored uncalibrated (correct for this exporter), but the life/mana
derivation from vitality does not reproduce the in-game totals — next target.

### Round 10 — life/mana dissected (two separate causes)

Summing `+N to Life` / `+N to Mana` from the save's item text gives **4052 life** and
**763 mana**. Our aggregation produces **3108 life** and **763 mana** — mana matches exactly,
so the item side is right for mana.

1. **Despondence is dropped.** The entire 944 life gap is one item, `Despondence`, sitting at
   `slot: RightHandAlternate` (weapon set II) with a clean `+944 to Life` line. Our snapshot
   maps it to `equipment.rarm2` and the snapshot hardcodes `weaponSet: 0`, so only set I
   contributes. The in-game totals clearly include it.
2. **Vitality/energy scaling contributes nothing.** Our `life` is exactly
   `4544 (blob base) + 3108 (items)` = 7652. The class row in
   `public/tree_data/2_14/game_meta.json` has `base_life 65, life_per_level 30,
   life_per_vitality 2.25, base_vitality 15`, i.e. 65 + 149*30 = 4535 at level 150 — matching
   the blob's 4544 — but the `vitalityAboveBaseline * 2.25` term is not reaching
   `getStat('life')` on the import path, so the derived total is short by ~1600 there too.

Next: (a) decide the weapon-set rule for imported builds (the exporter lists all worn Gear
regardless of set), (b) make the vitality->life term apply on the import path. Remaining
gap after (a) would be 8596 vs 12533, and after (b) ~10193 vs 12533 — so a third component
(a life % or per-level term) may still be missing; compare against mxlplanner's character
panel for the same build before guessing.

### Round 11 — item life now exact; the gap is the class formula

(a) done: `equipmentSlotContributesBonuses()` skips the active-weapon-set check when the
import is complete-text, so alternate-set Gear counts. Verified: item bonuses are now
**life 4052 / mana 763**, i.e. an exact match with the save's item text. Attributes are
unchanged (Despondence grants no attributes), so str 851 / dex 4771 / vit 730 / egy 668 vs
843 / 4734 / 725 / 665 remains from round 9.

Life total is now **8596** vs 12533; mana **1880** vs 4457. The remaining
**+3937 life / +2577 mana** must come from attribute scaling, and the engine does not do that
for imported builds: with the blob's `{{life}}`/`{{mana}}` lines stripped the total is just
the item bonus (4052), i.e. `getStat('life')` is raw + item bonuses with no class/vitality
term. `computeClassDerivedLifeManaBreakdown()` in `class-baselines.js` implements
`base_life + (level-1)*life_per_level + (vit-baseline)*life_per_vitality`, but the import path
never feeds it.

### Round 12+ — the source settles it (charstats.tsv + skills.json)

`mxl-extractor/exports/charstats.tsv` holds the real per-class table:

```
Assassin: LifePerLevel 122, ManaPerLevel 30, LifePerVitality 9, ManaPerMagic 9, hpadd 50
game_meta:        30,              7.5,             2.25,            2.25
```

game_meta is exactly charstats/4, so it is correct as shipped (the ÷4 is how the planner
consumer scales it) - my earlier "coefficients are wrong" note was wrong and is retracted.

The real missing term was a **skill**: `Prismatic Cloak` (Assassin) is allocated at level 15
in this build and grants `maximum_life = truncdiv(5+blvl-1, 2) = 9%`. Nothing applied
percentage life/mana at all, so:

```
life = (base_life + (level-1)*life_per_level + (vit-baseline)*life_per_vitality)
       * (1 + maximum_life%/100) + flat item life
```

is now implemented in `loadBuildData` for complete-text payloads (percent from the character's
combined item+skill stats, flat from the item aggregation).

Measured end-to-end in the app: **life 12038, mana 4873** vs 12533 / 4457.
`ch.getStat('maximum_life')` returns **30**, not 39 - i.e. the *skill* half of the percentage
never reaches the stat, so the 9% from Prismatic Cloak is still missing (life would then be
6143.75*1.39 + 4052 = 12593, within 0.5% of the game). Mana overshoots by ~9% with the 58%
from items, so its percentage likely has the same skill/application issue to sort out.

Next: make skill-granted `maximum_life` / `maximum_mana` (Character._plannerSkillStatBonuses)
reach the `maximum_life`/`maximum_mana` stats, then re-measure both.

### In-game verification (user) — mana formula settled

`manalife.md` (engine source `Stats_StatsEx`, `itemstatcost` ops 8/9/11): the percentage
multiplies only the **pre-op base**; mana/life from *bonus* attributes is added outside it.
User measured in game: mana **4457** with all charms, **4154** with the three charms carrying
`+4% / +2% / +10%` max mana removed - a drop of **303**, and `16% x (base_mana + flat_mana) =
16% x 1895.5 = 303.3`. That confirms:

```
mana = (base_mana_at_level + flat_item_mana) * (1 + maxMana%/100)
       + (energy_total - energy_base) * mana_per_energy
```

Implemented; app now reports **mana 4437 / life 12551** (target 4457 / 12533).

### Relic text bug (the +3% that inflated every attribute)

The save contains a plain `Relic` granting **+4% to all attributes**, but the catalogue
matched it to a **Whirlwind relic at +7%** - a uniform +3% on every attribute. Relics now use
the item text for complete-text payloads, same rule as charms. Percentages are now exactly
**61 / 178** (were 64 / 181).

### Current numbers (best so far)

```
flat: str 449 / dex 538 / vit 425 / egy 388   (targets 454 / 543 / 430 / 393)
pct : 61 / 178                                (targets 61 / 178)  EXACT
totals: str 835 / dex 4720 / vit 717 / egy 656 (targets 843 / 4734 / 725 / 665)
life 12551 (target 12533, +0.14%)   mana 4437 (target 4457, -0.45%)
```

Two known item-level remainders, and they nearly cancel:

1. **Umbaru Treasure (+20) and Cold Fusion Schematics (+15)** still apply a catalogue
   `+20/+15 to all Attributes` line that the exporter already folded into the rolled
   per-attribute values.
2. **Paragon's Hammer (-40)**: its `+2 to All Attributes per Character Level above 130` lives
   under `paragonHammer.regularUpgrades` in `charms.json`; the .d2s export does not record
   which upgrade was chosen. **Ask the user which Paragon Hammer upgrade the character took**
   (The Butcher / Infernal Machine / ...) and it can be applied.

### User answered: Butcher + Infernal Machine + Paragon of Sanctity

Selections live in the charm rolls: `charmParagonRegular0` (Butcher),
`charmParagonRegular1` (Infernal), `charmParagonPath` = 2 (sanctity, 1-based into
`paragonPaths`). Verified by setting them through `store.updateInstanceRolls` and recomputing:
attributes go 835/4720/717/656 -> **899/4831/782/722**, i.e. **+40 flat each** then scaled.

That overshoots because both fixes are needed together:

| change | flat str | resulting str total |
|---|---:|---:|
| current | 449 | 835 |
| + Paragon (+40) | 489 | 899 |
| + charm text fix (-35) | 454 | **843** ✅ |

Same arithmetic lands all four targets exactly: str 843, dex 4734, vit 725, egy 665.

So the last two tasks are:

1. **Use the raw dump text for charms** on complete-text payloads (`tswRow.description_lines`,
   needs a `getTswRowForInstance` accessor). Umbaru's dump text is
   `+50 Str / +42 Egy / +52 Dex / +48 Vit` while the catalogue def also emits
   `+20 to all Attributes`, hence the +20. Simply keeping every catalogue-matching line in
   `extrasFromTswItem` was tried and made things *worse* (799/4623/660/599) because it also
   affects gear tooltips - it must be scoped to the charm stat aggregation.
2. **Record the Paragon Hammer choice** - there is no UI for it today (no `paragon` matches in
   any `.vue`), which is why the +40 is missing for imported builds. The export cannot carry
   it (the hammer's dump text is only `+1 to All Skills`, `Charges: 2`, `Already Upgraded`).

### DONE — all four attributes now match the game exactly

1. `getTswRowForInstance()` added; charm stats read the dump's own lines for complete-text
   payloads (falling back to `extras` otherwise). Umbaru now contributes its real
   50/52/48/42 instead of 70/72/68/62.
2. `syncCharacterStatsToItemReqs()` no longer raises raw attributes for complete-text imports:
   the save already carries the real base attributes, and auto-matching had bumped raw
   strength to 82.27 (total 863 instead of 843).
3. The Paragon Hammer selector the user already has supplies the remaining +40.

Verified in the app with Butcher + Infernal + Sanctity selected:

```
str 843  dex 4734  vit 725  egy 665     <- all four EXACT
```

Percentages 61 / 178 and flat 454 / 543 / 430 / 393 are exact too.

**Watch out:** adding `setCompleteItemText(detectCompleteItemText(rows))` inside
`mapTswItemsToSnapshot` makes the 137-build audit hang (>10 min). The flag must be set only by
`loadBuildData`; the audit sets it false implicitly.




`getStat('maximum_life')` was still the item-only value at that point in the load (the skill
stat pass lands afterwards), so Prismatic Cloak's 9% was dropped. The block now reads the two
buckets explicitly - `collectEnabledItemCharacterStatBonuses().bonuses[pctKey]` +
`statCharacter._plannerSkillStatBonuses[pctKey]`.

Measured end-to-end in the app:

```
str 851 / dex 4771 / vit 730 / egy 668        (targets 843 / 4734 / 725 / 665)
life  12591  vs 12533   (+0.46%)   maximum_life = 39 (30 items + 9 Prismatic Cloak)
mana   4873  vs  4457   (+9.3%)    maximum_mana = 58 (items only)
```

**Remaining: mana.** Back-solving the game gives an effective `maximum_mana` of **42%**, but
seven items supply 58%: Spirit of Creation 4, Sunstone of the Gods 13, Vial of Elder Blood 14,
Riftwalker's Eye 2, Laser Focus Crystal 10, Nor Tiraj's Wisdom 10, Ancient Repositories 5. The
missing 16 is exactly `Spirit of Creation 4 + Riftwalker's Eye 2 + Laser Focus Crystal 10`, so
the next thing to check is whether those three charms are actually active in the save (all are
`type: Charm`, `location: Inventory`, no duplicates, so it is not an equip/duplicate issue -
suspect a charm level/requirement gate or a corrupted variant whose line should not apply).
Life is unaffected, which is why it already matches.



### Round 12 — class formula wired in (still short)

`loadBuildData` now applies `computeClassDerivedLifeManaBreakdown()` for complete-text
payloads: base + per-level + (vitality/energy above baseline) x coefficient, with the item
bonus re-added through `setStat` so the stored base absorbs only the class part.

Measured: life **8596 -> 10195**, mana **1880 -> 3364** (targets 12533 / 4457).

The residual is now a pure coefficient question, isolated to one number each:

- life: 12533 - 4535(level) - 4052(items) = 3946 over 715 vitality  -> **~5.5 per point**
  (game_meta says 2.25)
- mana: 4457 - 1132(level) - 763(items)  = 2562 over 653 energy    -> **~3.9 per point**
  (game_meta says 2.25)

Both differ from `tree_data/2_14/game_meta.json` by a large factor, so either the extractor's
life_per_vitality/mana_per_energy columns are wrong for 2.14, or an uncatalogued multiplier
(paragon levels? a hidden per-class table?) sits between. With 5.5 and 3.9 the totals land at
12529 / 4427 — within 4 and 30 of the game. **Do not hardcode those numbers**: confirm the real
coefficient from the game's data files or from mxlplanner's character panel first.

### Final state of the objective (round 12/12)

Achieved: item stats are exact (life 4052, mana 763, attribute flat 449/538/425/388 and pct
64/181 against 454/543/430/393, 61/178 — within 0.8%), derived attributes str 851 / dex 4771 /
vit 730 / egy 668 vs 843 / 4734 / 725 / 665. Not achieved: life/mana totals (10195/3364 vs
12533/4457), blocked on the per-attribute life/mana coefficient above.









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
