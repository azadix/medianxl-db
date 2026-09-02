import { describe, expect, it } from 'vitest';
import {
  validateVariantsArray,
  validateScalingConstantsArray,
  validateSkillCatalogRow,
  validateSubskillCatalogRow,
  looksLikeFormula,
  statsKeysLowerFromRows,
  variantKeysFromVariants,
} from '@/shared/skill-json-validation.js';

describe('looksLikeFormula', () => {
  it('detects formula-like strings', () => {
    expect(looksLikeFormula('5*blvl')).toBe(true);
    expect(looksLikeFormula('floor(lvl/3)')).toBe(true);
    expect(looksLikeFormula('80')).toBe(false);
    expect(looksLikeFormula('Blade Spirits')).toBe(false);
  });
});

describe('validateVariantsArray', () => {
  it('accepts an empty array', () => {
    expect(validateVariantsArray([])).toEqual([]);
  });

  it('rejects non-arrays and non-objects', () => {
    expect(validateVariantsArray({})).toContain('variants must be a JSON array');
    expect(validateVariantsArray([null])[0]).toMatch(/must be an object/);
  });

  it('requires non-empty variant_key and rejects duplicates', () => {
    expect(
      validateVariantsArray([{ variant_key: '', label: 'A' }])[0]
    ).toMatch(/variant_key/);
    expect(
      validateVariantsArray([
        { variant_key: 'a', label: 'A' },
        { variant_key: 'a', label: 'B' },
      ])[0]
    ).toMatch(/duplicate/);
  });

  it('accepts a valid row', () => {
    expect(
      validateVariantsArray([
        {
          variant_key: 'necromancer',
          label: 'Necromancer',
          sort_order: 0,
          description_override: null,
          skill_effect_override: ['line'],
          restriction_override: null,
        },
      ])
    ).toEqual([]);
  });

  it('rejects bad override types', () => {
    expect(
      validateVariantsArray([
        { variant_key: 'x', description_override: 'not-array' },
      ])[0]
    ).toMatch(/description_override/);
  });
});

describe('validateScalingConstantsArray', () => {
  const stats = statsKeysLowerFromRows([
    { key: 'mana_cost' },
    { key: 'fire_damage' },
  ]);
  const variantKeys = variantKeysFromVariants([{ variant_key: 'non_sorceress' }]);

  it('accepts an empty array', () => {
    expect(validateScalingConstantsArray([], { statsByKeyLower: stats })).toEqual([]);
  });

  it('rejects empty or unknown statKey', () => {
    expect(
      validateScalingConstantsArray([{ statKey: '', value0: '1' }], {
        statsByKeyLower: stats,
        variantKeys,
      })[0]
    ).toMatch(/empty statKey/);
    expect(
      validateScalingConstantsArray([{ statKey: 'nope', value0: '1' }], {
        statsByKeyLower: stats,
        variantKeys,
      })[0]
    ).toMatch(/unknown statKey/);
  });

  it('rejects unknown variantKey and empty content', () => {
    expect(
      validateScalingConstantsArray(
        [{ statKey: 'mana_cost', variantKey: 'missing', value0: '1' }],
        { statsByKeyLower: stats, variantKeys }
      )[0]
    ).toMatch(/unknown variantKey/);
    expect(
      validateScalingConstantsArray([{ statKey: 'mana_cost' }], {
        statsByKeyLower: stats,
        variantKeys,
      })[0]
    ).toMatch(/empty scaling row/);
  });

  it('rejects invalid occurrenceIndex and unbalanced formulas', () => {
    expect(
      validateScalingConstantsArray(
        [{ statKey: 'mana_cost', occurrenceIndex: -1, value0: '1' }],
        { statsByKeyLower: stats, variantKeys }
      )[0]
    ).toMatch(/occurrenceIndex/);
    expect(
      validateScalingConstantsArray(
        [{ statKey: 'mana_cost', value0: 'floor(blvl' }],
        { statsByKeyLower: stats, variantKeys }
      )[0]
    ).toMatch(/unbalanced/);
  });

  it('rejects unknown formula functions and bad tree() tabs', () => {
    expect(
      validateScalingConstantsArray(
        [{ statKey: 'mana_cost', value0: 'nope(1)' }],
        { statsByKeyLower: stats, variantKeys }
      )[0]
    ).toMatch(/unknown function/);
    expect(
      validateScalingConstantsArray(
        [{ statKey: 'mana_cost', value0: 'tree(999)' }],
        { statsByKeyLower: stats, variantKeys, tabIds: new Set([24]) }
      )[0]
    ).toMatch(/unknown tab id/);
  });

  it('accepts a valid row', () => {
    expect(
      validateScalingConstantsArray(
        [
          {
            statKey: 'mana_cost',
            occurrenceIndex: 0,
            variantKey: '',
            value0: '80',
            value1: '5*blvl',
          },
        ],
        { statsByKeyLower: stats, variantKeys, tabIds: new Set([24]) }
      )
    ).toEqual([]);
  });

  it('accepts cond() planner condition formulas', () => {
    expect(
      validateScalingConstantsArray(
        [
          {
            statKey: 'area_of_effect',
            occurrenceIndex: 0,
            variantKey: '',
            value0: 'range(18+10*[[executioner]]*cond(while_wielding_twohanded_weapon))',
          },
        ],
        { statsByKeyLower: new Map([['area_of_effect', { key: 'area_of_effect' }]]), variantKeys }
      )
    ).toEqual([]);
  });
});

