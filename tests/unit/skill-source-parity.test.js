import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { mapTswItemsToSnapshot, unwrapTswOrNativeBuild } from '@/planner/tsw-build-import.js';
import { recomputePlannerStatsFromItems } from '@/items/item-character-stat-bonuses.js';
import { buildMergedSkillLevelsForStatRecompute } from '@/character/planner-core.js';
import { recomputePlannerStatsFromSkillAllocations } from '@/character/planner-stat-modifiers.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { applySkillSources } from '@/character/bucket/sources/skills.js';
import { hasBuildFixtures, loadBuildFixture, loadPlannerCatalog } from '../helpers/planner-catalog.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/**
 * @param {object} planner
 * @param {string} file
 */
function loadBuild(planner, file) {
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
  const { snapshot } = mapTswItemsToSnapshot(tswItems || [], store, build.class);
  store.fromSnapshot(snapshot);
  recomputePlannerStatsFromItems(character);
  return { build, store, character };
}

describe.skipIf(!hasBuildFixtures())('skill source parity', () => {
  let restoreFetch;
  let planner;

  beforeAll(async () => {
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
    'METST_Kriek_28_10_2026_17_22.json',
    'Gabriella_30_10_2026_19_01.json',
    'Chickpea_27_10_2026_14_38.json',
    'Arwen.json',
    'Azalea.json',
    'Darkbladez-SSF_28_10_2026_10_28.json',
  ])('matches the legacy skill aggregator for %s', (file) => {
    const { build, character } = loadBuild(planner, file);
    const effectiveLevel = Number(build.level) || 150;
    const allSkillsBonus = Number(build.allSkillsBonus) || 0;
    const mergedBlvl = buildMergedSkillLevelsForStatRecompute(character);
    recomputePlannerStatsFromSkillAllocations(character, {
      effectiveLevel,
      treeSkillsCache: {},
      allSkillsBonus,
      classSkillsBonus: 0,
      mergedBlvl,
    });
    const legacy = character.getPlannerSkillStatBonuses();

    const registry = createStatRegistry(getPlannerCharacterStatDefs());
    const bucket = createCharacterBucket({ registry, expandAliases: false });
    applySkillSources(bucket, {
      character,
      registry,
      effectiveLevel,
      allSkillsBonus,
      classSkillsBonus: 0,
    });
    const snap = bucket.commit();

    const mismatches = [];
    for (const key of Object.keys(legacy)) {
      const expected = Number(legacy[key]) || 0;
      const actual = Number(snap.getValue(key)) || 0;
      if (Math.abs(expected - actual) > 1e-9) mismatches.push({ key, expected, actual });
    }
    setCharacterInstance(null);
    expect(mismatches).toEqual([]);
  });
});
