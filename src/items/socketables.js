/**
 * @file Socketable (jewel / rune / gem) normalize, icon resolve, TSW parse.
 * @module items/socketables
 */

import { tswDescriptionColoredTexts } from '@/items/custom-items.js';
import { decodeModifierLine, encodeModifierLine } from '@/items/item-modifier-line.js';
import { itemHasFixedSockets } from '@/items/item-overlays.js';
import { isHandWeapon, isShieldItem } from '@/items/item-types.js';
import {
  inferRandomElementFromLines,
  linesHaveRandomElementChoice,
  normalizeRandomElement,
  resolveRandomElementInLines,
} from '@/items/random-element.js';

/**
 * @typedef {{
 *   slot?: number,
 *   name: string,
 *   type?: string,
 *   quality?: string,
 *   code?: string,
 *   icon?: string,
 *   nameColor?: number,
 *   modifiers?: string[],
 *   reqLevel?: number,
 *   randomElement?: string,
 * }} SocketableEntry
 */

/** @typedef {{ code?: string, name: string, type?: string, quality?: string, icon: string, modifiers?: string[], reqLevel?: number, level?: number, weapon?: string|string[], armor?: string|string[], shield?: string|string[] }} SocketableCatalogRow */

/** @type {Map<string, SocketableCatalogRow>|null} */
let catalogByCode = null;
/** @type {Map<string, SocketableCatalogRow>|null} */
let catalogByName = null;
/** @type {SocketableCatalogRow[]} */
let catalogRows = [];

/**
 * @param {string|null|undefined} s
 * @returns {string}
 */
function normKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/**
 * Load socketables catalog maps (idempotent).
 * @param {Array<{ code?: string, name?: string, type?: string, icon?: string }>|null|undefined} rows
 */
export function loadSocketablesCatalog(rows) {
  /** @type {Map<string, SocketableCatalogRow>} */
  const byCode = new Map();
  /** @type {Map<string, SocketableCatalogRow>} */
  const byName = new Map();
  /** @type {SocketableCatalogRow[]} */
  const list = [];
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const name = String(row.name || '').trim();
      const icon = String(row.icon || '').trim();
      if (!name || !icon) continue;
      /** @type {SocketableCatalogRow} */
      const entry = { name, icon };
      const code = row.code != null ? String(row.code).trim() : '';
      if (code) entry.code = code;
      const type = row.type != null ? String(row.type).trim() : '';
      if (type) entry.type = type;
      const quality = row.quality != null ? String(row.quality).trim() : '';
      if (quality) entry.quality = quality;
      if (Array.isArray(row.modifiers)) {
        entry.modifiers = row.modifiers.map((line) => String(line || '').trim()).filter(Boolean);
      }
      const reqLevel = Math.floor(Number(row.reqLevel ?? row.level));
      if (Number.isFinite(reqLevel) && reqLevel > 0) entry.reqLevel = reqLevel;
      for (const key of /** @type {const} */ (['weapon', 'armor', 'shield'])) {
        if (row[key] != null) entry[key] = row[key];
      }
      if (code && !byCode.has(normKey(code))) byCode.set(normKey(code), entry);
      byName.set(normKey(name), entry);
      const runeBase = name.replace(/\s+Rune$/i, '').trim();
      if (runeBase && runeBase !== name) byName.set(normKey(runeBase), entry);
      list.push(entry);
    }
  }
  catalogByCode = byCode;
  catalogByName = byName;
  catalogRows = list;
}

/**
 * @returns {SocketableCatalogRow[]}
 */
export function listSocketablesCatalog() {
  return catalogRows.slice();
}

/**
 * Unique/set jewels that can be inserted into sockets (not relics or jewelry).
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isSocketableJewelItem(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.rarity === 'relic' || def.category === 'relics') return false;
  if (def.slot != null && def.slot !== '') return false;
  const type = String(def.type || '').toLowerCase();
  const baseType = String(def.baseType || '').toLowerCase();
  const baseName = String(def.baseName || '').toLowerCase();
  const jewelish =
    type === 'jewl' || type === 'jewel' || baseType === 'jewel' || baseName === 'jewel';
  if (!jewelish) return false;
  return def.rarity === 'unique' || def.rarity === 'set';
}

/**
 * @param {object|null|undefined} def
 * @returns {string[]}
 */
