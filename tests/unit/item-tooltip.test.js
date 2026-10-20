import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { buildItemTooltipHtml } from '@/items/item-tooltip.js';
import { loadMysticOrbsCatalog } from '@/items/mystic-orbs.js';
import { loadSocketablesCatalog } from '@/items/socketables.js';
import { getItemStatSections } from '@/items/item-stats.js';

const mysticOrbsCatalog = JSON.parse(
  readFileSync(resolve('public/items/2_14/mystic-orbs.json'), 'utf8')
);

describe('buildItemTooltipHtml', () => {
  beforeEach(() => {
    loadMysticOrbsCatalog(mysticOrbsCatalog);
  });

  it('returns empty for missing def', () => {
    expect(buildItemTooltipHtml(null)).toBe('');
    expect(buildItemTooltipHtml(undefined)).toBe('');
  });

  it('colors the name by rarity and shows the item image', () => {
    const html = buildItemTooltipHtml({
      name: 'Body of the Forbidden One',
      rarity: 'unique',
      category: 'armor',
      icon: 'plt',
    });
    expect(html).toContain('item-tooltip-name--unique');
    expect(html).toContain('item-rarity--unique');
    expect(html).toContain('Body of the Forbidden One');
    expect(html).toContain('item-tooltip-icon');
    expect(html).toContain('<img');
    expect(html).toContain('plt.webp');
  });

  it('uses the normal name class for base items', () => {
    const html = buildItemTooltipHtml({
      name: 'Breast Plate',
      rarity: 'normal',
      category: 'armor',
    });
    expect(html).toContain('item-tooltip-name--normal');
    expect(html).not.toContain('has-text-white');
    expect(html).not.toContain('has-text-primary');
  });

  it('uses the runeword name class for runewords', () => {
    const html = buildItemTooltipHtml({
      name: 'Spirit',
      rarity: 'runeword',
      category: 'weapons',
    });
    expect(html).toContain('item-tooltip-name--runeword');
    expect(html).toContain('item-rarity--runeword');
  });

  it('groups requirements, damage type, and scaling', () => {
    const def = {
      name: 'War Spear',
      rarity: 'magic',
      category: 'weapons',
      group: 'Spears',
      icon: 'invspr',
      damage1h: { min: 10, max: 20 },
      reqLevel: 12,
      reqDex: 60,
      strDamageBonus: 0.14,
      innate: 'Innate Fire Damage: (84.0% of Strength)',
      adds: 'Adds 250-350 Fire Damage',
      modifiers: ['+35% Enhanced Damage'],
    };
    const html = buildItemTooltipHtml(def, 'invspr', null, {
      characterLevel: 10,
      characterDexterity: 40,
    });

    expect(html).toContain('item-rarity--magic');
    expect(html).toContain('MAGIC SPEARS');
    expect(html).toContain('Strength Damage Bonus');
    expect(html).toContain('Innate Fire Damage: (84.0% of Strength)');
    expect(html).not.toMatch(/>Fire Damage</);
    expect(html).toContain('Requires:');
    expect(html).toContain('Level 12');
    expect(html).toContain('60 Dexterity');
    expect(html).toContain('item-tooltip-req--unmet');
    expect(html).not.toContain('Required Level:');
    expect(html).not.toContain('Required Dexterity:');

    const strBonusAt = html.indexOf('Strength Damage Bonus');
    const innateAt = html.indexOf('Innate Fire Damage');
    const reqsAt = html.indexOf('Requires:');
    expect(strBonusAt).toBeGreaterThan(-1);
    expect(innateAt).toBeGreaterThan(strBonusAt);
    expect(reqsAt).toBeGreaterThan(innateAt);
  });

  it('attaches a mystic orbs side panel when orbs are present', () => {
    const html = buildItemTooltipHtml(
      {
        name: 'Silks of the Victor',
        rarity: 'unique',
        category: 'armor',
      },
      null,
      null,
      {
        mysticOrbs: [
          [5, 'MO - Total Char Defense'],
          [1, 'Weight of Talent'],
        ],
      }
    );
    expect(html).toContain('item-tooltip-layout');
    expect(html).toContain('item-tooltip-sidepanel');
    expect(html).toContain('Mystic Orbs');
    expect(html).toContain('5x MO - Total Char Defense');
    expect(html).toContain('+25% Total Character Defense');
    expect(html).toContain('1x Weight of Talent');
    expect(html).toContain('+1 to All Skills');
  });

  it('lists socketables above mystic orbs with icons and marks added extras', () => {
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
    const html = buildItemTooltipHtml(
      {
        name: 'Endless Pride',
        rarity: 'unique',
        uniqueKind: 'sssu',
        category: 'armor',
        sockets: 4,
        modifiers: ['+(1 to 50)% Magic Find'],
      },
      'invcap',
      { 'modAffix:base:m0:r0': 26 },
      {
        extras: ['+5% Cast Speed', '+30 Required Level'],
        mysticOrbs: [
          [1, 'Solitude'],
          [2, 'Crystal of Tears'],
        ],
        socketables: [
          {
            slot: 1,
            name: "Zann Esu's Stone",
            type: 'Jewel',
            quality: 'Unique',
            code: 'jew',
            icon: 'invjw6',
            modifiers: ['+5% Cast Speed', '+3% to Spell Damage'],
          },
          { slot: 2, name: 'Qor Rune', type: 'Rune', code: 'r53', icon: 'r-d-11' },
          { slot: 3, name: 'Qor Rune', type: 'Rune', code: 'r53', icon: 'r-d-11' },
          { slot: 4, name: 'Qor Rune', type: 'Rune', code: 'r53', icon: 'r-d-11' },
        ],
      }
    );
    expect(html).toContain('Sockets');
    expect(html).toContain('Mystic Orbs');
    expect(html).toContain("Zann Esu's Stone");
    expect(html).toContain('Qor Rune');
    expect(html).toContain('invjw6.webp');
    expect(html).toContain('r-d-11.webp');
    expect(html).toContain('item-mod--added');
    expect(html).toContain('* +5% Cast Speed *');
    expect(html).toContain('* +30 Required Level *');
    expect(html.indexOf('Sockets')).toBeLessThan(html.indexOf('Mystic Orbs'));
    expect(html).toContain('item-tooltip-sock__mod');
    expect(html).toContain('+5% Cast Speed');
    expect(html).toContain('2% Deadly Strike');
    expect(html).toContain('Adds 6-12 Damage');
    expect(html.indexOf("Zann Esu's Stone")).toBeLessThan(html.indexOf('+3% to Spell Damage'));
    expect(html.indexOf('+3% to Spell Damage')).toBeLessThan(html.indexOf('Qor Rune'));
  });

  it('groups set bonuses separately from item stats', () => {
    const html = buildItemTooltipHtml(
      {
        name: 'Emerald Earth',
        rarity: 'set',
        category: 'armor',
        setName: 'Rainbow Warrior',
        modifiers: ['+125% Enhanced Defense'],
      },
      null,
      null,
      {
        setName: 'Rainbow Warrior',
        setBonuses: [
          {
            required: 2,
            active: true,
            modifiers: ['+2 to Druid Skill Levels', '10% Chance of Crushing Blow'],
          },
          {
            required: 'complete',
            active: false,
            modifiers: ['+100 to all Attributes'],
          },
        ],
      }
    );

    expect(html).toContain('item-tooltip-set-bonuses');
    expect(html).toContain('item-tooltip-set-bonus--active');
    expect(html).toContain('item-tooltip-set-bonus--inactive');
    expect(html).toContain('Set Bonus with 2 or more set items');
    expect(html).toContain('Set Bonus with complete set');
    expect(html).toContain('+2 to Druid Skill Levels');
    expect(html).toContain('+100 to all Attributes');
    expect(html).not.toContain('(inactive)');
    expect(html.indexOf('item-tooltip-section--mods')).toBeLessThan(
      html.indexOf('item-tooltip-set-bonuses')
    );
    expect(html.indexOf('+125% Enhanced Defense')).toBeLessThan(
      html.indexOf('item-tooltip-set-bonuses')
    );
  });
});

