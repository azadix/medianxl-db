/**
 * @file Tests for unique/set overlay helpers and roll defaults.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveItemDef,
  isOverlayItem,
  formatOverlayBadge,
  defaultOverlayAffixRolls,
  getOverlayDetailStatRows,
  getOverlayStatLines,
  countEquippedSetPieces,
  resolveSetBonuses,
  overlayAffixRollKey,
} from '@/items/item-overlays.js';
import { defaultRollsForDef, mergeRollsForDef, getItemDetailStatRows } from '@/items/item-stats.js';
import { parseAffixRanges } from '@/items/affix-rolls.js';

const baseSword = {
  id: '100',
  name: 'Short Sword (1)',
  type: 'swor',
  category: 'weapons',
  slot: 'arms',
  invWidth: 1,
  invHeight: 3,
  rarity: 'normal',
  icon: 'invssd',
  sockets: 1,
  defense: { min: 10, max: 20 },
};

const grimFang = {
  id: 'u:grim-fang:t1',
  name: 'Grim Fang',
  rarity: 'unique',
  baseId: '100',
  baseName: 'Short Sword (1)',
  uniqueKind: 'tiered',
  tier: 1,
  sockets: 1,
  modifiers: [
    '(3 to 5)% Life stolen per Hit',
    '+(18 to 29)% Enhanced Damage',
    '+10 to Strength',
  ],
  damage1hDisplay: '(4 - 5) to 7',
  reqLevel: 20,
};

describe('resolveItemDef', () => {
  it('merges overlay onto base', () => {
    const resolved = resolveItemDef(baseSword, grimFang);
    expect(resolved.name).toBe('Grim Fang');
    expect(resolved.rarity).toBe('unique');
    expect(resolved.type).toBe('swor');
    expect(resolved.slot).toBe('arms');
    expect(resolved.baseId).toBe('100');
    expect(resolved.modifiers).toHaveLength(3);
  });

  it('does not treat charms as overlays', () => {
    expect(
      isOverlayItem({
        name: 'Astrogha',
        rarity: 'unique',
        category: 'charms',
        type: 'charm',
        keepInInventory: true,
      })
    ).toBe(false);
  });

  it('formats badges', () => {
    expect(formatOverlayBadge('tiered', 2)).toBe('T2');
    expect(formatOverlayBadge('tiered')).toBe('TU');
    expect(formatOverlayBadge('su')).toBe('SU');
    expect(formatOverlayBadge('sssu')).toBe('SSSU');
  });
});

describe('overlay affix rolls', () => {
  it('defaults rolls for ranged modifiers', () => {
    const rolls = defaultOverlayAffixRolls(grimFang);
    expect(rolls[overlayAffixRollKey('base:m0', 0)]).toBe(4);
    expect(rolls[overlayAffixRollKey('base:m1', 0)]).toBe(24);
  });

  it('locks sockets at max and skips defense slider', () => {
    const rolls = defaultRollsForDef(grimFang);
    expect(rolls.sockets).toBe(1);
    expect(rolls.defense).toBeUndefined();
    const rows = getItemDetailStatRows(grimFang, rolls);
    expect(rows.some((r) => r.kind === 'roll' && r.stat.key === 'defense')).toBe(false);
    expect(rows.some((r) => r.kind === 'roll' && r.stat.key.startsWith('modAffix:'))).toBe(true);
  });

  it('applies rolled values in overlay stat lines', () => {
    const rolls = {
      [overlayAffixRollKey('base:m0', 0)]: 5,
    };
    const lines = getOverlayStatLines(grimFang, rolls);
    expect(lines[0]).toContain('5% Life stolen');
  });

  it('mergeRollsForDef preserves saved rolls', () => {
    const saved = { [overlayAffixRollKey('base:m0', 0)]: 3 };
    const merged = mergeRollsForDef(grimFang, saved);
    expect(merged[overlayAffixRollKey('base:m0', 0)]).toBe(3);
  });
});

describe('set bonuses', () => {
  const setDef = {
    id: 'set:pantheon',
    name: 'Pantheon',
    bonuses: [
      { required: 2, modifiers: ['50% Attack Speed'] },
      { required: 3, modifiers: ['+150 to Life'] },
      { required: 'complete', modifiers: ['+200 to Dexterity'] },
    ],
  };

  it('counts equipped pieces', () => {
    const counts = countEquippedSetPieces([
      { setId: 'set:pantheon' },
      { setId: 'set:pantheon' },
      { setId: 'set:other' },
      null,
    ]);
    expect(counts['set:pantheon']).toBe(2);
    expect(counts['set:other']).toBe(1);
  });

  it('marks active bonus tiers', () => {
    const bonuses = resolveSetBonuses(setDef, 2, 4);
    expect(bonuses[0].active).toBe(true);
    expect(bonuses[1].active).toBe(false);
    expect(bonuses[2].active).toBe(false);
    const complete = resolveSetBonuses(setDef, 4, 4);
    expect(complete[2].active).toBe(true);
  });
});

describe('affix range parsing on overlay text', () => {
  it('finds ranges in docs-style modifiers', () => {
    expect(parseAffixRanges('+(18 to 29)% Enhanced Damage')).toHaveLength(1);
    expect(parseAffixRanges('(3 to 5)% Life stolen per Hit')[0]).toMatchObject({
      min: 3,
      max: 5,
    });
  });
});
