/**
 * @file Tests for runeword/relic runtime helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  isRelicItem,
  MAX_RELICS,
  defaultRelicAffixRolls,
  getRelicStatLines,
} from '@/items/relic-items.js';
import {
  isRunewordItem,
  formatRunewordBadge,
  formatRunewordRecipe,
  runewordFitsEquipSlot,
} from '@/items/runeword-items.js';
import { isOverlayItem, formatOverlayBadge } from '@/items/item-overlays.js';
import { canEquipInSlot } from '@/items/item-types.js';

describe('relic helpers', () => {
  const relic = {
    id: 'relic:abyss',
    name: 'Relic (Abyss)',
    category: 'relics',
    rarity: 'relic',
    keepInInventory: true,
    modifiers: ['+(19 to 29) to Abyss', '+5% to Cold Spell Damage'],
  };

  it('detects relics', () => {
    expect(isRelicItem(relic)).toBe(true);
    expect(isRelicItem({ rarity: 'unique' })).toBe(false);
    expect(MAX_RELICS).toBe(3);
  });

  it('builds default rolls and stat lines', () => {
    const rolls = defaultRelicAffixRolls(relic);
    expect(Object.keys(rolls).length).toBeGreaterThan(0);
    const lines = getRelicStatLines(relic, rolls);
    expect(lines.some((l) => /Abyss/.test(l))).toBe(true);
  });
});

describe('runeword helpers', () => {
  const rw = {
    id: 'rw:bone-dart',
    name: 'Bone Dart',
    rarity: 'runeword',
    slot: 'arms',
    baseName: 'Trebuchet (Sacred)',
    runes: ['Hel', 'Sur', 'Hel'],
    runewordLevel: 75,
    allowedGroups: ['Necromancer Crossbows'],
  };

  it('detects runewords and formats recipe', () => {
    expect(isRunewordItem(rw)).toBe(true);
    expect(isOverlayItem(rw)).toBe(true);
    expect(formatRunewordRecipe(rw)).toBe('Hel + Sur + Hel');
    expect(formatRunewordBadge(rw)).toContain('Hel + Sur + Hel');
    expect(formatOverlayBadge('runeword')).toBe('RW');
  });

  it('matches equipment slots via base slot', () => {
    expect(runewordFitsEquipSlot(rw, 'rarm', [], 'Necromancer', canEquipInSlot)).toBe(true);
    expect(runewordFitsEquipSlot(rw, 'head', [], 'Necromancer', canEquipInSlot)).toBe(false);
  });
});
