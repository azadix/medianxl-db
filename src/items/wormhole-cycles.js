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
  WORMHOLE_CYCLE_TYPES,
  WORMHOLE_CYCLE_MATRIX_SIZES,
  WORMHOLE_BASE_REQ_LEVEL,
  WORMHOLE_MAX_CHARACTER_LEVEL,
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
  WORMHOLE_CYCLE_TYPES,
  WORMHOLE_CYCLE_MATRIX_SIZES,
  WORMHOLE_BASE_REQ_LEVEL,
  WORMHOLE_MAX_CHARACTER_LEVEL,
};

/** @type {Readonly<Record<string, string>>} */
export const WORMHOLE_CYCLE_ROLL_KEYS = Object.freeze({
  count: 'charmCycleCount',
  indexPrefix: 'charmCycle',
  affixPrefix: 'charmAffix:cycle:agg:',
  statPrefix: 'charmCycleStat:',
  cyclesPrefix: 'charmCycleUses:',
  reqLevel: 'charmCycleReqLevel',
  golden: 'charmCycleGolden',
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
 * Legacy reader: cycle ids from the old list format (charmCycleCount + charmCycleN).
 * New rolls store summed totals instead and return [].
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
 * @typedef {{ slug: string, template: string }} WormholeCycleStatDef
 * @typedef {WormholeCycleStatDef & { value: number, text: string }} WormholeCycleStatTotal
 */

/**
 * @param {string} template affix text with the value replaced by '#'
 * @returns {string}
 */
function statSlug(template) {
  return String(template || '')
    .toLowerCase()
    .replace(/%/g, ' pct ')
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

/**
 * Split a single cycle affix line into its stat and the value one cycle adds
 * (fixed value, or the rounded midpoint of a rolled range).
 * @param {string} affix
 * @returns {{ slug: string, template: string, value: number }}
 */
export function parseWormholeCycleAffix(affix) {
  const template = wormholeCycleAffixMergeKey(affix).replace(/\(\*\)/g, FIXED_TOKEN);
  const parts = extractAffixParts(affix);
  let value = 0;
  if (parts.ranges.length) value = defaultRollValue(parts.ranges[0].min, parts.ranges[0].max);
  else if (parts.fixedValues.length) value = parts.fixedValues[0];
  return { slug: statSlug(template), template, value };
}

/** @type {ReadonlyArray<WormholeCycleStatDef>|null} */
let statCatalog = null;

/**
 * Every stat any cycle can add, in catalog order.
 * @returns {ReadonlyArray<WormholeCycleStatDef>}
 */
export function getWormholeCycleStatCatalog() {
  if (!statCatalog) {
    /** @type {Map<string, WormholeCycleStatDef>} */
    const map = new Map();
    for (const cycle of WORMHOLE_CYCLES) {
      for (const affix of cycle.affixes) {
        const { slug, template } = parseWormholeCycleAffix(affix);
        if (!map.has(slug)) map.set(slug, Object.freeze({ slug, template }));
      }
    }
    statCatalog = Object.freeze([...map.values()]);
  }
  return statCatalog;
}

/**
 * @param {string} slug
 * @returns {string}
 */
export function wormholeCycleStatRollKey(slug) {
  return `${WORMHOLE_CYCLE_ROLL_KEYS.statPrefix}${slug}`;
}

/**
 * Slider key used by charm affix rows (`charmAffix:cycle:agg:{slug}:r0`).
 * @param {string} slug
 * @returns {string}
 */
export function wormholeCycleAggRollKey(slug) {
  return `${WORMHOLE_CYCLE_ROLL_KEYS.affixPrefix}${slug}:r0`;
}

/**
 * Cycle types whose UI is "number of cycles used" (Life & Mana). All types store uses; these also get count editors.
 * @type {ReadonlyArray<string>}
 */
export const WORMHOLE_COUNTED_CYCLE_TYPES = Object.freeze(['lifemana']);

/**
 * @param {import('./wormhole-cycles-data.js').WormholeCycleDef|null|undefined} cycle
 * @returns {boolean}
 */
export function isCountedWormholeCycle(cycle) {
  return Boolean(cycle && WORMHOLE_COUNTED_CYCLE_TYPES.includes(cycle.type));
}

/**
 * @param {string} cycleId
 * @returns {string}
 */
export function wormholeCycleUsesRollKey(cycleId) {
  return `${WORMHOLE_CYCLE_ROLL_KEYS.cyclesPrefix}${cycleId}`;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toCount(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {number} value
 * @returns {number}
 */
function clampReqLevel(value) {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(WORMHOLE_CYCLE_REQ_LEVEL_CAP, n));
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {boolean}
 */
function isLegacyCycleRolls(rolls) {
  return rolls != null && Object.prototype.hasOwnProperty.call(rolls, WORMHOLE_CYCLE_ROLL_KEYS.count);
}

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
 * @param {Record<string, number>} state
 * @returns {number}
 */
function reqLevelFromUses(state) {
  let total = 0;
  for (const cycle of WORMHOLE_CYCLES) {
    total += toCount(state[wormholeCycleUsesRollKey(cycle.id)]) * (Number(cycle.reqLevelBonus) || 0);
  }
  return clampReqLevel(total);
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
 * Merge applied cycle affixes. Uses `charmCycleUses:*` counts, or the legacy
 * `charmCycleN` list when that is what `rolls` still contains.
 * @param {Record<string, number>|null|undefined} rolls
 * @param {(cycle: import('./wormhole-cycles-data.js').WormholeCycleDef) => boolean} [include]
 * @returns {WormholeAggregatedAffix[]}
 */
export function getWormholeAggregatedAffixes(rolls, include = () => true) {
  /** @type {Map<string, { template: string, slug: string, fixed: number, min: number, max: number, hasRange: boolean }>} */
  const groups = new Map();

  /**
   * @param {import('./wormhole-cycles-data.js').WormholeCycleDef} cycle
   * @param {number} count
   */
  const addCycle = (cycle, count) => {
    if (!count || !include(cycle)) return;
    for (const affix of cycle.affixes) {
      const parsed = parseWormholeCycleAffix(affix);
      const parts = extractAffixParts(affix);
      let group = groups.get(parsed.template);
      if (!group) {
        group = { template: parsed.template, slug: parsed.slug, fixed: 0, min: 0, max: 0, hasRange: false };
        groups.set(parsed.template, group);
      }
      if (parts.ranges.length) {
        group.hasRange = true;
        group.min += parts.ranges[0].min * count;
        group.max += parts.ranges[0].max * count;
      } else if (parts.fixedValues.length) {
        group.fixed += parts.fixedValues[0] * count;
      }
    }
  };

  if (isLegacyCycleRolls(rolls)) {
    for (const cycle of getAppliedWormholeCycles(rolls)) addCycle(cycle, 1);
  } else {
    const state = rolls || {};
    for (const cycle of WORMHOLE_CYCLES) {
      addCycle(cycle, toCount(state[wormholeCycleUsesRollKey(cycle.id)]));
    }
  }

  /** @type {WormholeAggregatedAffix[]} */
  const out = [];
  for (const group of groups.values()) {
    const ranges = group.hasRange ? [{ min: group.min + group.fixed, max: group.max + group.fixed }] : [];
    const mergeKey = group.hasRange ? group.template.replace(FIXED_TOKEN, RANGE_TOKEN) : group.template;
    const text = rebuildAffixText(mergeKey, group.hasRange ? [] : [group.fixed], ranges);
    out.push({ mergeKey, slug: group.slug, text, ranges });
  }
  return out;
}

/**
 * @param {Record<string, number>} state
 * @returns {Record<string, { min: number, max: number }>}
 */
function snapshotAggRanges(state) {
  /** @type {Record<string, { min: number, max: number }>} */
  const out = {};
  for (const affix of getWormholeAggregatedAffixes(state)) {
    if (affix.ranges[0]) out[affix.slug] = affix.ranges[0];
  }
  return out;
}

/**
 * @param {Record<string, number>} state
 * @param {import('./wormhole-cycles-data.js').WormholeCycleDef} cycle
 * @param {number} times
 */
function addCycleRangeDefaults(state, cycle, times) {
  if (!times) return;
  for (const affix of cycle.affixes) {
    const parts = extractAffixParts(affix);
    if (!parts.ranges.length) continue;
    const { slug } = parseWormholeCycleAffix(affix);
    const key = wormholeCycleAggRollKey(slug);
    const add = times * defaultRollValue(parts.ranges[0].min, parts.ranges[0].max);
    const prev = Number(state[key]);
    state[key] = (Number.isFinite(prev) ? prev : 0) + add;
  }
}

/**
 * Seed / clamp slider rolls to the current aggregated ranges.
 * @param {Record<string, number>} state
 * @param {Record<string, { min: number, max: number }>} previousRanges
 */
function reconcileAggRolls(state, previousRanges) {
  const live = new Set();
  for (const affix of getWormholeAggregatedAffixes(state)) {
    if (!affix.ranges.length) continue;
    const { min, max } = affix.ranges[0];
    const key = wormholeCycleAggRollKey(affix.slug);
    live.add(key);
    const old = previousRanges[affix.slug];
    if (!old) {
      const seeded = Number(state[key]);
      state[key] =
        Number.isFinite(seeded) && seeded >= min && seeded <= max
          ? seeded
          : defaultRollValue(min, max);
      continue;
    }
    let prev = Number(state[key]);
    if (!Number.isFinite(prev)) prev = defaultRollValue(old.min, old.max);
    const minShift = min - old.min;
    const maxShift = max - old.max;
    if (minShift === maxShift && minShift !== 0) prev += minShift;
    state[key] = Math.min(max, Math.max(min, prev));
  }
  for (const key of Object.keys(state)) {
    if (key.startsWith(WORMHOLE_CYCLE_ROLL_KEYS.affixPrefix) && !live.has(key)) delete state[key];
  }
}

/**
 * Counted cycles (one entry per Life & Mana size) with per-cycle expected ranges.
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Array<{
 *   cycle: import('./wormhole-cycles-data.js').WormholeCycleDef,
 *   count: number,
 *   stats: Array<{ slug: string, template: string, value: number, text: string }>,
 * }>}
 */
export function getWormholeCycleCounts(rolls) {
  const state = migrateWormholeCycleRolls(rolls);
  return WORMHOLE_CYCLES.filter(isCountedWormholeCycle).map((cycle) => {
    const count = toCount(state[wormholeCycleUsesRollKey(cycle.id)]);
    const stats = cycle.affixes.map((affix) => {
      const parsed = parseWormholeCycleAffix(affix);
      const parts = extractAffixParts(affix);
      if (parts.ranges.length && count) {
        const min = parts.ranges[0].min * count;
        const max = parts.ranges[0].max * count;
        return {
          slug: parsed.slug,
          template: parsed.template,
          value: defaultRollValue(min, max),
          text: parsed.template.replace(FIXED_TOKEN, `(${min} to ${max})`),
        };
      }
      const value = parsed.value * count;
      return { slug: parsed.slug, template: parsed.template, value, text: parsed.template.replace(FIXED_TOKEN, String(value)) };
    });
    return { cycle, count, stats };
  });
}

/**
 * Set how many cycles of a counted type are used. Clamped to 0 and to the Req. Lvl cap.
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string} cycleId
 * @param {number} count
 * @returns {Record<string, number>}
 */
export function setWormholeCycleCount(rolls, cycleId, count) {
  const cycle = getWormholeCycleById(cycleId);
  const next = migrateWormholeCycleRolls(rolls);
  if (!isCountedWormholeCycle(cycle)) return next;
  const key = wormholeCycleUsesRollKey(cycleId);
  const current = toCount(next[key]);
  let wanted = toCount(count);
  const bonus = Number(cycle?.reqLevelBonus) || 0;
  if (bonus > 0 && wanted > current) {
    const room = WORMHOLE_CYCLE_REQ_LEVEL_CAP - getWormholeCycleReqLevelBonus(next);
    wanted = Math.min(wanted, current + Math.max(0, Math.floor(room / bonus)));
  }
  const previousRanges = snapshotAggRanges(next);
  next[key] = wanted;
  addCycleRangeDefaults(next, cycle, wanted - current);
  reconcileAggRolls(next, previousRanges);
  if (toCount(next[wormholeCycleUsesRollKey('golden')])) next[WORMHOLE_CYCLE_ROLL_KEYS.golden] = 1;
  else delete next[WORMHOLE_CYCLE_ROLL_KEYS.golden];
  next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel] = reqLevelFromUses(next);
  if (!next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel]) delete next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel];
  return next;
}

/**
 * Convert legacy list / old summed-total keys into per-cycle uses + aggregate sliders.
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Record<string, number>}
 */
export function migrateWormholeCycleRolls(rolls) {
  if (isLegacyCycleRolls(rolls)) {
    const applied = getAppliedWormholeCycles(rolls);
    /** @type {Record<string, number>} */
    const next = stripWormholeCycleRolls(rolls);
    for (const cycle of applied) {
      const key = wormholeCycleUsesRollKey(cycle.id);
      next[key] = toCount(next[key]) + 1;
    }
    for (const [key, value] of Object.entries(rolls || {})) {
      if (key.startsWith(WORMHOLE_CYCLE_ROLL_KEYS.affixPrefix)) next[key] = value;
    }
    reconcileAggRolls(next, {});
    if (toCount(next[wormholeCycleUsesRollKey('golden')])) next[WORMHOLE_CYCLE_ROLL_KEYS.golden] = 1;
    next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel] = reqLevelFromUses(next);
    if (!next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel]) delete next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel];
    return next;
  }

  /** @type {Record<string, number>} */
  const next = { ...(rolls || {}) };
  for (const [key, value] of Object.entries(next)) {
    if (!key.startsWith(WORMHOLE_CYCLE_ROLL_KEYS.statPrefix)) continue;
    const slug = key.slice(WORMHOLE_CYCLE_ROLL_KEYS.statPrefix.length);
    const aggKey = wormholeCycleAggRollKey(slug);
    if (!(aggKey in next)) next[aggKey] = value;
    delete next[key];
  }
  const hasUses = WORMHOLE_CYCLES.some((cycle) => toCount(next[wormholeCycleUsesRollKey(cycle.id)]));
  if (hasUses) {
    reconcileAggRolls(next, snapshotAggRanges(next));
    if (toCount(next[wormholeCycleUsesRollKey('golden')])) next[WORMHOLE_CYCLE_ROLL_KEYS.golden] = 1;
    else delete next[WORMHOLE_CYCLE_ROLL_KEYS.golden];
    next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel] = reqLevelFromUses(next);
    if (!next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel]) delete next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel];
  }
  return next;
}

