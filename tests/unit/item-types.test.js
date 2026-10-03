import { describe, expect, it } from 'vitest';
import {
  canEquipForClass,
  canEquipInSlot,
  equipBlockedReason,
  isStrictTwoHandedWeapon,
  isTwoHandedWeapon,
  isUniquePickerItem,
  matchesItemPickerSearch,
} from '@/items/item-types.js';

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

describe('equipBlockedReason', () => {
  it('explains class, slot, and two-hand blocks', () => {
    const paladinShield = { slot: 'arms', classRestriction: 'Paladin Only', group: 'Paladin Shields' };
    expect(equipBlockedReason(paladinShield, 'larm', 'Barbarian')).toBe('Paladin Only');
    expect(equipBlockedReason(paladinShield, 'larm', 'Paladin')).toBe(null);
    expect(equipBlockedReason({ slot: 'head' }, 'belt', 'Amazon')).toBe('Does not fit the Belt slot.');

    const staff = { slot: 'arms', category: 'weapons', group: 'Staves', type: 'staf', damage2h: { min: 5, max: 12 } };
    const sword = { slot: 'arms', category: 'weapons', group: 'One-Handed Swords', damage1h: { min: 4, max: 8 } };
    expect(equipBlockedReason(sword, 'larm', 'Amazon', { otherHandDef: staff })).toBe(
      'Only Barbarian can dual-wield with a two-handed weapon.'
    );
    expect(equipBlockedReason(sword, 'larm', 'Barbarian', { otherHandDef: staff })).toBe(null);
  });
});

describe('two-handed pairing', () => {
  const staff = {
    slot: 'arms',
    category: 'weapons',
    group: 'Staves',
    type: 'staf',
    damage2h: { min: 5, max: 12 },
  };
  const sword = {
    slot: 'arms',
    category: 'weapons',
    group: 'One-Handed Swords',
    type: 'swor',
    damage1h: { min: 4, max: 8 },
  };
  const twoHSword = {
    slot: 'arms',
    category: 'weapons',
    group: 'Two-Handed Swords',
    type: '2hsd',
    damage1h: { min: 8, max: 16 },
    damage2h: { min: 20, max: 40 },
  };
  const shield = {
    slot: 'arms',
    category: 'armor',
    group: 'Shields',
    type: 'shie',
    block: '20%',
  };
  const bow = {
    slot: 'arms',
    category: 'weapons',
    group: 'Bows',
    type: 'bow',
    damage2h: { min: 10, max: 20 },
  };
  const hammer2h = {
    slot: 'arms',
    category: 'weapons',
    group: 'Hammers',
    type: 'hamm',
    damage2h: { min: 12, max: 24 },
  };

  it('treats staves as strict two-handers even without damage fields', () => {
    expect(isStrictTwoHandedWeapon(staff)).toBe(true);
    expect(isStrictTwoHandedWeapon({ slot: 'arms', group: 'Druid Staves', type: 'dstf' })).toBe(true);
    expect(isTwoHandedWeapon(staff)).toBe(true);
    expect(isStrictTwoHandedWeapon(twoHSword)).toBe(false);
    expect(isTwoHandedWeapon(twoHSword)).toBe(true);
  });

  it('blocks a two-hander with another weapon except for Barbarian', () => {
    expect(canEquipInSlot(sword, 'larm', 'Amazon', { otherHandDef: staff })).toBe(false);
    expect(canEquipInSlot(staff, 'rarm', 'Sorceress', { otherHandDef: sword })).toBe(false);
    expect(canEquipInSlot(sword, 'larm', 'Amazon', { otherHandDef: twoHSword })).toBe(false);
    expect(canEquipInSlot(sword, 'larm', 'Barbarian', { otherHandDef: staff })).toBe(true);
    expect(canEquipInSlot(twoHSword, 'rarm', 'Barbarian', { otherHandDef: sword })).toBe(true);
  });

  it('allows a two-handed sword with a shield, but not a staff or bow', () => {
    expect(canEquipInSlot(shield, 'larm', 'Paladin', { otherHandDef: twoHSword })).toBe(true);
    expect(canEquipInSlot(shield, 'larm', 'Sorceress', { otherHandDef: staff })).toBe(false);
    expect(canEquipInSlot(shield, 'larm', 'Amazon', { otherHandDef: bow })).toBe(false);
    expect(canEquipInSlot(shield, 'larm', 'Barbarian', { otherHandDef: staff })).toBe(true);
  });

  it('treats 2h hammers as two-handed from damage, not the mixed group', () => {
    expect(isStrictTwoHandedWeapon(hammer2h)).toBe(true);
    expect(canEquipInSlot(sword, 'larm', 'Paladin', { otherHandDef: hammer2h })).toBe(false);
    expect(canEquipInSlot(shield, 'larm', 'Paladin', { otherHandDef: hammer2h })).toBe(false);
  });

  it('still allows two one-handers or an empty other hand', () => {
    expect(canEquipInSlot(sword, 'larm', 'Amazon', { otherHandDef: sword })).toBe(true);
    expect(canEquipInSlot(staff, 'rarm', 'Amazon')).toBe(true);
    expect(canEquipInSlot(staff, 'rarm', 'Amazon', { otherHandDef: null })).toBe(true);
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

  it('matches runewords by rune code and rune names', () => {
    const hive = {
      name: 'Hive',
      id: 'rw:hive',
      rarity: 'runeword',
      uniqueKind: 'runeword',
      runeCode: 'BerBerIst',
      runes: ['Ber', 'Ber', 'Ist'],
    };
    expect(matchesItemPickerSearch(hive, 'berberist')).toBe(true);
    expect(matchesItemPickerSearch(hive, 'ber')).toBe(true);
    expect(matchesItemPickerSearch(hive, 'rw')).toBe(true);
    expect(matchesItemPickerSearch(hive, 'bow')).toBe(false);
  });
});
