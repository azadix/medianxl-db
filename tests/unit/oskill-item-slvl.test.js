/**
 * @file Item-granted oSkills use slvl, not blvl.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Character from '@/character/Character.js';
import { buildMergedSkillLevelsForStatRecompute } from '@/character/planner-core.js';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('oSkill item grants as slvl', () => {
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

  it('splits manual points as blvl and item grants as slvl', () => {
    const itemOnly = Character.oSkillLevelParts({ points: 0, itemPoints: 9 }, 1);
    expect(itemOnly.blvl).toBe(0);
    expect(itemOnly.itemSlvl).toBe(9);
    expect(itemOnly.slvl).toBe(10);
    expect(itemOnly.effective).toBe(10);

    const mixed = Character.oSkillLevelParts({ points: 5, itemPoints: 9 }, 2);
    expect(mixed.blvl).toBe(5);
    expect(mixed.itemSlvl).toBe(9);
    expect(mixed.slvl).toBe(11);
    expect(mixed.effective).toBe(16);
  });

  it('keeps item-only oSkills in merged blvl as 0', () => {
    const character = new Character('Amazon', 99);
    character.oSkills.push({
      skillName: 'teleport',
      displayName: 'Teleport',
      points: 0,
      itemPoints: 9,
      slotId: 'test-slot',
    });
    const merged = buildMergedSkillLevelsForStatRecompute(character);
    expect(merged.teleport).toBe(0);
  });

  it('uses manual oSkill points as blvl when both sources exist', () => {
    const character = new Character('Amazon', 99);
    character.oSkills.push({
      skillName: 'teleport',
      displayName: 'Teleport',
      points: 4,
      itemPoints: 9,
      slotId: 'test-slot',
    });
    const merged = buildMergedSkillLevelsForStatRecompute(character);
    expect(merged.teleport).toBe(4);
  });
});
