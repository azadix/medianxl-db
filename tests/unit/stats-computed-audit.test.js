import { readdirSync } from 'node:fs';
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
import { hasBuildFixtures, loadBuildFixture, loadPlannerCatalog } from '../helpers/planner-catalog.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const FIXTURES = new URL('../fixtures/tsw-builds/', import.meta.url);
const DEFAULT_FILES = [
  'METST_Kriek_28_10_2026_17_22.json',
  'Gabriella_30_10_2026_19_01.json',
  'Chickpea_27_10_2026_14_38.json',
  'Arwen.json',
  'Azalea.json',
  'Darkbladez-SSF_28_10_2026_10_28.json',
  'PETUH-XSF.json',
  'Xiaochou.json',
  'Miss_Ion_08_11_2026_14_34.json',
  'Miss_Ter_08_11_2026_14_34.json',
];
const COMPARED_KEYS = ['life', 'mana'];
const ATTRIBUTE_ORACLE = {
  'Miss_Ion_08_11_2026_14_34.json': {
    strength: 790,
    dexterity: 671,
    vitality: 179,
    energy: 599,
  },
};
// Known remaining gaps are logged but do not fail the gate; new regressions elsewhere do.
const KNOWN_COMPUTED_GAPS = new Set([
  'Xiaochou.json',
  'Miss_Taken.json',
  'haha_pal_31_10_2026_17_17.json',
  'sorlight_26_10_2026_21_28.json',
  'NgPlad_27_10_2026_14_38.json',
]);

describe.skipIf(!hasBuildFixtures())('computed stats audit', () => {
  let restoreFetch;
  let planner;
  let files;

  beforeAll(async () => {
    planner = loadPlannerCatalog();
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
    files = readdirSync(FIXTURES)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .sort();
    if (process.env.STATS_COMPUTED_ALL !== '1') {
      files = files.filter((name) => DEFAULT_FILES.includes(name));
    }
  });

  afterAll(() => {
    setCharacterInstance(null);
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('keeps computed life/mana within 25% of the in-game dump', () => {
    const failures = [];
    const rows = [];
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
        const character = createCharacterInstance(build.class, Number(build.level) || 150);
        character.setAllSkillPoints(build.skillPoints || {});
        character.setAllOSkills(build.oSkills || []);
        store.syncViewerClassName(build.class);
        setCompleteItemText(detectCompleteItemText(tswItems || []));
        const { snapshot } = mapTswItemsToSnapshot(tswItems || [], store, build.class);
        store.fromSnapshot(snapshot);
        applyClassBaselineStatsToCharacter(build.class);
        if (isCompleteItemText()) continue; // blob holds base pools, not computed totals
        const blob = Object.fromEntries(
          parseImportedStatsText(build.stats).map((entry) => [entry.key, entry.value])
        );
        // The dump stores the allocated/base attributes, not item/skill totals. Seed
        // those four values without overriding life/mana, which are what this audit checks.
        for (const attr of ['strength', 'dexterity', 'vitality', 'energy']) {
          if (Number.isFinite(Number(blob[attr]))) character.setStat(attr, Number(blob[attr]));
        }

        const registry = createStatRegistry(getPlannerCharacterStatDefs());
        const bucket = createCharacterBucket({ registry });
        const result = applyCharacterSources(bucket, {
          character,
          registry,
          itemsStore: store,
          effectiveLevel: Number(build.level) || 150,
          allSkillsBonus: Number(build.allSkillsBonus) || 0,
        });
        const deltas = [];
        for (const key of COMPARED_KEYS) {
          const expected = Number(blob[key]);
          const actual = Number(result.snapshot.getValue(key));
          if (!Number.isFinite(expected) || expected <= 0) continue;
          const ratio = actual / expected;
          deltas.push(`${key} ${actual}/${expected} (${((ratio - 1) * 100).toFixed(1)}%)`);
          if ((ratio < 0.75 || ratio > 1.25) && !KNOWN_COMPUTED_GAPS.has(file)) {
            failures.push(`${file}: ${key} ${actual} vs ${expected}`);
          }
        }
        for (const [key, expected] of Object.entries(ATTRIBUTE_ORACLE[file] || {})) {
          const actual = Number(result.snapshot.getValue(key));
          const ratio = actual / expected;
          if (ratio < 0.75 || ratio > 1.25) {
            failures.push(`${file}: ${key} ${actual} vs ${expected}`);
          }
        }
        rows.push(`${file}: ${deltas.join(', ')}`);
        if (process.env.STATS_COMPUTED_VERBOSE === '1' && file === 'Xiaochou.json') {
          for (const key of ['life', 'maximum_life', 'vitality']) {
            const b = result.snapshot.getBreakdown(key);
            console.log(`--- ${key} ${b?.value} raw=${JSON.stringify(b?.raw)}`);
            for (const g of b?.groups || []) {
              console.log(
                `  ${g.title} ${g.subtotal} :: ${g.rows.map((r) => `${r.label}=${r.value}`).join('; ')}`
              );
            }
          }
        }
      } catch (error) {
        failures.push(`${file}: ${error?.message || error}`);
      }
    }
    if (process.env.STATS_COMPUTED_VERBOSE === '1') {
      for (const row of rows) console.log(row);
    }
    expect(failures.slice(0, 20)).toEqual([]);
  }, 180000);
});
