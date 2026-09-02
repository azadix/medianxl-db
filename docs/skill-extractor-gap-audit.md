# Skill extractor vs planner gap audit

Generated against planner catalog `public/tree_data/2_13` and mxl-extractor exports/findings.

This is an audit only — no skill data was imported into the planner.

## Critical matching note

**Do not join on IDs.** Planner `numericId` and extractor `skill_id` never agree (0 of 638 name-matched pairs share the same number).

Example: planner Bane `numericId=520` vs extractor `skill_id=1390`.

**Match key:** normalize alphanumeric lowercase of planner `displayName` ↔ extractor `skill_name`. When duplicates exist, prefer the extractor row with `class_tree=1`, else a row with formulas/probes.

## Data sources

| Side | Path | Role |
|------|------|------|
| Extractor index | `mxl-extractor/exports/skills.tsv` | ~3011 skills |
| Formulas | `mxl-extractor/exports/skill_formulas.tsv` | ~1074 skills with decompiled calcs |
| Scaling probes | `mxl-extractor/exports/skill_scaling.tsv` | 468 skills |
| Obtainability | `mxl-extractor/exports/skill_obtainability.tsv` | status + class_tree |
| Findings index | `mxl-extractor/findings/findings_skill_scaling_index.md` | per-class docs |
| Planner catalog | `public/tree_data/2_13/skills.json` + `subskills.json` | 642 + 31 |
| Fillable CSV | [`skill-extractor-fillable.csv`](skill-extractor-fillable.csv) | planner → extractor map for list C |

## Summary (2.13, name match)

| Universe | Present OK | In planner, no `scalingConstants` | In planner, scaling but empty text | Not in planner |
|----------|------------|-----------------------------------|------------------------------------|----------------|
| Class-tree | 328 | **58** | **13** | **0** |
| Obtainable named | 502 | 70 | 16 | **25** |
| Scaling-probed | 265 | 23 | 10 | 32 |

Of planner skills with **no** `scalingConstants` (108): **94** already have extractor formulas and/or probes (see list C / CSV).

Extra incompleteness: among 328 class-tree skills that already have scaling+text, **49** only have mana/cooldown while extractor has effect formulas (list E).

Example: **Bane** references `{{enemy_physical_resistance}}` in `skillEffect` but has no matching `scalingConstants` row; extractor has `-1*min(5+(lvl-1)/3,15)`.

## Difference categories

1. **ID scheme mismatch** — planner catalog IDs ≠ game `skill_id`; any future import must map by name (and class when ambiguous).
2. **Missing scaling entirely** — skill exists in planner; extractor has formulas/probes; planner `scalingConstants` empty.
3. **Empty tooltip text** — has mana (or similar) only; `description`/`skillEffect` empty.
4. **Partial scaling** — has meta stats (mana/cooldown/duration) but missing effect stats that extractor decoded.
5. **Formula shape differences** (when both populated) — e.g. Continuity planner `max(4+blvl*6,10)` vs extractor `par1+par2*blvl` (`4+6*blvl`); equivalent for blvl≥1.
6. **Absent from planner** — mostly shared/oskills/procs, not class-tree.

## List A — Class-tree in planner, missing `scalingConstants`

Count: **58**

### Amazon

| Display name | Planner id | Extractor skill_id | Formulas | Probes |
|--------------|------------|--------------------|---------:|-------:|
| Balance | `balance` | 1043 | 4 | 0 |
| Blood Magic | `blood_magic` | 1035 | 11 | 0 |
| Concentrated Effect | `concentrated_effect` | 1070 | 3 | 0 |
| Elemental Command | `elemental_command` | 1058 | 7 | 0 |
| Indomitable | `indomitable` | 1063 | 4 | 0 |
| Lioness | `lioness` | 1039 | 11 | 0 |
| Melee Devotion | `melee_devotion` | 1093 | 3 | 0 |
| Specialization | `specialization` | 1096 | 4 | 0 |
| Wild and Free | `wild_and_free` | 1041 | 6 | 0 |

### Assassin

