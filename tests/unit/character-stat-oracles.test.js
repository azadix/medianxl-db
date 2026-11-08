import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import { createCharacterInstance } from '@/character/planner-instance.js';
import { applyClassBaselineStatsToCharacter } from '@/character/planner-core.js';
import { mapTswItemsToSnapshot, unwrapTswOrNativeBuild } from '@/planner/tsw-build-import.js';
import { detectCompleteItemText, setCompleteItemText } from '@/items/item-text-completeness.js';
import { initSkillDataStore } from '@/shared/skill-data-store.js';
import { invalidateCharacterStats, refreshCharacterStatsSnapshot } from '@/character/stats-provider.js';
import { loadBuildFixture, loadPlannerCatalog } from '../helpers/planner-catalog.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const ATTRS = ['strength', 'dexterity', 'vitality', 'energy', 'life', 'mana'];

async function computeState({ filter, strength = 70 }) {
  const planner = loadPlannerCatalog();
  installTreeDataFetchMock();
  await initSkillDataStore();
  const raw = loadBuildFixture('Miss_Peeled_04_11_2026_10_45.json');
  const { build, tswItems } = unwrapTswOrNativeBuild(raw);
  const rows = (tswItems || []).filter(filter);
  setActivePinia(createPinia());
  const store = useItemsStore();
  store.catalog = planner.catalog;
  store.sets = planner.sets;
  store.catalogLoaded = true;
  store.catalogVersionFolder = '2_14';
  const character = createCharacterInstance(build.class, 150);
  store.syncViewerClassName(build.class);
  setCompleteItemText(detectCompleteItemText(tswItems || []));
  const { snapshot } = mapTswItemsToSnapshot(rows, store, build.class);
  store.fromSnapshot(snapshot);
  applyClassBaselineStatsToCharacter(build.class);
  character.setStat('strength', strength);
  character.setStat('dexterity', 35);
  character.setStat('vitality', 15);
  character.setStat('energy', 15);
  invalidateCharacterStats();
  const stats = refreshCharacterStatsSnapshot();
  return Object.fromEntries(ATTRS.map((key) => [key, stats.getValue(key)]));
}

const charms = (row) => row.location === 'Inventory' && row.is_charm === true;
const item = (name) => (row) => row.location === 'Gear' && row.display_name === name;
const withCharms = (name) => (row) => charms(row) || item(name)(row);

describe('character stat game oracles', () => {
  it('matches the charms-only baseline', async () => {
    expect(await computeState({ filter: charms })).toEqual({
      strength: 614, dexterity: 755, vitality: 437, energy: 431, life: 8916, mana: 3161,
    });
  });

  it('matches Lacuni Cowl alone', async () => {
    expect(await computeState({ filter: withCharms('Lacuni Cowl') })).toEqual({
      strength: 638, dexterity: 781, vitality: 462, energy: 452, life: 9015, mana: 3242,
    });
  });

  it('matches Light Gauntlets alone', async () => {
    expect(await computeState({ filter: withCharms('Light Gauntlets (Angelic)') })).toEqual({
      strength: 692, dexterity: 874, vitality: 518, energy: 515, life: 9442, mana: 3533,
    });
  });

  it('matches Mekanism alone', async () => {
    expect(await computeState({ filter: withCharms('Mekanism') })).toEqual({
      strength: 614, dexterity: 885, vitality: 437, energy: 431, life: 9436, mana: 3161,
    });
  });

  it('matches the Amulet alone', async () => {
    expect(await computeState({ filter: withCharms('Amulet') })).toEqual({
      strength: 614, dexterity: 755, vitality: 489, energy: 431, life: 9033, mana: 3523,
    });
  });

  it('matches Silks of the Victor alone', async () => {
    expect(await computeState({ filter: withCharms('Silks of the Victor'), strength: 145 })).toEqual({
      strength: 756, dexterity: 856, vitality: 461, energy: 455, life: 10274, mana: 3215,
    });
  });

  it('matches Light Plated Boots alone', async () => {
    expect(await computeState({ filter: withCharms('Light Plated Boots (Angelic)'), strength: 145 })).toEqual({
      strength: 805, dexterity: 931, vitality: 510, energy: 504, life: 9080, mana: 3325,
    });
  });

  it('matches the full active set and ignores the inactive weapon swap', async () => {
    const full = await computeState({ filter: (row) => row.location === 'Gear' || charms(row) });
    const noSwap = await computeState({
      filter: (row) => (row.location === 'Gear' && row.slot !== 'RightHandAlternate') || charms(row),
    });
    expect(full).toEqual({
      strength: 843, dexterity: 1606, vitality: 725, energy: 665, life: 11825, mana: 4457,
    });
    expect(noSwap).toEqual(full);
  });
});
