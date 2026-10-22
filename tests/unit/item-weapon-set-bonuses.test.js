/**
 * @file Active weapon set must own set-piece counts and set-bonus stats.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  clearItemCharacterStatBonusCaches,
  recomputePlannerStatsFromItems,
} from '@/items/item-character-stat-bonuses.js';
import { countEquippedSetPieces } from '@/items/item-overlays.js';
import {
  createCharacterInstance,
  getCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { initSkillDataStore } from '@/shared/skill-data-store.js';
import { useItemsStore } from '@/stores/items.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/** @type {(() => void) | null} */
let restoreFetch = null;

const helm = {
  id: 's:helm:wake',
  name: "Achilios' Eagle Eye",
  category: 'armor',
  slot: 'head',
  rarity: 'set',
  setId: 'set:achilios-wake',
  setName: "Achilios' Wake",
  reqLevel: 1,
  modifiers: ['+10 to Life'],
};

const weaponA = {
  id: 's:wep:wake-a',
  name: "Achilios' Ballista",
  category: 'weapons',
  slot: 'arms',
  rarity: 'set',
  setId: 'set:achilios-wake',
  setName: "Achilios' Wake",
  reqLevel: 1,
  modifiers: ['+10 to Life'],
};

const weaponB = {
  id: 's:wep:other',
  name: 'Plain Sword',
  category: 'weapons',
  slot: 'arms',
  rarity: 'unique',
  reqLevel: 1,
  modifiers: ['+5 to Life'],
};

const setDef = {
  id: 'set:achilios-wake',
  name: "Achilios' Wake",
  bonuses: [
    { required: 2, modifiers: ['+100 to Life'] },
    { required: 'complete', modifiers: ['+200 to Dexterity'] },
  ],
};

beforeEach(async () => {
  restoreFetch = installTreeDataFetchMock();
  await initSkillDataStore();
  clearItemCharacterStatBonusCaches();
  setActivePinia(createPinia());
});

afterEach(() => {
  setCharacterInstance(null);
  restoreFetch?.();
  restoreFetch = null;
  clearItemCharacterStatBonusCaches();
});

describe('weapon set set-piece counting', () => {
  it('ignores inactive weapon-set pieces for set counts and set-bonus flats', () => {
    createCharacterInstance('Amazon', 99);
    const ch = getCharacterInstance();
    const beforeLife = ch.getStat('life');
    const store = useItemsStore();
    store.catalog = [helm, weaponA, weaponB];
    store.sets = [setDef];

    store.equipment.head = store.createInstance(helm.id);
    store.equipment.rarm = store.createInstance(weaponA.id);
    store.equipment.rarm2 = store.createInstance(weaponB.id);

    store.setWeaponSet(0);
    expect(countEquippedSetPieces(store.activeEquippedDefs)['set:achilios-wake']).toBe(2);
    const tipI = store.getTooltipOptionsForDef(helm);
    expect(tipI.setBonuses?.find((b) => b.required === 2)?.active).toBe(true);

    recomputePlannerStatsFromItems(ch);
    // helm + set weapon flats (+10 each) + 2-piece set bonus (+100)
    expect(ch.getStat('life')).toBe(beforeLife + 120);

    store.setWeaponSet(1);
    expect(countEquippedSetPieces(store.activeEquippedDefs)['set:achilios-wake']).toBe(1);
    const tipII = store.getTooltipOptionsForDef(helm);
    expect(tipII.setBonuses?.find((b) => b.required === 2)?.active).toBe(false);

    recomputePlannerStatsFromItems(ch);
    // helm (+10) + plain swap weapon (+5); set bonus off
    expect(ch.getStat('life')).toBe(beforeLife + 15);
  });
});

describe('weapon set requirement stats', () => {
  it('checks each hand against stats from its own weapon set', () => {
    createCharacterInstance('Amazon', 99);
    const ch = getCharacterInstance();
    ch.setRawStat('dexterity', 50);
    const store = useItemsStore();
    const setI = {
      id: 'u:set-i:tu',
      name: 'Set I Blade',
      category: 'weapons',
      slot: 'arms',
      rarity: 'unique',
      reqLevel: 1,
      reqDex: 100,
      modifiers: ['+1 to Dexterity'],
    };
    const setII = {
      id: 'u:set-ii:tu',
      name: 'Set II Blade',
      category: 'weapons',
      slot: 'arms',
      rarity: 'unique',
      reqLevel: 1,
      reqDex: 100,
      modifiers: ['+200 to Dexterity'],
    };
    store.catalog = [setI, setII];
    store.catalogLoaded = true;
    store.equipment.rarm = store.createInstance(setI.id);
    store.equipment.rarm2 = store.createInstance(setII.id);
    store.setWeaponSet(0);
    recomputePlannerStatsFromItems(ch);

    expect(store.equipmentSlotMeetsRequirements('rarm')).toBe(false);
    expect(store.equipmentSlotMeetsRequirements('rarm2')).toBe(true);
    const unmet = store.listUnmetEquippedItems();
    expect(unmet.some((row) => row.name === setI.name)).toBe(true);
    expect(unmet.some((row) => row.name === setII.name)).toBe(false);
    expect(store.weaponSet).toBe(0);
  });
});
