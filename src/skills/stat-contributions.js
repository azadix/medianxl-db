/**
 * @file Build bucket contributions from a skill's `scalingConstants` rows.
 *
 * This is the Phase 3 replacement for the skill half of `planner-stat-modifiers.js`.
 * It deliberately mirrors the legacy slot aggregation for now (including `pairedStat`
 * routing and "sum value0..3" fallback) so results can be compared, while adding
 * source provenance and explicit unsupported reports.
 *
 * @module skills/stat-contributions
 */

import Skill from '@/skills/domain/Skill.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { isScalingConstantRowActive } from '@/skills/domain/show-conditions.js';
import {
  createContribution,
  createSource,
  ignoredReport,
  unsupportedReport,
} from '@/character/bucket/contributions.js';

/** Stat keys on Summon-tagged skills that describe the minion, not the character. */
const MINION_ONLY_STATS = new Set([
  'life',
  'mana',
  'defense',
  'attack_rating',
  'block_chance',
  'block_speed',
  'hit_recovery',
]);

/**
 * @param {object|null|undefined} row
 * @param {string} statKey
 * @returns {boolean}
 */
function isMinionStatRow(row, statKey) {
  const tags = Array.isArray(row?.tags) ? row.tags : [];
  return (
    tags.some((tag) => String(tag).toLowerCase().includes('summon')) &&
    MINION_ONLY_STATS.has(statKey)
  );
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
function numericSlot(raw) {
  if (raw == null || raw === '') return null;
  const num = Number(String(raw).trim());
  return Number.isFinite(num) ? num : null;
}

/**
 * @param {Record<string, unknown>|null|undefined} values
 * @returns {number}
 */
function sumNumericSlots(values) {
  if (!values || typeof values !== 'object') return 0;
  let sum = 0;
  for (const field of ['value0', 'value1', 'value2', 'value3']) {
    const num = numericSlot(values[field]);
    if (num != null) sum += num;
  }
  return sum;
}

/**
 * Resolve a `pairedStat` token to a registry key.
 * @param {import('@/shared/skill-data-store.js').SkillFileStore|null} store
 * @param {import('@/character/bucket/registry.js').StatRegistry} registry
 * @param {string} token
 * @returns {string|null}
 */
function resolvePlannerKey(store, registry, token) {
  const key = String(token ?? '').trim().toLowerCase();
  if (!key) return null;
  if (registry.has(key)) return key;
  const byKey = store?.characterStatByKeyLower?.get(key);
  const k1 = byKey?.key != null ? String(byKey.key).trim().toLowerCase() : '';
  if (k1 && registry.has(k1)) return k1;
  const byStats = store?.characterStatByStatsKeyLower?.get(key);
  const k2 = byStats?.key != null ? String(byStats.key).trim().toLowerCase() : '';
  if (k2 && registry.has(k2)) return k2;
  return null;
}

/**
 * @param {import('@/shared/skill-data-store.js').SkillFileStore|null} store
 * @param {import('@/character/bucket/registry.js').StatRegistry} registry
 * @param {string} statKey
 * @returns {{ valueIndex: number, plannerKey: string }[]}
 */
function pairedStatRouting(store, registry, statKey) {
  const meta = store?.getStatByKeyLower?.(statKey);
  const entries = Array.isArray(meta?.pairedStat) ? meta.pairedStat : [];
  /** @type {{ valueIndex: number, plannerKey: string }[]} */
  const out = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const index = Number(entry.valueIndex ?? entry.value_index ?? entry.slot);
    if (!Number.isInteger(index) || index < 0 || index > 3) continue;
    const token =
      entry.stat ?? entry.plannerKey ?? entry.key ?? entry.characterStat ?? entry.character_stat;
    const plannerKey = resolvePlannerKey(store, registry, token);
    if (plannerKey) out.push({ valueIndex: index, plannerKey });
  }
  return out;
}

/**
 * @param {object|null|undefined} storeStat
 * @returns {boolean}
 */
function isKnownSkillStat(storeStat) {
  return Boolean(storeStat && typeof storeStat === 'object');
}

/**
 * @typedef {object} SkillContributionInput
 * @property {object} row Skill catalog row (skills.json).
 * @property {number} level Effective skill level used for scaling.
 * @property {object} [characterState] `{ blvl, lvl, stats }` for formula evaluation.
 * @property {number} [ulvl] Character level for formulas.
 * @property {string|null} [variantKey] Selected skill variant, or null for the default row.
 * @property {import('@/character/bucket/registry.js').StatRegistry} registry Character stat registry.
 * @property {string} [sourceId] Override source id (defaults to the skill id).
 * @property {string} [label] Override display label (defaults to displayName).
 * @property {object} [skill] Pre-built Skill instance (tests).
 */

/**
 * @param {SkillContributionInput} input
 * @returns {{
 *   contributions: object[],
 *   reports: object[],
 *   rowCount: number,
 *   pairedRows: number,
 *   unknownRows: number,
 * }}
 */