/**
 * Current cycle stats (rolled value inside the aggregated range, or the fixed sum).
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {WormholeCycleStatTotal[]}
 */
export function getWormholeCycleStatTotals(rolls) {
  const state = migrateWormholeCycleRolls(rolls);
  const bySlug = new Map(getWormholeAggregatedAffixes(state).map((affix) => [affix.slug, affix]));
  /** @type {WormholeCycleStatTotal[]} */
  const out = [];
  for (const stat of getWormholeCycleStatCatalog()) {
    const affix = bySlug.get(stat.slug);
    if (!affix) continue;
    let value;
    if (affix.ranges.length) {
      const stored = Number(state[wormholeCycleAggRollKey(stat.slug)]);
      value = Number.isFinite(stored)
        ? stored
        : defaultRollValue(affix.ranges[0].min, affix.ranges[0].max);
    } else {
      value = extractAffixParts(affix.text).fixedValues[0] || 0;
    }
    if (!value && !affix.ranges.length) continue;
    out.push({ ...stat, value, text: stat.template.replace(FIXED_TOKEN, String(value)) });
  }
  return out;
}

/**
 * Range sliders for aggregated cycle stats (same keys as charm modifier rows).
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Array<{ key: string, slug: string, display: string, min: number, max: number, value: number }>}
 */
