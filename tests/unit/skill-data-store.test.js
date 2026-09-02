import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
  getFileSkillStore,
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
