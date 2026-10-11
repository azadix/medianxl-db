/**
 * @file Tests for raising planner str/dex to item requirements.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  createCharacterInstance,
  getCharacterInstance,
  setCharacterInstance,
  raiseCharacterStatsForItemReq,
} from '@/character/planner-instance.js';
import { initSkillDataStore } from '@/shared/skill-data-store.js';
import { useItemsStore } from '@/stores/items.js';
import {
  getPlannerAutoMatchHighestStatRequirements,
  setPlannerAutoMatchHighestStatRequirements,
} from '@/planner/planner-options.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const heavyWeapon = {
  id: 'u:heavy-weapon:tu',
  name: 'Heavy Weapon',
  type: 'swor',
  category: 'weapons',
  slot: 'arms',
  rarity: 'unique',
  uniqueKind: 'tiered',
  reqLevel: 50,
  reqStr: 200,
  reqDex: 80,
  invWidth: 1,
  invHeight: 3,
};

const dexWeapon = {
  id: 'u:dex-weapon:tu',
  name: 'Dex Weapon',
  type: 'bow',
  category: 'weapons',
  slot: 'arms',
  rarity: 'unique',
  uniqueKind: 'tiered',
  reqLevel: 40,
  reqStr: 50,
  reqDex: 150,
  invWidth: 2,
  invHeight: 3,
};

/** @type {(() => void) | null} */
let restoreFetch = null;

beforeEach(async () => {
  restoreFetch = installTreeDataFetchMock();
  await initSkillDataStore();
});

afterEach(() => {
  setCharacterInstance(null);
  setPlannerAutoMatchHighestStatRequirements(true);
  restoreFetch?.();
  restoreFetch = null;
});

describe('raiseCharacterStatsForItemReq', () => {
  it('raises strength and dexterity and does not lower them later', () => {
    createCharacterInstance('Amazon', 1);
    const ch = getCharacterInstance();
    ch.setStat('strength', 10);
    ch.setStat('dexterity', 10);

    expect(raiseCharacterStatsForItemReq({ reqStr: 200, reqDex: 80 })).toBe(true);
    expect(ch.getStat('strength')).toBe(200);
    expect(ch.getStat('dexterity')).toBe(80);

    expect(raiseCharacterStatsForItemReq({ reqStr: 50, reqDex: 40 })).toBe(false);
    expect(ch.getStat('strength')).toBe(200);
    expect(ch.getStat('dexterity')).toBe(80);
  });
});

describe('equipFromPicker raises stats when option is on', () => {
  /** @type {ReturnType<typeof useItemsStore>} */
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useItemsStore();
    store.catalog = [heavyWeapon, dexWeapon];
    store.catalogLoaded = true;
    createCharacterInstance('Assassin', 1);
    const ch = getCharacterInstance();
    ch.setStat('strength', 20);
    ch.setStat('dexterity', 20);
    setPlannerAutoMatchHighestStatRequirements(true);
  });

  it('defaults the auto-match option to on', () => {
    localStorage.removeItem('medianxl-planner-auto-match-highest-stat-requirements');
    expect(getPlannerAutoMatchHighestStatRequirements()).toBe(true);
  });

  it('sets strength and dexterity to the equipped item requirements', () => {
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(heavyWeapon.id)).toBe(true);
    expect(getCharacterInstance().getStat('strength')).toBe(200);
    expect(getCharacterInstance().getStat('dexterity')).toBe(80);
  });

  it('keeps the highest requirements across equipped items', () => {
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(heavyWeapon.id)).toBe(true);
    store.selectSlot({ location: 'equipment', slot: 'larm' });
    expect(store.equipFromPicker(dexWeapon.id)).toBe(true);
    expect(getCharacterInstance().getStat('strength')).toBe(200);
    expect(getCharacterInstance().getStat('dexterity')).toBe(150);
  });

  it('does not raise stats when the option is off', () => {
    setPlannerAutoMatchHighestStatRequirements(false);
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(heavyWeapon.id)).toBe(true);
    expect(getCharacterInstance().getStat('strength')).toBe(20);
    expect(getCharacterInstance().getStat('dexterity')).toBe(20);
  });
});

describe('fromSnapshot does not raise stats for item reqs', () => {
  /** @type {ReturnType<typeof useItemsStore>} */
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useItemsStore();
    store.catalog = [heavyWeapon];
    store.catalogLoaded = true;
    createCharacterInstance('Assassin', 20);
    const ch = getCharacterInstance();
    ch.setStat('strength', 20);
    ch.setStat('dexterity', 20);
    setPlannerAutoMatchHighestStatRequirements(true);
  });

  it('keeps character stats and leaves unmet gear equipped', () => {
    const report = store.fromSnapshot({
      equipment: { rarm: { defId: heavyWeapon.id } },
    });

    expect(getCharacterInstance().getStat('strength')).toBe(20);
    expect(getCharacterInstance().getStat('dexterity')).toBe(20);
    expect(store.equipment.rarm).not.toBeNull();
    expect(store.equipmentSlotMeetsRequirements('rarm')).toBe(false);
    expect(report.unmetGear.some((row) => row.name === heavyWeapon.name)).toBe(true);
  });
});
