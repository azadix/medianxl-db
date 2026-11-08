// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PlannerStatsPanel from '@/components/planner/PlannerStatsPanel.vue';
import { useItemsStore } from '@/stores/items.js';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { applyClassBaselineStatsToCharacter } from '@/character/planner-core.js';
import { invalidateCharacterStats } from '@/character/stats-provider.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('PlannerStatsPanel bucket rendering', () => {
  let restoreFetch;
  let app;
  let host;

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterAll(() => {
    if (app) app.unmount();
    host?.remove();
    setCharacterInstance(null);
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('renders class baseline values from the bucket snapshot', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useItemsStore();
    store.catalog = [];
    store.sets = [];
    store.catalogLoaded = true;
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Amazon');
    invalidateCharacterStats();

    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(PlannerStatsPanel);
    app.use(pinia);
    app.mount(host);
    await nextTick();
    await nextTick();

    const strength = host.querySelector('#planner-stat-strength');
    expect(strength).toBeTruthy();
    expect(Number(strength.value)).toBe(character.getRawStat('strength'));
    const lifeTile = host.querySelector('.planner-vital-tile.is-life strong');
    expect(lifeTile).toBeTruthy();
    const maxLife = Number(String(lifeTile.textContent || '').split('/').pop());
    expect(maxLife).toBe(character.getStat('life'));
  });
});
