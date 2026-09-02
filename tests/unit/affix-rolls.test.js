import { describe, it, expect } from 'vitest';
import { parseAffixRanges, applyAffixRolls, buildAffixDisplayParts } from '@/items/affix-rolls.js';
import {
  getCharmRollableStats,
  resolveCharmAffixText,
  charmAffixRollKey,
  getCharmStatLines,
} from '@/items/charm-items.js';
import { getItemStatLines, mergeRollsForDef } from '@/items/item-stats.js';

describe('affix-rolls', () => {
  it('parses parenthetical min/max ranges', () => {
    expect(parseAffixRanges('(3 to 5)% Life stolen per Hit')).toEqual([
      expect.objectContaining({ min: 3, max: 5, raw: '(3 to 5)' }),
    ]);
    expect(parseAffixRanges('+(21 to 25) to all Attributes')).toEqual([
      expect.objectContaining({ min: 21, max: 25, raw: '+(21 to 25)' }),
    ]);
  });

  it('replaces rolled values in affix text', () => {
    const text = '+(21 to 25) to all Attributes';
    const key = charmAffixRollKey('base:m0', 0);
    const rolled = applyAffixRolls(text, { [key]: 23 }, (i) => charmAffixRollKey('base:m0', i));
    expect(rolled).toBe('+23 to all Attributes');
  });

  it('builds display parts highlighting the rolled variable', () => {
    const text = '+(21 to 25) to all Attributes';
    const key = charmAffixRollKey('base:m0', 0);
    const parts = buildAffixDisplayParts(text, { [key]: 23 }, (i) => charmAffixRollKey('base:m0', i), 0);
    expect(parts).toEqual([
      { kind: 'text', text: '+' },
      { kind: 'value', text: '23' },
      { kind: 'text', text: ' to all Attributes' },
    ]);
  });

  it('does not keep a plus sign when a signed range rolls negative', () => {
    const text = '+(-3 to 5) to Light Radius';
    const key = charmAffixRollKey('upgrade:0:2', 0);
    const rolled = applyAffixRolls(text, { [key]: -3 }, (i) => charmAffixRollKey('upgrade:0:2', i));
    expect(rolled).toBe('-3 to Light Radius');
    const parts = buildAffixDisplayParts(text, { [key]: -3 }, (i) => charmAffixRollKey('upgrade:0:2', i), 0);
    expect(parts).toEqual([
      { kind: 'value', text: '-3' },
      { kind: 'text', text: ' to Light Radius' },
    ]);
  });

  it('omits a plus sign for zero and negative signed ranges', () => {
    const text = '+(-3 to 5) to Light Radius';
    const key = charmAffixRollKey('upgrade:0:2', 0);
    expect(applyAffixRolls(text, { [key]: -3 }, (i) => charmAffixRollKey('upgrade:0:2', i))).toBe(
      '-3 to Light Radius'
    );
    expect(applyAffixRolls(text, { [key]: 0 }, (i) => charmAffixRollKey('upgrade:0:2', i))).toBe(
      '0 to Light Radius'
    );
    expect(applyAffixRolls(text, { [key]: 2 }, (i) => charmAffixRollKey('upgrade:0:2', i))).toBe(
      '+2 to Light Radius'
    );
    const zeroParts = buildAffixDisplayParts(
      text,
      { [key]: 0 },
      (i) => charmAffixRollKey('upgrade:0:2', i),
      0
    );
    expect(zeroParts).toEqual([
      { kind: 'value', text: '0' },
      { kind: 'text', text: ' to Light Radius' },
    ]);
  });
});

const horazon = {
  id: 'a68',
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
  reqLevel: 100,
  modifiers: [
    '(3 to 5)% Life stolen per Hit',
    '(3 to 5)% Mana stolen per Hit',
    '+(21 to 25) to all Attributes',
  ],
};

describe('charm affix rolls', () => {
  it('exposes sliders for each ranged affix line', () => {
    const stats = getCharmRollableStats(horazon, null, null);
    expect(stats).toHaveLength(3);
    expect(stats[0].min).toBe(3);
    expect(stats[0].max).toBe(5);
    expect(stats[0].displayParts.some((p) => p.kind === 'value')).toBe(true);
  });

  it('omits ranged affixes from static lines when hideRollableRanges is set', () => {
    const rolls = mergeRollsForDef(horazon, {
      [charmAffixRollKey('base:m0', 0)]: 4,
      [charmAffixRollKey('base:m1', 0)]: 5,
      [charmAffixRollKey('base:m2', 0)]: 22,
    });
    const lines = getCharmStatLines(horazon, 110, {
      inInventory: true,
      rolls,
      hideRollableRanges: true,
    });
    expect(lines.some((line) => line.includes('Life stolen'))).toBe(false);
    expect(lines.some((line) => line.includes('Mana stolen'))).toBe(false);
    expect(lines.some((line) => line.includes('all Attributes'))).toBe(false);
  });

  it('still resolves rolled values on rollable stats when ranges are hidden from static lines', () => {
    const rolls = mergeRollsForDef(horazon, {
      [charmAffixRollKey('base:m0', 0)]: 4,
    });
    const lines = getItemStatLines(horazon, rolls, {
      hideRollableRanges: true,
      characterLevel: 110,
      charmInInventory: true,
    });
    expect(lines.some((line) => line.includes('Life stolen'))).toBe(false);

    const stats = getCharmRollableStats(horazon, rolls, null);
    expect(stats[0].display).toBe('4% Life stolen per Hit');
    expect(stats[0].displayParts).toEqual([
      { kind: 'value', text: '4' },
      { kind: 'text', text: '% Life stolen per Hit' },
    ]);
    expect(stats[2].display).toContain('to all Attributes');
  });

  it('resolves affix text with rolls', () => {
    const key = charmAffixRollKey('base:m2', 0);
    const text = resolveCharmAffixText('+(21 to 25) to all Attributes', 'base:m2', { [key]: 24 });
    expect(text).toBe('+24 to all Attributes');
  });
});
