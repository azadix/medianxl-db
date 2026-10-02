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
  listEligibleRunewordBases,
  mergeRunewordWithBase,
  getRunewordSocketFillers,
  formatRunewordSocketFillerLines,
  runewordEntryToItemDef,
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

  it('filters grey bases by wiki types, sockets, and exclusions', () => {
    const shark = runewordEntryToItemDef({
      id: 'rw:shark',
      name: 'Shark',
      runeCode: 'Eld',
      runes: ['Eld'],
      reqLevel: 8,
      allowedTypes: ['Weapons'],
      excludedTypes: ['Necromancer Daggers', 'Assassin Claws'],
      excludedNames: [],
      modifiers: ['5% Chance to cast level 9 Bloodlust on Kill'],
    });
    const catalog = [
      {
        id: 'swd-s',
        name: 'Long Sword (Sacred)',
        rarity: 'normal',
        category: 'weapons',
        group: 'One-Handed Swords',
        slot: 'arms',
        sockets: 6,
        reqLevel: 100,
        icon: 'invlsd',
        type: 'swd',
      },
      {
        id: 'swd-1',
        name: 'Long Sword (1)',
        rarity: 'normal',
        category: 'weapons',
        group: 'One-Handed Swords',
        slot: 'arms',
        sockets: 2,
        reqLevel: 1,
        icon: 'invlsd',
        type: 'swd',
      },
      {
        id: 'dgr',
        name: 'Bone Knife (Sacred)',
        rarity: 'normal',
        category: 'weapons',
        group: 'Necromancer Daggers',
        slot: 'arms',
        sockets: 3,
      },
      {
        id: 'helm',
        name: 'Cap (Sacred)',
        rarity: 'normal',
        category: 'armor',
        group: 'Helms',
        slot: 'head',
        sockets: 4,
      },
      {
        id: 'lowsock',
        name: 'Dagger (1)',
        rarity: 'normal',
        category: 'weapons',
        group: 'Daggers',
        slot: 'arms',
        sockets: 0,
      },
    ];
    const bases = listEligibleRunewordBases(shark, catalog);
    expect(bases.map((b) => b.id)).toEqual(['swd-s', 'swd-1']);
    expect(runewordFitsEquipSlot(shark, 'rarm', catalog, null, canEquipInSlot)).toBe(true);
    expect(runewordFitsEquipSlot(shark, 'head', catalog, null, canEquipInSlot)).toBe(false);

    const lunar = runewordEntryToItemDef({
      id: 'rw:lunar-fury',
      name: 'Lunar Fury',
      runeCode: 'ZodSilZol',
      runes: ['Zod', 'Sil', 'Zol'],
      reqLevel: 100,
      allowedTypes: ['One-Handed Swords'],
      excludedTypes: [],
      excludedNames: ['Tyrannical Blades'],
      classRestriction: 'Druid Only',
      modifiers: ['+(3 to 4) to Druid Skill Levels'],
    });
    const lunarCatalog = [
      {
        id: 'ok',
        name: 'Long Sword (Sacred)',
        rarity: 'normal',
        group: 'One-Handed Swords',
        category: 'weapons',
        slot: 'arms',
        sockets: 4,
      },
      {
        id: 'tyr',
        name: 'Tyrannical Blades (Sacred)',
        rarity: 'normal',
        group: 'One-Handed Swords',
        category: 'weapons',
        slot: 'arms',
        sockets: 6,
      },
      {
        id: 'few',
        name: 'Short Sword (4)',
        rarity: 'normal',
        group: 'One-Handed Swords',
        category: 'weapons',
        slot: 'arms',
        sockets: 2,
      },
    ];
    expect(listEligibleRunewordBases(lunar, lunarCatalog).map((b) => b.id)).toEqual(['ok']);
  });

  it('maps Helms/Shields/Gloves/Boots wiki aliases', () => {
    const catalog = [
      {
        id: 'helm',
        name: 'Cap (Sacred)',
        rarity: 'normal',
        group: 'Helms',
        category: 'armor',
        slot: 'head',
        sockets: 4,
      },
      {
        id: 'circ',
        name: 'Circlet (Sacred)',
        rarity: 'normal',
        group: 'Circlets',
        category: 'armor',
        slot: 'head',
        sockets: 3,
      },
      {
        id: 'pally',
        name: 'Aerin Shield (Sacred)',
        rarity: 'normal',
        group: 'Paladin Shields',
        category: 'armor',
        slot: 'arms',
        sockets: 4,
      },
      {
        id: 'glov',
        name: 'Leather Gloves (Sacred)',
        rarity: 'normal',
        group: 'Gloves',
        category: 'armor',
        slot: 'glov',
        sockets: 3,
      },
      {
        id: 'boot',
        name: 'Boots (Sacred)',
        rarity: 'normal',
        group: 'Gloves',
        category: 'armor',
        slot: 'feet',
        sockets: 3,
      },
    ];
    const helmRw = runewordEntryToItemDef({
      id: 'rw:honor',
      name: 'Honor',
      runeCode: 'Tal',
      runes: ['Tal'],
      reqLevel: 20,
      allowedTypes: ['Helms'],
      excludedTypes: [],
      excludedNames: [],
      modifiers: ['+7% to Spell Damage'],
    });
    expect(listEligibleRunewordBases(helmRw, catalog).map((b) => b.id)).toEqual(['helm']);

    const shieldRw = runewordEntryToItemDef({
      id: 'rw:stone',
      name: 'Stone',
      runeCode: 'Thul',
      runes: ['Thul'],
      reqLevel: 28,
      allowedTypes: ['Shields'],
      excludedTypes: [],
      excludedNames: [],
      modifiers: ['+1 to All Skills'],
    });
    expect(listEligibleRunewordBases(shieldRw, catalog).map((b) => b.id)).toEqual(['pally']);

    const gloveRw = runewordEntryToItemDef({
      id: 'rw:enlightenment',
      name: 'Enlightenment',
      runeCode: 'El',
      runes: ['El'],
      reqLevel: 6,
      allowedTypes: ['Gloves'],
      excludedTypes: [],
      excludedNames: [],
      modifiers: ['10% Combat Speeds'],
    });
    expect(listEligibleRunewordBases(gloveRw, catalog).map((b) => b.id)).toEqual(['glov']);

    const bootRw = runewordEntryToItemDef({
      id: 'rw:epicenter',
      name: 'Epicenter',
      runeCode: 'Ith',
      runes: ['Ith'],
      reqLevel: 18,
      allowedTypes: ['Boots'],
      excludedTypes: [],
      excludedNames: [],
      modifiers: ['+(40 to 60) to Life'],
    });
    expect(listEligibleRunewordBases(bootRw, catalog).map((b) => b.id)).toEqual(['boot']);
  });

  it('merges a chosen base and fills extra sockets with empty jewels', () => {
    const template = runewordEntryToItemDef({
      id: 'rw:shark',
      name: 'Shark',
      runeCode: 'Eld',
      runes: ['Eld'],
      reqLevel: 8,
      allowedTypes: ['Weapons'],
      excludedTypes: [],
      excludedNames: [],
      modifiers: ['20% Attack Speed'],
    });
    const base = {
      id: 'swd-s',
      name: 'Long Sword (Sacred)',
      rarity: 'normal',
      category: 'weapons',
      group: 'One-Handed Swords',
      slot: 'arms',
      sockets: 4,
      reqLevel: 100,
      reqStr: 150,
      icon: 'invlsd',
      type: 'swd',
      invWidth: 1,
      invHeight: 3,
    };
    const merged = mergeRunewordWithBase(template, base);
    expect(merged.id).toBe('rw:shark:swd-s');
    expect(merged.baseId).toBe('swd-s');
    expect(merged.baseName).toBe('Long Sword (Sacred)');
    expect(merged.slot).toBe('arms');
    expect(merged.sockets).toBe(4);
    expect(merged.reqLevel).toBe(100);
    expect(merged.uniqueKind).toBe('runeword');
    expect(getRunewordSocketFillers(merged)).toEqual(['jew', 'jew', 'jew', 'Eld']);
    expect(formatRunewordSocketFillerLines(merged)).toEqual([
      'Sockets: Jewel, Jewel, Jewel, Eld Rune',
    ]);
  });
});
