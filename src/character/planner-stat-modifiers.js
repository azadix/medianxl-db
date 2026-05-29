/**
 * Skill-based modifiers to planner stats (life, mana, attributes, etc.).
 * Return rows here so stat tooltips can list them (e.g. Curare: +100 poison length reduction).
 *
 * Hook {@link recomputePlannerStatsFromSkillAllocations} runs when skill allocations change
 * (see {@link runPlannerSkillStatRecompute} in character-state.js).
 */

import Skill from '@/skills/domain/Skill.js';
import { getFileSkillStore } from '@/tree/skill-data-store.js';
import { isConditionSelected } from '@/stores/planner-config-store.js';
import { isSubskillActive } from '@/skills/domain/conditional-subskills.js';
import { getSkillVariantKey } from '@/tree/skill-variants.js';
import {
  getPlannerStatDef,
  isPlannerBaseStatKey,
  normalizePlannerStatValue
} from './planner-stats-config.js';

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
 * @param {import('@/tree/skill-data-store.js').SkillFileStore|null} store
 * @param {string} skillKey
 * @returns {object|null} catalog row
 */
function catalogRowBySkillKey(store, skillKey) {
  const rawKey = String(skillKey ?? '').trim();
  if (!rawKey || !store) return null;
  let row = store.catalogByInternalId?.get(rawKey) ?? null;
  if (row) return row;
  if (/^\d+$/.test(rawKey)) {
    const nid = Number(rawKey);
    const hit = Array.isArray(store.catalog) ? store.catalog.find((r) => Number(r?.numericId) === nid) : null;
    if (hit) return hit;
  }
  const norm = rawKey.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_');
  row = store.catalogByInternalId?.get(norm) ?? null;
  if (row) return row;
  const hit = Array.isArray(store.catalog)
    ? store.catalog.find((r) => String(r?.displayName || '').trim().toLowerCase() === rawKey.toLowerCase())
    : null;
  return hit ?? null;
}

/**
 * @param {Record<string, unknown>|null|undefined} scalingValues
 * @returns {number}
 */
