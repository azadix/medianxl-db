import { describe, expect, it } from 'vitest';
import {
  validateVariantsArray,
  validateScalingConstantsArray,
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
});
