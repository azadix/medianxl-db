/**
 * Loaded class skill tree: wraps plain skill objects (from Skill / JSON) for the current planner class list.
 */
export default class Tree {
  /**
   * @param {Array<Object>} skills - Planner skill rows (same shape as tree-data output)
   */
  constructor(skills = []) {
    this.skills = Array.isArray(skills) ? skills : [];
  }

  getAllSkills() {
    return this.skills;
  }

  /**
   * @param {number|string} skillId - Numeric skill id or string key
   * @returns {Object|undefined}
   */
  getSkillById(skillId) {
    const n = Number(skillId);
    const useNumeric = Number.isFinite(n) && String(skillId).trim() !== '';
    return this.skills.find((s) => {
      if (useNumeric && s.skillId != null && Number(s.skillId) === n) return true;
      if (useNumeric && s.numericId != null && Number(s.numericId) === n) return true;
      return String(s.id) === String(skillId);
    });
  }

  /**
   * @param {string} name - Internal skill id or display name
   * @returns {Object|undefined}
   */
  getSkillByName(name) {
    if (name == null || name === '') return undefined;
    const str = String(name);
    return this.skills.find(
      (s) => s.id === str || s.name === str || String(s.skillId) === str
    );
  }
}
