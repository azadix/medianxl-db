/**
 * @file Mystic orb display helpers for tooltips and item inspector.
 * @module items/mystic-orbs
 */

import { isUniqueItem } from '@/items/item-overlays.js';
import {
  isBowOrCrossbow,
  isHandWeapon,
  isQuiverItem,
  isShieldItem,
  isTwoHandedWeapon,
} from '@/items/item-types.js';
import { itemHasInnateElemental } from '@/items/oils.js';
import { isRunewordItem } from '@/items/runeword-items.js';

/**
 * @typedef {[number, string]} MysticOrbEntry
 * @typedef {{
 *   name: string,
 *   aliases?: string[],
 *   modifiers?: string[],
 *   kind?: 'mo'|'umo'|'smo'|'effigy',
 *   slots?: 'all'|'weapon'|'armor'|'jewelry'|'gear',
 *   maxStacks?: number,
 *   restrictToSlot?: string,
 *   restrictToCategory?: string,
 *   requiresAngelic?: boolean,
 *   requiresUnique?: boolean,
 *   requiresMagic?: boolean,
 *   requiresCrafted?: boolean,
 *   requiresShrine?: boolean,
 *   requiresOneHanded?: boolean,
 *   notOnRunewords?: boolean,
 *   forbidMaxColdResist?: boolean,
 *   baseKind?: string,
 *   minLifeLeech?: number,
 *   minHostReqLevel?: number,
 *   reqLevelPerStack?: number,
 *   setsEthereal?: boolean,
 * }} MysticOrbCatalogRow
 * @typedef {{
 *   shrine?: string|null,
 *   blessing?: string|null,
 *   extras?: string[]|null,
 * }} MysticOrbHostState
 */

/** @type {Map<string, MysticOrbCatalogRow>|null} */
let catalogByName = null;
/** @type {MysticOrbCatalogRow[]} */
let catalogRows = [];

/**
 * @param {string|null|undefined} s
 * @returns {string}
 */
function normKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @param {Array<MysticOrbCatalogRow>|null|undefined} rows
 */
export function loadMysticOrbsCatalog(rows) {
  /** @type {Map<string, MysticOrbCatalogRow>} */
  const byName = new Map();
  /** @type {MysticOrbCatalogRow[]} */
  const list = [];
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const name = String(row.name || '').trim();
      if (!name) continue;
      /** @type {MysticOrbCatalogRow} */
      const entry = {
        name,
        modifiers: Array.isArray(row.modifiers)
          ? row.modifiers.map((line) => String(line || '').trim()).filter(Boolean)
          : [],
      };
      const aliases = Array.isArray(row.aliases)
        ? row.aliases.map((a) => String(a || '').trim()).filter(Boolean)
        : [];
      if (aliases.length) entry.aliases = aliases;
      if (row.kind === 'mo' || row.kind === 'umo' || row.kind === 'smo' || row.kind === 'effigy') {
        entry.kind = row.kind;
      }
      if (
        row.slots === 'all' ||
        row.slots === 'weapon' ||
        row.slots === 'armor' ||
        row.slots === 'jewelry' ||
        row.slots === 'gear'
      ) {
        entry.slots = row.slots;
      }
      const maxStacks = Math.floor(Number(row.maxStacks));
      if (Number.isFinite(maxStacks) && maxStacks > 0) entry.maxStacks = maxStacks;
      const restrictToSlot = row.restrictToSlot != null ? String(row.restrictToSlot).trim() : '';
      if (restrictToSlot) entry.restrictToSlot = restrictToSlot;
      const restrictToCategory = row.restrictToCategory != null ? String(row.restrictToCategory).trim() : '';
      if (restrictToCategory) entry.restrictToCategory = restrictToCategory;
      if (row.requiresAngelic === true) entry.requiresAngelic = true;
      if (row.requiresUnique === true) entry.requiresUnique = true;
      if (row.requiresMagic === true) entry.requiresMagic = true;
      if (row.requiresCrafted === true) entry.requiresCrafted = true;
      if (row.requiresShrine === true) entry.requiresShrine = true;
      if (row.requiresOneHanded === true) entry.requiresOneHanded = true;
      if (row.notOnRunewords === true) entry.notOnRunewords = true;
      if (row.forbidMaxColdResist === true) entry.forbidMaxColdResist = true;
      if (row.setsEthereal === true) entry.setsEthereal = true;
      const baseKind = row.baseKind != null ? String(row.baseKind).trim() : '';
      if (baseKind) entry.baseKind = baseKind;
      const minLifeLeech = Math.floor(Number(row.minLifeLeech));
      if (Number.isFinite(minLifeLeech) && minLifeLeech > 0) entry.minLifeLeech = minLifeLeech;
      const minHostReqLevel = Math.floor(Number(row.minHostReqLevel));
      if (Number.isFinite(minHostReqLevel) && minHostReqLevel > 0) {
        entry.minHostReqLevel = minHostReqLevel;
      }
      if (row.reqLevelPerStack != null && row.reqLevelPerStack !== '') {
        const reqLevelPerStack = Math.floor(Number(row.reqLevelPerStack));
        if (Number.isFinite(reqLevelPerStack)) entry.reqLevelPerStack = reqLevelPerStack;
      }
      byName.set(normKey(name), entry);
      for (const alias of aliases) byName.set(normKey(alias), entry);
      list.push(entry);
    }
  }
  catalogByName = byName;
  catalogRows = list;
}

