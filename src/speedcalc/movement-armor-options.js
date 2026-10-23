/**
 * Body armor / shield movement-penalty options from baseitems.json.
 */

import { isShieldItem } from '@/items/item-types.js';
import { fetchJson } from '@/shared/fetch-json.js';
import { getAssetUrl } from '@/shared/utils.js';
import { DEFAULT_GAME_VERSION, treeAssetFolderFromMajorMinor } from '@/shared/version-constants.js';

/** @typedef {{ key: string, name: string, penalty: number }} MovePenaltyOption */

export const NONE_MOVE_PENALTY_OPTION = Object.freeze({
  key: 'none',
  name: 'None',
  penalty: 0,
});

/**
 * @param {unknown} name
 * @returns {string}
 */
export function stripBaseItemTier(name) {
  return String(name || '')
    .replace(/\s*\((?:\d+|Sacred)\)\s*$/i, '')
    .trim();
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isBodyArmorItem(def) {
  if (!def || typeof def !== 'object') return false;
  if (String(def.slot || '') === 'tors') return true;
  const type = String(def.type || '');
  if (type === 'tors' || type === 'qtor') return true;
  return /body armou?rs?/i.test(String(def.group || ''));
}

/**
 * @param {unknown} def
 * @returns {number}
 */
function readMovePenalty(def) {
  const n = Number(def?.movePenalty);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * @param {unknown[]} items
 * @param {(def: object) => boolean} match
 * @returns {MovePenaltyOption[]}
 */
function collectOptions(items, match) {
  /** @type {Map<string, MovePenaltyOption>} */
  const byKey = new Map();
  for (const def of items) {
    if (!def || typeof def !== 'object' || !match(def)) continue;
    const name = stripBaseItemTier(def.name);
    if (!name) continue;
    const penalty = readMovePenalty(def);
    const key = `${name.toLowerCase()}|${penalty}`;
    if (byKey.has(key)) continue;
    byKey.set(key, { key, name, penalty });
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.penalty !== b.penalty) return a.penalty - b.penalty;
    return a.name.localeCompare(b.name);
  });
}

/**
 * @param {unknown} data
 * @returns {{ armor: MovePenaltyOption[], shields: MovePenaltyOption[] }}
 */
export function collectMovePenaltyOptions(data) {
  const items = Array.isArray(data) ? data : [];
  return {
    armor: [NONE_MOVE_PENALTY_OPTION, ...collectOptions(items, isBodyArmorItem)],
    shields: [NONE_MOVE_PENALTY_OPTION, ...collectOptions(items, isShieldItem)],
  };
}

/**
 * @param {MovePenaltyOption[]} options
 * @param {string} key
 * @returns {MovePenaltyOption}
 */
export function findMovePenaltyOption(options, key) {
  return options.find((row) => row.key === key) || NONE_MOVE_PENALTY_OPTION;
}

/**
 * @param {MovePenaltyOption} option
 * @returns {string}
 */
export function formatMovePenaltyOption(option) {
  if (option.key === NONE_MOVE_PENALTY_OPTION.key) return option.name;
  return `${option.name} (${option.penalty})`;
}

/**
 * Folder for the is_active versions.json row (not the planner override).
 * @param {unknown} versions
 * @returns {string}
 */
export function activeItemsFolder(versions) {
  const list = Array.isArray(versions) ? versions : [];
  const active = list.find((row) => row && (row.is_active === 1 || row.is_active === true));
  const major = Number(active?.major ?? list[0]?.major ?? DEFAULT_GAME_VERSION.major);
  const minor = Number(active?.minor ?? list[0]?.minor ?? DEFAULT_GAME_VERSION.minor);
  return treeAssetFolderFromMajorMinor(major, minor);
}

/**
 * @returns {Promise<{ armor: MovePenaltyOption[], shields: MovePenaltyOption[] }>}
 */
export async function loadMovePenaltyOptions() {
  const versions = await fetchJson(getAssetUrl('tree_data/versions.json'));
  const folder = activeItemsFolder(versions);
  const items = await fetchJson(getAssetUrl(`items/${folder}/baseitems.json`));
  return collectMovePenaltyOptions(items);
}
