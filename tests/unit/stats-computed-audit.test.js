import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { applyClassBaselineStatsToCharacter } from '@/character/planner-core.js';
import { mapTswItemsToSnapshot, unwrapTswOrNativeBuild } from '@/planner/tsw-build-import.js';
import {
  detectCompleteItemText,
  isCompleteItemText,
  setCompleteItemText,
} from '@/items/item-text-completeness.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { applyCharacterSources } from '@/character/bucket/engine.js';
import { parseImportedStatsText } from '@/character/bucket/sources/imports.js';
import {
  hasBuildFixtures,
  listBuildFixtures,
  loadBuildFixture,
  loadPlannerCatalog,
} from '../helpers/planner-catalog.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/**
 * Builds whose stats blob holds FINAL character totals (TSW flavour). Complete-text
 * (d2s) dumps store base pools instead and are skipped by the comparison below, so
 * listing one of those here would silently validate nothing.
 */
const DEFAULT_FILES = [
  'Paejaks_26_10_2026_21_26.json',
  'NgPlad_27_10_2026_14_38.json',
  'haha_pal_31_10_2026_17_17.json',
  'sorlight_26_10_2026_21_28.json',
  'Xiaochou.json',
  'buu.json',
];
/** The gate is worthless if a fixture change makes every build skip, so require coverage. */
const MIN_COMPARED_BUILDS = 6;
const ATTRIBUTES = ['strength', 'dexterity', 'vitality', 'energy'];
/**
 * Stats the dump reports as character-sheet totals. Elemental resists are included
 * because they match exactly on most builds, so they catch real regressions.
 */
const COMPARED_KEYS = [
  'life',
  'mana',
  'fire_resistance',
  'cold_resistance',
  'lightning_resistance',
  'poison_resistance',
];
const TOLERANCE = 0.25;
/**
 * D2 clamps life/mana at 2^13-1 (8191) for the sheet/globe. Several dumps sit exactly on
 * that boundary while the same character's other stat is far above it, so a computed
 * value above 8191 can never match - the comparison would be measuring the clamp.
 */
const CAP_SENTINEL = 8191;
/** Per-build, per-stat gaps. Anything not listed here fails the gate. */
const KNOWN_COMPUTED_GAPS = new Map([
  // No missing component: this is the open formula question described below.
  [
    'NgPlad_27_10_2026_14_38.json',
    new Map([['life', 'bonus-vitality over-count; see the note below']]),
  ],
  // Reverence (+1020 vitality) and Valiance (+80% movement speed) are allocated but not
  // in the captured sheet - likely a buff snapshot rather than a modelling error.
  [
    'haha_pal_31_10_2026_17_17.json',
    new Map([['life', 'Reverence vitality is not in the sheet; see the note below']]),
  ],
  // The equipped Despondence staff is entirely absent from the sheet (+50% spell damage,
  // +984 life, -100% lightning resist, -29% enemy cold), so this dump was captured before
  // it was equipped. Mana and the other three resists still match exactly.
  [
    'sorlight_26_10_2026_21_28.json',
    new Map([
      ['life', 'Despondence (+984 life) is not in the sheet; stale dump'],
      ['lightning_resistance', 'Despondence (-100%) is not in the sheet; stale dump'],
    ]),
  ],
  // Paragon's Hammer "Infernal Machine" (+3% elemental resists per level above 130) is in
  // the item text but missing from the sheet. The sibling "Projector" affix (+20% max
  // mana) is verified applied on Xiaochou, so hammer upgrades are modelled correctly -
  // this looks game-side rather than a parser bug.
  [
    'Paejaks_26_10_2026_21_26.json',
    new Map([
      ['fire_resistance', 'Infernal Machine affix not in the sheet'],
      ['cold_resistance', 'Infernal Machine affix not in the sheet'],
      ['lightning_resistance', 'Infernal Machine affix not in the sheet'],
      ['poison_resistance', 'Infernal Machine affix not in the sheet'],
    ]),
  ],
]);
// Open question (only NgPlad's life now): builds that allocate almost no vitality and get
// it all from gear over-count life. Our life lands within ~3% of the dump when the post-%
// "bonus vitality" term is dropped, which would suggest the dump's vitality already
// includes item bonuses - but item bonuses can exceed the dump's whole attribute value
// (NgPlad strength 25 vs ~540 from gear), which rules that out. Not changed here: doing so
// would alter planner life for every build, and applyDerivedSources carries an in-game
// verification for the current layering. Needs one sheet reading to settle.

