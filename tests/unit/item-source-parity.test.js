import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import {
  mapTswItemsToSnapshot,
  unwrapTswOrNativeBuild,
} from '@/planner/tsw-build-import.js';
import { setCompleteItemText } from '@/items/item-text-completeness.js';
import { recomputePlannerStatsFromItems } from '@/items/item-character-stat-bonuses.js';
import { setPlannerAutoMatchHighestStatRequirements } from '@/planner/planner-options.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { applyItemSources } from '@/character/bucket/sources/items.js';
import { loadBuildFixture, loadPlannerCatalog } from '../helpers/planner-catalog.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/**
 * @param {object} planner
 * @param {string} file
 * @returns {{ store: object, character: object }}
 */
function loadBuild(planner, file) {
  const raw = loadBuildFixture(file);
  const { build, tswItems } = unwrapTswOrNativeBuild(raw);
  setActivePinia(createPinia());
  setCompleteItemText(false);
  const store = useItemsStore();
  store.catalog = planner.catalog;
  store.sets = planner.sets;
  store.catalogLoaded = true;
  store.catalogVersionFolder = '2_14';
  const character = createCharacterInstance(build.class, Number(build.level) || 150);
  store.syncViewerClassName(build.class);
  const { snapshot } = mapTswItemsToSnapshot(tswItems || [], store, build.class);
  store.fromSnapshot(snapshot);
  return { store, character };
}

/**
 * @param {object} resource
 * @param {object} resource.store
 * @param {object} resource.character
 */
function itemBonuses(resource) {
  const { store, character } = resource;
  const bucket = createCharacterBucket({ registry: createStatRegistry(getPlannerCharacterStatDefs()), expandAliases: false });
  applyItemSources(bucket, { itemsStore: store, character });
  const snapshot = bucket.commit();
  // Run the adapter after the independent bucket build so it cannot change the
  // requirement-gating stats used by the comparison.
  recomputePlannerStatsFromItems(character);
  const legacy = character._plannerItemStatBonuses || {};
  return { legacy, snapshot };
}

describe('item source parity', () => {
  let restoreFetch;
  let planner;

  beforeAll(async () => {
    setPlannerAutoMatchHighestStatRequirements(true);
    planner = loadPlannerCatalog();
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterAll(() => {
    setCharacterInstance(null);
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it.each([
    'Xiaochou.json',
    'METST_Kriek_28_10_2026_17_22.json',
    'Darkbladez-SSF_28_10_2026_10_28.json',
    'Gabriella_30_10_2026_19_01.json',
    'PETUH-XSF.json',
    'Chickpea_27_10_2026_14_38.json',
  ])('matches the legacy item aggregator for %s', (file) => {
      const resource = loadBuild(planner, file);
      const { legacy, snapshot } = itemBonuses(resource);
      // Parity target is the legacy aggregator except where the new pipeline fixes a
      // known legacy double count. Xiaochou's Paragon's Hammer repeats "+3% Magic Find
      // per Character Level above 130" as both a catalogue affix and a TSW extra
      // (20 levels = 60, legacy 120).
      const knownFixes = new Map(
        file === 'Xiaochou.json' ? [['magic_find', { legacy: 120, actual: 60 }]] : []
      );
      const mismatches = [];
      const keys = new Set([...Object.keys(legacy), ...Object.keys(snapshot.values)]);
      for (const key of keys) {
        const expected = Number(legacy[key]) || 0;
        const actual = Number(snapshot.getValue(key)) || 0;
        if (Math.abs(expected - actual) <= 1e-9) continue;
        const fix = knownFixes.get(key);
        if (fix && expected === fix.legacy && actual === fix.actual) continue;
        mismatches.push({ key, expected, actual });
      }
      if (file === 'Xiaochou.json') {
        expect(snapshot.getValue('magic_find')).toBe(60);
      }
      setCharacterInstance(null);
      expect(mismatches).toEqual([]);
    }
  );
});
