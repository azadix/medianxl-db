/**
 * @file Custom (magic / rare / crafted / honorific / angelic) item overlay helpers.
 * @module items/custom-items
 */

import { isCharmItem } from '@/items/charm-items.js';
import { isRelicItem } from '@/items/relic-items.js';
import {
  encodeModifierLine,
  MODIFIER_COLOR_GREY,
  MODIFIER_COLOR_ORANGE,
} from '@/items/item-modifier-line.js';

/** @typedef {'magic'|'rare'|'crafted'|'honorific'|'angelic'|'superior'|'normal'} CustomItemQuality */

/**
 * @typedef {{
 *   quality: CustomItemQuality,
 *   name?: string,
 *   modifiers: string[],
 *   reqLevel?: number,
 *   reqStr?: number,
 *   reqDex?: number,
 *   defenseDisplay?: string,
 *   damage1hDisplay?: string,
 *   damage2hDisplay?: string,
 *   throwDamageDisplay?: string,
 *   sockets?: number,
 *   ethereal?: boolean,
 * }} CustomItemPayload
 */

/** @type {ReadonlyArray<CustomItemQuality>} */
export const CUSTOM_ITEM_QUALITIES = Object.freeze([
  'magic',
  'rare',
  'crafted',
  'honorific',
  'angelic',
  'superior',
  'normal',
]);

const CUSTOM_QUALITY_SET = new Set(CUSTOM_ITEM_QUALITIES);

const TSW_BASE_PREFIX_RE = /^(Superior |Ethereal |Low Quality |Cracked |Damaged |Crude )+/i;
const TSW_BASE_ETH_RE = /\s*\[eth\]\s*$/i;
const TSW_BASE_SUFFIX_RE =
  /\s*\((?:\d+|Sacred|Angelic|MC|TU|SU|SSU|SSSU|Honorific|Crafted|Rare|Magic|Mastercrafted)\)$/i;

const NOT_STATS_RE =
  /^(Defense:|One-Hand Damage|Two-Hand Damage|Throw Damage|Required |Durability|Item Level|Quality Level|Prefixes:|Suffixes:|Socketed \(|Can be Inserted|Ethereal|Quantity|Chance to Block|\(.*\)$)/i;

/** Sleep-awakening remnant armor flavor (show as grey, like Ethereal). */
const REMNANT_FLAVOR_RE = /^remainders? of a once powerful/i;

const DEFENSE_RE = /^Defense:\s*(.+)$/i;
const DAMAGE_1H_RE = /^One-Hand Damage:\s*(.+)$/i;
const DAMAGE_2H_RE = /^Two-Hand Damage:\s*(.+)$/i;
const THROW_DAMAGE_RE = /^Throw Damage:\s*(.+)$/i;
const REQ_LEVEL_LINE_RE = /^Required Level:\s*(\d+)\s*$/i;
const REQ_STR_LINE_RE = /^Required Strength:\s*(\d+)\s*$/i;
const REQ_DEX_LINE_RE = /^Required Dexterity:\s*(\d+)\s*$/i;
const SOCKETED_RE = /^Socketed \((\d+)(?:\/(\d+))?\)$/i;

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
 * @param {unknown} value
 * @returns {number|undefined}
 */
function optionalNonNegInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

/**
 * @param {unknown} value
 * @returns {string|undefined}
 */
function optionalDisplay(value) {
  const text = value != null ? String(value).trim() : '';
  return text || undefined;
}

/**
 * @param {unknown} raw
 * @returns {CustomItemPayload|null}
 */
export function parseCustomPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
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
  /** @type {CustomItemPayload} */
  const out = { quality, modifiers };
  if (name) out.name = name;
  const reqLevel = optionalNonNegInt(rec.reqLevel);
  const reqStr = optionalNonNegInt(rec.reqStr);
  const reqDex = optionalNonNegInt(rec.reqDex);
  const sockets = optionalNonNegInt(rec.sockets);
  const defenseDisplay = optionalDisplay(rec.defenseDisplay);
  const damage1hDisplay = optionalDisplay(rec.damage1hDisplay);
  const damage2hDisplay = optionalDisplay(rec.damage2hDisplay);
  const throwDamageDisplay = optionalDisplay(rec.throwDamageDisplay);
  if (reqLevel != null) out.reqLevel = reqLevel;
  if (reqStr != null) out.reqStr = reqStr;
  if (reqDex != null) out.reqDex = reqDex;
  if (sockets != null) out.sockets = sockets;
  if (defenseDisplay) out.defenseDisplay = defenseDisplay;
  if (damage1hDisplay) out.damage1hDisplay = damage1hDisplay;
  if (damage2hDisplay) out.damage2hDisplay = damage2hDisplay;
  if (throwDamageDisplay) out.throwDamageDisplay = throwDamageDisplay;
  if (rec.ethereal === true) out.ethereal = true;
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
  /** @type {Record<string, unknown>} */
  const out = {
    ...def,
    name: custom.name || def.name,
    rarity: custom.quality,
    customQuality: custom.quality,
    baseId: def.baseId || def.id,
    baseName: def.baseName || def.name,
    modifiers: custom.modifiers.slice(),
  };
  if (custom.reqLevel != null) out.reqLevel = custom.reqLevel;
  if (custom.reqStr != null) {
    out.reqStr = custom.reqStr;
    // TSW "Required Strength:" is already post Requirements +/-%.
    out.reqStrFinal = true;
  }
  if (custom.reqDex != null) {
    out.reqDex = custom.reqDex;
    out.reqDexFinal = true;
  }
  if (custom.sockets != null) out.sockets = custom.sockets;
  if (custom.defenseDisplay) {
    out.defenseDisplay = custom.defenseDisplay;
    out.defense = undefined;
  }
  if (custom.damage1hDisplay) {
    out.damage1hDisplay = custom.damage1hDisplay;
    out.damage1h = undefined;
  }
  if (custom.damage2hDisplay) {
    out.damage2hDisplay = custom.damage2hDisplay;
    out.damage2h = undefined;
  }
  if (custom.throwDamageDisplay) {
    out.throwDamageDisplay = custom.throwDamageDisplay;
  }
  if (custom.ethereal) out.ethereal = true;
  return out;
}

