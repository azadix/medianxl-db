/**
 * Item upgrade/state flag lines (Ethereal, Corrupted, Already Upgraded, etc.).
 * Shown in the tooltip base block with fixed order and dedicated colors.
 * @module items/item-state-flags
 */

import {
  decodeModifierLine,
  encodeModifierLine,
  MODIFIER_COLOR_DARKGREEN,
  MODIFIER_COLOR_GREEN,
  MODIFIER_COLOR_GREY,
  MODIFIER_COLOR_ORANGE,
  MODIFIER_COLOR_RED,
} from '@/items/item-modifier-line.js';

/**
 * @typedef {{ id: string, re: RegExp, color: string, label?: string }} ItemStateFlagDef
 */

/** Canonical order for base-block state flags. */
/** @type {ReadonlyArray<ItemStateFlagDef>} */
export const ITEM_STATE_FLAGS = Object.freeze([
  { id: 'ethereal', re: /^Ethereal$/i, color: MODIFIER_COLOR_GREY, label: 'Ethereal' },
  { id: 'corrupted', re: /^Corrupted$/i, color: MODIFIER_COLOR_RED, label: 'Corrupted' },
  {
    id: 'alreadyUpgraded',
    re: /^Already Upgraded$/i,
    color: MODIFIER_COLOR_GREEN,
    label: 'Already Upgraded',
  },
  {
    id: 'shrineBlessed',
    re: /^Shrine Blessed$/i,
    color: MODIFIER_COLOR_GREEN,
    label: 'Shrine Blessed',
  },
  {
    id: 'orbEffects',
    re: /^Orb Effects Applied to this Item are (Doubled|Quadrupled)$/i,
    color: MODIFIER_COLOR_DARKGREEN,
  },
  {
    id: 'cannotBeRenewed',
    re: /^Cannot be Renewed$/i,
    color: MODIFIER_COLOR_ORANGE,
    label: 'Cannot be Renewed',
  },
  {
    id: 'cannotBeCrafted',
    re: /^Cannot be Crafted \(Shrines will be lost\)$/i,
    color: MODIFIER_COLOR_ORANGE,
    label: 'Cannot be Crafted (Shrines will be lost)',
  },
]);

/**
 * @param {string|null|undefined} text
 * @returns {ItemStateFlagDef|null}
 */
export function matchItemStateFlag(text) {
  const plain = decodeModifierLine(text).text || String(text || '').trim();
  if (!plain) return null;
  for (const flag of ITEM_STATE_FLAGS) {
    if (flag.re.test(plain)) return flag;
  }
  return null;
}

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isItemStateFlagLine(text) {
  return matchItemStateFlag(text) != null;
}

/**
 * Force the canonical color for a state-flag line.
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function encodeItemStateFlagLine(text) {
  const flag = matchItemStateFlag(text);
  if (!flag) return '';
  const plain = decodeModifierLine(text).text || String(text || '').trim();
  const label = flag.label || plain;
  return encodeModifierLine(label, flag.color);
}

/**
 * Collect ordered, deduped state-flag lines for the tooltip base block.
 * @param {{
 *   ethereal?: boolean,
 *   corrupted?: boolean,
 *   alreadyUpgraded?: boolean,
 *   shrineBlessed?: boolean,
 *   modifiers?: Array<string|{text?: string}|null|undefined>|null,
 *   extras?: string[]|null,
 * }} [options]
 * @returns {string[]}
 */
export function collectItemStateFlagLines(options = {}) {
  /** @type {Map<string, string>} */
  const byId = new Map();

  /**
   * @param {string|null|undefined} raw
   */
  const consider = (raw) => {
    const flag = matchItemStateFlag(raw);
    if (!flag || byId.has(flag.id)) return;
    const encoded = encodeItemStateFlagLine(raw);
    if (encoded) byId.set(flag.id, encoded);
  };

  if (options.ethereal === true) consider('Ethereal');
  if (options.corrupted === true) consider('Corrupted');
  if (options.alreadyUpgraded === true) consider('Already Upgraded');
  if (options.shrineBlessed === true) consider('Shrine Blessed');

  for (const mod of Array.isArray(options.modifiers) ? options.modifiers : []) {
    if (typeof mod === 'string') consider(mod);
    else if (mod && typeof mod === 'object' && typeof mod.text === 'string') consider(mod.text);
  }
  for (const extra of Array.isArray(options.extras) ? options.extras : []) {
    consider(extra);
  }

  /** @type {string[]} */
  const out = [];
  for (const flag of ITEM_STATE_FLAGS) {
    const line = byId.get(flag.id);
    if (line) out.push(line);
  }
  return out;
}

/**
 * Remove state-flag lines from a list (keeps non-flag lines in order).
 * @param {Iterable<string>|null|undefined} lines
 * @returns {string[]}
 */
export function stripItemStateFlagLines(lines) {
  /** @type {string[]} */
  const out = [];
  for (const line of lines || []) {
    const raw = String(line || '').trim();
    if (!raw) continue;
    if (isItemStateFlagLine(raw)) continue;
    out.push(raw);
  }
  return out;
}
