/**
 * @file Effective/soft skill levels for the character bucket.
 * Mirrors the soft-level rules that used to live inside `planner-stat-modifiers.js`.
 *
 * @module skills/skill-levels
 */

import Character from '@/character/Character.js';
import { getOSkillIdentifierSet } from '@/character/planner-oskills.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { getRelicSkillBonusForSkill } from '@/items/skill-bonus-from-modifiers.js';
import { getEquippedGearSkillBonusForSkill } from '@/items/item-granted-oskills.js';

/**
 * Resolve merged skill levels (internal id -> blvl) for passive stat aggregation.
 * Regular tree skills exclude oSkill keys; oSkills use manual points only (item grants are slvl).
 * @param {import('@/character/Character.js').default} character
 * @returns {Record<string, number>}
 */
export function buildMergedSkillLevelsForStatRecompute(character) {
  if (!character) return {};
  const store = getFileSkillStore();
  const oSkillKeys = getOSkillIdentifierSet();
  /** @type {Record<string, number>} */
  const regular = {};
  for (const [key, value] of Object.entries(character.getAllSkillPoints?.() || {})) {
    if (!oSkillKeys.has(key)) regular[key] = value;
  }

  /** @type {Record<string, number>} */
  const byInternal = {};

  function addPoints(skillKey, pts) {
    const n = Math.max(0, Math.floor(Number(pts) || 0));
    if (n <= 0) return;
    let internal = String(skillKey).trim();
    if (store) {
      const row =
        store.catalogByInternalId?.get(internal) ??
        store.catalogByInternalId?.get(
          internal.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_')
        ) ??
        store.catalog?.find(
          (r) => String(r?.displayName || '').trim().toLowerCase() === internal.toLowerCase()
        );
      if (row?.id) internal = String(row.id);
    }
    // Keep disabled toggle skills in the level map: passives such as Reverence read
    // their level through [[veneration_of_justice]] even when the buff itself is off.
    byInternal[internal] = (byInternal[internal] || 0) + n;
  }

  for (const [k, v] of Object.entries(regular)) addPoints(k, v);

  for (const row of character.oSkills || []) {
    const parts = Character.oSkillLevelParts(row, 0);
    if (parts.effective <= 0) continue;
    const sid = String(row?.slotId ?? '').trim();
    if (sid && character.isOSkillSlotDisabled(sid)) continue;
    if (row.skillName) {
      const rowHit = store?.catalogByInternalId?.get(String(row.skillName).trim());
      const id = rowHit?.id ? String(rowHit.id) : String(row.skillName).trim();
      const cur = byInternal[id] || 0;
      byInternal[id] = Math.max(cur, parts.blvl);
    }
  }

  return byInternal;
}

/**
 * @param {import('@/shared/skill-data-store.js').SkillFileStore|null} store
 * @param {string} skillKey
 * @returns {object|null}
 */
function catalogRowBySkillKey(store, skillKey) {
  const rawKey = String(skillKey ?? '').trim();
  if (!rawKey || !store) return null;
  let row = store.catalogByInternalId?.get(rawKey) ?? null;
  if (row) return row;
  const norm = rawKey.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_');
  row = store.catalogByInternalId?.get(norm) ?? null;
  if (row) return row;
  const hit = Array.isArray(store.catalog)
    ? store.catalog.find(
        (entry) => String(entry?.displayName || '').trim().toLowerCase() === rawKey.toLowerCase()
      )
    : null;
  return hit ?? null;
}

/**
 * @param {{
 *   character: import('@/character/Character.js').default,
 *   effectiveLevel?: number,
 *   allSkillsBonus?: number,
 *   classSkillsBonus?: number,
 * }} input
 * @returns {{
 *   effectiveLevel: number,
 *   allSkillsBonus: number,
 *   classSkillsBonus: number,
 *   mergedBlvl: Record<string, number>,
 *   softLevels: Record<string, number>,
 *   levels: Record<string, number>,
 * }}
 */
export function computeSkillLevels(input) {
  const character = input.character;
  if (!character) throw new Error('computeSkillLevels requires a character');
  const store = getFileSkillStore();
  const effectiveLevel = Math.max(1, Math.floor(Number(input.effectiveLevel) || character.level || 1));
  const allSkillsBonus = Math.max(0, Math.floor(Number(input.allSkillsBonus) || 0));
  const classSkillsBonus = Math.max(0, Math.floor(Number(input.classSkillsBonus) || 0));
  const charClass = character.className != null ? String(character.className) : '';
  const mergedBlvl = buildMergedSkillLevelsForStatRecompute(character);

  /** @type {Record<string, number>} */
  const softLevels = {};
  /** @type {Record<string, number>} */
  const levels = {};

  /**
   * @param {string} skillKey
   * @returns {number}
   */
  function softLevelForSkillKey(skillKey) {
    const cat = catalogRowBySkillKey(store, skillKey);
    const skillClass = cat?.class != null ? String(cat.class) : '';
    const getsClassBonus = charClass !== '' && skillClass === charClass;
    const displayName =
      cat?.displayName != null && String(cat.displayName).trim() !== ''
        ? String(cat.displayName).trim()
        : String(skillKey);
    const softCtx = {
      skillId: skillKey,
      displayName,
      isOSkill: !getsClassBonus,
      className: charClass,
      skillClass,
    };
    const relicBonus = Number(getRelicSkillBonusForSkill(softCtx)) || 0;
    const gearSoft = Number(getEquippedGearSkillBonusForSkill(softCtx)) || 0;
    const itemSlvl = Character.clampOSkillPoints(character.getOSkillItemPoints(skillKey));
    const soft = allSkillsBonus + (getsClassBonus ? classSkillsBonus : 0) + relicBonus + gearSoft + itemSlvl;
    const blvl = Math.max(0, Math.floor(Number(mergedBlvl?.[skillKey]) || 0));
    return Math.min(soft, Math.max(0, Character.OSKILL_MAX_POINTS - blvl));
  }

  for (const key of Object.keys(mergedBlvl)) {
    const soft = softLevelForSkillKey(key);
    softLevels[key] = soft;
    levels[key] = Math.min(
      Character.OSKILL_MAX_POINTS,
      Math.max(0, Math.floor(Number(mergedBlvl[key]) || 0)) + soft
    );
  }

  return {
    effectiveLevel,
    allSkillsBonus,
    classSkillsBonus,
    mergedBlvl,
    softLevels,
    levels,
  };
}
