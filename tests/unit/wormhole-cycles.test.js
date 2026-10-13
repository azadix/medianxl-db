import { describe, it, expect } from 'vitest';
import {
  WORMHOLE_CYCLES,
  WORMHOLE_CYCLE_REQ_LEVEL_CAP,
  isCorruptedWormhole,
  applyWormholeCycle,
  clearWormholeCycles,
  canApplyWormholeCycle,
  getWormholeAggregatedAffixes,
  getWormholeCycleReqLevelBonus,
  getAppliedWormholeCycleIds,
  removeWormholeCycleAt,
  wormholeCycleAffixMergeKey,
} from '@/items/wormhole-cycles.js';
import {
  getCharmDetailStatRows,
  getCharmRequiredLevel,
  defaultCharmRollsForDef,
} from '@/items/charm-items.js';
import { resolveItemRequirements } from '@/items/item-requirements.js';

const wormhole = {
  id: '\\\\8',
  name: 'Corrupted Wormhole',
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
  reqLevel: 100,
  modifiers: ['Add Cycles to apply specific bonuses'],
  trophy: ['30% Magic Find'],
};

describe('wormhole-cycles', () => {
  it('detects Corrupted Wormhole', () => {
    expect(isCorruptedWormhole(wormhole)).toBe(true);
    expect(isCorruptedWormhole({ name: 'Umbaru Treasure' })).toBe(false);
  });

  it('has one entry per cycle code from cubemain', () => {
    expect(WORMHOLE_CYCLES.length).toBe(32);
    expect(WORMHOLE_CYCLES.filter((c) => c.size === 'golden')).toHaveLength(1);
  });

  it('applies cycles and aggregates overlapping strength ranges', () => {
    let rolls = {};
    const small = applyWormholeCycle(rolls, 'cy01');
    expect(small.ok).toBe(true);
    rolls = small.rolls;
    const medium = applyWormholeCycle(rolls, 'cy05');
    expect(medium.ok).toBe(true);
    rolls = medium.rolls;

    expect(getAppliedWormholeCycleIds(rolls)).toEqual(['cy01', 'cy05']);
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(4);

    const aggs = getWormholeAggregatedAffixes(rolls);
    const flatStr = aggs.find((a) => a.text.includes('to Strength') && a.ranges.length);
    const pctStr = aggs.find((a) => /%\s*to Strength/i.test(a.text));
    expect(flatStr?.ranges[0]).toEqual({ min: 5, max: 11 });
    expect(pctStr?.text).toBe('+1% to Strength');
  });

  it('enforces golden cycle limit and RL cap', () => {
    let rolls = applyWormholeCycle({}, 'golden').rolls;
    expect(canApplyWormholeCycle(rolls, 'golden').ok).toBe(false);
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(0);

    rolls = {};
    // Fill near cap with large skillers (+15 each)
    for (let i = 0; i < 5; i += 1) {
      const result = applyWormholeCycle(rolls, 'cy22');
      expect(result.ok).toBe(true);
      rolls = result.rolls;
    }
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(75);
    expect(canApplyWormholeCycle(rolls, 'cy22').ok).toBe(false);
    expect(canApplyWormholeCycle(rolls, 'cy01').ok).toBe(true);
    // 75 + 5 = 80 is allowed; 75 + 5 after another +1 would exceed.
    expect(applyWormholeCycle(rolls, 'cy09').ok).toBe(true);
    rolls = applyWormholeCycle(rolls, 'cy01').rolls;
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(76);
    const over = applyWormholeCycle(rolls, 'cy09');
    expect(over.ok).toBe(false);
    expect(over.reason).toContain(String(WORMHOLE_CYCLE_REQ_LEVEL_CAP));
  });

  it('clears and removes cycles', () => {
    let rolls = applyWormholeCycle({}, 'cy01').rolls;
    rolls = applyWormholeCycle(rolls, 'cy02').rolls;
    rolls = removeWormholeCycleAt(rolls, 0);
    expect(getAppliedWormholeCycleIds(rolls)).toEqual(['cy02']);
    rolls = clearWormholeCycles(rolls);
    expect(getAppliedWormholeCycleIds(rolls)).toEqual([]);
    expect(getWormholeAggregatedAffixes(rolls)).toEqual([]);
  });

  it('builds roll rows only for applied cycle stats', () => {
    const seeded = defaultCharmRollsForDef(wormhole);
    const applied = applyWormholeCycle(seeded, 'cy01').rolls;
    const rows = getCharmDetailStatRows(wormhole, applied);
    const rollRows = rows.filter((r) => r.kind === 'roll');
    expect(rollRows.length).toBe(1);
    expect(rollRows[0].stat.min).toBe(3);
    expect(rollRows[0].stat.max).toBe(5);
    expect(rows.some((r) => r.kind === 'text' && /Add Cycles/i.test(r.text || ''))).toBe(false);
  });

  it('raises required level from cycles', () => {
    const rolls = applyWormholeCycle({}, 'cy09').rolls;
    expect(getCharmRequiredLevel(wormhole, rolls)).toBe(105);
    expect(resolveItemRequirements(wormhole, { rolls }).reqLevel).toBe(105);
  });

  it('merge keys preserve plus before ranges', () => {
    expect(wormholeCycleAffixMergeKey('+(3 to 5) to Strength')).toBe('+(*) to Strength');
    expect(wormholeCycleAffixMergeKey('+1% to Strength')).toBe('+#% to Strength');
  });
});
