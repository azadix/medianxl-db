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

const katarTu = {
  id: 'u:the-nutcracker:tu',
  name: 'The Nutcracker',
  type: 'h2h',
  category: 'weapons',
  slot: 'arms',
  rarity: 'unique',
  uniqueKind: 'tiered',
  reqLevel: 46,
  invWidth: 1,
  invHeight: 3,
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