function jewelModifierLines(def) {
  if (!Array.isArray(def?.modifiers)) return [];
  return def.modifiers
    .map((line) => String(line || '').trim())
    .filter((line) => {
      const text = decodeModifierLine(line).text.trim();
      return text && !isSocketableBoilerplate(text);
    });
}

/**
 * Catalog row for a unique/set jewel item def.
 * @param {object|null|undefined} def
 * @returns {SocketableCatalogRow|null}
 */
export function jewelSocketableFromItem(def) {
  if (!isSocketableJewelItem(def)) return null;
  const name = String(def.name || '').trim();
  if (!name) return null;
  const quality = def.rarity === 'unique' ? 'Unique' : def.rarity === 'set' ? 'Set' : '';
  /** @type {SocketableCatalogRow} */
  const row = {
    name,
    type: 'Jewel',
    icon: String(def.icon || '').trim() || (quality === 'Unique' ? 'invjw6' : 'invjw1'),
    modifiers: jewelModifierLines(def),
  };
  if (quality) row.quality = quality;
  const reqLevel = Math.floor(Number(def.reqLevel));
  if (Number.isFinite(reqLevel) && reqLevel > 0) row.reqLevel = reqLevel;
  return row;
}

/**
 * Unique/set jewels from the item catalog, sorted by name.
 * @param {Array<object>|null|undefined} items
 * @returns {SocketableCatalogRow[]}
 */
