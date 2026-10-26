/**
 * @file Shared item stat display + rollable range helpers.
 * @module items/item-stats
 */

import {
  defaultCharmRollsForDef,
  getCharmDetailStatRows,
  getCharmRollableStats,
  getCharmStatLines,
  isCharmItem,
} from '@/items/charm-items.js';
import {
  defaultRelicAffixRolls,
  getRelicDetailStatRows,
  getRelicRollableStats,
  getRelicStatLines,
  isRelicItem,
} from '@/items/relic-items.js';
import {
  buildOverlaySourceRollableStats,
  defaultOverlayAffixRolls,
  formatOverlayBadge,
  getOverlayDetailStatRows,
  getOverlayRollableStats,
  getOverlayStatLines,
  isOverlayItem,
  itemHasFixedSockets,
  overlayAffixRollKey,
} from '@/items/item-overlays.js';
import { formatRunewordBadge, formatRunewordSocketFillerLines, isRunewordItem } from '@/items/runeword-items.js';
import { getShieldClassBlockPercent } from '@/character/class-baselines.js';
import {
  extrasWithMysticOrbRequiredLevel,
  parseRequiredLevelBonus,
  parseRequirementsReductionPct,
  resolveItemRequirements,
} from '@/items/item-requirements.js';
import {
  applyResolvedRandomReanimates,
  decodeModifierLine,
  markModifierLineAdded,
} from '@/items/item-modifier-line.js';
import { getMysticOrbBonusLines, normalizeMysticOrbs } from '@/items/mystic-orbs.js';
import { getSocketableBonusLines, normalizeSocketables } from '@/items/socketables.js';
import { applyAffixRolls, parseAffixRanges } from '@/items/affix-rolls.js';
import {
  collectShrineUpgradeSources,
  getItemUpgradeBonusLines,
  getItemUpgradeFlags,
} from '@/items/item-upgrades.js';
import {
  collectItemStateFlagLines,
  stripItemStateFlagLines,
} from '@/items/item-state-flags.js';

/** @type {Readonly<Record<string, string>>} */
export const ITEM_CATEGORY_LABEL = Object.freeze({
  weapons: 'Weapon',
  armor: 'Armor',
  jewelry: 'Jewelry',
  quivers: 'Quiver',
  charms: 'Charm',
  relics: 'Relic',
  other: 'Other',
});

/**
 * @param {string|string[]|null|undefined} slot
 * @returns {string}
 */
export function formatItemSlots(slot) {
  if (slot == null) return 'Inventory';
  const list = Array.isArray(slot) ? slot : [slot];
  return [...new Set(list)].join('/');
}

/**
 * Short rarity/kind badge for equipment cards (SU, T4, Set, …).
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function formatItemRarityBadge(def) {
  if (!def || typeof def !== 'object') return '';
  if (isRunewordItem(def)) return 'RW';
  const overlay = formatOverlayBadge(def.uniqueKind, def.tier);
  if (overlay) return overlay;
  const rarity = String(def.rarity || '');
  if (rarity === 'set') return 'Set';
  if (rarity === 'unique') return 'Unique';
  if (rarity === 'honorific') return 'Honorific';
  if (rarity === 'crafted') return 'Crafted';
  if (rarity === 'angelic') return 'Rare';
  if (rarity === 'rare') return 'Rare';
  if (rarity === 'magic') return 'Magic';
  if (rarity === 'superior') return 'Superior';
  if (rarity === 'relic') return 'Relic';
  return '';
}

/**
 * Subtitle for picker/modify: base name + TU/SU badge.
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function formatItemOverlayMeta(def) {
  if (!def || typeof def !== 'object') return '';
  const parts = [
    ITEM_CATEGORY_LABEL[def.category] || def.category,
    formatItemSlots(def.slot),
  ].filter(Boolean);
  if (def.angelic === true || def.rarity === 'angelic' || def.customQuality === 'angelic') {
    const base = def.baseName || '';
    if (base) parts.push(base);
    else parts.push('Angelic');
  } else if (isOverlayItem(def)) {
    if (isRunewordItem(def)) {
      const badge = formatRunewordBadge(def);
      const base = def.baseName || '';
      if (base) parts.push(base);
      if (badge) parts.push(badge);
    } else {
      const badge = formatOverlayBadge(def.uniqueKind, def.tier);
      const base = def.baseName || '';
      if (base) parts.push(base);
      if (badge) parts.push(badge);
      if (def.setName) parts.push(def.setName);
    }
  }
  return parts.join(' · ');
}

/**
 * @typedef {{ kind: 'text' | 'value', text: string }} StatDisplayPart
 * @typedef {{ key: string, label: string, display: string, displayParts: StatDisplayPart[], min: number, max: number, defaultValue?: number }} RollableStat
 */

