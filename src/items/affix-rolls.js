/**
 * @file Rollable (min to max) ranges inside affix text lines.
 * @module items/affix-rolls
 */

/** @typedef {{ min: number, max: number, start: number, end: number, raw: string }} AffixRangeMatch */

const AFFIX_RANGE_RE = /\+?\((-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\)/g;

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function defaultRollValue(min, max) {
  const mid = (Number(min) + Number(max)) / 2;
  if (Number.isInteger(min) && Number.isInteger(max)) return Math.round(mid);
  return mid;
}

/**
 * Resolve a stored roll. Trust values outside [min, max] (e.g. TSW totals with
 * socket bonuses). UI sliders still clamp on edit via item-stats clampRoll.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function resolveRollValue(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultRollValue(min, max);
  if (Number.isInteger(min) && Number.isInteger(max)) return Math.round(n);
  return n;
}

/**
 * @param {string|null|undefined} text
 * @returns {AffixRangeMatch[]}
 */
export function parseAffixRanges(text) {
  if (!text) return [];
  /** @type {AffixRangeMatch[]} */
  const out = [];
  const re = new RegExp(AFFIX_RANGE_RE.source, 'g');
  let match;
  while ((match = re.exec(text)) !== null) {
    out.push({
      min: Number(match[1]),
      max: Number(match[2]),
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }
  return out;
}

/**
 * @param {string} raw
 * @param {number} value
 * @returns {string}
 */
export function formatAffixRollReplacement(raw, value) {
  if (raw.startsWith('+(')) {
    if (value <= 0) return String(value);
    return `+${value}`;
  }
  return String(value);
}

/** Trailing / inline display suffix: ` [10-20]` after a rolled value. */
const DISPLAYED_ROLL_RANGE_RE = / \[(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\]/g;

/**
 * Remove tooltip roll-range suffixes (` [10-20]`) from a resolved affix line.
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function stripDisplayedRollRanges(text) {
  return String(text ?? '').replace(DISPLAYED_ROLL_RANGE_RE, '');
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {string}
 */
export function formatDisplayedRollRange(min, max) {
  return ` [${min}-${max}]`;
}

/**
 * @param {string} text
 * @param {Record<string, number>|null|undefined} rolls
 * @param {(rangeIndex: number) => string} rollKeyForIndex
 * @param {{ hideRanges?: boolean, showRollRanges?: boolean }} [options]
 * @returns {string}
 */
/**
 * True when any rolled value for this affix template sits outside [min, max].
 * @param {string|null|undefined} text
 * @param {Record<string, number>|null|undefined} rolls
 * @param {(rangeIndex: number) => string} rollKeyForIndex
 * @returns {boolean}
 */
export function affixRollsAreBoosted(text, rolls, rollKeyForIndex) {
  const ranges = parseAffixRanges(text);
  if (!ranges.length || !rolls) return false;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const key = rollKeyForIndex(i);
    const rolled = Number.isFinite(rolls[key]) ? rolls[key] : null;
    if (rolled == null) continue;
    const lo = Math.min(range.min, range.max);
    const hi = Math.max(range.min, range.max);
    if (rolled < lo || rolled > hi) return true;
  }
  return false;
}

export function applyAffixRolls(text, rolls, rollKeyForIndex, options = {}) {
  const ranges = parseAffixRanges(text);
  if (!ranges.length) return text;
  let result = text;
  /** @type {{ min: number, max: number }[]} */
  const shownRanges = [];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    const key = rollKeyForIndex(i);
    const rolled = rolls && Number.isFinite(rolls[key]) ? rolls[key] : null;
    if (options.hideRanges && rolled == null) continue;
    const value =
      rolled != null ? resolveRollValue(rolled, range.min, range.max) : defaultRollValue(range.min, range.max);
    const replacement = formatAffixRollReplacement(range.raw, value);
    result = result.slice(0, range.start) + replacement + result.slice(range.end);
    if (options.showRollRanges && range.min !== range.max) {
      shownRanges.unshift({ min: range.min, max: range.max });
    }
  }
  if (shownRanges.length) {
    result += shownRanges.map((r) => formatDisplayedRollRange(r.min, r.max)).join('');
  }
  return result;
}

/**
 * @typedef {{ kind: 'text' | 'value', text: string }} AffixDisplayPart
 */

/**
 * Split affix text into static text and highlighted rolled value segments.
 * @param {string} text
 * @param {Record<string, number>|null|undefined} rolls
 * @param {(rangeIndex: number) => string} rollKeyForIndex
 * @param {number} [highlightIndex] - which range's replacement is marked as value
 * @returns {AffixDisplayPart[]}
 */
export function buildAffixDisplayParts(text, rolls, rollKeyForIndex, highlightIndex = 0) {
  const ranges = parseAffixRanges(text);
  if (!ranges.length) return [{ kind: 'text', text: String(text ?? '') }];

  /** @type {AffixDisplayPart[]} */
  const parts = [];
  let cursor = 0;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.start > cursor) {
      parts.push({ kind: 'text', text: text.slice(cursor, range.start) });
    }
    const key = rollKeyForIndex(i);
    const rolled = rolls && Number.isFinite(rolls[key]) ? rolls[key] : null;
    const value =
      rolled != null ? resolveRollValue(rolled, range.min, range.max) : defaultRollValue(range.min, range.max);
    const replacement = formatAffixRollReplacement(range.raw, value);
    if (i === highlightIndex) {
      if (range.raw.startsWith('+(') && value > 0) {
        parts.push({ kind: 'text', text: '+' });
        parts.push({ kind: 'value', text: String(value) });
      } else {
        parts.push({ kind: 'value', text: replacement });
      }
    } else {
      parts.push({ kind: 'text', text: replacement });
    }
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push({ kind: 'text', text: text.slice(cursor) });
  }
  return parts;
}