/**
 * @returns {MysticOrbCatalogRow[]}
 */
export function listMysticOrbsCatalog() {
  return catalogRows.slice();
}

/**
 * @param {string|null|undefined} name
 * @returns {MysticOrbCatalogRow|null}
 */
export function lookupMysticOrb(name) {
  const key = normKey(name);
  if (!key || !catalogByName) return null;
  if (catalogByName.has(key)) return catalogByName.get(key) || null;
  const stripped = key.replace(/^the\s+/, '');
  if (stripped !== key && catalogByName.has(stripped)) return catalogByName.get(stripped) || null;
  return null;
}

/**
 * Scale per-orb modifier text by apply count. Leaves `level N` skill ids alone.
 * @param {string} line
 * @param {number} count
 * @returns {string}
 */
export function scaleMysticOrbModifierLine(line, count) {
  const text = String(line || '').trim();
  const n = Math.floor(Number(count));
  if (!text || !Number.isFinite(n) || n <= 1) return text;
  /** @type {string[]} */
  const locked = [];
  const unlocked = text.replace(/level\s+(\d+)/gi, (_, lvl) => {
    locked.push(lvl);
    return `level §LVL§`;
  });
  const scaled = unlocked.replace(/(-?\d+(?:\.\d+)?)/g, (_, num) => {
    const v = Number(num);
    if (!Number.isFinite(v)) return num;
    const product = v * n;
    return Number.isInteger(product) ? String(product) : String(Number(product.toFixed(4)));
  });
  let i = 0;
  return scaled.replace(/§LVL§/g, () => locked[i++] || '');
}

/**
 * Bonus lines this mystic orb grants (scaled by apply count).
 * @param {string|null|undefined} name
 * @param {number} [count]
 * @returns {string[]}
 */
export function getMysticOrbBonusLines(name, count = 1) {
  const row = lookupMysticOrb(name);
  if (!row) return [];
  const n = Math.floor(Number(count));
  const times = Number.isFinite(n) && n > 0 ? n : 1;
  return (row.modifiers || [])
    .map((line) => scaleMysticOrbModifierLine(line, times))
    .filter(Boolean);
}

/**
 * Signed required-level line (`+10 Required Level` / `-5 Required Level`).
 * @param {number} n
 * @returns {string}
 */
export function formatRequiredLevelBonusLine(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v === 0) return '';
  return v > 0 ? `+${v} Required Level` : `${v} Required Level`;
}

