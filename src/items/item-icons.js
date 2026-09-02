/**
 * @file Inventory icon variant pools (jewels / rings / amulets).
 * @module items/item-icons
 */

/** @type {Record<string, string[]>} */
export const ITEM_ICON_VARIANTS = {
  jewl: ['invjw1', 'invjw2', 'invjw3', 'invjw4'],
  ring: ['invrin1', 'invrin2', 'invrin3'],
  amul: ['invamu1', 'invamu2', 'invamu3', 'invamu4'],
};

/**
 * @param {{ type?: string, icon?: string }|null|undefined} def
 * @returns {string[]}
 */
export function iconVariantsForDef(def) {
  if (!def) return [];
  const pool = ITEM_ICON_VARIANTS[def.type];
  if (pool?.length) {
    // Keep unique fixed art (e.g. Amulet of the Viper → invvip).
    if (def.icon && !pool.includes(def.icon)) return [def.icon];
    return pool;
  }
  return def.icon ? [def.icon] : [];
}

/**
 * Pick a stable icon stem for a catalog def.
 * Jewelry types randomly choose from their variant pool; others use `def.icon`.
 * @param {{ type?: string, icon?: string }|null|undefined} def
 * @param {string|null|undefined} [preferred] - restore a previously chosen stem when still valid
 * @returns {string}
 */
export function pickItemIcon(def, preferred = null) {
  const pool = iconVariantsForDef(def);
  if (preferred && pool.includes(preferred)) return preferred;
  if (preferred && !pool.length) return preferred;
  if (pool.length > 1) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (pool.length === 1) return pool[0];
  return (def?.icon && String(def.icon).trim()) || '';
}
