import { describe, expect, it } from 'vitest';
import {
  defHasRandomElementChoice,
  inferRandomElementFromLines,
  linesHaveRandomElementChoice,
  resolveRandomElementInText,
} from '@/items/random-element.js';
import { getSocketableBonusLines, socketableFromCatalogRow } from '@/items/socketables.js';

describe('random-element', () => {
  it('resolves [Random Elemental] and random elemental affix text', () => {
    expect(resolveRandomElementInText('Maximum [Random Elemental] Resist +1%', 'lightning')).toBe(
      'Maximum Lightning Resist +1%'
    );
    expect(resolveRandomElementInText('+1% Maximum Random Elemental Resist', 'poison')).toBe(
      '+1% Maximum Poison Resist'
    );
    expect(linesHaveRandomElementChoice(['Maximum [Random Elemental] Resist +1%'])).toBe(true);
    expect(defHasRandomElementChoice({ modifiers: ['Maximum [Random Element] Resist +1%'] })).toBe(
      true
    );
  });

  it('infers TSW-resolved max resist and rewrites when chosen', () => {
    expect(inferRandomElementFromLines(['Maximum Cold Resist +1%'])).toBe('cold');
    expect(
      resolveRandomElementInText('Maximum Cold Resist +1%', 'fire', { rewriteResolvedMax: true })
    ).toBe('Maximum Fire Resist +1%');
  });

  it('defaults Zann Esu catalog jewels to fire and can switch', () => {
    const row = {
      name: "Zann Esu's Stone",
      type: 'Jewel',
      quality: 'Unique',
      modifiers: ['5% Cast Speed', '+3% to Spell Damage', 'Maximum [Random Elemental] Resist +1%'],
    };
    const sock = socketableFromCatalogRow(row, 1);
    expect(sock?.randomElement).toBe('fire');
    expect(getSocketableBonusLines(sock, { category: 'armor' })).toContain(
      'Maximum Fire Resist +1%'
    );
    expect(
      getSocketableBonusLines({ ...sock, randomElement: 'poison' }, { category: 'armor' })
    ).toContain('Maximum Poison Resist +1%');
  });
});