| Display name | Planner id | Extractor skill_id | Formulas | Probes |
|--------------|------------|--------------------|---------:|-------:|
| Artifice Mastery | `artifice_mastery` | 1132 | 5 | 0 |
| Execution | `execution` | 1153 | 2 | 0 |
| Prismatic Cloak | `prismatic_cloak` | 1141 | 10 | 0 |
| Subterfuge | `subterfuge` | 1124 | 6 | 0 |
| Summon Familiars | `summon_familiars` | 1150 | 17 | 0 |
| Vampiric Strike | `vampiric_strike` | 1151 | 3 | 0 |
| Winged Calamity * | `winged_calamity` | 1152 | 0 | 0 |

### Barbarian

| Display name | Planner id | Extractor skill_id | Formulas | Probes |
|--------------|------------|--------------------|---------:|-------:|
| Elemental Overload | `elemental_overload` | 1235 | 3 | 0 |
| Immortal | `immortal` | 1229 | 8 | 0 |

### Druid

| Display name | Planner id | Extractor skill_id | Formulas | Probes |
|--------------|------------|--------------------|---------:|-------:|
| Bloom | `bloom` | 1326 | 0 | 3 |
| Ceaseless Fury | `ceaseless_fury` | 1331 | 0 | 1 |
| Tracking | `tracking` | 1340 | 4 | 0 |

### Necromancer

| Display name | Planner id | Extractor skill_id | Formulas | Probes |
|--------------|------------|--------------------|---------:|-------:|
| Apprenticeship | `apprenticeship` | 1402 | 6 | 0 |
| Brutal Effigy * | `brutal_effigy` | 1448 | 0 | 0 |
| Death Pact | `death_pact` | 1391 | 13 | 2 |
| Grim Vision | `grim_vision` | 1424 | 4 | 2 |
| Reaper | `reaper` | 1429 | 2 | 0 |
| Soulchain | `soulchain` | 1440 | 13 | 0 |
| Terror | `terror` | 1437 | 3 | 1 |

### Paladin

| Display name | Planner id | Extractor skill_id | Formulas | Probes |
|--------------|------------|--------------------|---------:|-------:|
| Acumen * | `acumen` | 1519 | 0 | 0 |
| Apex Predator | `apex_predator` | 1523 | 3 | 1 |
| Blessed Life | `blessed_life` | 1505 | 8 | 3 |
| Combustion | `combustion` | 1522 | 1 | 1 |
| Conclave | `conclave` | 1513 | 4 | 0 |
| Confluence | `confluence` | 1518 | 2 | 0 |
| Consecration | `consecration` | 1511 | 8 | 1 |
| Fervor | `fervor` | 1514 | 5 | 0 |
| Frostbite | `frostbite` | 1517 | 1 | 0 |
| Life and Death | `life_and_death` | 1500 | 9 | 1 |
| Rite of the Restless | `rite_of_the_restless` | 1525 | 1 | 0 |
| Rite of Thorns | `rite_of_thorns` | 1524 | 1 | 0 |
| Sanctity | `sanctity` | 1526 | 8 | 0 |
| Solstice and Equinox | `solstice_and_equinox` | 1487 | 9 | 1 |
| Stormlord | `stormlord` | 1497 | 8 | 0 |
| Transcendence | `transcendence` | 1516 | 5 | 1 |

### Sorceress

| Display name | Planner id | Extractor skill_id | Formulas | Probes |
|--------------|------------|--------------------|---------:|-------:|
| Arcane Sustenance | `arcane_sustenance` | 1604 | 4 | 0 |
| Cold Blooded | `cold_blooded` | 1602 | 1 | 0 |
| Determination | `determination` | 1606 | 4 | 1 |
| Entanglement | `entanglement` | 1608 | 5 | 2 |
| Eye of the Storm | `eye_of_the_storm` | 1594 | 7 | 2 |
| Frostborn | `frostborn` | 1591 | 7 | 0 |
| Incineration | `incineration` | 1599 | 2 | 0 |
| Inoculation | `inoculation` | 1597 | 3 | 0 |
| Living Flame | `living_flame` | 1562 | 8 | 0 |
| Mana Sweep | `mana_sweep` | 1579 | 6 | 1 |
| Mind Spark | `mind_spark` | 1595 | 7 | 0 |
| Primordial Might | `primordial_might` | 1601 | 4 | 1 |
| Pyre * | `pyre` | 1600 | 0 | 0 |
| Rime | `rime` | 1592 | 3 | 0 |

