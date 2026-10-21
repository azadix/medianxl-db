import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getShrineBonusLines,
  listShrinesForItem,
  loadHonorificBlessings,
  loadShrinesCatalog,
  shrineItemType,
} from '@/items/blessings.js';
import { loadAffixTemplates } from '@/items/affix-templates.js';

loadAffixTemplates(JSON.parse(readFileSync(resolve('public/items/2_14/affix-templates.json'), 'utf8')));
loadShrinesCatalog(JSON.parse(readFileSync(resolve('public/items/2_14/shrines.json'), 'utf8')));
loadHonorificBlessings(JSON.parse(readFileSync(resolve('public/items/2_14/blessings.json'), 'utf8')));

describe('blessings', () => {
  const sword = { name: 'Crystal Sword', category: 'weapons', slot: 'rarm' };

  it('classifies shrine item types', () => {
    expect(shrineItemType(sword)).toBe('1h_weapon');
    expect(shrineItemType({ category: 'jewelry', slot: 'neck' })).toBe('jewelry');
  });

  it('lists shrines for weapons and formats honorific bonuses', () => {
    expect(listShrinesForItem(sword).some((row) => row.id === 'abandoned')).toBe(true);
    const lines = getShrineBonusLines('abandoned', sword, true);
    expect(lines.some((line) => /Dexterity/i.test(line))).toBe(true);
    const shrine = getShrineBonusLines('abandoned', sword, false);
    expect(shrine.length).toBeGreaterThan(0);
  });
});
