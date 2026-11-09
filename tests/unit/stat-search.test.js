import { describe, expect, it } from 'vitest';
import { filterStatDefsByQuery, matchesStatQuery } from '@/character/stat-search.js';

const minimumDamage = { key: 'minimum_damage', label: '+# to Minimum Damage' };
const damageToDemons = { key: 'damage_to_demons', label: '+#% Damage to Demons' };
const fasterCast = { key: 'faster_cast_rate', label: 'Faster Cast Rate' };
const coldResist = { key: 'cold_resistance', label: 'Cold Resist %' };

describe('stat search', () => {
  it('matches whitespace-separated partial words', () => {
    expect(matchesStatQuery(minimumDamage, 'min dam')).toBe(true);
    expect(matchesStatQuery(minimumDamage, 'MIN DAM')).toBe(true);
    expect(matchesStatQuery(minimumDamage, 'min')).toBe(true);
    expect(matchesStatQuery(damageToDemons, 'dam')).toBe(true);
  });

  it('matches label acronyms', () => {
    expect(matchesStatQuery(fasterCast, 'fcr')).toBe(true);
  });

  it('matches resistance abbreviations', () => {
    expect(matchesStatQuery(coldResist, 'cold res')).toBe(true);
  });

  it('rejects unmatched queries and accepts empty ones', () => {
    expect(matchesStatQuery(minimumDamage, 'zzz')).toBe(false);
    expect(matchesStatQuery(minimumDamage, '')).toBe(true);
    expect(matchesStatQuery(minimumDamage, '   ')).toBe(true);
  });

  it('filters a definition list', () => {
    const defs = [minimumDamage, damageToDemons, fasterCast, coldResist];
    expect(filterStatDefsByQuery(defs, 'min dam')).toEqual([minimumDamage]);
    expect(filterStatDefsByQuery(defs, 'dam')).toEqual([minimumDamage, damageToDemons]);
    expect(filterStatDefsByQuery(defs, '')).toBe(defs);
  });
});
