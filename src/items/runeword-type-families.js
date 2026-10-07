/**
 * Wiki runeword types expand to in-game item groups (runes.bin equiv families).
 * @module items/runeword-type-families
 */

/**
 * Parent wiki type → child catalog `group` values.
 * `Weapons` is category-based and omitted here.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const WIKI_TYPE_FAMILIES = Object.freeze({
  Helms: Object.freeze([
    'Helms',
    'Amazon Helms',
    'Barbarian Helms',
    'Circlets',
    'Druid Helms',
    'Paladin Helms',
    'Special Helms',
  ]),
  Shields: Object.freeze([
    'Shields',
    'Amazon Shields',
    'Assassin Shields',
    'Barbarian Shields',
    'Necromancer Shields',
    'Paladin Shields',
    'Special Shields',
  ]),
  'Body Armors': Object.freeze(['Body Armors', 'Sorceress Body Armors']),
  Bows: Object.freeze(['Bows', 'Amazon Bows', 'Druid Bows']),
  Crossbows: Object.freeze(['Crossbows', 'Necromancer Crossbows']),
  Staves: Object.freeze(['Staves', 'Druid Staves', 'Necromancer Staves']),
  'One-Handed Swords': Object.freeze([
    'One-Handed Swords',
    'Barbarian Swords',
    'Crystal Swords',
    'Two-Handed Swords',
  ]),
  'Crystal Swords': Object.freeze(['Crystal Swords', 'Sorceress Crystal Swords']),
  'One-Handed Axes': Object.freeze([
    'One-Handed Axes',
    'Barbarian One-Handed Axes',
    'Barbarian Two-Handed Axes',
    'Throwing Axes',
    'Two-Handed Axes',
  ]),
  'Two-Handed Axes': Object.freeze(['Two-Handed Axes', 'Barbarian Two-Handed Axes']),
  'Barbarian One-Handed Axes': Object.freeze([
    'Barbarian One-Handed Axes',
    'Barbarian Two-Handed Axes',
  ]),
  Daggers: Object.freeze(['Daggers', 'Throwing Knives', 'Necromancer Daggers']),
  Hammers: Object.freeze(['Hammers', 'Paladin Hammers']),
  Maces: Object.freeze(['Maces', 'Paladin Maces']),
  Scythes: Object.freeze(['Scythes', 'Necromancer Scythes']),
  Javelins: Object.freeze(['Javelins', 'Amazon Javelins']),
  Spears: Object.freeze(['Spears', 'Amazon Spears', 'Paladin Spears']),
});

/**
 * Whether a wiki allowed/except type matches a catalog base's fields.
 * @param {string} type
 * @param {{ group?: string, category?: string, slot?: string }|null|undefined} base
 * @returns {boolean}
 */
export function wikiTypeMatchesBaseFields(type, base) {
  if (!base || typeof base !== 'object') return false;
  const wikiType = String(type || '').trim();
  if (!wikiType) return false;
  if (wikiType === 'Weapons') return base.category === 'weapons';
  if (wikiType === 'Gloves') return base.slot === 'glov';
  if (wikiType === 'Boots') return base.slot === 'feet';
  const group = String(base.group || '');
  const family = WIKI_TYPE_FAMILIES[wikiType];
  if (family) return family.includes(group);
  return group === wikiType;
}

/**
 * Wiki `except` names vs a grey base's core name.
 * @param {string|null|undefined} baseName
 * @returns {string}
 */
export function baseNameWithoutTier(name) {
  return String(name || '')
    .replace(/\s*\((?:Sacred|\d)\)\s*$/i, '')
    .trim();
}

/**
 * Allowed/except matching without rarity/socket checks.
 * @param {object|null|undefined} template
 * @param {{ group?: string, category?: string, slot?: string, name?: string }|null|undefined} base
 * @returns {boolean}
 */
export function templateAllowsBaseFields(template, base) {
  if (!template || !base) return false;
  const allowed = Array.isArray(template.allowedTypes) ? template.allowedTypes : [];
  if (!allowed.length) return false;
  if (!allowed.some((type) => wikiTypeMatchesBaseFields(type, base))) return false;
  const excludedTypes = Array.isArray(template.excludedTypes) ? template.excludedTypes : [];
  if (excludedTypes.some((type) => wikiTypeMatchesBaseFields(type, base))) return false;
  const excludedNames = Array.isArray(template.excludedNames) ? template.excludedNames : [];
  if (!excludedNames.length) return true;
  const core = baseNameWithoutTier(base.name).toLowerCase();
  return !excludedNames.some((name) => String(name || '').trim().toLowerCase() === core);
}
