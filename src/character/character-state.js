/**
 * @file Character planner singleton: init, stats, allocation, quests, oSkills.
 * @module character/character-state
 *
 * Domain slices: allocation.js, build-import-export.js, planner-oskills.js, planner-quests.js.
 */

import Character from './Character.js';
import { normalizePlannerStatValue, isPlannerBaseStatKey } from './planner-stats-config.js';
import {
  getClassPlannerStatDefaults,
  computeClassDerivedLifeMana
} from './class-baselines.js';
import { getPlannerAutoLevelFromSpentSkillPoints } from '@/planner/planner-level-options.js';

// Re-export getBaseSkillPoints for use in other modules
export { Character };
import { recomputePlannerStatsFromSkillAllocations } from './planner-stat-modifiers.js';
import { checkDevotionRestriction, calculateMaxLevel } from '@/skills/domain/skill-calculations.js';
import { extractStatReferences } from '@/skills/domain/formula-evaluator.js';
import { getFileSkillStore } from '../../tree/skill-data-store.js';
import {
  checkUltimateRestriction,
  checkParagonRestriction,
  checkMasteryRestriction,
  checkCovenRestriction,
  checkProficiencyRestriction
} from '@/skills/domain/skill-restrictions.js';
import {
  normalizePrereqSkillTargetKey,
  displayNameForPrereqSkillTarget
} from './prereq-utils.js';

export {
  checkUltimateRestriction,
  checkParagonRestriction,
  checkMasteryRestriction,
  checkCovenRestriction,
  checkProficiencyRestriction
};

/** Last planner skill list from tree load (for min-level / character_level prereqs without threading arrays everywhere). */
let plannerSkillsSnapshot = [];

export function setPlannerSkillsSnapshot(skills) {
  plannerSkillsSnapshot = Array.isArray(skills) ? skills : [];
}

export function getPlannerSkillsSnapshot() {
  return plannerSkillsSnapshot;
}

// Tree skills cache: maps tab_index (from classTabs.id) to array of skill names
let treeSkillsCache = {};

/**
 * Legacy no-op: tab cache is built via {@link buildTreeSkillsCacheFromLoadedSkills}.
 */
export function buildTreeSkillsCache() {
  treeSkillsCache = {};
}

/**
 * Build cache from planner-loaded Skill rows (supports merged cross-patch lists).
 * @param {Array<{ id: string, tab: number }>} skills
 */
export function buildTreeSkillsCacheFromLoadedSkills(skills) {
  treeSkillsCache = {};
  if (!skills || skills.length === 0) return;
  try {
    for (const s of skills) {
      const name = s.id;
      const tabIndex = s.tab;
      if (tabIndex == null || name == null) continue;
      if (!treeSkillsCache[tabIndex]) {
        treeSkillsCache[tabIndex] = [];
      }
      treeSkillsCache[tabIndex].push(name);
    }
  } catch (error) {
    console.error('Error building tree skills cache from loaded skills:', error);
  }
}

/**
 * Get the tree skills cache
 * @returns {object} Cache mapping tab_index to array of skill names
 */
export function getTreeSkillsCache() {
  return treeSkillsCache;
}

// Skills that use OR logic for skill_level prerequisites (instead of AND)
// Format: skill display name
const OR_PREREQUISITE_SKILLS = [
  // Add skill display names here that require only ONE of their skill prerequisites
  // Example: 'Life From Death' requires ONE of: Voodoo Practice OR Debilitating Concoction
  "Life From Death",
  "Bloodthirst",
  "Nightwalker"
];

// Prerequisite display order (lower number = shown first)
const PREREQUISITE_ORDER = {
  'skill_level': 1,        // Required skills (e.g., "Requires Fire Bolt (5)")
  'skill_blocked_by': 2,   // Blocked by skills (e.g., "Cannot allocate while X has points")
  'tree_points': 3,        // Tab points (e.g., "Requires 10 points in Warmonger tree")
  'character_level': 4     // Character level (currently skipped)
};

// Character instance (singleton)
let characterInstance = null;

function notifyPlannerStateChanged(detail = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStateChanged', { detail }));
  }
}

function notifyOSkillPointsChanged(skillNameOrId, action = 'update') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('skillPointsChanged', {
      detail: {
        skillName: skillNameOrId != null ? String(skillNameOrId) : null,
        action,
        skillType: 'oskill'
      }
    })
  );
}

/**
 * Initialize character state for a class
 * @param {string} className - Class name
 * @param {number} level - Character level (for max level calculations and skill point pool)
 */
export function initializeCharacter(className, level = Character.DEFAULT_LEVEL) {
  characterInstance = new Character(className, level);
  notifyPlannerStateChanged({ source: 'initializeCharacter' });
  runPlannerSkillStatRecompute({ immediate: true });
  return characterInstance;
}

/** @type {ReturnType<typeof setTimeout>|null} */
let _plannerSkillStatRecomputeTimer = null;

/**
 * Resolve merged skill levels (internal id -> points) for passive stat aggregation.
 * Regular tree skills exclude oSkill keys; oSkills override same internal id with max points.
 * @param {Character} character
 * @returns {Record<string, number>}
 */
export function buildMergedSkillLevelsForStatRecompute(character) {
  if (!character) return {};
  const store = getFileSkillStore();
  const regular = filterRegularSkillsOnly(character.getAllSkillPoints());

  /** @type {Record<string, number>} */
  const byInternal = {};

  function addPoints(skillKey, pts) {
    const n = Math.max(0, Math.floor(Number(pts) || 0));
    if (n <= 0) return;
    let internal = String(skillKey).trim();
    if (store) {
      const row =
        store.catalogByInternalId?.get(internal) ??
        (/^\d+$/.test(internal)
          ? store.catalog?.find((r) => Number(r?.numericId) === Number(internal))
          : null) ??
        store.catalogByInternalId?.get(
          internal.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_')
        ) ??
        store.catalog?.find(
          (r) => String(r?.displayName || '').trim().toLowerCase() === internal.toLowerCase()
        );
      if (row?.id) internal = String(row.id);
    }
    if (character.isSkillDisabled(internal)) return;
    byInternal[internal] = (byInternal[internal] || 0) + n;
  }

  for (const [k, v] of Object.entries(regular)) {
    addPoints(k, v);
  }

  for (const row of character.oSkills || []) {
    const p = Character.clampOSkillPoints(row?.points ?? 0);
    if (p <= 0) continue;
    const sid = String(row?.slotId ?? '').trim();
    if (sid && character.isOSkillSlotDisabled(sid)) continue;
    if (row.skillName) {
      const rowHit = store?.catalogByInternalId?.get(String(row.skillName).trim());
      const id = rowHit?.id ? String(rowHit.id) : String(row.skillName).trim();
      const cur = byInternal[id] || 0;
      byInternal[id] = Math.max(cur, p);
      continue;
    }
    if (row.skillId != null && store) {
      const hit = store.lookupSkillNameAndDisplayByNumericId(row.skillId);
      if (hit?.name) {
        const id = String(hit.name);
        const cur = byInternal[id] || 0;
        byInternal[id] = Math.max(cur, p);
      }
    }
  }

  return byInternal;
}

