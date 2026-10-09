import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  applyCustomOverlayToDef,
  parseCustomPayload,
  stripTswBaseLabel,
  tswCustomModifiers,
  tswCustomQuality,
} from '@/items/custom-items.js';
import { formatItemRarityBadge, getItemStatLines } from '@/items/item-stats.js';

describe('custom-items', () => {
  it('parses a custom payload and ignores unknown qualities', () => {
    expect(parseCustomPayload({ quality: 'Rare', name: 'Ring', modifiers: ['+1 to All Skills', ''] })).toEqual({
      quality: 'rare',
      name: 'Ring',
      modifiers: ['+1 to All Skills'],
    });
    expect(parseCustomPayload({ quality: 'unique' })).toBeNull();
  });

  it('classifies TSW angelic gear as angelic even when quality is Rare', () => {
    expect(
      tswCustomQuality({
        display_name: 'Light Gauntlets (Angelic)',
        quality: 'Rare',
        display_quality: 'Rare',
      })
    ).toBe('angelic');
    expect(tswCustomQuality({ quality: 'Honorific' })).toBe('honorific');
    expect(tswCustomQuality({ quality: 'Magic' })).toBe('magic');
    expect(tswCustomQuality({ quality: 'Crafted' })).toBe('crafted');
  });

  it('strips TSW base labels and drops header lines from modifiers', () => {
    expect(stripTswBaseLabel('Superior Light Gauntlets (Angelic)')).toBe('Light Gauntlets');
    expect(stripTswBaseLabel('Cap (Sacred)')).toBe('Cap');
    expect(
      tswCustomModifiers({
        display_name: 'Ring',
        type: 'Ring',
        description_lines: [
          [['Ring', 9]],
          [['Prefixes: 3', 9]],
          [['Required Level: 80', 1]],
          [['+1 to All Skills', 3]],
          [['Socketed (1)', 0]],
        ],
      })
    ).toEqual(['+1 to All Skills']);
  });

  it('overlays rarity, name, and modifiers onto a catalog base', () => {
    const def = applyCustomOverlayToDef(
      { id: 'rin', name: 'Ring', rarity: 'normal', category: 'jewelry' },
      { quality: 'rare', name: 'Ring', modifiers: ['+1 to All Skills'] }
    );
    expect(def.rarity).toBe('rare');
    expect(def.customQuality).toBe('rare');
    expect(def.baseId).toBe('rin');
    expect(formatItemRarityBadge(def)).toBe('Rare');
    expect(getItemStatLines(def)).toContain('+1 to All Skills');
  });

  it('shows honorific and angelic badges', () => {
    expect(formatItemRarityBadge({ rarity: 'honorific' })).toBe('Honorific');
    expect(formatItemRarityBadge({ rarity: 'angelic' })).toBe('Angelic');
  });

  it('round-trips custom payload through items snapshot', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [
      {
        id: 'rin',
        name: 'Ring',
        rarity: 'normal',
        category: 'jewelry',
        slot: 'ring',
        invWidth: 1,
        invHeight: 1,
      },
    ];
    const id = store.createInstance('rin', 'invrin1', null, {
      quality: 'rare',
      name: 'Ring',
      modifiers: ['+1 to All Skills'],
    });
    store.equipment.lrin = id;
    const snap = store.toSnapshot();
    expect(snap.equipment.lrin.custom).toEqual({
      quality: 'rare',
      name: 'Ring',
      modifiers: ['+1 to All Skills'],
    });
    store.fromSnapshot(snap);
    const def = store.getEquipmentDef('lrin');
    expect(def.customQuality).toBe('rare');
    expect(def.modifiers).toEqual(['+1 to All Skills']);
    expect(formatItemRarityBadge(def)).toBe('Rare');
  });
});
