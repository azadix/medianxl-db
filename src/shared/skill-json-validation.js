/**
 * Shape validation for catalog rows, variants, and scalingConstants.
 * Shared by the skill editor Apply path and Vitest data tests.
 * @module src/shared/skill-json-validation
 */

export const KNOWN_FORMULA_FUNCTIONS = Object.freeze(
  new Set([
    'floor',
    'ceil',
    'round',
    'min',
    'max',
    'pow',
    'frames',
    'range',
    'bool',
    'cond',
    'tree',
    'if',
    'ln',
    'dm',
  ])
);

export const KNOWN_FORMULA_VARIABLES = Object.freeze(
  new Set([
    'lvl',
    'blvl',
    'slvl',
    'ulvl',
  ])
);

export const SCALING_VALUE_SLOTS = Object.freeze(['value0', 'value1', 'value2', 'value3']);

const OVERRIDE_KEYS = Object.freeze([
  'description_override',
  'skill_effect_override',
  'restriction_override',
]);

const FUNC_CALL_RE = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
const TREE_CALL_RE = /\btree\((\d+)\)/g;
const FORMULA_HINT_RE =
  /\[\[|\{\{|\b(?:lvl|blvl|slvl|ulvl)\b|\b(?:floor|ceil|round|min|max|pow|frames|range|bool|cond|tree|if|ln|dm)\s*\(/;

/**
 * @param {string} value
 * @returns {boolean}
 */
export function looksLikeFormula(value) {
  const text = String(value || '');
  return FORMULA_HINT_RE.test(text) || /[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(text);
}

/**
 * @param {string} value
 * @param {string} origin
 * @returns {string[]}
 */
export function validateFormulaLikeValue(value, origin) {
  const failures = [];
  const text = String(value || '');
  if (!text || !looksLikeFormula(text)) return failures;

  for (const [open, close, label] of [
    ['(', ')', '()'],
    ['{', '}', '{}'],
    ['[', ']', '[]'],
  ]) {
    const openCount = (text.match(new RegExp(`\\${open}`, 'g')) || []).length;
    const closeCount = (text.match(new RegExp(`\\${close}`, 'g')) || []).length;
    if (openCount !== closeCount) {
      failures.push(`${origin}: unbalanced ${label} in '${text}'`);
    }
  }

  for (const match of text.matchAll(FUNC_CALL_RE)) {
    const func = match[1];
    if (!KNOWN_FORMULA_FUNCTIONS.has(func) && !KNOWN_FORMULA_VARIABLES.has(func)) {
      failures.push(`${origin}: unknown function '${func}(' in '${text}'`);
    }
  }

  return failures;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyStringArrayOrNull(value) {
  if (value == null) return true;
  if (!Array.isArray(value)) return false;
  return value.every((x) => typeof x === 'string');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isStringArray(value) {
  return Array.isArray(value) && value.every((x) => typeof x === 'string');
}

/**
 * @param {unknown} row
 * @param {string} key
 * @param {string[]} failures
 * @param {string} prefix
 */
function requireNonEmptyString(row, key, failures, prefix) {
  const value = row[key];
  if (typeof value !== 'string' || value.trim() === '') {
    failures.push(`${prefix}${key} must be a non-empty string`);
  }
}

/**
 * @param {unknown} row
 * @param {string} key
 * @param {string[]} failures
 * @param {string} prefix
 */
function requireFiniteNumber(row, key, failures, prefix) {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failures.push(`${prefix}${key} must be a finite number`);
  }
}

/**
 * @param {unknown} row
 * @param {string} key
 * @param {string[]} failures
 * @param {string} prefix
 */
function requireBoolean(row, key, failures, prefix) {
  if (typeof row[key] !== 'boolean') {
    failures.push(`${prefix}${key} must be a boolean`);
  }
}

/**
 * @param {unknown} row
 * @param {string} key
 * @param {string[]} failures
 * @param {string} prefix
 */
function requireStringArray(row, key, failures, prefix) {
  if (!isStringArray(row[key])) {
    failures.push(`${prefix}${key} must be an array of strings`);
  }
}

/**
 * @param {unknown} row
 * @param {string} key
 * @param {string[]} failures
 * @param {string} prefix
 */
function requireArray(row, key, failures, prefix) {
  if (!Array.isArray(row[key])) {
    failures.push(`${prefix}${key} must be an array`);
  }
}

/**
 * Structural shape check for one skills.json catalog row.
 * @param {unknown} row
 * @returns {string[]}
 */
export function validateSkillCatalogRow(row) {
  const failures = [];
  if (row == null || typeof row !== 'object' || Array.isArray(row)) {
    return ['skill row must be an object'];
  }

  const prefix = typeof row.id === 'string' && row.id.trim() ? `${row.id}: ` : '';

  requireNonEmptyString(row, 'id', failures, prefix);
  requireNonEmptyString(row, 'displayName', failures, prefix);
  requireFiniteNumber(row, 'classId', failures, prefix);
  requireFiniteNumber(row, 'tab', failures, prefix);
  requireNonEmptyString(row, 'class', failures, prefix);
  requireNonEmptyString(row, 'tabName', failures, prefix);
  requireStringArray(row, 'tags', failures, prefix);
  requireFiniteNumber(row, 'baseMaxLevel', failures, prefix);
  requireBoolean(row, 'affectedBySpecialization', failures, prefix);
  requireArray(row, 'variants', failures, prefix);
  requireArray(row, 'scalingConstants', failures, prefix);
  requireStringArray(row, 'description', failures, prefix);
  requireStringArray(row, 'restriction', failures, prefix);
  requireStringArray(row, 'skillEffect', failures, prefix);

  if (row.image != null && row.image !== '') {
    if (typeof row.image !== 'string') {
      failures.push(`${prefix}image must be a string when set`);
    }
  }

  if (row.showCondition != null) {
    requireStringArray(row, 'showCondition', failures, prefix);
  }

  return failures;
}

/**
 * Structural shape check for one subskills.json catalog row.
 * @param {unknown} row
 * @returns {string[]}
 */
export function validateSubskillCatalogRow(row) {
  const failures = [];
  if (row == null || typeof row !== 'object' || Array.isArray(row)) {
    return ['subskill row must be an object'];
  }

  const prefix = typeof row.id === 'string' && row.id.trim() ? `${row.id}: ` : '';

  requireNonEmptyString(row, 'id', failures, prefix);
  requireNonEmptyString(row, 'displayName', failures, prefix);
  requireNonEmptyString(row, 'parentSkillId', failures, prefix);
  requireArray(row, 'scalingConstants', failures, prefix);
  requireStringArray(row, 'description', failures, prefix);
  requireStringArray(row, 'skillEffect', failures, prefix);

  // Present on disk; editor may omit. When set, must be string[].
  if (row.restriction != null) {
    requireStringArray(row, 'restriction', failures, prefix);
  }

  if (row.activeWhenTabPoints != null) {
    requireFiniteNumber(row, 'activeWhenTabPoints', failures, prefix);
  }
  if (row.activeWhenSkillPoints != null) {
    requireNonEmptyString(row, 'activeWhenSkillPoints', failures, prefix);
  }
  if (row.showCondition != null) {
    requireStringArray(row, 'showCondition', failures, prefix);
  }

  return failures;
}

/**
 * @param {unknown} variants
 * @returns {string[]}
 */
export function validateVariantsArray(variants) {
  const failures = [];
  if (!Array.isArray(variants)) {
    return ['variants must be a JSON array'];
  }

  const seenKeys = new Set();
  variants.forEach((row, index) => {
    const label = `variants[${index}]`;
    if (row == null || typeof row !== 'object' || Array.isArray(row)) {
      failures.push(`${label}: must be an object`);
      return;
    }
    const key = row.variant_key;
    if (typeof key !== 'string' || key.trim() === '') {
      failures.push(`${label}: variant_key must be a non-empty string`);
    } else {
      if (seenKeys.has(key)) {
        failures.push(`${label}: duplicate variant_key '${key}'`);
      }
      seenKeys.add(key);
    }
    if (row.sort_order != null && typeof row.sort_order !== 'number') {
      failures.push(`${label}: sort_order must be a number when present`);
    }
    for (const field of OVERRIDE_KEYS) {
      if (!isNonEmptyStringArrayOrNull(row[field])) {
        failures.push(`${label}: ${field} must be null or an array of strings`);
      }
    }
  });

  return failures;
}

/**
 * @param {unknown} rows
 * @param {{
 *   statsByKeyLower?: Map<string, unknown> | Set<string>,
 *   variantKeys?: Set<string> | Iterable<string>,
 *   tabIds?: Set<number> | Iterable<number>,
 *   skillId?: string,
 * }} [ctx]
 * @returns {string[]}
 */
export function validateScalingConstantsArray(rows, ctx = {}) {
  const failures = [];
  if (!Array.isArray(rows)) {
    return ['scalingConstants must be a JSON array'];
  }

  const statsByKeyLower = ctx.statsByKeyLower ?? null;
  const variantKeys = ctx.variantKeys
    ? ctx.variantKeys instanceof Set
      ? ctx.variantKeys
      : new Set(ctx.variantKeys)
    : new Set();
  const tabIds = ctx.tabIds
    ? ctx.tabIds instanceof Set
      ? ctx.tabIds
      : new Set(ctx.tabIds)
    : null;
  const skillPrefix = ctx.skillId ? `${ctx.skillId}: ` : '';

  const hasStat = (key) => {
    if (!statsByKeyLower) return true;
    const k = String(key).toLowerCase();
    if (statsByKeyLower instanceof Map) return statsByKeyLower.has(k);
    if (statsByKeyLower instanceof Set) return statsByKeyLower.has(k);
    return false;
  };

  rows.forEach((sc, index) => {
    const label = `${skillPrefix}scalingConstants[${index}]`;
    if (sc == null || typeof sc !== 'object' || Array.isArray(sc)) {
      failures.push(`${label}: must be an object`);
      return;
    }

    const statKey = String(sc.statKey || '');
    if (!statKey.trim()) {
      failures.push(`${label}: empty statKey`);
    } else if (!hasStat(statKey)) {
      failures.push(`${label}: unknown statKey '${statKey}'`);
    }

    const occ = sc.occurrenceIndex;
    if (occ != null && (!Number.isInteger(occ) || occ < 0)) {
      failures.push(`${label}: invalid occurrenceIndex ${JSON.stringify(occ)}`);
    }

    const variantKey = sc.variantKey || '';
    if (variantKey && !variantKeys.has(variantKey)) {
      failures.push(
        `${label}: unknown variantKey '${variantKey}' for stat '${statKey || '?'}'`
      );
    }

    const hasValue = SCALING_VALUE_SLOTS.some((slot) => String(sc[slot] ?? '').trim() !== '');
    if (!hasValue) {
      failures.push(`${label}: empty scaling row for '${statKey || '?'}'`);
    }

    for (const slot of SCALING_VALUE_SLOTS) {
      const value = sc[slot];
      if (value == null || String(value).trim() === '') continue;
      failures.push(
        ...validateFormulaLikeValue(String(value), `${label}.${slot}`)
      );
    }

    if (tabIds) {
      for (const slot of SCALING_VALUE_SLOTS) {
        const value = String(sc[slot] ?? '');
        for (const match of value.matchAll(TREE_CALL_RE)) {
          const tabId = Number.parseInt(match[1], 10);
          if (!tabIds.has(tabId)) {
            failures.push(`${label}.${slot}: tree(${tabId}) references unknown tab id`);
          }
        }
      }
    }
  });

  return failures;
}

/**
 * Build a lowercase stat-key Set from stats.json rows.
 * @param {Array<{ key?: string }>} statsRows
 * @returns {Set<string>}
 */
export function statsKeysLowerFromRows(statsRows) {
  const out = new Set();
  for (const row of statsRows || []) {
    if (row?.key) out.add(String(row.key).toLowerCase());
  }
  return out;
}

/**
 * @param {Array<{ variant_key?: string }>} variants
 * @returns {Set<string>}
 */
export function variantKeysFromVariants(variants) {
  const out = new Set();
  if (!Array.isArray(variants)) return out;
  for (const v of variants) {
    if (v?.variant_key) out.add(String(v.variant_key));
  }
  return out;
}
