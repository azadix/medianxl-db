/**
 * @file Tests for "+N to Maximum Skill Base Level" item modifiers.
 */
import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';
import {
  parseMaxBaseLevelBonusFromModifierLine,
  sumMaxBaseLevelBonusFromModifierLines,
  isMaxBaseLevelBonusModifierLine,
} from '@/items/item-max-base-level.js';
import { parseSkillBonusFromModifierLine } from '@/items/skill-bonus-from-modifiers.js';
import { wrapNamedSkillGrantMarkers } from '@/items/item-granted-oskills.js';
import {
  calculateMaxLevel,
  computeMaxSkillLevelAtUlvl,
  setItemMaxBaseLevelBonusProvider,
} from '@/skills/domain/skill-calculations.js';

describe('item max base level bonuses', () => {
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
    setItemMaxBaseLevelBonusProvider(() => 0);
  });

  it('parses Atanna Khan Dress orange modifier', () => {
    expect(
      parseMaxBaseLevelBonusFromModifierLine('{orange}+8 to Maximum Raven Familiar Base Level')
    ).toEqual({
      amount: 8,
      skillName: 'Raven Familiar',
    });
    expect(isMaxBaseLevelBonusModifierLine('+8 to Maximum Raven Familiar Base Level')).toBe(true);
  });

  it('does not treat max base level lines as +skill grants', () => {
    expect(
      parseSkillBonusFromModifierLine('{orange}+8 to Maximum Raven Familiar Base Level')
    ).toBeNull();
  });

  it('sums bonuses for raven_familiar by id or display name', () => {
    const lines = ['{orange}+8 to Maximum Raven Familiar Base Level'];
    expect(
      sumMaxBaseLevelBonusFromModifierLines(lines, {
        skillId: 'raven_familiar',
        displayName: 'Raven Familiar',
      })
    ).toBe(8);
    expect(
      sumMaxBaseLevelBonusFromModifierLines(lines, {
        skillId: 'arcane_swarm',
        displayName: 'Arcane Swarm',
      })
    ).toBe(0);
  });

  it('wraps Raven Familiar in max base level modifier text', () => {
    expect(wrapNamedSkillGrantMarkers('+8 to Maximum Raven Familiar Base Level')).toBe(
      '+8 to Maximum [[raven_familiar]] Base Level'
    );
  });

  it('raises Raven Familiar max blvl when item provider returns +8', () => {
    expect(computeMaxSkillLevelAtUlvl('raven_familiar', {}, 150)).toBe(25);
    setItemMaxBaseLevelBonusProvider(() => 8);
    expect(computeMaxSkillLevelAtUlvl('raven_familiar', {}, 150)).toBe(33);
    expect(calculateMaxLevel('raven_familiar', {}, 150)).toBe(33);
  });
});
