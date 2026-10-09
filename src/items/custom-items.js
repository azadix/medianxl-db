/**
 * @file Custom (magic / rare / crafted / honorific / angelic) item overlay helpers.
 * @module items/custom-items
 */

import { isCharmItem } from '@/items/charm-items.js';
import { isRelicItem } from '@/items/relic-items.js';

/** @typedef {'magic'|'rare'|'crafted'|'honorific'|'angelic'} CustomItemQuality */

/** @type {ReadonlyArray<CustomItemQuality>} */
export const CUSTOM_ITEM_QUALITIES = Object.freeze([
  'magic',
  'rare',
  'crafted',
  'honorific',
  'angelic',
]);

const CUSTOM_QUALITY_SET = new Set(CUSTOM_ITEM_QUALITIES);

const TSW_BASE_PREFIX_RE = /^(Superior |Ethereal |Low Quality |Cracked |Damaged |Crude )+/i;
const TSW_BASE_SUFFIX_RE =
  /\s*\((?:\d+|Sacred|Angelic|MC|TU|SU|SSU|SSSU|Honorific|Crafted|Rare|Magic|Mastercrafted)\)$/i;

const NOT_STATS_RE =
  /^(Defense:|One-Hand Damage|Two-Hand Damage|Throw Damage|Required |Durability|Item Level|Quality Level|Prefixes:|Suffixes:|Socketed \(|Can be Inserted|Ethereal|Quantity|Chance to Block|\(.*\)$)/i;

const ANGELIC_RE = /\(Angelic\)/i;
const HONORIFIC_RE = /\(Honorific\)/i;
const TIER_LABEL_RE = /\s*\((?:\d+|sacred)\)$/i;

/**
 * @param {unknown} value
 * @returns {CustomItemQuality|null}
 */
export function normalizeCustomQuality(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  return CUSTOM_QUALITY_SET.has(key) ? /** @type {CustomItemQuality} */ (key) : null;
}

/**
 * @param {unknown} raw
 * @returns {{ quality: CustomItemQuality, name?: string, modifiers: string[] }|null}
 */
export function parseCustomPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = /** @type {{ quality?: unknown, name?: unknown, modifiers?: unknown }} */ (raw);
  const quality = normalizeCustomQuality(rec.quality);
  if (!quality) return null;
  const name = rec.name != null ? String(rec.name).trim() : '';
  /** @type {string[]} */
  const modifiers = [];
  if (Array.isArray(rec.modifiers)) {
    for (const line of rec.modifiers) {
      const text = String(line || '').trim();
      if (text) modifiers.push(text);
    }
  }
  /** @type {{ quality: CustomItemQuality, name?: string, modifiers: string[] }} */
  const out = { quality, modifiers };
  if (name) out.name = name;
  return out;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isCustomItemDef(def) {
  return Boolean(def && normalizeCustomQuality(def.customQuality));
}

/**
 * Overlay a catalog base with imported custom name, rarity, and rolled lines.
 * @param {object|null|undefined} def
 * @param {unknown} customRaw
 * @returns {object|null}
 */
export function applyCustomOverlayToDef(def, customRaw) {
  if (!def || typeof def !== 'object') return def ?? null;
  const custom = parseCustomPayload(customRaw);
  if (!custom) return def;
  return {
    ...def,
    name: custom.name || def.name,
    rarity: custom.quality,
    customQuality: custom.quality,
    baseId: def.baseId || def.id,
    baseName: def.baseName || def.name,
    modifiers: custom.modifiers.slice(),
  };
}

/**
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function stripTswBaseLabel(text) {
  return String(text || '')
    .replace(TSW_BASE_PREFIX_RE, '')
    .replace(TSW_BASE_SUFFIX_RE, '')
    .trim();
}

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
function tswRowName(row) {
  const display = row?.display_name != null ? String(row.display_name).trim() : '';
  if (display) return display;
  return row?.item != null ? String(row.item).trim() : '';
}

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
function tswRowHaystack(row) {
  return `${tswRowName(row)} ${row?.type || ''} ${row?.item || ''}`;
}

/**
 * @param {object|null|undefined} row
 * @returns {CustomItemQuality|null}
 */
export function tswCustomQuality(row) {
  if (!row || typeof row !== 'object') return null;
  const hay = tswRowHaystack(row);
  if (ANGELIC_RE.test(hay)) return 'angelic';
  if (HONORIFIC_RE.test(hay)) return 'honorific';
  const badge = String(row.display_quality || row.quality || '')
    .trim()
    .toUpperCase();
  if (badge === 'HONORIFIC') return 'honorific';
  if (badge === 'CRAFTED') return 'crafted';
  if (badge === 'MAGIC') return 'magic';
  if (badge === 'RARE') return 'rare';
  return null;
}

/**
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function isTswCustomQuality(row) {
  return tswCustomQuality(row) != null;
}

/**
 * @param {unknown} lines
 * @returns {string[]}
 */
export function tswDescriptionTexts(lines) {
  if (!Array.isArray(lines)) return [];
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    const text = line
      .map((seg) => (Array.isArray(seg) ? String(seg[0] || '') : ''))
      .join('')
      .trim();
    if (text) out.push(text);
  }
  return out;
}

