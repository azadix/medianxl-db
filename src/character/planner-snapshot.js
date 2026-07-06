/**
 * @file Planner skill list snapshot and tree tab cache (no Character import).
 * @module character/planner-snapshot
 */

/** Last planner skill list from tree load (for min-level / character_level prereqs). */
let plannerSkillsSnapshot = [];

/** Tree skills cache: maps tab_index (from classTabs.id) to array of skill names */
let treeSkillsCache = {};

export function setPlannerSkillsSnapshot(skills) {
  plannerSkillsSnapshot = Array.isArray(skills) ? skills : [];
}

export function getPlannerSkillsSnapshot() {
  return plannerSkillsSnapshot;
}

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

/** @returns {Record<string, string[]>} */
export function getTreeSkillsCache() {
  return treeSkillsCache;
}
