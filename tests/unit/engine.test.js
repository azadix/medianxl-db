import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
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
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('character bucket engine', () => {
  let restoreFetch;

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  afterEach(() => {
    setCharacterInstance(null);
  });

  it('matches the legacy character sheet for class + one passive skill', () => {
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    character.setAllSkillPoints({ blessed_life: 5 });
    applyClassBaselineStatsToCharacter('Amazon');
    recomputePlannerStatsFromItems(character);
    const mergedBlvl = buildMergedSkillLevelsForStatRecompute(character);
    recomputePlannerStatsFromSkillAllocations(character, {
      effectiveLevel: 10,
      treeSkillsCache: {},
      allSkillsBonus: 0,
      classSkillsBonus: 0,
      mergedBlvl,
    });
    const legacy = character.getAllStats();

    const registry = createStatRegistry(getPlannerCharacterStatDefs());
    const bucket = createCharacterBucket({ registry });
    applyCharacterSources(bucket, {
      character,
      registry,
      effectiveLevel: 10,
      includeItems: false,
    });
    const snap = bucket.commit();

    for (const key of ['strength', 'dexterity', 'vitality', 'energy', 'life', 'mana', 'physical_resistance']) {
      expect({ key, value: snap.getValue(key) }).toEqual({
        key,
        value: Number(legacy[key]) || 0,
      });
    }
  });
});
