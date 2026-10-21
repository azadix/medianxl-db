/**
 * Mastercrafted bases (Kukri, Maiden Bow, Soulbinder Gloves, Flying Kinzhal).
 * Catalog names have no suffix; TSW labels them (Mastercrafted) / (MC).
 * @module items/mastercrafted-items
 */

const MC_NAME_RE = /\((?:Mastercrafted|MC)\)\s*$/i;

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isMastercraftedBaseItem(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.rarity === 'unique' || def.rarity === 'set' || def.rarity === 'runeword') return false;
  const name = String(def.name || def.baseName || '');
  if (MC_NAME_RE.test(name)) return true;
  const icon = String(def.icon || '').toLowerCase();
  return icon.startsWith('mastercrafted');
}

/**
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function mastercraftedBaseDisplayName(def) {
  const family = String(def?.baseName || def?.name || '')
    .replace(MC_NAME_RE, '')
    .trim();
  return family ? `${family} (Mastercrafted)` : 'Mastercrafted';
}
