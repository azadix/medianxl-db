import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { applyClassBaselineStatsToCharacter } from '@/character/planner-core.js';
import {
  refreshCharacterStatsSnapshot,
  invalidateCharacterStats,
} from '@/character/stats-provider.js';
import { useItemsStore } from '@/stores/items.js';
import { buildPlannerStatBreakdownHtml } from '@/character/planner-stat-breakdown.js';
import { setImportedStatsSource } from '@/character/stats-provider.js';
import { mapTswItemsToSnapshot, unwrapTswOrNativeBuild } from '@/planner/tsw-build-import.js';
import { hasBuildFixture, loadBuildFixture, loadPlannerCatalog } from '../helpers/planner-catalog.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { detectCompleteItemText, setCompleteItemText } from '@/items/item-text-completeness.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('character stats provider', () => {
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

  afterEach(() => {
    setCharacterInstance(null);
  });

  it('serves Character.getStat from the bucket snapshot', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [];
    store.sets = [];
    store.catalogLoaded = true;
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Amazon');
    invalidateCharacterStats();

    const snapshot = refreshCharacterStatsSnapshot();
    expect(snapshot).toBeTruthy();
    expect(character.getStat('life')).toBe(snapshot.getValue('life'));
    expect(character.getAllStats().vitality).toBe(snapshot.getValue('vitality'));
    const html = buildPlannerStatBreakdownHtml('life');
    expect(html).toContain('Class &amp; level scaling');
    expect(html).toContain('Total');
  });

  it('rebuilds after an invalidation', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [];
    store.sets = [];
    store.catalogLoaded = true;
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Amazon');
    invalidateCharacterStats();
    const first = refreshCharacterStatsSnapshot();
    character.setRawStat('fire_resistance', 33);
    invalidateCharacterStats();
    const second = refreshCharacterStatsSnapshot();
    expect(second).not.toBe(first);
    expect(second.getValue('fire_resistance')).toBe(33);
  });

  it.skipIf(!hasBuildFixture('METST_Kriek_28_10_2026_17_22.json'))('keeps imported fixture totals as comparison values', () => {
    const planner = loadPlannerCatalog();
    const raw = loadBuildFixture('METST_Kriek_28_10_2026_17_22.json');
    const { build, tswItems } = unwrapTswOrNativeBuild(raw);
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = planner.catalog;
    store.sets = planner.sets;
    store.catalogLoaded = true;
    store.catalogVersionFolder = '2_14';
    const character = createCharacterInstance(build.class, Number(build.level) || 150);
    character.setAllSkillPoints(build.skillPoints || {});
    character.setAllOSkills(build.oSkills || []);
    store.syncViewerClassName(build.class);
    const { snapshot } = mapTswItemsToSnapshot(tswItems || [], store, build.class);
    store.fromSnapshot(snapshot);
    applyClassBaselineStatsToCharacter(build.class);
    setImportedStatsSource(build.stats, 'totals');
    invalidateCharacterStats();

    const stats = refreshCharacterStatsSnapshot();
    expect(stats.imported.life).toBe(4074);
    expect(stats.imported.mana).toBe(1963);
    expect(stats.getValue('life')).toBe(4022);
    expect(character.getStat('life')).toBe(4022);
    expect(character.getStat('mana')).toBe(1963);
    expect(character.getStat('strength')).toBe(281);
  });

  it.skipIf(!hasBuildFixture('Miss_Peeled_04_11_2026_10_45.json'))('does not add imported totals on top of calculated pools', () => {
    const planner = loadPlannerCatalog();
    const raw = loadBuildFixture('Miss_Peeled_04_11_2026_10_45.json');
    const { build, tswItems } = unwrapTswOrNativeBuild(raw);
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = planner.catalog;
    store.sets = planner.sets;
    store.catalogLoaded = true;
    store.catalogVersionFolder = '2_14';
    const character = createCharacterInstance(build.class, Number(build.level) || 150);
    character.setAllSkillPoints(build.skillPoints || {});
    character.setAllOSkills(build.oSkills || []);
    store.syncViewerClassName(build.class);
    setCompleteItemText(detectCompleteItemText(tswItems || []));
    const { snapshot } = mapTswItemsToSnapshot(tswItems || [], store, build.class);
    store.fromSnapshot(snapshot);
    applyClassBaselineStatsToCharacter(build.class);
    setImportedStatsSource(build.stats, 'base');
    invalidateCharacterStats();

    const stats = refreshCharacterStatsSnapshot();
    expect(stats.imported.life).toBe(12338);
    expect(stats.getValue('life')).toBeGreaterThan(11000);
    expect(stats.getValue('life')).toBeLessThan(13000);
    // In-game dexterity on this build is 4734; percent attributes must not multiply
    // flat item/skill attribute bonuses or this jumps to ~6300.
    expect(stats.getValue('dexterity')).toBeGreaterThan(4650);
    expect(stats.getValue('dexterity')).toBeLessThan(4800);
  });

});