async function runPlannerSkillStatRecomputeImpl() {
  if (!characterInstance) return;
  const mergedBlvl = buildMergedSkillLevelsForStatRecompute(characterInstance);
  let allSkillsBonus = 0;
  if (typeof document !== 'undefined') {
    const inp = document.getElementById('allSkillsBonus');
    if (inp instanceof HTMLInputElement) {
      allSkillsBonus = Math.max(0, Math.floor(parseInt(inp.value, 10) || 0));
    }
  }
  await recomputePlannerStatsFromSkillAllocations(characterInstance, {
    effectiveLevel: getEffectivePlannerLevel(),
    treeSkillsCache: getTreeSkillsCache(),
    allSkillsBonus,
    mergedBlvl
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStatsPanelRefresh'));
  }
}

/**
 * Debounced passive stat recompute from allocated skills (scalingConstants).
 * @param {{ immediate?: boolean }} [options]
 */
export function runPlannerSkillStatRecompute(options = {}) {
  if (!characterInstance) return;
  if (options.immediate === true) {
    if (_plannerSkillStatRecomputeTimer != null && typeof window !== 'undefined') {
      window.clearTimeout(_plannerSkillStatRecomputeTimer);
      _plannerSkillStatRecomputeTimer = null;
    }
    void runPlannerSkillStatRecomputeImpl();
    return;
  }
  if (typeof window === 'undefined') {
    void runPlannerSkillStatRecomputeImpl();
    return;
  }
  if (_plannerSkillStatRecomputeTimer != null) {
    window.clearTimeout(_plannerSkillStatRecomputeTimer);
  }
  _plannerSkillStatRecomputeTimer = window.setTimeout(() => {
    _plannerSkillStatRecomputeTimer = null;
    void runPlannerSkillStatRecomputeImpl();
  }, 55);
}

/**
 * Invoked when skill allocations change (debounced in tree). Extensible for skill-driven stat deltas.
 */
export function onPlannerSkillAllocationChanged() {
  runPlannerSkillStatRecompute();
}

/**
 * Planner level for life/mana scaling and header "Level N".
 * When {@link getPlannerAutoLevelFromSpentSkillPoints} is true (default): max of stored level and
 * minimum level required by the current allocation once any skill points are spent.
 * When false: uses stored level only (manual control via planner options).
 */
export function getEffectivePlannerLevel() {
  if (!characterInstance) return Character.DEFAULT_LEVEL;
  const stored = Character.clampLevel(characterInstance.level);
  const autoLevelFromSpent = getPlannerAutoLevelFromSpentSkillPoints();
  if (!autoLevelFromSpent) {
    return stored;
  }
  const spent = characterInstance.getSpentSkillPoints();
  if (spent <= 0) {
    return stored;
  }
  const minForBuild = characterInstance.getMinimumRequiredLevel(getPlannerSkillsSnapshot());
  return Math.max(stored, minForBuild);
}

/**
 * Set planner core stats from game_meta classes: attributes from base_*; life/mana from scaling.
 * @param {string} className
 */
export function applyClassBaselineStatsToCharacter(className) {
  if (!characterInstance || !className) return;
  const row = getClassPlannerStatDefaults(className);
  if (!row) return;
  const level = getEffectivePlannerLevel();
  const next = { ...characterInstance.getAllRawStats() };
  next.strength = normalizePlannerStatValue('strength', row.strength);
  next.dexterity = normalizePlannerStatValue('dexterity', row.dexterity);
  next.energy = normalizePlannerStatValue('energy', row.energy);
  next.vitality = normalizePlannerStatValue('vitality', row.vitality);
  const { life, mana } = computeClassDerivedLifeMana(level, next.vitality, next.energy, row);
  const lifeBonus = characterInstance.getTotalQuestLifeBonus();
  next.life = normalizePlannerStatValue('life', life + lifeBonus);
  next.mana = normalizePlannerStatValue('mana', mana);
  characterInstance.setAllStats(next);
}

/**
 * Recompute life/mana from class scaling only (keeps str/dex/ene/vit and other stats as-is).
 */
export function recomputeClassDerivedLifeMana() {
  if (!characterInstance) return;
  const className = characterInstance.className;
  if (!className) return;
  const row = getClassPlannerStatDefaults(className);
  if (!row) return;
  const level = getEffectivePlannerLevel();
  const vit = characterInstance.getRawStat('vitality');
  const ene = characterInstance.getRawStat('energy');
  const { life, mana } = computeClassDerivedLifeMana(level, vit, ene, row);
  const lifeBonus = characterInstance.getTotalQuestLifeBonus();
  characterInstance.setRawStat('life', normalizePlannerStatValue('life', life + lifeBonus));
  characterInstance.setRawStat('mana', normalizePlannerStatValue('mana', mana));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStatsPanelRefresh'));
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { derivedLifeMana: true } }));
  }
}

/**
 * Get the current character instance
 * @returns {Character|null} Character instance
 */
export function getCharacterInstance() {
  return characterInstance;
}

/**
 * @param {string} internalId Internal skill id (skills.json `id`)
 */
export function isSkillDisabled(internalId) {
  return characterInstance ? characterInstance.isSkillDisabled(internalId) : false;
}

/**
 * @param {string} slotId oSkill row id from Character.oSkills[].slotId
 */
export function isOSkillSlotDisabled(slotId) {
  return characterInstance ? characterInstance.isOSkillSlotDisabled(slotId) : false;
}

/**
 * Toggle planner stat contribution for a skill (does not change allocated points).
 * @param {string} internalId
 * @param {boolean} disabled
 */
export function setSkillDisabled(internalId, disabled) {
  if (!characterInstance) return;
  characterInstance.setSkillDisabled(internalId, disabled);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('skillPointsChanged', {
        detail: {
          skillName: internalId != null ? String(internalId) : null,
          action: 'toggleDisabled'
        }
      })
    );
  }
  runPlannerSkillStatRecompute({ immediate: true });
}

/**
 * Toggle planner stat contribution for one oSkill row (tree disable is separate).
 * @param {string} slotId
 * @param {boolean} disabled
 */
export function setOSkillSlotDisabled(slotId, disabled) {
  if (!characterInstance) return;
  characterInstance.setOSkillSlotDisabled(slotId, disabled);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('skillPointsChanged', {
        detail: {
          skillName: slotId != null ? String(slotId) : null,
          action: 'toggleDisabledOSkill'
        }
      })
    );
  }
  runPlannerSkillStatRecompute({ immediate: true });
}

/** @returns {string[]} */
export function getDisabledSkillIds() {
  return characterInstance ? characterInstance.getDisabledSkillIds() : [];
}

/** @returns {string[]} */
export function getDisabledOSkillSlotIds() {
  return characterInstance ? characterInstance.getDisabledOSkillSlotIds() : [];
}

/** @param {unknown} list */
export function setDisabledSkillIds(list) {
  if (!characterInstance) return;
  characterInstance.setDisabledSkillIds(list);
}

/** @param {unknown} list */
export function setDisabledOSkillSlotIds(list) {
  if (!characterInstance) return;
  characterInstance.setDisabledOSkillSlotIds(list);
}

/**
 * oSkill rows for planner UI (array preserves slot ids; getAllOSkills() is a flattened map).
 * @returns {Array<object>}
 */
export function getOSkillRowsForPlanner() {
  if (!characterInstance) return [];
  return characterInstance.oSkills.filter((r) => Character.clampOSkillPoints(r?.points ?? 0) > 0);
}

/**
 * Serialize oSkills for build JSON: display name -> level (stable key order).
 * @returns {Record<string, number>}
 */
export function getOSkillsForBuildExport() {
  if (!characterInstance) return {};
  const store = getFileSkillStore();
  /** @type {Record<string, number>} */
  const out = {};
  for (const row of characterInstance.oSkills || []) {
    const level = Character.clampOSkillPoints(row?.points ?? 0);
    if (level <= 0) continue;
    let cat = null;
    if (row.skillId != null && Number.isFinite(Number(row.skillId))) {
      cat = store?.catalog?.find((c) => c.numericId === Number(row.skillId)) ?? null;
    }
    if (!cat && row.skillName) cat = store?.catalog?.find((c) => c.id === row.skillName) ?? null;
    const key =
      cat && cat.displayName != null && String(cat.displayName).trim() !== ''
        ? String(cat.displayName)
        : row.displayName && String(row.displayName).trim() !== ''
          ? String(row.displayName)
          : row.skillName || `Skill ${row.skillId ?? ''}`;
    out[key] = (out[key] || 0) + level;
  }
  return sortStringKeyedObject(out);
}

/**
 * Set character level
 * @param {number} level - New character level
 */
export function setCharacterLevel(level) {
  if (!characterInstance) {
    console.warn('setCharacterLevel: Character instance not initialized');
    return false;
  }
  const ok = characterInstance.setCharacterLevel(level);
  if (ok) notifyPlannerStateChanged({ source: 'setCharacterLevel' });
  return ok;
}

/**
 * Get current character level
 * @returns {number} Character level
 */
export function getCharacterLevel() {
  return characterInstance ? characterInstance.level : Character.DEFAULT_LEVEL;
}

/**
 * Get skill points for a skill
 * @param {string} skillName - Skill name
 * @returns {number} Points allocated
 */
export function getSkillPoints(skillName) {
  return characterInstance ? characterInstance.getSkillPoints(skillName) : 0;
}

/**
 * Get all skill points (regular skills only, excludes oSkills)
 * @returns {object} Map of skill_name -> points
 */
export function getAllSkillPoints() {
  return characterInstance ? characterInstance.getAllSkillPoints() : {};
}

/**
 * Get all regular skill points explicitly (excludes oSkills)
 * This ensures oSkills never affect regular skill calculations
 * @returns {object} Map of skill_name -> points (regular skills only)
 */
export function getRegularSkillPoints() {
  // getAllSkillPoints already excludes oSkills since they're stored separately
  // But this function makes the intent explicit
  return getAllSkillPoints();
}

/**
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, number>}
 */
function sortStringKeyedObject(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
    out[k] = obj[k];
  }
  return out;
}

/**
 * Resolve a skill reference from saved builds (numericId string, internal id, or display name).
 * @param {string|number} key
 * @param {ReturnType<typeof getFileSkillStore>|null} [store]
 * @returns {object|null}
 */
