/**
 * @file Skill source adapter for the character bucket.
 * Replaces the skill half of `recomputePlannerStatsFromSkillAllocations()` with
 * explicit contributions and reports. Subskills are expanded with their parent level.
 *
 * @module character/bucket/sources/skills
 */

import { getFileSkillStore, withBaseAttributeFormulaStats } from '@/shared/skill-data-store.js';
import { getTreeSkillsCache } from '@/character/planner-snapshot.js';
import { getSkillVariantKey } from '@/tree/skill-variants.js';
import { isSubskillActive } from '@/skills/domain/conditional-subskills.js';
import { buildSkillContributions } from '@/skills/stat-contributions.js';
import { computeSkillLevels } from '@/skills/skill-levels.js';

/**
 * @param {import('@/shared/skill-data-store.js').SkillFileStore|null} store
 * @param {string} key
 * @returns {object|null}
 */
function catalogRowBySkillKey(store, key) {
  if (!store) return null;
  const raw = String(key ?? '').trim();
  if (!raw) return null;
  return (
    store.catalogByInternalId?.get(raw) ??
    store.catalogByInternalId?.get(raw.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_')) ??
    store.catalog?.find(
      (row) => String(row?.displayName || '').trim().toLowerCase() === raw.toLowerCase()
    ) ??
    null
  );
}

/**
 * @param {object[]} entries
 * @param {import('@/character/bucket/registry.js').StatRegistry|undefined} registry
 * @returns {{ order: object[], depsByKey: Map<string, Set<string>> }}
 */
export function orderSkillEntries(entries, registry) {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const bySkillId = new Map();
  for (const entry of entries) {
    bySkillId.set(String(entry.row.id), entry.key);
    bySkillId.set(String(entry.row.displayName || '').trim().toLowerCase(), entry.key);
  }
  /** @type {Map<string, Set<string>>} */
  const producersByStat = new Map();
  for (const entry of entries) {
    for (const sc of entry.row.scalingConstants || []) {
      const stat = String(sc?.statKey || '').trim().toLowerCase();
      if (!stat || !registry?.has?.(stat)) continue;
      if (!producersByStat.has(stat)) producersByStat.set(stat, new Set());
      producersByStat.get(stat).add(entry.key);
    }
  }

  /** @type {Map<string, Set<string>>} */
  const depsByKey = new Map(entries.map((entry) => [entry.key, new Set()]));
  const globalRef = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const skillRef = /\[\[\s*([a-zA-Z0-9_]+)\s*\]\]/g;
  for (const entry of entries) {
    const deps = depsByKey.get(entry.key);
    for (const sc of entry.row.scalingConstants || []) {
      const text = Object.values(sc || {})
        .filter((value) => typeof value === 'string')
        .join(' ');
      for (const match of text.matchAll(globalRef)) {
        const stat = String(match[1]).trim().toLowerCase();
        for (const producer of producersByStat.get(stat) || []) {
          if (producer !== entry.key) deps.add(producer);
        }
      }
      for (const match of text.matchAll(skillRef)) {
        const ref = String(match[1]).trim().toLowerCase();
        const target = bySkillId.get(ref) || bySkillId.get(match[1]);
        if (target && target !== entry.key) deps.add(target);
      }
    }
  }

  /** @type {Map<string, number>} */
  const indegree = new Map(entries.map((entry) => [entry.key, depsByKey.get(entry.key).size]));
  /** @type {Map<string, Set<string>>} */
  const dependents = new Map(entries.map((entry) => [entry.key, new Set()]));
  for (const [key, deps] of depsByKey) {
    for (const dep of deps) dependents.get(dep)?.add(key);
  }
  /** @type {string[]} */
  const queue = [...indegree].filter(([, count]) => count === 0).map(([key]) => key);
  /** @type {string[]} */
  const orderKeys = [];
  while (queue.length) {
    const key = queue.shift();
    orderKeys.push(key);
    for (const dependent of dependents.get(key) || []) {
      const next = (indegree.get(dependent) || 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  // Cycles: keep deterministic original order rather than hiding the skills.
  for (const entry of entries) {
    if (!orderKeys.includes(entry.key)) orderKeys.push(entry.key);
  }
  return { order: orderKeys.map((key) => byKey.get(key)).filter(Boolean), depsByKey };
}

/**
 * @param {Map<string, number>} produced
 * @param {object[]} contributions
 */
function mergeProducedStats(produced, contributions) {
  for (const contribution of contributions) {
    if (!contribution || contribution.op !== 'base') continue;
    const stat = String(contribution.stat || '').toLowerCase();
    const value = Number(contribution.value);
    if (!stat || !Number.isFinite(value)) continue;
    produced.set(stat, (produced.get(stat) || 0) + value);
  }
}
/**
 * @param {object} bucket
 * @param {{
 *   character: object,
 *   registry: import('@/character/bucket/registry.js').StatRegistry,
 *   effectiveLevel?: number,
 *   allSkillsBonus?: number,
 *   classSkillsBonus?: number,
 *   stats?: Record<string, number>,
 * }} input
 * @returns {{ skills: number, subskills: number, contributions: number, reports: number }}
 */
export function applySkillSources(bucket, input) {
  const character = input.character;
  if (!bucket) throw new Error('applySkillSources requires a bucket');
  if (!character) throw new Error('applySkillSources requires a character');
  const store = getFileSkillStore();
  if (!store) throw new Error('applySkillSources requires the skill data store');

  bucket.clearCompartment('skills');

  const levels = computeSkillLevels({
    character,
    effectiveLevel: input.effectiveLevel,
    allSkillsBonus: input.allSkillsBonus,
    classSkillsBonus: input.classSkillsBonus,
  });
  const ulvl = levels.effectiveLevel;
  const charClass = character.className != null ? String(character.className) : '';
  const baseStats =
    input.stats ||
    (typeof character.getAllStatsWithoutSkillBonuses === 'function'
      ? character.getAllStatsWithoutSkillBonuses()
      : character.getAllRawStats());
  const characterState = {
    level: ulvl,
    className: charClass,
    blvl: { ...levels.mergedBlvl },
    lvl: { ...levels.softLevels },
    treeSkillsCache: getTreeSkillsCache(),
    stats: withBaseAttributeFormulaStats(baseStats, character),
    oSkillIds: [],
    relicOSkillIds: [],
  };

  let skills = 0;
  let subskills = 0;
  let contributions = 0;
  let reports = 0;

  /** @type {Array<{ key: string, row: object, level: number, soft: number, effectiveLevel: number }>} */
  const entries = [];
  for (const [internalKey, blvl] of Object.entries(levels.mergedBlvl)) {
    const level = Math.max(0, Math.floor(Number(blvl) || 0));
    const soft = Math.max(0, Math.floor(Number(levels.softLevels[internalKey]) || 0));
    if (level <= 0 && soft <= 0) continue;
    const row = catalogRowBySkillKey(store, internalKey);
    if (!row?.id) continue;
    // Toggleable buffs stay in the level map for cross-skill formulas, but do not
    // contribute their own stats while disabled.
    if (character.isSkillDisabled?.(String(row.id))) continue;
    entries.push({
      key: internalKey,
      row,
      level,
      soft,
      effectiveLevel: Math.max(0, Math.floor(Number(levels.levels[internalKey]) || 0)),
    });
  }

  // Evaluate skill producers before consumers so `{{skill_duration}}`-style stats are
  // visible to the next skill in the same pass (the old fixed-point loop's job).
  const { order } = orderSkillEntries(entries, input.registry);
  const produced = new Map(Object.entries(characterState.stats));
  for (const entry of order) {
    const { row, level, soft, effectiveLevel } = entry;
    const resolved = buildSkillContributions({
      row,
      level: effectiveLevel,
      characterState,
      ulvl,
      variantKey: getSkillVariantKey(String(row.id)),
      registry: input.registry,
      sourceId: String(row.id),
      label: row.displayName || String(row.id),
    });
    bucket.setSource('skills', String(row.id), {
      contributions: resolved.contributions,
      reports: resolved.reports,
    });
    mergeProducedStats(produced, resolved.contributions);
    for (const [stat, value] of produced) characterState.stats[stat] = value;
    skills += 1;
    contributions += resolved.contributions.length;
    reports += resolved.reports.length;

    const subs = store.catalogByParentSkillId?.get(String(row.id)) ?? [];
    for (const sub of subs) {
      if (!isSubskillActive(sub, characterState)) continue;
      const subId = String(sub.id);
      const patchedState = {
        ...characterState,
        blvl: { ...characterState.blvl, [subId]: level },
        lvl: { ...characterState.lvl, [subId]: soft },
      };
      const subResolved = buildSkillContributions({
        row: sub,
        level: effectiveLevel,
        characterState: patchedState,
        ulvl,
        variantKey: getSkillVariantKey(subId),
        registry: input.registry,
        sourceId: subId,
        label: sub.displayName || subId,
      });
      bucket.setSource('skills', subId, {
        contributions: subResolved.contributions,
        reports: subResolved.reports,
      });
      mergeProducedStats(produced, subResolved.contributions);
      for (const [stat, value] of produced) characterState.stats[stat] = value;
      subskills += 1;
      contributions += subResolved.contributions.length;
      reports += subResolved.reports.length;
    }
  }

  return { skills, subskills, contributions, reports };
}
