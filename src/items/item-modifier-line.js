/**
 * Encode/decode wiki item-mod colors on catalog modifier strings.
 * Orange unique text uses `{orange}`; grey effect lines under it use `{grey}`.
 * Optional planner gates use `{cond:while_in_heroic_duncraig}` (one or more).
 * @module items/item-modifier-line
 */

import { isConditionSelected } from '@/stores/planner-config-store.js';

export const MODIFIER_COLOR_MAGIC = 'magic';
export const MODIFIER_COLOR_ORANGE = 'orange';
export const MODIFIER_COLOR_GREY = 'grey';
/** Non-baseline extras (MOs / jewels / corruption leftovers). */
export const MODIFIER_COLOR_ADDED = 'added';
/** Catalog affix whose rolled value is outside the unique min/max. */
export const MODIFIER_COLOR_BOOSTED = 'boosted';

const COLOR_PREFIX_RE = /^\{(orange|grey|added|boosted)\}/;
const COND_PREFIX_RE = /^\{cond:([a-zA-Z0-9_]+)\}/;

/** @type {ReadonlyArray<{ re: RegExp, key: string }>} */
const TEXT_CONDITION_HINTS = Object.freeze([
  { re: /\bin\s+Heroic\s+Duncraig\b/i, key: 'while_in_heroic_duncraig' },
  { re: /\bin\s+Duncraig\s+130\+?\b/i, key: 'while_in_heroic_duncraig' },
  { re: /\bin\s+Heroic\s+Library\b/i, key: 'while_in_heroic_library' },
  { re: /\bin\s+Library\s+of\s+Fate\b/i, key: 'while_in_heroic_library' },
]);

/**
 * @param {string|null|undefined} className
 * @returns {string}
 */
export function modifierColorFromWikiClass(className) {
  const names = String(className || '')
    .toLowerCase()
    .split(/\s+/);
  if (names.includes('item-orange') || names.includes('mxl-orange') || names.includes('mxl-unique')) {
    return MODIFIER_COLOR_ORANGE;
  }
  if (names.includes('item-runeword') || names.includes('mxl-grey')) return MODIFIER_COLOR_GREY;
  if (names.includes('item-magic') || names.includes('mxl-magic')) return MODIFIER_COLOR_MAGIC;
  if (names.includes('item-basic') || names.includes('mxl-basic')) return 'basic';
  if (names.includes('mxl-tan')) return MODIFIER_COLOR_ORANGE;
  if (names.includes('item-red') || names.includes('mxl-red')) return 'red';
  if (names.includes('item-set') || names.includes('mxl-set')) return 'set';
  if (names.includes('item-darkgreen') || names.includes('mxl-darkgreen')) return 'darkgreen';
  return '';
}

/**
 * Infer planner condition keys from modifier display text (location-gated affixes).
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
export function inferShowConditionsFromModifierText(text) {
  const value = String(text || '');
  if (!value) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const hint of TEXT_CONDITION_HINTS) {
    if (!hint.re.test(value)) continue;
    const key = hint.key.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hint.key);
  }
  return out;
}

/**
 * @param {string|null|undefined} text
 * @param {string|null|undefined} color
 * @param {string[]|null|undefined} [showCondition]
 * @returns {string}
 */
export function encodeModifierLine(text, color, showCondition = null) {
  const value = String(text || '').trim();
  if (!value) return '';
  let out = value;
  if (color === MODIFIER_COLOR_ORANGE) out = `{orange}${out}`;
  else if (color === MODIFIER_COLOR_GREY) out = `{grey}${out}`;
  else if (color === MODIFIER_COLOR_ADDED) out = `{added}${out}`;
  else if (color === MODIFIER_COLOR_BOOSTED) out = `{boosted}${out}`;
  const conds = Array.isArray(showCondition)
    ? showCondition.filter((k) => k != null && String(k).trim() !== '')
    : [];
  for (let i = conds.length - 1; i >= 0; i--) {
    out = `{cond:${String(conds[i]).trim()}}${out}`;
  }
  return out;
}

