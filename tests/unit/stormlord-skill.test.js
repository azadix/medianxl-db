import { beforeAll, describe, expect, it } from 'vitest';
import { createCharacterInstance, setCharacterInstance } from '@/character/planner-instance.js';
import { buildMergedSkillLevelsForStatRecompute } from '@/character/planner-core.js';
import { recomputePlannerStatsFromSkillAllocations } from '@/character/planner-stat-modifiers.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('Stormlord skill stats', () => {
  beforeAll(async () => {
    installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  /**
   * @param {Record<string, number>} skillPoints
   * @returns {Record<string, number>}
   */
  function stormlordBonuses(skillPoints, allSkillsBonus = 0, classSkillsBonus = 0) {
    const character = createCharacterInstance('Paladin', 150);
    setCharacterInstance(character);
    character.setAllSkillPoints(skillPoints);
    recomputePlannerStatsFromSkillAllocations(character, {
      effectiveLevel: 150,
      treeSkillsCache: {},
      allSkillsBonus,
      classSkillsBonus,
      mergedBlvl: buildMergedSkillLevelsForStatRecompute(character),
    });
    const out = character.getPlannerSkillStatBonuses();
    setCharacterInstance(null);
    return out;
  }

  it('matches the MXL Planner all-attribute value at level 25', () => {
    expect(stormlordBonuses({ stormlord: 25 })).toMatchObject({
      strength: 100,
      dexterity: 100,
      vitality: 100,
      energy: 100,
    });
  });

  it('does not multiply by the inflated effective Acumen level', () => {
    expect(stormlordBonuses({ stormlord: 25, acumen: 1 }, 22, 11)).toMatchObject({
      strength: 282,
      dexterity: 282,
      vitality: 282,
      energy: 282,
    });
  });

  it('applies the Acumen 100% bonus on top', () => {
    expect(stormlordBonuses({ stormlord: 25, acumen: 1 })).toMatchObject({
      strength: 200,
      dexterity: 200,
      vitality: 200,
      energy: 200,
    });
  });
});
