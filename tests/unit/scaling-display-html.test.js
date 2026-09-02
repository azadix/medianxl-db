import { describe, expect, it } from 'vitest';
import {
  applyStatValueSign,
  formatScalingValuesToDescriptionHtml,
  isValueSlotSigned,
} from '@/skills/domain/scaling-display-html.js';

describe('isValueSlotSigned', () => {
  it('treats true as all slots', () => {
    expect(isValueSlotSigned(true, 0)).toBe(true);
    expect(isValueSlotSigned(true, 3)).toBe(true);
  });

  it('supports per-slot arrays', () => {
    expect(isValueSlotSigned([0], 0)).toBe(true);
    expect(isValueSlotSigned([0], 1)).toBe(false);
    expect(isValueSlotSigned([0, 2], 2)).toBe(true);
  });

  it('is off when unset', () => {
    expect(isValueSlotSigned(undefined, 0)).toBe(false);
    expect(isValueSlotSigned(false, 0)).toBe(false);
  });
});

describe('applyStatValueSign', () => {
  it('prefixes + for non-negative numbers when signed', () => {
    expect(applyStatValueSign('20', true)).toBe('+20');
    expect(applyStatValueSign(0, true)).toBe('+0');
    expect(applyStatValueSign('12.5', true)).toBe('+12.5');
  });

  it('keeps negatives as-is', () => {
    expect(applyStatValueSign('-20', true)).toBe('-20');
  });

  it('leaves formulas and empty alone', () => {
    expect(applyStatValueSign('lvl', true)).toBe('lvl');
    expect(applyStatValueSign('10+lvl/2', true)).toBe('10+lvl/2');
    expect(applyStatValueSign('', true)).toBe('');
  });

  it('does nothing when not signed', () => {
    expect(applyStatValueSign('20', false)).toBe('20');
  });
});

describe('formatScalingValuesToDescriptionHtml signed', () => {
  it('shows + for mana_cost_multiplier-style stats', () => {
    const html = formatScalingValuesToDescriptionHtml(
      {
        format: '{value0}% Mana cost of skills',
        value0: '20',
        value0_constant: true,
        signed: true,
      },
      'mana_cost_multiplier'
    );
    expect(html).toContain('>+20</span>% Mana cost of skills');
  });

  it('shows - for negative values', () => {
    const html = formatScalingValuesToDescriptionHtml(
      {
        format: '{value0}% Mana cost of skills',
        value0: '-15',
        value0_constant: true,
        signed: true,
      },
      'mana_cost_multiplier'
    );
    expect(html).toContain('>-15</span>% Mana cost of skills');
  });

  it('only signs listed slots', () => {
    const html = formatScalingValuesToDescriptionHtml(
      {
        format: '{value0}/{value1}',
        value0: '5',
        value1: '10',
        value0_constant: true,
        value1_constant: true,
        signed: [0],
      },
      'example'
    );
    expect(html).toContain('>+5</span>/');
    expect(html).toContain('>10</span>');
    expect(html).not.toContain('>+10');
  });
});
