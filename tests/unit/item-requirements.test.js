/**
 * @file Tests for effective item requirements (Requirements -%).
 */
import { describe, expect, it } from 'vitest';
import {
  formatItemRequirementsLine,
  parseRequirementsReductionPct,
  resolveItemRequirements,
} from '@/items/item-requirements.js';
import { overlayAffixRollKey } from '@/items/item-overlays.js';

describe('parseRequirementsReductionPct', () => {
  it('parses flat Requirements -N%', () => {
    expect(parseRequirementsReductionPct('Requirements -20%')).toBe(20);
    expect(parseRequirementsReductionPct('Requirements -50%')).toBe(50);
  });

  it('parses Requirements Reduced by N%', () => {
    expect(parseRequirementsReductionPct('Requirements Reduced by 15%')).toBe(15);
  });

  it('uses the midpoint of an unresolved range', () => {
    expect(parseRequirementsReductionPct('Requirements -(40 to 50)%')).toBe(45);
  });

  it('ignores unrelated reduced-by lines', () => {
    expect(parseRequirementsReductionPct('Physical Damage Taken Reduced by 20')).toBe(0);
    expect(parseRequirementsReductionPct('+20% Enhanced Defense')).toBe(0);
  });
});

describe('resolveItemRequirements', () => {
  it('uses catalog reqs when there is no reduction', () => {
    expect(
      resolveItemRequirements({
        reqLevel: 90,
        reqStr: 460,
        reqDex: 0,
      })
    ).toEqual({ reqLevel: 90, reqStr: 460, reqDex: 0, reductionPct: 0 });
  });

  it('reduces str and dex from Requirements -% on a unique', () => {
    expect(
      resolveItemRequirements({
        rarity: 'unique',
        baseId: 'base',
        reqLevel: 90,
        reqStr: 460,
        reqDex: 100,
        modifiers: ['Requirements -20%'],
      })
    ).toEqual({ reqLevel: 90, reqStr: 368, reqDex: 80, reductionPct: 20 });
  });

  it('applies a rolled Requirements range', () => {
    const def = {
      rarity: 'unique',
      baseId: 'base',
      reqStr: 100,
      reqDex: 80,
      reqLevel: 90,
      modifiers: ['Requirements -(40 to 50)%'],
    };
    const key = overlayAffixRollKey('base:m0', 0);
    expect(resolveItemRequirements(def, { rolls: { [key]: 40 } })).toEqual({
      reqLevel: 90,
      reqStr: 60,
      reqDex: 48,
      reductionPct: 40,
    });
  });

  it('raises level from socketables and stacks extra reduction', () => {
    expect(
      resolveItemRequirements(
        { reqLevel: 12, reqStr: 100, reqDex: 50 },
        {
          socketables: [
            { reqLevel: 25, modifiers: ['Requirements -10%'] },
            { reductionPct: 5 },
          ],
        }
      )
    ).toEqual({ reqLevel: 25, reqStr: 85, reqDex: 42, reductionPct: 15 });
  });
});

describe('formatItemRequirementsLine', () => {
  it('joins present reqs into one line', () => {
    expect(
      formatItemRequirementsLine({ reqLevel: 90, reqStr: 368, reqDex: 0, reductionPct: 20 })
    ).toBe('Requires: Level 90, 368 Strength');
    expect(
      formatItemRequirementsLine({ reqLevel: 0, reqStr: 0, reqDex: 60, reductionPct: 0 })
    ).toBe('Requires: 60 Dexterity');
    expect(formatItemRequirementsLine({ reqLevel: 0, reqStr: 0, reqDex: 0, reductionPct: 0 })).toBe(
      ''
    );
  });
});
