/**
 * @file Per-item planner mechanics from unique-stats wiki dumps (Restore, Dynamo).
 * @module items/item-mechanics
 */

import { formatAffixIdLine } from '@/items/affix-templates.js';

/**
 * @typedef {{
 *   itemId: string,
 *   label: string,
 *   step: number,
 *   maxApplications: number,
 *   hint?: string,
 *   outputs: Array<{ affixId: string, coefficient: number }>,
 * }} RestoreMechanic
 */

/** @type {Record<string, RestoreMechanic>} */
let restoreById = {};
/** @type {Record<string, { itemId: string, label: string }>} */
let dynamoById = {};

const NAME_ALIASES = Object.freeze({
  su_arrogance: 'arrogance',
  su_endless_pride: 'endless pride',
  su_clockwork_slippers: 'clockwork slippers',
  su_arcane_dynamo: 'arcane dynamo',
});

/**
 * @param {unknown} data
 */
export function loadItemMechanics(data) {
  const rec = data && typeof data === 'object' ? data : {};
  restoreById = rec.restore && typeof rec.restore === 'object' ? rec.restore : {};
  dynamoById = rec.dynamo && typeof rec.dynamo === 'object' ? rec.dynamo : {};
}

/**
 * @param {object|null|undefined} def
 * @returns {string}
 */
function defNameKey(def) {
  return String(def?.name || '')
    .trim()
    .toLowerCase();
}

/**
 * @param {object|null|undefined} def
 * @returns {RestoreMechanic|null}
 */
export function restoreMechanicForDef(def) {
  const name = defNameKey(def);
  if (!name) return null;
  for (const row of Object.values(restoreById)) {
    const alias = NAME_ALIASES[row.itemId] || String(row.itemId || '').replace(/^su_/, '').replace(/_/g, ' ');
    if (name === alias) return row;
  }
  return null;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function defHasItemMechanic(def) {
  return restoreMechanicForDef(def) != null || dynamoMechanicForDef(def) != null;
}

/**
 * @param {object|null|undefined} def
 * @returns {{ itemId: string, label: string }|null}
 */
export function dynamoMechanicForDef(def) {
  const name = defNameKey(def);
  if (!name) return null;
  for (const row of Object.values(dynamoById)) {
    const alias = NAME_ALIASES[row.itemId] || String(row.itemId || '').replace(/^su_/, '').replace(/_/g, ' ');
    if (name === alias) return row;
  }
  return null;
}

/**
 * Restore % from application count.
 * @param {RestoreMechanic} mechanic
 * @param {number} applications
 * @returns {number}
 */
export function restorePercent(mechanic, applications) {
  const n = Math.max(0, Math.min(mechanic.maxApplications, Math.floor(Number(applications) || 0)));
  return Math.min(100, n * mechanic.step);
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} mechanics
 * @returns {string[]}
 */
export function getMechanicBonusLines(def, mechanics) {
  const restore = restoreMechanicForDef(def);
  if (!restore) return [];
  const apps = Number(mechanics?.restore);
  const pct = restorePercent(restore, apps);
  if (pct <= 0) return [];
  /** @type {string[]} */
  const out = [`Restore +${pct}%`];
  for (const output of restore.outputs || []) {
    const value = Math.trunc((output.coefficient * pct) / 100);
    if (!value) continue;
    const line = formatAffixIdLine(output.affixId, value);
    if (line) out.push(line);
  }
  return out;
}
