/**
 * Corrupted Wormhole cycle apply / aggregate helpers.
 * @module items/wormhole-cycles
 */

import { parseAffixRanges } from '@/items/affix-rolls.js';
import {
  WORMHOLE_CYCLES,
  WORMHOLE_CYCLE_REQ_LEVEL_CAP,
  WORMHOLE_CYCLE_SIZE_ORDER,
  WORMHOLE_CYCLE_SIZE_LABELS,
} from '@/items/wormhole-cycles-data.js';

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

export {
  WORMHOLE_CYCLES,
  WORMHOLE_CYCLE_REQ_LEVEL_CAP,
  WORMHOLE_CYCLE_SIZE_ORDER,
  WORMHOLE_CYCLE_SIZE_LABELS,
};

/** @type {Readonly<Record<string, string>>} */
export const WORMHOLE_CYCLE_ROLL_KEYS = Object.freeze({
  count: 'charmCycleCount',
  indexPrefix: 'charmCycle',
  affixPrefix: 'charmAffix:cycle:agg:',
});

const CORRUPTED_WORMHOLE_ID = '\\\\8';
const PLACEHOLDER_MOD_RE = /^Add Cycles to apply specific bonuses$/i;
const RANGE_TOKEN = '(*)';
const FIXED_TOKEN = '#';

/** @type {Map<string, number>|null} */
let cycleIdToIndex = null;

/**
 * @returns {Map<string, number>}
 */
