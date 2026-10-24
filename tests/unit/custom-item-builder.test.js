import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import { applyCustomOverlayToDef, isCraftedEligibleBase, parseCustomPayload } from '@/items/custom-items.js';
import { isAngelicEligibleBase } from '@/items/angelic-items.js';
import {
  isMastercraftedBaseItem,
  mastercraftedBaseDisplayName,
} from '@/items/mastercrafted-items.js';
import {
  extrasWithAppliedItemBonuses,
  applyEtherealBonus,
  getItemStatSections,
  getRollableStats,
} from '@/items/item-stats.js';

describe('custom-item-builder', () => {
  it('stores picked prefixes on a custom instance', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [
      {
        id: 'cap',
        name: 'Cap (Sacred)',
        rarity: 'normal',
        category: 'armor',
        slot: 'head',
        group: 'Helms',
        sockets: 2,
        invWidth: 2,
        invHeight: 2,
      },
    ];
    store.catalogById = { cap: store.catalog[0] };
    const id = store.createCustomInstance('cap', 'magic');
    expect(id).toBeTruthy();
    store.updateInstanceCustom(id, {
      quality: 'magic',
      name: 'Magic Cap (Sacred)',
      modifiers: ['+(150 to 160)% Enhanced Defense'],
      pickedAffixes: {
        prefixes: [{ id: 'p-test', properties: '+(150 to 160)% Enhanced Defense' }],
        suffixes: [],
      },
    });
    expect(store.instances[id].custom.pickedAffixes.prefixes[0].properties).toContain(
      'Enhanced Defense'
    );
    expect(store.instances[id].custom.modifiers[0]).toContain('Enhanced Defense');
  });

  it('keeps TSW modifier strings when pickedAffixes is absent', () => {
    const parsed = parseCustomPayload({
      quality: 'rare',
      name: 'Rare Ring',
      modifiers: ['+10 to Strength', '+5% Magic Find'],
    });
    expect(parsed.pickedAffixes).toBeUndefined();
    expect(parsed.modifiers).toEqual(['+10 to Strength', '+5% Magic Find']);
  });

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

  it('allows crafted overlays only on sacred, angelic, and mastercrafted bases', () => {
    expect(
      isCraftedEligibleBase({ name: 'Crystal Sword (Sacred)', rarity: 'normal', category: 'weapons' })
    ).toBe(true);
    expect(
      isCraftedEligibleBase({
        name: 'Military Pick (Sacred)',
        rarity: 'normal',
        category: 'weapons',
      })
    ).toBe(true);
    expect(
      isCraftedEligibleBase({
        name: 'Kukri',
        rarity: 'normal',
        category: 'weapons',
        icon: 'mastercraftedknife',
      })
    ).toBe(true);
    expect(
      isCraftedEligibleBase({ name: 'Soulbinder Gloves (Mastercrafted)', rarity: 'normal', category: 'armor' })
    ).toBe(true);
    expect(isCraftedEligibleBase({ name: 'Ring', rarity: 'normal', category: 'jewelry' })).toBe(true);
    expect(
      isCraftedEligibleBase({ name: 'Crystal Sword (1)', rarity: 'normal', category: 'weapons' })
    ).toBe(false);
    expect(
      isCraftedEligibleBase({ name: 'Cap (4)', rarity: 'normal', category: 'armor' })
    ).toBe(false);
  });

  it('labels mastercrafted catalog bases', () => {
    const kukri = { name: 'Kukri', rarity: 'normal', category: 'weapons', icon: 'mastercraftedknife' };
    expect(isMastercraftedBaseItem(kukri)).toBe(true);
    expect(mastercraftedBaseDisplayName(kukri)).toBe('Kukri (Mastercrafted)');
    expect(isMastercraftedBaseItem({ name: 'Crystal Sword (Sacred)', icon: 'invcrs' })).toBe(false);
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

  it('uses max catalog defense and boosts it by 25% when ethereal', () => {
    const def = {
      name: 'Cap (Sacred)',
      rarity: 'normal',
      category: 'armor',
      defense: { min: 80, max: 120 },
      ethereal: true,
    };
    expect(getRollableStats(def, { defense: 100 }).some((row) => row.key === 'defense')).toBe(false);
    expect(getItemStatSections(def, { defense: 100 }).base).toContain('Defense: 150');
  });

  it('merges oil extras without doubling matching lines', () => {
    const lines = extrasWithAppliedItemBonuses(['+20% Enhanced Damage'], { name: 'Sword' }, {});
    expect(lines.filter((l) => l.includes('Enhanced Damage')).length).toBe(1);
  });
});
