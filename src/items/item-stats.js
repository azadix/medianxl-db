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
  defaultOverlayAffixRolls,
  formatOverlayBadge,
  getOverlayDetailStatRows,
  getOverlayRollableStats,
  getOverlayStatLines,
  isOverlayItem,
} from '@/items/item-overlays.js';
import { formatRunewordBadge, formatRunewordSocketFillerLines, isRunewordItem } from '@/items/runeword-items.js';
import { getShieldClassBlockPercent } from '@/character/class-baselines.js';
import { resolveItemRequirements } from '@/items/item-requirements.js';

/** @type {Readonly<Record<string, string>>} */
export const ITEM_CATEGORY_LABEL = Object.freeze({
  weapons: 'Weapon',
  armor: 'Armor',
  jewelry: 'Jewelry',
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
  if (rarity === 'crafted') return 'Crafted';
  if (rarity === 'rare') return 'Rare';
  if (rarity === 'magic') return 'Magic';
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
  if (isOverlayItem(def)) {
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
 * (Weapon "X to Y" damage is a damage range, not a base roll.)
 * Uniques/sets lock sockets at max and skip defense rolls (docs display used instead).
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

  if (
    !overlay &&
    def.defense &&
    Number.isFinite(def.defense.min) &&
    Number.isFinite(def.defense.max)
  ) {
    const rolled =
      rolls && Number.isFinite(rolls.defense)
        ? rolls.defense
        : defaultRollValue(def.defense.min, def.defense.max);
    out.push({
      key: 'defense',
      label: 'Defense',
      display: `Defense: ${rolled}`,
      displayParts: [
        { kind: 'text', text: 'Defense: ' },
        { kind: 'value', text: String(rolled) },
      ],
      min: def.defense.min,
      max: def.defense.max,
    });
  }

  if (def.sockets > 0 && !overlay) {
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
    // Lock sockets at max for uniques/sets/runewords
    if (def.sockets > 0) rolls.sockets = def.sockets;
    return { ...rolls, ...defaultOverlayAffixRolls(def) };
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
  /Innate\s+(Fire|Cold|Lightning|Poison|Magic|Physical|Shadow)\s+Damage/i;
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
});

/**
 * Basetype elemental damage (Fire, Cold, …) from `innate` / `adds`.
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function getItemDamageType(def) {
  if (!def || typeof def !== 'object') return '';
  const innate = INNATE_DAMAGE_TYPE_RE.exec(String(def.innate || ''));
  if (innate) return innate[1][0].toUpperCase() + innate[1].slice(1).toLowerCase();
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
  const typeWord = def.group || ITEM_CATEGORY_LABEL[def.category] || def.category || '';
  const left = [rarityWord, typeWord].filter(Boolean).join(' ').toUpperCase();
  const badge = formatItemRarityBadge(def);
  const skipBadge = !badge || /^(Unique|Set|RW|Crafted|Rare|Magic|Relic)$/i.test(badge);
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
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} [rolls]
 * @param {{
 *   hideRollableRanges?: boolean,
 *   characterLevel?: number|null,
 *   charmInInventory?: boolean,
 *   className?: string|null,
 *   charmHeaderOnly?: boolean,
 *   socketables?: Array<object>|null,
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

  if (def.damage1hDisplay) base.push(`One-Hand Damage: ${def.damage1hDisplay}`);
  else if (def.damage1h) base.push(`One-Hand Damage: ${def.damage1h.min} to ${def.damage1h.max}`);
  if (def.damage2hDisplay) base.push(`Two-Hand Damage: ${def.damage2hDisplay}`);
  else if (def.damage2h) base.push(`Two-Hand Damage: ${def.damage2h.min} to ${def.damage2h.max}`);
  if (def.throwDamageDisplay) base.push(`Throw Damage: ${def.throwDamageDisplay}`);

  if (def.defenseDisplay) {
    base.push(`Defense: ${def.defenseDisplay}`);
  } else if (def.defense) {
    const rolled = rolls && Number.isFinite(rolls.defense) ? rolls.defense : null;
    if (rollableKeys?.has('defense')) {
      // Roll controls shown elsewhere - skip static defense line.
    } else if (rolled != null) {
      base.push(`Defense: ${rolled}`);
    } else {
      base.push(`Defense: ${def.defense.min} to ${def.defense.max}`);
    }
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

  if (def.strDamageBonus != null) {
    scaling.push(`Strength Damage Bonus: (${def.strDamageBonus} per Strength)%`);
  }
  if (def.dexDamageBonus != null) {
    scaling.push(`Dexterity Damage Bonus: (${def.dexDamageBonus} per Dexterity)%`);
  }
  if (def.innate) scaling.push(String(def.innate));

  if (def.adds) {
    const adds = String(def.adds);
    const alreadyListed =
      overlay && Array.isArray(def.modifiers) && def.modifiers.some((mod) => String(mod) === adds);
    if (!alreadyListed) mods.push(adds);
  }
  if (!overlay && def.attackModifier) mods.push(String(def.attackModifier));
  if (def.sockets > 0) {
    const filled = rolls && Number.isFinite(rolls.sockets) ? rolls.sockets : null;
    if (rollableKeys?.has('sockets')) {
      // Roll controls shown elsewhere - skip static sockets line.
    } else if (overlay) {
      mods.push(`Socketed (${def.sockets})`);
    } else if (filled != null) {
      if (filled > 0) mods.push(`Socketed (${filled})`);
    } else {
      mods.push(`Socketed (${def.sockets})`);
    }
  }

  if (isCharmItem(def)) {
    mods.push(
      ...getCharmStatLines(def, options.characterLevel ?? null, {
        inInventory: options.charmInInventory !== false,
        rolls,
        className: options.className ?? null,
        hideRollableRanges,
        headerOnly: options.charmHeaderOnly === true,
      })
    );
  } else if (isRelicItem(def) && !options.charmHeaderOnly) {
    if (options.charmInInventory !== false) {
      mods.push(...getRelicStatLines(def, rolls, { hideRollableRanges }));
    }
  } else if (overlay && !options.charmHeaderOnly) {
    mods.push(...getOverlayStatLines(def, rolls, { hideRollableRanges }));
    if (isRunewordItem(def)) mods.push(...formatRunewordSocketFillerLines(def));
  }

  return {
    base,
    scaling,
    mods,
    requirements: resolveItemRequirements(def, {
      rolls,
      socketables: options.socketables ?? null,
    }),
  };
}

/**
 * Static + rolled stat lines for tooltips / detail panel (no requirements footer).
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} [rolls]
 * @param {{ hideRollableRanges?: boolean, characterLevel?: number|null, charmInInventory?: boolean, className?: string|null, charmHeaderOnly?: boolean, socketables?: Array<object>|null }} [options]
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
 * @param {{ characterLevel?: number|null, charmInInventory?: boolean, className?: string|null }} [options]
 * @returns {ItemDetailStatRow[]}
 */
export function getItemDetailStatRows(def, rolls = null, options = {}) {
  if (!def || typeof def !== 'object') return [];
  const className = options.className ?? null;
  const headerLines = getItemStatLines(def, rolls, {
    hideRollableRanges: true,
    characterLevel: options.characterLevel ?? null,
    charmInInventory: options.charmInInventory,
    className,
    charmHeaderOnly: true,
  });
  /** @type {ItemDetailStatRow[]} */
  const rows = headerLines.map((text) => ({ kind: /** @type {const} */ ('text'), text, section: /** @type {const} */ ('base') }));
  /**
   * @param {ItemDetailStatRow[]} extra
   * @returns {ItemDetailStatRow[]}
   */
  const asMod = (extra) => extra.map((row) => ({ ...row, section: row.section || 'mod' }));
  if (isCharmItem(def)) {
    rows.push(...asMod(getCharmDetailStatRows(def, rolls, className)));
    return rows;
  }
  if (isRelicItem(def)) {
    rows.push(...asMod(getRelicDetailStatRows(def, rolls)));
    return rows;
  }
  if (isOverlayItem(def)) {
    rows.push(...asMod(getOverlayDetailStatRows(def, rolls)));
    if (isRunewordItem(def)) {
      rows.push(
        ...formatRunewordSocketFillerLines(def).map((text) => ({
          kind: /** @type {const} */ ('text'),
          text,
          section: /** @type {const} */ ('mod'),
        }))
      );
    }
    return rows;
  }
  for (const stat of getRollableStats(def, rolls, { className })) {
    rows.push({ kind: 'roll', stat, section: 'mod' });
  }
  return rows;
}