function getCycleIdToIndex() {
  if (!cycleIdToIndex) {
    cycleIdToIndex = new Map(WORMHOLE_CYCLES.map((cycle, index) => [cycle.id, index]));
  }
  return cycleIdToIndex;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isCorruptedWormhole(def) {
  if (!def || typeof def !== 'object') return false;
  if (String(def.id || '') === CORRUPTED_WORMHOLE_ID) return true;
  return /^Corrupted Wormhole$/i.test(String(def.name || ''));
}

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isWormholeCyclePlaceholderMod(text) {
  return PLACEHOLDER_MOD_RE.test(String(text || '').trim());
}

/**
 * @param {number} listIndex
 * @returns {string}
 */
export function wormholeCycleListRollKey(listIndex) {
  return `${WORMHOLE_CYCLE_ROLL_KEYS.indexPrefix}${listIndex}`;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function wormholeCycleAffixMergeKey(text) {
  return String(text || '')
    .replace(
      /(\+?)\((-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\)/g,
      (_m, plus) => `${plus}${RANGE_TOKEN}`
    )
    .replace(/(^|[^\w.-])(-?\d+(?:\.\d+)?)(?=_|\b|[^\w.]|$)/g, `$1${FIXED_TOKEN}`);
}

/**
 * Stable slug for roll keys (no colons beyond our separators).
 * @param {string} mergeKey
 * @returns {string}
 */
export function wormholeCycleAffixSourceSlug(mergeKey) {
  return String(mergeKey || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {string[]}
 */
export function getAppliedWormholeCycleIds(rolls) {
  const count = Math.max(0, Math.floor(Number(rolls?.[WORMHOLE_CYCLE_ROLL_KEYS.count]) || 0));
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Number(rolls?.[wormholeCycleListRollKey(i)]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= WORMHOLE_CYCLES.length) continue;
    out.push(WORMHOLE_CYCLES[idx].id);
  }
  return out;
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {import('./wormhole-cycles-data.js').WormholeCycleDef[]}
 */
export function getAppliedWormholeCycles(rolls) {
  return getAppliedWormholeCycleIds(rolls)
    .map((id) => WORMHOLE_CYCLES[getCycleIdToIndex().get(id) ?? -1])
    .filter(Boolean);
}

/**
 * @param {string} cycleId
 * @returns {import('./wormhole-cycles-data.js').WormholeCycleDef|null}
 */
export function getWormholeCycleById(cycleId) {
  const idx = getCycleIdToIndex().get(String(cycleId || ''));
  return idx == null ? null : WORMHOLE_CYCLES[idx];
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {number}
 */
export function getWormholeCycleReqLevelBonus(rolls) {
  let total = 0;
  for (const cycle of getAppliedWormholeCycles(rolls)) {
    total += Number(cycle.reqLevelBonus) || 0;
  }
  return Math.min(WORMHOLE_CYCLE_REQ_LEVEL_CAP, total);
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string} cycleId
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function canApplyWormholeCycle(rolls, cycleId) {
  const cycle = getWormholeCycleById(cycleId);
  if (!cycle) return { ok: false, reason: 'Unknown cycle' };
  const applied = getAppliedWormholeCycles(rolls);
  if (cycle.limit != null) {
    const used = applied.filter((c) => c.id === cycle.id).length;
    if (used >= cycle.limit) {
      return { ok: false, reason: `Limit ${cycle.limit}` };
    }
  }
  const nextBonus = (Number(cycle.reqLevelBonus) || 0) + getWormholeCycleReqLevelBonus(rolls);
  // Cap only counts non-golden bonuses already summed in getWormholeCycleReqLevelBonus.
  if ((Number(cycle.reqLevelBonus) || 0) > 0 && nextBonus > WORMHOLE_CYCLE_REQ_LEVEL_CAP) {
    return {
      ok: false,
      reason: `Required Level bonus cap (${WORMHOLE_CYCLE_REQ_LEVEL_CAP})`,
    };
  }
  return { ok: true };
}

/**
 * @typedef {{
 *   mergeKey: string,
 *   slug: string,
 *   text: string,
 *   ranges: Array<{ min: number, max: number }>,
 * }} WormholeAggregatedAffix
 */

/**
 * @param {string} template
 * @param {number[]} fixedValues
 * @param {Array<{ min: number, max: number }>} ranges
 * @returns {string}
 */
function rebuildAffixText(template, fixedValues, ranges) {
  let fixedIdx = 0;
  let rangeIdx = 0;
  return template
    .replace(/\(\*\)/g, () => {
      const range = ranges[rangeIdx] || { min: 0, max: 0 };
      rangeIdx += 1;
      return `(${range.min} to ${range.max})`;
    })
    .replace(/#/g, () => {
      const value = fixedValues[fixedIdx];
      fixedIdx += 1;
      return String(Number.isFinite(value) ? value : 0);
    });
}

/**
 * @param {string} text
 * @returns {{ fixedValues: number[], ranges: Array<{ min: number, max: number }> }}
 */
function extractAffixParts(text) {
  const ranges = parseAffixRanges(text).map((r) => ({ min: r.min, max: r.max }));
  /** @type {number[]} */
  const fixedValues = [];
  const withoutRanges = String(text || '').replace(
    /\+?\((-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\)/g,
    RANGE_TOKEN
  );
  const re = /(^|[^\w.-])(-?\d+(?:\.\d+)?)(?=_|\b|[^\w.]|$)/g;
  let match;
  while ((match = re.exec(withoutRanges)) !== null) {
    fixedValues.push(Number(match[2]));
  }
  return { fixedValues, ranges };
}

/**
 * Merge applied cycle affixes into slider-ready lines (only relevant stats).
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {WormholeAggregatedAffix[]}
 */
export function getWormholeAggregatedAffixes(rolls) {
  /** @type {Map<string, { template: string, fixedValues: number[], ranges: Array<{ min: number, max: number }> }>} */
  const groups = new Map();

  for (const cycle of getAppliedWormholeCycles(rolls)) {
    for (const affix of cycle.affixes) {
      const mergeKey = wormholeCycleAffixMergeKey(affix);
      const parts = extractAffixParts(affix);
      const existing = groups.get(mergeKey);
      if (!existing) {
        groups.set(mergeKey, {
          template: mergeKey,
          fixedValues: parts.fixedValues.slice(),
          ranges: parts.ranges.map((r) => ({ ...r })),
        });
        continue;
      }
      parts.fixedValues.forEach((value, i) => {
        existing.fixedValues[i] = (existing.fixedValues[i] || 0) + value;
      });
      parts.ranges.forEach((range, i) => {
        if (!existing.ranges[i]) {
          existing.ranges[i] = { min: range.min, max: range.max };
        } else {
          existing.ranges[i].min += range.min;
          existing.ranges[i].max += range.max;
        }
      });
    }
  }

  /** @type {WormholeAggregatedAffix[]} */
  const out = [];
  for (const [mergeKey, group] of groups) {
    const text = rebuildAffixText(group.template, group.fixedValues, group.ranges);
    out.push({
      mergeKey,
      slug: wormholeCycleAffixSourceSlug(mergeKey),
      text,
      ranges: group.ranges.map((r) => ({ ...r })),
    });
  }
  return out;
}

/**
 * Affix sources for charm tooltips / roll rows.
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Array<{ sourceKey: string, text: string, prefix: string }>}
 */
export function getWormholeCycleAffixSources(rolls) {
  return getWormholeAggregatedAffixes(rolls).map((affix) => ({
    sourceKey: `cycle:agg:${affix.slug}`,
    text: affix.text,
    prefix: '',
  }));
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Record<string, number>}
 */
export function defaultWormholeCycleAffixRolls(rolls) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const affix of getWormholeAggregatedAffixes(rolls)) {
    const sourceKey = `cycle:agg:${affix.slug}`;
    affix.ranges.forEach((range, rangeIndex) => {
      out[`charmAffix:${sourceKey}:r${rangeIndex}`] = defaultRollValue(range.min, range.max);
    });
  }
  return out;
}

/**
 * Drop stale cycle list + aggregate roll keys, keep unrelated charm rolls.
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Record<string, number>}
 */
export function stripWormholeCycleRolls(rolls) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, value] of Object.entries(rolls || {})) {
    if (key === WORMHOLE_CYCLE_ROLL_KEYS.count) continue;
    if (key.startsWith(WORMHOLE_CYCLE_ROLL_KEYS.indexPrefix)) continue;
    if (key.startsWith(WORMHOLE_CYCLE_ROLL_KEYS.affixPrefix)) continue;
    if (key.startsWith('charmAffix:cycle:agg:')) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Encode applied cycle id list into roll keys and refresh aggregate roll defaults.
 * Preserves existing aggregate values when still in range.
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string[]} cycleIds
 * @returns {Record<string, number>}
 */
export function setAppliedWormholeCycleIds(rolls, cycleIds) {
  const ids = Array.isArray(cycleIds) ? cycleIds : [];
  const base = stripWormholeCycleRolls(rolls);
  /** @type {Record<string, number>} */
  const next = { ...base, [WORMHOLE_CYCLE_ROLL_KEYS.count]: ids.length };
  ids.forEach((id, listIndex) => {
    const cycleIndex = getCycleIdToIndex().get(id);
    if (cycleIndex == null) return;
    next[wormholeCycleListRollKey(listIndex)] = cycleIndex;
  });

  const previous = rolls || {};
  for (const affix of getWormholeAggregatedAffixes(next)) {
    const sourceKey = `cycle:agg:${affix.slug}`;
    affix.ranges.forEach((range, rangeIndex) => {
      const key = `charmAffix:${sourceKey}:r${rangeIndex}`;
      const prev = Number(previous[key]);
      if (Number.isFinite(prev) && prev >= range.min && prev <= range.max) {
        next[key] = prev;
      } else {
        next[key] = defaultRollValue(range.min, range.max);
      }
    });
  }
  return next;
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string} cycleId
 * @returns {{ ok: true, rolls: Record<string, number> } | { ok: false, reason: string }}
 */
export function applyWormholeCycle(rolls, cycleId) {
  const check = canApplyWormholeCycle(rolls, cycleId);
  if (!check.ok) return check;
  const ids = [...getAppliedWormholeCycleIds(rolls), cycleId];
  return { ok: true, rolls: setAppliedWormholeCycleIds(rolls, ids) };
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @param {number} listIndex
 * @returns {Record<string, number>}
 */
export function removeWormholeCycleAt(rolls, listIndex) {
  const ids = getAppliedWormholeCycleIds(rolls).filter((_, i) => i !== listIndex);
  return setAppliedWormholeCycleIds(rolls, ids);
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Record<string, number>}
 */
export function clearWormholeCycles(rolls) {
  return setAppliedWormholeCycleIds(rolls, []);
}

/**
 * Matrix groups for the picker UI.
 * @returns {Array<{ size: string, label: string, cycles: import('./wormhole-cycles-data.js').WormholeCycleDef[] }>}
 */
export function getWormholeCycleMatrix() {
  return WORMHOLE_CYCLE_SIZE_ORDER.map((size) => ({
    size,
    label: WORMHOLE_CYCLE_SIZE_LABELS[size] || size,
    cycles: WORMHOLE_CYCLES.filter((cycle) => cycle.size === size),
  }));
}

/**
 * Short label for matrix cells / applied list.
 * @param {import('./wormhole-cycles-data.js').WormholeCycleDef|null|undefined} cycle
 * @returns {string}
 */
export function formatWormholeCycleSummary(cycle) {
  if (!cycle) return '';
  if (cycle.size === 'golden') return 'Golden Cycle (Limit: 1)';
  const main = cycle.affixes[0] || cycle.label;
  const extra =
    cycle.affixes.length > 1 ? ` (+${cycle.affixes.length - 1} more)` : '';
  return `${main}${extra}`;
}
