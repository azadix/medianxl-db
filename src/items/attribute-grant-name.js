/**
 * @file Detect "+N to Life and Mana" style stat grants that TSW lists as oSkills.
 * @module items/attribute-grant-name
 */

const ATTRIBUTE_GRANT_NAME_RE =
  /^(?:Life|Mana|Strength|Dexterity|Vitality|Energy)(?: and (?:Life|Mana|Strength|Dexterity|Vitality|Energy))?$/i;

/**
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
export function isAttributeGrantName(name) {
  return ATTRIBUTE_GRANT_NAME_RE.test(String(name || '').trim());
}
