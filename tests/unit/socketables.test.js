import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  getSocketableBonusLines,
  loadSocketablesCatalog,
  normalizeSocketables,
  parseTswSocketables,
  resolveSocketableIcon,
} from '@/items/socketables.js';
import { tswInstanceExtras, rollsFromTswItem } from '@/planner/tsw-item-rolls.js';
import { overlayAffixRollKey, overlayFixedBoostRollKey } from '@/items/item-overlays.js';

const dabomeiHelmSocketables = [
  {
    slot: 1,
    name: "Zann Esu's Stone",
    type: 'Jewel',
    quality: 'Unique',
    code: 'jew',
    image: 'invjw6',
    name_color: 4,
    description_lines: [
      [["Zann Esu's Stone", 4]],
      [['Jewel', 4]],
      [['Required Level: 100', -1]],
      [['Already Upgraded', 2]],
      [['+5% Cast Speed', 3]],
      [['+3% to Spell Damage', 3]],
      [['Maximum Cold Resist +1%', 3]],
    ],
  },
  {
    slot: 2,
    name: 'Qor Rune',
    type: 'Rune',
    quality: '',
    code: 'r53',
    image: 'r-d-11',
    name_color: 11,
    description_lines: [
      [['Qor Rune', 11]],
      [['Great Rune', 0]],
      [['Required Level: 100', -1]],
      [['+2% Deadly Strike', 3]],
    ],
  },
];

