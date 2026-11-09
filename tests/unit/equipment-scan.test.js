import { describe, expect, it } from 'vitest';
import {
  countEquippedJewels,
  countJewelsInSocketables,
  doublesOwnJewelCount,
  hasEquippedShield,
  listActiveEquippedInstances,
} from '@/items/equipment-scan.js';

/**
 * @param {{
 *   equipment?: Record<string, unknown>,
 *   instances?: Record<string, object>,
 *   defs?: Record<string, object>,
 *   active?: (slot: string) => boolean,
 * }} [options]
 */
function makeStore({ equipment = {}, instances = {}, defs = {}, active = () => true } = {}) {
  return {
    equipment,
    instances,
    getDefForInstance: (id) => defs[id] ?? null,
    equipmentSlotContributesBonuses: (slot) => active(slot),
  };
}

const JEWEL = { name: 'Jewel', type: 'Jewel', code: 'jew' };
const RUNE = { name: 'Ral', type: 'Rune', code: 'r07' };

describe('equipment scan', () => {
  it('counts jewels in active equipment only', () => {
    const store = makeStore({
      equipment: { head: 'h1', tors: 't1', rarm2: 'w2' },
      instances: {
        h1: { socketables: [JEWEL, RUNE] },
        t1: { socketables: [JEWEL] },
        w2: { socketables: [JEWEL] },
      },
      active: (slot) => slot !== 'rarm2',
    });
    expect(countEquippedJewels(store)).toBe(2);
  });

  it('does not count runes or gems as jewels', () => {
    const store = makeStore({
      equipment: { head: 'h1' },
      instances: { h1: { socketables: [RUNE, { name: 'Perfect Ruby', type: 'Gem', code: 'gpr' }] } },
    });
    expect(countEquippedJewels(store)).toBe(0);
  });

  it('detects an equipped shield', () => {
    const store = makeStore({
      equipment: { larm: 's1' },
      defs: { s1: { group: 'Shields' } },
    });
    expect(hasEquippedShield(store)).toBe(true);
  });

  it('ignores a shield in an inactive weapon set', () => {
    const store = makeStore({
      equipment: { larm2: 's2' },
      defs: { s2: { group: 'Shields' } },
      active: (slot) => slot !== 'larm2',
    });
    expect(hasEquippedShield(store)).toBe(false);
  });

  it('counts jewels within one socket list', () => {
    expect(countJewelsInSocketables([JEWEL, RUNE, JEWEL])).toBe(2);
    expect(countJewelsInSocketables(null)).toBe(0);
  });

  it('detects the Jeweled Crown jewel-doubling modifier', () => {
    expect(
      doublesOwnJewelCount({
        modifiers: ['{grey}(Doubled for Jewels socketed in the Crown itself)'],
      })
    ).toBe(true);
    expect(doublesOwnJewelCount({ modifiers: ['+2 to Amazon Skill Levels'] })).toBe(false);
    expect(doublesOwnJewelCount(null)).toBe(false);
  });

  it('handles a missing store', () => {
    expect(listActiveEquippedInstances(null)).toEqual([]);
    expect(countEquippedJewels(null)).toBe(0);
    expect(hasEquippedShield(undefined)).toBe(false);
  });
});
