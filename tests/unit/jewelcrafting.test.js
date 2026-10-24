import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  customJewelModifierLines,
  getJewelcraftLines,
  JEWELCRAFT_PRESETS,
  jewelcraftOptionLabel,
  jewelcraftRollKey,
  lookupJewelcraft,
} from '@/items/jewelcrafting.js';

describe('jewelcrafting', () => {
  it('has the cube catalyst presets', () => {
    expect(JEWELCRAFT_PRESETS).toHaveLength(15);
    expect(jewelcraftOptionLabel(lookupJewelcraft('spellFocus'))).toBe('+(5 to 10) Spell Focus');
    expect(jewelcraftOptionLabel(lookupJewelcraft('elemRes'))).not.toMatch(/gold/i);
    expect(getJewelcraftLines('laek')).toEqual([
      '+(4 to 6) Life after each Kill',
      '+(4 to 6) Mana after each Kill',
    ]);
  });

  it('puts catalyst lines ahead of rare affixes on crafted jewels', () => {
    expect(
      customJewelModifierLines({
        rarity: 'crafted',
        jewelcraft: 'mf',
        modifiers: ['+10 to Strength'],
      })
    ).toEqual(['3% Magic Find', '+10 to Strength']);
  });

  it('skips catalyst lines on magic and rare jewels', () => {
    expect(
      customJewelModifierLines({
        rarity: 'rare',
        jewelcraft: 'mf',
        modifiers: ['+10 to Strength'],
      })
    ).toEqual(['+10 to Strength']);
  });

  it('round-trips jewelcraft on a custom jewel snapshot', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.addCustomJewel({
      name: 'Crafted Jewel',
      rarity: 'crafted',
      modifiers: ['+5 to Strength'],
      jewelcraft: 'spellDmg',
    });
    const snap = store.toSnapshot();
    expect(snap.customJewels[0].jewelcraft).toBe('spellDmg');
    store.fromSnapshot(snap);
    expect(store.customJewels[0].jewelcraft).toBe('spellDmg');
    expect(customJewelModifierLines(store.customJewels[0])).toEqual([
      '+2% to Spell Damage',
      '+5 to Strength',
    ]);
  });

  it('applies stored jewelcraft rolls to catalyst ranges', () => {
    expect(
      customJewelModifierLines({
        rarity: 'crafted',
        jewelcraft: 'elemRes',
        jewelcraftRolls: { [jewelcraftRollKey(0, 0)]: 5 },
        modifiers: [],
      })
    ).toEqual(['Elemental Resists +5%']);
  });
});
