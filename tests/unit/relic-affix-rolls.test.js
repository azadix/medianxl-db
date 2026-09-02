import { describe, it, expect } from 'vitest';
import {
  getRelicRollableStats,
  getRelicDetailStatRows,
  defaultRelicAffixRolls,
  relicAffixRollKey,
} from '@/items/relic-items.js';
import { mergeRollsForDef, getItemDetailStatRows } from '@/items/item-stats.js';

const ancientsHand = {
  id: 'relic:ancients-hand',
  name: "Relic (Ancients' Hand)",
  keepInInventory: true,
  rarity: 'relic',
  modifiers: [
    'Adds 50-150 Fire Damage',
    '-(3 to 5)% to Enemy Fire Resistance',
    "+(10 to 20) to Ancients' Hand",
  ],
};

describe('relic affix rolls', () => {
  it('builds rollable stats with resolved display and highlight parts', () => {
    const key = relicAffixRollKey('base:m2', 0);
    const rolls = { [key]: 15 };
    const stats = getRelicRollableStats(ancientsHand, rolls);
    expect(stats).toHaveLength(2);
    const skill = stats.find((s) => s.key === key);
    expect(skill).toBeTruthy();
    expect(skill.display).toBe("+15 to Ancients' Hand");
    expect(skill.displayParts).toEqual([
      { kind: 'text', text: '+' },
      { kind: 'value', text: '15' },
      { kind: 'text', text: " to Ancients' Hand" },
    ]);
  });

  it('updates detail rows when rolls change', () => {
    const key = relicAffixRollKey('base:m2', 0);
    const defaults = mergeRollsForDef(ancientsHand, null);
    expect(defaults[key]).toBe(15);

    const rowsAt15 = getItemDetailStatRows(ancientsHand, { ...defaults, [key]: 15 });
    const rollRow = rowsAt15.find((r) => r.kind === 'roll' && r.stat.key === key);
    expect(rollRow.stat.displayParts).toContainEqual({ kind: 'value', text: '15' });

    const rowsAt20 = getItemDetailStatRows(ancientsHand, { ...defaults, [key]: 20 });
    const rollRow20 = rowsAt20.find((r) => r.kind === 'roll' && r.stat.key === key);
    expect(rollRow20.stat.displayParts).toContainEqual({ kind: 'value', text: '20' });
    expect(rollRow20.stat.display).toBe("+20 to Ancients' Hand");
  });

  it('defaults include both fire resist and skill rolls', () => {
    const rolls = defaultRelicAffixRolls(ancientsHand);
    expect(rolls[relicAffixRollKey('base:m1', 0)]).toBe(4);
    expect(rolls[relicAffixRollKey('base:m2', 0)]).toBe(15);
  });
});
