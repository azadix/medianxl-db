/**
 * @file Socketable (jewel / rune / gem) normalize, icon resolve, TSW parse.
 * @module items/socketables
 */

import { tswDescriptionColoredTexts } from '@/items/custom-items.js';
import { decodeModifierLine, encodeModifierLine } from '@/items/item-modifier-line.js';
import { isHandWeapon, isShieldItem } from '@/items/item-types.js';

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
 * }} SocketableEntry
 */

/** @typedef {{ code?: string, name: string, type?: string, icon: string, weapon?: string|string[], armor?: string|string[], shield?: string|string[] }} SocketableCatalogRow */

/** @type {Map<string, SocketableCatalogRow>|null} */
let catalogByCode = null;
/** @type {Map<string, SocketableCatalogRow>|null} */
let catalogByName = null;

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
      for (const key of /** @type {const} */ (['weapon', 'armor', 'shield'])) {
        if (row[key] != null) entry[key] = row[key];
      }
      if (code) byCode.set(normKey(code), entry);
      byName.set(normKey(name), entry);
      const runeBase = name.replace(/\s+Rune$/i, '').trim();
      if (runeBase && runeBase !== name) byName.set(normKey(runeBase), entry);
    }
  }
  catalogByCode = byCode;
  catalogByName = byName;
}

/**
 * Whether a stem is a real item_icons webp key (inv*, orb_*, r-d-N, ogN, *-rune).
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
  return /^(inv|orb_|oil_)/i.test(s);
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

/**
 * Bonus lines this socketable grants in the host item.
 * Jewels use their own modifiers; runes/gems use catalog weapon/armor/shield.
 * @param {SocketableEntry|null|undefined} sock
 * @param {object|null|undefined} hostDef
 * @returns {string[]}
 */
export function getSocketableBonusLines(sock, hostDef) {
  if (!sock || typeof sock !== 'object') return [];
  const type = String(sock.type || '').toLowerCase();
  const isJewel = type === 'jewel' || type === 'jewl' || /^jew/i.test(String(sock.code || ''));
  if (isJewel) {
    if (!Array.isArray(sock.modifiers)) return [];
    return sock.modifiers
      .map((line) => decodeModifierLine(line).text.trim())
      .filter(Boolean);
  }
  const row = lookupCatalogRow(sock.code, sock.name);
  if (!row) return [];
  const slot = socketHostSlot(hostDef);
  return flattenSlotBonus(row[slot]);
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
    const skip = new Set(
      [name, sock.type, sock.quality]
        .map((s) => String(s || '').trim().toLowerCase())
        .filter(Boolean)
    );
    for (const line of tswDescriptionColoredTexts(sock.description_lines)) {
      const text = String(line.text || '').trim();
      if (!text) continue;
      if (skip.has(text.toLowerCase())) continue;
      if (isSocketableBoilerplate(text)) continue;
      const encoded = encodeModifierLine(text, line.color) || text;
      modifiers.push(encoded);
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
  const type = String(sock.type || '').toLowerCase();
  const isJewel = type === 'jewel' || type === 'jewl' || /^jew/i.test(String(sock.code || ''));
  if (isJewel) {
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
