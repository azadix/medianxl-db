/**
 * @file Generic numeric stat evaluator for the character bucket.
 *
 * Pipeline (PoB-style, extended with the game's post-percentage stage):
 *   value = (Σ base/pre × (1 + Σ inc/100) × Π(1 + more/100)) + Σ post
 * An `override` contribution replaces the computed value.
 *
 * @module character/bucket/evaluator
 */

import { fallbackStatDef } from './registry.js';

/** Attribute stats use op-11 percentage on the base/allocated portion only. */
const ATTRIBUTE_STATS = new Set(['strength', 'dexterity', 'vitality', 'energy']);

/** Titles for the additive groups, keyed by source kind. */
const PRE_GROUP_TITLES = Object.freeze({
  class: 'Class & level',
  quest: 'Quests',
  item: 'Items',
  set: 'Items',
  skill: 'Skills',
  condition: 'Conditions',
  import: 'Imported',
  manual: 'Manual',
  derived: 'Derived',
});

/**
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
  return String(Math.round(num * 100) / 100);
}

/**
 * @param {string[]} conditions
 * @param {Set<string>} selected
 * @returns {boolean}
 */
function conditionsMet(conditions, selected) {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((key) => selected.has(key));
}

/**
 * @param {number} value
 * @param {import('./registry.js').StatDef} def
 * @returns {number}
 */
function finalize(value, def) {
  let out = Number(value);
  if (!Number.isFinite(out)) out = 0;
  if (!def.allowNegative) out = Math.max(0, out);
  if (def.min != null && Number.isFinite(def.min)) out = Math.max(def.min, out);
  if (def.max != null && Number.isFinite(def.max)) out = Math.min(def.max, out);
  if (def.round === 'floor') out = Math.floor(out);
  else if (def.round === 'round') out = Math.round(out);
  if (Object.is(out, -0)) out = 0;
  return out;
}

/**
 * @param {import('./contributions.js').Contribution} contribution
 * @param {Set<string>} selectedConditions
 * @returns {boolean}
 */
function isContributionActive(contribution, selectedConditions) {
  return conditionsMet(contribution.conditions, selectedConditions);
}

/**
 * @param {string} id
 * @param {string} title
 * @param {Array<{ label: string, value: number, sourceKind: string, active: boolean, line?: string }>} rows
 * @param {number} [subtotal]
 * @returns {{ id: string, title: string, rows: object[], subtotal?: number }}
 */
function group(id, title, rows, subtotal) {
  return { id, title, rows, subtotal };
}

/**
 * Evaluate one stat from its counted contributions.
 *
 * @param {{
 *   registry: import('./registry.js').StatRegistry,
 *   stat: string,
 *   contributions: import('./contributions.js').Contribution[],
 *   selectedConditions?: Iterable<string>,
 * }} input
 * @returns {{
 *   stat: string,
 *   label: string,
 *   value: number,
 *   def: import('./registry.js').StatDef,
 *   groups: object[],
 *   rows: object[],
 *   formula: string,
 *   raw: { pre: number, inc: number, more: number, post: number, override: number|null },
 *   activeCount: number,
 *   inactiveCount: number,
 * }}
 */