export function resolveCatalogRowBySkillRef(key, store = null) {
  const st = store ?? getFileSkillStore();
  const catalog = st?.catalog;
  if (!catalog || key == null) return null;
  const s = String(key).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return catalog.find((c) => c.numericId === n) ?? null;
  }
  let row = catalog.find((c) => c.id === s);
  if (row) return row;
  row = catalog.find((c) => String(c.displayName ?? '') === s);
  if (row) return row;
  const lower = s.toLowerCase();
  return catalog.find((c) => String(c.displayName ?? '').toLowerCase() === lower) ?? null;
}

/**
 * Normalize any legacy `skillPoints` map to internal skill ids (runtime keys).
 * Unknown keys are omitted and listed in `skipped`.
 * @param {Record<string, unknown>} map
 * @returns {{ map: Record<string, number>, skipped: Array<{ key: string, wantedLevel: number }> }}
 */
export function normalizeBuildSkillPointsForImport(map) {
  /** @type {Record<string, number>} */
  const out = {};
  /** @type {Array<{ key: string, wantedLevel: number }>} */
  const skipped = [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return { map: out, skipped };
  const store = getFileSkillStore();
  for (const [k, raw] of Object.entries(map)) {
    const points = Math.floor(Number(raw));
    if (!Number.isFinite(points) || points <= 0) continue;
    const cat = resolveCatalogRowBySkillRef(k, store);
    if (cat) out[cat.id] = points;
    else skipped.push({ key: String(k), wantedLevel: points });
  }
  return { map: out, skipped };
}

/**
 * @param {object} row
 * @returns {string}
 */
function oskillRowSkipLabel(row) {
  if (!row || typeof row !== 'object') return 'oSkill row';
  if (row.displayName != null && String(row.displayName).trim() !== '') return String(row.displayName).trim();
  if (row.skillName != null && String(row.skillName).trim() !== '') return String(row.skillName).trim();
  if (row.skillId != null && Number.isFinite(Number(row.skillId))) return `id:${row.skillId}`;
  return 'oSkill row';
}

/**
 * @param {object} row
 * @returns {object | null}
 */
function normalizeSingleOSkillImportRow(row) {
  const points = Character.clampOSkillPoints(row?.level ?? row?.points ?? 0);
  if (points <= 0) return null;
  const store = getFileSkillStore();
  let cat = null;
  if (row.skillId != null && Number.isFinite(Number(row.skillId))) {
    cat = resolveCatalogRowBySkillRef(String(row.skillId), store);
  }
  if (!cat && row.skillName) cat = resolveCatalogRowBySkillRef(row.skillName, store);
  if (!cat && row.displayName) cat = resolveCatalogRowBySkillRef(row.displayName, store);
  const sid = row.slotId != null && String(row.slotId).trim() !== '' ? String(row.slotId).trim() : Character.newOSkillSlotId();
  if (!cat) return null;
  return {
    skillId: cat.numericId,
    skillName: cat.id,
    points,
    slotId: sid,
    displayName: cat.displayName,
    image: cat.image,
    className: cat.class,
    hasDetails: true
  };
}

/**
 * Normalize legacy oSkills (array rows or string-key map) for Character.setAllOSkills.
 * Unknown keys or rows are omitted and listed in `skipped`.
 * @param {unknown} input
 * @returns {{payload: object | Array<object>, skipped: Array<{key: string, wantedLevel: number}>}}
 */
export function normalizeBuildOSkillsForImport(input) {
  /** @type {Array<{ key: string, wantedLevel: number }>} */
  const skipped = [];
  if (input == null) return { payload: [], skipped };
  if (Array.isArray(input)) {
    /** @type {Array<object>} */
    const out = [];
    for (const row of input) {
      const points = Character.clampOSkillPoints(row?.level ?? row?.points ?? 0);
      if (points <= 0) continue;
      const r = normalizeSingleOSkillImportRow(row);
      if (!r) skipped.push({ key: oskillRowSkipLabel(row), wantedLevel: points });
      else out.push(r);
    }
    return { payload: out, skipped };
  }
  if (typeof input === 'object') {
    const store = getFileSkillStore();
    /** @type {Record<string, number>} */
    const internalMap = {};
    for (const [k, raw] of Object.entries(input)) {
      const pts = Character.clampOSkillPoints(raw);
      if (pts <= 0) continue;
      const cat = resolveCatalogRowBySkillRef(k, store);
      if (cat) internalMap[cat.id] = (internalMap[cat.id] || 0) + pts;
      else skipped.push({ key: String(k), wantedLevel: pts });
    }
    return { payload: internalMap, skipped };
  }
  return { payload: [], skipped };
}

/**
 * Get all skill points for build JSON (display names as keys; stable key order).
 * @returns {Record<string, number>}
 */
export function getAllSkillPointsById() {
  if (!characterInstance) return {};

  const skillPoints = characterInstance.getAllSkillPoints();
  /** @type {Record<string, number>} */
  const out = {};

  const store = getFileSkillStore();
  for (const [internalId, points] of Object.entries(skillPoints)) {
    if (points <= 0) continue;
    const cat = store?.catalog?.find((c) => c.id === internalId);
    const key =
      cat && cat.displayName != null && String(cat.displayName).trim() !== ''
        ? String(cat.displayName)
        : internalId;
    out[key] = points;
  }
  return sortStringKeyedObject(out);
}

/**
 * Set all skill points (used for loading builds)
 * @param {object} skillPoints - Map of skill_name -> points
 */
export function setAllSkillPoints(skillPoints) {
  if (characterInstance) {
    characterInstance.setAllSkillPoints(skillPoints);
    notifyPlannerStateChanged({ source: 'setAllSkillPoints' });
  }
}

/**
 * Set all skill points from a saved build map (numericId, internal id, or display name keys).
 * @param {object} skillPointsById - Legacy name; values normalized to internal ids before storage.
 */
export function setAllSkillPointsById(skillPointsById) {
  if (!characterInstance) return;
  const { map } = normalizeBuildSkillPointsForImport(skillPointsById);
  characterInstance.setAllSkillPoints(map);
  notifyPlannerStateChanged({ source: 'setAllSkillPointsById' });
}

/**
 * Total quest skill points from Quests tab completion (no level gate).
 * @param {number} [characterLevel] - ignored; kept for compatibility
 * @returns {number} Total quest skill points
 */
export function getTotalQuestSkillPoints(characterLevel = Character.MAX_LEVEL) {
  return characterInstance ? characterInstance.getTotalQuestSkillPoints(characterLevel) : 0;
}

/**
 * Total available skill points at the given character level (base + quest tab rewards).
 * When `characterLevel` is omitted, uses {@link getEffectivePlannerLevel}.
 * @param {number} [characterLevel]
 * @returns {number}
 */
export function getAvailableSkillPoints(characterLevel) {
  if (!characterInstance) return 0;
  const ul =
    characterLevel != null && Number.isFinite(Number(characterLevel))
      ? Character.clampLevel(Number(characterLevel))
      : getEffectivePlannerLevel();
  const basePoints = Character.getBaseSkillPoints(ul);
  const questPoints = characterInstance.getTotalQuestSkillPoints(ul);
  return basePoints + questPoints;
}

/**
 * Calculate total spent skill points
 * @returns {number} Total points spent
 */
export function getSpentSkillPoints() {
  return characterInstance ? characterInstance.getSpentSkillPoints() : 0;
}

/**
 * Spent tree skill points exceed the pool shown in the planner header (same rule as PlannerSkillPointsBadge).
 * @returns {boolean}
 */
export function isPlannerSkillPointPoolOverBudget() {
  if (!characterInstance) return false;
  const spent = characterInstance.getSpentSkillPoints();
  const ul = getEffectivePlannerLevel();
  const base = Character.getBaseSkillPoints(ul);
  const quest = characterInstance.getTotalQuestSkillPoints(ul);
  return spent > base + quest;
}

/**
 * Calculate remaining skill points
 * @returns {number} Points remaining to spend
 */
export function getRemainingSkillPoints() {
  if (!characterInstance) return 0;
  const ul = getEffectivePlannerLevel();
  const basePoints = Character.getBaseSkillPoints(ul);
  const questPoints = characterInstance.getTotalQuestSkillPoints(ul);
  const spent = characterInstance.getSpentSkillPoints();
  return basePoints + questPoints - spent;
}

/**
 * Calculate minimum character level required for current skill allocation
 * Takes into account spent skill points, quest rewards, and skill prerequisites
 * @param {Array|null} [allSkills] - when non-empty, used for character_level prerequisites instead of planner snapshot
 * @returns {number} Minimum character level needed
 */
export function getMinimumRequiredLevel(allSkills = null) {
  if (!characterInstance) return Character.MIN_LEVEL;
  const skills =
    Array.isArray(allSkills) && allSkills.length > 0 ? allSkills : getPlannerSkillsSnapshot();
  return characterInstance.getMinimumRequiredLevel(skills);
}

/**
 * Raise planner character level so the build meets minimum level (skill point pool + prereqs).
 * @param {Array|null} allSkills
 */
function bumpCharacterLevelToMinimumRequired(allSkills = null) {
  if (!characterInstance) return;
  if (!getPlannerAutoLevelFromSpentSkillPoints()) return;
  const needed = getMinimumRequiredLevel(allSkills);
  if (characterInstance.level < needed) {
    setCharacterLevel(needed);
  }
}

/**
 * When auto-level mode is on, raise stored level to the minimum required by the current build.
 */
export function syncPlannerCharacterLevelIfAuto(allSkills = null) {
  bumpCharacterLevelToMinimumRequired(allSkills);
}

/**
 * Check if prerequisites are met for a skill
 * @param {object} skill - Skill object with prerequisites array
 * @param {Array} allSkills - Optional array of all skills for tree points validation
 * @returns {object} { met: boolean, reasons: string[] }
 */
export function checkPrerequisites(skill, allSkills = []) {
  if (!skill.prerequisites || skill.prerequisites.length === 0) {
    return { met: true, reasons: [] };
  }

  // Collect reasons with their types for sorting
  const reasonsWithTypes = [];
  const useOrLogic = OR_PREREQUISITE_SKILLS.includes(skill.name);
  
  // Separate skill_level prerequisites from others
  const skillLevelPrereqs = [];
  const otherPrereqs = [];
  
  for (const prereq of skill.prerequisites) {
    const [type] = prereq.split(':');
    if (type === 'skill_level') {
      skillLevelPrereqs.push(prereq);
    } else {
      otherPrereqs.push(prereq);
    }
  }
  
  // Check non-skill_level prerequisites (always use AND logic)
  for (const prereq of otherPrereqs) {
    const [type, value, target] = prereq.split(':');
    
    // Skip character level checks - users can freely allocate points
    // Character level only affects max level calculations, not allocation
    if (type === 'character_level') {
      continue; // Skip level requirement checks
    } else if (type === 'skill_blocked_by') {
      // Blocked if target skill has more than specified points (typically 0)
      const maxAllowedPoints = parseInt(value, 10);
      const targetSkillName = normalizePrereqSkillTargetKey(target);
      const currentPoints = getSkillPoints(targetSkillName);
      
      if (currentPoints > maxAllowedPoints) {
        const targetLabel = displayNameForPrereqSkillTarget(target, allSkills);
        reasonsWithTypes.push({
          type: 'skill_blocked_by',
          message: `You cannot learn this skill if you have points in ${targetLabel}.`
        });
      }
    } else if (type === 'tree_points') {
      // Tree points check - requires counting points spent in a specific tab
      const requiredPoints = parseInt(value, 10);
      const targetTabName = target; // e.g., "Warmonger"
      
      const pointsInTab = countPointsInTab(targetTabName, allSkills);
      
      if (pointsInTab < requiredPoints) {
        reasonsWithTypes.push({
          type: 'tree_points',
          message: `Requires ${requiredPoints} point${requiredPoints > 1 ? 's' : ''} in ${targetTabName} tree`
        });
      }
    }
  }
  
  // Check skill_level prerequisites
  if (skillLevelPrereqs.length > 0) {
    if (useOrLogic) {
      // OR logic: At least ONE prerequisite must be met
      let anyMet = false;
      const orReasons = [];
      
      for (const prereq of skillLevelPrereqs) {
        const [, value, target] = prereq.split(':');
        const requiredPoints = parseInt(value, 10);
        const targetSkillName = normalizePrereqSkillTargetKey(target);
        const currentPoints = getSkillPoints(targetSkillName);
        const targetLabel = displayNameForPrereqSkillTarget(target, allSkills);
        
        if (currentPoints >= requiredPoints) {
          anyMet = true;
          break;
        } else {
          if (requiredPoints === 1) {
            orReasons.push(`${targetLabel}`);
          } else {
            orReasons.push(`${requiredPoints} points in ${targetLabel}`);
          }
        }
      }
      
      if (!anyMet) {
        reasonsWithTypes.push({
          type: 'skill_level',
          message: `Requires one of: ${orReasons.join(' OR ')}`
        });
      }
    } else {
      // AND logic: ALL prerequisites must be met (default)
      for (const prereq of skillLevelPrereqs) {
        const [, value, target] = prereq.split(':');
        const requiredPoints = parseInt(value, 10);
        const targetSkillName = normalizePrereqSkillTargetKey(target);
        const currentPoints = getSkillPoints(targetSkillName);
        const targetLabel = displayNameForPrereqSkillTarget(target, allSkills);
        
        if (currentPoints < requiredPoints) {
          const message = requiredPoints === 1 
            ? `Requires ${targetLabel}` 
            : `Requires ${requiredPoints} points in ${targetLabel}`;
          
          reasonsWithTypes.push({
            type: 'skill_level',
            message: message
          });
        }
      }
    }
  }
  
  // Sort reasons by prerequisite order
  reasonsWithTypes.sort((a, b) => {
    const orderA = PREREQUISITE_ORDER[a.type] || 999;
    const orderB = PREREQUISITE_ORDER[b.type] || 999;
    return orderA - orderB;
  });
  
  // Extract just the messages
  const reasons = reasonsWithTypes.map(r => r.message);
  
  return { met: reasons.length === 0, reasons };
}

/**
 * Count total points spent in a specific tab/tree
 * @param {string} tabName - Name of the tab (e.g., "Warmonger")
 * @param {Array} allSkills - Array of all skills
 * @returns {number} Total points spent in the tab
 */
function countPointsInTab(tabName, allSkills) {
  let totalPoints = 0;
  
  if (!characterInstance) return totalPoints;
  
  // Iterate through all allocated skill points
  for (const [skillName, points] of Object.entries(characterInstance.skillPoints)) {
    // Find the skill in allSkills to get its tab
    const skill = allSkills.find(s => s.id === skillName);
    
    if (skill && skill.tabName === tabName) {
      totalPoints += points;
    }
  }
  
  return totalPoints;
}

/**
 * When auto-level mode is on and the skill point pool is empty, probe +1 on skillName
 * and raise stored level if the build requires it.
 * @param {string} skillName
 * @param {Array} allSkills
 * @returns {number} Remaining skill points after a possible level bump
 */
function ensureRemainingSkillPointsForAutoLevel(skillName, allSkills) {
  let remaining = getRemainingSkillPoints();
  if (remaining > 0 || !getPlannerAutoLevelFromSpentSkillPoints() || !characterInstance) {
    return remaining;
  }

  const prevPoints = getSkillPoints(skillName);
  characterInstance.skillPoints[skillName] = prevPoints + 1;
  characterInstance.maxLevels = {};
  const neededAfterSpend = getMinimumRequiredLevel(allSkills);
  if (prevPoints <= 0) {
    delete characterInstance.skillPoints[skillName];
  } else {
    characterInstance.skillPoints[skillName] = prevPoints;
  }
  characterInstance.maxLevels = {};
  if (characterInstance.level < neededAfterSpend) {
    setCharacterLevel(neededAfterSpend);
  }
  return getRemainingSkillPoints();
}

/**
 * Add a point to a skill
 * @param {string} skillName - Skill name
 * @param {object} skill - Skill object with prerequisites
 * @param {number} maxLevel - Maximum level for this skill
 * @param {Array} allSkills - Array of all skills for prerequisite validation
 * @returns {object} { success: boolean, reason: string }
 */
export function addSkillPoint(skillName, skill, maxLevel, allSkills = [], skipEvent = false) {
  const currentPoints = getSkillPoints(skillName);
  
  // Check if at max level BEFORE adding the point
  // Note: For self-scaling skills, the caller should recalculate maxLevel in the loop
  if (currentPoints >= maxLevel) {
    return { success: false, reason: 'Skill is at maximum level' };
  }
  
  // Check if we have skill points available
  const remainingPoints = ensureRemainingSkillPointsForAutoLevel(skillName, allSkills);
  if (remainingPoints <= 0) {
    return { success: false, reason: 'No skill points remaining' };
  }
  
  // Check prerequisites (only for first point)
  if (currentPoints === 0) {
    const prereqCheck = checkPrerequisites(skill, allSkills);
    if (!prereqCheck.met) {
      return { success: false, reason: prereqCheck.reasons.join(', ') };
    }
    
    // Check Ultimate skill restriction (only when adding first point)
    const ultimateCheck = checkUltimateRestriction(skill, allSkills);
    if (!ultimateCheck.allowed) {
      return { success: false, reason: ultimateCheck.reason };
    }
    
    // Check Mastery skill restriction (only when adding first point)
    const masteryCheck = checkMasteryRestriction(skill, allSkills);
    if (!masteryCheck.allowed) {
      return { success: false, reason: masteryCheck.reason };
    }
    
    // Check Coven skill restriction (only when adding first point, Sorceress only)
    const covenCheck = checkCovenRestriction(skill, allSkills);
    if (!covenCheck.allowed) {
      return { success: false, reason: covenCheck.reason };
    }
    
    // Check Proficiency skill restriction (only when adding first point, Barbarian only)
    const proficiencyCheck = checkProficiencyRestriction(skill, allSkills);
    if (!proficiencyCheck.allowed) {
      return { success: false, reason: proficiencyCheck.reason };
    }
    
    // Check Devotion restriction (only when adding first point, Paladin and Amazon)
    if (characterInstance) {
      const devotionCheck = checkDevotionRestriction(skill.skillId, characterInstance.skillPoints);
      if (!devotionCheck.canAllocate) {
        return { success: false, reason: devotionCheck.reason };
      }
    }
  }
  
  // Add the point
  if (characterInstance) {
    characterInstance.skillPoints[skillName] = currentPoints + 1;
    characterInstance.maxLevels = {}; // Clear cache as max levels may change

    bumpCharacterLevelToMinimumRequired(allSkills);

    // Auto-add required stats to input field
    autoAddStatsToInput(skill.skillId);

    // Dispatch event for UI updates (unless skipped for batch operations)
    if (!skipEvent) {
      window.dispatchEvent(new CustomEvent('skillPointsChanged', {
        detail: { skillName, action: 'add' }
      }));
    }
  }

  return { success: true, reason: '' };
}

/**
 * Add multiple skill points at once (for batch operations like shift-click)
 * @param {string} skillName - Skill name
 * @param {object} skill - Skill object
 * @param {number} amount - Number of points to add
 * @param {Array} allSkills - Array of all skills
 * @param {Function} getMaxLevelFn - Function to get current max level (may change during batch)
 * @returns {object} { success: boolean, pointsAdded: number, reason: string }
 */
export function addSkillPointsBatch(skillName, skill, amount, allSkills = [], getMaxLevelFn = null) {
  if (!characterInstance) {
    return { success: false, pointsAdded: 0, reason: 'Character not initialized' };
  }
  
  let pointsAdded = 0;

  for (let i = 0; i < amount; i++) {
    const currentPoints = getSkillPoints(skillName);
    
    // Get current max level (may change for self-scaling skills)
    const maxLevel = getMaxLevelFn ? getMaxLevelFn() : (skill.baseMaxLevel || 150);
    
    // Check if at max level
    if (currentPoints >= maxLevel) {
      break; // Can't add more points
    }
    
    // Check if we have skill points available (auto-level may raise level first)
    const remainingPoints = ensureRemainingSkillPointsForAutoLevel(skillName, allSkills);
    if (remainingPoints <= 0) {
      break; // No more skill points available
    }
    
    // Check prerequisites and restrictions (only for first point)
    if (currentPoints === 0) {
      const prereqCheck = checkPrerequisites(skill, allSkills);
      if (!prereqCheck.met) {
        return { success: pointsAdded > 0, pointsAdded, reason: prereqCheck.reasons.join(', ') };
      }
      
      const ultimateCheck = checkUltimateRestriction(skill, allSkills);
      if (!ultimateCheck.allowed) {
        return { success: pointsAdded > 0, pointsAdded, reason: ultimateCheck.reason };
      }
      
      const masteryCheck = checkMasteryRestriction(skill, allSkills);
      if (!masteryCheck.allowed) {
        return { success: pointsAdded > 0, pointsAdded, reason: masteryCheck.reason };
      }
      
      const covenCheck = checkCovenRestriction(skill, allSkills);
      if (!covenCheck.allowed) {
        return { success: pointsAdded > 0, pointsAdded, reason: covenCheck.reason };
      }
      
      const proficiencyCheck = checkProficiencyRestriction(skill, allSkills);
      if (!proficiencyCheck.allowed) {
        return { success: pointsAdded > 0, pointsAdded, reason: proficiencyCheck.reason };
      }
      
      const devotionCheck = checkDevotionRestriction(skill.skillId, characterInstance.skillPoints);
      if (!devotionCheck.canAllocate) {
        return { success: pointsAdded > 0, pointsAdded, reason: devotionCheck.reason };
      }
    }
    
    // Add the point (skip event dispatch during batch)
    characterInstance.skillPoints[skillName] = currentPoints + 1;
    characterInstance.maxLevels = {}; // Clear cache as max levels may change
    
    // Auto-add required stats to input field (only need to do this once)
    if (pointsAdded === 0) {
      autoAddStatsToInput(skill.skillId);
    }
    
    pointsAdded++;
  }

  if (pointsAdded > 0) {
    bumpCharacterLevelToMinimumRequired(allSkills);
  }

  // Dispatch single event after all points are added
  if (pointsAdded > 0) {
    window.dispatchEvent(new CustomEvent('skillPointsChanged', {
      detail: { skillName, action: 'add', amount: pointsAdded }
    }));
  }

  return { success: pointsAdded > 0, pointsAdded, reason: pointsAdded === 0 ? 'No points could be added' : '' };
}

/**
 * Check if removing a point from a skill would cause other skills to exceed their max level
 * This prevents removing points from skills like Specialization when it would break other skills
 * @param {string} skillName - Skill name being removed
 * @param {Array} allSkills - Array of all skills
 * @returns {object} { allowed: boolean, reason: string }
 */
function checkMaxLevelDependencies(skillName, allSkills = []) {
  // Skills that affect max levels: specialization, noxious_mastery, elemental_command
  const maxLevelAffectingSkills = ['specialization', 'noxious_mastery', 'elemental_command'];
  
  if (!maxLevelAffectingSkills.includes(skillName)) {
    return { allowed: true, reason: '' };
  }
  
  if (!characterInstance) return { allowed: true, reason: '' };
  
  // Simulate removing the point
  const simulatedSkillPoints = { ...characterInstance.skillPoints };
  const currentPoints = simulatedSkillPoints[skillName] || 0;
  if (currentPoints > 1) {
    simulatedSkillPoints[skillName] = currentPoints - 1;
  } else {
    delete simulatedSkillPoints[skillName];
  }
  
  // Check all skills that have points allocated
  for (const [allocatedSkillName, allocatedPoints] of Object.entries(characterInstance.skillPoints)) {
    if (allocatedPoints === 0) continue;
    
    // Find the skill object
    const skill = allSkills.find(s => s.id === allocatedSkillName);
    if (!skill) continue;
    
    // Calculate what the new max level would be with the simulated removal
    const newMaxLevel = calculateMaxLevel(skill.skillId, simulatedSkillPoints, characterInstance.level);
    
    // Check if current points would exceed new max
    if (allocatedPoints > newMaxLevel) {
      // Find the skill display name for better error message
      const skillDisplayName = skill.name || allocatedSkillName;
      return {
        allowed: false,
        reason: `Cannot remove: ${skillDisplayName} has ${allocatedPoints} point${allocatedPoints > 1 ? 's' : ''} but would have max of ${newMaxLevel}`
      };
    }
  }
  
  return { allowed: true, reason: '' };
}

/**
 * Remove a point from a skill
 * @param {string} skillName - Skill name
 * @param {Array} allSkills - Array of all skills to check dependencies
 * @returns {object} { success: boolean, reason: string }
 */
export function removeSkillPoint(skillName, allSkills = [], skipEvent = false) {
  const currentPoints = getSkillPoints(skillName);
  
  if (currentPoints === 0) {
    return { success: false, reason: 'No points to remove' };
  }
  
  // Check if removing this point would break any dependent skills
  const blockingInfo = getMinimumRequiredPointsWithBlockingSkills(skillName, allSkills);
  
  if (currentPoints - 1 < blockingInfo.minRequired) {
    const skillNames = blockingInfo.blockingSkills.join(', ');
    return { 
      success: false, 
      reason: `Cannot remove: ${skillNames} require${blockingInfo.blockingSkills.length > 1 ? '' : 's'} at least ${blockingInfo.minRequired} point${blockingInfo.minRequired > 1 ? 's' : ''} in this skill` 
    };
  }
  
  // Check if this skill affects max levels of other skills
  const maxLevelCheck = checkMaxLevelDependencies(skillName, allSkills);
  if (!maxLevelCheck.allowed) {
    return { success: false, reason: maxLevelCheck.reason };
  }
  
  // Remove the point
  if (characterInstance) {
    characterInstance.skillPoints[skillName] = currentPoints - 1;
    if (characterInstance.skillPoints[skillName] === 0) {
      delete characterInstance.skillPoints[skillName];
    }

    characterInstance.pruneDisabledSkillsWithoutAllocatedPoints();
    
    characterInstance.maxLevels = {}; // Clear cache as max levels may change
    
    // Dispatch event for UI updates (unless skipped for batch operations)
    if (!skipEvent) {
      window.dispatchEvent(new CustomEvent('skillPointsChanged', { 
        detail: { skillName, action: 'remove' } 
      }));
    }
  }
  
  return { success: true, reason: '' };
}

/**
 * Remove multiple skill points at once (for batch operations like shift-click)
 * @param {string} skillName - Skill name
 * @param {number} amount - Number of points to remove
 * @param {Array} allSkills - Array of all skills
 * @returns {object} { success: boolean, pointsRemoved: number, reason: string }
 */
export function removeSkillPointsBatch(skillName, amount, allSkills = []) {
  if (!characterInstance) {
    return { success: false, pointsRemoved: 0, reason: 'Character not initialized' };
  }
  
  let pointsRemoved = 0;
  
  for (let i = 0; i < amount; i++) {
    const currentPoints = getSkillPoints(skillName);
    
    if (currentPoints === 0) {
      break; // No more points to remove
    }
    
    // Check if removing this point would break any dependent skills
    const blockingInfo = getMinimumRequiredPointsWithBlockingSkills(skillName, allSkills);
    
    if (currentPoints - 1 < blockingInfo.minRequired) {
      if (pointsRemoved === 0) {
        const skillNames = blockingInfo.blockingSkills.join(', ');
        return { 
          success: false, 
          pointsRemoved: 0,
          reason: `Cannot remove: ${skillNames} require${blockingInfo.blockingSkills.length > 1 ? '' : 's'} at least ${blockingInfo.minRequired} point${blockingInfo.minRequired > 1 ? 's' : ''} in this skill` 
        };
      }
      break; // Some points were removed successfully
    }
    
    // Check if this skill affects max levels of other skills (only check on first removal)
    if (pointsRemoved === 0) {
      const maxLevelCheck = checkMaxLevelDependencies(skillName, allSkills);
      if (!maxLevelCheck.allowed) {
        return { success: false, pointsRemoved: 0, reason: maxLevelCheck.reason };
      }
    }
    
    // Remove the point (skip event dispatch during batch)
    characterInstance.skillPoints[skillName] = currentPoints - 1;
    if (characterInstance.skillPoints[skillName] === 0) {
      delete characterInstance.skillPoints[skillName];
    }
    
    characterInstance.maxLevels = {}; // Clear cache as max levels may change
    
    pointsRemoved++;
  }

  if (pointsRemoved > 0) {
    characterInstance.pruneDisabledSkillsWithoutAllocatedPoints();
  }
  
  // Dispatch single event after all points are removed
  if (pointsRemoved > 0) {
    window.dispatchEvent(new CustomEvent('skillPointsChanged', { 
      detail: { skillName, action: 'remove', amount: pointsRemoved } 
    }));
  }
  
  return { success: pointsRemoved > 0, pointsRemoved, reason: pointsRemoved === 0 ? 'No points could be removed' : '' };
}

/**
 * Check for skills that exceed their maximum level
 * @param {Array} allSkills - Array of all skills to check
 * @returns {Array} Array of skills that exceed their max level
 */
export function checkSkillsExceedingMaxLevel(allSkills = []) {
  if (!characterInstance) return [];

  const actualCharacterLevel = getMinimumRequiredLevel(allSkills);
  const skillLevels = getAllSkillPoints();
  const exceedingSkills = [];
  
  // Check each skill that has points allocated
  for (const [skillName, currentPoints] of Object.entries(characterInstance.skillPoints)) {
    if (currentPoints === 0) continue;
    
    // Find the skill object
    const skill = allSkills.find(s => s.id === skillName);
    if (!skill) continue;
    
    // Calculate the current maximum level for this skill
    const effectiveMaxLevel = calculateMaxLevel(skill.skillId, skillLevels, actualCharacterLevel);
    
    // If current points exceed the maximum, add to list
    if (currentPoints > effectiveMaxLevel) {
      exceedingSkills.push({
        skillName: skill.name || skillName,
        currentPoints,
        maxLevel: effectiveMaxLevel,
        excess: currentPoints - effectiveMaxLevel
      });
    }
  }
  
  return exceedingSkills;
}

/**
 * Get minimum required points and which skills are blocking removal
 * @param {string} skillName - Skill to check
 * @param {Array} allSkills - All available skills
 * @returns {object} {minRequired: number, blockingSkills: Array}
 */
function getMinimumRequiredPointsWithBlockingSkills(skillName, allSkills) {
  let minRequired = 0;
  const blockingSkills = [];
  
  if (!characterInstance) return { minRequired: 0, blockingSkills: [] };
  
  // Check all skills that have points allocated
  for (const [allocatedSkillName, points] of Object.entries(characterInstance.skillPoints)) {
    if (points === 0) continue;
    
    // Find the skill object
    const skill = allSkills.find(s => s.id === allocatedSkillName);
    if (!skill || !skill.prerequisites) continue;
    
    // Check if this skill depends on the skill we're checking
    for (const prereq of skill.prerequisites) {
      const [type, value, target] = prereq.split(':');
      
      if (type === 'skill_level') {
        const targetSkillName = normalizePrereqSkillTargetKey(target);
        
        if (targetSkillName === skillName) {
          const requiredPoints = parseInt(value, 10);
          if (requiredPoints > minRequired) {
            minRequired = requiredPoints;
            // Clear previous blocking skills since we found a higher requirement
            blockingSkills.length = 0;
          }
          if (requiredPoints === minRequired) {
            blockingSkills.push(skill.name || allocatedSkillName);
          }
        }
      }
    }
  }
  
  return { minRequired, blockingSkills };
}

/**
 * Reset all skill points
 */
export function resetAllSkillPoints() {
  if (characterInstance) {
    characterInstance.resetAllSkillPoints();
    notifyPlannerStateChanged({ source: 'resetAllSkillPoints' });
  }
}

/**
 * Get total skill points allocated
 * @returns {number} Total points
 */
export function getTotalSkillPoints() {
  return characterInstance ? characterInstance.getTotalSkillPoints() : 0;
}

/**
 * Export character state for saving
 * @returns {object} Character state
 */
export function exportCharacterState() {
  return characterInstance
    ? characterInstance.exportState()
    : {
        level: Character.DEFAULT_LEVEL,
        className: null,
        skillPoints: {},
        stats: {},
        questsCompleted: Character.createDefaultQuestsCompleted(),
        questCompletionOptOut: Character.createDefaultQuestCompletionOptOut(),
        statAllocation: Character.createEmptyStatAllocation(),
        disabledSkillIds: [],
        disabledOSkillSlotIds: []
      };
}

/**
 * Update quest completion status
 * @param {string} questId - Quest identifier
 * @param {object} difficulties - Object with normal, nightmare, hell boolean values
 */
export function updateQuestCompletion(questId, difficulties) {
  if (characterInstance) {
    characterInstance.updateQuestCompletion(questId, difficulties);
    notifyPlannerStateChanged({ source: 'updateQuestCompletion' });
  }
}

/**
 * Get quest completion status
 * @param {string} questId - Quest identifier
 * @returns {object} Object with normal, nightmare, hell boolean values
 */
export function getQuestCompletion(questId) {
  return characterInstance ? characterInstance.getQuestCompletion(questId) : { normal: false, nightmare: false, hell: false };
}

/**
 * @param {number} [characterLevel]
 * @returns {number}
 */
export function getTotalQuestStatPoints(characterLevel = Character.MAX_LEVEL) {
  return characterInstance
    ? characterInstance.getTotalQuestStatPoints(characterLevel)
    : 0;
}

export function getSpentStatPoints() {
  return characterInstance ? characterInstance.getSpentStatPoints() : 0;
}

/**
 * Stat points shown as "allocated": sum over str/dex/vit/ene of (current - class baseline).
 * Falls back to {@link Character#getSpentStatPoints} when no class / no game_meta row.
 * @returns {number}
 */
export function getAllocatedStatPointsFromPanel() {
  if (!characterInstance) return 0;
  const row = getClassPlannerStatDefaults(characterInstance.className);
  const attrs = ['strength', 'dexterity', 'vitality', 'energy'];
  if (!row) {
    return characterInstance.getSpentStatPoints();
  }
  let sum = 0;
  for (const k of attrs) {
    const base = Math.floor(Number(row[k]) || 0);
    const cur = Math.floor(Number(characterInstance.getRawStat(k)) || 0);
    sum += Math.max(0, cur - base);
  }
  return sum;
}

/**
 * @param {number} [characterLevel]
 * @returns {number}
 */
export function getTotalAvailableStatPoints(characterLevel = Character.MAX_LEVEL) {
  return characterInstance
    ? characterInstance.getTotalAvailableStatPoints(characterLevel)
    : 0;
}

/**
 * @param {number} [characterLevel]
 * @returns {number}
 */
export function getRemainingStatPoints(characterLevel = Character.MAX_LEVEL) {
  if (!characterInstance) return 0;
  const total = characterInstance.getTotalAvailableStatPoints(characterLevel);
  const spent = getAllocatedStatPointsFromPanel();
  return Math.max(0, total - spent);
}

export function getStatAllocation() {
  return characterInstance
    ? { ...characterInstance.statAllocation }
    : Character.createEmptyStatAllocation();
}

export function setStatAllocation(allocation) {
  if (characterInstance) {
    characterInstance.setStatAllocation(allocation);
    notifyPlannerStateChanged({ source: 'setStatAllocation' });
  }
}

/**
 * Apply quest completion from a saved build (merges with defaults for unknown keys).
 * @param {Record<string, { normal?: boolean, nightmare?: boolean, hell?: boolean }>} quests
 */
export function importQuestsCompleted(quests, questCompletionOptOut) {
  if (characterInstance) {
    characterInstance.importQuestsCompleted(quests, questCompletionOptOut);
    notifyPlannerStateChanged({ source: 'importQuestsCompleted' });
  }
}

/**
 * Snapshot for build JSON.
 * @returns {Record<string, { normal: boolean, nightmare: boolean, hell: boolean }>}
 */
export function getQuestsCompletedForSave() {
  return characterInstance
    ? JSON.parse(JSON.stringify(characterInstance.questsCompleted))
    : {};
}

/**
 * Per-difficulty "leave unchecked" flags for auto level-based completion (saved with builds).
 * @returns {Record<string, { normal?: boolean, nightmare?: boolean, hell?: boolean }>}
 */
export function getQuestCompletionOptOutForSave() {
  return characterInstance
    ? JSON.parse(JSON.stringify(characterInstance.questCompletionOptOut || {}))
    : {};
}

export function completeAllQuests() {
  if (characterInstance) {
    characterInstance.completeAllQuests();
    notifyPlannerStateChanged({ source: 'completeAllQuests' });
  }
}

/**
 * Import character state from save
 * @param {object} state - Saved character state
 */
export function importCharacterState(state) {
  if (characterInstance) {
    characterInstance.importState(state);
    notifyPlannerStateChanged({ source: 'importCharacterState' });
  }
}

/**
 * oSkills Management
 * oSkills are virtual skills (from items/gear) with 150 level cap
 */

/**
 * Get all oSkills
 * @returns {Array} Array of oSkill objects
 */
export function getAllOSkills() {
  return characterInstance ? characterInstance.getAllOSkills() : [];
}

/**
 * Get points for a specific oSkill
 * @param {string} skillName - Internal skill name
 * @returns {number} Points allocated (0 if not found)
 */
export function getOSkillPoints(skillNameOrId) {
  if (!characterInstance) return 0;
  const direct = characterInstance.getOSkillPoints(skillNameOrId);
  if (direct > 0) return direct;

  const raw = String(skillNameOrId ?? '').trim();
  if (!raw || !/^\d+$/.test(raw)) return direct;

  const store = getFileSkillStore();
  const internal = store?.internalNameByNumericId(Number(raw));
  if (!internal) return direct;
  return characterInstance.getOSkillPoints(internal);
}

/**
 * Add an oSkill or increment if it exists
 * @param {number} skillId - Numeric catalog skill id
 * @param {string} displayName - Display name
 * @param {string} skillName - Internal skill name
 * @param {string} image - Image filename
 * @param {string} className - Class name
 */
export function addOSkill(skillId, displayName, skillName, image, className, hasDetails = false, description = null, skillEffect = null) {
  if (characterInstance) {
    characterInstance.addOSkill(skillId, displayName, skillName, image, className, hasDetails, description, skillEffect);
    autoAddStatsToInput(skillId);
    notifyOSkillPointsChanged(skillName || skillId, 'add');
    notifyPlannerStateChanged({ source: 'addOSkill' });
  } else {
    console.error('[OSkills] No character instance available!');
  }
}

/**
 * Remove an oSkill
 * @param {string} skillName - Internal skill name
 */
export function removeOSkill(skillName) {
  if (characterInstance) {
    characterInstance.removeOSkill(skillName);
    notifyOSkillPointsChanged(skillName, 'remove');
    notifyPlannerStateChanged({ source: 'removeOSkill' });
  }
}

/**
 * Change oSkill points (positive to add, negative to remove)
 * @param {string} skillName - Internal skill name
 * @param {number} amount - Amount to change (can be negative)
 */
export function changeOSkillPoints(skillName, amount) {
  if (characterInstance) {
    characterInstance.changeOSkillPoints(skillName, amount);
    notifyOSkillPointsChanged(skillName, amount > 0 ? 'add' : 'remove');
    notifyPlannerStateChanged({ source: 'changeOSkillPoints' });
  }
}

/**
 * Clear all oSkills
 */
export function clearOSkills() {
  if (characterInstance) {
    characterInstance.clearOSkills();
    notifyOSkillPointsChanged(null, 'clear');
    notifyPlannerStateChanged({ source: 'clearOSkills' });
  }
}

/**
 * Set all oSkills (for loading builds)
 * @param {Array | object} oSkills - Array of oSkill rows, object map (display/internal/numeric keys), or normalized internal map
 */
export function setAllOSkills(oSkills) {
  if (characterInstance) {
    characterInstance.setAllOSkills(oSkills);
    scheduleAutoStatsForAllOSkills();
    notifyOSkillPointsChanged(null, 'set');
    notifyPlannerStateChanged({ source: 'setAllOSkills' });
  }
}

/**
 * Stats Management
 * Character stats that can be referenced in skill calculations
 */

/**
 * Get stat value for a given stat key
 * @param {string} statKey - Stat key (e.g., 'strength', 'dexterity')
 * @returns {number} Stat value, or 0 if not set
 */
export function getStat(statKey) {
  return characterInstance ? characterInstance.getStat(statKey) : 0;
}

/**
 * Set stat value for a given stat key
 * @param {string} statKey - Stat key (e.g., 'strength', 'dexterity')
 * @param {number} value - Stat value
 */
export function setStat(statKey, value) {
  if (characterInstance) {
    characterInstance.setStat(statKey, value);
  }
}

/**
 * Get all stats
 * @returns {object} Map of stat_key -> value
 */
export function getAllStats() {
  return characterInstance ? characterInstance.getAllStats() : {};
}

/**
 * Set all stats (used for loading builds)
 * @param {object} stats - Map of stat_key -> value
 */
export function setAllStats(stats) {
  if (characterInstance) {
    characterInstance.setAllStats(stats);
    runPlannerSkillStatRecompute({ immediate: true });
  }
}

/**
 * Clear all stats
 */
export function clearAllStats() {
  if (characterInstance) {
    characterInstance.clearAllStats();
    runPlannerSkillStatRecompute({ immediate: true });
  }
}

/**
 * Parse and set stats from a text field (one stat per line)
 * Format: {{statKey}}=value or statKey=value
 * @param {string} text - Text containing stat definitions (one per line)
 * @returns {Array} Array of error messages, empty if no errors
 */
export function parseStatsFromText(text) {
  if (!characterInstance) return ['Character not initialized'];
  const errors = characterInstance.parseStatsFromText(text);
  if (errors.length === 0) {
    runPlannerSkillStatRecompute({ immediate: true });
  }
  return errors;
}

/**
 * Export stats to text format (one stat per line)
 * Format: {{statKey}}=value
 * @returns {string} Text representation of stats
 */
export function exportStatsToText() {
  return characterInstance ? characterInstance.exportStatsToText() : '';
}

/**
 * Get all formulas used by a skill for auto-adding stats
 * @param {number} skillId - Numeric catalog skill id
 */
function pushStatKeyAsFormula(formulas, statKey) {
  const sk = String(statKey || '').trim();
  if (!sk) return;
  formulas.push(`{{${sk}}}`);
}

async function getSkillFormulas(skillId) {
  const store = getFileSkillStore();
  if (!store) return [];
  const internal = store.internalNameByNumericId(skillId);
  if (!internal) return [];
  const formulas = [];
  try {
    await store.loadSkillBalance(internal);
    const bal = store.getSkillBalanceSync(internal);
    for (const r of bal?.scaling || []) {
      if (r?.statKey) pushStatKeyAsFormula(formulas, r.statKey);
      for (const k of ['value0', 'value1', 'value2', 'value3']) {
        if (r[k]) formulas.push(String(r[k]));
      }
    }
    for (const r of bal?.scalingConstants || []) {
      if (r?.statKey) pushStatKeyAsFormula(formulas, r.statKey);
      for (const k of ['value0', 'value1', 'value2', 'value3']) {
        if (r[k]) formulas.push(String(r[k]));
      }
    }
    const det = store.getSkillDetail(internal);
    if (det) {
      for (const field of ['description', 'skill_effect', 'restriction']) {
        const t = det[field];
        if (t != null && String(t).trim() !== '') {
          formulas.push(String(t));
        }
      }
      for (let j = 1; j <= 6; j++) {
        const c = det[`calc${j}`];
        if (c != null && String(c).trim() !== '') {
          formulas.push(String(c));
        }
      }
    }
  } catch (error) {
    console.warn('Error getting skill formulas (file):', error);
  }
  return formulas;
}

/**
 * Register planner stats referenced by each allocated oSkill (load/import and balance-only statKey rows).
 */
function scheduleAutoStatsForAllOSkills() {
  if (!characterInstance) return;
  const store = getFileSkillStore();
  const seen = new Set();
  for (const row of characterInstance.oSkills || []) {
    let nid = row.skillId;
    if ((nid == null || !Number.isFinite(Number(nid))) && row.skillName && store?.catalog) {
      const cat = store.catalog.find((c) => c.id === row.skillName);
      nid = cat?.numericId ?? null;
    }
    if (nid == null || !Number.isFinite(Number(nid))) continue;
    const n = Number(nid);
    if (seen.has(n)) continue;
    seen.add(n);
    void autoAddStatsToInput(n);
  }
}

/**
 * Add required stats to Character Stats input field
 * @param {number} skillId - Skill ID to get formulas from
 */
async function autoAddStatsToInput(skillId) {
  // Get all formulas for this skill
  const formulas = await getSkillFormulas(skillId);
  if (formulas.length === 0) return;

  // Extract all stat references from all formulas
  const statRefsSet = new Set();
  for (const formula of formulas) {
    const stats = extractStatReferences(formula);
    stats.forEach(stat => statRefsSet.add(stat));
  }
  
  if (statRefsSet.size === 0) return; // No stat references found

  if (!characterInstance) return;

  const next = { ...characterInstance.getAllRawStats() };
  let added = false;
  for (const statName of statRefsSet) {
    const k = String(statName).toLowerCase();
    if (!isPlannerBaseStatKey(k)) continue;
    if (!Object.prototype.hasOwnProperty.call(next, k)) {
      next[k] = normalizePlannerStatValue(k, 0);
      added = true;
    }
  }
  if (!added) return;

  characterInstance.setAllStats(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStatsPanelRefresh'));
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { autoStats: true } }));
  }
}

