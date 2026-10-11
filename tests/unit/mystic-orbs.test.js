import { describe, expect, it } from 'vitest';
import {
  formatMysticOrbLine,
  formatMysticOrbLines,
  normalizeMysticOrbs,
} from '@/items/mystic-orbs.js';

describe('mystic-orbs', () => {
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
    expect(formatMysticOrbLine(1, 'Weight of Talent')).toBe('Weight of Talent');
    expect(
      formatMysticOrbLines([
        [5, 'MO - Total Char Defense'],
        [1, 'Weight of Talent'],
      ])
    ).toEqual(['5x MO - Total Char Defense', 'Weight of Talent']);
  });
});