export function evaluateStat(input) {
  const stat = String(input.stat ?? '').trim().toLowerCase();
  if (!stat) throw new Error('evaluateStat requires a stat key');
  const def = input.registry?.get?.(stat) || fallbackStatDef(stat);
  const selected = new Set(
    [...(input.selectedConditions || [])].map((key) => String(key).trim().toLowerCase())
  );
  const list = Array.isArray(input.contributions) ? input.contributions : [];

  let pre = 0;
  let basePre = 0;
  let inc = 0;
  let more = 1;
  let post = 0;
  /** @type {number|null} */
  let override = null;
  let activeCount = 0;
  let inactiveCount = 0;

  /** @type {Map<string, object[]>} */
  const preRowsByKind = new Map();
  /** @type {object[]} */
  const incRows = [];
  /** @type {object[]} */
  const moreRows = [];
  /** @type {object[]} */
  const postRows = [];
  /** @type {object[]} */
  const overrideRows = [];
  /** @type {Array<{ label: string, value: boolean, sourceKind: string }>} */
  const flagRows = [];

  for (const contribution of list) {
    if (!contribution || contribution.stat !== stat) continue;
    const active = isContributionActive(contribution, selected);
    if (active) activeCount += 1;
    else inactiveCount += 1;
    const row = {
      label: contribution.source.label,
      value: contribution.value,
      op: contribution.op,
      stage: contribution.stage,
      sourceKind: contribution.source.kind,
      sourceId: contribution.source.id,
      line: contribution.source.line,
      active,
    };
    if (contribution.op === 'flag') {
      if (active) {
        flagRows.push({
          label: contribution.source.label,
          value: Boolean(contribution.value),
          sourceKind: contribution.source.kind,
        });
      }
      continue;
    }
    if (!active) {
      // Keep inactive rows visible in the breakdown without counting them.
      if (contribution.op === 'inc') incRows.push(row);
      else if (contribution.op === 'more') moreRows.push(row);
      else if (contribution.stage === 'post') postRows.push(row);
      else if (contribution.op === 'override') overrideRows.push(row);
      else {
        const key = contribution.source.kind;
        if (!preRowsByKind.has(key)) preRowsByKind.set(key, []);
        preRowsByKind.get(key).push(row);
      }
      continue;
    }

    if (contribution.op === 'inc') {
      inc += Number(contribution.value) || 0;
      incRows.push(row);
    } else if (contribution.op === 'more') {
      more *= 1 + (Number(contribution.value) || 0) / 100;
      moreRows.push(row);
    } else if (contribution.op === 'override') {
      override = Number(contribution.value) || 0;
      overrideRows.push(row);
    } else if (contribution.stage === 'post') {
      post += Number(contribution.value) || 0;
      postRows.push(row);
    } else {
      pre += Number(contribution.value) || 0;
      const key = contribution.source.kind;
      // Percent attributes (op 11) apply to the base/allocated value, not to flat
      // attribute bonuses from items or skills.
      if (ATTRIBUTE_STATS.has(stat)) {
        basePre += Number(contribution.value) || 0;
      }
      if (!preRowsByKind.has(key)) preRowsByKind.set(key, []);
      preRowsByKind.get(key).push(row);
    }
  }

  const groups = [];
  for (const [kind, rows] of preRowsByKind) {
    const title = PRE_GROUP_TITLES[kind] || 'Other';
    groups.push(group(`pre-${kind}`, title, rows, rows.reduce((sum, row) => sum + (row.active ? Number(row.value) : 0), 0)));
  }
  if (incRows.length) groups.push(group('inc', 'Increased', incRows, inc));
  if (moreRows.length) groups.push(group('more', 'More', moreRows, more));
  if (postRows.length) groups.push(group('post', 'Post-%', postRows, post));
  if (overrideRows.length) groups.push(group('override', 'Overrides', overrideRows, override ?? undefined));

  const computed =
    override != null
      ? override
      : ATTRIBUTE_STATS.has(stat)
        ? basePre * (1 + inc / 100) * more + (pre - basePre) + post
        : pre * (1 + inc / 100) * more + post;
  const value = finalize(computed, def);

  const parts = [];
  if (ATTRIBUTE_STATS.has(stat)) {
    parts.push(`(${formatNumber(basePre)} base × ${formatNumber(1 + inc / 100)} + ${formatNumber(pre - basePre)} bonus)`);
  } else if (pre !== 0 || (inc === 0 && more === 1 && post === 0 && override == null)) {
    parts.push(formatNumber(pre));
  }
  if (ATTRIBUTE_STATS.has(stat)) {
    // formula already carries the percentage
  } else if (inc !== 0) parts.push(`× ${formatNumber(1 + inc / 100)} (inc)`);
  if (more !== 1) parts.push(`× ${formatNumber(more)} (more)`);
  if (post !== 0) parts.push(`${post > 0 ? '+' : '−'} ${formatNumber(Math.abs(post))} (post)`);
  let formula;
  if (override != null) {
    formula = `= ${formatNumber(value)} (override)`;
  } else {
    const expression = parts.length ? parts.join(' ') : '0';
    formula = `${expression} = ${formatNumber(value)}`;
  }

  return {
    stat,
    label: def.label,
    value,
    def,
    groups,
    rows: groups.flatMap((entry) => entry.rows),
    flags: flagRows,
    formula,
    raw: { pre, inc, more, post, override },
    activeCount,
    inactiveCount,
  };
}