/**
 * Bonus lines plus per-stack required level (effigies list the delta on the row).
 * @param {string|null|undefined} name
 * @param {number} [count]
 * @returns {string[]}
 */
export function getMysticOrbDisplayLines(name, count = 1) {
  const lines = getMysticOrbBonusLines(name, count);
  if (mysticOrbKind(name) !== 'effigy') return lines;
  const n = Math.floor(Number(count));
  const times = Number.isFinite(n) && n > 0 ? n : 1;
  const reqLine = formatRequiredLevelBonusLine(mysticOrbReqLevelPerStack(name) * times);
  if (reqLine) lines.push(reqLine);
  return lines;
}

/**
 * Unique mystic orbs vs vendor / soulforged MOs.
 * @param {string|null|undefined} name
 * @returns {'unique'|'rare'|'normal'|'effigy'}
 */
export function mysticOrbKind(name) {
  const row = lookupMysticOrb(name);
  if (row?.kind === 'smo') return 'rare';
  if (row?.kind === 'mo') return 'normal';
  if (row?.kind === 'effigy') return 'effigy';
  if (row?.kind === 'umo') return 'unique';
  const label = String(name || '').trim();
  if (/^rare\s+mo\b/i.test(label)) return 'rare';
  if (/^mo\s*-/i.test(label)) return 'normal';
  return 'unique';
}

/**
 * Inventory icon stem for a mystic orb (slot-based DC6: orb_weap / orb_armo / orb_misc / orb_any).
 * @param {string|MysticOrbCatalogRow|null|undefined} orb
 * @returns {string}
 */
export function mysticOrbIcon(orb) {
  const row = typeof orb === 'string' ? lookupMysticOrb(orb) : orb && typeof orb === 'object' ? orb : null;
  if ((row?.kind || '') === 'effigy') return 'occultorb';
  const slots = row?.slots;
  if (slots === 'weapon') return 'orb_weap';
  if (slots === 'armor') return 'orb_armo';
  if (slots === 'jewelry') return 'orb_misc';
  return 'orb_any';
}

/**
 * CSS class for mystic orb name color.
 * @param {string|null|undefined} nameOrKind
 * @returns {string}
 */
export function mysticOrbNameCssClass(nameOrKind) {
  const kind =
    nameOrKind === 'unique' || nameOrKind === 'rare' || nameOrKind === 'normal'
      ? nameOrKind
      : mysticOrbKind(nameOrKind);
  if (kind === 'unique') return 'item-tooltip-sock__name--unique';
  if (kind === 'rare') return 'item-tooltip-sock__name--rare';
  return 'item-tooltip-sock__name--magic';
}

/**
 * Host slot group used by mystic orb restrictions.
 * @param {object|null|undefined} def
 * @returns {'weapon'|'armor'|'jewelry'|null}
 */
export function mysticOrbSlotCategory(def) {
  if (!def || typeof def !== 'object') return null;
  const slot = String(def.slot || '').toLowerCase();
  if (slot === 'ring' || slot === 'neck' || slot === 'rrin' || slot === 'lrin') return 'jewelry';
  if (def.category === 'jewelry' || def.category === 'quivers') return 'jewelry';
  if (isQuiverItem(def)) return 'jewelry';
  if (isHandWeapon(def)) return 'weapon';
  return 'armor';
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isAngelicItem(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.angelic === true) return true;
  const blob = [def.uniqueKind, def.rarity, def.quality, def.customQuality, def.name, def.baseName]
    .map((v) => String(v || ''))
    .join(' ');
  return /angelic/i.test(blob);
}

/**
 * Planner equipment slot for restrictToSlot (head / tors / glov / feet).
 * @param {object|null|undefined} def
 * @returns {string}
 */
