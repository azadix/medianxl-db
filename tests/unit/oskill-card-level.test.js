/** @vitest-environment jsdom */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { buildPlannerSkillCardData } from '@/tree/tree-render.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('oSkill card level', () => {
  let restoreFetch;

  beforeAll(async () => {
    setActivePinia(createPinia());
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterEach(() => {
    setCharacterInstance(null);
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('shows the effective level instead of the manual points', () => {
    const character = createCharacterInstance('Sorceress', 150);
    character.oSkills = [
      {
        skillName: 'lightning_shield',
        displayName: 'Lightning Shield',
        points: 0,
        itemPoints: 3,
        slotId: 'slot-1',
      },
    ];
    setCharacterInstance(character);

    const card = buildPlannerSkillCardData(
      {
        skillName: 'lightning_shield',
        displayName: 'Lightning Shield',
        itemPoints: 3,
        manualPoints: 0,
        slotId: 'slot-1',
      },
      { skillType: 'oskill' }
    );

    expect(card.unboundedPoints).toBe(true);
    // Item grants +3; manual points are 0 by design for oSkills.
    expect(card.effectiveLevel).toBe(3);
  });

  it('includes +All Skills in the oSkill level', () => {
    const character = createCharacterInstance('Sorceress', 150);
    character.oSkills = [
      {
        skillName: 'lightning_shield',
        displayName: 'Lightning Shield',
        points: 1,
        itemPoints: 2,
        slotId: 'slot-1',
      },
    ];
    setCharacterInstance(character);
    const input = document.createElement('input');
    input.id = 'allSkillsBonus';
    input.value = '4';
    document.body.appendChild(input);

    const card = buildPlannerSkillCardData(
      {
        skillName: 'lightning_shield',
        displayName: 'Lightning Shield',
        itemPoints: 2,
        manualPoints: 1,
        slotId: 'slot-1',
      },
      { skillType: 'oskill' }
    );

    expect(card.effectiveLevel).toBe(7);
    input.remove();
  });
});
