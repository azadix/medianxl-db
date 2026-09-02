/**
 * @file oSkill allocation wrappers for the planner.
 * @module character/planner-oskills
 */

import Character from './Character.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { MISSING_IMAGE_NAME } from '@/shared/utils.js';
import { collectEnabledItemOSkillGrants } from '@/items/item-granted-oskills.js';
import {
  getCharacterInstance,
  notifyOSkillPointsChanged,
  notifyPlannerStateChanged,
} from './planner-instance.js';

/** @typedef {(skillId: string) => void | Promise<void>} AutoStatsFn */

/** @type {AutoStatsFn | null} */
let autoAddStatsToInputFn = null;

/**
 * @param {AutoStatsFn} fn
 */
export function registerAutoAddStatsToInput(fn) {
  autoAddStatsToInputFn = fn;
}

function callAutoAddStats(skillId) {
  if (autoAddStatsToInputFn) {
    void autoAddStatsToInputFn(skillId);
  }
}

function scheduleAutoStatsForAllOSkills() {
  const characterInstance = getCharacterInstance();
  if (!characterInstance) return;
  const seen = new Set();
  for (const row of characterInstance.oSkills || []) {
    const id = row.skillName != null ? String(row.skillName).trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    callAutoAddStats(id);
  }
}

/**
 * @param {string} skillId
 * @returns {object}
 */
function oSkillMetaFromCatalog(skillId) {
  const store = getFileSkillStore();
  const id = String(skillId || '').trim();
  const det = store?.getSkillDetail?.(id) ?? null;
  const cat = store?.catalogByInternalId?.get?.(id) ?? null;
  const displayName =
    (det?.display_name != null && String(det.display_name).trim() !== ''
      ? String(det.display_name).trim()
      : null) ||
    (cat?.displayName != null && String(cat.displayName).trim() !== ''
      ? String(cat.displayName).trim()
      : id);
  const className =
    (det?.className != null && String(det.className).trim() !== ''
      ? String(det.className).trim()
      : null) ||
    (store?.primaryClassDisplayName?.(cat) ?? null) ||
    'Other';
  const description = det?.description || '';
  const skillEffect = det?.skill_effect || '';
  return {
    displayName,
    skillName: id,
    image: det?.image || MISSING_IMAGE_NAME,
    className,
    hasDetails:
      (description && String(description).trim().length > 0) ||
      (skillEffect && String(skillEffect).trim().length > 0),
    description: description || null,
    skillEffect: skillEffect || null,
  };
}

/** @returns {Array<object>} */
export function getOSkillRowsForPlanner() {
  const characterInstance = getCharacterInstance();
  if (!characterInstance) return [];
  return characterInstance.oSkills.filter(
    (r) => Character.effectiveOSkillPoints(r) > 0
  );
}

/** @returns {Array<object>|Record<string, number>} */
export function getAllOSkills() {
  const characterInstance = getCharacterInstance();
  return characterInstance ? characterInstance.getAllOSkills() : [];
}

/**
 * @param {string} skillNameOrId
 * @returns {number}
 */
export function getOSkillPoints(skillNameOrId) {
  const characterInstance = getCharacterInstance();
  if (!characterInstance) return 0;
  return characterInstance.getOSkillPoints(skillNameOrId);
}

/**
 * Manual oSkill hard points (blvl). Item grants are slvl, not this value.
 * @param {string} skillNameOrId
 * @returns {number}
 */
export function getOSkillManualPoints(skillNameOrId) {
  const characterInstance = getCharacterInstance();
  if (!characterInstance) return 0;
  return characterInstance.getOSkillManualPoints(skillNameOrId);
}

/**
 * Item-granted oSkill levels from relics/charms (slvl).
 * @param {string} skillNameOrId
 * @returns {number}
 */
export function getOSkillItemPoints(skillNameOrId) {
  const characterInstance = getCharacterInstance();
  if (!characterInstance) return 0;
  return characterInstance.getOSkillItemPoints(skillNameOrId);
}

export function addOSkill(
  _skillIdIgnored,
  displayName,
  skillName,
  image,
  className,
  hasDetails = false,
  description = null,
  skillEffect = null
) {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.addOSkill(
      displayName,
      skillName,
      image,
      className,
      hasDetails,
      description,
      skillEffect
    );
    callAutoAddStats(skillName);
    notifyOSkillPointsChanged(skillName, 'add');
    notifyPlannerStateChanged({ source: 'addOSkill' });
  } else {
    console.error('[OSkills] No character instance available!');
  }
}

export function removeOSkill(skillName) {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.removeOSkill(skillName);
    notifyOSkillPointsChanged(skillName, 'remove');
    notifyPlannerStateChanged({ source: 'removeOSkill' });
  }
}

export function changeOSkillPoints(skillName, amount) {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.changeOSkillPoints(skillName, amount);
    notifyOSkillPointsChanged(skillName, amount > 0 ? 'add' : 'remove');
    notifyPlannerStateChanged({ source: 'changeOSkillPoints' });
  }
}

export function clearOSkills() {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.clearOSkills();
    notifyOSkillPointsChanged(null, 'clear');
    notifyPlannerStateChanged({ source: 'clearOSkills' });
  }
}

export function setAllOSkills(oSkills) {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.setAllOSkills(oSkills);
    scheduleAutoStatsForAllOSkills();
    notifyOSkillPointsChanged(null, 'set');
    notifyPlannerStateChanged({ source: 'setAllOSkills' });
  }
}

/**
 * Sync oSkill `itemPoints` from enabled charms/relics skill grants.
 * @param {{ className?: string|null, quiet?: boolean }} [options]
 * @returns {boolean} Whether any row changed
 */
export function syncItemGrantedOSkills(options = {}) {
  const characterInstance = getCharacterInstance();
  if (!characterInstance) return false;

  const grants = collectEnabledItemOSkillGrants({
    className: options.className ?? characterInstance.className,
  });
  /** @type {Set<string>} */
  const grantedIds = new Set(Object.keys(grants));
  let changed = false;
  /** @type {string[]} */
  const createdIds = [];

  for (const [skillId, amount] of Object.entries(grants)) {
    const meta = oSkillMetaFromCatalog(skillId);
    const result = characterInstance.setOSkillItemPoints(meta, amount);
    if (result === 'created') {
      createdIds.push(skillId);
      changed = true;
    } else if (result === 'updated') {
      changed = true;
    }
  }

  for (const row of [...(characterInstance.oSkills || [])]) {
    const id = row?.skillName != null ? String(row.skillName).trim() : '';
    if (!id || grantedIds.has(id)) continue;
    const prev = Character.clampOSkillPoints(row.itemPoints ?? 0);
    if (prev <= 0) continue;
    const result = characterInstance.setOSkillItemPoints(
      { skillName: id, displayName: row.displayName },
      0
    );
    if (result !== 'unchanged') changed = true;
  }

  if (!changed) return false;

  for (const id of createdIds) {
    callAutoAddStats(id);
  }
  if (!options.quiet) {
    notifyOSkillPointsChanged(null, 'item-sync');
    notifyPlannerStateChanged({ source: 'syncItemGrantedOSkills' });
  }
  return true;
}

/**
 * @returns {Set<string>}
 */
export function getOSkillIdentifierSet() {
  const oSkills = getAllOSkills();
  const oSkillKeys = new Set();

  if (Array.isArray(oSkills)) {
    oSkills.forEach((oskill) => {
      if (oskill.skillName) oSkillKeys.add(String(oskill.skillName));
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
