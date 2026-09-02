import { describe, expect, it } from 'vitest';
import {
  calculateManaCost,
  formatManaCostDisplay,
  calculateMinionManaCost,
  formatMinionManaCostDisplay,
  applyManaCostMultiplier,
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

  it('includes mana_cost_of_skills in lvlmana (Dragonbone 35/57/79)', () => {
    // mana=35, lvlmana=20, manashift=8; pct = 10+lvl/2
    expect(calculateManaCost(35, 20, 8, 1, undefined, { manaCostOfSkillsPercent: 10 })).toBe(35);
    expect(calculateManaCost(35, 20, 8, 2, undefined, { manaCostOfSkillsPercent: 11 })).toBe(57);
    expect(calculateManaCost(35, 20, 8, 3, undefined, { manaCostOfSkillsPercent: 11 })).toBe(79);
    // before bonus at blvl 2
    expect(calculateManaCost(35, 20, 8, 2)).toBe(55);
  });
});

describe('applyManaCostMultiplier', () => {
  it('leaves cost unchanged at 0%', () => {
    expect(applyManaCostMultiplier(35, 0)).toBe(35);
  });

  it('scales an already-computed cost by (100+pct)/100', () => {
    expect(applyManaCostMultiplier(100, 25)).toBe(125);
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

describe('calculateMinionManaCost', () => {
  it('uses value1 as percent of max mana', () => {
    expect(calculateMinionManaCost(15)).toEqual({
      percent: 15,
      cost: null,
      mode: 'percent',
    });
  });

  it('supports decimal percent display', () => {
    expect(calculateMinionManaCost(4.5)).toEqual({
      percent: 4.5,
      cost: null,
      mode: 'percent',
    });
  });

  it('matches game integer path at skill level 55', () => {
    // trunc(4922/100)=49; 25*49=1225; trunc(1225/54)=22; 1+22*54=1189
    expect(calculateMinionManaCost(25, 4922, 55)).toEqual({
      percent: 25,
      cost: 1189,
      mode: 'absolute',
    });
  });

  it('matches game integer path at skill level 25', () => {
    // trunc(4922/100)=49; 25*49=1225; trunc(1225/24)=51; 1+51*24=1225
    expect(calculateMinionManaCost(25, 4922, 25)).toEqual({
      percent: 25,
      cost: 1225,
      mode: 'absolute',
    });
  });

  it('applies mana=1 base via calculateManaCost', () => {
    // trunc(1000/100)=10; 15*10=150; trunc(150/24)=6; 1+6*24=145
    expect(calculateMinionManaCost(15, 1000, 25)).toEqual({
      percent: 15,
      cost: 145,
      mode: 'absolute',
    });
  });

  it('truncates fractional percent for cost math', () => {
    // trunc(4.5)=4; trunc(333/100)=3; 4*3=12; trunc(12/24)=0; 1+0=1 (minmana)
    expect(calculateMinionManaCost(4.5, 333, 25).cost).toBe(1);
  });
});

describe('formatMinionManaCostDisplay', () => {
  it('formats percent mode with missing flat cost', () => {
    expect(formatMinionManaCostDisplay({ percent: 15, cost: null, mode: 'percent' })).toEqual({
      value0: null,
      value1: '15',
    });
  });

  it('formats decimal percent mode', () => {
    expect(formatMinionManaCostDisplay({ percent: 4.5, cost: null, mode: 'percent' })).toEqual({
      value0: null,
      value1: '4.5',
    });
  });

  it('formats absolute mode with both slots', () => {
    expect(formatMinionManaCostDisplay({ percent: 15, cost: 150, mode: 'absolute' })).toEqual({
      value0: '150',
      value1: '15',
    });
  });
});
