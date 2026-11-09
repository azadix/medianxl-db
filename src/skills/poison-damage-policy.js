/**
 * @file Poison-damage policy for skills.
 *
 * Poison damage over time is not modelled correctly yet (stacking + duration rules), so
 * poison damage scaling from skills is hidden for now. Amatoxin is the one skill whose
 * poison damage is kept.
 *
 * @module skills/poison-damage-policy
 */

/** The only skill whose poison damage scaling is kept. */
export const POISON_DAMAGE_SKILL_ID = 'amatoxin';

/** Skill scaling stat keys that describe poison damage. */
export const POISON_DAMAGE_STAT_KEYS = Object.freeze([
  'poison_dot',
  'poison_damage_to_weapons',
  'poison_damage_based_on_items_and_skills',
]);

const POISON_DAMAGE_KEY_SET = new Set(POISON_DAMAGE_STAT_KEYS);
const PLACEHOLDER_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/**
 * @param {string|null|undefined} statKey
 * @returns {boolean}
 */
export function isPoisonDamageStatKey(statKey) {
  return POISON_DAMAGE_KEY_SET.has(String(statKey ?? '').trim().toLowerCase());
}

/**
 * @param {string|null|undefined} skillId
 * @returns {boolean}
 */
export function skillKeepsPoisonDamage(skillId) {
  return String(skillId ?? '').trim() === POISON_DAMAGE_SKILL_ID;
}

/**
 * Drop description/effect lines that only exist to show poison damage, unless this is
 * Amatoxin.
 *
 * @param {string|null|undefined} skillId
 * @param {string[]|null|undefined} lines
 * @returns {string[]}
 */
export function filterPoisonDamageEffectLines(skillId, lines) {
  if (skillKeepsPoisonDamage(skillId)) return lines;
  const isArray = Array.isArray(lines);
  const source = isArray ? lines : String(lines ?? '').split('\n');
  const kept = source.filter((line) => {
    PLACEHOLDER_RE.lastIndex = 0;
    for (const match of String(line ?? '').matchAll(PLACEHOLDER_RE)) {
      if (isPoisonDamageStatKey(match[1])) return false;
    }
    return true;
  });
  return isArray ? kept : kept.join('\n');
}
