/**
 * @file Mystic orb display helpers for tooltips and item inspector.
 * @module items/mystic-orbs
 */

import { isHandWeapon, isQuiverItem, isShieldItem } from '@/items/item-types.js';

/**
 * @typedef {[number, string]} MysticOrbEntry
 * @typedef {{
 *   name: string,
 *   aliases?: string[],
 *   modifiers?: string[],
 *   kind?: 'mo'|'umo'|'smo'|'effigy',
 *   slots?: 'all'|'weapon'|'armor'|'jewelry',
 *   maxStacks?: number,
 *   restrictToSlot?: string,
 *   restrictToCategory?: string,
 *   requiresAngelic?: boolean,
 *   reqLevelPerStack?: number,
 * }} MysticOrbCatalogRow
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
      if (row.slots === 'all' || row.slots === 'weapon' || row.slots === 'armor' || row.slots === 'jewelry') {
        entry.slots = row.slots;
      }
      const maxStacks = Math.floor(Number(row.maxStacks));
      if (Number.isFinite(maxStacks) && maxStacks > 0) entry.maxStacks = maxStacks;
      const restrictToSlot = row.restrictToSlot != null ? String(row.restrictToSlot).trim() : '';
      if (restrictToSlot) entry.restrictToSlot = restrictToSlot;
      const restrictToCategory = row.restrictToCategory != null ? String(row.restrictToCategory).trim() : '';
      if (restrictToCategory) entry.restrictToCategory = restrictToCategory;
      if (row.requiresAngelic === true) entry.requiresAngelic = true;
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
 * Whether this catalog orb can be applied to the given item.
 * @param {string|MysticOrbCatalogRow|null|undefined} orb
 * @param {object|null|undefined} def
 * @param {number} [currentCount]
 * @returns {boolean}
 */
export function canUseMysticOrbOnItem(orb, def, currentCount = 0) {
  const row = typeof orb === 'string' ? lookupMysticOrb(orb) : orb && typeof orb === 'object' ? orb : null;
  if (!row || !def) return false;
  const category = mysticOrbSlotCategory(def);
  if (!category) return false;
  if (row.slots && row.slots !== 'all' && row.slots !== category) return false;
  if (row.restrictToSlot && mysticOrbEquipSlot(def) !== String(row.restrictToSlot).toLowerCase()) {
    return false;
  }
  if (row.restrictToCategory === 'shield' && !isShieldItem(def)) return false;
  if (row.restrictToCategory === 'quiver' && !isQuiverItem(def)) return false;
  if (row.requiresAngelic && !isAngelicItem(def)) return false;
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
  const label = String(name || '').trim();
  if (/^mo\s*-/i.test(label)) return 4;
  return 10;
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
 * @returns {Array<{ label: string, name: string, kind: string, mods: string[] }>}
 */
export function formatMysticOrbRows(raw) {
  return normalizeMysticOrbs(raw).map(([count, name]) => ({
    label: formatMysticOrbLine(count, name),
    name,
    kind: mysticOrbKind(name),
    mods: getMysticOrbBonusLines(name, count),
  }));
}