\* Extractor also has no formulas/probes for these.

## List B — Class-tree in planner, scaling but empty text

Count: **13**

| Display name | Planner id | Extractor skill_id | Scaling rows | Formulas | Probes |
|--------------|------------|--------------------|-------------:|---------:|-------:|
| Absolution | `absolution` | 1503 | 1 | 8 | 0 |
| Annihilation | `annihilation` | 392 | 1 | 12 | 1 |
| Backstab | `backstab` | 1115 | 1 | 15 | 3 |
| Barrier Strike | `barrier_strike` | 1116 | 1 | 7 | 0 |
| Dragon Jaws | `dragon_jaws` | 1482 | 1 | 9 | 0 |
| Dragon's Breath | `dragons_breath` | 1521 | 1 | 13 | 3 |
| Dragonbone Armor | `dragonbone_armor` | 1520 | 1 | 20 | 2 |
| Lethal Incision | `lethal_incision` | 1156 | 1 | 12 | 3 |
| Reverence | `reverence` | 1515 | 1 | 15 | 2 |
| Scion | `scion` | 1483 | 1 | 6 | 1 |
| Superbeast | `superbeast` | 1508 | 1 | 18 | 1 |
| Symphony of Destruction | `symphony_of_destruction` | 1495 | 1 | 1 | 0 |
| Vampiric Icon | `vampiric_icon` | 1140 | 1 | 9 | 2 |

## List C — Fillable planner gaps (no scaling; extractor has data)

Count: **94**. Machine-readable copy: [`skill-extractor-fillable.csv`](skill-extractor-fillable.csv).

Includes list A plus oskills/shared already in the planner.

