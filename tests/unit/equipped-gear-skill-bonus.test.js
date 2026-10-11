/**
 * @file Equipped gear Class Only / per-skill soft levels.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { useItemsStore } from '@/stores/items.js';
import { getEquippedGearSkillBonusForSkill } from '@/items/item-granted-oskills.js';
import { initSkillDataStore } from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const twinTerrors = {
  id: 'u:twin-terrors:su',
  name: 'Twin Terrors',
  type: 'claw',
  category: 'weapons',
  slot: 'arms',
  rarity: 'unique',
  uniqueKind: 'su',
  classRestriction: 'Assassin Only',
  reqLevel: 100,
  reqDex: 349,
  invWidth: 1,
  invHeight: 3,
  modifiers: [
    'Adds (10 to 90)-(95 to 110) Damage',
    '5% Life stolen per Hit',
    '+(120 to 180)% Enhanced Damage',
    '+(3 to 7) to Noctule (Assassin Only)',
    'Elemental Resists +(10 to 25)%',
  ],
};

/** @type {(() => void) | null} */
let restoreFetch = null;

beforeEach(async () => {
  restoreFetch = installTreeDataFetchMock();
  await initSkillDataStore();
  setActivePinia(createPinia());
  const ch = createCharacterInstance('Assassin', 120);
  ch.setStat('strength', 100);
  ch.setStat('dexterity', 400);
});

afterEach(() => {
  setCharacterInstance(null);
  restoreFetch?.();
  restoreFetch = null;
});

describe('getEquippedGearSkillBonusForSkill', () => {
  it('applies Class Only per-skill amount from equipped gear (not capped at +3)', () => {
    const store = useItemsStore();
    store.catalog = [twinTerrors];
    store.catalogLoaded = true;
    store.syncViewerClassName('Assassin');
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(twinTerrors.id)).toBe(true);
    expect(store.equipmentSlotMeetsRequirements('rarm')).toBe(true);

    const bonus = getEquippedGearSkillBonusForSkill({
      skillId: 'noctule',
      displayName: 'Noctule',
      isOSkill: false,
      className: 'Assassin',
      skillClass: 'Assassin',
    });
    // Mid of (3 to 7) = 5 when rolls unset
    expect(bonus).toBe(5);
  });

  it('does not apply Assassin Only line to the wrong class', () => {
    const store = useItemsStore();
    store.catalog = [twinTerrors];
    store.catalogLoaded = true;
    // Force-equip regardless of class gate for this check
    store.syncViewerClassName('Assassin');
    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(twinTerrors.id)).toBe(true);
    store.syncViewerClassName('Barbarian');
    // Slot no longer contributes once class is wrong
    expect(store.equipmentSlotContributesBonuses('rarm')).toBe(false);
    expect(
      getEquippedGearSkillBonusForSkill({
        displayName: 'Noctule',
        isOSkill: false,
        className: 'Barbarian',
        skillClass: 'Assassin',
      })
    ).toBe(0);
  });
});