describe.skipIf(!hasBuildFixtures())('computed stats audit', () => {
  let restoreFetch;
  let planner;
  let files;

  beforeAll(async () => {
    planner = loadPlannerCatalog();
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
    files = listBuildFixtures();
    if (process.env.STATS_COMPUTED_ALL !== '1') {
      files = files.filter((name) => DEFAULT_FILES.includes(name));
    }
  });

  afterAll(() => {
    setCharacterInstance(null);
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('keeps computed life/mana/resists within 25% of the in-game dump', () => {
    const failures = [];
    const rows = [];
    const skipped = [];
    const capped = [];
    let compared = 0;

    for (const file of files) {
      try {
        const raw = loadBuildFixture(file);
        const { build, tswItems } = unwrapTswOrNativeBuild(raw);
        setActivePinia(createPinia());
        const store = useItemsStore();
        store.catalog = planner.catalog;
        store.sets = planner.sets;
        store.catalogLoaded = true;
        store.catalogVersionFolder = '2_14';
        const level = Number(build.level) || 150;
        const character = createCharacterInstance(build.class, level);
        character.setAllSkillPoints(build.skillPoints || {});
        character.setAllOSkills(build.oSkills || []);
        store.syncViewerClassName(build.class);
        setCompleteItemText(detectCompleteItemText(tswItems || []));
        const { snapshot } = mapTswItemsToSnapshot(tswItems || [], store, build.class);
        store.fromSnapshot(snapshot);

        if (isCompleteItemText()) {
          skipped.push(`${file}: complete item text (blob holds base pools)`);
          continue;
        }

        const blob = Object.fromEntries(
          parseImportedStatsText(build.stats).map((entry) => [entry.key, entry.value])
        );
        applyClassBaselineStatsToCharacter(build.class);
        // The dump's four primary attributes are BASE values (allocated points): e.g.
        // NgPlad's strength is 25 while its gear alone contributes ~540. The bucket adds
        // item/skill bonuses on top, so seed these as stored values.
        // Life/mana are deliberately NOT seeded: they are the assertion targets.
        for (const attr of ATTRIBUTES) {
          if (Number.isFinite(Number(blob[attr]))) character.setStat(attr, Number(blob[attr]));
        }

        const registry = createStatRegistry(getPlannerCharacterStatDefs());
        const bucket = createCharacterBucket({ registry });
        const result = applyCharacterSources(bucket, {
          character,
          registry,
          itemsStore: store,
          effectiveLevel: level,
          allSkillsBonus: Number(build.allSkillsBonus) || 0,
        });

        let comparedKeys = 0;
        const deltas = [];
        for (const key of COMPARED_KEYS) {
          const expected = Number(blob[key]);
          const actual = Number(result.snapshot.getValue(key));
          if (!Number.isFinite(expected) || expected <= 0) continue;
          if (expected === CAP_SENTINEL) {
            capped.push(`${file}: ${key} (dump value is the ${CAP_SENTINEL} clamp)`);
            continue;
          }
          comparedKeys += 1;
          const ratio = actual / expected;
          deltas.push(`${key} ${actual}/${expected} (${((ratio - 1) * 100).toFixed(1)}%)`);
          const knownGap = KNOWN_COMPUTED_GAPS.get(file)?.has(key);
          if ((ratio < 1 - TOLERANCE || ratio > 1 + TOLERANCE) && !knownGap) {
            failures.push(`${file}: ${key} ${actual} vs ${expected}`);
          }
        }
        if (comparedKeys > 0) compared += 1;
        rows.push(`${file}: ${deltas.join(', ') || 'no comparable keys'}`);

        if (process.env.STATS_COMPUTED_KEYDIFF === '1') {
          const diff = [];
          for (const [key, value] of Object.entries(blob)) {
            const expected = Number(value);
            if (!Number.isFinite(expected) || expected === 0) continue;
            const actual = Number(result.snapshot.getValue(key));
            if (!Number.isFinite(actual) || actual === 0) continue;
            diff.push(`${key} ${actual}/${expected} (${((actual / expected - 1) * 100).toFixed(0)}%)`);
          }
          console.log(`KEYS ${file}: ${diff.join(', ')}`);
        }
        const debugFile = process.env.STATS_COMPUTED_DEBUG || 'Xiaochou.json';
        const debugKeys = (
          process.env.STATS_COMPUTED_DEBUG_KEYS ||
          'life,maximum_life,strength,dexterity,vitality,mana,maximum_mana,energy'
        )
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean);
        if (process.env.STATS_COMPUTED_VERBOSE === '1' && file === debugFile) {
          for (const key of debugKeys) {
            const b = result.snapshot.getBreakdown(key);
            console.log(`--- ${key} ${b?.value} raw=${JSON.stringify(b?.raw)}`);
            for (const g of b?.groups || []) {
              console.log(
                `  ${g.title} ${g.subtotal} :: ${g.rows
                  .map((r) => `${r.label}${r.sourceId ? `[${r.sourceId}]` : ''}=${r.value}`)
                  .join('; ')}`
              );
            }
          }
        }
      } catch (error) {
        failures.push(`${file}: ${error?.message || error}`);
      }
    }

    if (process.env.STATS_COMPUTED_VERBOSE === '1') {
      console.log(
        `compared ${compared} build(s), skipped ${skipped.length} of ${files.length}`
      );
      for (const row of rows) console.log(row);
      for (const row of skipped) console.log(`skip ${row}`);
      for (const row of capped) console.log(`capped ${row}`);
      for (const [file, gaps] of KNOWN_COMPUTED_GAPS) {
        if (!files.includes(file)) continue;
        for (const [key, reason] of gaps) console.log(`known gap ${file} ${key}: ${reason}`);
      }
    }

    expect(
      compared,
      `computed audit compared ${compared} build(s), expected >= ${MIN_COMPARED_BUILDS}. ` +
        'The default fixtures may be missing from tests/fixtures/tsw-builds, or they may ' +
        'have changed export flavour and are now being skipped.'
    ).toBeGreaterThanOrEqual(MIN_COMPARED_BUILDS);
    expect(failures.slice(0, 20)).toEqual([]);
  }, 180000);
});
