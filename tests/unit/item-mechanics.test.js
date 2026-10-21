import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defHasItemMechanic,
  getMechanicBonusLines,
  loadItemMechanics,
  restoreMechanicForDef,
  restorePercent,
} from '@/items/item-mechanics.js';
import { loadAffixTemplates } from '@/items/affix-templates.js';

loadAffixTemplates(JSON.parse(readFileSync(resolve('public/items/2_14/affix-templates.json'), 'utf8')));
loadItemMechanics(JSON.parse(readFileSync(resolve('public/items/2_14/item-mechanics.json'), 'utf8')));

describe('item-mechanics', () => {
  const arrogance = { name: 'Arrogance' };

  it('matches restore items by name', () => {
    expect(defHasItemMechanic(arrogance)).toBe(true);
    expect(restoreMechanicForDef(arrogance)?.itemId).toBe('su_arrogance');
    expect(restorePercent(restoreMechanicForDef(arrogance), 25)).toBe(100);
  });

  it('emits restore output lines', () => {
    const lines = getMechanicBonusLines(arrogance, { restore: 25 });
    expect(lines[0]).toBe('Restore +100%');
    expect(lines.length).toBeGreaterThan(1);
  });
});