/**
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function stripTswBaseLabel(text) {
  return String(text || '')
    .replace(TSW_BASE_PREFIX_RE, '')
    .replace(TSW_BASE_ETH_RE, '')
    .replace(TSW_BASE_SUFFIX_RE, '')
    .replace(TSW_BASE_ETH_RE, '')
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
  // Sleep-awakening remnant armor (and plain greys) arrive as High/Superior/Normal.
  if (badge === 'SUPERIOR' || badge === 'HIGH') return 'superior';
  if (badge === 'NORMAL') return 'normal';
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
  return tswDescriptionColoredTexts(lines).map((row) => row.text);
}

/**
 * @param {unknown} lines
 * @returns {Array<{ text: string, color: string }>}
 */
export function tswDescriptionColoredTexts(lines) {
  if (!Array.isArray(lines)) return [];
  /** @type {Array<{ text: string, color: string }>} */
  const out = [];
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    let text = '';
    /** @type {number|null} */
    let code = null;
    for (const seg of line) {
      if (!Array.isArray(seg)) continue;
      text += String(seg[0] || '');
      const n = Number(seg[1]);
      if (code == null && Number.isFinite(n) && n >= 0) code = n;
    }
    text = text.trim();
    if (!text) continue;
    out.push({ text, color: tswColorToModifierColor(code) });
  }
  return out;
}

/**
 * TSW description color ids: 3 magic, 4/7/8/9 unique-gold/orange, 5 grey.
 * @param {number|null|undefined} code
 * @returns {string}
 */
function tswColorToModifierColor(code) {
  if (code === 5) return MODIFIER_COLOR_GREY;
  if (code === 4 || code === 7 || code === 8 || code === 9) return MODIFIER_COLOR_ORANGE;
  return '';
}

