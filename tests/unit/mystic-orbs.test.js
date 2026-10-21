import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canUseMysticOrbOnItem,
  formatMysticOrbLine,
  formatMysticOrbLines,
  formatMysticOrbRows,
  getMysticOrbBonusLines,
  loadMysticOrbsCatalog,
  mysticOrbIcon,
  mysticOrbNameCssClass,
  mysticOrbReqLevelPerStack,
  mysticOrbSlotCategory,
  mysticOrbsRequiredLevelBonus,
  normalizeMysticOrbs,
  scaleMysticOrbModifierLine,
} from '@/items/mystic-orbs.js';
import {
  extrasWithAppliedItemBonuses,
  getItemDetailStatRows,
  getItemStatLines,
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
});
