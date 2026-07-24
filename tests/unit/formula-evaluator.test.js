import { describe, expect, it } from 'vitest';
import { parseFormula, evaluateFormula } from '@/skills/domain/formula-evaluator.js';

describe('parseFormula', () => {
  it('accepts simple arithmetic', () => {
    expect(parseFormula('lvl + 3').success).toBe(true);
  });

  it('rejects empty formulas', () => {
    expect(parseFormula('').success).toBe(false);
    expect(parseFormula('   ').success).toBe(false);
  });

  it('rejects unbalanced parentheses', () => {
    expect(parseFormula('(lvl + 1').success).toBe(false);
    expect(parseFormula('lvl + 1)').success).toBe(false);
  });
});

describe('evaluateFormula', () => {
  it('evaluates arithmetic with variables', () => {
    const result = evaluateFormula('lvl * 2 + 1', { lvl: 10 });
    expect(result.success).toBe(true);
    expect(result.value).toBe(21);
  });

  it('supports floor()', () => {
    const result = evaluateFormula('floor(lvl / 3)', { lvl: 10 });
    expect(result.success).toBe(true);
    expect(result.value).toBe(3);
  });

  it('fails on undefined variables', () => {
    const result = evaluateFormula('missing_stat + 1', {});
    expect(result.success).toBe(false);
  });
});
