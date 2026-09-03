/**
 * @file Unique/set overlay helpers — resolve against base items, set bonuses.
 * @module items/item-overlays
 */

import {
  applyAffixRolls,
  parseAffixRanges,
  buildAffixDisplayParts,
} from '@/items/affix-rolls.js';
import { annotateAffixDisplayPartsWithSkills } from '@/items/item-granted-oskills.js';

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function defaultRollValue(min, max) {
  const mid = (Number(min) + Number(max)) / 2;
  if (Number.isInteger(min) && Number.isInteger(max)) return Math.round(mid);
  return mid;
}

/** @type {Readonly<Record<string, string>>} */
export const OVERLAY_ROLL_KEYS = Object.freeze({
  affixPrefix: 'modAffix:',
});

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isOverlayItem(def) {
  if (!def || typeof def !== 'object') return false;
  // Charms/relics are not gear overlays
  if (def.category === 'charms' || def.type === 'charm' || def.keepInInventory) return false;
  if (def.category === 'relics' || def.rarity === 'relic') return false;
  return (
    Boolean(def.baseId) ||
    def.rarity === 'unique' ||
    def.rarity === 'set' ||
    def.rarity === 'runeword'
  );
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isUniqueItem(def) {
  return Boolean(def && def.rarity === 'unique');
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isSetItem(def) {
  return Boolean(def && (def.rarity === 'set' || def.setId));
}

/**
 * @param {string} sourceKey
 * @param {number} rangeIndex
 * @returns {string}
 */
export function overlayAffixRollKey(sourceKey, rangeIndex) {
  return `${OVERLAY_ROLL_KEYS.affixPrefix}${sourceKey}:r${rangeIndex}`;
}

/**
 * Merge a base catalog def with an overlay (unique/set) def.
 * Overlay wins for name/rarity/reqs/sockets/modifiers/display damage.
 * @param {object|null|undefined} base
 * @param {object|null|undefined} overlay
 * @returns {object|null}
 */
export function resolveItemDef(base, overlay) {
  if (!overlay || typeof overlay !== 'object') return null;
  if (!base || typeof base !== 'object') {
    // Overlay may already be fully merged at parse time
    return { ...overlay };
  }
  return {
    ...base,
    ...overlay,
    id: overlay.id,
    name: overlay.name || base.name,
    rarity: overlay.rarity || base.rarity,
    type: base.type,
    category: overlay.category || base.category,
    slot: base.slot ?? overlay.slot ?? null,
    invWidth: base.invWidth ?? overlay.invWidth ?? 1,
    invHeight: base.invHeight ?? overlay.invHeight ?? 1,
    icon: overlay.icon || base.icon,
    baseId: overlay.baseId || base.id,
    baseName: overlay.baseName || base.name,
    modifiers: Array.isArray(overlay.modifiers) ? overlay.modifiers : [],
    // Prefer overlay sockets (max); fall back to base
    sockets: overlay.sockets != null ? overlay.sockets : base.sockets,
  };
}

/**
 * Resolve overlay against catalogById map.
 * @param {object|null|undefined} def
 * @param {Record<string, object>} catalogById
 * @returns {object|null}
 */
export function resolveDefAgainstCatalog(def, catalogById) {
  if (!def) return null;
  if (!def.baseId) return def;
  const base = catalogById[def.baseId];
  if (!base) return def;
  // Avoid resolving base onto itself
  if (base.id === def.id) return def;
  return resolveItemDef(base, def);
}

/**
 * @param {object|null|undefined} def
 * @returns {{ sourceKey: string, text: string }[]}
 */
export function collectOverlayAffixSources(def) {
  /** @type {{ sourceKey: string, text: string }[]} */
  const out = [];
  if (!def || typeof def !== 'object') return out;
  let i = 0;
  for (const mod of Array.isArray(def.modifiers) ? def.modifiers : []) {
    if (typeof mod !== 'string' || !mod.trim()) continue;
    out.push({ sourceKey: `base:m${i}`, text: mod });
    i += 1;
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} sourceKey
 * @param {Record<string, number>|null|undefined} rolls
 * @param {boolean} [hideRollableRanges]
 * @returns {string|null}
 */
export function resolveOverlayAffixText(text, sourceKey, rolls = null, hideRollableRanges = false) {
  const ranges = parseAffixRanges(text);
  if (!ranges.length) return text;
  if (hideRollableRanges) return null;
  return applyAffixRolls(text, rolls, (i) => overlayAffixRollKey(sourceKey, i), {
    hideRanges: hideRollableRanges,
  });
}

/**
 * @param {{ sourceKey: string, text: string }} source
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {import('@/items/item-stats.js').RollableStat[]}
 */
export function buildOverlaySourceRollableStats(source, rolls = null) {
  /** @type {import('@/items/item-stats.js').RollableStat[]} */
  const out = [];
  const resolved = resolveOverlayAffixText(source.text, source.sourceKey, rolls, false);
  if (!resolved) return out;
  parseAffixRanges(source.text).forEach((range, rangeIndex) => {
    const parts = annotateAffixDisplayPartsWithSkills(
      buildAffixDisplayParts(
        source.text,
        rolls,
        (i) => overlayAffixRollKey(source.sourceKey, i),
        rangeIndex
      )
    );
    out.push({
      key: overlayAffixRollKey(source.sourceKey, rangeIndex),
      label: source.text,
      display: resolved,
      displayParts: parts,
      min: range.min,
      max: range.max,
    });
  });
  return out;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {import('@/items/item-stats.js').RollableStat[]}
 */
export function getOverlayRollableStats(def, rolls = null) {
  /** @type {import('@/items/item-stats.js').RollableStat[]} */
  const out = [];
  for (const source of collectOverlayAffixSources(def)) {
    out.push(...buildOverlaySourceRollableStats(source, rolls));
  }
  return out;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} [rolls]
 * @returns {({ kind: 'text', text: string } | { kind: 'roll', stat: import('@/items/item-stats.js').RollableStat })[]}
 */
export function getOverlayDetailStatRows(def, rolls = null) {
  /** @type {({ kind: 'text', text: string } | { kind: 'roll', stat: import('@/items/item-stats.js').RollableStat })[]} */
  const rows = [];
  for (const source of collectOverlayAffixSources(def)) {
    const ranges = parseAffixRanges(source.text);
    if (ranges.length) {
      for (const stat of buildOverlaySourceRollableStats(source, rolls)) {
        rows.push({ kind: 'roll', stat });
      }
      continue;
    }
    const text = resolveOverlayAffixText(source.text, source.sourceKey, rolls, false);
    if (text == null) continue;
    rows.push({ kind: 'text', text });
  }
  return rows;
}

/**
 * @param {object|null|undefined} def
 * @returns {Record<string, number>}
 */
export function defaultOverlayAffixRolls(def) {
  /** @type {Record<string, number>} */
  const rolls = {};
  for (const source of collectOverlayAffixSources(def)) {
    parseAffixRanges(source.text).forEach((range, rangeIndex) => {
      rolls[overlayAffixRollKey(source.sourceKey, rangeIndex)] = defaultRollValue(
        range.min,
        range.max
      );
    });
  }
  return rolls;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {{ hideRollableRanges?: boolean }} [options]
 * @returns {string[]}
 */
export function getOverlayStatLines(def, rolls = null, options = {}) {
  /** @type {string[]} */
  const lines = [];
  const hide = options.hideRollableRanges === true;
  for (const source of collectOverlayAffixSources(def)) {
    const text = resolveOverlayAffixText(source.text, source.sourceKey, rolls, hide);
    if (text == null) continue;
    lines.push(text);
  }
  return lines;
}

/**
 * @param {string|null|undefined} uniqueKind
 * @param {number|string|null|undefined} tier
 * @returns {string}
 */
export function formatOverlayBadge(uniqueKind, tier) {
  if (uniqueKind === 'tiered') return tier != null ? `T${tier}` : 'TU';
  if (uniqueKind === 'su') return 'SU';
  if (uniqueKind === 'ssu') return 'SSU';
  if (uniqueKind === 'sssu') return 'SSSU';
  if (uniqueKind === 'runeword') return 'RW';
  if (tier === 'sacred') return 'Sacred';
  return '';
}

/**
 * Count equipped pieces per setId.
 * @param {Array<object|null|undefined>} equippedDefs
 * @returns {Record<string, number>}
 */
export function countEquippedSetPieces(equippedDefs) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const def of equippedDefs) {
    if (!def?.setId) continue;
    counts[def.setId] = (counts[def.setId] || 0) + 1;
  }
  return counts;
}

/**
 * @typedef {{ required: number|string, modifiers: string[], active: boolean }} ResolvedSetBonus
 */

/**
 * @param {object|null|undefined} setDef - set bonus table entry
 * @param {number} equippedCount
 * @param {number} [totalPieces]
 * @returns {ResolvedSetBonus[]}
 */
export function resolveSetBonuses(setDef, equippedCount, totalPieces = 0) {
  if (!setDef || !Array.isArray(setDef.bonuses)) return [];
  return setDef.bonuses.map((b) => {
    const required = b.required;
    let active;
    if (required === 'complete') {
      active = totalPieces > 0 ? equippedCount >= totalPieces : equippedCount >= 2;
    } else {
      active = equippedCount >= Number(required);
    }
    return {
      required,
      modifiers: Array.isArray(b.modifiers) ? b.modifiers.map(String) : [],
      active,
    };
  });
}

/**
 * Label for a set bonus tier.
 * @param {number|string} required
 * @returns {string}
 */
export function formatSetBonusLabel(required) {
  if (required === 'complete') return 'Set Bonus with complete set';
  return `Set Bonus with ${required} or more set items`;
}
