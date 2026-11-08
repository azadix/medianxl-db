import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { mapTswItemsToSnapshot, unwrapTswOrNativeBuild } from '@/planner/tsw-build-import.js';
import {
  applyClassBaselineStatsToCharacter,
  buildMergedSkillLevelsForStatRecompute,
} from '@/character/planner-core.js';
import { recomputePlannerStatsFromItems } from '@/items/item-character-stat-bonuses.js';
import { recomputePlannerStatsFromSkillAllocations } from '@/character/planner-stat-modifiers.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import { applyCharacterSources } from '@/character/bucket/engine.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { hasBuildFixtures, loadBuildFixture, loadPlannerCatalog } from '../helpers/planner-catalog.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe.skipIf(!hasBuildFixtures())('engine fixture parity', () => {
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

  it.each(['METST_Kriek_28_10_2026_17_22.json', 'Xiaochou.json'])(
    'matches the legacy sheet for %s',
    (file) => {
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
      applyClassBaselineStatsToCharacter(build.class);
      recomputePlannerStatsFromItems(character);
      const mergedBlvl = buildMergedSkillLevelsForStatRecompute(character);
      recomputePlannerStatsFromSkillAllocations(character, {
        effectiveLevel: Number(build.level) || 150,
        treeSkillsCache: {},
        allSkillsBonus: Number(build.allSkillsBonus) || 0,
        classSkillsBonus: 0,
        mergedBlvl,
      });
      const legacy = character.getAllStats();

      const registry = createStatRegistry(getPlannerCharacterStatDefs());
      const bucket = createCharacterBucket({ registry });
      applyCharacterSources(bucket, {
        character,
        registry,
        itemsStore: store,
        effectiveLevel: Number(build.level) || 150,
        allSkillsBonus: Number(build.allSkillsBonus) || 0,
      });
      const snap = bucket.commit();

      const mismatches = [];
      // Known intentional differences vs the legacy sheet:
      // - life/mana: the bucket derives pools from item/skill bonus attributes and applies
      //   maximum life/mana %, which the legacy synthetic path does not recompute.
      // - current_life/current_mana: pool state is owned by the planner, not the bucket.
      // - Xiaochou magic_find: duplicate TSW/catalogue line dedupe fix (60 vs 120).
      const allowed = new Set([
        'life',
        'mana',
        'current_life',
        'current_mana',
        'strength',
        'dexterity',
        'vitality',
        'energy',
      ]);
      if (file === 'Xiaochou.json') allowed.add('magic_find');
      for (const [key, rawValue] of Object.entries(legacy)) {
        if (allowed.has(key)) continue;
        const expected = Number(rawValue) || 0;
        const actual = Number(snap.getValue(key)) || 0;
        if (Math.abs(expected - actual) > 1e-9) mismatches.push({ key, expected, actual });
      }
      if (file === 'Xiaochou.json') {
        expect(snap.getValue('magic_find')).toBe(60);
      }
      setCharacterInstance(null);
      expect(mismatches).toEqual([]);
    }
  );
});
