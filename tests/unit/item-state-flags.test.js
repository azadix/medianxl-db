/**
 * @file Item upgrade/state flag ordering and colors.
 */
import { describe, expect, it } from 'vitest';
import {
  collectItemStateFlagLines,
  encodeItemStateFlagLine,
  isItemStateFlagLine,
  stripItemStateFlagLines,
} from '../../src/items/item-state-flags.js';
import { getItemDetailStatRows, getItemStatSections } from '../../src/items/item-stats.js';
import { modifierLineCssClass } from '../../src/items/item-modifier-line.js';

describe('item state flags', () => {
  it('matches known flags and rejects affixes like Cannot Be Frozen', () => {
    expect(isItemStateFlagLine('Corrupted')).toBe(true);
    expect(isItemStateFlagLine('{orange}Orb Effects Applied to this Item are Doubled')).toBe(true);
    expect(isItemStateFlagLine('Cannot be Crafted (Shrines will be lost)')).toBe(true);
    expect(isItemStateFlagLine('Cannot Be Frozen')).toBe(false);
    expect(isItemStateFlagLine('+1 to All Skills')).toBe(false);
  });

  it('encodes each flag with its canonical color', () => {
    expect(encodeItemStateFlagLine('Ethereal')).toBe('{grey}Ethereal');
    expect(encodeItemStateFlagLine('Corrupted')).toBe('{red}Corrupted');
    expect(encodeItemStateFlagLine('Already Upgraded')).toBe('{green}Already Upgraded');
    expect(encodeItemStateFlagLine('{orange}Orb Effects Applied to this Item are Quadrupled')).toBe(
      '{darkgreen}Orb Effects Applied to this Item are Quadrupled'
    );
    expect(encodeItemStateFlagLine('Cannot be Renewed')).toBe('{orange}Cannot be Renewed');
    expect(encodeItemStateFlagLine('Cannot be Crafted (Shrines will be lost)')).toBe(
      '{orange}Cannot be Crafted (Shrines will be lost)'
    );
    expect(modifierLineCssClass('{red}Corrupted')).toBe('item-mod--red');
    expect(modifierLineCssClass('{green}Already Upgraded')).toBe('item-mod--green');
    expect(modifierLineCssClass('{darkgreen}Orb Effects Applied to this Item are Doubled')).toBe(
      'item-mod--darkgreen'
    );
  });

  it('collects flags in fixed order and dedupes across sources', () => {
    expect(
      collectItemStateFlagLines({
        ethereal: true,
        corrupted: true,
        modifiers: [
          'Already Upgraded',
          '{orange}Orb Effects Applied to this Item are Doubled',
          'Cannot be Renewed',
          'Cannot Be Frozen',
        ],
        extras: [
          'Corrupted',
          'Already Upgraded',
          'Cannot be Crafted (Shrines will be lost)',
          '+14 Spell Focus',
        ],
      })
    ).toEqual([
      '{grey}Ethereal',
      '{red}Corrupted',
      '{green}Already Upgraded',
      '{darkgreen}Orb Effects Applied to this Item are Doubled',
      '{orange}Cannot be Renewed',
      '{orange}Cannot be Crafted (Shrines will be lost)',
    ]);
  });

  it('strips flag lines from extras lists', () => {
    expect(
      stripItemStateFlagLines([
        'Already Upgraded',
        '+14 Spell Focus',
        'Corrupted',
        '+1% to Experience Gained',
      ])
    ).toEqual(['+14 Spell Focus', '+1% to Experience Gained']);
  });
});

describe('getItemStatSections state flags', () => {
  it('puts Orb Effects in base as darkgreen and not in mods', () => {
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
    expect(sections.base).toContain('{darkgreen}Orb Effects Applied to this Item are Doubled');
    expect(sections.mods).not.toContain('Orb Effects Applied to this Item are Doubled');
    expect(sections.mods).not.toContain('{orange}Orb Effects Applied to this Item are Doubled');
    expect(sections.mods).toContain('2% Reanimate as: Undead Marksman');
    expect(sections.mods).toEqual(
      expect.arrayContaining(['{added}+14 Spell Focus', '{added}+1% to Experience Gained'])
    );
  });

  it('groups instance and extra flags with Ethereal in fixed order', () => {
    const sections = getItemStatSections(
      {
        rarity: 'unique',
        uniqueKind: 'su',
        ethereal: true,
        corrupted: true,
        modifiers: [
          '{grey}Ethereal',
          '{orange}Orb Effects Applied to this Item are Quadrupled',
          '50% Movement Speed',
        ],
      },
      null,
      {
        extras: ['Already Upgraded', 'Cannot be Renewed', '+25% Bonus to Defense'],
      }
    );
    expect(sections.base).toEqual([
      '{grey}Ethereal',
      '{red}Corrupted',
      '{green}Already Upgraded',
      '{darkgreen}Orb Effects Applied to this Item are Quadrupled',
      '{orange}Cannot be Renewed',
    ]);
    expect(sections.mods).toContain('50% Movement Speed');
    expect(sections.mods).toContain('{added}+25% Bonus to Defense');
    expect(sections.mods).not.toEqual(expect.arrayContaining(['{added}Already Upgraded']));
    expect(sections.mods).not.toEqual(expect.arrayContaining(['{added}Cannot be Renewed']));
  });

  it('keeps a single Ethereal line when modifiers also list it', () => {
    const sections = getItemStatSections({
      rarity: 'unique',
      uniqueKind: 'su',
      ethereal: true,
      modifiers: ['{grey}Ethereal', '50% Movement Speed', '{orange}Celeri Caelesti Iustitia'],
    });
    const ethereal = [...sections.base, ...sections.scaling, ...sections.mods].filter((line) =>
      /Ethereal/i.test(line)
    );
    expect(ethereal).toEqual(['{grey}Ethereal']);
    expect(sections.mods).toContain('{orange}Celeri Caelesti Iustitia');
  });
});

describe('getItemDetailStatRows state flags', () => {
  it('shows extras-only flags in the base section of the picker', () => {
    const rows = getItemDetailStatRows(
      {
        rarity: 'unique',
        uniqueKind: 'su',
        baseId: 'cap',
        modifiers: ['+1 to All Skills'],
      },
      null,
      {
        extras: ['Already Upgraded', 'Cannot be Crafted (Shrines will be lost)', '+14 Spell Focus'],
      }
    );
    const baseTexts = rows.filter((r) => r.section === 'base' && r.kind === 'text').map((r) => r.text);
    const modTexts = rows.filter((r) => r.section === 'mod' && r.kind === 'text').map((r) => r.text);
    expect(baseTexts).toContain('{green}Already Upgraded');
    expect(baseTexts).toContain('{orange}Cannot be Crafted (Shrines will be lost)');
    expect(modTexts).toContain('{added}+14 Spell Focus');
    expect(modTexts).not.toEqual(expect.arrayContaining(['{added}Already Upgraded']));
  });
});
