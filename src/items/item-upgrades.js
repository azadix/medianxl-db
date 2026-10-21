/**
 * @file Collect oil / corruption / shrine / blessing / mechanic bonus lines.
 * @module items/item-upgrades
 */

import { mysticOrbsSetEthereal } from '@/items/mystic-orbs.js';
import { getOilBonusLines, lookupOil } from '@/items/oils.js';
import {
  getCorruptionBonusLines,
  lookupCorruption,
  normalizeCorruptions,
} from '@/items/corruptions.js';
import { getShrineBonusLines } from '@/items/blessings.js';
import { getMechanicBonusLines } from '@/items/item-mechanics.js';

/**
 * @typedef {{
 *   oil?: string|null,
 *   corruptions?: string[]|null,
 *   blessing?: string|null,
 *   shrine?: string|null,
 *   mechanics?: Record<string, number>|null,
 *   honorific?: boolean,
 *   mysticOrbs?: unknown,
 * }} ItemUpgradeState
 */

/**
 * @param {object|null|undefined} def
 * @param {ItemUpgradeState} [state]
 * @returns {string[]}
 */
export function getItemUpgradeBonusLines(def, state = {}) {
  /** @type {string[]} */
  const out = [];
  const oil = String(state.oil || '').trim();
  if (oil) out.push(...getOilBonusLines(oil));
  for (const id of normalizeCorruptions(state.corruptions)) {
    out.push(...getCorruptionBonusLines(id));
  }
  const blessing = String(state.blessing || '').trim();
  if (blessing) out.push(...getShrineBonusLines(blessing, def, true));
  const shrine = String(state.shrine || '').trim();
  if (shrine) out.push(...getShrineBonusLines(shrine, def, false));
  out.push(...getMechanicBonusLines(def, state.mechanics || null));
  return out.filter(Boolean);
}

/**
 * @param {ItemUpgradeState} [state]
 * @returns {{ alreadyUpgraded: boolean, shrineBlessed: boolean, etherealFromCorruption: boolean, etherealForced: boolean, corrupted: boolean }}
 */
export function getItemUpgradeFlags(state = {}) {
  const oil = lookupOil(state.oil);
  const corruptions = normalizeCorruptions(state.corruptions);
  let etherealFromCorruption = false;
  let corrupted = false;
  for (const id of corruptions) {
    const row = lookupCorruption(id);
    if (!row) continue;
    if (!row.isFailure) corrupted = true;
    if (row.setsEthereal || row.id === 'ethereal') etherealFromCorruption = true;
  }
  const etherealForced = etherealFromCorruption || mysticOrbsSetEthereal(state.mysticOrbs);
  return {
    alreadyUpgraded: Boolean(oil && oil.id !== 'nothing'),
    shrineBlessed: Boolean(String(state.shrine || '').trim() || String(state.blessing || '').trim()),
    etherealFromCorruption,
    etherealForced,
    corrupted,
  };
}
