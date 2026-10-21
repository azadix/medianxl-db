/**
 * @file Tests for raising planner level to item required level.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import Character from '@/character/Character.js';
import {
  createCharacterInstance,
  getCharacterInstance,
  setCharacterInstance,
  raiseCharacterLevelForItemReq,
} from '@/character/planner-instance.js';
import { useItemsStore } from '@/stores/items.js';
import {
  setPlannerAutoLevelFromSpentSkillPoints,
} from '@/planner/planner-options.js';
import { loadMysticOrbsCatalog } from '@/items/mystic-orbs.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadMysticOrbsCatalog(
  JSON.parse(readFileSync(resolve('public/items/2_14/mystic-orbs.json'), 'utf8'))
);

const katarTu = {
  id: 'u:the-nutcracker:tu',
  name: 'The Nutcracker',
  type: 'h2h',
  category: 'weapons',
  slot: 'arms',
  rarity: 'unique',
  uniqueKind: 'tiered',
  reqLevel: 46,
  reqStr: 0,
  reqDex: 0,
  invWidth: 1,
  invHeight: 3,
};

const highCharm = {
  id: 'charm-high',
  name: 'High Level Charm',
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
  reqLevel: 90,
  reqStr: 0,
  reqDex: 0,
  invWidth: 1,
  invHeight: 1,
};

const highRelic = {
  id: 'relic-high',
  name: 'High Level Relic',
  type: 'jewl',
  category: 'relics',
  rarity: 'relic',
  keepInInventory: true,
  reqLevel: 100,
  reqStr: 0,
  reqDex: 0,
  invWidth: 1,
  invHeight: 1,
};

describe('raiseCharacterLevelForItemReq', () => {
  afterEach(() => {
    setCharacterInstance(null);
  });

  it('raises stored level to reqLevel and does not lower it later', () => {
    createCharacterInstance('Amazon', 1);
    expect(raiseCharacterLevelForItemReq({ reqLevel: 90 })).toBe(true);
    expect(getCharacterInstance().level).toBe(90);
    expect(raiseCharacterLevelForItemReq({ reqLevel: 50 })).toBe(false);
    expect(getCharacterInstance().level).toBe(90);
    expect(raiseCharacterLevelForItemReq({ reqLevel: 0 })).toBe(false);
    expect(raiseCharacterLevelForItemReq(null)).toBe(false);
  });

  it('clamps reqLevel to max character level', () => {
    createCharacterInstance('Amazon', 1);
    expect(raiseCharacterLevelForItemReq({ reqLevel: 200 })).toBe(true);
    expect(getCharacterInstance().level).toBe(Character.MAX_LEVEL);
  });
});

describe('equipFromPicker raises level', () => {
  /** @type {ReturnType<typeof useItemsStore>} */
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useItemsStore();
    store.catalog = [katarTu];
    store.catalogLoaded = true;
    createCharacterInstance('Assassin', 1);
  });

  afterEach(() => {
    setCharacterInstance(null);
  });

  it('sets character level to the equipped item reqLevel', () => {
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(katarTu.id)).toBe(true);
    expect(getCharacterInstance().level).toBe(46);
  });
});

describe('updateInstanceSocketables raises level', () => {
  /** @type {ReturnType<typeof useItemsStore>} */
  let store;

  const helm = {
    id: 'helm-sock',
    name: 'Socket Helm',
    type: 'helm',
    category: 'armor',
    slot: 'head',
    sockets: 4,
    reqLevel: 1,
    reqStr: 0,
    reqDex: 0,
    invWidth: 2,
    invHeight: 2,
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useItemsStore();
    store.catalog = [helm];
    store.catalogLoaded = true;
    createCharacterInstance('Assassin', 1);
  });

  afterEach(() => {
    setCharacterInstance(null);
  });

  it('applies a high-req enchanted rune and raises character level', () => {
    store.selectSlot({ location: 'equipment', slot: 'head' });
    expect(store.equipFromPicker(helm.id)).toBe(true);
    const id = store.equipment.head;
    expect(
      store.updateInstanceSocketables(id, [
        { name: 'Elq Rune', type: 'Rune', code: 'rx02', reqLevel: 90 },
      ])
    ).toBe(true);
    expect(store.getSocketablesForInstance(id)[0]?.name).toBe('Elq Rune');
    expect(getCharacterInstance().level).toBe(90);
  });
});

