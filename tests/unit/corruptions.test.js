import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  corruptionRequiredLevelBonus,
  corruptionSlotCount,
  getCorruptionBonusLines,
  isItemCorruptible,
  listCorruptionsForItem,
  loadCorruptionsCatalog,
  corruptionIcon,
} from '@/items/corruptions.js';
import { extrasWithAppliedItemBonuses, getItemStatSections } from '@/items/item-stats.js';
import { resolveItemRequirements } from '@/items/item-requirements.js';
import { loadAffixTemplates } from '@/items/affix-templates.js';

loadAffixTemplates(JSON.parse(readFileSync(resolve('public/items/2_14/affix-templates.json'), 'utf8')));
loadCorruptionsCatalog(JSON.parse(readFileSync(resolve('public/items/2_14/corruptions.json'), 'utf8')));

describe('corruptions', () => {
  const unique = { name: 'Alnair', rarity: 'unique', uniqueKind: 'tu', category: 'weapons', slot: 'rarm' };
  const sacred = { ...unique, uniqueKind: 'su' };
  const honorific = { ...unique, rarity: 'honorific', customQuality: 'honorific' };
  const ring = { name: 'Ring', rarity: 'unique', category: 'jewelry', slot: 'rrin' };

  it('uses Corrupted Crystal inventory art', () => {
    expect(corruptionIcon()).toBe('invfrag');
  });

  it('allows two slots on sacred uniques and none on honorifics', () => {
    expect(corruptionSlotCount(unique)).toBe(1);
    expect(corruptionSlotCount(sacred)).toBe(2);
    expect(isItemCorruptible(honorific)).toBe(false);
    expect(corruptionSlotCount(honorific)).toBe(0);
  });

  it('filters jewelry restrictions', () => {
    const jewelryIds = listCorruptionsForItem(ring, 'rrin').map((row) => row.id);
    expect(jewelryIds).toContain('nothing');
    expect(jewelryIds).toContain('magicAbsorb');
    const jewelryOnlyOnWeapon = listCorruptionsForItem(unique, 'rarm').some(
      (row) => row.restriction === 'jewelry'
    );
    expect(jewelryOnlyOnWeapon).toBe(false);
  });

  it('adds req level and bonus lines', () => {
    expect(corruptionRequiredLevelBonus(['avoidDamage', 'nothing'])).toBe(1);
    expect(getCorruptionBonusLines('nothing')).toEqual([]);
    const lines = extrasWithAppliedItemBonuses([], unique, { corruptions: ['avoidDamage'] });
    expect(lines).toContain('+2% Avoid Chance');
    expect(resolveItemRequirements(unique, { corruptions: ['avoidDamage'] }).reqLevel).toBe(1);
  });

  it('marks ethereal from ethereal corruption', () => {
    const sections = getItemStatSections(
      { ...unique, defense: { min: 100, max: 100 } },
      null,
      { corruptions: ['ethereal'] }
    );
    expect(sections.base.some((line) => /Ethereal/.test(line))).toBe(true);
  });
});