export function buildSkillContributions(input) {
  const row = input.row;
  if (!row || !row.id) throw new Error('buildSkillContributions requires a skill row');
  const registry = input.registry;
  if (!registry) throw new Error('buildSkillContributions requires a stat registry');
  const store = getFileSkillStore();
  const skillId = String(row.id);
  const label = String(input.label || row.displayName || skillId);
  const source = createSource({ kind: 'skill', id: input.sourceId || skillId, label });
  const skill = input.skill || new Skill({ id: skillId, name: label });
  const level = Math.max(0, Math.floor(Number(input.level) || 0));
  const ulvl = Math.max(1, Math.floor(Number(input.ulvl) || 1));
  const variantKey =
    input.variantKey != null && String(input.variantKey).trim() !== ''
      ? String(input.variantKey).trim()
      : null;

  /** @type {object[]} */
  const contributions = [];
  /** @type {object[]} */
  const reports = [];
  let rowCount = 0;
  let pairedRows = 0;
  let unknownRows = 0;

  const scalingConstants = Array.isArray(row.scalingConstants) ? row.scalingConstants : [];
  const characterState = input.characterState || { blvl: {}, lvl: {}, stats: {} };

  for (let index = 0; index < scalingConstants.length; index++) {
    const scRow = scalingConstants[index];
    if (!scRow || typeof scRow !== 'object') continue;
    const statKeyRaw = scRow.statKey;
    if (statKeyRaw == null || String(statKeyRaw).trim() === '') continue;
    const statKey = String(statKeyRaw).trim().toLowerCase();
    const lineId = `${source.id}:${index}:${statKey}`;

    if (isMinionStatRow(row, statKey)) {
      reports.push(
        ignoredReport({
          id: `${lineId}:minion`,
          text: statKey,
          source,
          stat: statKey,
          reason: 'minion-stat',
        })
      );
      continue;
    }

    const rowVariant =
      scRow.variantKey != null && String(scRow.variantKey).trim() !== ''
        ? String(scRow.variantKey).trim()
        : null;
    if (variantKey == null) {
      if (rowVariant != null) continue;
    } else if (rowVariant !== variantKey) {
      continue;
    }

    const minCharLevel = numericSlot(scRow.minCharacterLevel);
    if (minCharLevel != null && minCharLevel > 0 && ulvl < minCharLevel) {
      reports.push(
        ignoredReport({
          id: `${lineId}:level`,
          text: statKey,
          source,
          stat: statKey,
          reason: 'below-character-level',
        })
      );
      continue;
    }

    const minCognition = numericSlot(scRow.minCognition ?? scRow.min_cognition);
    if (minCognition != null && minCognition > 0) {
      const rawCognition = Number(characterState?.stats?.cognition);
      const cognition = Number.isFinite(rawCognition) ? rawCognition : 0;
      if (cognition < minCognition) {
        reports.push(
          ignoredReport({
            id: `${lineId}:cognition`,
            text: statKey,
            source,
            stat: statKey,
            reason: 'below-cognition',
          })
        );
        continue;
      }
    }

    if (!isScalingConstantRowActive(row, scRow)) {
      reports.push(
        ignoredReport({
          id: `${lineId}:condition`,
          text: statKey,
          source,
          stat: statKey,
          reason: 'condition-inactive',
        })
      );
      continue;
    }

    let values;
    try {
      values = skill.getScalingValues(
        level,
        statKey,
        Number(scRow.occurrenceIndex) || 0,
        characterState,
        ulvl,
        false,
        0,
        variantKey
      );
    } catch {
      values = null;
    }
    if (!values || typeof values !== 'object') {
      reports.push(
        unsupportedReport({
          id: `${lineId}:no-values`,
          text: statKey,
          source,
          stat: statKey,
          reason: 'formula-error',
        })
      );
      continue;
    }
    rowCount += 1;

    const routing = pairedStatRouting(store, registry, statKey);
    const storeStat = store?.getStatByKeyLower?.(statKey);

    if (routing.length) {
      pairedRows += 1;
      const claimed = new Set(routing.map((entry) => entry.valueIndex));
      for (const route of routing) {
        const value = numericSlot(values[`value${route.valueIndex}`]);
        if (value == null || value === 0) continue;
        contributions.push(
          createContribution({
            id: `${lineId}:paired:${route.valueIndex}:${route.plannerKey}`,
            stat: route.plannerKey,
            op: 'base',
            stage: 'pre',
            value,
            source,
            conditions: [],
          })
        );
      }
      if (registry.has(statKey)) {
        for (let slot = 0; slot <= 3; slot++) {
          if (claimed.has(slot)) continue;
          const value = numericSlot(values[`value${slot}`]);
          if (value == null || value === 0) continue;
          contributions.push(
            createContribution({
              id: `${lineId}:remainder:${slot}`,
              stat: statKey,
              op: 'base',
              stage: 'pre',
              value,
              source,
              conditions: [],
            })
          );
        }
      }
      continue;
    }

    if (registry.has(statKey)) {
      const total = sumNumericSlots(values);
      if (total !== 0) {
        contributions.push(
          createContribution({
            id: `${lineId}:sum`,
            stat: statKey,
            op: 'base',
            stage: 'pre',
            value: total,
            source,
            conditions: [],
          })
        );
      }
      continue;
    }

    if (isKnownSkillStat(storeStat)) {
      reports.push(
        ignoredReport({
          id: `${lineId}:scoped`,
          text: statKey,
          source,
          stat: statKey,
          reason: 'skill-scoped',
        })
      );
      continue;
    }

    if (sumNumericSlots(values) !== 0) {
      unknownRows += 1;
      reports.push(
        unsupportedReport({
          id: `${lineId}:unknown`,
          text: statKey,
          source,
          stat: statKey,
          reason: 'unknown-stat',
        })
      );
    } else {
      reports.push(
        ignoredReport({
          id: `${lineId}:display`,
          text: statKey,
          source,
          stat: statKey,
          reason: 'display-only',
        })
      );
    }
  }

  return { contributions, reports, rowCount, pairedRows, unknownRows };
}
