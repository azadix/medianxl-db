import { describe, expect, it } from 'vitest';
import {
  extrasFromTswItem,
  parseTswMysticOrbs,
  tswInstanceExtras,
} from '@/planner/tsw-item-rolls.js';

describe('tsw item extras', () => {
  const silksDef = {
    id: 'u:silks-of-the-victor:su',
    name: 'Silks of the Victor',
    uniqueKind: 'su',
    rarity: 'unique',
    modifiers: [
      '{orange}Level 10 Nephalem Weapons',
      '{grey}5% Innate Elemental Damage',
      '{grey}Adds Fire and Lightning Damage:',
      '{grey}20-30% of base Strength and Dexterity',
      '{grey}10-15% of base Vitality',
      '+1 to All Skills',
      '+(172 to 200)% Enhanced Defense',
      '+1.125% Enhanced Defense (Based on Character Level)',
      '+(500 to 1000) to Life',
      '-20% Mana Cost of Skills',
    ],
  };

  const silksRow = {
    item: 'Silks of the Victor',
    display_name: 'Silks of the Victor',
    type: 'Ancient Armor (SU) [eth]',
    eth: true,
    mystic_orbs: [
      [5, 'MO - Total Char Defense'],
      [1, 'Weight of Talent'],
    ],
    description_lines: [
      [['Silks of the Victor', 4]],
      [['Ancient Armor (Sacred)', 4]],
      [['Defense: ', -1], ['22917', 3], [' (4897)', -1]],
      [['Required Level: 135', -1]],
      [['Required Strength: 722', 1]],
      [['Ethereal', 5]],
      [['Corrupted', 1]],
      [['Already Upgraded', 2]],
      [['Level 10 Nephalem Weapons', 8]],
      [['5% Innate Elemental Damage', 5]],
      [['Adds Fire and Lightning Damage:', 5]],
      [['20-30% of base Strength and Dexterity', 5]],
      [['10-15% of base Vitality', 5]],
      [['+2 to All Skills', 3]],
      [['+200% Enhanced Defense', 3]],
      [['+168% Enhanced Defense (Based on Character Level)', 3]],
      [['+1003 to Life', 3]],
      [['-20% Mana Cost of Skills', 3]],
      [['+25% Bonus to Defense', 3]],
      [['Requirements -5%', 3]],
      [['+35 Required Level', 3]],
      [['Socketed (6/6)', 3]],
    ],
  };

  it('parses mystic_orbs tuples', () => {
    expect(parseTswMysticOrbs(silksRow.mystic_orbs)).toEqual([
      [5, 'MO - Total Char Defense'],
      [1, 'Weight of Talent'],
    ]);
    expect(parseTswMysticOrbs([])).toEqual([]);
    expect(parseTswMysticOrbs(null)).toEqual([]);
  });

  it('keeps MO / jewel leftovers and skips catalog + boilerplate lines', () => {
    const extras = extrasFromTswItem(silksRow, silksDef);
    expect(extras).toEqual(
      expect.arrayContaining([
        '+25% Bonus to Defense',
        'Requirements -5%',
        '+35 Required Level',
      ])
    );
    expect(extras).not.toEqual(expect.arrayContaining(['+200% Enhanced Defense']));
    expect(extras).not.toEqual(expect.arrayContaining(['Level 10 Nephalem Weapons']));
    expect(extras).not.toEqual(expect.arrayContaining(['Ethereal']));
    expect(extras).not.toEqual(expect.arrayContaining(['Corrupted']));
    // Signature-claimed so catalog +1 is not doubled as a full +2 extra line.
    expect(extras).not.toEqual(expect.arrayContaining(['+2 to All Skills']));
  });

  it('bundles extras, mystic orbs, and ethereal for snapshots', () => {
    expect(tswInstanceExtras(silksRow, silksDef)).toMatchObject({
      ethereal: true,
      mysticOrbs: [
        [5, 'MO - Total Char Defense'],
        [1, 'Weight of Talent'],
      ],
      extras: expect.arrayContaining(['+35 Required Level']),
    });
  });
});
