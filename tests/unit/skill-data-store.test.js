import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
  getFileSkillStore,
  withBaseAttributeFormulaStats,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('catalogRowMatchesPlannerClass', () => {
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

  it('matches Mastery catalog rows for every playable class', () => {
    const store = getFileSkillStore();
    const chemistry = store.catalogByInternalId.get('chemistry');
    expect(chemistry).toBeTruthy();
    expect(chemistry.tabName).toBe('Mastery');
    expect(chemistry.classId).toBe(2);

    const playable = store.playablePlannerClassIds();
    expect(playable.length).toBeGreaterThan(1);
    expect(playable).toContain(2);
    expect(playable).toContain(6);

    for (const classId of playable) {
      expect(store.catalogRowMatchesPlannerClass(chemistry, classId)).toBe(true);
    }
  });

  it('rejects a class-specific skill on the wrong class', () => {
    const store = getFileSkillStore();
    const amazonOnly = store.catalog.find(
      (s) =>
        s.classId === 2 &&
        s.tabName !== 'Mastery' &&
        s.class !== '__all__' &&
        s.class !== '*' &&
        !Array.isArray(s.class)
    );
    expect(amazonOnly).toBeTruthy();
    expect(store.catalogRowMatchesPlannerClass(amazonOnly, 2)).toBe(true);
    expect(store.catalogRowMatchesPlannerClass(amazonOnly, 6)).toBe(false);
  });
});

describe('withBaseAttributeFormulaStats pool tokens', () => {
  it('injects base_mana from max mana and keeps current_mana', () => {
    const character = {
      getRawStat: (key) => {
        if (key === 'current_mana') return 40;
        if (key === 'current_life') return 80;
        if (key === 'strength') return 20;
        return 0;
      },
      getStat: (key) => {
        if (key === 'mana') return 200;
        if (key === 'life') return 400;
        return 0;
      },
    };
    const out = withBaseAttributeFormulaStats(
      { mana: 180, current_mana: 40, base_mana: 0, life: 350, current_life: 80, base_life: 0, strength: 20 },
      character
    );
    expect(out.base_mana).toBe(200);
    expect(out.current_mana).toBe(40);
    expect(out.base_life).toBe(400);
    expect(out.current_life).toBe(80);
  });

  it('uses stats.life/mana as base pools when no character is passed', () => {
    const out = withBaseAttributeFormulaStats({
      mana: 75,
      current_mana: 10,
      base_mana: 0,
      life: 120,
      current_life: 30,
      base_life: 0,
    });
    expect(out.base_mana).toBe(75);
    expect(out.current_mana).toBe(10);
    expect(out.base_life).toBe(120);
    expect(out.current_life).toBe(30);
  });
});