| Planner id | Display name | Extractor skill_id | Class | Formulas | Probes | Has text |
|------------|--------------|--------------------|-------|---------:|-------:|:--------:|
| `amplify_damage` | Amplify Damage | 66 | Shared | 9 | 0 | no |
| `apex_predator` | Apex Predator | 1523 | Paladin | 3 | 1 | no |
| `apprenticeship` | Apprenticeship | 1402 | Necromancer | 6 | 0 | yes |
| `arcane_blast` | Arcane Blast | 2386 | Shared | 4 | 0 | yes |
| `arcane_sustenance` | Arcane Sustenance | 1604 | Sorceress | 4 | 0 | yes |
| `arrow` | Arrow | 609 | Shared | 2 | 0 | no |
| `artifice_mastery` | Artifice Mastery | 1132 | Assassin | 5 | 0 | yes |
| `athuluas_wrath` | Athulua's Wrath | 754 | Shared | 1 | 0 | no |
| `balance` | Balance | 1043 | Amazon | 4 | 0 | yes |
| `blessed_life` | Blessed Life | 1505 | Paladin | 8 | 3 | yes |
| `blood_magic` | Blood Magic | 1035 | Amazon | 11 | 0 | yes |
| `bloom` | Bloom | 1326 | Druid | 0 | 3 | yes |
| `bolt` | Bolt | 586 | Shared | 2 | 0 | no |
| `ceaseless_fury` | Ceaseless Fury | 1331 | Druid | 0 | 1 | yes |
| `cold_blooded` | Cold Blooded | 1602 | Sorceress | 1 | 0 | yes |
| `combustion` | Combustion | 1522 | Paladin | 1 | 1 | no |
| `concentrated_effect` | Concentrated Effect | 1070 | Amazon | 3 | 0 | yes |
| `conclave` | Conclave | 1513 | Paladin | 4 | 0 | yes |
| `confluence` | Confluence | 1518 | Paladin | 2 | 0 | yes |
| `consecration` | Consecration | 1511 | Paladin | 8 | 1 | no |
| `cryo_beam` | Cryo Beam | 495 | Shared | 4 | 0 | no |
| `cursebreaker` | Cursebreaker | 677 | Shared | 1 | 0 | no |
| `death_pact` | Death Pact | 1391 | Necromancer | 13 | 2 | yes |
| `determination` | Determination | 1606 | Sorceress | 4 | 1 | yes |
| `devastation` | Devastation | 612 | Shared | 1 | 0 | no |
| `drakemaw` | Drakemaw | 391 | Paladin | 3 | 0 | no |
| `elemental_command` | Elemental Command | 1058 | Amazon | 7 | 0 | yes |
| `elemental_overload` | Elemental Overload | 1235 | Barbarian | 3 | 0 | yes |
| `entanglement` | Entanglement | 1608 | Sorceress | 5 | 2 | yes |
| `execution` | Execution | 1153 | Assassin | 2 | 0 | no |
| `eye_of_the_storm` | Eye of the Storm | 1594 | Sorceress | 7 | 2 | yes |
| `fervor` | Fervor | 1514 | Paladin | 5 | 0 | no |
| `fire_fountain` | Fire Fountain | 498 | Shared | 1 | 1 | no |
| `frostbite` | Frostbite | 1517 | Paladin | 1 | 0 | no |
| `frostborn` | Frostborn | 1591 | Sorceress | 7 | 0 | yes |
| `gift_of_inner_fire` | Gift of Inner Fire | 705 | Shared | 7 | 0 | yes |
| `grim_vision` | Grim Vision | 1424 | Necromancer | 4 | 2 | yes |
| `immortal` | Immortal | 1229 | Barbarian | 8 | 0 | yes |
| `incineration` | Incineration | 1599 | Sorceress | 2 | 0 | yes |
| `indomitable` | Indomitable | 1063 | Amazon | 4 | 0 | yes |
| `inoculation` | Inoculation | 1597 | Sorceress | 3 | 0 | yes |
| `javelin` | Javelin | 588 | Shared | 2 | 0 | no |
| `javelin_nova` | Javelin Nova | 625 | Shared | 2 | 0 | no |
| `knife_throw` | Knife Throw | 591 | Shared | 2 | 0 | no |
| `life_and_death` | Life and Death | 1500 | Paladin | 9 | 1 | yes |
| `lightning_streak` | Lightning Streak | 467 | Shared | 8 | 0 | no |
| `lioness` | Lioness | 1039 | Amazon | 11 | 0 | yes |
| `living_flame` | Living Flame | 1562 | Sorceress | 8 | 0 | yes |
| `mana_sweep` | Mana Sweep | 1579 | Sorceress | 6 | 1 | yes |
| `melee_devotion` | Melee Devotion | 1093 | Amazon | 3 | 0 | yes |
| `mind_spark` | Mind Spark | 1595 | Sorceress | 7 | 0 | yes |
| `nova` | Nova | 48 | Shared | 2 | 0 | no |
| `pain_spirit` | Pain Spirit | 487 | Shared | 2 | 0 | no |
| `primordial_might` | Primordial Might | 1601 | Sorceress | 4 | 1 | yes |
| `prismatic_cloak` | Prismatic Cloak | 1141 | Assassin | 10 | 0 | yes |
| `punisher_barrage` | Punisher Barrage | 448 | Shared | 2 | 0 | no |
| `reaper` | Reaper | 1429 | Necromancer | 2 | 0 | yes |
| `rime` | Rime | 1592 | Sorceress | 3 | 0 | yes |
| `ring_of_flames` | Ring of Flames | 798 | Shared | 2 | 0 | no |
| `rite_of_the_restless` | Rite of the Restless | 1525 | Paladin | 1 | 0 | yes |
| `rite_of_thorns` | Rite of Thorns | 1524 | Paladin | 1 | 0 | yes |
| `rotting_flesh` | Rotting Flesh | 581 | Shared | 1 | 0 | no |
| `rune_of_ice` | Rune of Ice | 436 | Shared | 3 | 3 | no |
| `sanctity` | Sanctity | 1526 | Paladin | 8 | 0 | no |
| `scream_of_tragoul` | Scream of Trag'Oul | 2428 | Shared | 3 | 0 | yes |
| `seal_of_fire` | Seal of Fire | 496 | Shared | 5 | 2 | no |
| `shackles_of_ice` | Shackles of Ice | 480 | Shared | 3 | 2 | no |
| `shatterblade` | Shatterblade | 462 | Shared | 2 | 0 | no |
| `shockwave` | Shockwave | 574 | Shared | 4 | 0 | no |
| `short_duration_superbeast` | Short Duration Superbeast | 627 | Shared | 17 | 2 | yes |
| `solstice_and_equinox` | Solstice and Equinox | 1487 | Paladin | 9 | 1 | yes |
| `soulchain` | Soulchain | 1440 | Necromancer | 13 | 0 | yes |
| `specialization` | Specialization | 1096 | Amazon | 4 | 0 | yes |
| `spike_rush` | Spike Rush | 378 | Shared | 1 | 0 | no |
| `squall_wave` | Squall Wave | 443 | Shared | 3 | 0 | no |
| `stormlord` | Stormlord | 1497 | Paladin | 8 | 0 | yes |
| `stormpike` | Stormpike | 492 | Shared | 2 | 0 | no |
| `subterfuge` | Subterfuge | 1124 | Assassin | 6 | 0 | yes |
| `summon_familiars` | Summon Familiars | 1150 | Assassin | 17 | 0 | no |
| `terror` | Terror | 1437 | Necromancer | 3 | 1 | yes |
| `the_last_warchief` | The Last Warchief | 2891 | Shared | 8 | 0 | yes |
| `thunder_hammer` | Thunder Hammer | 605 | Shared | 2 | 0 | no |
| `thunder_hammer_nova` | Thunder Hammer Nova | 599 | Shared | 1 | 0 | no |
| `thunder_wave` | Thunder Wave | 606 | Shared | 2 | 0 | no |
| `time_strike` | Time Strike | 1737 | Shared | 1 | 0 | no |
| `tornado` | Tornado | 608 | Shared | 1 | 0 | no |
| `tracking` | Tracking | 1340 | Druid | 4 | 0 | yes |
| `transcendence` | Transcendence | 1516 | Paladin | 5 | 1 | no |
| `tremor` | Tremor | 479 | Shared | 11 | 1 | no |
| `unseelie_curse` | Unseelie Curse | 610 | Shared | 10 | 0 | no |
| `vampiric_strike` | Vampiric Strike | 1151 | Assassin | 3 | 0 | no |
| `veil_king_plague_grasp` | Veil King Plague Grasp | 806 | Shared | 1 | 0 | no |
| `vizjerei_rage` | Vizjerei Rage | 592 | Shared | 2 | 0 | no |
| `wild_and_free` | Wild and Free | 1041 | Amazon | 6 | 0 | yes |

