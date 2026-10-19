import { describe, it, expect } from 'vitest';
import {
  WORMHOLE_CYCLES,
  WORMHOLE_CYCLE_REQ_LEVEL_CAP,
  isCorruptedWormhole,
  applyWormholeCycle,
  clearWormholeCycles,
  canApplyWormholeCycle,
  getWormholeCycleReqLevelBonus,
  getWormholeCycleStatTotals,
  getWormholeCycleAffixSources,
  migrateWormholeCycleRolls,
  setWormholeCycleStatTotal,
  hasWormholeCycles,
  getWormholeCycleCounts,
  setWormholeCycleCount,
  wormholeCycleAffixMergeKey,
  getWormholeCycleTypeMatrix,
  WORMHOLE_CYCLE_TYPES,
} from '@/items/wormhole-cycles.js';
import Character from '@/character/Character.js';
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

  it('applying cycles adds their effects to summed totals', () => {
    let rolls = {};
    const small = applyWormholeCycle(rolls, 'cy01');
    expect(small.ok).toBe(true);
    rolls = small.rolls;
    const medium = applyWormholeCycle(rolls, 'cy05');
    expect(medium.ok).toBe(true);
    rolls = medium.rolls;

    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(4);
    const totals = Object.fromEntries(getWormholeCycleStatTotals(rolls).map((t) => [t.text, t.value]));
    // (3 to 5) -> 4, (2 to 6) -> 4, stacked range 5-11
    expect(totals).toEqual({ '+8 to Strength': 8, '+1% to Strength': 1 });
    expect(rolls['charmAffix:cycle:agg:to_strength:r0']).toBe(8);
    expect(rolls).not.toHaveProperty('charmCycleCount');
  });

  it('enforces golden cycle limit and RL cap', () => {
    let rolls = applyWormholeCycle({}, 'golden').rolls;
    expect(canApplyWormholeCycle(rolls, 'golden').ok).toBe(false);
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(0);
    expect(getWormholeCycleStatTotals(rolls).map((t) => t.text)).toContain('+1 to All Skills');

    rolls = {};
    // Fill near cap with large skillers (+15 each)
    for (let i = 0; i < 3; i += 1) {
      const result = applyWormholeCycle(rolls, 'cy22');
      expect(result.ok).toBe(true);
      rolls = result.rolls;
    }
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(45);
    expect(canApplyWormholeCycle(rolls, 'cy22').ok).toBe(false);
    expect(canApplyWormholeCycle(rolls, 'cy01').ok).toBe(true);
    // 45 + 5 = 50 is allowed; 45 + 5 after another +1 would exceed.
    expect(applyWormholeCycle(rolls, 'cy09').ok).toBe(true);
    rolls = applyWormholeCycle(rolls, 'cy01').rolls;
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(46);
    const over = applyWormholeCycle(rolls, 'cy09');
    expect(over.ok).toBe(false);
    expect(over.reason).toContain(String(WORMHOLE_CYCLE_REQ_LEVEL_CAP));
  });

  it('caps Required Level bonus at max character level minus base Required Level', () => {
    expect(WORMHOLE_CYCLE_REQ_LEVEL_CAP).toBe(50);
    expect(WORMHOLE_CYCLE_REQ_LEVEL_CAP).toBe(Character.MAX_LEVEL - wormhole.reqLevel);
    let rolls = {};
    for (let i = 0; i < 10; i += 1) {
      const result = applyWormholeCycle(rolls, 'cy09');
      expect(result.ok).toBe(true);
      rolls = result.rolls;
    }
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(50);
    expect(canApplyWormholeCycle(rolls, 'cy01').ok).toBe(false);
    expect(getCharmRequiredLevel(wormhole, rolls)).toBe(Character.MAX_LEVEL);
  });

  it('builds a type x size matrix covering every cycle once', () => {
    const { sizes, rows } = getWormholeCycleTypeMatrix();
    expect(sizes.map((s) => s.size)).toEqual(['small', 'medium', 'large']);
    expect(sizes.map((s) => s.label)).toEqual(['Small', 'Medium', 'Large']);
    expect(rows.map((r) => r.type)).toEqual(WORMHOLE_CYCLE_TYPES.map((t) => t.id));

    const ids = rows.flatMap((r) => Object.values(r.cells).filter(Boolean).map((c) => c.id));
    expect(ids.sort()).toEqual(WORMHOLE_CYCLES.map((c) => c.id).sort());

    for (const row of rows) {
      expect(row.mods).toBeTruthy();
      for (const [size, cycle] of Object.entries(row.cells)) {
        if (!cycle) continue;
        expect(cycle.size).toBe(size);
        expect(cycle.type).toBe(row.type);
      }
    }

    const str = rows.find((r) => r.type === 'str');
    expect(str.spanning).toBe(false);
    expect(str.cells.small.id).toBe('cy01');
    expect(str.cells.medium.id).toBe('cy05');
    expect(str.cells.large.id).toBe('cy09');
  });

  it('blocks sizes a type does not have', () => {
    const { rows } = getWormholeCycleTypeMatrix();
    const amazon = rows.find((r) => r.type === 'ama');
    expect(amazon.cells.small).toBeNull();
    expect(amazon.cells.medium).toBeNull();
    expect(amazon.cells.large.id).toBe('cy22');

    const golden = rows.find((r) => r.type === 'golden');
    expect(golden.spanning).toBe(true);
    expect(golden.cells.golden.id).toBe('golden');
  });

  it('manual edits persist and feed charm stats and required level', () => {
    let rolls = applyWormholeCycle({ unrelated: 7 }, 'cy01').rolls;
    rolls = setWormholeCycleStatTotal(rolls, 'to_strength', 5);
    expect(getWormholeCycleStatTotals(rolls)[0]).toMatchObject({ slug: 'to_strength', value: 5 });
    expect(getWormholeCycleAffixSources(rolls).map((s) => s.text)).toEqual(['+(3 to 5) to Strength']);

    // applying another cycle keeps the high roll and adds the new cycle's expected value
    rolls = applyWormholeCycle(rolls, 'cy01').rolls;
    expect(getWormholeCycleStatTotals(rolls)[0].value).toBe(9);
    expect(setWormholeCycleStatTotal(rolls, 'to_strength', 99)['charmAffix:cycle:agg:to_strength:r0']).toBe(10);
    expect(setWormholeCycleStatTotal(rolls, 'to_strength', -3)['charmAffix:cycle:agg:to_strength:r0']).toBe(6);

    // Required Level bonus is only the sum of applied cycles; stat edits never change it
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(2);
    expect(getCharmRequiredLevel(wormhole, rolls)).toBe(102);

    // cap blocking on apply: 2 + 3x15 (skillers) + 1 = 48
    for (const id of ['cy22', 'cy23', 'cy24', 'cy02']) rolls = applyWormholeCycle(rolls, id).rolls;
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(48);
    expect(canApplyWormholeCycle(rolls, 'cy05').ok).toBe(false);
    expect(canApplyWormholeCycle(rolls, 'cy13').ok).toBe(true);
    expect(canApplyWormholeCycle(rolls, 'golden').ok).toBe(true);
    expect(rolls.unrelated).toBe(7);
  });

  it('tracks Life & Mana cycles as counts and derives their stats', () => {
    let rolls = applyWormholeCycle({}, 'cy29').rolls;
    rolls = applyWormholeCycle(rolls, 'cy29').rolls;
    rolls = applyWormholeCycle(rolls, 'cy31').rolls;
    expect(rolls).toMatchObject({ 'charmCycleUses:cy29': 2, 'charmCycleUses:cy31': 1 });

    const counts = Object.fromEntries(getWormholeCycleCounts(rolls).map((e) => [e.cycle.id, e]));
    expect(counts.cy29.count).toBe(2);
    expect(counts.cy30.count).toBe(0);
    expect(counts.cy29.stats.map((st) => st.text)).toEqual(['+(0 to 40) to Mana', '+(0 to 20) to Life']);
    // Req. Lvl = 2 x 1 + 1 x 5
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(7);

    const totals = Object.fromEntries(getWormholeCycleStatTotals(rolls).map((t) => [t.text, t.value]));
    // 2 small: mana 20, life 10; large: mana 38, life 15, max life 1, max mana 2
    expect(totals['+58 to Mana']).toBe(58);
    expect(totals['+25 to Life']).toBe(25);

    rolls = applyWormholeCycle(rolls, 'golden').rolls;
    const texts = getWormholeCycleAffixSources(rolls).map((src) => src.text);
    expect(texts).toContain('+(25 to 90) to Mana');
    expect(texts).toContain('+(5 to 45) to Life');
    expect(texts).toContain('Maximum Life +(2 to 3)%');
  });

  it('editing a Life & Mana count updates stats and Req. Lvl within the cap', () => {
    let rolls = applyWormholeCycle({}, 'cy31').rolls;
    rolls = setWormholeCycleCount(rolls, 'cy31', 4);
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(20);
    const large = getWormholeCycleCounts(rolls).find((e) => e.cycle.id === 'cy31');
    expect(large.stats[0].text).toBe('+(100 to 200) to Mana');
    expect(getWormholeCycleStatTotals(rolls).find((t) => t.slug === 'to_mana').value).toBe(152);

    // 20 + 6 x 5 = 50 is the most that fits
    rolls = setWormholeCycleCount(rolls, 'cy31', 99);
    expect(getWormholeCycleCounts(rolls).find((e) => e.cycle.id === 'cy31').count).toBe(10);
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(50);
    expect(canApplyWormholeCycle(rolls, 'cy29').ok).toBe(false);

    rolls = setWormholeCycleCount(rolls, 'cy31', 0);
    expect(getWormholeCycleReqLevelBonus(rolls)).toBe(0);
    expect(getWormholeCycleAffixSources(rolls)).toEqual([]);
    expect(setWormholeCycleCount(rolls, 'cy31', -2)['charmCycleUses:cy31']).toBe(0);
    // non-counted cycles are ignored
    expect(setWormholeCycleCount({}, 'cy01', 3)).not.toHaveProperty('charmCycleUses:cy01');
  });

  it('clears all cycle data and keeps unrelated rolls', () => {
    let rolls = applyWormholeCycle({ unrelated: 7 }, 'cy01').rolls;
    rolls = applyWormholeCycle(rolls, 'golden').rolls;
    rolls = applyWormholeCycle(rolls, 'cy30').rolls;
    rolls = clearWormholeCycles(rolls);
    expect(rolls).toEqual({ unrelated: 7 });
    expect(hasWormholeCycles(rolls)).toBe(false);
    expect(getWormholeCycleStatTotals(rolls)).toEqual([]);
    expect(canApplyWormholeCycle(rolls, 'golden').ok).toBe(true);
  });

  it('migrates legacy applied-cycle lists into sums', () => {
    const cy01 = WORMHOLE_CYCLES.findIndex((c) => c.id === 'cy01');
    const cy05 = WORMHOLE_CYCLES.findIndex((c) => c.id === 'cy05');
    const golden = WORMHOLE_CYCLES.findIndex((c) => c.id === 'golden');
    const legacy = {
      unrelated: 7,
      charmCycleCount: 3,
      charmCycle0: cy01,
      charmCycle1: cy05,
      charmCycle2: golden,
      // old aggregate slider for "+(5 to 11) to Strength"
      'charmAffix:cycle:agg:to_strength:r0': 9,
    };
    expect(getWormholeCycleReqLevelBonus(legacy)).toBe(4);
    expect(getCharmRequiredLevel(wormhole, legacy)).toBe(104);
    const migrated = migrateWormholeCycleRolls(legacy);
    expect(migrated).not.toHaveProperty('charmCycleCount');
    expect(migrated).not.toHaveProperty('charmCycle0');
    expect(migrated.unrelated).toBe(7);
    expect(migrated.charmCycleGolden).toBe(1);
    expect(migrated['charmCycleUses:cy01']).toBe(1);
    expect(migrated['charmCycleUses:cy05']).toBe(1);
    expect(migrated['charmAffix:cycle:agg:to_strength:r0']).toBe(9);
    const totals = Object.fromEntries(getWormholeCycleStatTotals(legacy).map((t) => [t.slug, t.value]));
    expect(totals.to_strength).toBe(9);
    expect(totals.pct_to_strength).toBe(1);
    expect(totals.to_all_skills).toBe(1);
    expect(canApplyWormholeCycle(legacy, 'golden').ok).toBe(false);

    // legacy Life & Mana cycles become counts, Req. Lvl still sums all cycles
    const cy30 = WORMHOLE_CYCLES.findIndex((c) => c.id === 'cy30');
    const legacyLm = { charmCycleCount: 3, charmCycle0: cy30, charmCycle1: cy30, charmCycle2: cy01 };
    const migratedLm = migrateWormholeCycleRolls(legacyLm);
    expect(migratedLm['charmCycleUses:cy30']).toBe(2);
    expect(migratedLm['charmCycleUses:cy01']).toBe(1);
    expect(migratedLm).not.toHaveProperty('charmCycleStat:to_mana');
    expect(getWormholeCycleReqLevelBonus(legacyLm)).toBe(7);
    expect(getWormholeCycleStatTotals(legacyLm).map((t) => t.text)).toEqual(
      expect.arrayContaining(['+4 to Strength', '+45 to Mana', '+17 to Life'])
    );
    // empty legacy list migrates to nothing
    expect(migrateWormholeCycleRolls({ charmCycleCount: 0, unrelated: 1 })).toEqual({ unrelated: 1 });
  });

  it('shows summed cycle stats as charm sliders for rolled ranges', () => {
    const seeded = defaultCharmRollsForDef(wormhole);
    const applied = applyWormholeCycle(seeded, 'cy01').rolls;
    const rows = getCharmDetailStatRows(wormhole, applied);
    const strength = rows.find((r) => r.kind === 'roll' && r.stat?.key === 'charmAffix:cycle:agg:to_strength:r0');
    expect(strength).toMatchObject({ kind: 'roll', stat: { min: 3, max: 5 } });
    expect(applied['charmAffix:cycle:agg:to_strength:r0']).toBe(4);
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