/**
 * Catalog fields that roll a single value between min and max on drop.
 * Base defense always uses the catalog max (Median items drop at max defense).
 * Uniques/sets/runewords lock sockets at max (docs defense display used instead).
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} [rolls]
 * @param {{ className?: string|null }} [options]
 * @returns {RollableStat[]}
 */
export function getRollableStats(def, rolls = null, options = {}) {
  if (!def || typeof def !== 'object') return [];
  /** @type {RollableStat[]} */
  const out = [];
  const overlay = isOverlayItem(def);

  if (def.sockets > 0 && !itemHasFixedSockets(def)) {
    const rolled =
      rolls && Number.isFinite(rolls.sockets)
        ? rolls.sockets
        : defaultRollValue(0, def.sockets);
    out.push({
      key: 'sockets',
      label: 'Sockets',
      display: rolled > 0 ? `Socketed (${rolled})` : 'Sockets',
      displayParts:
        rolled > 0
          ? [
              { kind: 'text', text: 'Socketed (' },
              { kind: 'value', text: String(rolled) },
              { kind: 'text', text: ')' },
            ]
          : [{ kind: 'text', text: 'Sockets' }],
      min: 0,
      max: def.sockets,
      defaultValue: 0,
    });
  }

  if (isCharmItem(def)) {
    out.push(...getCharmRollableStats(def, rolls, options.className ?? null));
  } else if (isRelicItem(def)) {
    out.push(...getRelicRollableStats(def, rolls));
  } else if (overlay) {
    out.push(...getOverlayRollableStats(def, rolls));
  }
  return out;
}

/**
 * Midpoint of a roll range (integer when both ends are ints).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function defaultRollValue(min, max) {
  const mid = (Number(min) + Number(max)) / 2;
  if (Number.isInteger(min) && Number.isInteger(max)) return Math.round(mid);
  return mid;
}

/**
 * Clamp a roll into [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampRoll(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  let v = Math.min(max, Math.max(min, n));
  if (Number.isInteger(min) && Number.isInteger(max)) v = Math.round(v);
  return v;
}

/**
 * Build default rolls object for a catalog def.
 * @param {object|null|undefined} def
 * @param {{ className?: string|null }} [options]
 * @returns {Record<string, number>}
 */
export function defaultRollsForDef(def, options = {}) {
  /** @type {Record<string, number>} */
  const rolls = {};
  for (const s of getRollableStats(def, null, options)) {
    rolls[s.key] =
      s.defaultValue != null ? s.defaultValue : defaultRollValue(s.min, s.max);
  }
  if (isCharmItem(def)) {
    return { ...rolls, ...defaultCharmRollsForDef(def, options.className ?? null) };
  }
  if (isRelicItem(def)) {
    return { ...rolls, ...defaultRelicAffixRolls(def) };
  }
  if (isOverlayItem(def)) {
    if (itemHasFixedSockets(def) && def.sockets > 0) rolls.sockets = def.sockets;
    return { ...rolls, ...defaultOverlayAffixRolls(def), ...defaultShrineUpgradeRolls(def, options) };
  }
  return { ...rolls, ...defaultShrineUpgradeRolls(def, options) };
}

/**
 * @param {object|null|undefined} def
 * @param {{ shrine?: string|null, blessing?: string|null }} [options]
 * @returns {Record<string, number>}
 */