describe('getItemStatSections', () => {
  it('replaces Random Monster reanimate with the TSW-resolved monster extra', () => {
    const sections = getItemStatSections(
      {
        rarity: 'unique',
        uniqueKind: 'su',
        modifiers: [
          'Orb Effects Applied to this Item are Doubled',
          '+(130 to 150)% Enhanced Defense',
          '2% Reanimate as: Random Monster',
        ],
      },
      null,
      {
        extras: [
          '+14 Spell Focus',
          '2% Reanimate as: Undead Marksman',
          '+1% to Experience Gained',
        ],
      }
    );
    expect(sections.mods).toContain('2% Reanimate as: Undead Marksman');
    expect(sections.mods).not.toContain('2% Reanimate as: Random Monster');
    expect(sections.mods.filter((line) => /Reanimate as:/i.test(line))).toHaveLength(1);
    expect(sections.mods).toEqual(
      expect.arrayContaining(['{added}+14 Spell Focus', '{added}+1% to Experience Gained'])
    );
  });

  it('marks extras as added and catalog rolls past max as boosted', () => {
    const sections = getItemStatSections(
      {
        rarity: 'unique',
        uniqueKind: 'su',
        modifiers: ['+(500 to 1000) to Life', '+1 to All Skills'],
      },
      {
        'modAffix:base:m0:r0': 1003,
        'modFixed:base:m1': 2,
      },
      {
        extras: ['+25% Bonus to Defense', '+35 Required Level'],
      }
    );
    expect(sections.mods).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\{boosted\}\+1003 to Life/),
        '{boosted}+2 to All Skills',
        '{added}+25% Bonus to Defense',
        '{added}+35 Required Level',
      ])
    );
  });

  it('replaces both numbers in fixed Adds min-max damage lines', () => {
    const sections = getItemStatSections(
      {
        rarity: 'unique',
        uniqueKind: 'su',
        modifiers: ['Adds 7-13 Damage', 'Adds 90-110 Damage'],
      },
      {
        'modFixed:base:m0': 43,
        'modFixed:base:m0:n1': 61,
        'modFixed:base:m1': 112,
        'modFixed:base:m1:n1': 139,
      }
    );
    expect(sections.mods).toContain('{boosted}Adds 43-61 Damage');
    expect(sections.mods).toContain('{boosted}Adds 112-139 Damage');
    expect(sections.mods.join('\n')).not.toMatch(/Adds 43-13/);
    expect(sections.mods.join('\n')).not.toMatch(/Adds 112-110/);
  });

  it('puts damage type and innate with str/dex bonuses, not requirements', () => {
    const sections = getItemStatSections({
      damage1h: { min: 10, max: 20 },
      reqLevel: 12,
      reqDex: 60,
      strDamageBonus: 0.14,
      innate: 'Innate Fire Damage: (84.0% of Strength)',
      adds: 'Adds 250-350 Fire Damage',
    });
    expect(sections.base[0]).toBe('One-Hand Damage: 10 to 20');
    expect(sections.base).not.toContain('Fire Damage');
    expect(sections.scaling[0]).toContain('Strength Damage Bonus');
    expect(sections.scaling[1]).toBe('Innate Fire Damage: (84.0% of Strength)');
    expect(sections.mods).toContain('Adds 250-350 Fire Damage');
    expect(sections.requirements).toEqual({
      reqLevel: 12,
      reqStr: 0,
      reqDex: 60,
      reductionPct: 0,
    });
  });

  it('shows always-ethereal uniques with one Ethereal line and orange flavor', () => {
    const sections = getItemStatSections({
      rarity: 'unique',
      uniqueKind: 'su',
      ethereal: true,
      modifiers: [
        '{grey}Ethereal',
        '50% Movement Speed',
        '{orange}Celeri Caelesti Iustitia',
      ],
    });
    const ethereal = [...sections.base, ...sections.scaling, ...sections.mods].filter((line) =>
      /Ethereal/i.test(line)
    );
    expect(ethereal).toEqual(['{grey}Ethereal']);
    expect(sections.mods).toContain('{orange}Celeri Caelesti Iustitia');
    expect(sections.mods).not.toContain('Celeri Caelesti Iustitia');
  });

  it('lists innate once and does not label it as regular fire damage', () => {
    const sections = getItemStatSections({
      rarity: 'unique',
      uniqueKind: 'su',
      speed: 10,
      innate: 'Innate Fire Damage: (80.0% of Strength)',
      adds: 'Adds 250-350 Fire Damage',
      sockets: 6,
      modifiers: [
        'Innate Fire Damage: (80.0% of Strength)',
        'Adds 250-350 Fire Damage',
        '-20% to Enemy Fire Resistance',
      ],
    });
    const innateLines = [...sections.base, ...sections.scaling, ...sections.mods].filter((line) =>
      /Innate Fire Damage/.test(line)
    );
    expect(innateLines).toEqual(['Innate Fire Damage: (80.0% of Strength)']);
    expect(sections.base).not.toContain('Fire Damage');
    expect(sections.scaling).toContain('Innate Fire Damage: (80.0% of Strength)');
    expect(sections.scaling.at(-1)).toBe('Socketed (6)');
    expect(sections.mods).toContain('Adds 250-350 Fire Damage');
    expect(sections.mods).not.toContain('Innate Fire Damage: (80.0% of Strength)');
    expect(sections.mods).not.toContain('Socketed (6)');
  });
});
