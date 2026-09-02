import { describe, expect, it } from 'vitest';
import { buildItemTooltipHtml } from '@/items/item-tooltip.js';

describe('buildItemTooltipHtml', () => {
  it('returns empty for missing def', () => {
    expect(buildItemTooltipHtml(null)).toBe('');
    expect(buildItemTooltipHtml(undefined)).toBe('');
  });

  it('colors the name by rarity and omits the item image', () => {
    const html = buildItemTooltipHtml({
      name: 'Body of the Forbidden One',
      rarity: 'unique',
      category: 'armor',
      icon: 'plt',
    });
    expect(html).toContain('item-tooltip-name--unique');
    expect(html).toContain('Body of the Forbidden One');
    expect(html).not.toContain('item-tooltip-icon');
    expect(html).not.toContain('tooltip-icon');
    expect(html).not.toContain('<img');
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
    expect(html.indexOf('tooltip-description')).toBeLessThan(html.indexOf('item-tooltip-set-bonuses'));
    expect(html.indexOf('+125% Enhanced Defense')).toBeLessThan(html.indexOf('item-tooltip-set-bonuses'));
  });
});
