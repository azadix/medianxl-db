import { describe, expect, it } from 'vitest';
import {
  isBandDamageStatKey,
  inferElementTypeFromSkill,
  applyHitShift,
  calculateBandDamageValue,
  calculateBandDamageMinMax,
} from '@/skills/domain/damage-calculator.js';

describe('isBandDamageStatKey', () => {
  it('recognizes known damage keys', () => {
    expect(isBandDamageStatKey('fire_damage')).toBe(true);
    expect(isBandDamageStatKey('Cold_Damage')).toBe(true);
    expect(isBandDamageStatKey('mana_cost')).toBe(false);
  });
});

describe('inferElementTypeFromSkill', () => {
  it('uses stat key when no tags', () => {
    expect(inferElementTypeFromSkill(null, 'cold_damage')).toBe('cold');
  });

  it('prefers matching tag when present', () => {
    expect(inferElementTypeFromSkill({ tags: ['Fire', 'Spell'] }, 'fire_damage')).toBe('fire');
  });

  it('falls back to first element tag when mismatch', () => {
    expect(inferElementTypeFromSkill({ tags: ['Lightning'] }, 'fire_damage')).toBe('lightning');
  });
});

describe('applyHitShift', () => {
  it('defaults hitShift 8 (no change)', () => {
    expect(applyHitShift(100, 8)).toBe(100);
    expect(applyHitShift(100)).toBe(100);
  });

  it('shifts by powers of two', () => {
    expect(applyHitShift(100, 9)).toBe(200);
    expect(applyHitShift(100, 7)).toBe(50);
  });
});

describe('calculateBandDamageValue', () => {
  it('adds per-level bands for mid levels', () => {
    // level 10: band1 (2..8)=7*1 + band2 (9..10)=2*2 = 7+4=11 + base 10 = 21
    const value = calculateBandDamageValue({
      baseValue: 10,
      perLevel: [1, 2, 3, 4, 5],
      level: 10,
      hitShift: 8,
    });
    expect(value).toBe(21);
  });

  it('applies synergy multiplier before hit shift', () => {
    const value = calculateBandDamageValue({
      baseValue: 10,
      perLevel: [0, 0, 0, 0, 0],
      level: 1,
      hitShift: 8,
      synergyMultiplier: 2,
    });
    expect(value).toBe(20);
  });
});

describe('calculateBandDamageMinMax', () => {
  it('returns min/max for elemental damage', () => {
    const result = calculateBandDamageMinMax({
      kind: 'elemental',
      statKey: 'fire_damage',
      skill: { tags: ['Fire'] },
      level: 1,
      baseMin: 5,
      baseMax: 10,
      minPerLevel: [0, 0, 0, 0, 0],
      maxPerLevel: [0, 0, 0, 0, 0],
      hitShift: 8,
    });
    expect(result.min).toBe(5);
    expect(result.max).toBe(10);
    expect(result.elementType).toBe('fire');
    expect(result.kind).toBe('elemental');
  });

  it('keeps lightning min at 1 when baseMin is 1 with no min growth', () => {
    const result = calculateBandDamageMinMax({
      kind: 'elemental',
      statKey: 'lightning_damage',
      skill: { tags: ['Lightning'] },
      level: 20,
      baseMin: 1,
      baseMax: 50,
      minPerLevel: [0, 0, 0, 0, 0],
      maxPerLevel: [1, 1, 1, 1, 1],
      hitShift: 8,
    });
    expect(result.min).toBe(1);
  });
});
