/**
 * Shared prerequisite string helpers (tree_struct + planner).
 * Prereq format: type:value:target (e.g. skill_level:1:fire_bolt).
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

/**
 * Split type:value:target (target may be omitted for some types).
 * @param {string} prereq
 * @returns {{ type: string, value: string, target: string }}
 */
export function parsePrereqTriple(prereq) {
  const parts = String(prereq).split(":");
  const type = parts[0] ?? "";
  const value = parts[1] ?? "";
  const target = parts.length > 2 ? parts.slice(2).join(":") : "";
  return { type, value, target };
}
