/**
 * Parse raw wiki HTML for runeword templates.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseAllowedTypesCell,
  parseRunewordNameCell,
  parseRunewordsWiki,
  resolveRunes,
  splitRuneCode,
} from '../../tools/item_generation/parse-runewords-wiki.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const snippet = readFileSync(resolve(ROOT, 'tests/fixtures/runewords-wiki-snippet.html'), 'utf8');

describe('parseRunewordsWiki', () => {
  it('parses name, recipe, types, class restriction, and modifiers', () => {
    const entries = parseRunewordsWiki(snippet);

    const shark = entries.find((e) => e.name === 'Shark');
    expect(shark).toBeTruthy();
    expect(shark.id).toBe('rw:shark');
    expect(shark.runeCode).toBe('Eld');
    expect(shark.runes).toEqual(['Eld']);
    expect(shark.reqLevel).toBe(8);
    expect(shark.allowedTypes).toEqual(['Weapons']);
    expect(shark.excludedTypes).toEqual(['Necromancer Daggers', 'Assassin Claws']);
    expect(shark.excludedNames).toEqual([]);
    expect(shark.modifiers).toContain('5% Chance to cast level 9 Bloodlust on Kill');
    expect(shark.modifiers).toContain('20% Attack Speed');

    const hive = entries.find((e) => e.name === 'Hive');
    expect(hive.runes).toEqual(['Ber', 'Ber', 'Ist']);
    expect(hive.allowedTypes).toEqual(['Bows']);

    const lunar = entries.find((e) => e.name === 'Lunar Fury');
    expect(lunar.classRestriction).toBe('Druid Only');
    expect(lunar.excludedNames).toEqual(['Tyrannical Blades']);
    expect(lunar.modifiers).toContain('{orange}+200% Enhanced Weapon Damage');
    expect(lunar.modifiers).toContain('+(3 to 4) to Druid Skill Levels');
    expect(lunar.modifiers).not.toContain('(Druid Only)');

    const minefield = entries.find((e) => e.name === 'Minefield');
    expect(minefield.runes).toEqual(['Ign', 'Tyr', 'Ral', 'Ohm']);
    expect(minefield.excludedTypes).toEqual(['Two-Handed Swords']);
    expect(minefield.modifiers).toContain('{orange}If you have 90% Fire Resist: +50% Fire Spell Damage');
  });

  it('merges duplicate name+recipe listings', () => {
    const entries = parseRunewordsWiki(snippet);
    const demhe = entries.filter((e) => e.name === 'Demhe');
    expect(demhe).toHaveLength(1);
    expect(demhe[0].allowedTypes.sort()).toEqual(['Maces', 'Scepters']);
    expect(demhe[0].excludedTypes).toEqual(['Hammers']);
  });
});

describe('runeword wiki cell helpers', () => {
  it('parses name cells and rune codes', () => {
    expect(parseRunewordNameCell("Shark<br>'Eld'")).toEqual({ name: 'Shark', runeCode: 'Eld' });
    expect(splitRuneCode('BerBerIst')).toEqual(['Ber', 'Ber', 'Ist']);
    expect(resolveRunes('GhalGhal', '2x Ghal Rune')).toEqual(['Ghal', 'Ghal']);
    expect(resolveRunes('', '2x Ber Rune Ist Rune')).toEqual(['Ber', 'Ber', 'Ist']);
  });

  it('splits allowed types and except clauses', () => {
    const parsed = parseAllowedTypesCell(
      'Weapons (except Necromancer Daggers) (except Assassin Claws)'
    );
    expect(parsed.allowedTypes).toEqual(['Weapons']);
    expect(parsed.excludedTypes).toEqual(['Necromancer Daggers', 'Assassin Claws']);
    expect(
      parseAllowedTypesCell('One-Handed Swords (except Tyrannical Blades)').excludedNames
    ).toEqual(['Tyrannical Blades']);
  });
});
