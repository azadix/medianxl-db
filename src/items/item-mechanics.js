/**
 * @file Per-item planner mechanics from unique-stats wiki dumps (Restore, Dynamo, Assur's Bane upgrade).
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
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   lines: string[],
 *   requiredLevel?: number,
 *   lightRadiusCost?: number,
 *   requiresLightRadius?: number,
 *   replacesPurify?: boolean,
 *   maxApplications?: number,
 * }} AssurUpgrade
 * @typedef {{ itemId: string, label: string, baseLightRadius?: number, upgrades: AssurUpgrade[] }} AssurMechanic
 */

/** @type {Record<string, RestoreMechanic>} */
let restoreById = {};
/** @type {Record<string, { itemId: string, label: string }>} */
let dynamoById = {};
/** @type {Record<string, AssurMechanic>} */
let assurById = {};

const NAME_ALIASES = Object.freeze({
  su_arrogance: 'arrogance',
  su_endless_pride: 'endless pride',
  su_clockwork_slippers: 'clockwork slippers',
  su_arcane_dynamo: 'arcane dynamo',
  su_assurs_bane: "assur's bane",
});

/**
 * @param {unknown} data
 */
export function loadItemMechanics(data) {
  const rec = data && typeof data === 'object' ? data : {};
  restoreById = rec.restore && typeof rec.restore === 'object' ? rec.restore : {};
  dynamoById = rec.dynamo && typeof rec.dynamo === 'object' ? rec.dynamo : {};
  assurById = rec.assur && typeof rec.assur === 'object' ? rec.assur : {};
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
 * @returns {AssurMechanic|null}
 */
export function assurMechanicForDef(def) {
  const name = defNameKey(def);
  if (!name) return null;
  for (const row of Object.values(assurById)) {
    const alias = NAME_ALIASES[row.itemId] || String(row.itemId || '').replace(/^su_/, '').replace(/_/g, ' ');
    if (name === alias) return row;
  }
  return null;
}

/**
 * Roll key prefix for Assur's Bane upgrade application counts.
 * @param {string} id
 * @returns {string}
 */
export function assurRollKey(id) {
  return `assur_${id}`;
}

/**
 * Application counts per scroll id, read from the flat `mechanics` record.
 * @param {Record<string, number>|null|undefined} mechanics
 * @returns {Record<string, number>}
 */
export function assurCounts(mechanics) {
  /** @type {Record<string, number>} */
  const counts = {};
  if (!mechanics || typeof mechanics !== 'object') return counts;
  for (const [key, value] of Object.entries(mechanics)) {
    if (!key.startsWith('assur_')) continue;
    const n = Math.max(0, Math.floor(Number(value) || 0));
    if (n > 0) counts[key.slice('assur_'.length)] = n;
  }
  return counts;
}

/**
 * Total Light Radius removed by the applied scrolls.
 * @param {AssurMechanic|null|undefined} mechanic
 * @param {Record<string, number>} counts
 * @returns {number}
 */
export function assurLightRadiusRemoved(mechanic, counts) {
  if (!mechanic || !Array.isArray(mechanic.upgrades)) return 0;
  let total = 0;
  for (const up of mechanic.upgrades) {
    total += (counts[up.id] || 0) * (Number(up.lightRadiusCost) || 0);
  }
  return total;
}

/**
 * Number of applied scrolls that replace Purify (should be 0 or 1).
 * @param {AssurMechanic|null|undefined} mechanic
 * @param {Record<string, number>} counts
 * @returns {number}
 */
export function assurPurifierCount(mechanic, counts) {
  if (!mechanic || !Array.isArray(mechanic.upgrades)) return 0;
  let total = 0;
  for (const up of mechanic.upgrades) {
    if (up.replacesPurify) total += counts[up.id] || 0;
  }
  return total;
}

/**
 * Total Required Level added by the applied scrolls.
 * @param {AssurMechanic|null|undefined} mechanic
 * @param {Record<string, number>} counts
 * @returns {number}
 */
export function assurRequiredLevelBonus(mechanic, counts) {
  if (!mechanic || !Array.isArray(mechanic.upgrades)) return 0;
  let total = 0;
  for (const up of mechanic.upgrades) {
    total += (counts[up.id] || 0) * (Number(up.requiredLevel) || 0);
  }
  return total;
}

/**
 * Maximum applications for a scroll given the current state, honoring the shared
 * Light Radius budget, the single Purify-replacement slot, and any hard cap.
 * @param {AssurMechanic|null|undefined} mechanic
 * @param {Record<string, number>} counts
 * @param {AssurUpgrade} upgrade
 * @returns {number}
 */
export function assurMaxForUpgrade(mechanic, counts, upgrade) {
  const cur = counts[upgrade.id] || 0;
  let max = Number.isFinite(Number(upgrade.maxApplications))
    ? Math.max(0, Math.floor(Number(upgrade.maxApplications)))
    : 99;
  if (upgrade.replacesPurify) {
    const otherPurifiers = assurPurifierCount(mechanic, counts) - cur;
    max = Math.min(max, otherPurifiers > 0 ? 0 : 1);
  }
  const cost = Number(upgrade.lightRadiusCost) || 0;
  if (cost > 0) {
    const removed = assurLightRadiusRemoved(mechanic, counts);
    const remaining = (Number(mechanic?.baseLightRadius) || 0) - removed;
    const req = Number(upgrade.requiresLightRadius) || 0;
    const extra = remaining >= req ? Math.floor((remaining - req) / cost) + 1 : 0;
    max = Math.min(max, cur + extra);
  }
  return max;
}

/**
 * @param {AssurUpgrade|null|undefined} upgrade
 * @returns {'Upgrade'|'Light Radius'|'Replaces Purify'}
 */
export function assurUpgradeGroup(upgrade) {
  if (upgrade?.replacesPurify) return 'Replaces Purify';
  if (Number(upgrade?.lightRadiusCost) > 0) return 'Light Radius';
  return 'Upgrade';
}

/**
 * Scaled tooltip lines for one applied scroll (` ×n` when stacked).
 * @param {AssurUpgrade|null|undefined} upgrade
 * @param {number} [count]
 * @returns {string[]}
 */
export function assurUpgradeDisplayLines(upgrade, count = 1) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!upgrade || n <= 0 || !Array.isArray(upgrade.lines)) return [];
  const suffix = n > 1 ? ` ×${n}` : '';
  return upgrade.lines.map((line) => `${line}${suffix}`);
}