function sumEvaluatedNumericSlots(scalingValues) {
  if (!scalingValues || typeof scalingValues !== 'object') return 0;
  let sum = 0;
  for (const field of ['value0', 'value1', 'value2', 'value3']) {
    const raw = scalingValues[field];
    if (raw == null || raw === '') continue;
    const str = String(raw).trim();
    const n = Number(str);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

/**
 * Resolve a token from stats.json `pairedStat[].stat` to a planner registry key (character_stats `key`).
 * @param {import('@/tree/skill-data-store.js').SkillFileStore|null} store
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
 * Validated entries from stats.json `pairedStat` (optional array on the scaling-stat row).
 * Every valid object is kept: multiple rows may share the same valueIndex so one slot updates several planner stats.
 * @param {import('@/tree/skill-data-store.js').SkillFileStore|null} store
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
    if (!plannerKey) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[pairedStat] Unknown planner stat token:', st);
      }
      continue;
    }
    out.push({ valueIndex: n, plannerKey });
  }
  return out;
}

/**
 * @param {Record<string, unknown>|null|undefined} scalingValues
 * @param {number} valueIndex 0..3
 * @returns {number|null}
 */
function numericValueSlot(scalingValues, valueIndex) {
  if (!scalingValues || typeof scalingValues !== 'object') return null;
  const field = `value${valueIndex}`;
  const raw = scalingValues[field];
  if (raw == null || raw === '') return null;
  const num = Number(String(raw).trim());
  return Number.isFinite(num) ? num : null;
}

/**
 * @param {import('@/tree/skill-data-store.js').SkillFileStore|null} store
 * @param {string} scalingStatKey lowercased skills scalingConstants.statKey
 * @returns {{ valueIndex: number, plannerKey: string }[]}
 */
export function getPairedStatRouting(store, scalingStatKey) {
  const meta = store?.getStatByKeyLower?.(scalingStatKey);
  return normalizePairedStatList(store, meta?.pairedStat);
}

/**
 * @param {string} plannerKey
 * @param {number} delta
 * @param {string} internalId
 * @param {string} displayName
 * @param {string} slotLabel e.g. "value0" or "remainder"
 */
function pushPlannerStatModifier(plannerKey, delta, internalId, displayName, slotLabel, active = true) {
  if (!Number.isFinite(delta) || delta === 0) return;
  const desc = `${delta >= 0 ? '+' : ''}${formatModifierDisplayValue(delta)}${slotLabel ? ` (${slotLabel})` : ''}`;
  if (!_plannerStatSkillModifiersByKey[plannerKey]) _plannerStatSkillModifiersByKey[plannerKey] = [];
  _plannerStatSkillModifiersByKey[plannerKey].push({
    skillId: internalId,
    displayName,
    description: desc,
    kind: 'flat',
    value: delta,
    active: Boolean(active)
  });
}

/**
 * @param {Record<string, number>} bonuses
 * @param {string} plannerKey
 * @param {number} delta
 */
function addBonus(bonuses, plannerKey, delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  const prev = bonuses[plannerKey] || 0;
  bonuses[plannerKey] = prev + delta;
}

function formatModifierDisplayValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return Math.abs(num - Math.round(num)) < 1e-6 ? String(Math.round(num)) : num.toFixed(2);
}

/**
 * @typedef {{
 *   effectiveLevel: number,
 *   treeSkillsCache: Record<string, string[]>,
 *   allSkillsBonus: number,
 *   mergedBlvl: Record<string, number>
 * }} PlannerSkillStatRecomputeContext
 */

/**
 * @param {import('./Character.js').default} character
 * @param {PlannerSkillStatRecomputeContext} ctx
 */
export async function recomputePlannerStatsFromSkillAllocations(character, ctx) {
  _plannerStatSkillModifiersByKey = {};
  if (!character) return;

  const store = getFileSkillStore();
  if (!store || !ctx) {
    character.setPlannerSkillStatBonuses({});
    return;
  }

  const { effectiveLevel, treeSkillsCache, allSkillsBonus, mergedBlvl } = ctx;
  const ulvl = Math.max(1, Math.floor(Number(effectiveLevel) || 1));
  const slvlBonus = Math.max(0, Math.floor(Number(allSkillsBonus) || 0));

  /** @type {Record<string, number>} */
  const bonuses = {};

  const characterState = {
    level: ulvl,
    className: character.className,
    blvl: { ...mergedBlvl },
    lvl: {},
    treeSkillsCache: treeSkillsCache && typeof treeSkillsCache === 'object' ? treeSkillsCache : {},
    stats: { ...character.getAllRawStats() }
  };

  for (const name of Object.keys(characterState.blvl)) {
    characterState.lvl[name] = slvlBonus;
  }

  /**
   * Apply one catalog row's scalingConstants at a given blvlPoints.
   * Rows with `minCognition` are applied in a second pass so the gate uses cognition
   * from all other scaling rows (e.g. Cognition skill formula before the 150+ EMR line).
   * @param {object} catRow
   * @param {string} internalKeyForLookup - key used for stored variant selection fallback
   * @param {number} blvlPoints
   * @param {object} effectiveCharacterState
   * @param {{ skipMinCognitionRows?: boolean, onlyMinCognitionRows?: boolean }} [rowPhase]
   */
  async function applyScalingConstantsForCatalogRow(
    catRow,
    internalKeyForLookup,
    blvlPoints,
    effectiveCharacterState,
    rowPhase = {}
  ) {
    const { skipMinCognitionRows = false, onlyMinCognitionRows = false } = rowPhase;
    if (!catRow?.numericId) return;

    const internalId = String(catRow.id);
    const displayName =
      catRow.displayName != null && String(catRow.displayName).trim() !== ''
        ? String(catRow.displayName)
        : internalId;
    const numericId = Number(catRow.numericId);
    if (!Number.isFinite(numericId)) return;

    const scalingConstants = Array.isArray(catRow.scalingConstants) ? catRow.scalingConstants : [];
    if (scalingConstants.length === 0) return;

    const skill = new Skill({ id: internalId, name: displayName, skillId: numericId });

    const storedVk = getSkillVariantKey(internalId) ?? getSkillVariantKey(internalKeyForLookup);
    const selectedVariantKey =
      storedVk != null && String(storedVk).trim() !== '' ? String(storedVk).trim() : null;

    // Determine if this catalog row has conditions and whether any are selected
    const conds = store.getConditionsForSkill(catRow);
    const hasConds = Array.isArray(conds) && conds.length > 0;
    const rowActive = !hasConds || conds.some((cc) => isConditionSelected(cc.key));

    for (const scRow of scalingConstants) {
      const statKeyRaw = scRow?.statKey;
      if (statKeyRaw == null || String(statKeyRaw).trim() === '') continue;
      const statKey = String(statKeyRaw).trim().toLowerCase();
      const pairedRouting = getPairedStatRouting(store, statKey);
      const usePairedRouting = pairedRouting.length > 0;
      if (!usePairedRouting && !isPlannerBaseStatKey(statKey)) continue;

      const rowVariantKey =
        scRow.variantKey != null && String(scRow.variantKey).trim() !== ''
          ? String(scRow.variantKey).trim()
          : null;
      if (selectedVariantKey == null) {
        if (rowVariantKey != null) continue;
      } else if (rowVariantKey !== selectedVariantKey) {
        continue;
      }

      const occurrenceIndex =
        scRow.occurrenceIndex != null && String(scRow.occurrenceIndex).trim() !== ''
          ? Math.max(0, Math.floor(Number(scRow.occurrenceIndex)))
          : 0;
      const variantKey = rowVariantKey;

      const minCharLevelRaw = scRow.minCharacterLevel;
      const minCharLevel =
        minCharLevelRaw != null && String(minCharLevelRaw).trim() !== ''
          ? Math.floor(Number(minCharLevelRaw))
          : null;
      if (
        minCharLevel != null &&
        Number.isFinite(minCharLevel) &&
        minCharLevel > 0 &&
        ulvl < minCharLevel
      ) {
        continue;
      }

      const minCognitionRaw = scRow.minCognition ?? scRow.min_cognition;
      const minCognition =
        minCognitionRaw != null && String(minCognitionRaw).trim() !== ''
          ? Math.floor(Number(minCognitionRaw))
          : null;
      const hasMinCognition =
        minCognition != null && Number.isFinite(minCognition) && minCognition > 0;
      if (skipMinCognitionRows && hasMinCognition) {
        continue;
      }
      if (onlyMinCognitionRows && !hasMinCognition) {
        continue;
      }
      if (onlyMinCognitionRows && hasMinCognition) {
        const rawCog = Number(effectiveCharacterState.stats?.cognition);
        const bonusCog = Number(bonuses.cognition);
        const totalCognition =
          (Number.isFinite(rawCog) ? rawCog : 0) + (Number.isFinite(bonusCog) ? bonusCog : 0);
        if (totalCognition < minCognition) {
          continue;
        }
      }

      let scalingValues;
      try {
        scalingValues = await skill.getScalingValues(
          blvlPoints,
          statKey,
          occurrenceIndex,
          effectiveCharacterState,
          ulvl,
          false,
          0,
          variantKey
        );
      } catch {
        scalingValues = null;
      }

      if (!scalingValues || typeof scalingValues !== 'object') continue;

      if (usePairedRouting) {
        const claimed = new Set(pairedRouting.map((p) => p.valueIndex));
        for (const { valueIndex, plannerKey } of pairedRouting) {
          const slotVal = numericValueSlot(scalingValues, valueIndex);
          if (slotVal == null || slotVal === 0) continue;
          if (rowActive) addBonus(bonuses, plannerKey, slotVal);
          pushPlannerStatModifier(plannerKey, slotVal, internalId, displayName, '', rowActive);
        }
        if (isPlannerBaseStatKey(statKey)) {
          for (let i = 0; i <= 3; i++) {
            if (claimed.has(i)) continue;
            const slotVal = numericValueSlot(scalingValues, i);
            if (slotVal == null || slotVal === 0) continue;
            if (rowActive) addBonus(bonuses, statKey, slotVal);
            pushPlannerStatModifier(statKey, slotVal, internalId, displayName, `value${i} remainder`, rowActive);
          }
        }
        continue;
      }

      const delta = sumEvaluatedNumericSlots(scalingValues);
      if (!Number.isFinite(delta) || delta === 0) continue;
      if (rowActive) addBonus(bonuses, statKey, delta);
      pushPlannerStatModifier(statKey, delta, internalId, displayName, '', rowActive);
    }
  }

  for (const [internalKey, rawPoints] of Object.entries(mergedBlvl || {})) {
    const blvlPoints = Math.max(0, Math.floor(Number(rawPoints) || 0));
    if (blvlPoints <= 0) continue;

    const catRow = catalogRowBySkillKey(store, internalKey);
    if (!catRow?.numericId) continue;

    // Apply the allocated (parent) skill row itself (then cognition-gated rows).
    await applyScalingConstantsForCatalogRow(catRow, internalKey, blvlPoints, characterState, {
      skipMinCognitionRows: true
    });
    await applyScalingConstantsForCatalogRow(catRow, internalKey, blvlPoints, characterState, {
      onlyMinCognitionRows: true
    });

    // Apply any linked subskills with the same points as their parent.
    const parentInternalId = String(catRow.id);
    const subskills = Array.isArray(store.catalog)
      ? store.catalog.filter(
          (r) =>
            r?.parentSkillId != null &&
            String(r.parentSkillId).trim() !== '' &&
            String(r.parentSkillId).trim() === parentInternalId
        )
      : [];
    for (const sub of subskills) {
      if (!isSubskillActive(sub, characterState)) {
        continue;
      }
      const subInternalId = String(sub.id);
      const patchedState = {
        ...characterState,
        blvl: { ...(characterState.blvl || {}), [subInternalId]: blvlPoints },
        lvl: { ...(characterState.lvl || {}), [subInternalId]: slvlBonus }
      };
      await applyScalingConstantsForCatalogRow(sub, subInternalId, blvlPoints, patchedState, {
        skipMinCognitionRows: true
      });
      await applyScalingConstantsForCatalogRow(sub, subInternalId, blvlPoints, patchedState, {
        onlyMinCognitionRows: true
      });
    }
  }

  for (const k of Object.keys(bonuses)) {
    bonuses[k] = normalizePlannerStatValue(k, bonuses[k]);
  }

  character.setPlannerSkillStatBonuses(bonuses);
}

/**
 * @param {string} statKey Planner base stat key (e.g. 'life', 'strength')
 * @returns {PlannerStatModifier[]}
 */
export function getPlannerStatSkillModifiers(statKey) {
  const k = String(statKey || '').trim().toLowerCase();
  return _plannerStatSkillModifiersByKey[k] || [];
}
