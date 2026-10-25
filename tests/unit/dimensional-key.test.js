import { describe, expect, it } from 'vitest';
import {
  DIM_KEY_ROLL_KEYS,
  collectDimensionalKeyAffixSources,
  dimensionalKeyPurityPoints,
  dimensionalKeyTswDisplayName,
  maxDimensionalKeyRolls,
  normalizeDimensionalKeySnapshot,
  parseDimensionalKeyRollsFromLines,
  scaleDimensionalKeyPurity,
} from '@/items/dimensional-key.js';
import { getCharmStatLines } from '@/items/charm-items.js';

const dimKey = {
  id: 'ebw',
  name: 'Dimensional Key',
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
};

describe('dimensional-key', () => {
  it('scales Trial of Purity from Star Chart and Dream Fragment weights', () => {
    expect(dimensionalKeyPurityPoints([1, 2, 4], [2, 3, 4])).toBe(48);
    expect(scaleDimensionalKeyPurity(48, 16)).toBe(10);
    expect(scaleDimensionalKeyPurity(75, 35)).toBe(35);
    expect(scaleDimensionalKeyPurity(0, 35)).toBe(0);
  });

  it('reads TSW fragment lines, labs from magic find, and invasion bonuses', () => {
    const rolls = parseDimensionalKeyRollsFromLines(dimKey, [
      'Primordia',
      'Dream Fragment (2)',
      'Dream Fragment (3)',
      'Dream Fragment (4)',
      'Star Chart (1)',
      'Star Chart (2)',
      'Star Chart (4)',
      '+10% Innate Elemental Damage',
      '+52% Magic Find',
      'Adds 100-200 Fire Damage',
      '+1 to Light Radius',
    ]);
    expect(rolls[DIM_KEY_ROLL_KEYS.variant]).toBe(3);
    expect(rolls[`${DIM_KEY_ROLL_KEYS.starPrefix}1`]).toBe(1);
    expect(rolls[`${DIM_KEY_ROLL_KEYS.starPrefix}3`]).toBe(0);
    expect(rolls[`${DIM_KEY_ROLL_KEYS.dreamPrefix}1`]).toBe(0);
    expect(rolls[`${DIM_KEY_ROLL_KEYS.dreamPrefix}2`]).toBe(1);
    expect(rolls[DIM_KEY_ROLL_KEYS.labs]).toBe(8);
    expect(rolls[DIM_KEY_ROLL_KEYS.invasion]).toBe(1);
    expect(rolls[DIM_KEY_ROLL_KEYS.nephalem]).toBe(0);
    const lines = getCharmStatLines(dimKey, 150, { rolls, inInventory: true });
    expect(lines).toContain('+10% Innate Elemental Damage');
    expect(lines).toContain('+52% Magic Find');
    expect(lines).toContain('Adds 100-200 Fire Damage');
    expect(lines).toContain('+1 to Light Radius');
  });

  it('fills a completed Nephalem key without fragment lines', () => {
    const rolls = parseDimensionalKeyRollsFromLines(dimKey, [
      'Nephalem Arcana',
      '+35% to Spell Damage',
      '+75% Magic Find',
      '+5% Bonus to Spell Focus',
      '+1 to Void Armor',
      'Occult Smithing Unlocked',
    ]);
    expect(rolls).toMatchObject({
      ...maxDimensionalKeyRolls(),
      [DIM_KEY_ROLL_KEYS.variant]: 0,
    });
    const sources = collectDimensionalKeyAffixSources(dimKey, rolls).map((s) => s.text);
    expect(sources).toContain('+35% to Spell Damage');
    expect(sources).toContain('+75% Magic Find');
    expect(sources).toContain('+5% Bonus to Spell Focus');
    expect(sources).toContain('+1 to Void Armor');
    expect(sources).not.toContain('+1 to Light Radius');
  });

  it('remaps legacy split-catalog ids onto the single Dimensional Key', () => {
    expect(normalizeDimensionalKeySnapshot('ebw-primordia', { charmDimKeyLabs: 4 })).toEqual({
      defId: 'ebw',
      rolls: { charmDimKeyLabs: 4, [DIM_KEY_ROLL_KEYS.variant]: 3 },
    });
    expect(dimensionalKeyTswDisplayName({ [DIM_KEY_ROLL_KEYS.variant]: 1 })).toBe('Mandate');
    expect(
      dimensionalKeyTswDisplayName({
        [DIM_KEY_ROLL_KEYS.variant]: 2,
        [DIM_KEY_ROLL_KEYS.nephalem]: 1,
      })
    ).toBe('Nephalem Onslaught');
  });
});
