import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import { applyCustomOverlayToDef } from '@/items/custom-items.js';
import { isAngelicEligibleBase } from '@/items/angelic-items.js';
import { extrasWithAppliedItemBonuses, applyEtherealBonus } from '@/items/item-stats.js';

describe('custom-item-builder', () => {
  it('overlays crafted affixes onto a base', () => {
    const def = applyCustomOverlayToDef(
      { id: 'crs', name: 'Crystal Sword', rarity: 'normal', sockets: 4, reqLevel: 1 },
      { quality: 'crafted', name: 'Crafted Crystal Sword', modifiers: ['+1 to All Skills'] }
    );
    expect(def.customQuality).toBe('crafted');
    expect(def.modifiers).toEqual(['+1 to All Skills']);
  });

  it('creates a custom instance and round-trips jewels in the snapshot', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [
      {
        id: 'crs',
        name: 'Crystal Sword',
        rarity: 'normal',
        category: 'weapons',
        slot: 'rarm',
        sockets: 4,
        invWidth: 1,
        invHeight: 3,
      },
    ];
    const id = store.createCustomInstance('crs', 'honorific');
    expect(id).toBeTruthy();
    store.equipment.rarm = id;
    store.updateInstanceCustom(id, {
      quality: 'honorific',
      name: 'Honorific Crystal Sword',
      modifiers: ['+10 to Strength'],
    });
    store.addCustomJewel({ name: 'My Jewel', modifiers: ['+5 to Strength'], rarity: 'magic' });
    const snap = store.toSnapshot();
    expect(snap.equipment.rarm.custom.quality).toBe('honorific');
    expect(snap.customJewels[0].modifiers).toEqual(['+5 to Strength']);
    expect(snap.customJewels[0].rarity).toBe('magic');
    store.fromSnapshot(snap);
    expect(store.getEquipmentDef('rarm').customQuality).toBe('honorific');
    expect(store.customJewels[0].name).toBe('My Jewel');
    expect(store.customJewels[0].rarity).toBe('magic');
  });

  it('limits angelic items to wiki Sacred families', () => {
    expect(
      isAngelicEligibleBase({ name: 'Military Pick (Sacred)', rarity: 'normal', category: 'weapons' })
    ).toBe(true);
    expect(
      isAngelicEligibleBase({ name: 'Light Plate (Sacred)', rarity: 'normal', category: 'armor' })
    ).toBe(true);
    expect(
      isAngelicEligibleBase({ name: 'Military Pick (1)', rarity: 'normal', category: 'weapons' })
    ).toBe(false);
    expect(
      isAngelicEligibleBase({ name: 'Crystal Sword (Sacred)', rarity: 'normal', category: 'weapons' })
    ).toBe(false);
    expect(
      isAngelicEligibleBase({ name: 'Amulet', rarity: 'normal', category: 'jewelry' })
    ).toBe(false);
  });

  it('overlays crafted angelic rarity on an eligible base', () => {
    const def = applyCustomOverlayToDef(
      { id: '18@', name: 'Military Pick (Sacred)', rarity: 'normal', sockets: 6, reqLevel: 30 },
      { quality: 'crafted', angelic: true, name: 'Crafted Military Pick (Angelic)', modifiers: [] }
    );
    expect(def.angelic).toBe(true);
    expect(def.rarity).toBe('crafted');
    expect(def.baseName).toBe('Military Pick (Angelic)');
  });

  it('applies ethereal +25% truncated', () => {
    expect(applyEtherealBonus(100)).toBe(125);
    expect(applyEtherealBonus(101)).toBe(126);
  });

  it('merges oil extras without doubling matching lines', () => {
    const lines = extrasWithAppliedItemBonuses(['+20% Enhanced Damage'], { name: 'Sword' }, {});
    expect(lines.filter((l) => l.includes('Enhanced Damage')).length).toBe(1);
  });
});