/**
 * Mark a modifier line as non-baseline (extras). Preserves orange/grey if present.
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function markModifierLineAdded(line) {
  const raw = String(line ?? '').trim();
  if (!raw) return '';
  const decoded = decodeModifierLine(raw);
  if (decoded.color === MODIFIER_COLOR_ADDED || decoded.color === MODIFIER_COLOR_BOOSTED) {
    return raw;
  }
  // Keep orange/grey as nested after {added} for rarer cases; decode reads first color only,
  // so prefer added as the display color and drop conflicting color prefixes from the text.
  return encodeModifierLine(decoded.text, MODIFIER_COLOR_ADDED, decoded.showCondition);
}

/**
 * Mark a catalog line as socket/MO-boosted past its roll range.
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function markModifierLineBoosted(line) {
  const raw = String(line ?? '').trim();
  if (!raw) return '';
  const decoded = decodeModifierLine(raw);
  if (decoded.color === MODIFIER_COLOR_ADDED || decoded.color === MODIFIER_COLOR_BOOSTED) {
    return raw;
  }
  return encodeModifierLine(decoded.text, MODIFIER_COLOR_BOOSTED, decoded.showCondition);
}

/**
 * @param {string|null|undefined} line
 * @returns {{ text: string, color: string, showCondition: string[] }}
 */
export function decodeModifierLine(line) {
  let raw = String(line ?? '');
  /** @type {string[]} */
  const explicit = [];
  const seen = new Set();

  while (true) {
    const condMatch = COND_PREFIX_RE.exec(raw);
    if (condMatch) {
      const key = String(condMatch[1] || '').trim();
      const keyLower = key.toLowerCase();
      if (key && !seen.has(keyLower)) {
        seen.add(keyLower);
        explicit.push(key);
      }
      raw = raw.slice(condMatch[0].length);
      continue;
    }
    const colorMatch = COLOR_PREFIX_RE.exec(raw);
    if (colorMatch) {
      const color = colorMatch[1];
      const text = raw.slice(colorMatch[0].length).trim();
      // Allow `{orange}{cond:...}text` or `{cond:...}{orange}text`
      let rest = text;
      while (true) {
        const nestedCond = COND_PREFIX_RE.exec(rest);
        if (!nestedCond) break;
        const key = String(nestedCond[1] || '').trim();
        const keyLower = key.toLowerCase();
        if (key && !seen.has(keyLower)) {
          seen.add(keyLower);
          explicit.push(key);
        }
        rest = rest.slice(nestedCond[0].length).trim();
      }
      const inferred = inferShowConditionsFromModifierText(rest);
      for (const key of inferred) {
        const keyLower = key.toLowerCase();
        if (seen.has(keyLower)) continue;
        seen.add(keyLower);
        explicit.push(key);
      }
      return { text: rest, color, showCondition: explicit };
    }
    break;
  }

  const text = raw.trim();
  const inferred = inferShowConditionsFromModifierText(text);
  for (const key of inferred) {
    const keyLower = key.toLowerCase();
    if (seen.has(keyLower)) continue;
    seen.add(keyLower);
    explicit.push(key);
  }
  return { text, color: MODIFIER_COLOR_MAGIC, showCondition: explicit };
}

/**
 * Whether the line is a non-baseline extra (asterisks in tooltip).
 * @param {string|null|undefined} line
 * @returns {boolean}
 */
export function isAddedModifierLine(line) {
  return decodeModifierLine(line).color === MODIFIER_COLOR_ADDED;
}

/**
 * Whether the line is a catalog affix boosted past its range (color only, no asterisks).
 * @param {string|null|undefined} line
 * @returns {boolean}
 */
export function isBoostedModifierLine(line) {
  return decodeModifierLine(line).color === MODIFIER_COLOR_BOOSTED;
}

