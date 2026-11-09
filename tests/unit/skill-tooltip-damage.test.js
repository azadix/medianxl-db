/** @vitest-environment jsdom */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import {
  buildFixedLevelSkillTooltipHtml,
  resetFixedLevelSkillTooltipCacheForTests,
} from '@/skills/fixed-level-skill-tooltip.js';
import { useItemsStore } from '@/stores/items.js';
import { createCharacterInstance, setCharacterInstance } from '@/character/planner-instance.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('skill tooltip damage', () => {
  let restoreFetch;

  beforeAll(async () => {
    setActivePinia(createPinia());
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterEach(() => {
    setCharacterInstance(null);
    if (typeof window !== 'undefined') window.history.pushState({}, '', '/');
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('adds the damage summary to a damaging skill tooltip', async () => {
    resetFixedLevelSkillTooltipCacheForTests();
    const html = await buildFixedLevelSkillTooltipHtml('annihilation', 20);
    expect(html).toContain('tooltip-damage');
    expect(html).toContain('tooltip-damage-type is-fire');
    expect(html).toContain('tooltip-damage-value');
  });

  it('omits the block for a non-damaging skill', async () => {
    resetFixedLevelSkillTooltipCacheForTests();
    const html = await buildFixedLevelSkillTooltipHtml('teleport', 1);
    expect(html).not.toContain('tooltip-damage-row');
  });

  it('shows the equipped weapon range for attack skills in the planner', async () => {
    window.history.pushState({}, '', '/planner');
    const itemsStore = useItemsStore();
    const weapon = {
      id: 'test-sword',
      name: 'Test Sword',
      group: 'Swords',
      category: 'weapons',
      damage1h: { min: 41, max: 43 },
      strDamageBonus: 0.1,
    };
    itemsStore.catalog = [weapon];
    itemsStore.catalogById = { 'test-sword': weapon };
    itemsStore.equipment = { rarm: 'i1' };
    itemsStore.instances = { i1: { defId: 'test-sword' } };
    setCharacterInstance(createCharacterInstance('Barbarian', 150));

    resetFixedLevelSkillTooltipCacheForTests();
    const html = await buildFixedLevelSkillTooltipHtml('carnage', 20);
    expect(html).toContain('tooltip-damage');
    // 100%... Carnage is 145% weapon damage: 41-43 × 1.45.
    expect(html).toContain('tooltip-damage-value');
    expect(html).toContain('59 – 62');
    expect(html).not.toContain('Weapon damage');
  });
});