export function getWormholeCycleRollableStats(rolls) {
  const state = migrateWormholeCycleRolls(rolls);
  /** @type {Array<{ key: string, slug: string, display: string, min: number, max: number, value: number }>} */
  const out = [];
  for (const affix of getWormholeAggregatedAffixes(state)) {
    if (!affix.ranges.length) continue;
    const { min, max } = affix.ranges[0];
    const key = wormholeCycleAggRollKey(affix.slug);
    const stored = Number(state[key]);
    const value = Number.isFinite(stored) ? stored : defaultRollValue(min, max);
    out.push({
      key,
      slug: affix.slug,
      display: affix.text.replace(`(${min} to ${max})`, String(value)),
      min,
      max,
      value,
    });
  }
  return out;
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {string[]}
 */
export function getWormholeCycleFixedAffixes(rolls) {
  return getWormholeAggregatedAffixes(migrateWormholeCycleRolls(rolls))
    .filter((affix) => !affix.ranges.length)
    .map((affix) => affix.text)
    .filter((text) => text && !/^#?0\b/.test(text) && !/\+0\b/.test(text));
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {boolean}
 */
export function hasWormholeCycles(rolls) {
  const state = migrateWormholeCycleRolls(rolls);
  return WORMHOLE_CYCLES.some((cycle) => toCount(state[wormholeCycleUsesRollKey(cycle.id)]));
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {number}
 */
export function getWormholeCycleReqLevelBonus(rolls) {
  const state = migrateWormholeCycleRolls(rolls);
  const fromUses = reqLevelFromUses(state);
  if (fromUses) return fromUses;
  return clampReqLevel(Number(state[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel]) || 0);
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {boolean}
 */
export function hasWormholeGoldenCycle(rolls) {
  const state = migrateWormholeCycleRolls(rolls);
  return toCount(state[wormholeCycleUsesRollKey('golden')]) > 0 || Boolean(state[WORMHOLE_CYCLE_ROLL_KEYS.golden]);
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string} cycleId
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function canApplyWormholeCycle(rolls, cycleId) {
  const cycle = getWormholeCycleById(cycleId);
  if (!cycle) return { ok: false, reason: 'Unknown cycle' };
  if (cycle.limit != null && cycle.size === 'golden' && hasWormholeGoldenCycle(rolls)) {
    return { ok: false, reason: `Limit ${cycle.limit}` };
  }
  const bonus = Number(cycle.reqLevelBonus) || 0;
  if (bonus > 0 && bonus + getWormholeCycleReqLevelBonus(rolls) > WORMHOLE_CYCLE_REQ_LEVEL_CAP) {
    return { ok: false, reason: `Required Level bonus cap (${WORMHOLE_CYCLE_REQ_LEVEL_CAP})` };
  }
  return { ok: true };
}

/**
 * Add one cycle: increment its use count and expand stat slider ranges.
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string} cycleId
 * @returns {{ ok: true, rolls: Record<string, number> } | { ok: false, reason: string }}
 */
export function applyWormholeCycle(rolls, cycleId) {
  const check = canApplyWormholeCycle(rolls, cycleId);
  if (!check.ok) return check;
  const cycle = /** @type {import('./wormhole-cycles-data.js').WormholeCycleDef} */ (getWormholeCycleById(cycleId));
  const next = migrateWormholeCycleRolls(rolls);
  const previousRanges = snapshotAggRanges(next);
  const key = wormholeCycleUsesRollKey(cycle.id);
  next[key] = toCount(next[key]) + 1;
  addCycleRangeDefaults(next, cycle, 1);
  reconcileAggRolls(next, previousRanges);
  if (cycle.size === 'golden') next[WORMHOLE_CYCLE_ROLL_KEYS.golden] = 1;
  next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel] = reqLevelFromUses(next);
  if (!next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel]) delete next[WORMHOLE_CYCLE_ROLL_KEYS.reqLevel];
  return { ok: true, rolls: next };
}

/**
 * Set a ranged cycle stat, clamped to the aggregated min/max from applied cycles.
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string} slug
 * @param {number} value
 * @returns {Record<string, number>}
 */
export function setWormholeCycleStatTotal(rolls, slug, value) {
  const next = migrateWormholeCycleRolls(rolls);
  const affix = getWormholeAggregatedAffixes(next).find((row) => row.slug === slug);
  if (!affix?.ranges.length) return next;
  const n = Number(value);
  const { min, max } = affix.ranges[0];
  next[wormholeCycleAggRollKey(slug)] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaultRollValue(min, max);
  return next;
}

/**
 * Affix sources for charm tooltips / stat rows. Ranged lines keep `(min to max)` so sliders appear.
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Array<{ sourceKey: string, text: string, prefix: string }>}
 */
export function getWormholeCycleAffixSources(rolls) {
  const state = migrateWormholeCycleRolls(rolls);
  const bySlug = new Map(getWormholeAggregatedAffixes(state).map((affix) => [affix.slug, affix]));
  /** @type {Array<{ sourceKey: string, text: string, prefix: string }>} */
  const out = [];
  for (const stat of getWormholeCycleStatCatalog()) {
    const affix = bySlug.get(stat.slug);
    if (!affix) continue;
    if (!affix.ranges.length) {
      const value = extractAffixParts(affix.text).fixedValues[0] || 0;
      if (!value) continue;
    }
    out.push({
      sourceKey: `cycle:agg:${affix.slug}`,
      text: affix.text,
      prefix: '',
    });
  }
  return out;
}

/**
 * Drop all cycle keys (legacy list, legacy aggregates, totals), keep unrelated charm rolls.
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Record<string, number>}
 */
export function stripWormholeCycleRolls(rolls) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, value] of Object.entries(rolls || {})) {
    if (key === WORMHOLE_CYCLE_ROLL_KEYS.count) continue;
    if (key === WORMHOLE_CYCLE_ROLL_KEYS.reqLevel) continue;
    if (key === WORMHOLE_CYCLE_ROLL_KEYS.golden) continue;
    if (key.startsWith(WORMHOLE_CYCLE_ROLL_KEYS.statPrefix)) continue;
    if (key.startsWith(WORMHOLE_CYCLE_ROLL_KEYS.cyclesPrefix)) continue;
    if (/^charmCycle\d+$/.test(key)) continue;
    if (key.startsWith(WORMHOLE_CYCLE_ROLL_KEYS.affixPrefix)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Record<string, number>}
 */
export function clearWormholeCycles(rolls) {
  return stripWormholeCycleRolls(rolls);
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
 * Type x size matrix for the picker UI. Rows are cycle types; `cells[size]` is the cycle
 * for that size or null when the type has no such variant. Golden is a single-cell row
 * (`spanning: true`, cycle under `cells.golden`).
 * @returns {{
 *   sizes: Array<{ size: string, label: string }>,
 *   rows: Array<{
 *     type: string,
 *     label: string,
 *     mods: string,
 *     spanning: boolean,
 *     cells: Record<string, import('./wormhole-cycles-data.js').WormholeCycleDef|null>,
 *   }>,
 * }}
 */
export function getWormholeCycleTypeMatrix() {
  const sizes = WORMHOLE_CYCLE_MATRIX_SIZES.map((size) => ({
    size,
    label: (WORMHOLE_CYCLE_SIZE_LABELS[size] || size).replace(/\s*Cycle$/i, ''),
  }));
  const rows = WORMHOLE_CYCLE_TYPES.map((type) => {
    const ofType = WORMHOLE_CYCLES.filter((cycle) => cycle.type === type.id);
    const spanning = ofType.length > 0 && ofType.every((cycle) => cycle.size === 'golden');
    /** @type {Record<string, import('./wormhole-cycles-data.js').WormholeCycleDef|null>} */
    const cells = {};
    if (spanning) {
      cells.golden = ofType[0];
    } else {
      for (const size of WORMHOLE_CYCLE_MATRIX_SIZES) {
        cells[size] = ofType.find((cycle) => cycle.size === size) || null;
      }
    }
    return { type: type.id, label: type.label, mods: type.mods, spanning, cells };
  }).filter((row) => Object.values(row.cells).some(Boolean));
  return { sizes, rows };
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
