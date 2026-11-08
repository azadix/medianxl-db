import { describe, expect, it } from 'vitest';
import {
  clearItemModifierTemplateCache,
  getItemDefinitionTemplate,
  getItemModifierTemplate,
  isFlavorItemLine,
} from '@/items/item-modifier-template.js';

describe('item modifier templates', () => {
  it('caches one parsed template per line and level', () => {
    clearItemModifierTemplateCache();
    const first = getItemModifierTemplate('+40 to Vitality', { characterLevel: 150 });
    const second = getItemModifierTemplate('+40 to Vitality', { characterLevel: 150 });
    expect(second).toBe(first);
    expect(first.classified).toBeTypeOf('object');
    expect(getItemModifierTemplate('+40 to Vitality', { characterLevel: 149 })).not.toBe(first);
  });

  it('caches per-definition signature and modifier templates', () => {
    const def = { id: 'test-def', modifiers: ['+40 to Vitality', 'Cube with a Gem'] };
    const first = getItemDefinitionTemplate(def);
    const second = getItemDefinitionTemplate(def);
    expect(second).toBe(first);
    expect(first.signature).toContain('test-def');
    expect(first.signature).toContain('+40 to Vitality');
    expect(first.modifierTemplates).toHaveLength(2);
    expect(first.modifierTemplates[1].flavor).toBe(true);
    expect(first.modifierTemplates[0].flavor).toBe(false);
  });

  it('classifies flavor and crafting instructions as display-only', () => {
    expect(isFlavorItemLine('Cube with a Perfect Gem to upgrade')).toBe(true);
    expect(isFlavorItemLine('Only one may be worn')).toBe(true);
    expect(isFlavorItemLine('The hunter persists. The prey falters')).toBe(true);
    expect(isFlavorItemLine('While in human form:')).toBe(true);
    expect(isFlavorItemLine('+40 to Vitality')).toBe(false);
    expect(getItemModifierTemplate('This item is a quest item').flavor).toBe(true);
  });
});
