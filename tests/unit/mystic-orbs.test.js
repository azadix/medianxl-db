import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  canUseMysticOrbOnItem,
  formatMysticOrbLine,
  formatMysticOrbLines,
  formatMysticOrbRows,
  formatRequiredLevelBonusLine,
  getMysticOrbBonusLines,
  getMysticOrbDisplayLines,
  loadMysticOrbsCatalog,
  mysticOrbIcon,
  mysticOrbNameCssClass,
  mysticOrbReqLevelPerStack,
  mysticOrbSlotCategory,
  mysticOrbsRequiredLevelBonus,
  mysticOrbsSetEthereal,
  normalizeMysticOrbs,
  scaleMysticOrbModifierLine,
} from '@/items/mystic-orbs.js';
import { getItemUpgradeFlags } from '@/items/item-upgrades.js';
import {
  extrasWithAppliedItemBonuses,
  getItemDetailStatRows,
  getItemStatLines,
  getItemStatSections,
} from '@/items/item-stats.js';
import { loadSocketablesCatalog } from '@/items/socketables.js';

const mysticOrbsCatalog = JSON.parse(
  readFileSync(resolve('public/items/2_14/mystic-orbs.json'), 'utf8')
);

describe('mystic-orbs', () => {
  loadMysticOrbsCatalog(mysticOrbsCatalog);

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
    expect(formatMysticOrbLine(1, 'Weight of Talent')).toBe('1x Weight of Talent');
    expect(
      formatMysticOrbLines([
        [5, 'MO - Total Char Defense'],
        [1, 'Weight of Talent'],
      ])
    ).toEqual(['5x MO - Total Char Defense', '1x Weight of Talent']);
  });

  it('lists catalog bonuses scaled by apply count', () => {
    expect(getMysticOrbBonusLines('MO - Total Char Defense', 5)).toEqual([
      '+25% Total Character Defense',
    ]);
    expect(getMysticOrbBonusLines('MO - Damage Reduced', 5)).toEqual([
      'Physical Damage Taken Reduced by 25',
    ]);
    expect(getMysticOrbBonusLines("Farnham's Lost Marble", 2)).toEqual([
      '2% Movement Speed',
      '+60 Life on Melee Attack',
      '+60 Mana on Melee Attack',
    ]);
    expect(getMysticOrbBonusLines('Lodestone', 1)).toEqual([
      '+6 Spell Focus',
      '+6% to Spell Damage',
      'Requirements +10%',
    ]);
    expect(getMysticOrbBonusLines('Rare MO - Fire Resist', 1)).toEqual([
      'Max Fire Resist +1%',
      'Fire Resist -10%',
    ]);
    expect(mysticOrbReqLevelPerStack('Rare MO - Fire Resist')).toBe(6);
  });

  it('does not scale skill levels in proc lines', () => {
    expect(
      scaleMysticOrbModifierLine('2% Chance to cast level 40 Ice Bolt Nova on Melee Attack', 2)
    ).toBe('4% Chance to cast level 40 Ice Bolt Nova on Melee Attack');
  });

  it('attaches bonus rows for tooltip rendering', () => {
    const rows = formatMysticOrbRows([
      [5, 'MO - Total Char Defense'],
      [1, 'Weight of Talent'],
    ]);
    expect(rows[0].label).toBe('5x MO - Total Char Defense');
    expect(rows[0].mods).toContain('+25% Total Character Defense');
    expect(rows[1].kind).toBe('unique');
    expect(rows[1].mods).toEqual([
      '+1 to All Skills',
      '+5% to Experience Gained',
      'Requirements +15%',
    ]);
  });

  it('restricts mystic orbs by host item slot', () => {
    const weapon = { category: 'weapons', group: 'Bows', slot: 'arms' };
    const armor = { category: 'armor', group: 'Helms', slot: 'head' };
    const body = { category: 'armor', group: 'Armor', slot: 'tors' };
    const ring = { category: 'other', slot: 'ring' };
    expect(mysticOrbSlotCategory(weapon)).toBe('weapon');
    expect(mysticOrbSlotCategory(ring)).toBe('jewelry');
    expect(
      canUseMysticOrbOnItem('MO - Strength', {
        id: 'u:mindflayers-mayhem:su',
        name: "Mindflayer's Mayhem",
        category: 'armor',
        group: 'Boots',
        slot: 'feet',
      })
    ).toBe(false);
    expect(canUseMysticOrbOnItem('MO - Enhanced Damage', weapon)).toBe(true);
    expect(canUseMysticOrbOnItem('MO - Enhanced Damage', armor)).toBe(false);
    expect(canUseMysticOrbOnItem('MO - Strength', armor)).toBe(true);
    expect(canUseMysticOrbOnItem('MO - Strength', weapon)).toBe(false);
    expect(canUseMysticOrbOnItem('MO - Fire Res', ring)).toBe(true);
    expect(canUseMysticOrbOnItem('Solitude', armor)).toBe(true);
    expect(canUseMysticOrbOnItem('Solitude', body)).toBe(false);
    expect(canUseMysticOrbOnItem('Weight of Talent', body)).toBe(true);
    expect(canUseMysticOrbOnItem('Weight of Talent', armor)).toBe(false);
    expect(canUseMysticOrbOnItem('Kara\'s Trinket', ring)).toBe(true);
    expect(canUseMysticOrbOnItem('Kara\'s Trinket', weapon)).toBe(false);
    expect(canUseMysticOrbOnItem('MO - Attack Speed', weapon, 5)).toBe(false);
    expect(canUseMysticOrbOnItem('Rare MO - Fire Resist', { rarity: 'angelic', category: 'armor' })).toBe(
      true
    );
    expect(
      canUseMysticOrbOnItem('Rare MO - Fire Resist', {
        rarity: 'unique',
        uniqueKind: 'su',
        category: 'armor',
      })
    ).toBe(false);
  });

  it('maps mystic orb icons from slot type', () => {
    expect(mysticOrbIcon('MO - Strength')).toBe('orb_armo');
    expect(mysticOrbIcon('MO - Enhanced Damage')).toBe('orb_weap');
    expect(mysticOrbIcon("Kara's Trinket")).toBe('orb_misc');
    expect(mysticOrbIcon('MO - Fire Spell Damage')).toBe('orb_any');
    expect(mysticOrbIcon('Celestial Wind')).toBe('occultorb');
    expect(mysticOrbNameCssClass('Weight of Talent')).toBe('item-tooltip-sock__name--unique');
    expect(mysticOrbNameCssClass('MO - Strength')).toBe('item-tooltip-sock__name--magic');
  });

  it('uses 4 required level per generic MO stack and 10 per unique', () => {
    expect(mysticOrbReqLevelPerStack('MO - Total Char Defense')).toBe(4);
    expect(mysticOrbReqLevelPerStack('Weight of Talent')).toBe(15);
    expect(
      mysticOrbsRequiredLevelBonus([
        [5, 'MO - Total Char Defense'],
        [1, 'Weight of Talent'],
      ])
    ).toBe(35);
  });

  it('adds mystic orb and socket bonuses to item stat lines', () => {
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
    ]);
    const def = {
      name: 'Alnair',
      rarity: 'unique',
      uniqueKind: 'su',
      category: 'weapons',
      group: 'Swords',
      damage1h: '1-2',
      reqLevel: 100,
      modifiers: ['+200% Enhanced Damage'],
    };
    const mysticOrbs = [[2, 'MO - Attack Speed']];
    const socketables = [{ name: 'Qor Rune', type: 'Rune', code: 'r53' }];
    const lines = getItemStatLines(def, null, { mysticOrbs, socketables }).join('\n');
    expect(lines).toContain('12% Attack Speed');
    expect(lines).toContain('3% Deadly Strike');
    expect(lines).toContain('+8 Required Level');
    const rows = getItemDetailStatRows(def, null, { mysticOrbs, socketables });
    const texts = rows.filter((row) => row.kind === 'text').map((row) => row.text);
    expect(texts.join('\n')).toContain('12% Attack Speed');
    expect(texts.join('\n')).toContain('3% Deadly Strike');
    expect(
      extrasWithAppliedItemBonuses(['12% Attack Speed', '+8 Required Level'], def, {
        mysticOrbs,
        socketables,
      })
    ).toEqual(['12% Attack Speed', '+8 Required Level', '3% Deadly Strike']);
  });

  it('does not restack mystic orb mods already on a custom item', () => {
    const def = {
      name: 'Belt (Angelic)',
      rarity: 'angelic',
      customQuality: 'angelic',
      category: 'armor',
      modifiers: ['Adds 6-12 Damage', '+83 Required Level'],
    };
    expect(
      extrasWithAppliedItemBonuses([], def, {
        mysticOrbs: [[2, 'Crystal of Tears']],
      })
    ).toEqual([]);
  });

  it('forces ethereal from Empyrean Touch', () => {
    expect(mysticOrbsSetEthereal([[1, 'Empyrean Touch']])).toBe(true);
    expect(mysticOrbsSetEthereal([[1, 'MO - Attack Speed']])).toBe(false);
    expect(getItemUpgradeFlags({ mysticOrbs: [[1, 'Empyrean Touch']] }).etherealForced).toBe(true);
    const sections = getItemStatSections(
      { name: 'Cap (Sacred)', rarity: 'crafted', category: 'armor', defense: { min: 100, max: 100 } },
      null,
      { mysticOrbs: [[1, 'Empyrean Touch']] }
    );
    expect(sections.base.some((line) => /Ethereal/.test(line))).toBe(true);
    expect(sections.base.some((line) => /Defense: 125/.test(line))).toBe(true);
  });

  it('sets and locks instance ethereal while Empyrean Touch is applied', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [{ id: 'cap', name: 'Cap (Sacred)', rarity: 'normal', category: 'armor' }];
    const id = store.createInstance('cap');
    expect(store.updateInstanceMysticOrbs(id, [[1, 'Empyrean Touch']])).toBe(true);
    expect(store.instances[id].ethereal).toBe(true);
    expect(store.setInstanceEthereal(id, false)).toBe(false);
    expect(store.instances[id].ethereal).toBe(true);
  });

  it('restricts occult effigies to legal hosts', () => {
    const armor = { category: 'armor', group: 'Helms', slot: 'head' };
    const boots = { category: 'armor', group: 'Boots', slot: 'feet' };
    const ring = { category: 'jewelry', slot: 'ring', rarity: 'unique' };
    const magicRing = { category: 'jewelry', slot: 'ring', rarity: 'magic' };
    const magicQuiver = { category: 'quivers', type: 'bowq', rarity: 'magic', slot: 'arms' };
    const uniqueQuiver = { category: 'quivers', type: 'bowq', rarity: 'unique', slot: 'arms' };
    const runeword = { category: 'weapons', group: 'Swords', rarity: 'runeword', damage1h: '1-2' };
    const sword = { category: 'weapons', group: 'Swords', rarity: 'unique', damage1h: '1-2' };
    const elementalBow = {
      category: 'weapons',
      group: 'Bows',
      innate: 'Innate Fire Damage',
      damage2h: '10-20',
    };
    const elementalSword = {
      category: 'weapons',
      group: 'Swords',
      innate: 'Innate Fire Damage',
      damage1h: '1-2',
    };
    const leechSword = {
      category: 'weapons',
      group: 'Swords',
      damage1h: '1-2',
      modifiers: ['+15% Life Stolen per Hit'],
    };
    const craftedHelm = { category: 'armor', group: 'Helms', slot: 'head', rarity: 'crafted' };
    const maxColdArmor = {
      category: 'armor',
      group: 'Armor',
      slot: 'tors',
      modifiers: ['Maximum Cold Resist +1%'],
    };

    expect(canUseMysticOrbOnItem("Craftsman's Brand", magicQuiver)).toBe(true);
    expect(canUseMysticOrbOnItem("Craftsman's Brand", uniqueQuiver)).toBe(false);
    expect(canUseMysticOrbOnItem('Celestial Wind', boots)).toBe(true);
    expect(canUseMysticOrbOnItem('Celestial Wind', armor)).toBe(false);
    expect(canUseMysticOrbOnItem('Sigil of Absolution', sword)).toBe(true);
    expect(canUseMysticOrbOnItem('Sigil of Absolution', ring)).toBe(false);
    expect(canUseMysticOrbOnItem('Sigil of Absolution', runeword)).toBe(false);
    expect(canUseMysticOrbOnItem('Path of Brutality', ring)).toBe(true);
    expect(canUseMysticOrbOnItem('Path of Brutality', magicRing)).toBe(false);
    expect(canUseMysticOrbOnItem('Empyrean Touch', armor)).toBe(true);
    expect(canUseMysticOrbOnItem('Empyrean Touch', ring)).toBe(false);
    expect(canUseMysticOrbOnItem('Elemental Ire', elementalBow)).toBe(true);
    expect(canUseMysticOrbOnItem('Elemental Ire', elementalSword)).toBe(false);
    expect(canUseMysticOrbOnItem('Elemental Dominion', elementalSword)).toBe(true);
    expect(canUseMysticOrbOnItem('Elemental Dominion', elementalBow)).toBe(false);
    expect(canUseMysticOrbOnItem('Arcane Hunger', leechSword)).toBe(true);
    expect(canUseMysticOrbOnItem('Arcane Hunger', elementalSword)).toBe(false);
    expect(canUseMysticOrbOnItem('Breath of Thaumaturgy', craftedHelm)).toBe(false);
    expect(canUseMysticOrbOnItem('Breath of Thaumaturgy', craftedHelm, 0, { shrine: 'abandoned' })).toBe(
      true
    );
    expect(canUseMysticOrbOnItem('Northern Winds', armor)).toBe(true);
    expect(canUseMysticOrbOnItem('Northern Winds', maxColdArmor)).toBe(false);
  });

  it('applies occult effigy required-level deltas including decreases', () => {
    expect(mysticOrbReqLevelPerStack('Celestial Wind')).toBe(0);
    expect(mysticOrbReqLevelPerStack('Sigil of Absolution')).toBe(-5);
    expect(mysticOrbReqLevelPerStack('Empyrean Touch')).toBe(10);
    expect(mysticOrbsRequiredLevelBonus([[2, 'Sigil of Absolution']])).toBe(-10);
    expect(mysticOrbsRequiredLevelBonus([[1, 'Breath of Thaumaturgy']])).toBe(25);
    expect(formatRequiredLevelBonusLine(-10)).toBe('-10 Required Level');
    expect(formatRequiredLevelBonusLine(10)).toBe('+10 Required Level');
    expect(getMysticOrbDisplayLines('Sigil of Absolution', 1)).toEqual([
      'Requirements +25%',
      '-5 Required Level',
    ]);
    expect(formatMysticOrbRows([[2, 'Sigil of Absolution']])[0].mods).toEqual([
      'Requirements +50%',
      '-10 Required Level',
    ]);
  });
});
