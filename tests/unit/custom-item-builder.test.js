import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  applyCustomOverlayToDef,
  canUseCustomQuality,
  defaultCustomQualityForBase,
  isCraftedEligibleBase,
  parseCustomPayload,
} from '@/items/custom-items.js';
import {
  angelicBaseDisplayName,
  isAngelicBaseItem,
  isAngelicEligibleBase,
  listAngelicBaseItems,
  normalizeAngelicRarity,
} from '@/items/angelic-items.js';
import {
  isMastercraftedBaseItem,
  mastercraftedBaseDisplayName,
} from '@/items/mastercrafted-items.js';
import {
  extrasWithAppliedItemBonuses,
  applyEtherealBonus,
  defaultRollsForDef,
  getItemDetailStatRows,
  getItemStatSections,
  getRollableStats,
} from '@/items/item-stats.js';
import { getItemSocketCount } from '@/items/socketables.js';

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

  it('allows magic as an angelic rarity', () => {
    expect(normalizeAngelicRarity('magic')).toBe('magic');
    expect(normalizeAngelicRarity('rare')).toBe('rare');
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

  it('disallows white and angelic mastercrafted items', () => {
    const kukri = { name: 'Kukri', rarity: 'normal', category: 'weapons', icon: 'mastercraftedknife' };
    expect(canUseCustomQuality(kukri, null)).toBe(false);
    expect(canUseCustomQuality(kukri, 'angelic')).toBe(false);
    expect(canUseCustomQuality(kukri, 'magic')).toBe(true);
    expect(canUseCustomQuality(kukri, 'rare')).toBe(true);
    expect(canUseCustomQuality(kukri, 'crafted')).toBe(true);
    expect(canUseCustomQuality(kukri, 'honorific')).toBe(true);
    expect(defaultCustomQualityForBase(kukri)).toBe('magic');
    expect(
      canUseCustomQuality(
        { name: 'Crystal Sword (Sacred)', rarity: 'normal', category: 'weapons' },
        null
      )
    ).toBe(true);
  });

  it('lists angelic counterparts as their own bases', () => {
    const clones = listAngelicBaseItems([
      { id: '18@', name: 'Military Pick (Sacred)', rarity: 'normal', category: 'weapons' },
      { id: 'crs', name: 'Crystal Sword (Sacred)', rarity: 'normal', category: 'weapons' },
    ]);
    expect(clones).toHaveLength(1);
    expect(clones[0].id).toBe('18@:angelic');
    expect(clones[0].name).toBe('Military Pick (Angelic)');
    expect(angelicBaseDisplayName(clones[0])).toBe('Military Pick (Angelic)');
    expect(isAngelicBaseItem(clones[0])).toBe(true);
    expect(canUseCustomQuality(clones[0], null)).toBe(false);
    expect(canUseCustomQuality(clones[0], 'magic')).toBe(true);
    expect(canUseCustomQuality(clones[0], 'rare')).toBe(true);
    expect(defaultCustomQualityForBase(clones[0])).toBe('magic');
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

  it('lets magic and rare items roll sockets instead of locking max', () => {
    const rare = applyCustomOverlayToDef(
      { id: 'cap', name: 'Cap (Sacred)', rarity: 'normal', sockets: 4, category: 'armor' },
      { quality: 'rare', name: 'Rare Cap (Sacred)', modifiers: [], sockets: 4 }
    );
    const unique = {
      id: 'u:cap',
      name: 'Unique Cap',
      rarity: 'unique',
      baseId: 'cap',
      sockets: 4,
      modifiers: [],
    };
    expect(getRollableStats(rare).some((row) => row.key === 'sockets')).toBe(true);
    expect(getRollableStats(unique).some((row) => row.key === 'sockets')).toBe(false);
    expect(defaultRollsForDef(rare).sockets).toBe(0);
    expect(defaultRollsForDef(unique).sockets).toBe(4);
    expect(getItemSocketCount(rare, { sockets: 2 })).toBe(2);
    expect(getItemSocketCount(unique, { sockets: 2 })).toBe(4);
    expect(
      getItemDetailStatRows(rare, { sockets: 2 }).some(
        (row) => row.kind === 'roll' && row.stat?.key === 'sockets'
      )
    ).toBe(true);
    expect(getItemStatSections(rare, { sockets: 2 }).scaling).toContain('Socketed (2)');
  });
});
