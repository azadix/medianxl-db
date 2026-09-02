import { describe, expect, it } from 'vitest';
import { canEquipForClass, canEquipInSlot, isUniquePickerItem } from '@/items/item-types.js';

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
