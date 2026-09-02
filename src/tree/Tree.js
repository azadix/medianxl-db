/**
 * Loaded class skill tree: wraps plain skill objects (from Skill / JSON) for the current planner class list.
 */
export default class Tree {
  /**
   * @param {Array<object>} skills - Planner skill rows (same shape as tree-data output)
   */
  constructor(skills = []) {
    this.skills = Array.isArray(skills) ? skills : [];
  }

  getAllSkills() {
    return this.skills;
  }

  /**
   * @param {string} skillId - Internal skill id
   * @returns {object | undefined}
   */
  getSkillById(skillId) {
    if (skillId == null || String(skillId).trim() === '') return undefined;
    const key = String(skillId);
    return this.skills.find((s) => String(s.id) === key);
  }

  /**
   * @param {string} name - Internal skill id or display name
   * @returns {object | undefined}
   */
  getSkillByName(name) {
    if (name == null || name === '') return undefined;
    const str = String(name);
    return this.skills.find((s) => s.id === str || s.name === str);
  }
}