/**
 * Rolled affix lines from a TSW item, minus name / defense / req / socket boilerplate.
 * @param {object|null|undefined} row
 * @returns {string[]}
 */
export function tswCustomModifiers(row) {
  const name = tswRowName(row);
  const type = row?.type != null ? String(row.type).trim() : '';
  const base = stripTswBaseLabel(type || name);
  /** @type {string[]} */
  const skip = new Set(
    [name, type, base, stripTswBaseLabel(name)]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  /** @type {string[]} */
  const out = [];
  for (const line of tswDescriptionTexts(row?.description_lines)) {
    if (skip.has(line.toLowerCase())) continue;
    if (NOT_STATS_RE.test(line)) continue;
    out.push(line);
  }
  return out;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isNormalBaseDef(def) {
  if (!def || typeof def !== 'object') return false;
  if (isCharmItem(def) || isRelicItem(def)) return false;
  if (def.uniqueKind) return false;
  const rarity = String(def.rarity || 'normal');
  return rarity === 'normal' || rarity === '';
}

/**
 * @param {string} text
 * @returns {string}
 */
function normName(text) {
  return String(text || '')
    .trim()
    .toLowerCase();
}

/**
 * Catalog base id for a TSW magic/rare/crafted/honorific/angelic row.
 * @param {object} row
 * @param {{ list: object[], byId: Record<string, object> }} cat
 * @param {CustomItemQuality} [quality]
 * @returns {string|null}
 */
export function resolveCustomBaseDefId(row, cat, quality = null) {
  const list = Array.isArray(cat?.list) ? cat.list : [];
  const byId = cat?.byId && typeof cat.byId === 'object' ? cat.byId : {};
  const code = row?.code != null ? String(row.code).trim() : '';
  const codeDef = code ? byId[code] : null;
  if (codeDef && isNormalBaseDef(codeDef)) return code;

  const labels = [
    stripTswBaseLabel(row?.type),
    stripTswBaseLabel(tswRowName(row)),
    stripTswBaseLabel(row?.item),
  ].filter(Boolean);
  /** @type {string[]} */
  const wants = [];
  for (const label of labels) {
    const key = normName(label);
    if (key && !wants.includes(key)) wants.push(key);
  }
  if (!wants.length) return null;

  const hits = list.filter((def) => {
    if (!isNormalBaseDef(def)) return false;
    const have = normName(def.name);
    const stripped = have.replace(TIER_LABEL_RE, '');
    return wants.includes(have) || wants.includes(stripped);
  });
  if (!hits.length) return null;
  const preferSacred = quality === 'angelic' || quality === 'honorific';
  if (preferSacred) {
    const sacred = hits.find((d) => /\(sacred\)$/i.test(String(d.name || '')));
    if (sacred?.id) return String(sacred.id);
  }
  const exact = hits.find((d) => wants.includes(normName(d.name)));
  const pick = exact || hits[hits.length - 1];
  return pick?.id != null ? String(pick.id) : null;
}

/**
 * Snapshot payload for an equipped custom TSW item.
 * @param {object} row
 * @param {string} defId
 * @param {CustomItemQuality} quality
 * @returns {{ defId: string, custom: { quality: CustomItemQuality, name?: string, modifiers: string[] }, icon?: string }}
 */
export function tswCustomSnapshotEntry(row, defId, quality) {
  const name = tswRowName(row);
  const custom = parseCustomPayload({
    quality,
    name,
    modifiers: tswCustomModifiers(row),
  });
  /** @type {{ defId: string, custom: { quality: CustomItemQuality, name?: string, modifiers: string[] }, icon?: string }} */
  const entry = { defId, custom: custom || { quality, modifiers: [] } };
  const icon = row?.image != null ? String(row.image).trim() : '';
  if (icon) entry.icon = icon;
  return entry;
}