## List D — Obtainable named in extractor, absent from planner

Count: **25** (mostly shared/oskill).

| Display name | Extractor skill_id | Class | Status | Formulas | Probes |
|--------------|--------------------|-------|--------|---------:|-------:|
| Bend the Shadows | 1377 | Shared | obtainable | 5 | 2 |
| Bloodbath | 1109 | Shared | obtainable | 9 | 1 |
| Charged Bolt | 38 | Shared | obtainable | 5 | 0 |
| Clobber | 1760 | Shared | obtainable | 5 | 1 |
| Countdown | 453 | Shared | obtainable | 1 | 0 |
| Cyclone | 1755 | Shared | obtainable | 2 | 0 |
| Death Shards | 1724 | Shared | obtainable | 1 | 1 |
| Fire Cascade | 483 | Shared | obtainable | 4 | 1 |
| Gift of Vanquishing | 707 | Shared | obtainable | 7 | 0 |
| Gorefest | 1753 | Shared | obtainable | 1 | 1 |
| Kick | 1 | Shared | obtainable | 0 | 0 |
| Kraken Stance | 1901 | Shared | obtainable | 13 | 0 |
| Left Hand Swing | 5 | Shared | obtainable | 0 | 0 |
| Left Hand Throw | 4 | Shared | obtainable | 0 | 0 |
| Mana Shield | 1561 | Shared | obtainable | 5 | 1 |
| Overpower | 1732 | Shared | obtainable | 1 | 0 |
| Pyroclastic Flow | 1785 | Shared | obtainable | 2 | 1 |
| Rainbow Storm | 1752 | Shared | obtainable | 8 | 1 |
| Rampagor | 1676 | Shared | obtainable | 7 | 0 |
| Rune of Fire | 455 | Shared | obtainable | 0 | 2 |
| Shock Flower | 1747 | Shared | obtainable | 1 | 0 |
| Slicer Blade | 1711 | Shared | obtainable | 1 | 1 |
| Splitfire | 1684 | Shared | obtainable | 0 | 0 |
| Squall Gust | 1756 | Shared | obtainable | 2 | 0 |
| Static Spike | 1686 | Shared | obtainable | 0 | 0 |

