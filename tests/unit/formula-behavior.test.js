/**
 * Formula behavior: built-in function semantics plus a sweep that evaluates every
 * scaling formula in the active skills.json/subskills.json the same way the app does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateFormula } from '@/skills/domain/formula-evaluator.js';
import { getActiveTreeDataDir } from '../helpers/mock-fetch-tree-data.js';

describe('built-in function behavior', () => {
  const cases = [
    ['floor(5.7)', {}, 5],
    ['ceil(5.2)', {}, 6],
    // Final results are truncated to integers (D2 behavior) unless frames()/range() used
    ['round(5.678, 2)', {}, 5],
    ['min(5, 10, 3)', {}, 3],
    ['max(5, 10, 3)', {}, 10],
    ['pow(2, 3)', {}, 8],
    ['bool(0)', {}, 0],
    ['bool(5)', {}, 1],
    // frames: 25 fps, floored to 0.01
    ['frames(25)', {}, 1],
    ['frames(50)', {}, 2],
    // range: feet to yards with 1/3-feet steps
    ['range(3)', {}, 1],
    ['range(4)', {}, 1.3],
    ['range(6)', {}, 2],
    // if with comparisons
    ['if(lvl <= 22, 5*lvl, 0)', { lvl: 10 }, 50],
    ['if(lvl <= 22, 5*lvl, 0)', { lvl: 30 }, 0],
    ['if(lvl == 5, 1, 2)', { lvl: 5 }, 1],
    ['if(lvl != 5, 1, 2)', { lvl: 5 }, 2],
  ];

  it.each(cases)('%s with %o = %d', (formula, variables, expected) => {
    const result = evaluateFormula(formula, variables);
    expect(result.success, result.error).toBe(true);
    expect(result.value).toBe(expected);
  });

  it('truncates plain integer math but preserves frames()/range() decimals', () => {
    expect(evaluateFormula('lvl/3', { lvl: 10 }).value).toBe(3);
    expect(evaluateFormula('frames(1)', {}).value).toBeCloseTo(0.04, 5);
  });

  it('evaluates with float math internally, truncating only the final result', () => {
    expect(evaluateFormula('1/3*lvl', { lvl: 10 }).value).toBe(3);
    expect(evaluateFormula('lvl/3', { lvl: 10 }).value).toBe(3);
  });

  it('tree() returns 0 without character state instead of failing', () => {
    const result = evaluateFormula('tree(24)', {});
    expect(result.success, result.error).toBe(true);
    expect(result.value).toBe(0);
  });

  it('tree() sums blvl from treeSkillsCache and [[skill]] subtracts that skill blvl', () => {
    const characterState = {
      blvl: { frostborn: 1, ice_bolt: 5, glacial_spike: 10 },
      lvl: {},
      level: 50,
      stats: {},
      treeSkillsCache: {
        13: ['frostborn', 'ice_bolt', 'glacial_spike'],
      },
    };
    const result = evaluateFormula('5*(tree(13)-[[frostborn]])', {
      blvl: 1,
      slvl: 0,
      lvl: 1,
      ulvl: 50,
      _blvl: characterState.blvl,
      _lvl: characterState.lvl,
      characterState,
    });
    expect(result.success, result.error).toBe(true);
    // (1+5+10 - 1) * 5
    expect(result.value).toBe(75);
  });
});

describe('scaling formula sweep (real data)', () => {
  const dataDir = getActiveTreeDataDir();
  const skills = JSON.parse(readFileSync(join(dataDir, 'skills.json'), 'utf8'));
  let subskills = [];
  try {
    subskills = JSON.parse(readFileSync(join(dataDir, 'subskills.json'), 'utf8'));
  } catch {
    /* optional */
  }

  const FORMULA_HINT_RE =
    /\[\[|\{\{|\b(?:lvl|blvl|slvl|ulvl)\b|\b(?:floor|ceil|round|min|max|pow|frames|range|bool|tree|if|ln|dm)\s*\(/;
  const STAT_REF_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const COMPOUND_REF_RE = /\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]\.\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

  function collectFormulas() {
    const out = [];
    for (const row of [...skills, ...subskills]) {
      for (const sc of row.scalingConstants || []) {
        for (const slot of ['value0', 'value1', 'value2', 'value3']) {
          const raw = sc[slot];
          if (raw == null) continue;
          const value = String(raw);
          if (!value.trim() || !FORMULA_HINT_RE.test(value)) continue;
          out.push({ skillId: row.id, statKey: sc.statKey, slot, formula: value });
        }
      }
    }
    return out;
  }

  const SKILL_REF_RE = /\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]/g;

  function buildVariables(formula, level) {
    // Compound [[skill]].{{stat}} tokens are resolved by Skill.js before evaluation;
    // substitute a plain number the same way (numeric literal).
    const prepared = formula.replace(COMPOUND_REF_RE, '7');

    const stats = {};
    for (const match of prepared.matchAll(STAT_REF_RE)) {
      stats[match[1].toLowerCase()] = 100;
    }
    const blvlMap = {};
    for (const match of prepared.matchAll(SKILL_REF_RE)) {
      blvlMap[match[1]] = 1;
    }

    return {
      prepared,
      variables: {
        lvl: level,
        blvl: level,
        slvl: 0,
        ulvl: Math.min(150, level * 2),
        characterState: {
          level: Math.min(150, level * 2),
          stats,
          blvl: blvlMap,
          lvl: {},
          treeSkillsCache: {},
        },
        _blvl: blvlMap,
      },
    };
  }

  const formulas = collectFormulas();

  it('found a meaningful number of formulas to test', () => {
    expect(formulas.length).toBeGreaterThan(300);
  });

  it.each([1, 25, 60])('every scaling formula evaluates at level %i', (level) => {
    const failures = [];
    for (const { skillId, statKey, slot, formula } of formulas) {
      const { prepared, variables } = buildVariables(formula, level);
      const result = evaluateFormula(prepared, variables);
      if (!result.success) {
        failures.push(`${skillId} [${statKey}.${slot}] "${formula}": ${result.error}`);
      } else if (!Number.isFinite(result.value)) {
        failures.push(`${skillId} [${statKey}.${slot}] "${formula}": non-finite result`);
      }
    }
    expect(failures, failures.slice(0, 15).join('\n')).toEqual([]);
  });

  it('formulas using blvl scale with level for a known case', () => {
    // Reckoning of Zerae: value0 = 5*blvl
    const atOne = evaluateFormula('5*blvl', { blvl: 1 });
    const atTen = evaluateFormula('5*blvl', { blvl: 10 });
    expect(atOne.value).toBe(5);
    expect(atTen.value).toBe(50);
  });
});
