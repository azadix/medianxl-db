import { describe, expect, it } from 'vitest';
import { loadActiveTreeData } from '../helpers/tree-data.js';

const KNOWN_FUNCTIONS = new Set([
  'floor', 'ceil', 'round', 'min', 'max', 'pow',
  'frames', 'range', 'bool', 'tree', 'if', 'ln', 'dm',
]);
const KNOWN_VARIABLES = new Set([
  'lvl', 'blvl', 'slvl', 'ulvl', 'calc',
  'calc1', 'calc2', 'calc3', 'calc4', 'calc5', 'calc6',
]);
const VALUE_SLOTS = ['value0', 'value1', 'value2', 'value3'];
const FUNC_CALL_RE = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
const TREE_CALL_RE = /\btree\((\d+)\)/g;
const FORMULA_HINT_RE =
  /\[\[|\{\{|\b(?:lvl|blvl|slvl|ulvl|calc[1-6]?)\b|\b(?:floor|ceil|round|min|max|pow|frames|range|bool|tree|if|ln|dm)\s*\(/;

const data = loadActiveTreeData();
const { skills, subskills, statsMap, gameMeta } = data;

function* scalingRows() {
  for (const row of [...skills, ...subskills]) {
    for (const sc of row.scalingConstants || []) {
      yield [row, sc];
    }
  }
}

function looksLikeFormula(value) {
  return FORMULA_HINT_RE.test(value);
}

describe('scalingConstants', () => {
  it('requires statKey to exist in stats.json', () => {
    const failures = [];
    for (const [row, sc] of scalingRows()) {
      const key = String(sc.statKey || '');
      if (!key) failures.push(`${row.id}: scalingConstants row with empty statKey`);
      else if (!statsMap.has(key.toLowerCase())) {
        failures.push(`${row.id}: unknown scaling statKey '${key}'`);
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires variantKey to match a skill variant when set', () => {
    const failures = [];
    for (const [row, sc] of scalingRows()) {
      const variantKey = sc.variantKey || '';
      if (!variantKey) continue;
      const variantKeys = new Set((row.variants || []).map((v) => v.variant_key));
      if (!variantKeys.has(variantKey)) {
        failures.push(
          `${row.id}: scaling row for '${sc.statKey}' references unknown variantKey '${variantKey}'`
        );
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('requires each scaling row to have values or band fields', () => {
    const failures = [];
    for (const [row, sc] of scalingRows()) {
      const hasValue = VALUE_SLOTS.some((slot) => String(sc[slot] || '').trim());
      const hasBand =
        sc.baseMin != null || sc.baseMax != null || sc.damageModel;
      if (!hasValue && !hasBand) {
        failures.push(`${row.id}: empty scaling row for '${sc.statKey}'`);
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires formula-like values to use known functions and balanced brackets', () => {
    const failures = [];
    for (const [row, sc] of scalingRows()) {
      for (const slot of VALUE_SLOTS) {
        const value = String(sc[slot] || '');
        if (!value || !looksLikeFormula(value)) continue;
        const origin = `${row.id} [scaling:${sc.statKey}.${slot}]`;
        for (const [open, close, label] of [
          ['(', ')', '()'],
          ['{', '}', '{}'],
          ['[', ']', '[]'],
        ]) {
          if (
            (value.match(new RegExp(`\\${open}`, 'g')) || []).length !==
            (value.match(new RegExp(`\\${close}`, 'g')) || []).length
          ) {
            failures.push(`${origin}: unbalanced ${label} in '${value}'`);
          }
        }
        for (const match of value.matchAll(FUNC_CALL_RE)) {
          const func = match[1];
          if (!KNOWN_FUNCTIONS.has(func) && !KNOWN_VARIABLES.has(func)) {
            failures.push(`${origin}: unknown function '${func}(' in '${value}'`);
          }
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires tree(N) to reference existing classTabs', () => {
    const tabIds = new Set((gameMeta.classTabs || []).map((t) => t.id));
    const failures = [];
    for (const [row, sc] of scalingRows()) {
      for (const slot of VALUE_SLOTS) {
        const value = String(sc[slot] || '');
        for (const match of value.matchAll(TREE_CALL_RE)) {
          const tabId = Number.parseInt(match[1], 10);
          if (!tabIds.has(tabId)) {
            failures.push(
              `${row.id} [scaling:${sc.statKey}.${slot}]: tree(${tabId}) references unknown tab id`
            );
          }
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('requires occurrenceIndex to be a non-negative integer when set', () => {
    const failures = [];
    for (const [row, sc] of scalingRows()) {
      const occ = sc.occurrenceIndex;
      if (occ == null) continue;
      if (!Number.isInteger(occ) || occ < 0) {
        failures.push(`${row.id}: invalid occurrenceIndex ${JSON.stringify(occ)} for '${sc.statKey}'`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
