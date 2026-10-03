import { describe, expect, it } from 'vitest';
import { buildItemTooltipHtml } from '@/items/item-tooltip.js';
import { getItemStatSections } from '@/items/item-stats.js';

describe('buildItemTooltipHtml', () => {
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
    expect(html).toContain('Fire Damage');
    expect(html).toContain('Strength Damage Bonus');
    expect(html).toContain('Innate Fire Damage: (84.0% of Strength)');
    expect(html).toContain('Requires:');
    expect(html).toContain('Level 12');
    expect(html).toContain('60 Dexterity');
    expect(html).toContain('item-tooltip-req--unmet');
    expect(html).not.toContain('Required Level:');
    expect(html).not.toContain('Required Dexterity:');

    const fireTypeAt = html.indexOf('Fire Damage');
    const strBonusAt = html.indexOf('Strength Damage Bonus');
    const innateAt = html.indexOf('Innate Fire Damage');
    const reqsAt = html.indexOf('Requires:');
    expect(fireTypeAt).toBeGreaterThan(-1);
    expect(strBonusAt).toBeGreaterThan(fireTypeAt);
    expect(innateAt).toBeGreaterThan(strBonusAt);
    expect(reqsAt).toBeGreaterThan(innateAt);
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
    expect(sections.base).toContain('Fire Damage');
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
});
