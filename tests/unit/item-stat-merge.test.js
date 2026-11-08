import { describe, expect, it } from 'vitest';
import { getItemStatSections } from '@/items/item-stats.js';

describe('item stat numeric merging', () => {
  it('merges repeated trailing-number stats such as socketed Light Runes', () => {
    const def = {
      id: 'test-shield',
      name: 'Test Shield',
      type: 'shield',
      modifiers: Array(6).fill('Lightning Absorb 1%'),
    };
    const sections = getItemStatSections(def, null, {
      extras: Array(6).fill('Lightning Absorb 1%'),
    });
    expect(sections.mods).toEqual(['{added}Lightning Absorb 6%']);
  });

  it('keeps different stat names separate', () => {
    const def = {
      id: 'test-shield',
      name: 'Test Shield',
      type: 'shield',
      modifiers: ['Fire Absorb 1%', 'Lightning Absorb 1%', 'Fire Absorb 1%'],
    };
    const sections = getItemStatSections(def, null, {
      extras: ['Fire Absorb 1%', 'Lightning Absorb 1%', 'Fire Absorb 1%'],
    });
    expect(sections.mods).toEqual(['{added}Fire Absorb 2%', '{added}Lightning Absorb 1%']);
  });
});
