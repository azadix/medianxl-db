import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { buildCatalogFromUniqueStats } from '@/items/unique-stats-catalog.js';
import {
  ITEM_CATEGORIES,
  QUIVER_INACTIVE_REASON,
  canEquipInSlot,
  equipBlockedReason,
  isInventoryOnlyGear,
  isQuiverEffectActive,
  isQuiverItem,
  isUniquePickerItem,
  quiverMatchesMissileWeapon,
} from '@/items/item-types.js';
import { entryToItemDef, resolveCatalogDefId } from '@/items/unique-stats-catalog.js';
import { createCharacterInstance, setCharacterInstance } from '@/character/planner-instance.js';
import { useItemsStore } from '@/stores/items.js';

const ROOT = resolve(import.meta.dirname, '../..');

describe('quiver catalog', () => {
  const other = JSON.parse(readFileSync(resolve(ROOT, 'public/items/2_14/other.json'), 'utf8'));
  const bases = [
    ...JSON.parse(readFileSync(resolve(ROOT, 'public/items/2_14/baseitems.json'), 'utf8')),
    ...other,
  ];
  const db = JSON.parse(
    readFileSync(resolve(ROOT, 'public/items/2_14/unique-stats-db.json'), 'utf8')
  );
  const { items } = buildCatalogFromUniqueStats(db, bases);
  const quivers = items.filter((d) => isQuiverItem(d));
  const baseQuivers = other.filter((o) => isQuiverItem(o));
  const arrowQuiver = baseQuivers.find((q) => q.type === 'bowq');
  const boltQuiver = baseQuivers.find((q) => q.type === 'xboq');
  const bow = { slot: 'arms', category: 'weapons', group: 'Bows', type: 'bow', damage2h: { min: 10, max: 20 } };
  const xbow = {
    slot: 'arms',
    category: 'weapons',
    group: 'Crossbows',
    type: 'xbw',
    damage2h: { min: 12, max: 24 },
  };
  const sword = {
    slot: 'arms',
    category: 'weapons',
    group: 'One-Handed Swords',
    type: 'swor',
    damage1h: { min: 4, max: 8 },
  };

  it('exposes a Quivers picker category', () => {
    expect(ITEM_CATEGORIES.some((c) => c.id === 'quivers')).toBe(true);
  });

  it('builds unique quiver overlays as arms-slot gear', () => {
    expect(baseQuivers.every((q) => q.slot === 'arms')).toBe(true);
    expect(quivers.length).toBeGreaterThanOrEqual(11);
    expect(quivers.every((d) => d.baseId === 'aqv' || d.baseId === 'cqv')).toBe(true);
    expect(quivers.every((d) => d.category === 'quivers')).toBe(true);
    expect(quivers.every((d) => d.slot === 'arms')).toBe(true);
    expect(quivers.every((d) => isUniquePickerItem(d))).toBe(true);
    expect(quivers.every((d) => !isInventoryOnlyGear(d))).toBe(true);
  });

  it('equips quivers in the off-hand like a shield for bows/crossbows', () => {
    expect(canEquipInSlot(arrowQuiver, 'larm', 'Amazon')).toBe(true);
    expect(canEquipInSlot(arrowQuiver, 'larm', 'Amazon', { otherHandDef: bow })).toBe(true);
    expect(canEquipInSlot(boltQuiver, 'larm', 'Amazon', { otherHandDef: xbow })).toBe(true);
    expect(canEquipInSlot(arrowQuiver, 'larm', 'Amazon', { otherHandDef: xbow })).toBe(false);
    expect(canEquipInSlot(boltQuiver, 'larm', 'Amazon', { otherHandDef: bow })).toBe(false);
    expect(canEquipInSlot(arrowQuiver, 'larm', 'Amazon', { otherHandDef: sword })).toBe(false);
    expect(
      equipBlockedReason(arrowQuiver, 'larm', 'Amazon', { otherHandDef: sword })
    ).toBe('Quivers only pair with a matching bow or crossbow.');
  });

  it('matches arrow quivers to bows and bolt quivers to crossbows', () => {
    expect(quiverMatchesMissileWeapon(arrowQuiver, bow)).toBe(true);
    expect(quiverMatchesMissileWeapon(boltQuiver, xbow)).toBe(true);
    expect(quiverMatchesMissileWeapon(arrowQuiver, xbow)).toBe(false);
    expect(quiverMatchesMissileWeapon(boltQuiver, bow)).toBe(false);
  });

  it('is inactive without a matching bow/crossbow (no effects)', () => {
    expect(isQuiverEffectActive(arrowQuiver, null)).toBe(false);
    expect(isQuiverEffectActive(arrowQuiver, undefined)).toBe(false);
    expect(isQuiverEffectActive(arrowQuiver, sword)).toBe(false);
    expect(isQuiverEffectActive(arrowQuiver, bow)).toBe(true);
    expect(isQuiverEffectActive(boltQuiver, xbow)).toBe(true);
    expect(QUIVER_INACTIVE_REASON).toMatch(/bow or crossbow/i);
  });

  it('lists both Bag of Tricks forms with normal arrow/bolt pairing', () => {
    const bags = quivers.filter((d) => d.name === 'Bag of Tricks');
    expect(bags.map((d) => d.type).sort()).toEqual(['bowq', 'xboq']);
    const arrowBag = bags.find((d) => d.type === 'bowq');
    const boltBag = bags.find((d) => d.type === 'xboq');
    expect(quiverMatchesMissileWeapon(arrowBag, bow)).toBe(true);
    expect(quiverMatchesMissileWeapon(arrowBag, xbow)).toBe(false);
    expect(quiverMatchesMissileWeapon(boltBag, xbow)).toBe(true);
    expect(quiverMatchesMissileWeapon(boltBag, bow)).toBe(false);
    const bolt = entryToItemDef(
      {
        name: 'Bag of Tricks',
        quality: 'SU',
        type: 'Bolt Quiver',
        stats: 'Required Level: 100\nCube with 2 Sacred Essences to transform into an Arrow Quiver',
      },
      bases
    );
    expect(bolt?.id).toBe('u:bag-of-tricks:su:bolt-quiver');
    expect(resolveCatalogDefId('u:bag-of-tricks:su', { [bolt.id]: bolt })).toBe(bolt.id);
  });
});