describe('validateSkillCatalogRow', () => {
  const validSkill = {
    id: 'absolution',    displayName: 'Absolution',
    classId: 5,
    tab: 32,
    class: 'Paladin',
    tabName: 'Nephalem',
    tags: ['Spell'],
    baseMaxLevel: 1,
    affectedBySpecialization: false,
    variants: [],
    scalingConstants: [],
    description: ['line'],
    restriction: [],
    skillEffect: ['{{mana_cost}}'],
    image: 'icons-pal_132',
  };

  it('accepts a valid skill row', () => {
    expect(validateSkillCatalogRow(validSkill)).toEqual([]);
  });

  it('rejects non-objects and bad field types', () => {
    expect(validateSkillCatalogRow(null)).toContain('skill row must be an object');
    expect(validateSkillCatalogRow({ ...validSkill, classId: '5' })[0]).toMatch(/classId/);
    expect(validateSkillCatalogRow({ ...validSkill, tags: 'Spell' })[0]).toMatch(/tags/);
    expect(validateSkillCatalogRow({ ...validSkill, affectedBySpecialization: 1 })[0]).toMatch(
      /affectedBySpecialization/
    );
  });

  it('allows optional showCondition when it is a string array', () => {
    expect(
      validateSkillCatalogRow({
        ...validSkill,
        showCondition: ['while_in_werewolf_form'],
      })
    ).toEqual([]);
    expect(
      validateSkillCatalogRow({
        ...validSkill,
        showCondition: 'while_in_werewolf_form',
      })[0]
    ).toMatch(/showCondition/);
  });
});

describe('validateSubskillCatalogRow', () => {
  const validSubskill = {
    id: 'spellbind_petrify',    displayName: 'Petrify',
    parentSkillId: 'spellbind',
    scalingConstants: [],
    description: [],
    skillEffect: [],
    restriction: [],
  };

  it('accepts a valid subskill row', () => {
    expect(validateSubskillCatalogRow(validSubskill)).toEqual([]);
  });

  it('requires parentSkillId and allows omitted restriction', () => {
    expect(
      validateSubskillCatalogRow({ ...validSubskill, parentSkillId: '' })[0]
    ).toMatch(/parentSkillId/);
    const { restriction: _omit, ...withoutRestriction } = validSubskill;
    expect(validateSubskillCatalogRow(withoutRestriction)).toEqual([]);
  });

  it('validates optional activation fields', () => {
    expect(
      validateSubskillCatalogRow({
        ...validSubskill,
        activeWhenTabPoints: 21,
        activeWhenSkillPoints: 'fireheart_totem',
      })
    ).toEqual([]);
    expect(
      validateSubskillCatalogRow({
        ...validSubskill,
        activeWhenTabPoints: '21',
      })[0]
    ).toMatch(/activeWhenTabPoints/);
  });
});
