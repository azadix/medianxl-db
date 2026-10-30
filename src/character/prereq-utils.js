/**
 * Shared prerequisite string helpers (tree_struct + planner).
 * Prereq format: type:value:target (e.g. skill_level:1:fire_bolt,
 * skill_level_any:15:shockwave_trap|incineration_trap).
 */

/**
 * skill_level / skill_blocked_by target -> key used in skillPoints (id or legacy display slug).
 * @param {unknown} target
 * @returns {string}
 */
export function normalizePrereqSkillTargetKey(target) {
  if (target == null || target === "") return "";
  return String(target)
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\s+/g, "_");
}

/**
 * Human-readable name for prerequisite messages (tree_struct uses skill ids).
 * @param {unknown} target
 * @param {{ id: string, name?: string }[]} allSkills
 * @returns {string}
 */
export function displayNameForPrereqSkillTarget(target, allSkills) {
  const key = normalizePrereqSkillTargetKey(target);
  const sk = allSkills.find((s) => String(s.id).toLowerCase() === key);
  return sk?.name || String(target).replace(/_/g, " ");
}
