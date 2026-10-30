/** @vitest-environment jsdom */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createCharacterInstance,
  getCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import {
  getEffectivePlannerLevel,
  getSkillPoints,
  setPlannerSkillsSnapshot,
} from '@/character/planner-core.js';
import { setPlannerAutoLevelFromSpentSkillPoints } from '@/planner/planner-options.js';
import { handleSkillPointChange } from '@/tree/tree-render.js';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('shift-add uses effective planner level', () => {
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
    setPlannerSkillsSnapshot([]);
  });

  it('can add past the stored-level max when auto-level is on', () => {
    setPlannerAutoLevelFromSpentSkillPoints(true);
    const ch = createCharacterInstance('Sorceress', 1);
    const warmth = {
      id: 'warmth',
      name: 'Warmth',
      baseMaxLevel: 1,
      prerequisites: [],
    };
    const fireBolt = {
      id: 'fire_bolt',
      name: 'Fire Bolt',
      baseMaxLevel: 20,
      prerequisites: [],
    };
    setPlannerSkillsSnapshot([warmth, fireBolt]);

    ch.skillPoints.fire_bolt = 7;
    ch.skillPoints.warmth = 1;

    expect(getCharacterInstance().level).toBe(1);
    expect(getEffectivePlannerLevel()).toBeGreaterThan(1);

    handleSkillPointChange(warmth, 25, [warmth, fireBolt]);

    expect(getSkillPoints('warmth')).toBeGreaterThan(1);
  });
});
