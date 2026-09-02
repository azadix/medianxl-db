import { describe, expect, it } from 'vitest';
import { computeSkillBonusSourceAmounts } from '@/tree/skill-bonus-sources.js';

describe('computeSkillBonusSourceAmounts', () => {
  it('puts relic-only Ancients Hand oSkill grant under Relic', () => {
    expect(
      computeSkillBonusSourceAmounts({
        baseLevel: 0,
        allSkillsBonus: 0,
        classSkillsBonus: 0,
        itemPoints: 15,
        relicSoft: 0,
        relicOSkillGrant: 15,
        isOSkill: true,
      })
    ).toEqual({
      effectiveLevel: 15,
      appliedAllSkillsBonus: 0,
      appliedClassSkillsBonus: 0,
      appliedItemBonus: 0,
      appliedRelicBonus: 15,
    });
  });

  it('splits charm plus relic Teleport grants', () => {
    expect(
      computeSkillBonusSourceAmounts({
        baseLevel: 0,
        allSkillsBonus: 0,
        itemPoints: 19,
        relicSoft: 0,
        relicOSkillGrant: 10,
        isOSkill: true,
      })
    ).toEqual({
      effectiveLevel: 19,
      appliedAllSkillsBonus: 0,
      appliedClassSkillsBonus: 0,
      appliedItemBonus: 9,
      appliedRelicBonus: 10,
    });
  });

  it('adds relic soft on top of relic oSkill grant', () => {
    expect(
      computeSkillBonusSourceAmounts({
        baseLevel: 0,
        allSkillsBonus: 0,
        itemPoints: 15,
        relicSoft: 2,
        relicOSkillGrant: 15,
        isOSkill: true,
      })
    ).toMatchObject({
      effectiveLevel: 17,
      appliedItemBonus: 0,
      appliedRelicBonus: 17,
    });
  });

  it('keeps tree-skill relic soft on Relic and hides item grant', () => {
    expect(
      computeSkillBonusSourceAmounts({
        baseLevel: 10,
        allSkillsBonus: 1,
        classSkillsBonus: 2,
        itemPoints: 15,
        relicSoft: 3,
        relicOSkillGrant: 0,
        isOSkill: false,
      })
    ).toEqual({
      effectiveLevel: 16,
      appliedAllSkillsBonus: 1,
      appliedClassSkillsBonus: 2,
      appliedItemBonus: 0,
      appliedRelicBonus: 3,
    });
  });

  it('caps oSkill leftover so displayed sources still sum to 150', () => {
    const amounts = computeSkillBonusSourceAmounts({
      baseLevel: 140,
      allSkillsBonus: 0,
      itemPoints: 19,
      relicSoft: 0,
      relicOSkillGrant: 10,
      isOSkill: true,
    });
    expect(amounts).toEqual({
      effectiveLevel: 150,
      appliedAllSkillsBonus: 0,
      appliedClassSkillsBonus: 0,
      appliedItemBonus: 9,
      appliedRelicBonus: 1,
    });
    expect(
      amounts.appliedAllSkillsBonus +
        amounts.appliedClassSkillsBonus +
        amounts.appliedItemBonus +
        amounts.appliedRelicBonus
    ).toBe(10);
  });

  it('lets all-skills consume the 150 cap before Item and Relic', () => {
    expect(
      computeSkillBonusSourceAmounts({
        baseLevel: 0,
        allSkillsBonus: 140,
        itemPoints: 15,
        relicSoft: 0,
        relicOSkillGrant: 15,
        isOSkill: true,
      })
    ).toEqual({
      effectiveLevel: 150,
      appliedAllSkillsBonus: 140,
      appliedClassSkillsBonus: 0,
      appliedItemBonus: 0,
      appliedRelicBonus: 10,
    });
  });
});
