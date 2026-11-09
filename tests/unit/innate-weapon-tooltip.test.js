/** @vitest-environment jsdom */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { formatInnateDamageLines } from '@/items/innate-weapon-damage.js';
import { getItemStatLines } from '@/items/item-stats.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('innate weapon damage tooltip line', () => {
  let restoreFetch;

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('resolves the value and the character-boosted percentage', () => {
    expect(
      formatInnateDamageLines('Innate Lightning Damage: (62.0% of Dexterity)', {
        dexterity: 4734,
        innate_elemental_damage: 61,
      })
    ).toEqual(['Innate Lightning Damage: 4725 (99.8% of Dexterity)']);
  });

  it('falls back to the catalog text without character stats', () => {
    expect(formatInnateDamageLines('Innate Lightning Damage: (62.0% of Dexterity)', null)).toEqual([
      'Innate Lightning Damage: (62.0% of Dexterity)',
    ]);
  });

  it('adds the resolved line to the weapon tooltip lines', () => {
    const def = {
      id: 'test-innate-weapon',
      name: 'Test Weapon',
      category: 'weapons',
      slot: 'arms',
      group: 'Swords',
      innate: 'Innate Lightning Damage: (62.0% of Dexterity)',
    };
    const lines = getItemStatLines(def, null, {
      characterStats: { dexterity: 4734, innate_elemental_damage: 61 },
    });
    expect(lines).toContain('Innate Lightning Damage: 4725 (99.8% of Dexterity)');
  });
});