/**
 * Filter skill levels to exclude oSkills
 * Ensures oSkill points never affect regular skill calculations
 * @param {object} skillLevels - Object mapping skill_name/ID to points
 * @returns {object} Filtered skill levels with only regular skills
 */
const OSKILL_HARD_CAP = 150;

const SKILL_PROFILES = {
  regular: {
    maxLevel(skillId, skillLevels, characterLevel) {
      return calculateMaxLevel(skillId, skillLevels, characterLevel);
    },
    includeRestrictions: true
  },
  oskill: {
    maxLevel() {
      return OSKILL_HARD_CAP;
    },
    includeRestrictions: false
  }
};

export function getSkillProfile(skillType = 'regular') {
  return SKILL_PROFILES[skillType] || SKILL_PROFILES.regular;
}

export function getOSkillIdentifierSet() {
  const oSkills = getAllOSkills();
  const oSkillKeys = new Set();

  if (Array.isArray(oSkills)) {
    oSkills.forEach((oskill) => {
      if (oskill.skillName) oSkillKeys.add(String(oskill.skillName));
      if (oskill.skillId != null) oSkillKeys.add(String(oskill.skillId));
    });
    return oSkillKeys;
  }

  if (oSkills && typeof oSkills === 'object') {
    Object.keys(oSkills).forEach((key) => oSkillKeys.add(String(key)));
  }

  return oSkillKeys;
}