/**
 * Copy of `mechanics` with one Assur scroll count set (0 removes the key).
 * @param {Record<string, number>|null|undefined} mechanics
 * @param {string} id
 * @param {number} count
 * @returns {Record<string, number>}
 */
export function mechanicsWithAssurCount(mechanics, id, count) {
  const next = mechanics && typeof mechanics === 'object' ? { ...mechanics } : {};
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n > 0) next[assurRollKey(id)] = n;
  else delete next[assurRollKey(id)];
  return next;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function defHasItemMechanic(def) {
  return (
    restoreMechanicForDef(def) != null ||
    dynamoMechanicForDef(def) != null ||
    assurMechanicForDef(def) != null
  );
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
  /** @type {string[]} */
  const out = [];
  const restore = restoreMechanicForDef(def);
  if (restore) {
    const apps = Number(mechanics?.restore);
    const pct = restorePercent(restore, apps);
    if (pct > 0) {
      out.push(`Restore +${pct}%`);
      for (const output of restore.outputs || []) {
        const value = Math.trunc((output.coefficient * pct) / 100);
        if (!value) continue;
        const line = formatAffixIdLine(output.affixId, value);
        if (line) out.push(line);
      }
    }
  }
  const assur = assurMechanicForDef(def);
  if (assur) {
    const counts = assurCounts(mechanics);
    for (const up of assur.upgrades) {
      const n = counts[up.id] || 0;
      if (n <= 0) continue;
      const suffix = n > 1 ? ` ×${n}` : '';
      for (const line of up.lines) out.push(`${line}${suffix}`);
    }
    const lrRemoved = assurLightRadiusRemoved(assur, counts);
    if (lrRemoved > 0) out.push(`Light Radius -${lrRemoved}`);
    if (assurPurifierCount(assur, counts) > 0) out.push('Replaces Purify');
  }
  return out;
}
