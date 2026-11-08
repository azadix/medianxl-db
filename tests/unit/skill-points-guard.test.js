import { describe, expect, it } from 'vitest';
import { canAddPoints } from '@/tree/skill-point-guard.js';

describe('skill point plus button guard', () => {
  it('keeps the max/allocate restrictions', () => {
    expect(canAddPoints(true, 5, 20)).toBe(true);
    expect(canAddPoints(false, 5, 20)).toBe(false);
    expect(canAddPoints(true, 20, 20)).toBe(false);
  });
});
