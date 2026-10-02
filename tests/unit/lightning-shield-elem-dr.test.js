import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Skill from '@/skills/domain/Skill.js';
import {
  applyLightningShieldElemDrToScaling,
  lightningShieldElemDrFactor,
  relicOSkillIdsFromGrants,
  scaleLightningShieldElemDrValue,
} from '@/skills/domain/lightning-shield-elem-dr.js';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('lightningShieldElemDrFactor', () => {
  it('is full when the skill is not an oSkill', () => {
    expect(lightningShieldElemDrFactor({ className: 'Amazon' })).toBe(1);
    expect(lightningShieldElemDrFactor({ className: 'Barbarian' })).toBe(1);
  });

  it('is 0 for oSkill without a relic', () => {
    expect(
      lightningShieldElemDrFactor({
        className: 'Barbarian',
        oSkillIds: ['lightning_shield'],
      })
    ).toBe(0);
  });

  it('is 1/3 for non-Amazon relic oSkill', () => {
    expect(
      lightningShieldElemDrFactor({
        className: 'Sorceress',
        oSkillIds: ['lightning_shield'],
        relicOSkillIds: ['lightning_shield'],
      })
    ).toBe(1 / 3);
  });

  it('stays 0 for Amazon oSkill even with a relic id present', () => {
    expect(
      lightningShieldElemDrFactor({
        className: 'Amazon',
        oSkillIds: ['lightning_shield'],
        relicOSkillIds: ['lightning_shield'],
      })
    ).toBe(0);
  });
});

describe('scaleLightningShieldElemDrValue', () => {
  it('truncates relic 1/3 of 3+3*lvl', () => {
    expect(scaleLightningShieldElemDrValue(33, 1 / 3)).toBe(11);
    expect(scaleLightningShieldElemDrValue(6, 1 / 3)).toBe(2);
  });
});

describe('applyLightningShieldElemDrToScaling', () => {
  it('rewrites formula display for relic 1/3', () => {
    const scaling = { value0: '3+3*lvl', value0_evaluated: '33' };
    applyLightningShieldElemDrToScaling(
      'lightning_shield',
      'elemental_magic_damage_reduced_flat',
      scaling,
      {
        className: 'Paladin',
        oSkillIds: ['lightning_shield'],
        relicOSkillIds: ['lightning_shield'],
      },
      true
    );
    expect(scaling.value0).toBe('(3+3*lvl)/3');
    expect(scaling.value0_evaluated).toBe('11');
  });
});

describe('relicOSkillIdsFromGrants', () => {
  it('keeps positive grants only', () => {
    expect(relicOSkillIdsFromGrants({ lightning_shield: 14, teleport: 0 })).toEqual([
      'lightning_shield',
    ]);
  });
});

describe('lightning shield EMR scaling values', () => {
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

  it('keeps full EMR for Amazon tree skill', async () => {
    const skill = new Skill({ id: 'lightning_shield', name: 'Lightning Shield' });
    const values = await skill.getScalingValues(
      10,
      'elemental_magic_damage_reduced_flat',
      0,
      {
        className: 'Amazon',
        blvl: { lightning_shield: 10 },
        lvl: { lightning_shield: 0 },
        level: 99,
      },
      99
    );
    expect(Number(values?.value0)).toBe(33);
  });

  it('zeros EMR for oSkill without relic', async () => {
    const skill = new Skill({ id: 'lightning_shield', name: 'Lightning Shield' });
    const values = await skill.getScalingValues(
      10,
      'elemental_magic_damage_reduced_flat',
      0,
      {
        className: 'Barbarian',
        oSkillIds: ['lightning_shield'],
        blvl: { lightning_shield: 0 },
        lvl: { lightning_shield: 10 },
        level: 99,
      },
      99
    );
    expect(Number(values?.value0)).toBe(0);
  });

  it('applies 1/3 EMR for non-Amazon relic oSkill', async () => {
    const skill = new Skill({ id: 'lightning_shield', name: 'Lightning Shield' });
    const values = await skill.getScalingValues(
      10,
      'elemental_magic_damage_reduced_flat',
      0,
      {
        className: 'Sorceress',
        oSkillIds: ['lightning_shield'],
        relicOSkillIds: ['lightning_shield'],
        blvl: { lightning_shield: 0 },
        lvl: { lightning_shield: 10 },
        level: 99,
      },
      99
    );
    expect(Number(values?.value0)).toBe(11);
  });
});
