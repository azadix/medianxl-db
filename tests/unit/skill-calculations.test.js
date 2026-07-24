import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  calculateMaxLevel,
  getDevotionDisplayName,
  DEVOTION_TYPES,
  getSkillDevotion,
  checkDevotionRestriction,
} from '@/skills/domain/skill-calculations.js';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
  getFileSkillStore,
} from '@/tree/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('getDevotionDisplayName', () => {
  it('maps devotion constants to labels', () => {
    expect(getDevotionDisplayName(DEVOTION_TYPES.NONE)).toBe('No Devotion');
    expect(getDevotionDisplayName(DEVOTION_TYPES.HOLY)).toBe('Holy Devotion');
    expect(getDevotionDisplayName(DEVOTION_TYPES.BOW)).toBe('Bow Devotion');
  });
});

describe('calculateMaxLevel without store', () => {
  it('returns 0 when store is not initialized', () => {
    resetSkillDataStoreForTests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(calculateMaxLevel(1, {})).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('skill calculations with tree_data', () => {
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

  it('loads the active skill store', () => {
    const store = getFileSkillStore();
    expect(store).toBeTruthy();
    expect(store.catalog.length).toBeGreaterThan(0);
  });

  it('calculateMaxLevel returns base max for a simple skill', () => {
    const store = getFileSkillStore();
    const skill = store.catalog.find(
      (s) => s.baseMaxLevel != null && s.baseMaxLevel > 0 && !String(s.id).includes('innate')
    );
    expect(skill).toBeTruthy();
    const max = calculateMaxLevel(skill.numericId, {});
    expect(max).toBeGreaterThanOrEqual(skill.baseMaxLevel);
  });

  it('getSkillDevotion returns a known devotion for a paladin holy-tab skill', () => {
    const store = getFileSkillStore();
    const holySkill = store.catalog.find((s) => s.classId === 5 && (s.tab === 30 || s.tab === 31));
    expect(holySkill).toBeTruthy();
    expect(getSkillDevotion(holySkill.numericId)).toBe(DEVOTION_TYPES.HOLY);
  });

  it('checkDevotionRestriction blocks cross-devotion allocation', () => {
    const store = getFileSkillStore();
    const holySkill = store.catalog.find((s) => s.classId === 5 && (s.tab === 30 || s.tab === 31));
    const unholySkill = store.catalog.find((s) => s.classId === 5 && (s.tab === 33 || s.tab === 34));
    expect(holySkill && unholySkill).toBeTruthy();

    const levels = { [holySkill.id]: 1 };
    const ok = checkDevotionRestriction(holySkill.numericId, levels);
    expect(ok.canAllocate).toBe(true);

    const blocked = checkDevotionRestriction(unholySkill.numericId, levels);
    expect(blocked.canAllocate).toBe(false);
    expect(blocked.reason).toContain('Holy Devotion');
  });
});
