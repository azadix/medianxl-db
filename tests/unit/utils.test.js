import { describe, expect, it } from 'vitest';
import {
  calculateManaCost,
  formatManaCostDisplay,
  escapeHtmlText,
  sanitizeSkillId,
} from '@/shared/utils.js';

describe('escapeHtmlText', () => {
  it('escapes special characters', () => {
    expect(escapeHtmlText(`a&b<c>"d"`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;');
  });

  it('handles nullish', () => {
    expect(escapeHtmlText(null)).toBe('');
    expect(escapeHtmlText(undefined)).toBe('');
  });
});

describe('sanitizeSkillId', () => {
  it('strips unsafe characters', () => {
    expect(sanitizeSkillId('fire-ball_1')).toBe('fire-ball_1');
    expect(sanitizeSkillId('a/b<script>')).toBe('abscript');
  });
});

describe('calculateManaCost', () => {
  it('computes trunc(mana) + trunc(lvlmana)*(level-1) with manashift', () => {
    // base = 10 + 2*(5-1) = 18; shift 8 => 18 * 256 / 256 = 18
    expect(calculateManaCost(10, 2, 8, 5)).toBe(18);
  });

  it('clamps level to at least 1', () => {
    expect(calculateManaCost(10, 2, 8, 0)).toBe(10);
  });

  it('applies minMana floor', () => {
    expect(calculateManaCost(1, 0, 8, 1, 5)).toBe(5);
  });

  it('supports channeled fractional costs', () => {
    const cost = calculateManaCost(10, 0, 7, 1, undefined, { channeled: true });
    // 10 * 128 / 256 = 5
    expect(cost).toBe(5);
  });
});

describe('formatManaCostDisplay', () => {
  it('formats integers as strings', () => {
    expect(formatManaCostDisplay(12)).toBe('12');
  });

  it('formats channeled costs to one decimal', () => {
    expect(formatManaCostDisplay(5, { channeled: true })).toBe('5.0');
    expect(formatManaCostDisplay(5.26, { channeled: true })).toBe('5.3');
  });
});
