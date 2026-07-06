/**
 * @file oSkill allocation wrappers for the planner.
 * @module character/planner-oskills
 */

import Character from './Character.js';
import { getFileSkillStore } from '@/tree/skill-data-store.js';
import {
  getCharacterInstance,
  notifyOSkillPointsChanged,
  notifyPlannerStateChanged,
} from './planner-instance.js';

/** @typedef {(skillId: number) => void | Promise<void>} AutoStatsFn */

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
    callAutoAddStats(n);
  }
}

/** @returns {Array<object>} */
export function getOSkillRowsForPlanner() {
  const characterInstance = getCharacterInstance();
  if (!characterInstance) return [];
  return characterInstance.oSkills.filter((r) => Character.clampOSkillPoints(r?.points ?? 0) > 0);
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
  const direct = characterInstance.getOSkillPoints(skillNameOrId);
  if (direct > 0) return direct;

  const raw = String(skillNameOrId ?? '').trim();
  if (!raw || !/^\d+$/.test(raw)) return direct;

  const store = getFileSkillStore();
  const internal = store?.internalNameByNumericId(Number(raw));
  if (!internal) return direct;
  return characterInstance.getOSkillPoints(internal);
}

export function addOSkill(
  skillId,
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
      skillId,
      displayName,
      skillName,
      image,
      className,
      hasDetails,
      description,
      skillEffect
    );
    callAutoAddStats(skillId);
    notifyOSkillPointsChanged(skillName || skillId, 'add');
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
 * @returns {Set<string>}
 */
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
