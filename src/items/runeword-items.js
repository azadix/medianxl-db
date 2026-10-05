/**
 * @file Runeword overlay helpers — allowed types, bases, merge, recipe display.
 * @module items/runeword-items
 */

import { resolveItemDef } from '@/items/item-overlays.js';
import { extractInnateFromModifiers, slugify } from '@/items/unique-stats-catalog.js';

export const EMPTY_JEWEL_ID = 'jew';

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isRunewordItem(def) {
  if (!def || typeof def !== 'object') return false;
  return def.rarity === 'runeword';
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isRunewordTemplate(def) {
  return isRunewordItem(def) && !def.baseId;
}

/**
 * Format rune recipe for badges / tooltips.
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function formatRunewordRecipe(def) {
  if (!isRunewordItem(def)) return '';
  if (Array.isArray(def.runes) && def.runes.length) return def.runes.join(' + ');
  if (def.runeCode) return String(def.runeCode);
  return 'RW';
}

/**
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function formatRunewordBadge(def) {
  if (!isRunewordItem(def)) return '';
  const recipe = formatRunewordRecipe(def);
  if (recipe) return `RW ${recipe}`;
  return 'RW';
}

/**
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function baseNameWithoutTier(name) {
  return String(name || '')
    .replace(/\s*\((?:Sacred|\d)\)\s*$/i, '')
    .trim();
}

/**
 * @param {object|null|undefined} base
 * @returns {number}
 */
export function runewordBaseSortRank(base) {
  const name = String(base?.name || '');
  if (/\(Sacred\)\s*$/i.test(name)) return 50;
  const tier = /\((\d)\)\s*$/.exec(name);
  if (tier) return Number(tier[1]) * 10;
  return 0;
}

/**
 * @param {string} type
 * @param {object} base
 * @returns {boolean}
 */
export function wikiTypeMatchesBase(type, base) {
  if (!base || typeof base !== 'object') return false;
  const wikiType = String(type || '').trim();
  if (!wikiType) return false;
  if (wikiType === 'Weapons') return base.category === 'weapons';
  if (wikiType === 'Helms') {
    const group = String(base.group || '');
    return /helm/i.test(group) && !/circlet/i.test(group);
  }
  if (wikiType === 'Shields') return /shield/i.test(String(base.group || ''));
  if (wikiType === 'Gloves') return base.slot === 'glov';
  if (wikiType === 'Boots') return base.slot === 'feet';
  return base.group === wikiType;
}

/**
 * @param {object} template
 * @param {object} base
 * @returns {boolean}
 */
export function runewordTemplateAllowsBase(template, base) {
  if (!template || !base || base.rarity !== 'normal') return false;
  const allowed = Array.isArray(template.allowedTypes) ? template.allowedTypes : [];
  if (!allowed.length) return false;
  if (!allowed.some((type) => wikiTypeMatchesBase(type, base))) return false;
  const excludedTypes = Array.isArray(template.excludedTypes) ? template.excludedTypes : [];
  if (excludedTypes.some((type) => wikiTypeMatchesBase(type, base))) return false;
  const excludedNames = Array.isArray(template.excludedNames) ? template.excludedNames : [];
  if (!excludedNames.length) return true;
  const core = baseNameWithoutTier(base.name).toLowerCase();
  return !excludedNames.some((name) => String(name || '').trim().toLowerCase() === core);
}

/**
 * Grey socketed bases that can hold this runeword.
 * @param {object|null|undefined} template
 * @param {Record<string, object>|object[]|null|undefined} catalog
 * @param {{
 *   equipSlot?: string|null,
 *   className?: string|null,
 *   canEquipInSlot?: (def: object, slot: string, className?: string|null) => boolean,
 * }} [options]
 * @returns {object[]}
 */
export function listEligibleRunewordBases(template, catalog, options = {}) {
  if (!isRunewordItem(template)) return [];
  const list = Array.isArray(catalog)
    ? catalog
    : catalog && typeof catalog === 'object'
      ? Object.values(catalog)
      : [];
  const runeCount = Array.isArray(template.runes) ? template.runes.length : 0;
  const equipSlot = options.equipSlot != null ? String(options.equipSlot) : '';
  const canEquipInSlot = options.canEquipInSlot;
  return list
    .filter((base) => {
      if (!runewordTemplateAllowsBase(template, base)) return false;
      const sockets = Number(base.sockets) || 0;
      if (sockets < runeCount) return false;
      if (equipSlot && typeof canEquipInSlot === 'function') {
        return canEquipInSlot(base, equipSlot, options.className);
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      const rank = runewordBaseSortRank(b) - runewordBaseSortRank(a);
      if (rank) return rank;
      return String(a.name || '').localeCompare(String(b.name || ''), 'en');
    });
}

/**
 * Whether a runeword can be equipped in the given equipment slot for this class,
 * based on allowed types matching catalog bases that fit the slot.
 * @param {object|null|undefined} def
 * @param {string} equipSlot
 * @param {Record<string, object>|object[]|null|undefined} catalog
 * @param {string|null|undefined} [className]
 * @param {(def: object, slot: string, className?: string|null) => boolean} canEquipInSlot
 * @returns {boolean}
 */
export function runewordFitsEquipSlot(def, equipSlot, catalog, className, canEquipInSlot) {
  if (!isRunewordItem(def)) return false;
  if (def.slot != null && typeof canEquipInSlot === 'function') {
    return canEquipInSlot(def, equipSlot, className);
  }
  return listEligibleRunewordBases(def, catalog, { equipSlot, className, canEquipInSlot }).length > 0;
}

/**
 * @param {string} templateId
 * @param {string} baseId
 * @returns {string}
 */
export function mergedRunewordId(templateId, baseId) {
  return `${templateId}:${baseId}`;
}

/**
 * @param {string|null|undefined} defId
 * @returns {{ templateId: string, baseId: string, id: string }|null}
 */
export function parseRunewordInstanceId(defId) {
  const id = String(defId || '');
  const match = /^(rw:[^:]+):(.+)$/.exec(id);
  if (!match) return null;
  return { templateId: match[1], baseId: match[2], id };
}

/**
 * Merge a runeword template with a chosen grey base.
 * @param {object|null|undefined} template
 * @param {object|null|undefined} base
 * @returns {object|null}
 */
export function mergeRunewordWithBase(template, base) {
  if (!isRunewordItem(template) || !base?.id) return null;
  const overlay = {
    ...template,
    id: mergedRunewordId(template.id, base.id),
    uniqueKind: 'runeword',
    baseId: base.id,
    baseName: base.name,
    sockets: undefined,
    icon: '',
    type: undefined,
    category: undefined,
    slot: undefined,
    invWidth: undefined,
    invHeight: undefined,
  };
  const merged = resolveItemDef(base, overlay);
  if (!merged) return null;
  merged.uniqueKind = 'runeword';
  merged.rarity = 'runeword';
  merged.runes = Array.isArray(template.runes) ? [...template.runes] : [];
  merged.runeCode = template.runeCode;
  merged.runewordLevel = template.reqLevel;
  merged.sockets = Number(base.sockets) || 0;
  merged.icon = base.icon;
  merged.reqLevel = Math.max(Number(template.reqLevel) || 0, Number(base.reqLevel) || 0);
  if (template.classRestriction) merged.classRestriction = template.classRestriction;
  return merged;
}

/**
 * Jewel fillers first, then runes.
 * @param {object|null|undefined} def
 * @returns {string[]}
 */
export function getRunewordSocketFillers(def) {
  if (!isRunewordItem(def)) return [];
  const sockets = Number(def.sockets) || 0;
  const runes = Array.isArray(def.runes) ? def.runes.map(String) : [];
  const jewels = Math.max(0, sockets - runes.length);
  return [...Array.from({ length: jewels }, () => EMPTY_JEWEL_ID), ...runes];
}

/**
 * @param {string} fillerId
 * @returns {string}
 */
export function formatRunewordSocketFillerName(fillerId) {
  if (fillerId === EMPTY_JEWEL_ID) return 'Jewel';
  return `${fillerId} Rune`;
}

/**
 * @param {object|null|undefined} def
 * @returns {string[]}
 */
export function formatRunewordSocketFillerLines(def) {
  if (!def?.baseId) return [];
  const fillers = getRunewordSocketFillers(def);
  if (!fillers.length) return [];
  return [`Sockets: ${fillers.map(formatRunewordSocketFillerName).join(', ')}`];
}

/**
 * @param {object|null|undefined} entry
 * @returns {object|null}
 */
export function runewordEntryToItemDef(entry) {
  if (!entry?.name) return null;
  /** @type {Record<string, unknown>} */
  const def = {
    id: entry.id || `rw:${slugify(entry.name)}`,
    name: entry.name,
    rarity: 'runeword',
    uniqueKind: 'runeword',
    runeCode: entry.runeCode || '',
    runes: Array.isArray(entry.runes) ? entry.runes.map(String) : [],
    reqLevel: Number(entry.reqLevel) || 0,
    allowedTypes: Array.isArray(entry.allowedTypes) ? entry.allowedTypes.map(String) : [],
    excludedTypes: Array.isArray(entry.excludedTypes) ? entry.excludedTypes.map(String) : [],
    excludedNames: Array.isArray(entry.excludedNames) ? entry.excludedNames.map(String) : [],
    modifiers: Array.isArray(entry.modifiers) ? entry.modifiers.map(String) : [],
    category: 'other',
    invWidth: 2,
    invHeight: 2,
  };
  const extracted = extractInnateFromModifiers(def.modifiers);
  def.modifiers = extracted.modifiers.map(String);
  if (extracted.innate) def.innate = extracted.innate;
  if (entry.classRestriction) def.classRestriction = entry.classRestriction;
  return def;
}
