import { describe, expect, it } from 'vitest';
import { canEquipForClass, canEquipInSlot, isUniquePickerItem, matchesItemPickerSearch } from '@/items/item-types.js';

describe('canEquipForClass', () => {
  it('allows unrestricted items for any class', () => {
    expect(canEquipForClass({}, 'Barbarian')).toBe(true);
    expect(canEquipForClass({}, null)).toBe(true);
  });

  it('blocks class-restricted items for wrong or missing class', () => {
    const def = { classRestriction: 'Paladin Only' };
    expect(canEquipForClass(def, 'Paladin')).toBe(true);
    expect(canEquipForClass(def, 'Barbarian')).toBe(false);
    expect(canEquipForClass(def, null)).toBe(false);
  });
});

describe('canEquipInSlot', () => {
  it('matches arms catalog slot to either hand', () => {
    const def = { slot: 'arms' };
    expect(canEquipInSlot(def, 'rarm')).toBe(true);
    expect(canEquipInSlot(def, 'larm')).toBe(true);
    expect(canEquipInSlot(def, 'rarm2')).toBe(true);
    expect(canEquipInSlot(def, 'head')).toBe(false);
  });

  it('matches ring catalog slot to either ring slot', () => {
    const def = { slot: 'ring' };
    expect(canEquipInSlot(def, 'rrin')).toBe(true);
    expect(canEquipInSlot(def, 'lrin')).toBe(true);
    expect(canEquipInSlot(def, 'neck')).toBe(false);
  });

  it('enforces class restrictions when className is provided', () => {
    const def = { slot: 'arms', classRestriction: 'Druid Only' };
    expect(canEquipInSlot(def, 'rarm', 'Druid')).toBe(true);
    expect(canEquipInSlot(def, 'rarm', 'Necromancer')).toBe(false);
  });

  it('ignores class restriction when className is omitted', () => {
    const def = { slot: 'arms', classRestriction: 'Assassin Only' };
    expect(canEquipInSlot(def, 'rarm')).toBe(true);
    expect(canEquipInSlot(def, 'rarm', 'Amazon')).toBe(false);
    expect(canEquipInSlot(def, 'rarm', 'Assassin')).toBe(true);
  });
});

describe('isUniquePickerItem', () => {
  it('includes gear uniques and excludes charms', () => {
    expect(
      isUniquePickerItem({
        rarity: 'unique',
        baseId: '100',
        name: 'Grim Fang',
      })
    ).toBe(true);
    expect(
      isUniquePickerItem({
        rarity: 'unique',
        category: 'charms',
        type: 'charm',
        keepInInventory: true,
        name: "The Butcher's Tooth",
      })
    ).toBe(false);
    expect(isUniquePickerItem({ rarity: 'normal' })).toBe(false);
  });
});

describe('matchesItemPickerSearch', () => {
  const grandfather = {
    name: 'The Grandfather',
    id: 'u:the-grandfather:su',
    type: 'qgsd',
    baseName: 'Colossus Blade (Sacred)',
    baseType: 'Colossus Blade (Sacred)',
    group: 'Two-Handed Swords',
  };

  it('matches unique items by base name and type family', () => {
    expect(matchesItemPickerSearch(grandfather, 'colossus blade')).toBe(true);
    expect(matchesItemPickerSearch(grandfather, 'sword')).toBe(true);
    expect(matchesItemPickerSearch(grandfather, 'two-handed')).toBe(true);
    expect(matchesItemPickerSearch(grandfather, 'grandfather')).toBe(true);
    expect(matchesItemPickerSearch(grandfather, 'bow')).toBe(false);
  });

  it('treats an empty query as a match', () => {
    expect(matchesItemPickerSearch(grandfather, '')).toBe(true);
    expect(matchesItemPickerSearch(grandfather, '   ')).toBe(true);
  });

  it('matches assassin katar TU by base type and quality tokens', () => {
    const nutcracker = {
      name: 'The Nutcracker',
      id: 'u:the-nutcracker:tu:4',
      type: 'h2h',
      baseName: 'Katar (4)',
      baseType: 'Katar (4)',
      group: 'Assassin Claws',
      uniqueKind: 'tiered',
      tier: 4,
      classRestriction: 'Assassin Only',
    };
    expect(matchesItemPickerSearch(nutcracker, 'katar')).toBe(true);
    expect(matchesItemPickerSearch(nutcracker, 'katar tu')).toBe(true);
    expect(matchesItemPickerSearch(nutcracker, 'tu')).toBe(true);
    expect(matchesItemPickerSearch(nutcracker, 't4')).toBe(true);
    expect(matchesItemPickerSearch(nutcracker, 'bow')).toBe(false);
  });
});
