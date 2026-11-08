import { describe, expect, it } from 'vitest';
import { canAddPoints } from '@/tree/skill-point-guard.js';

describe('skill point plus button guard', () => {
  it('disables adding when the pool is exhausted', () => {
    expect(canAddPoints(true, 5, 20, 0)).toBe(false);
    expect(canAddPoints(true, 5, 20, 1)).toBe(true);
  });

  it('keeps the existing max/allocate restrictions', () => {
    expect(canAddPoints(false, 5, 20, 10)).toBe(false);
    expect(canAddPoints(true, 20, 20, 10)).toBe(false);
  });
});