describe('updateInstanceMysticOrbs does not exceed character level', () => {
  /** @type {ReturnType<typeof useItemsStore>} */
  let store;

  const saber = {
    id: 'u:alnair:su',
    name: 'Alnair',
    type: 'swor',
    category: 'weapons',
    slot: 'arms',
    rarity: 'unique',
    uniqueKind: 'su',
    reqLevel: 100,
    reqStr: 443,
    reqDex: 0,
    sockets: 3,
    invWidth: 1,
    invHeight: 3,
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useItemsStore();
    store.catalog = [saber];
    store.catalogLoaded = true;
    createCharacterInstance('Sorceress', 150);
  });

  afterEach(() => {
    setPlannerAutoLevelFromSpentSkillPoints(true);
    setCharacterInstance(null);
  });

  it('rejects mystic orbs that would push required level past 150', () => {
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(saber.id)).toBe(true);
    const id = store.equipment.rarm;
    expect(
      store.updateInstanceMysticOrbs(id, [
        [1, 'MO - Attack Speed'],
        [1, 'Ten Pin Striker'],
        [2, 'MO - IED'],
        [2, "Marksman's Eye"],
        [1, 'Apple of Discord 2'],
      ])
    ).toBe(false);
    expect(store.getMysticOrbsForInstance(id)).toEqual([]);
    expect(getCharacterInstance().level).toBe(150);
  });

  it('allows mystic orbs that stay at or under character level', () => {
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(saber.id)).toBe(true);
    const id = store.equipment.rarm;
    expect(store.updateInstanceMysticOrbs(id, [[1, 'MO - Attack Speed']])).toBe(true);
    expect(store.getMysticOrbsForInstance(id)).toEqual([[1, 'MO - Attack Speed']]);
    expect(getCharacterInstance().level).toBe(150);
  });

  it('raises character level for mystic orbs when auto-level is on', () => {
    createCharacterInstance('Sorceress', 100);
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(saber.id)).toBe(true);
    const id = store.equipment.rarm;
    expect(store.updateInstanceMysticOrbs(id, [[1, 'MO - Attack Speed']])).toBe(true);
    expect(store.getMysticOrbsForInstance(id)).toEqual([[1, 'MO - Attack Speed']]);
    expect(getCharacterInstance().level).toBe(104);
  });

  it('rejects mystic orbs above the manual character level when auto-level is off', () => {
    setPlannerAutoLevelFromSpentSkillPoints(false);
    createCharacterInstance('Sorceress', 100);
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(saber.id)).toBe(true);
    const id = store.equipment.rarm;
    expect(store.updateInstanceMysticOrbs(id, [[1, 'MO - Attack Speed']])).toBe(false);
    expect(store.getMysticOrbsForInstance(id)).toEqual([]);
    expect(getCharacterInstance().level).toBe(100);
  });
});

describe('fromSnapshot does not raise level for item reqs', () => {
  /** @type {ReturnType<typeof useItemsStore>} */
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useItemsStore();
    store.catalog = [katarTu, highCharm, highRelic];
    store.catalogLoaded = true;
    createCharacterInstance('Assassin', 20);
  });

  afterEach(() => {
    setCharacterInstance(null);
  });

  it('keeps character level, disables unmet charms/relics, leaves gear equipped', () => {
    const report = store.fromSnapshot({
      equipment: { rarm: { defId: katarTu.id } },
      charms: [{ defId: highCharm.id }],
      relics: [{ defId: highRelic.id }],
    });

    expect(getCharacterInstance().level).toBe(20);
    expect(store.equipment.rarm).not.toBeNull();
    expect(store.enabledCharms[highCharm.id]).toBeUndefined();
    expect(store.enabledRelics[highRelic.id]).toBeUndefined();
    expect(report.disabledCharms).toEqual([{ name: highCharm.name, reqLevel: 90 }]);
    expect(report.disabledRelics).toEqual([{ name: highRelic.name, reqLevel: 100 }]);
    expect(report.unmetGear.some((row) => row.name === katarTu.name)).toBe(true);
    expect(store.equipmentSlotMeetsRequirements('rarm')).toBe(false);
  });
});