/**
 * Whether a TSW row is ethereal (`eth` / `is_eth` / `[eth]` type / Ethereal line).
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function tswRowIsEthereal(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.eth === true || row.is_eth === true) return true;
  const type = row.type != null ? String(row.type) : '';
  if (TSW_BASE_ETH_RE.test(type) || /\[eth\]/i.test(type)) return true;
  return tswDescriptionTexts(row.description_lines).some((line) => /^Ethereal$/i.test(line));
}

/**
 * Whether a TSW row is corrupted (`corrupted` flag or Corrupted description line).
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function tswRowIsCorrupted(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.corrupted === true) return true;
  return tswDescriptionTexts(row.description_lines).some((line) => /^Corrupted$/i.test(line));
}

/**
 * Rolled affix lines from a TSW item, minus name / defense / req / socket boilerplate.
 * Remnant flavor is kept as a grey line; Ethereal is stored on the payload flag instead.
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
    if (REMNANT_FLAVOR_RE.test(line)) {
      const encoded = encodeModifierLine(line, MODIFIER_COLOR_GREY);
      if (encoded) out.push(encoded);
      continue;
    }
    out.push(line);
  }
  return out;
}

const REQ_LEVEL_BONUS_LINE_RE = /^\+?\s*(\d+)\s+Required Level$/i;

/**
 * Defense / damage / req / socket lines from a TSW custom item description.
 * TSW `Required Level:` is the final total (including orb bonuses), while
 * `+N Required Level` is also listed as a mod — store the pre-bonus base so
 * `resolveItemRequirements` can add the bonus once.
 * @param {object|null|undefined} row
 * @returns {Omit<CustomItemPayload, 'quality'|'name'|'modifiers'>}
 */
export function tswCustomBaseFields(row) {
  /** @type {Omit<CustomItemPayload, 'quality'|'name'|'modifiers'>} */
  const out = {};
  let reqLevelTotal = /** @type {number|null} */ (null);
  let reqLevelBonus = 0;
  for (const line of tswDescriptionTexts(row?.description_lines)) {
    const defense = DEFENSE_RE.exec(line);
    if (defense) {
      out.defenseDisplay = defense[1].replace(/\s+/g, ' ').trim();
      continue;
    }
    const d1 = DAMAGE_1H_RE.exec(line);
    if (d1) {
      out.damage1hDisplay = d1[1].replace(/\s+/g, ' ').trim();
      continue;
    }
    const d2 = DAMAGE_2H_RE.exec(line);
    if (d2) {
      out.damage2hDisplay = d2[1].replace(/\s+/g, ' ').trim();
      continue;
    }
    const thrown = THROW_DAMAGE_RE.exec(line);
    if (thrown) {
      out.throwDamageDisplay = thrown[1].replace(/\s+/g, ' ').trim();
      continue;
    }
    const reqLevel = REQ_LEVEL_LINE_RE.exec(line);
    if (reqLevel) {
      reqLevelTotal = Number(reqLevel[1]);
      continue;
    }
    const reqBonus = REQ_LEVEL_BONUS_LINE_RE.exec(line);
    if (reqBonus) {
      reqLevelBonus += Number(reqBonus[1]) || 0;
      continue;
    }
    const reqStr = REQ_STR_LINE_RE.exec(line);
    if (reqStr) {
      out.reqStr = Number(reqStr[1]);
      continue;
    }
    const reqDex = REQ_DEX_LINE_RE.exec(line);
    if (reqDex) {
      out.reqDex = Number(reqDex[1]);
      continue;
    }
    const sock = SOCKETED_RE.exec(line);
    if (sock) {
      const filled = Number(sock[1]);
      const max = sock[2] != null ? Number(sock[2]) : filled;
      if (Number.isFinite(max) && max >= 0) out.sockets = max;
    }
  }
  if (reqLevelTotal != null && Number.isFinite(reqLevelTotal)) {
    out.reqLevel = Math.max(0, reqLevelTotal - reqLevelBonus);
  }
  if (tswRowIsEthereal(row)) out.ethereal = true;
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
  const typeRaw = String(row?.type || '');
  const preferSacred =
    quality === 'crafted' ||
    quality === 'honorific' ||
    quality === 'angelic' ||
    /\(Sacred\)/i.test(typeRaw) ||
    /\(Sacred\)/i.test(tswRowName(row));
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
 * @returns {{ defId: string, custom: CustomItemPayload, icon?: string }}
 */
export function tswCustomSnapshotEntry(row, defId, quality) {
  const name = tswRowName(row);
  const custom = parseCustomPayload({
    quality,
    name,
    modifiers: tswCustomModifiers(row),
    ...tswCustomBaseFields(row),
  });
  /** @type {{ defId: string, custom: CustomItemPayload, icon?: string }} */
  const entry = { defId, custom: custom || { quality, modifiers: [] } };
  const icon = row?.image != null ? String(row.image).trim() : '';
  if (icon) entry.icon = icon;
  return entry;
}
