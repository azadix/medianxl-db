/**
 * Eligible grey bases for wiki parent types vs the 2.14 catalog.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  listEligibleRunewordBases,
  mergeRunewordWithBase,
  runewordEntryToItemDef,
  runewordTemplateAllowsBase,
} from '@/items/runeword-items.js';

const ROOT = resolve(import.meta.dirname, '../..');
const runewords = JSON.parse(
  readFileSync(resolve(ROOT, 'public/items/2_14/runewords.json'), 'utf8')
);
const baseitems = JSON.parse(readFileSync(resolve(ROOT, 'public/items/2_14/baseitems.json'), 'utf8'));
const entries = Array.isArray(runewords) ? runewords : runewords.entries || [];

/**
 * @param {string} name
 * @returns {object}
 */
function template(name) {
  const entry = entries.find((row) => row.name === name);
  expect(entry, `missing runeword ${name}`).toBeTruthy();
  return runewordEntryToItemDef(entry);
}

/**
 * @param {string} name
 * @returns {string[]}
 */
function groups(name) {
  return [
    ...new Set(listEligibleRunewordBases(template(name), baseitems).map((base) => String(base.group))),
  ].sort();
}

describe('runeword wiki type families', () => {
  it('Honor includes circlets and class helms', () => {
    const got = groups('Honor');
    expect(got).toEqual(expect.arrayContaining(['Helms', 'Circlets', 'Amazon Helms', 'Barbarian Helms']));
  });

  it('Lionheart includes sorceress body armors', () => {
    const got = groups('Lionheart');
    expect(got).toEqual(expect.arrayContaining(['Body Armors', 'Sorceress Body Armors']));
  });

  it('Hive includes amazon and druid bows', () => {
    const got = groups('Hive');
    expect(got).toEqual(expect.arrayContaining(['Bows', 'Amazon Bows', 'Druid Bows']));
  });

  it('Pax Mystica includes class staves', () => {
    const got = groups('Pax Mystica');
    expect(got).toEqual(expect.arrayContaining(['Staves', 'Druid Staves', 'Necromancer Staves']));
  });

  it('Shark still excludes assassin claws', () => {
    const got = groups('Shark');
    expect(got).toContain('One-Handed Swords');
    expect(got).not.toContain('Assassin Claws');
    expect(got).not.toContain('Necromancer Daggers');
  });

  it('excludes mastercrafted bases such as Maiden Bow from Amok', () => {
    const amok = template('Amok');
    const names = listEligibleRunewordBases(amok, baseitems).map((b) => String(b.name));
    expect(names).not.toContain('Maiden Bow');
    expect(names).not.toContain('Kukri');
    const maiden = baseitems.find((b) => b.name === 'Maiden Bow');
    const kukri = baseitems.find((b) => b.name === 'Kukri');
    expect(runewordTemplateAllowsBase(amok, maiden)).toBe(false);
    expect(mergeRunewordWithBase(amok, maiden)).toBeNull();
    const shark = template('Shark');
    expect(runewordTemplateAllowsBase(shark, kukri)).toBe(false);
  });

  it('Throwing Axes runewords include Throwing Axe and Balanced Axe greys', () => {
    const bases = listEligibleRunewordBases(template('Cheetah'), baseitems);
    const names = bases.map((b) => String(b.name));
    expect(names.some((n) => n.startsWith('Throwing Axe'))).toBe(true);
    expect(names.some((n) => n.startsWith('Balanced Axe'))).toBe(true);
    expect(groups('Cheetah')).toEqual(
      expect.arrayContaining(['Throwing Axes', 'Barbarian Throwing Axes'])
    );
  });
});