export function hasAnyOSkillAllocations() {
  const allOSkills = getAllOSkills();
  if (!allOSkills || typeof allOSkills !== 'object') return false;
  return Object.values(allOSkills).some((points) => Number(points) > 0);
}

function filterRegularSkillsOnly(skillLevels) {
  const oSkillKeys = getOSkillIdentifierSet();

  // Filter out oSkills from skillLevels
  const filtered = {};
  for (const [key, value] of Object.entries(skillLevels)) {
    // Skip if this key matches any oSkill identifier
    if (!oSkillKeys.has(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Calculate effective max level for a skill (works for both regular skills and oSkills)
 * Consolidated from SkillService
 * @param {number} skillId - Numeric catalog id for regular skills, or oSkill identifier
 * @param {string} skillType - 'regular' | 'oskill'
 * @param {object} skillLevels - Object mapping skill_name to current skill level (should only contain regular skills, not oSkills)
 * @param {number} characterLevel - Current character level
 * @returns {number} Effective max level (capped at 150)
 */
export function calculateEffectiveMaxLevel(skillId, skillType, skillLevels = {}, characterLevel = Character.DEFAULT_LEVEL) {
  const profile = getSkillProfile(skillType);
  const effectiveSkillLevels =
    profile.includeRestrictions ? filterRegularSkillsOnly(skillLevels) : skillLevels;

  if (profile.includeRestrictions && !getFileSkillStore()) {
    console.warn('calculateEffectiveMaxLevel: No file skill store for max level calculation');
    return 0;
  }

  return profile.maxLevel(skillId, effectiveSkillLevels, characterLevel);
}

/**
 * Get all restrictions for a skill
 * Consolidated from SkillValidationService
 * @param {object} skill - Skill object (for regular skills) or skill metadata (for oSkills)
 * @param {string} skillType - 'regular' | 'oskill'
 * @param {number} currentPoints - Current points allocated
 * @param {Array} allSkills - Array of all skills (for regular skills only)
 * @param {object} skillLevels - Object mapping skill_name to current skill level (should exclude oSkills for regular skills)
 * @returns {Array} Array of {type: string, reason: string} restriction objects
 */
export function getSkillRestrictions(skill, skillType, currentPoints, allSkills = [], skillLevels = {}) {
  const profile = getSkillProfile(skillType);
  const restrictions = [];

  if (!profile.includeRestrictions) {
    return restrictions;
  }

  // For regular skills, ensure skillLevels excludes oSkills
  const regularSkillLevels = filterRegularSkillsOnly(skillLevels);

  // Skip all checks if skill already has points (can always add more)
  if (currentPoints > 0) {
    return restrictions;
  }

  // Check prerequisites
  const prereqCheck = checkPrerequisites(skill, allSkills);
  if (!prereqCheck.met) {
    prereqCheck.reasons.forEach(reason => {
      restrictions.push({
        type: 'prerequisite',
        reason: reason
      });
    });
  }

  const ultimateRestriction = checkUltimateRestriction(skill, allSkills);
  if (!ultimateRestriction.allowed) {
    restrictions.push({
      type: 'ultimate',
      reason: ultimateRestriction.reason
    });
  }

  const paragonRestriction = checkParagonRestriction(skill, allSkills);
  if (!paragonRestriction.allowed) {
    restrictions.push({
      type: 'paragon',
      reason: paragonRestriction.reason
    });
  }

  // Check Mastery restriction
  const masteryRestriction = checkMasteryRestriction(skill, allSkills);
  if (!masteryRestriction.allowed) {
    restrictions.push({
      type: 'mastery',
      reason: masteryRestriction.reason
    });
  }

  // Check Coven restriction
  const covenRestriction = checkCovenRestriction(skill, allSkills);
  if (!covenRestriction.allowed) {
    restrictions.push({
      type: 'coven',
      reason: covenRestriction.reason
    });
  }

  // Check Proficiency restriction
  const proficiencyRestriction = checkProficiencyRestriction(skill, allSkills);
  if (!proficiencyRestriction.allowed) {
    restrictions.push({
      type: 'proficiency',
      reason: proficiencyRestriction.reason
    });
  }

  // Check Devotion restriction (use filtered skill levels)
  const devotionRestriction = checkDevotionRestriction(skill.skillId, regularSkillLevels);
  if (!devotionRestriction.canAllocate) {
    restrictions.push({
      type: 'devotion',
      reason: devotionRestriction.reason
    });
  }

  return restrictions;
}

/**
 * Check if a skill can have points allocated
 * Consolidated from SkillService/SkillValidationService
 * @param {object} skill - Skill object or skill metadata
 * @param {string} skillType - 'regular' | 'oskill'
 * @param {number} currentPoints - Current points allocated
 * @param {number} maxPoints - Maximum points allowed
 * @param {Array} allSkills - Array of all skills (for regular skills only)
 * @param {object} skillLevels - Object mapping skill_name to current skill level
 * @returns {boolean} True if skill can have points allocated
 */
export function canAllocateSkillPoints(skill, skillType, currentPoints, maxPoints, allSkills = [], skillLevels = {}) {
  const profile = getSkillProfile(skillType);
  // Check if already at max
  if (currentPoints >= maxPoints) {
    return false;
  }

  // If skill already has points, it can always add more
  if (currentPoints > 0) {
    return true;
  }

  // For oSkills, only check max level (handled above)
  if (!profile.includeRestrictions) {
    return true;
  }

  // For regular skills, check restrictions
  const regularSkillLevels = filterRegularSkillsOnly(skillLevels);
  const restrictions = getSkillRestrictions(skill, skillType, currentPoints, allSkills, regularSkillLevels);
  return restrictions.length === 0;
}