function defaultShrineUpgradeRolls(def, options = {}) {
  /** @type {Record<string, number>} */
  const rolls = {};
  for (const source of collectShrineUpgradeSources(def, options)) {
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
 * Default rolls merged with saved instance rolls.
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} existingRolls
 * @param {{ className?: string|null }} [options]
 * @returns {Record<string, number>}
 */
export function mergeRollsForDef(def, existingRolls = null, options = {}) {
  return { ...defaultRollsForDef(def, options), ...(existingRolls || {}) };
}

const INNATE_DAMAGE_TYPE_RE =
  /Innate\s+(Fire|Cold|Lightning|Poison|Magic|Physical|Shadow|Tri-Elemental)\s+Damage/i;
const ADDS_DAMAGE_TYPE_RE =
  /\bAdds\b[^\n]*\b(Fire|Cold|Lightning|Poison|Magic|Physical|Shadow)\s+Damage/i;

const RARITY_SUBTITLE_WORD = Object.freeze({
  magic: 'Magic',
  rare: 'Rare',
  unique: 'Unique',
  set: 'Set',
  runeword: 'Runeword',
  relic: 'Relic',
  crafted: 'Crafted',
  honorific: 'Honorific',
  angelic: 'Angelic',
  superior: 'Superior',
});

/**
 * Basetype elemental damage (Fire, Cold, …) from `adds`.
 * Innate elemental damage is a different conversion and is not a weapon type.
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function getItemDamageType(def) {
  if (!def || typeof def !== 'object') return '';
  if (INNATE_DAMAGE_TYPE_RE.test(String(def.innate || ''))) return '';
  const adds = ADDS_DAMAGE_TYPE_RE.exec(String(def.adds || ''));
  if (adds) return adds[1][0].toUpperCase() + adds[1].slice(1).toLowerCase();
  return '';
}

/**
 * D5-style subtitle: `UNIQUE WEAPON · T4`.
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function formatItemTooltipSubtitle(def) {
  if (!def || typeof def !== 'object') return '';
  const rarity = String(def.rarity || 'normal');
  const rarityWord = RARITY_SUBTITLE_WORD[rarity] || '';
  let typeWord = def.group || ITEM_CATEGORY_LABEL[def.category] || def.category || '';
  if (
    rarityWord &&
    typeWord &&
    String(rarityWord).toLowerCase() === String(typeWord).toLowerCase()
  ) {
    typeWord = '';
  }
  const left = [rarityWord, typeWord].filter(Boolean).join(' ').toUpperCase();
  const badge = formatItemRarityBadge(def);
  const skipBadge =
    !badge || /^(Unique|Set|RW|Crafted|Rare|Magic|Relic|Honorific|Angelic|Superior)$/i.test(badge);
  if (!skipBadge && badge) return left ? `${left} · ${badge}` : badge;
  return left;
}

const CLASS_BLOCK_ONLY_RE = /^class\s*%$/i;
const CLASS_BLOCK_RANGE_RE = /^([+-]?\d+)\s+to\s+([+-]?\d+)\s*%\s*\+\s*class\s*%$/i;
const CLASS_BLOCK_FLAT_RE = /^([+-]?\d+)\s*%\s*\+\s*class\s*%$/i;

/**
 * Extra block % on top of class block (wiki/TSW "1% + Class%").
 * @param {string} block
 * @returns {{ min: number, max: number }|null}
 */
function parseClassBlockExtra(block) {
  const text = String(block || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (CLASS_BLOCK_ONLY_RE.test(text)) return { min: 0, max: 0 };
  const range = CLASS_BLOCK_RANGE_RE.exec(text);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const flat = CLASS_BLOCK_FLAT_RE.exec(text);
  if (flat) {
    const n = Number(flat[1]);
    return { min: n, max: n };
  }
  return null;
}

/**
 * One-line Chance to Block, resolving Class % for the planner class.
 * @param {string|null|undefined} block
 * @param {string|null|undefined} [className]
 * @returns {string|null}
 */
export function formatChanceToBlockLine(block, className = null) {
  const text = String(block || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const extra = parseClassBlockExtra(text);
  if (!extra) return `Chance to Block: ${text}`;
  const classPct = getShieldClassBlockPercent(className);
  if (classPct == null) return `Chance to Block: ${text}`;
  const min = extra.min + classPct;
  const max = extra.max + classPct;
  if (min === max) return `Chance to Block: ${min}%`;
  return `Chance to Block: ${min} to ${max}%`;
}

/**
 * @typedef {{
 *   base: string[],
 *   scaling: string[],
 *   mods: string[],
 *   requirements: import('@/items/item-requirements.js').ItemRequirements,
 * }} ItemStatSections
 */

/**
 * Append socket and mystic-orb bonus lines onto extras.
 * Matching extras (e.g. TSW leftovers) are consumed so they are not doubled.
 * @param {string[]|null|undefined} extras
 * @param {object|null|undefined} def
 * @param {{ mysticOrbs?: unknown, socketables?: Array<object>|null, oil?: string|null, corruptions?: string[]|null, blessing?: string|null, shrine?: string|null, mechanics?: Record<string, number>|null, honorific?: boolean, rolls?: Record<string, number>|null, includeShrines?: boolean, hideRollableRanges?: boolean, showRollRanges?: boolean }} [options]
 * @returns {string[]}
 */
export function extrasWithAppliedItemBonuses(extras, def, options = {}) {
  const list = extrasWithMysticOrbRequiredLevel(extras, options.mysticOrbs, def?.modifiers);
  const extrasHaveReqPct = list.some((line) => parseRequirementsReductionPct(line) !== 0);
  const extrasHaveReqLevel = list.some((line) => parseRequiredLevelBonus(line) !== 0);
  /** @type {Map<string, number>} */
  const leftover = new Map();
  /**
   * @param {unknown} line
   */
  const countLeftover = (line) => {
    const key = decodeModifierLine(line).text.trim().toLowerCase();
    if (!key) return;
    leftover.set(key, (leftover.get(key) || 0) + 1);
  };
  for (const line of list) countLeftover(line);
  if (Array.isArray(def?.modifiers)) {
    for (const line of def.modifiers) countLeftover(line);
  }
  /**
   * @param {string} line
   */
  const appendBonus = (line) => {
    const text = String(line || '').trim();
    if (!text) return;
    if (extrasHaveReqPct && parseRequirementsReductionPct(text) !== 0) return;
    if (extrasHaveReqLevel && parseRequiredLevelBonus(text) !== 0) return;
    const key = decodeModifierLine(text).text.trim().toLowerCase();
    if (!key) return;
    const n = leftover.get(key) || 0;
    if (n > 0) {
      leftover.set(key, n - 1);
      return;
    }
    list.push(text);
  };
  for (const sock of normalizeSocketables(options.socketables)) {
    for (const line of getSocketableBonusLines(sock, def)) appendBonus(line);
  }
  for (const [count, name] of normalizeMysticOrbs(options.mysticOrbs)) {
    for (const line of getMysticOrbBonusLines(name, count)) appendBonus(line);
  }
  for (const line of getItemUpgradeBonusLines(def, {
    oil: options.oil,
    corruptions: options.corruptions,
    blessing: options.blessing,
    shrine: options.shrine,
    mechanics: options.mechanics,
    honorific: options.honorific,
  })) {
    appendBonus(line);
  }
  if (options.includeShrines !== false) {
    for (const source of collectShrineUpgradeSources(def, options)) {
      appendBonus(
        applyAffixRolls(source.text, options.rolls, (i) => overlayAffixRollKey(source.sourceKey, i), {
          hideRanges: options.hideRollableRanges === true,
          showRollRanges: options.showRollRanges === true,
        })
      );
    }
  }
  return list;
}

/**
 * +25% rounded down, matching Median XL ethereal.
 * @param {number} n
 * @returns {number}
 */
export function applyEtherealBonus(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return n;
  return v + Math.trunc((v * 25) / 100);
}

/**
 * Catalog defense always uses the maximum (items drop at max defense).
 * @param {object|null|undefined} def
 * @returns {number|null}
 */
export function itemBaseDefense(def) {
  const d = def?.defense;
  if (!d || typeof d !== 'object') return null;
  const max = Number(d.max);
  if (Number.isFinite(max)) return max;
  const min = Number(d.min);
  return Number.isFinite(min) ? min : null;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} [rolls]
 * @param {{
 *   hideRollableRanges?: boolean,
 *   showRollRanges?: boolean,
 *   characterLevel?: number|null,
 *   charmInInventory?: boolean,
 *   className?: string|null,
 *   charmHeaderOnly?: boolean,
 *   socketables?: Array<object>|null,
 *   extras?: string[]|null,
 *   mysticOrbs?: unknown,
 * }} [options]
 * @returns {ItemStatSections}
 */
export function getItemStatSections(def, rolls = null, options = {}) {
  /** @type {ItemStatSections} */
  const empty = {
    base: [],
    scaling: [],
    mods: [],
    requirements: { reqLevel: 0, reqStr: 0, reqDex: 0, reductionPct: 0 },
  };
  if (!def || typeof def !== 'object') return empty;

  const hideRollableRanges = options.hideRollableRanges === true;
  const showRollRanges =
    options.showRollRanges != null ? options.showRollRanges === true : !hideRollableRanges;
  /** @type {Set<string>|null} */
  const rollableKeys = hideRollableRanges
    ? new Set(getRollableStats(def, rolls, { className: options.className ?? null }).map((s) => s.key))
    : null;
  const overlay = isOverlayItem(def);
  /** @type {string[]} */
  const base = [];
  /** @type {string[]} */
  const scaling = [];
  /** @type {string[]} */
  const mods = [];

  const upgradeFlags = getItemUpgradeFlags({
    oil: options.oil,
    corruptions: options.corruptions,
    blessing: options.blessing,
    shrine: options.shrine,
    mysticOrbs: options.mysticOrbs,
  });
  const ethereal =
    options.ethereal === true || def.ethereal === true || upgradeFlags.etherealForced;
  /**
   * @param {number} n
   */
  const eth = (n) => (ethereal ? applyEtherealBonus(n) : n);
  if (def.damage1hDisplay) base.push(`One-Hand Damage: ${def.damage1hDisplay}`);
  else if (def.damage1h) {
    base.push(`One-Hand Damage: ${eth(def.damage1h.min)} to ${eth(def.damage1h.max)}`);
  }
  if (def.damage2hDisplay) base.push(`Two-Hand Damage: ${def.damage2hDisplay}`);
  else if (def.damage2h) {
    base.push(`Two-Hand Damage: ${eth(def.damage2h.min)} to ${eth(def.damage2h.max)}`);
  }
  if (def.throwDamageDisplay) base.push(`Throw Damage: ${def.throwDamageDisplay}`);

  if (def.defenseDisplay) {
    base.push(`Defense: ${def.defenseDisplay}`);
  } else {
    const defense = itemBaseDefense(def);
    if (defense != null) base.push(`Defense: ${eth(defense)}`);
  }

  if (def.block) {
    const blockLine = formatChanceToBlockLine(def.block, options.className ?? null);
    if (blockLine) base.push(blockLine);
  }

  const damageType = getItemDamageType(def);
  if (damageType) base.push(`${damageType} Damage`);

  if (def.range != null) base.push(`Melee range: ${def.range}`);
  if (def.speed != null) base.push(`Attack Speed Modifier: ${def.speed}`);
  if (def.movePenalty != null) base.push(`Movement Speed Penalty: ${def.movePenalty}`);
  base.push(
    ...collectItemStateFlagLines({
      ethereal,
      corrupted: def.corrupted === true || upgradeFlags.corrupted,
      alreadyUpgraded: upgradeFlags.alreadyUpgraded,
      shrineBlessed: upgradeFlags.shrineBlessed,
      modifiers: def.modifiers,
      extras: options.extras ?? null,
    })
  );

  if (def.strDamageBonus != null) {
    scaling.push(`Strength Damage Bonus: (${def.strDamageBonus} per Strength)%`);
  }
  if (def.dexDamageBonus != null) {
    scaling.push(`Dexterity Damage Bonus: (${def.dexDamageBonus} per Dexterity)%`);
  }
  if (def.innate) {
    for (const line of String(def.innate).split(/\r?\n/)) {
      const text = line.trim();
      if (text) scaling.push(text);
    }
  }

  // Socketed sits at the bottom of the base block (after damage/defense/scaling).
  if (def.sockets > 0) {
    const filled = rolls && Number.isFinite(rolls.sockets) ? rolls.sockets : null;
    if (rollableKeys?.has('sockets')) {
      // Roll controls shown elsewhere - skip static sockets line.
    } else if (itemHasFixedSockets(def)) {
      scaling.push(`Socketed (${def.sockets})`);
    } else if (filled != null) {
      if (filled > 0) scaling.push(`Socketed (${filled})`);
    } else {
      scaling.push(`Socketed (${def.sockets})`);
    }
  }

  if (def.adds) {
    const adds = String(def.adds);
    const alreadyListed =
      overlay && Array.isArray(def.modifiers) && def.modifiers.some((mod) => String(mod) === adds);
    if (!alreadyListed) mods.push(adds);
  }
  if (!overlay && def.attackModifier) mods.push(String(def.attackModifier));

  if (isCharmItem(def)) {
    mods.push(
      ...getCharmStatLines(def, options.characterLevel ?? null, {
        inInventory: options.charmInInventory !== false,
        rolls,
        className: options.className ?? null,
        hideRollableRanges,
        showRollRanges,
        headerOnly: options.charmHeaderOnly === true,
      })
    );
  } else if (isRelicItem(def) && !options.charmHeaderOnly) {
    if (options.charmInInventory !== false) {
      mods.push(...getRelicStatLines(def, rolls, { hideRollableRanges, showRollRanges }));
    }
  } else if (overlay && !options.charmHeaderOnly) {
    mods.push(...getOverlayStatLines(def, rolls, { hideRollableRanges, showRollRanges }));
    const hasSocketables =
      Array.isArray(options.socketables) && options.socketables.length > 0;
    if (isRunewordItem(def) && !hasSocketables) {
      mods.push(...formatRunewordSocketFillerLines(def));
    }
  }

  /** @type {string[]} */
  const extras = stripItemStateFlagLines(
    extrasWithAppliedItemBonuses(options.extras, def, {
      ...options,
      rolls,
      hideRollableRanges,
      showRollRanges,
    })
  );
  const merged = applyResolvedRandomReanimates(mods, extras);
  mods.length = 0;
  mods.push(...merged.mods, ...merged.extras.map((line) => markModifierLineAdded(line)));

  return {
    base,
    scaling,
    mods,
    requirements: resolveItemRequirements(def, {
      rolls,
      socketables: options.socketables ?? null,
      extras,
      mysticOrbs: options.mysticOrbs ?? null,
      corruptions: options.corruptions ?? null,
      ethereal,
    }),
  };
}

/**
 * Static + rolled stat lines for tooltips / detail panel (no requirements footer).
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} [rolls]
 * @param {{ hideRollableRanges?: boolean, showRollRanges?: boolean, characterLevel?: number|null, charmInInventory?: boolean, className?: string|null, charmHeaderOnly?: boolean, socketables?: Array<object>|null, extras?: string[]|null }} [options]
 * @returns {string[]}
 */
export function getItemStatLines(def, rolls = null, options = {}) {
  const sections = getItemStatSections(def, rolls, options);
  return [...sections.base, ...sections.scaling, ...sections.mods];
}

/**
 * Ordered picker/modify rows: item header, then base affixes, upgrades, trophies.
 * @typedef {{ kind: 'text', text: string, section?: 'base'|'mod' } | { kind: 'roll', stat: RollableStat, section?: 'base'|'mod' }} ItemDetailStatRow
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} [rolls]
 * @param {{ characterLevel?: number|null, charmInInventory?: boolean, className?: string|null, extras?: string[]|null, socketables?: Array<object>|null, mysticOrbs?: unknown }} [options]
 * @returns {ItemDetailStatRow[]}
 */
export function getItemDetailStatRows(def, rolls = null, options = {}) {
  if (!def || typeof def !== 'object') return [];
  const className = options.className ?? null;
  const extras = extrasWithAppliedItemBonuses(options.extras, def, {
    ...options,
    rolls,
    includeShrines: false,
  });
  const hasSocketables = Array.isArray(options.socketables) && options.socketables.length > 0;
  // Match tooltip sectioning (base/scaling vs mods); Socketed is last in the base block.
  // Pass extras only after overlay/charm rows so they appear under catalog affixes.
  // Extras are merged after overlay rows; still hoist state flags into base first.
  const sections = getItemStatSections(def, rolls, {
    hideRollableRanges: true,
    characterLevel: options.characterLevel ?? null,
    charmInInventory: options.charmInInventory,
    className,
    charmHeaderOnly: true,
    socketables: options.socketables ?? null,
    mysticOrbs: options.mysticOrbs ?? null,
    oil: options.oil,
    corruptions: options.corruptions,
    blessing: options.blessing,
    shrine: options.shrine,
    ethereal: options.ethereal === true,
    includeShrines: false,
  });
  const upgradeFlags = getItemUpgradeFlags(options);
  const flagLines = collectItemStateFlagLines({
    ethereal: options.ethereal === true || def.ethereal === true || upgradeFlags.etherealForced,
    corrupted: def.corrupted === true || upgradeFlags.corrupted,
    alreadyUpgraded: upgradeFlags.alreadyUpgraded,
    shrineBlessed: upgradeFlags.shrineBlessed,
    modifiers: def.modifiers,
    extras,
  });
  /** @type {ItemDetailStatRow[]} */
  const rows = [
    ...[...stripItemStateFlagLines(sections.base), ...flagLines, ...sections.scaling].map(
      (text) => ({
        kind: /** @type {const} */ ('text'),
        text,
        section: /** @type {const} */ ('base'),
      })
    ),
    ...sections.mods.map((text) => ({
      kind: /** @type {const} */ ('text'),
      text,
      section: /** @type {const} */ ('mod'),
    })),
  ];
  /**
   * @param {ItemDetailStatRow[]} extra
   * @returns {ItemDetailStatRow[]}
   */
  const asMod = (extra) => extra.map((row) => ({ ...row, section: row.section || 'mod' }));
  const pushShrineRows = () => {
    for (const source of collectShrineUpgradeSources(def, options)) {
      const stats = buildOverlaySourceRollableStats(source, rolls);
      if (stats.length) {
        rows.push(...asMod(stats.map((stat) => ({ kind: /** @type {const} */ ('roll'), stat }))));
        continue;
      }
      const text = markModifierLineAdded(source.text);
      if (text) rows.push({ kind: 'text', text, section: /** @type {const} */ ('mod') });
    }
  };
  /**
   * @returns {ItemDetailStatRow[]}
   */
  const withExtras = () => {
    /** @type {number[]} */
    const modIndexes = [];
    /** @type {string[]} */
    const modTexts = [];
    rows.forEach((row, index) => {
      if (row.kind === 'text' && row.section === 'mod') {
        modIndexes.push(index);
        modTexts.push(row.text);
      }
    });
    const merged = applyResolvedRandomReanimates(modTexts, stripItemStateFlagLines(extras));
    merged.mods.forEach((text, i) => {
      const row = rows[modIndexes[i]];
      if (row && row.kind === 'text') row.text = text;
    });
    for (const line of merged.extras) {
      const text = markModifierLineAdded(String(line || '').trim());
      if (!text) continue;
      rows.push({ kind: /** @type {const} */ ('text'), text, section: /** @type {const} */ ('mod') });
    }
    return rows;
  };
  if (isCharmItem(def)) {
    rows.push(...asMod(getCharmDetailStatRows(def, rolls, className)));
    pushShrineRows();
    return withExtras();
  }
  if (isRelicItem(def)) {
    rows.push(...asMod(getRelicDetailStatRows(def, rolls)));
    pushShrineRows();
    return withExtras();
  }
  if (isOverlayItem(def)) {
    rows.push(...asMod(getOverlayDetailStatRows(def, rolls)));
    const socketStat = getRollableStats(def, rolls, { className }).find((stat) => stat.key === 'sockets');
    if (socketStat) rows.push({ kind: /** @type {const} */ ('roll'), stat: socketStat, section: 'base' });
    if (isRunewordItem(def) && !hasSocketables) {
      rows.push(
        ...formatRunewordSocketFillerLines(def).map((text) => ({
          kind: /** @type {const} */ ('text'),
          text,
          section: /** @type {const} */ ('mod'),
        }))
      );
    }
    pushShrineRows();
    return withExtras();
  }
  for (const stat of getRollableStats(def, rolls, { className })) {
    const section = stat.key === 'sockets' ? 'base' : 'mod';
    rows.push({ kind: 'roll', stat, section });
  }
  pushShrineRows();
  return withExtras();
}
