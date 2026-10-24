import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAffixTemplates } from '@/items/affix-templates.js';
import { loadHonorificBlessings, loadShrinesCatalog } from '@/items/blessings.js';
import { collectShrineUpgradeSources, getItemUpgradeFlags } from '@/items/item-upgrades.js';

loadAffixTemplates(
  JSON.parse(readFileSync(resolve('public/items/2_14/affix-templates.json'), 'utf8'))
);
loadShrinesCatalog(JSON.parse(readFileSync(resolve('public/items/2_14/shrines.json'), 'utf8')));
loadHonorificBlessings(JSON.parse(readFileSync(resolve('public/items/2_14/blessings.json'), 'utf8')));

describe('item-upgrades', () => {
  it('treats craft shrine as not shrine blessed', () => {
    expect(getItemUpgradeFlags({ shrine: 'abandoned' }).shrineBlessed).toBe(false);
  });

  it('marks blessing as shrine blessed', () => {
    expect(getItemUpgradeFlags({ blessing: 'abandoned' }).shrineBlessed).toBe(true);
    expect(getItemUpgradeFlags({ shrine: 'abandoned', blessing: 'creepy' }).shrineBlessed).toBe(
      true
    );
  });

  it('keeps shrine wiki roll ranges', () => {
    const sword = { name: 'Crystal Sword', category: 'weapons', slot: 'rarm' };
    const sources = collectShrineUpgradeSources(sword, { shrine: 'abandoned' });
    expect(sources.some((row) => /\(24 to 120\)% Bonus to Attack Rating/.test(row.text))).toBe(
      true
    );
  });
});

