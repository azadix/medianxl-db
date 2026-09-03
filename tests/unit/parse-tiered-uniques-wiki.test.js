/**
 * @file Parse raw wiki HTML for tiered unique stats.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseItemStats } from '../../src/items/unique-stats-catalog.js';
import { parseTieredUniquesWiki } from '../../tools/parse-tiered-uniques-wiki.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const snippet = readFileSync(
  resolve(ROOT, 'tests/fixtures/tiered-uniques-wiki-snippet.html'),
  'utf8'
);

describe('parseTieredUniquesWiki', () => {
  it('keeps br-split label/value lines for T1–T4 and jewelry', () => {
    const entries = parseTieredUniquesWiki(snippet);

    const grim = entries.filter((e) => e.name === 'Grim Fang');
    expect(grim.map((e) => e.tier).sort()).toEqual([1, 2, 3, 4]);
    expect(grim.map((e) => e.type)).toEqual([
      'Short Sword (1)',
      'Short Sword (2)',
      'Short Sword (3)',
      'Short Sword (4)',
    ]);

    const t1 = grim.find((e) => e.tier === 1);
    expect(t1.stats).toContain('One-Hand Damage:');
    expect(t1.stats).toContain('(4 - 5) to 7');
    expect(t1.stats).toMatch(/One-Hand Damage:\n\(4 - 5\) to 7/);
    expect(t1.stats).toContain('(3 to 5)% Life stolen per Hit');
    expect(t1.stats).toContain('Socketed (1)');

    const parsedT1 = parseItemStats(t1.stats);
    expect(parsedT1.reqLevel).toBe(20);
    expect(parsedT1.damage1hDisplay).toContain('4');
    expect(parsedT1.modifiers).toContain('(3 to 5)% Life stolen per Hit');

    const donner = entries.find((e) => e.name === 'Herr Donner' && e.tier === 1);
    expect(donner?.stats).toMatch(/Required Strength:\n58 to 72/);
    const parsedDonner = parseItemStats(donner.stats);
    expect(parsedDonner.reqStr).toBe(58);
    expect(parsedDonner.modifiers).not.toContain('58 to 72');

    const hangman = entries.find((e) => e.name === 'Hangman');
    expect(hangman).toBeTruthy();
    expect(hangman.tier).toBeUndefined();
    expect(hangman.type).toBe('Amulet');
    expect(hangman.stats).toContain('Item Level: 1');
    expect(hangman.stats).toContain('8% Chance to cast level 13 Magic Missiles on Death Blow');
    expect(hangman.stats).not.toMatch(/^Hangman/m);
  });
});
