/**
 * @file Build import/export normalization for planner saves.
 * @module character/planner-build-io
 */

import Character from './Character.js';
import { getFileSkillStore } from '@/tree/skill-data-store.js';
import { getCharacterInstance } from './planner-instance.js';
import { notifyPlannerStateChanged } from './planner-instance.js';

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
 * @param {string|number} key
 * @param {ReturnType<typeof getFileSkillStore>|null} [store]
 * @returns {object|null}
 */
export function resolveCatalogRowBySkillRef(key, store = null) {
  const skillStore = store ?? getFileSkillStore();
  const catalog = skillStore?.catalog;
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
    hasDetails: true,
  };
}

/**
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
 * @returns {Record<string, number>}
 */
export function getAllSkillPointsById() {
  const characterInstance = getCharacterInstance();
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
 * @param {object} skillPoints
 */
export function setAllSkillPoints(skillPoints) {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.setAllSkillPoints(skillPoints);
    notifyPlannerStateChanged({ source: 'setAllSkillPoints' });
  }
}

/**
 * @param {object} skillPointsById
 */
export function setAllSkillPointsById(skillPointsById) {
  const characterInstance = getCharacterInstance();
  if (!characterInstance) return;
  const { map } = normalizeBuildSkillPointsForImport(skillPointsById);
  characterInstance.setAllSkillPoints(map);
  notifyPlannerStateChanged({ source: 'setAllSkillPointsById' });
}

/**
 * @returns {Record<string, number>}
 */
export function getOSkillsForBuildExport() {
  const characterInstance = getCharacterInstance();
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
 * @returns {object}
 */
export function exportCharacterState() {
  const characterInstance = getCharacterInstance();
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
        disabledOSkillSlotIds: [],
      };
}

/**
 * @param {object} state
 */
export function importCharacterState(state) {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.importState(state);
    notifyPlannerStateChanged({ source: 'importCharacterState' });
  }
}