export function listJewelSocketablesFromItems(items) {
  /** @type {SocketableCatalogRow[]} */
  const out = [];
  const seen = new Set();
  if (!Array.isArray(items)) return out;
  for (const def of items) {
    const row = jewelSocketableFromItem(def);
    if (!row) continue;
    const key = normKey(row.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Add unique/set jewels into the socketables catalog (for req-level / name lookup).
 * @param {Array<object>|null|undefined} items
 */
export function mergeJewelItemsIntoSocketablesCatalog(items) {
  if (!catalogByCode) catalogByCode = new Map();
  if (!catalogByName) catalogByName = new Map();
  for (const row of listJewelSocketablesFromItems(items)) {
    const key = normKey(row.name);
    if (catalogByName.has(key)) continue;
    catalogByName.set(key, row);
    catalogRows.push(row);
  }
}

/**
 * @param {SocketableCatalogRow|null|undefined} row
 * @param {number} [slot]
 * @returns {SocketableEntry|null}
 */
export function socketableFromCatalogRow(row, slot = 0) {
  if (!row || typeof row !== 'object') return null;
  const [entry] = normalizeSocketables([
    {
      name: row.name,
      type: row.type,
      quality: row.quality,
      code: row.code,
      icon: row.icon,
      modifiers: row.modifiers,
      reqLevel: row.reqLevel,
      slot: slot > 0 ? slot : undefined,
      randomElement: linesHaveRandomElementChoice(row.modifiers) ? 'fire' : undefined,
    },
  ]);
  return entry || null;
}

/**
 * Open sockets on this item (rolled count, locked overlay max, or 0).
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {number}
 */
export function getItemSocketCount(def, rolls = null) {
  const max = Math.max(0, Math.floor(Number(def?.sockets) || 0));
  if (max <= 0) return 0;
  if (itemHasFixedSockets(def)) return max;
  if (rolls && Number.isFinite(Number(rolls.sockets))) {
    return Math.max(0, Math.min(max, Math.floor(Number(rolls.sockets))));
  }
  return max;
}

/**
 * Keep the first `count` socket fillers (re-index slots from 1).
 * @param {unknown} raw
 * @param {number} count
 * @returns {SocketableEntry[]}
 */
export function trimSocketablesToCount(raw, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return normalizeSocketables(raw)
    .slice(0, n)
    .map((entry, i) => ({ ...entry, slot: i + 1 }));
}

/**
 * Whether a stem is a real item_icons webp key (inv*, xis*, orb_*, r-d-N, ogN, *-rune).
 * Rejects TSW leftovers like `jah` / `31` that would 404.
 * @param {string|null|undefined} image
 * @returns {boolean}
 */
export function isInventoryIconStem(image) {
  const s = String(image || '').trim();
  if (!s) return false;
  if (/^#/.test(s)) return false;
  if (/^r-[a-z]?-\d+$/i.test(s)) return true;
  if (/^(fire|phys|magic|pois|ltng|cold|ultra)-rune$/i.test(s)) return true;
  if (/^og\d+$/i.test(s)) return true;
  return /^(inv|xis|orb_|oil_|occultorb|greater_luck)/i.test(s);
}

/**
 * @param {string|null|undefined} name
 * @returns {string}
 */
function catalogNameKey(name) {
  return String(name || '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
}

/**
 * TSW sometimes sends `31` instead of `r31`.
 * @param {string|null|undefined} code
 * @returns {string}
 */
function catalogCodeKey(code) {
  const s = String(code || '').trim().toLowerCase();
  if (!s) return '';
  if (/^\d{1,2}$/.test(s)) return `r${s.padStart(2, '0')}`;
  return s;
}

/**
 * @param {string} name
 * @returns {string}
 */
function catalogIconFromName(name) {
  return lookupCatalogRow(null, name)?.icon || '';
}

/**
 * Catalog required level, preferring name so unique jewels sharing `jew` match correctly.
 * @param {string|null|undefined} name
 * @param {string|null|undefined} type
 * @param {string|null|undefined} code
 * @returns {number}
 */
function lookupCatalogReqLevel(name, type, code) {
  const cleaned = catalogNameKey(name);
  if (cleaned && catalogByName?.has(normKey(cleaned))) {
    const n = Math.floor(Number(catalogByName.get(normKey(cleaned))?.reqLevel));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const lowerType = String(type || '').toLowerCase();
  const isJewel = lowerType === 'jewel' || lowerType === 'jewl' || /^jew/i.test(String(code || ''));
  if (isJewel) return 0;
  const row = lookupCatalogRow(code, name);
  const n = Math.floor(Number(row?.reqLevel));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {string|null|undefined} code
 * @param {string|null|undefined} name
 * @returns {SocketableCatalogRow|null}
 */
function lookupCatalogRow(code, name) {
  const codeKey = catalogCodeKey(code);
  if (codeKey && catalogByCode?.has(codeKey)) return catalogByCode.get(codeKey) || null;
  const cleaned = catalogNameKey(name);
  if (cleaned && catalogByName?.has(normKey(cleaned))) return catalogByName.get(normKey(cleaned)) || null;
  const runeBase = cleaned.replace(/\s+Rune$/i, '').trim();
  if (runeBase && catalogByName?.has(normKey(runeBase))) return catalogByName.get(normKey(runeBase)) || null;
  return null;
}

/**
 * @param {string|string[]|null|undefined} value
 * @returns {string[]}
 */
function flattenSlotBonus(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  const s = String(value || '').trim();
  return s ? [s] : [];
}

/**
 * Host item slot used by gem/rune socket bonuses.
 * @param {object|null|undefined} def
 * @returns {'weapon'|'shield'|'armor'}
 */
export function socketHostSlot(def) {
  if (isShieldItem(def)) return 'shield';
  if (isHandWeapon(def)) return 'weapon';
  return 'armor';
}

export const CUSTOM_JEWEL_RARITIES = Object.freeze(['magic', 'rare', 'crafted']);

/**
 * @param {string|null|undefined} value
 * @returns {'magic'|'rare'|'crafted'}
 */
export function normalizeCustomJewelRarity(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'magic' || key === 'rare' || key === 'crafted') return key;
  return 'rare';
}

/**
 * @param {{ type?: string, code?: string }|null|undefined} sock
 * @returns {boolean}
 */
function isJewelSocketable(sock) {
  const type = String(sock?.type || '').toLowerCase();
  return (
    type === 'jewel' ||
    type === 'jewl' ||
    type === 'customjewel' ||
    /^jew/i.test(String(sock?.code || ''))
  );
}

/**
 * Bonus lines this socketable grants in the host item.
 * Jewels use their own modifiers; runes/gems use catalog weapon/armor/shield.
 * @param {SocketableEntry|null|undefined} sock
 * @param {object|null|undefined} hostDef
 * @returns {string[]}
 */
export function getSocketableBonusLines(sock, hostDef) {
  if (!sock || typeof sock !== 'object') return [];
  /** @type {string[]} */
  let lines = [];
  if (isJewelSocketable(sock)) {
    if (Array.isArray(sock.modifiers)) {
      lines = sock.modifiers.map((line) => decodeModifierLine(line).text.trim()).filter(Boolean);
    }
  } else {
    const row = lookupCatalogRow(sock.code, sock.name);
    if (!row) return [];
    const slot = socketHostSlot(hostDef);
    lines = flattenSlotBonus(row[slot]);
  }
  if (!socketableHasRandomElementChoice(sock, lines)) return lines;
  const element =
    normalizeRandomElement(sock.randomElement) || inferRandomElementFromLines(lines) || 'fire';
  return resolveRandomElementInLines(lines, element, { rewriteResolvedMax: true });
}

/**
 * @param {SocketableEntry|null|undefined} sock
 * @param {string[]} [lines]
 * @returns {boolean}
 */
export function socketableHasRandomElementChoice(sock, lines) {
  if (!sock || typeof sock !== 'object') return false;
  if (normalizeRandomElement(sock.randomElement)) return true;
  if (linesHaveRandomElementChoice(sock.modifiers)) return true;
  if (linesHaveRandomElementChoice(lines)) return true;
  const byName = catalogByName?.get(normKey(sock.name)) || null;
  const row = byName || lookupCatalogRow(sock.code, sock.name);
  return linesHaveRandomElementChoice(row?.modifiers);
}

const ELEMENTAL_RUNE_NAMES = new Set(['fire', 'stone', 'arcane', 'poison', 'light', 'ice']);

/**
 * Socket picker chip group for a catalog row.
 * Enhanced runes are Ol–Xod (`rx*`). Elemental runes are Fire, Stone, Arcane, Poison, Light, Ice.
 * @param {{ type?: string, name?: string, code?: string }|null|undefined} row
 * @returns {'Gem'|'Rune'|'Enhanced'|'Elemental'|'Jewel'}
 */
export function socketableLibraryGroup(row) {
  const type = String(row?.type || '');
  if (/gem/i.test(type)) return 'Gem';
  if (!/rune/i.test(type)) return 'Jewel';
  const code = String(row?.code || '').trim().toLowerCase();
  if (/^rx\d+/i.test(code)) return 'Enhanced';
  const base = String(row?.name || '')
    .replace(/\s+Rune$/i, '')
    .trim()
    .toLowerCase();
  if (ELEMENTAL_RUNE_NAMES.has(base)) return 'Elemental';
  return 'Rune';
}

/**
 * Heuristic icon stems for a rune name (without "Rune" suffix).
 * @param {string} runeName
 * @returns {string[]}
 */
export function runeIconCandidates(runeName) {
  const base = String(runeName || '')
    .replace(/\s+Rune$/i, '')
    .trim();
  if (!base) return [];
  const lower = base.toLowerCase();
  const titled = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
  /** @type {string[]} */
  const out = [];
  const push = (s) => {
    if (s && !out.includes(s)) out.push(s);
  };
  push(`invr${titled}`);
  push(`invr${base}`);
  push(`invr${lower}`);
  push(`invr${lower}c`);
  push(`invr${titled}c`);
  return out;
}

/**
 * Resolve inventory icon stem for a socketable.
 * @param {{
 *   code?: string|null,
 *   name?: string|null,
 *   image?: string|null,
 *   icon?: string|null,
 *   type?: string|null,
 *   quality?: string|null,
 * }} info
 * @returns {string}
 */
export function resolveSocketableIcon(info) {
  if (!info || typeof info !== 'object') return '';
  const name = String(info.name || '').trim();
  const type = String(info.type || '').trim().toLowerCase();
  const image = String(info.image || '').trim();
  const explicit = String(info.icon || '').trim();
  const code = catalogCodeKey(info.code);
  const parenCode = String(name).match(/\((\d{1,2})\)\s*$/);
  const codeFromName = parenCode ? catalogCodeKey(parenCode[1]) : '';

  const isJewel = type === 'jewel' || type === 'jewl' || /^jew/i.test(String(info.code || ''));
  if (isJewel) {
    if (isInventoryIconStem(image)) return image;
    const quality = String(info.quality || '').toLowerCase();
    if (quality === 'unique') return 'invjw6';
    if (quality === 'rare') return 'invjw5';
    if (quality === 'magic') return 'invjw2';
    if (code && catalogByCode?.has(code)) return catalogByCode.get(code)?.icon || 'invjw1';
    return 'invjw1';
  }

  // Catalog before persisted/guessed stems. `invrJah` 404s; game file is `invrJo`.
  if (code && catalogByCode?.has(code) && !(code === 'jew' && info.quality)) {
    const fromCode = catalogByCode.get(code)?.icon || '';
    if (fromCode) return fromCode;
  }
  if (codeFromName && catalogByCode?.has(codeFromName)) {
    const fromHint = catalogByCode.get(codeFromName)?.icon || '';
    if (fromHint) return fromHint;
  }
  const fromName = catalogIconFromName(name);
  if (fromName) return fromName;

  if (isInventoryIconStem(image)) return image;
  if (isInventoryIconStem(explicit)) return explicit;

  if (type === 'rune' || /\brune\b/i.test(name)) {
    const candidates = runeIconCandidates(catalogNameKey(name));
    for (const c of candidates) {
      if (catalogByName?.has(normKey(c))) return catalogByName.get(normKey(c))?.icon || c;
    }
    return '';
  }
  if (type === 'gem' || /\b(gem|amethyst|diamond|ruby|topaz|sapphire|emerald|onyx|amber|turquoise|bloodstone|skull|rainbow)\b/i.test(name)) {
    return image && isInventoryIconStem(image) ? image : '';
  }
  return '';
}

/**
 * @param {unknown} raw
 * @returns {SocketableEntry[]}
 */
export function normalizeSocketables(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {SocketableEntry[]} */
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (row);
    const name = String(rec.name || '').trim();
    if (!name) continue;
    /** @type {SocketableEntry} */
    const entry = { name };
    const slot = Math.floor(Number(rec.slot));
    if (Number.isFinite(slot) && slot > 0) entry.slot = slot;
    const type = rec.type != null ? String(rec.type).trim() : '';
    if (type) entry.type = type;
    const quality = rec.quality != null ? String(rec.quality).trim() : '';
    if (quality) entry.quality = quality;
    const code = rec.code != null ? String(rec.code).trim() : '';
    if (code) entry.code = code;
    const nameColor = Math.floor(Number(rec.nameColor ?? rec.name_color));
    if (Number.isFinite(nameColor)) entry.nameColor = nameColor;
    /** @type {string[]} */
    let modifiers = [];
    if (Array.isArray(rec.modifiers)) {
      modifiers = rec.modifiers.map((m) => String(m || '').trim()).filter(Boolean);
    }
    if (modifiers.length) entry.modifiers = modifiers;
    let reqLevel = Math.floor(Number(rec.reqLevel));
    if (!Number.isFinite(reqLevel) || reqLevel <= 0) {
      const catalog = lookupCatalogReqLevel(name, type, code);
      if (catalog > 0) reqLevel = catalog;
    }
    if (Number.isFinite(reqLevel) && reqLevel > 0) entry.reqLevel = reqLevel;
    const randomElement = normalizeRandomElement(rec.randomElement);
    if (randomElement) entry.randomElement = randomElement;
    const icon = resolveSocketableIcon({
      code,
      name,
      image: rec.image != null ? String(rec.image) : null,
      icon: rec.icon != null ? String(rec.icon) : null,
      type,
      quality,
    });
    if (icon) entry.icon = icon;
    out.push(entry);
  }
  out.sort((a, b) => (a.slot || 0) - (b.slot || 0) || a.name.localeCompare(b.name));
  return out;
}

/**
 * Skip boilerplate lines when pulling modifiers from a socketable description.
 * @param {string} text
 * @returns {boolean}
 */
function isSocketableBoilerplate(text) {
  return /^(Required |Can be Inserted|Already Upgraded|Socketed \(|Item Level|Quality Level|Jewel|Rune|Gem|Perfect |Flawless |Flawed |Chipped )/i.test(
    text
  );
}

/**
 * Parse TSW `socketables[]` into planner SocketableEntry list.
 * @param {object|null|undefined} row
 * @returns {SocketableEntry[]}
 */
export function parseTswSocketables(row) {
  const socks = Array.isArray(row?.socketables) ? row.socketables : [];
  /** @type {SocketableEntry[]} */
  const raw = [];
  for (const sock of socks) {
    if (!sock || typeof sock !== 'object') continue;
    const name = String(sock.name || '').trim();
    if (!name) continue;
    /** @type {string[]} */
    const modifiers = [];
    let reqLevel = 0;
    const skip = new Set(
      [name, sock.type, sock.quality]
        .map((s) => String(s || '').trim().toLowerCase())
        .filter(Boolean)
    );
    for (const line of tswDescriptionColoredTexts(sock.description_lines)) {
      const text = String(line.text || '').trim();
      if (!text) continue;
      if (skip.has(text.toLowerCase())) continue;
      const reqMatch = /^Required Level:\s*(-?\d+)\s*$/i.exec(text);
      if (reqMatch) {
        const n = Math.floor(Number(reqMatch[1]));
        if (Number.isFinite(n) && n > 0) reqLevel = n;
        continue;
      }
      if (isSocketableBoilerplate(text)) continue;
      const encoded = encodeModifierLine(text, line.color) || text;
      modifiers.push(encoded);
    }
    const catalogByJewelName = catalogByName?.get(normKey(name)) || null;
    const catalog = catalogByJewelName || lookupCatalogRow(sock.code, name);
    /** @type {string|undefined} */
    let randomElement;
    if (linesHaveRandomElementChoice(modifiers) || linesHaveRandomElementChoice(catalog?.modifiers)) {
      randomElement = inferRandomElementFromLines(modifiers) || 'fire';
    }
    raw.push({
      slot: sock.slot,
      name,
      type: sock.type,
      quality: sock.quality,
      code: sock.code,
      image: sock.image,
      name_color: sock.name_color,
      nameColor: sock.name_color,
      modifiers,
      reqLevel: reqLevel > 0 ? reqLevel : undefined,
      randomElement,
    });
  }
  return normalizeSocketables(raw);
}

/**
 * CSS class for socketable name color (TSW name_color / quality).
 * @param {SocketableEntry|null|undefined} sock
 * @returns {string}
 */
export function socketableNameCssClass(sock) {
  if (!sock) return '';
  if (isJewelSocketable(sock)) {
    const quality = String(sock.quality || '').toLowerCase();
    if (quality === 'unique') return 'item-tooltip-sock__name--unique';
    if (quality === 'rare') return 'item-tooltip-sock__name--rare';
    if (quality === 'crafted') return 'item-tooltip-sock__name--crafted';
    if (quality === 'magic') return 'item-tooltip-sock__name--magic';
    if (quality === 'set') return 'item-tooltip-sock__name--set';
    const code = sock.nameColor;
    if (code === 3) return 'item-tooltip-sock__name--magic';
    if (code === 9) return 'item-tooltip-sock__name--rare';
    if (code === 8) return 'item-tooltip-sock__name--crafted';
    if (code === 4 || code === 7) return 'item-tooltip-sock__name--unique';
    if (code === 2) return 'item-tooltip-sock__name--set';
    return '';
  }
  return 'item-tooltip-sock__name--rune';
}