describe('socketables', () => {
  beforeEach(() => {
    loadSocketablesCatalog([
      {
        name: 'Qor Rune',
        code: 'r53',
        type: 'Rune',
        icon: 'r-d-11',
        weapon: '3% Deadly Strike',
        armor: '2% Deadly Strike',
        shield: '2% Deadly Strike',
      },
      { name: 'Jah Rune', code: 'r31', type: 'Rune', icon: 'invrJo' },
      {
        name: 'Perfect Bloodstone',
        code: '9$e',
        type: 'Gem',
        icon: 'invgsce',
        armor: ['Fire Resist +20%', 'Maximum Fire Resist +1%'],
      },
      { name: 'Jewel', code: 'jew', type: 'Jewel', icon: 'invjw1' },
    ]);
  });

  it('resolves game/TSW great-rune invfile stems like r-d-11', () => {
    expect(resolveSocketableIcon({ code: 'r53', name: 'Qor Rune', image: 'r-d-11', type: 'Rune' })).toBe(
      'r-d-11'
    );
    expect(resolveSocketableIcon({ image: 'r-d-11', type: 'Rune', name: 'Qor Rune' })).toBe('r-d-11');
    expect(resolveSocketableIcon({ code: 'r53', name: 'Qor Rune', type: 'Rune' })).toBe('r-d-11');
    expect(resolveSocketableIcon({ image: 'invjw6', type: 'Jewel', quality: 'Unique' })).toBe('invjw6');
  });

  it('lists host-slot bonuses for runes and gems, jewel modifiers as-is', () => {
    expect(
      getSocketableBonusLines({ name: 'Qor Rune', type: 'Rune', code: 'r53' }, { category: 'armor' })
    ).toEqual(['2% Deadly Strike']);
    expect(
      getSocketableBonusLines(
        { name: 'Qor Rune', type: 'Rune', code: 'r53' },
        { category: 'weapons', group: 'Swords', damage1h: '1-2' }
      )
    ).toEqual(['3% Deadly Strike']);
    expect(
      getSocketableBonusLines(
        { name: 'Perfect Bloodstone', type: 'Gem', code: '9$e' },
        { category: 'armor' }
      )
    ).toEqual(['Fire Resist +20%', 'Maximum Fire Resist +1%']);
    expect(
      getSocketableBonusLines(
        {
          name: "Zann Esu's Stone",
          type: 'Jewel',
          quality: 'Unique',
          code: 'jew',
          modifiers: ['+5% Cast Speed'],
        },
        { category: 'armor' }
      )
    ).toEqual(['+5% Cast Speed']);
  });

  it('maps Jah by catalog file invrJo, not guessed invrJah', () => {
    expect(resolveSocketableIcon({ name: 'Jah Rune', type: 'Rune', code: 'r31' })).toBe('invrJo');
    expect(resolveSocketableIcon({ name: 'Jah Rune (31)', type: 'Rune', icon: 'invrJah' })).toBe(
      'invrJo'
    );
    expect(resolveSocketableIcon({ name: 'Jah Rune', type: 'Rune', code: '31' })).toBe('invrJo');
  });

  it('parses dabomei-style TSW socketables with modifiers and icons', () => {
    const socks = parseTswSocketables({ socketables: dabomeiHelmSocketables });
    expect(socks).toHaveLength(2);
    expect(socks[0]).toMatchObject({
      name: "Zann Esu's Stone",
      type: 'Jewel',
      quality: 'Unique',
      icon: 'invjw6',
    });
    expect(socks[0].modifiers).toEqual(
      expect.arrayContaining(['+5% Cast Speed', '+3% to Spell Damage', 'Maximum Cold Resist +1%'])
    );
    expect(socks[1]).toMatchObject({
      name: 'Qor Rune',
      type: 'Rune',
      code: 'r53',
      icon: 'r-d-11',
    });
    expect(socks[1].modifiers).toContain('+2% Deadly Strike');
  });

  it('stores socketables and corrupted on tswInstanceExtras', () => {
    const meta = tswInstanceExtras(
      {
        item: 'Endless Pride',
        display_name: 'Endless Pride',
        type: 'Cap (SSSU)',
        corrupted: true,
        socketables: dabomeiHelmSocketables,
        mystic_orbs: [[1, 'Solitude']],
        description_lines: [
          [['Endless Pride', 4]],
          [['+26% Magic Find', 3]],
          [['+30 Required Level', 3]],
          [['Corrupted', 1]],
        ],
      },
      {
        id: 'u:endless-pride:sssu',
        name: 'Endless Pride',
        rarity: 'unique',
        uniqueKind: 'sssu',
        modifiers: ['+(1 to 50)% Magic Find'],
      }
    );
    expect(meta.corrupted).toBe(true);
    expect(meta.mysticOrbs).toEqual([[1, 'Solitude']]);
    expect(meta.socketables?.map((s) => s.name)).toEqual(["Zann Esu's Stone", 'Qor Rune']);
    expect(meta.extras).toEqual(expect.arrayContaining(['+30 Required Level']));
  });

  it('records fixed and ranged boosts from TSW totals', () => {
    const def = {
      id: 'u:silks-of-the-victor:su',
      name: 'Silks of the Victor',
      rarity: 'unique',
      uniqueKind: 'su',
      modifiers: ['+1 to All Skills', '+(500 to 1000) to Life'],
    };
    const rolls = rollsFromTswItem(
      {
        description_lines: [
          [['+2 to All Skills', 3]],
          [['+1003 to Life', 3]],
        ],
      },
      def
    );
    expect(rolls[overlayFixedBoostRollKey('base:m0')]).toBe(2);
    expect(rolls[overlayAffixRollKey('base:m1', 0)]).toBe(1003);
  });

  it('stores both ends of fixed Adds min-max damage (Assur / Death Sentence)', () => {
    const assurDef = {
      id: "u:assur's-bane:su",
      name: "Assur's Bane",
      rarity: 'unique',
      uniqueKind: 'su',
      modifiers: ['+1 to All Skills', 'Adds 7-13 Damage', '+30% Damage to Undead'],
    };
    const assurRolls = rollsFromTswItem(
      {
        description_lines: [
          [['+1 to All Skills', 3]],
          [['Adds 43-61 Damage', 3]],
          [['+30% Damage to Undead', 3]],
        ],
      },
      assurDef
    );
    expect(assurRolls[overlayFixedBoostRollKey('base:m1', 0)]).toBe(43);
    expect(assurRolls[overlayFixedBoostRollKey('base:m1', 1)]).toBe(61);

    const deathDef = {
      id: 'u:death-sentence:su',
      name: 'Death Sentence',
      rarity: 'unique',
      uniqueKind: 'su',
      modifiers: ['Adds 90-110 Damage', '25% to Dexterity'],
    };
    const deathRolls = rollsFromTswItem(
      {
        description_lines: [
          [['Adds 112-139 Damage', 3]],
          [['29% to Dexterity', 3]],
        ],
      },
      deathDef
    );
    expect(deathRolls[overlayFixedBoostRollKey('base:m0', 0)]).toBe(112);
    expect(deathRolls[overlayFixedBoostRollKey('base:m0', 1)]).toBe(139);
  });

  it('round-trips socketables through item snapshot', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [
      {
        id: 'u:endless-pride:sssu',
        name: 'Endless Pride',
        rarity: 'unique',
        uniqueKind: 'sssu',
        category: 'armor',
        slot: 'head',
        invWidth: 2,
        invHeight: 2,
        icon: 'invcap',
      },
    ];
    store.catalogByIdMap = Object.fromEntries(store.catalog.map((d) => [d.id, d]));

    const socks = normalizeSocketables(parseTswSocketables({ socketables: dabomeiHelmSocketables }));
    const id = store.createInstance('u:endless-pride:sssu', 'invcap', null, null, {
      socketables: socks,
      corrupted: true,
      extras: ['+30 Required Level'],
      mysticOrbs: [[1, 'Solitude']],
    });
    store.equipment.head = id;

    const snap = store.toSnapshot();
    expect(snap.equipment.head.socketables).toHaveLength(2);
    expect(snap.equipment.head.corrupted).toBe(true);

    store.fromSnapshot(snap);
    const restoredId = store.equipment.head;
    expect(store.getSocketablesForInstance(restoredId).map((s) => s.name)).toEqual([
      "Zann Esu's Stone",
      'Qor Rune',
    ]);
    expect(store.instances[restoredId].corrupted).toBe(true);
  });
});
