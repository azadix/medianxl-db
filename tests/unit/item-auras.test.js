import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { resolveModifierLines } from '@/items/item-modifier-resolver.js';
import { buildItemAuraContributions, parseItemAuraGrant } from '@/items/item-auras.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/**
 * Nephalem Weapons (level 10) is an item passive: 5% innate elemental damage plus fire
 * and lightning damage to weapons from 20-30% of base Strength + Dexterity and
 * 10-15% of base Vitality.
 */
describe('item auras', () => {
  let restoreFetch;
  const character = {
    getRawStat: (key) =>
      ({ strength: 70, dexterity: 1160, vitality: 15, energy: 15 })[key] ?? 0,
  };
  const silksLike = [
    '{orange}Level 10 Nephalem Weapons',
    '{grey}5% Innate Elemental Damage',
    '{grey}Adds Fire and Lightning Damage:',
    '{grey}20-30% of base Strength and Dexterity',
    '{grey}10-15% of base Vitality',
    '+1 to All Skills',
  ];

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('parses the aura grant line', () => {
    expect(parseItemAuraGrant('Level 10 Nephalem Weapons')).toMatchObject({
      name: 'Nephalem Weapons',
      level: 10,
    });
    expect(parseItemAuraGrant('Level 20 Nephalem Weapons')).toBeNull();
    expect(parseItemAuraGrant('Level 10 Something Else')).toBeNull();
  });

  it('marks the aura block as supported instead of unique/unsupported', () => {
    const resolved = resolveModifierLines(silksLike, { sourceId: 'silks', label: 'Silks' });
    expect(resolved.auras).toHaveLength(1);
    expect(resolved.uniqueMods).toHaveLength(0);
    for (const line of [
      'Level 10 Nephalem Weapons',
      '5% Innate Elemental Damage',
      'Adds Fire and Lightning Damage:',
      '20-30% of base Strength and Dexterity',
      '10-15% of base Vitality',
    ]) {
      const report = resolved.reports.find((row) => row.text === line);
      expect(report?.reason).toBe('item-aura');
    }
    // The block's 5% innate line must not be counted separately from the aura.
    expect(resolved.contributions.some((c) => c.stat === 'innate_elemental_damage')).toBe(
      false
    );
  });

  it('adds 5% innate and level-10 fire/lightning from base attributes', () => {
    const resolved = resolveModifierLines(silksLike, { sourceId: 'silks', label: 'Silks' });
    const byStat = Object.fromEntries(
      buildItemAuraContributions(resolved.auras, character).map((c) => [c.stat, c.value])
    );
    expect(byStat).toEqual({
      innate_elemental_damage: 5,
      minimum_fire_damage: 247,
      maximum_fire_damage: 371,
      minimum_lightning_damage: 247,
      maximum_lightning_damage: 371,
    });
  });
});
