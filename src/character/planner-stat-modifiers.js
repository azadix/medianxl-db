/**
 * @file Skill-based modifiers to planner stats (rows for tooltips and legacy bonus maps).
 *
 * Aggregation is delegated to the character bucket (`applySkillSources`); this module
 * keeps the small lookup helpers the tooltip/condition code still needs.
 *
 * @module character/planner-stat-modifiers
 */

import { getPlannerStatDef } from './planner-stats-config.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import { getPlannerCharacterStatDefs } from './planner-stats-config.js';
import { applySkillSources } from '@/character/bucket/sources/skills.js';

/**
 * @typedef {'flat' | 'percent' | 'more'} PlannerStatModifierKind
 * @typedef {{
 *   skillId?: string | number,
 *   displayName: string,
 *   description: string,
 *   kind?: PlannerStatModifierKind,
 *   value?: number,
 *   active?: boolean
 * }} PlannerStatModifier
 */

/** @type {Record<string, PlannerStatModifier[]>} */
let _plannerStatSkillModifiersByKey = {};

/**
 * Resolve a `pairedStat` token to a planner registry key.
 * @param {import('@/shared/skill-data-store.js').SkillFileStore|null} store
 * @param {string} tokenLower
 * @returns {string|null}
 */
function resolvePairedStatTargetToPlannerKey(store, tokenLower) {
  const t = String(tokenLower || '').trim().toLowerCase();
  if (!t || !store) return null;
  if (getPlannerStatDef(t)) return t;
  const byKey = store.characterStatByKeyLower?.get(t);
  const k1 = byKey?.key != null ? String(byKey.key).trim().toLowerCase() : '';
  if (k1 && getPlannerStatDef(k1)) return k1;
  const byStats = store.characterStatByStatsKeyLower?.get(t);
  const k2 = byStats?.key != null ? String(byStats.key).trim().toLowerCase() : '';
  if (k2 && getPlannerStatDef(k2)) return k2;
  return null;
}

/**
 * @param {import('@/shared/skill-data-store.js').SkillFileStore|null} store
 * @param {unknown} raw
 * @returns {{ valueIndex: number, plannerKey: string }[]}
 */
function normalizePairedStatList(store, raw) {
  if (!Array.isArray(raw) || raw.length === 0 || !store) return [];
  /** @type {{ valueIndex: number, plannerKey: string }[]} */
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const viRaw = entry.valueIndex ?? entry.value_index ?? entry.slot;
    const n = Number(viRaw);
    if (!Number.isInteger(n) || n < 0 || n > 3) continue;
    const statRaw =
      entry.stat ??
      entry.plannerKey ??
      entry.key ??
      entry.characterStat ??
      entry.character_stat;
    const st = statRaw != null ? String(statRaw).trim().toLowerCase() : '';
    if (!st) continue;
    const plannerKey = resolvePairedStatTargetToPlannerKey(store, st);
    if (!plannerKey) continue;
    out.push({ valueIndex: n, plannerKey });
  }
  return out;
}

/**
 * @param {import('@/shared/skill-data-store.js').SkillFileStore|null} store
 * @param {string} scalingStatKey lowercased skills scalingConstants.statKey
 * @returns {{ valueIndex: number, plannerKey: string }[]}
 */
export function getPairedStatRouting(store, scalingStatKey) {
  const meta = store?.getStatByKeyLower?.(scalingStatKey);
  return normalizePairedStatList(store, meta?.pairedStat);
}

/**
 * True when this planner stat only has inactive (condition-off) skill modifiers
 * and no non-default manual/saved value. Used to grey sheet rows.
 * @param {string} statKey
 * @param {number|string|null|undefined} [displayedValue]
 * @returns {boolean}
 */
export function isPlannerStatConditionInactive(statKey, displayedValue) {
  const mods = getPlannerStatSkillModifiers(statKey);
  if (!mods.length) return false;
  if (!mods.every((m) => m.active === false)) return false;
  if (displayedValue !== undefined && displayedValue !== null) {
    const def = getPlannerStatDef(statKey);
    const defaultVal = def?.default != null && !Number.isNaN(def.default) ? def.default : 0;
    const v = Number(displayedValue);
    if (Number.isFinite(v) && v !== defaultVal) return false;
  }
  return true;
}

/**
 * Recompute skill stat bonuses through the bucket and mirror them onto `Character`
 * for `setStat()` calibration / legacy fallbacks.
 * @param {import('./Character.js').default} character
 * @param {{
 *   effectiveLevel: number,
 *   treeSkillsCache: Record<string, string[]>,
 *   allSkillsBonus: number,
 *   classSkillsBonus?: number,
 *   mergedBlvl: Record<string, number>
 * }} ctx
 */
export function recomputePlannerStatsFromSkillAllocations(character, ctx) {
  if (!character || !ctx) return;
  try {
    const registry = createStatRegistry(getPlannerCharacterStatDefs());
    if (registry.size === 0) return;
    const bucket = createCharacterBucket({ registry, expandAliases: false });
    applySkillSources(bucket, {
      character,
      registry,
      effectiveLevel: ctx.effectiveLevel,
      allSkillsBonus: ctx.allSkillsBonus,
      classSkillsBonus: ctx.classSkillsBonus,
    });
    const snapshot = bucket.commit();
    /** @type {Record<string, number>} */
    const bonuses = {};
    for (const [key, value] of Object.entries(snapshot.values)) {
      const num = Number(value);
      if (Number.isFinite(num) && num !== 0) bonuses[key] = num;
    }
    character.setPlannerSkillStatBonuses(bonuses);

    /** @type {Record<string, PlannerStatModifier[]>} */
    const byKey = {};
    for (const key of Object.keys(bonuses)) {
      const breakdown = snapshot.getBreakdown(key);
      /** @type {Map<string, PlannerStatModifier>} */
      const bySource = new Map();
      for (const group of breakdown?.groups || []) {
        for (const row of group.rows || []) {
          const displayName = String(row.label || 'Skill');
          const value = Number(row.value) || 0;
          const existing = bySource.get(displayName);
          if (existing) {
            existing.value = Number(existing.value || 0) + value;
            existing.description = `${existing.value >= 0 ? '+' : ''}${existing.value}`;
            existing.active = existing.active !== false && row.active !== false;
          } else {
            bySource.set(displayName, {
              displayName,
              description: `${value >= 0 ? '+' : ''}${value}`,
              kind: 'flat',
              value,
              active: row.active !== false,
            });
          }
        }
      }
      byKey[key] = [...bySource.values()];
    }
    _plannerStatSkillModifiersByKey = byKey;
  } catch {
    // Keep the previous map; the bucket is the source of truth for the UI.
  }
}

/**
 * @param {string} statKey Planner base stat key (e.g. 'life', 'strength')
 * @returns {PlannerStatModifier[]}
 */
export function getPlannerStatSkillModifiers(statKey) {
  const k = String(statKey || '').trim().toLowerCase();
  return _plannerStatSkillModifiersByKey[k] || [];
}