const RANDOM_REANIMATE_RE = /^(\d+(?:\.\d+)?)%\s*Reanimate as:\s*Random Monster$/i;
const ANY_REANIMATE_RE = /^(\d+(?:\.\d+)?)%\s*Reanimate as:\s*(.+)$/i;

/**
 * Replace catalog "N% Reanimate as: Random Monster" with a TSW-resolved monster extra.
 * @param {string[]} modLines
 * @param {string[]|null|undefined} extras
 * @returns {{ mods: string[], extras: string[] }}
 */
export function applyResolvedRandomReanimates(modLines, extras) {
  /** @type {string[]} */
  const remaining = Array.isArray(extras)
    ? extras.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  const mods = (Array.isArray(modLines) ? modLines : []).map((mod) => {
    const decoded = decodeModifierLine(mod);
    const plainMod = decoded.text || String(mod || '').trim();
    const m = plainMod.match(RANDOM_REANIMATE_RE);
    if (!m) return mod;
    const pct = m[1];
    const idx = remaining.findIndex((extra) => {
      const plainExtra = decodeModifierLine(extra).text || extra;
      const em = plainExtra.match(ANY_REANIMATE_RE);
      if (!em || em[1] !== pct) return false;
      return !/^Random Monster$/i.test(String(em[2] || '').trim());
    });
    if (idx < 0) return mod;
    const [resolved] = remaining.splice(idx, 1);
    const resolvedText = decodeModifierLine(resolved).text || resolved;
    return encodeModifierLine(resolvedText, decoded.color, decoded.showCondition);
  });
  return { mods, extras: remaining };
}

/**
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function modifierLineText(line) {
  return decodeModifierLine(line).text;
}

/**
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function modifierLineColor(line) {
  return decodeModifierLine(line).color;
}

/**
 * @param {string|null|undefined} line
 * @returns {string[]}
 */
export function modifierLineShowConditions(line) {
  return decodeModifierLine(line).showCondition;
}

/**
 * Grey lines under orange text are conditional effects, not always-on affixes.
 * @param {string|null|undefined} line
 * @returns {boolean}
 */
export function isConditionalModifierLine(line) {
  const decoded = decodeModifierLine(line);
  return decoded.color === MODIFIER_COLOR_GREY || decoded.showCondition.length > 0;
}

/**
 * Whether a modifier should contribute always-on bonuses under current planner conditions.
 * Grey wiki lines stay off. Explicit/inferred showCondition requires any selected key.
 * @param {string|null|undefined} line
 * @returns {boolean}
 */
export function isModifierLineActive(line) {
  const decoded = decodeModifierLine(line);
  if (decoded.color === MODIFIER_COLOR_GREY) return false;
  if (!decoded.showCondition.length) return true;
  return decoded.showCondition.some((k) => isConditionSelected(k));
}

/**
 * @param {string|null|undefined} color
 * @returns {string}
 */
export function modifierColorCssClass(color) {
  if (color === MODIFIER_COLOR_ORANGE) return 'item-mod--orange';
  if (color === MODIFIER_COLOR_GREY) return 'item-mod--grey';
  if (color === MODIFIER_COLOR_ADDED || color === MODIFIER_COLOR_BOOSTED) {
    return 'item-mod--added';
  }
  return '';
}

/**
 * CSS classes for a modifier line, including inactive showCondition gating.
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function modifierLineCssClass(line) {
  const decoded = decodeModifierLine(line);
  const colorClass = modifierColorCssClass(decoded.color);
  if (decoded.showCondition.length > 0 && !isModifierLineActive(line)) {
    return [colorClass, 'item-mod--inactive'].filter(Boolean).join(' ');
  }
  return colorClass;
}

/**
 * Collect planner showCondition keys from item modifier lines.
 * @param {Iterable<string>|null|undefined} lines
 * @returns {string[]}
 */
export function collectShowConditionKeysFromModifierLines(lines) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const line of lines || []) {
    for (const key of modifierLineShowConditions(line)) {
      const lower = String(key).toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(key);
    }
  }
  return out;
}