describe('equipped quiver activity', () => {
  /** @type {ReturnType<typeof useItemsStore>} */
  let store;
  const quiver = {
    id: 'u:bag-of-tricks:su',
    name: 'Bag of Tricks',
    type: 'xboq',
    category: 'quivers',
    slot: 'arms',
    rarity: 'unique',
    uniqueKind: 'su',
    group: 'Crossbow Quivers',
    reqLevel: 1,
    invWidth: 1,
    invHeight: 3,
  };
  const crossbow = {
    id: 'xbow-1',
    name: 'Crossbow (Sacred)',
    type: 'xbw',
    category: 'weapons',
    slot: 'arms',
    group: 'Crossbows',
    rarity: 'normal',
    damage2h: { min: 10, max: 20 },
    reqLevel: 1,
    invWidth: 2,
    invHeight: 3,
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useItemsStore();
    store.catalog = [quiver, crossbow];
    store.catalogLoaded = true;
    createCharacterInstance('Amazon', 100);
  });

  afterEach(() => {
    setCharacterInstance(null);
  });

  it('marks quiver unmet until a matching crossbow is equipped', () => {
    store.selectSlot({ location: 'equipment', slot: 'larm' });
    expect(store.equipFromPicker(quiver.id)).toBe(true);
    expect(store.equipmentSlotMeetsRequirements('larm')).toBe(false);
    expect(store.quiverInactiveReasonForSlot('larm')).toBe(QUIVER_INACTIVE_REASON);
    expect(store.activeEquippedDefs.some((d) => d.id === quiver.id)).toBe(false);

    store.selectSlot({ location: 'equipment', slot: 'rarm' });
    expect(store.equipFromPicker(crossbow.id)).toBe(true);
    expect(store.equipmentSlotMeetsRequirements('larm')).toBe(true);
    expect(store.quiverInactiveReasonForSlot('larm')).toBe(null);
    expect(store.activeEquippedDefs.some((d) => d.id === quiver.id)).toBe(true);
  });
});