## List E — Partial scaling (mana/cooldown only; extractor has effect data)

Count: **49** class-tree skills that already have some `scalingConstants` + text, but only meta stats while extractor exposes effect formulas/probes.

| Display name | Planner id | Extractor skill_id | Planner stats | Effect fields |
|--------------|------------|--------------------|---------------|---------------|
| Arcane Torrent | `arcane_torrent` | 422 | mana_cost | EDmgSymPerCalc, calc1 |
| Askari Lightning | `askari_lightning` | 1057 | mana_cost | EDmgSymPerCalc |
| Blood Thorns | `blood_thorns` | 1494 | mana_cost | EDmgSymPerCalc, calc1, calc2, calc3 |
| Bloodthirst | `bloodthirst` | 1246 | mana_cost | calc1, calc2, calc3, passivecalc1, passivecalc2, passivecalc3 |
| Chronofield | `chronofield` | 1582 | mana_cost | aurastatcalc1, aurastatcalc2 |
| Crystalline Barrier | `crystalline_barrier` | 1587 | mana_cost | EDmgSymPerCalc, aurastatcalc1, aurastatcalc2, aurastatcalc3, aurastatcalc4, aurastatcalc5 |
| Death Ripple | `death_ripple` | 1379 | mana_cost | EDmgSymPerCalc, calc1, calc3 |
| Divine Apparition | `divine_apparition` | 1504 | mana_cost | EDmgSymPerCalc |
| Dream Eater | `dream_eater` | 1381 | mana_cost | EDmgSymPerCalc, aurastatcalc1, aurastatcalc3, aurastatcalc4 |
| Earthquake | `earthquake` | 1199 | mana_cost | EDmgSymPerCalc, aurastatcalc1, aurastatcalc2, aurastatcalc3, calc1, calc2, calc3, passivecalc1 |
| Eldritch Storm | `eldritch_storm` | 308 | mana_cost | EDmgSymPerCalc, aurastatcalc6, calc1, calc2, calc3 |
| Executioner | `executioner` | 1254 | mana_cost | calc1, calc2 |
| Flamefront | `flamefront` | 410 | mana_cost | EDmgSymPerCalc, calc1, calc3 |
| Flamestrike | `flamestrike` | 411 | mana_cost | EDmgSymPerCalc, calc3 |
| Forked Lightning | `forked_lightning` | 417 | mana_cost | EDmgSymPerCalc, calc1, calc3 |
| Frigid Nova | `frigid_nova` | 413 | mana_cost | EDmgSymPerCalc, aurastatcalc1, aurastatcalc2, calc3 |
| Galvanism | `galvanism` | 1256 | mana_cost | calc1, calc2, calc3 |
| Glacial Torrent | `glacial_torrent` | 1589 | mana_cost | EDmgSymPerCalc, calc1 |
| Habeas Corpus | `habeas_corpus` | 1527 | cooldown, mana_cost | calc1 |
| Havoc | `havoc` | 1585 | cooldown | EDmgSymPerCalc, calc1, calc3 |
| Heart of Stone | `heart_of_stone` | 1253 | mana_cost | passivecalc1, passivecalc2, passivecalc3, passivecalc4, passivecalc5 |
| Idol of Scosglen | `idol_of_scosglen` | 1307 | mana_cost, cooldown | EDmgSymPerCalc, aurastatcalc1, aurastatcalc2, aurastatcalc3, calc1, passivecalc1 |
| Immersion | `immersion` | 1576 | mana_cost | calc1 |
| Jinn | `jinn` | 379 | mana_cost | aurastatcalc1, calc1, calc2, calc3, passivecalc1, passivecalc2, passivecalc3 |
| Lemures | `lemures` | 1492 | mana_cost | EDmgSymPerCalc, calc1, calc2, calc3 |
| Lifestealer | `lifestealer` | 1243 | mana_cost | calc1, calc2 |
| Lionheart | `lionheart` | 1479 | mana_cost | aurastatcalc1 |
| Mythal | `mythal` | 1319 | mana_cost | aurastatcalc1, aurastatcalc2, aurastatcalc3, aurastatcalc4 |
| Pagan Rites | `pagan_rites` | 358 | cooldown, mana_cost | calc1, calc2, calc3 |
| Possession | `possession` | 1493 | mana_cost | passivecalc1, passivecalc2, passivecalc3, passivecalc4, passivecalc5 |
| Power Shift | `power_shift` | 1075 | mana_cost | EDmgSymPerCalc |
| Rathma's Chosen | `rathmas_chosen` | 1415 | mana_cost | aurastatcalc1, aurastatcalc2, aurastatcalc3, calc1, calc2, passivecalc1, passivecalc2, passivecalc3, passivecalc4 |
| Raven Familiar | `raven_familiar` | 1577 | mana_cost | ToHitCalc, aurastatcalc1, calc2, passivecalc1, passivecalc2, passivecalc3, passivecalc4 |
| Sacrifices | `sacrifices` | 369 | mana_cost, cooldown | (probes only) |
| Scorpion Blade | `scorpion_blade` | 319 | mana_cost | EDmgSymPerCalc, aurastatcalc1, aurastatcalc3, aurastatcalc5, calc1, calc3 |
| Shamanic Trance | `shamanic_trance` | 1217 | mana_cost | passivecalc1, passivecalc2 |
| Shockwave Trap | `shockwave_trap` | 1127 | mana_cost | EDmgSymPerCalc, passivecalc1, passivecalc2, passivecalc3, passivecalc4 |
| Shuriken Flurry | `shuriken_flurry` | 321 | mana_cost | EDmgSymPerCalc, calc2 |
| Slayer | `slayer` | 396 | cooldown, mana_cost | EDmgSymPerCalc, aurastatcalc1, aurastatcalc2, aurastatcalc3, passivecalc1, passivecalc2, passivecalc3, passivecalc4 |
| Spellbind | `spellbind` | 307 | mana_cost, cooldown | aurastatcalc1, aurastatcalc2, aurastatcalc3, aurastatcalc4, calc1 |
| Spirit Bond | `spirit_bond` | 1255 | mana_cost | calc1, calc2 |
| Spirit of Vengeance | `spirit_of_vengeance` | 1048 | mana_cost | aurastatcalc1, aurastatcalc2, aurastatcalc3, aurastatcalc4, aurastatcalc5, calc1, calc2, passivecalc1, passivecalc2, passivecalc3, passivecalc4, passivecalc5 |
| Spirit Walk | `spirit_walk` | 1218 | cooldown, mana_cost | calc2, calc3 |
| Stormcall | `stormcall` | 1053 | mana_cost | EDmgSymPerCalc, aurastatcalc6, calc1 |
| Superposition | `superposition` | 1588 | mana_cost | aurastatcalc1, aurastatcalc2, aurastatcalc3, aurastatcalc4, aurastatcalc5, aurastatcalc6 |
| Tempest | `tempest` | 418 | mana_cost | EDmgSymPerCalc, calc1, calc3 |
| Thunderstone | `thunderstone` | 1566 | mana_cost | EDmgSymPerCalc, aurastatcalc1, aurastatcalc2, aurastatcalc3, calc3 |
| Torment | `torment` | 1449 | mana_cost | EDmgSymPerCalc, calc1, calc2 |
| Wildfire | `wildfire` | 1306 | mana_cost | EDmgSymPerCalc, calc1 |