function mysticOrbEquipSlot(def) {
  return String(def?.slot || '').toLowerCase();
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isRangedWeapon(def) {
  if (!isHandWeapon(def)) return false;
  if (isBowOrCrossbow(def)) return true;
  return /javelins|throwing/i.test(String(def.group || ''));
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isCraftedItem(def) {
  return String(def?.rarity || '') === 'crafted' || String(def?.customQuality || '') === 'crafted';
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isMagicItem(def) {
  return String(def?.rarity || '') === 'magic' || String(def?.customQuality || '') === 'magic';
}

/**
 * @param {object|null|undefined} def
 * @param {MysticOrbHostState|null|undefined} host
 * @returns {string}
 */
function mysticOrbHostHaystack(def, host = null) {
  const extras = Array.isArray(host?.extras) ? host.extras : [];
  return [
    def?.innate,
    ...(Array.isArray(def?.modifiers) ? def.modifiers : []),
    ...(Array.isArray(def?.uniqueStats) ? def.uniqueStats : []),
    ...(Array.isArray(def?.extras) ? def.extras : []),
    ...extras,
  ]
    .map((line) => String(line || ''))
    .join('\n');
}

/**
 * @param {object|null|undefined} def
 * @param {MysticOrbHostState|null|undefined} host
 * @returns {number}
 */
function itemLifeLeechPct(def, host = null) {
  const haystack = mysticOrbHostHaystack(def, host);
  let total = 0;
  const re = /([+-]?\d+(?:\.\d+)?)\s*%\s*(?:Life Stolen per Hit|Life Steal|Life Leech)/gi;
  let match = re.exec(haystack);
  while (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) total += n;
    match = re.exec(haystack);
  }
  return total;
}

/**
 * @param {MysticOrbCatalogRow} row
 * @param {'weapon'|'armor'|'jewelry'} category
 * @returns {boolean}
 */
function mysticOrbSlotsMatch(row, category) {
  if (!row.slots || row.slots === 'all') return true;
  if (row.slots === 'gear') return category === 'weapon' || category === 'armor';
  return row.slots === category;
}

/**
 * Whether this catalog orb can be applied to the given item.
 * @param {string|MysticOrbCatalogRow|null|undefined} orb
 * @param {object|null|undefined} def
 * @param {number} [currentCount]
 * @param {MysticOrbHostState|null|undefined} [host]
 * @returns {boolean}
 */
export function canUseMysticOrbOnItem(orb, def, currentCount = 0, host = null) {
  const row = typeof orb === 'string' ? lookupMysticOrb(orb) : orb && typeof orb === 'object' ? orb : null;
  if (!def) return false;
  if (!row || !row.name) return true;
  const category = mysticOrbSlotCategory(def);
  if (!category) return false;
  if (!mysticOrbSlotsMatch(row, category)) return false;
  if (row.restrictToSlot && mysticOrbEquipSlot(def) !== String(row.restrictToSlot).toLowerCase()) {
    return false;
  }
  if (row.restrictToCategory === 'shield' && !isShieldItem(def)) return false;
  if (row.restrictToCategory === 'quiver' && !isQuiverItem(def)) return false;
  if (row.restrictToCategory === 'jewelry' && (category !== 'jewelry' || isQuiverItem(def))) {
    return false;
  }
  if (row.requiresAngelic && !isAngelicItem(def)) return false;
  if (row.requiresUnique && !isUniqueItem(def)) return false;
  if (row.requiresMagic && !isMagicItem(def)) return false;
  if (row.requiresCrafted && !isCraftedItem(def)) return false;
  if (row.notOnRunewords && isRunewordItem(def)) return false;
  if (row.requiresShrine) {
    const shrine = String(host?.shrine || def.shrine || '').trim();
    if (!shrine) return false;
  }
  if (row.requiresOneHanded && (!isHandWeapon(def) || isTwoHandedWeapon(def))) return false;
  if (row.minLifeLeech && itemLifeLeechPct(def, host) < row.minLifeLeech) return false;
  if (row.forbidMaxColdResist && /Maximum Cold Resist/i.test(mysticOrbHostHaystack(def, host))) {
    return false;
  }
  if (row.baseKind === 'elemental_ranged') {
    if (!itemHasInnateElemental(def) || !isRangedWeapon(def)) return false;
  }
  if (row.baseKind === 'elemental_melee') {
    if (!itemHasInnateElemental(def) || !isHandWeapon(def) || isRangedWeapon(def)) return false;
  }
  const max = Number.isFinite(row.maxStacks) ? Number(row.maxStacks) : 5;
  const have = Math.max(0, Math.floor(Number(currentCount) || 0));
  if (have >= max) return false;
  return true;
}

/**
 * @param {string|null|undefined} name
 * @returns {number}
 */
export function mysticOrbMaxStacks(name) {
  const row = lookupMysticOrb(name);
  const max = Number(row?.maxStacks);
  return Number.isFinite(max) && max > 0 ? max : 5;
}

/**
 * Required-level added per applied stack (generic MO 4, unique/rare 10).
 * @param {string|null|undefined} name
 * @returns {number}
 */
export function mysticOrbReqLevelPerStack(name) {
  const row = lookupMysticOrb(name);
  if (row?.reqLevelPerStack != null && row.reqLevelPerStack !== '') {
    const explicit = Math.floor(Number(row.reqLevelPerStack));
    if (Number.isFinite(explicit)) return explicit;
  }
  if (row?.kind === 'mo') return 4;
  if (row?.kind === 'umo' || row?.kind === 'smo') return 10;
  if (row?.kind === 'effigy') return 0;
  const label = String(name || '').trim();
  if (/^mo\s*-/i.test(label)) return 4;
  return 10;
}

const BECOMES_ETHEREAL_RE = /item becomes ethereal/i;

/**
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
export function mysticOrbSetsEthereal(name) {
  const row = lookupMysticOrb(name);
  if (!row) return false;
  if (row.setsEthereal === true) return true;
  return (row.modifiers || []).some((line) => BECOMES_ETHEREAL_RE.test(line));
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function mysticOrbsSetEthereal(raw) {
  return normalizeMysticOrbs(raw).some(([, name]) => mysticOrbSetsEthereal(name));
}

/**
 * Total +Required Level from applied mystic orb stacks.
 * @param {unknown} raw
 * @returns {number}
 */
export function mysticOrbsRequiredLevelBonus(raw) {
  let total = 0;
  for (const [count, name] of normalizeMysticOrbs(raw)) {
    total += mysticOrbReqLevelPerStack(name) * count;
  }
  return total;
}

/**
 * @param {unknown} raw
 * @returns {MysticOrbEntry[]}
 */
export function normalizeMysticOrbs(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {MysticOrbEntry[]} */
  const out = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const count = Math.floor(Number(entry[0]));
    const name = String(entry[1] ?? '').trim();
    if (!Number.isFinite(count) || count < 1 || !name) continue;
    out.push([count, name]);
  }
  return out;
}

/**
 * @param {number} count
 * @param {string} name
 * @returns {string}
 */
export function formatMysticOrbLine(count, name) {
  const n = Math.floor(Number(count));
  const label = String(name || '').trim();
  if (!label) return '';
  if (!Number.isFinite(n) || n < 1) return label;
  return `${n}x ${label}`;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function formatMysticOrbLines(raw) {
  return normalizeMysticOrbs(raw)
    .map(([count, name]) => formatMysticOrbLine(count, name))
    .filter(Boolean);
}

/**
 * @param {unknown} raw
 * @returns {Array<{ label: string, name: string, kind: string, icon: string, mods: string[] }>}
 */
export function formatMysticOrbRows(raw) {
  return normalizeMysticOrbs(raw).map(([count, name]) => ({
    label: formatMysticOrbLine(count, name),
    name,
    kind: mysticOrbKind(name),
    icon: mysticOrbIcon(name),
    mods: getMysticOrbDisplayLines(name, count),
  }));
}
