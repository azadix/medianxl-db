import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  applyCustomOverlayToDef,
  parseCustomPayload,
  stripTswBaseLabel,
  tswCustomBaseFields,
  tswCustomModifiers,
  tswCustomQuality,
  tswCustomSnapshotEntry,
} from '@/items/custom-items.js';
import { formatItemRarityBadge, getItemStatLines, getItemStatSections } from '@/items/item-stats.js';
import { itemRarityNameClass } from '@/items/item-tooltip.js';

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
    expect(stripTswBaseLabel('Soulbinder Gloves (Mastercrafted)')).toBe('Soulbinder Gloves');
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

  it('uses orange crafted and green honorific name classes', () => {
    expect(itemRarityNameClass('crafted')).toBe('item-tooltip-name--crafted');
    expect(itemRarityNameClass('honorific')).toBe('item-tooltip-name--honorific');
  });

  it('parses TSW defense, reqs, and sockets onto custom overlays', () => {
    expect(
      tswCustomBaseFields({
        description_lines: [
          [['Cap (Honorific)', 2]],
          [['Defense: ', -1], ['412', 3], [' (200)', -1]],
          [['Required Level: 1', 1]],
          [['Required Strength: 25', 1]],
          [['+5% Enhanced Defense', 3]],
          [['Socketed (2/2)', 3]],
        ],
      })
    ).toEqual({
      defenseDisplay: '412 (200)',
      reqLevel: 1,
      reqStr: 25,
      sockets: 2,
    });

    const entry = tswCustomSnapshotEntry(
      {
        display_name: 'Cap (Honorific)',
        type: 'Cap (Sacred)',
        quality: 'Honorific',
        description_lines: [
          [['Cap (Honorific)', 2]],
          [['Defense: 412 (200)', -1]],
          [['Required Level: 1', 1]],
          [['+5% Enhanced Defense', 3]],
          [['+8 Required Level', 3]],
          [['Socketed (2/2)', 3]],
        ],
      },
      'cap-sacred',
      'honorific'
    );
    // Required Level: 1 is final and already includes +8, so store pre-bonus base.
    expect(entry.custom).toMatchObject({
      quality: 'honorific',
      defenseDisplay: '412 (200)',
      reqLevel: 0,
      sockets: 2,
      modifiers: ['+5% Enhanced Defense', '+8 Required Level'],
    });

    const def = applyCustomOverlayToDef(
      {
        id: 'cap-sacred',
        name: 'Cap (Sacred)',
        rarity: 'normal',
        reqLevel: 30,
        reqStr: 500,
        defense: { min: 1187, max: 1201 },
        sockets: 2,
      },
      entry.custom
    );
    const sections = getItemStatSections(def);
    expect(sections.base).toContain('Defense: 412 (200)');
    expect(sections.requirements).toEqual({
      reqLevel: 8,
      reqStr: 500,
      reqDex: 0,
      reductionPct: 0,
    });
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