## Appendix — Scaling-probed skills not in planner

Count: **32** (includes unobtainable/monster/proc).

| Display name | Extractor skill_id | Class | Status | Probes |
|--------------|--------------------|-------|--------|-------:|
| Bend the Shadows | 1377 | Shared | obtainable | 2 |
| Blade Barrier | 1782 | Shared | unobtainable | 2 |
| Blindside | 1643 | Shared | monster_only | 1 |
| Blood Flash | 1784 | Shared | unobtainable | 1 |
| Bloodbath | 1109 | Shared | obtainable | 1 |
| Call Treewarden | 1731 | Shared | unobtainable | 1 |
| Clobber | 1760 | Shared | obtainable | 1 |
| Crane Stance | 1902 | Shared | unobtainable | 1 |
| Death Coil | 1780 | Shared | unobtainable | 1 |
| Death Shards | 1724 | Shared | obtainable | 1 |
| Exile | 1436 | Necromancer | unobtainable | 4 |
| Fire Cascade | 483 | Shared | obtainable | 1 |
| Frozen Breath | 2708 | Shared | unobtainable | 1 |
| Gorefest | 1753 | Shared | obtainable | 1 |
| Hail of Stones | 1758 | Shared | unobtainable | 1 |
| Hamstring | 1738 | Shared | unobtainable | 1 |
| Magnetic field | 668 | Shared | proc_only | 1 |
| Mana Coil | 463 | Shared | unobtainable | 1 |
| Mana Shield | 1561 | Shared | obtainable | 1 |
| Pyroclastic Flow | 1785 | Shared | obtainable | 1 |
| Rainbow Storm | 1752 | Shared | obtainable | 1 |
| Raven Flight | 1720 | Shared | monster_only | 2 |
| Rune of Fire | 455 | Shared | obtainable | 2 |
| Rune of Mana | 1748 | Shared | unobtainable | 2 |
| Shadow Avatar | 1717 | Shared | unobtainable | 1 |
| Slicer Blade | 1711 | Shared | obtainable | 1 |
| Summon Thunder Bear | 1781 | Shared | unobtainable | 1 |
| Telekinesis | 43 | Shared | proc_only | 1 |
| Treewarden Form | 1664 | Shared | unobtainable | 2 |
| Typhoon Sentry | 1722 | Shared | unobtainable | 2 |
| Unholy Armor | 1700 | Shared | proc_only | 2 |
| Wraith Arrow | 1763 | Shared | unobtainable | 1 |

## Appendix — Planner no-scaling with no extractor formulas/probes

Count: **8**

| Planner id | Display name | Extractor skill_id |
|------------|--------------|--------------------|
| `acumen` | Acumen | 1519 |
| `brutal_effigy` | Brutal Effigy | 1448 |
| `corrupted_vines` | Corrupted Vines | 567 |
| `energy_beam` | Energy Beam | 491 |
| `flurry_of_javelins` | Flurry of Javelins | 490 |
| `pyre` | Pyre | 1600 |
| `shadow_blade` | Shadow Blade | 471 |
| `winged_calamity` | Winged Calamity | 1152 |

## Appendix — Planner no-scaling unmatched by name

Count: **6** (mostly subskill/aura display names).

| Planner id | Display name |
|------------|--------------|
| `spirit_of_vengeance_avenging_aura` | Avenging Aura |
| `flash_blinding_effect` | Blinding Effect |
| `artifice_mastery_claw_block` | Claw Block |
| `skeletal_flayer_demon_blood_aura` | Demon Blood Aura |
| `ice_elementals_frost_essence_aura` | Frost Essence Aura |
| `soulchain_magnetic_chain` | Magnetic Chain |

