/**
 * @file Runeword overlay helpers — allowed groups, recipe display.
 * @module items/runeword-items
 */

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isRunewordItem(def) {
  if (!def || typeof def !== 'object') return false;
  return def.rarity === 'runeword';
}

/**
 * Format rune recipe for badges / tooltips.
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function formatRunewordRecipe(def) {
  if (!isRunewordItem(def)) return '';
  if (Array.isArray(def.runes) && def.runes.length) return def.runes.join(' + ');
  if (def.runeCode) return String(def.runeCode);
  return 'RW';
}

/**
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function formatRunewordBadge(def) {
  if (!isRunewordItem(def)) return '';
  const recipe = formatRunewordRecipe(def);
  const lvl = def.runewordLevel ?? def.reqLevel;
  if (recipe && lvl != null) return `RW ${recipe} (L${lvl})`;
  if (recipe) return `RW ${recipe}`;
  return 'RW';
}

/**
 * Whether a runeword can be equipped in the given equipment slot for this class,
 * based on allowedGroups matching catalog bases that fit the slot.
 * @param {object|null|undefined} def
 * @param {string} equipSlot
 * @param {Record<string, object>|object[]|null|undefined} catalog
 * @param {string|null|undefined} [className]
 * @param {(def: object, slot: string, className?: string|null) => boolean} canEquipInSlot
 * @returns {boolean}
 */
export function runewordFitsEquipSlot(def, equipSlot, catalog, className, canEquipInSlot) {
  if (!isRunewordItem(def)) return false;
  // Default merged base already has a slot — use that when present
  if (def.slot != null && canEquipInSlot(def, equipSlot, className)) return true;

  const groups = Array.isArray(def.allowedGroups) ? def.allowedGroups : [];
  if (!groups.length) return canEquipInSlot(def, equipSlot, className);

  const list = Array.isArray(catalog)
    ? catalog
    : catalog && typeof catalog === 'object'
      ? Object.values(catalog)
      : [];

  for (const group of groups) {
    const slotKey = group === 'Boots' ? 'feet' : group === 'Gloves' ? 'glov' : null;
    const match = list.find((b) => {
      if (!b || b.rarity === 'runeword' || b.rarity === 'unique' || b.rarity === 'set') return false;
      if (slotKey) return b.slot === slotKey;
      return b.group === group;
    });
    if (match && canEquipInSlot({ ...match, ...def, slot: match.slot }, equipSlot, className)) {
      return true;
    }
  }
  return false;
}
