import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatMysticOrbLine,
  formatMysticOrbLines,
  formatMysticOrbRows,
  getMysticOrbBonusLines,
  loadMysticOrbsCatalog,
  normalizeMysticOrbs,
  scaleMysticOrbModifierLine,
} from '@/items/mystic-orbs.js';

const mysticOrbsCatalog = JSON.parse(
  readFileSync(resolve('public/items/2_14/mystic-orbs.json'), 'utf8')
);

describe('mystic-orbs', () => {
  loadMysticOrbsCatalog(mysticOrbsCatalog);

  it('normalizes count/name tuples', () => {
    expect(
      normalizeMysticOrbs([
        [5, 'MO - Damage Reduced'],
        [1, "Farnham's Lost Marble"],
        ['bad'],
        [0, 'Nope'],
      ])
    ).toEqual([
      [5, 'MO - Damage Reduced'],
      [1, "Farnham's Lost Marble"],
    ]);
  });

  it('formats display lines', () => {
    expect(formatMysticOrbLine(5, 'MO - Damage Reduced')).toBe('5x MO - Damage Reduced');
    expect(formatMysticOrbLine(1, 'Weight of Talent')).toBe('1x Weight of Talent');
    expect(
      formatMysticOrbLines([
        [5, 'MO - Total Char Defense'],
        [1, 'Weight of Talent'],
      ])
    ).toEqual(['5x MO - Total Char Defense', '1x Weight of Talent']);
  });

  it('lists catalog bonuses scaled by apply count', () => {
    expect(getMysticOrbBonusLines('MO - Total Char Defense', 5)).toEqual([
      '+25% Total Character Defense',
    ]);
    expect(getMysticOrbBonusLines('MO - Damage Reduced', 5)).toEqual([
      'Physical Damage Taken Reduced by 25',
    ]);
    expect(getMysticOrbBonusLines("Farnham's Lost Marble", 2)).toEqual([
      '2% Movement Speed',
      '+60 Life on Melee Attack',
      '+60 Mana on Melee Attack',
    ]);
    expect(getMysticOrbBonusLines('Lodestone', 1)).toEqual([
      '+6 Spell Focus',
      '+6% to Spell Damage',
      'Requirements +10%',
    ]);
  });

  it('does not scale skill levels in proc lines', () => {
    expect(
      scaleMysticOrbModifierLine('2% Chance to cast level 40 Ice Bolt Nova on Melee Attack', 2)
    ).toBe('4% Chance to cast level 40 Ice Bolt Nova on Melee Attack');
  });

  it('attaches bonus rows for tooltip rendering', () => {
    const rows = formatMysticOrbRows([
      [5, 'MO - Total Char Defense'],
      [1, 'Weight of Talent'],
    ]);
    expect(rows[0].label).toBe('5x MO - Total Char Defense');
    expect(rows[0].mods).toContain('+25% Total Character Defense');
    expect(rows[1].kind).toBe('unique');
    expect(rows[1].mods).toEqual([
      '+1 to All Skills',
      '+5% to Experience Gained',
      'Requirements +15%',
    ]);
  });
});
