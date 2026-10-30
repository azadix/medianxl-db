/**
 * Shared prerequisite string helpers (tree_struct + planner).
 * Prereq format: type:value:target (e.g. skill_level:1:fire_bolt,
 * skill_level_any:15:shockwave_trap|incineration_trap).
 * Extra colons stay in the target (do not split(':') into three parts).
 */

/**
 * Parse type:value:target, keeping any extra ':' in the target.
 * @param {unknown} prereq
 * @returns {{ type: string, value: string, target: string }}
 */
export function parsePrereqTriple(prereq) {
  const s = String(prereq ?? '');
  const i1 = s.indexOf(':');
  if (i1 < 0) return { type: s, value: '', target: '' };
  const type = s.slice(0, i1);
  const rest = s.slice(i1 + 1);
  const i2 = rest.indexOf(':');
  if (i2 < 0) return { type, value: rest, target: '' };
  return { type, value: rest.slice(0, i2), target: rest.slice(i2 + 1) };
}

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
