/**
 * @file Unwrap TSW NotArmory export JSON and map items onto our items snapshot.
 * @module planner/tsw-build-import
 */

import Character from '@/character/Character.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import {
  normalizeBuildOSkillsForImport,
  resolveCatalogRowBySkillRef,
} from '@/character/planner-build-io.js';
import { isCharmItem, isDimensionalKeyCharm } from '@/items/charm-items.js';
import { isRelicItem, MAX_RELICS } from '@/items/relic-items.js';
import {
  buildSetDumpSkipContext,
  parseTswMysticOrbs,
  rollsFromTswItem,
  tswInstanceExtras,
} from '@/planner/tsw-item-rolls.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import { isSetItem } from '@/items/item-overlays.js';
import { slugify } from '@/items/unique-stats-catalog.js';
import {
  resolveCustomBaseDefId,
  tswCustomQuality,
  tswCustomSnapshotEntry,
} from '@/items/custom-items.js';
import {
  isRunewordTemplate,
  mergedRunewordId,
  resolveRunewordTemplateId,
} from '@/items/runeword-items.js';

/** @type {Readonly<Record<string, string>>} */
export const TSW_SLOT_TO_EQUIPMENT = Object.freeze({
  Head: 'head',
  Neck: 'neck',
  Torso: 'tors',
  Hands: 'glov',
  Feet: 'feet',
  Waist: 'belt',
  // Bodylocs match D2/TSW: RightFinger=rrin, LeftFinger=lrin.
  // Paperdoll is mirrored (rrin draws on screen-left); see panelKeyToSlot.
  RightFinger: 'rrin',
  LeftFinger: 'lrin',
  RightHandMain: 'rarm',
  LeftHandMain: 'larm',
  RightHandAlternate: 'rarm2',
  LeftHandAlternate: 'larm2',
});

/** @type {Readonly<Record<string, string>>} */
const DIMENSIONAL_KEY_IDS = Object.freeze({
  arcana: 'ebw',
  mandate: 'ebw-mandate',
  onslaught: 'ebw-onslaught',
  primordia: 'ebw-primordia',
});

/**
 * @param {unknown} data
 * @returns {boolean}
 */
export function isTswEnvelope(data) {
  return Boolean(
    data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      /** @type {{ build?: unknown }} */ (data).build &&
      typeof /** @type {{ build?: unknown }} */ (data).build === 'object' &&
      !Array.isArray(/** @type {{ build?: unknown }} */ (data).build)
  );
}

/**
 * @param {unknown} data
 * @returns {{ build: object, tswItems: object[]|null }}
 */
export function unwrapTswOrNativeBuild(data) {
  if (!isTswEnvelope(data)) {
    return { build: /** @type {object} */ (data), tswItems: null };
  }
  const rec = /** @type {{ build: object, items?: unknown }} */ (data);
  const build = { ...rec.build, __tswEnvelope: true };
  if (build.stats && typeof build.stats === 'object' && !Array.isArray(build.stats)) {
    build.stats = Object.entries(/** @type {Record<string, unknown>} */ (build.stats))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
  }
  return {
    build,
    tswItems: Array.isArray(rec.items) ? rec.items : null,
  };
}

/**
 * TSW omits Inquisitor of the Triune. Treat hell as done when level is above 110.
 * @param {object} build
 * @returns {Record<string, unknown>}
 */
export function inferTswQuestsCompleted(build) {
  const src =
    build?.questsCompleted &&
    typeof build.questsCompleted === 'object' &&
    !Array.isArray(build.questsCompleted)
      ? /** @type {Record<string, unknown>} */ (build.questsCompleted)
      : {};
  const quests = { ...src };
  const level = Number(build?.level);
  if (Number.isFinite(level) && level > 110 && quests.inquisitor_of_the_triune == null) {
    quests.inquisitor_of_the_triune = { normal: false, nightmare: false, hell: true };
  }
  return quests;
}

/**
 * @param {object} row
 * @returns {string}
 */
export function tswItemDisplayName(row) {
  const display = row?.display_name != null ? String(row.display_name).trim() : '';
  if (display) return display;
  return row?.item != null ? String(row.item).trim() : '';
}

/**
 * @param {object} row
 * @param {string} reason
 * @returns {{ name: string, reason: string, item?: string, display_name?: string, type?: string, quality?: string, display_quality?: string, code?: string, image?: string, location?: string, slot?: string, eth?: boolean, corrupted?: boolean, is_rw?: boolean, is_charm?: boolean, is_trophy?: boolean, is_class_charm?: boolean, is_upgraded?: boolean, has_trophy?: boolean, ilvl?: number|null, quantity?: number|null, area?: string, storage?: number|null, row?: number|null, col?: number|null, locid?: number|null, name_color?: number|null, description_lines?: unknown }}
 */
function skippedTswItem(row, reason) {
  const name = tswItemDisplayName(row) || '(unnamed)';
  /** @type {{ name: string, reason: string, item?: string, display_name?: string, type?: string, quality?: string, display_quality?: string, code?: string, image?: string, location?: string, slot?: string, eth?: boolean, corrupted?: boolean, is_rw?: boolean, is_charm?: boolean, is_trophy?: boolean, is_class_charm?: boolean, is_upgraded?: boolean, has_trophy?: boolean, ilvl?: number|null, quantity?: number|null, area?: string, storage?: number|null, row?: number|null, col?: number|null, locid?: number|null, name_color?: number|null, description_lines?: unknown }} */
  const out = { name, reason };
  if (row?.item != null) out.item = String(row.item);
  if (row?.display_name != null) out.display_name = String(row.display_name);
  if (row?.type != null) out.type = String(row.type);
  if (row?.quality != null) out.quality = String(row.quality);
  if (row?.display_quality != null) out.display_quality = String(row.display_quality);
  if (row?.code != null) out.code = String(row.code);
  if (row?.image != null) out.image = String(row.image);
  if (row?.location != null) out.location = String(row.location);
  if (row?.slot != null) out.slot = String(row.slot);
  if (typeof row?.eth === 'boolean') out.eth = row.eth;
  if (typeof row?.corrupted === 'boolean') out.corrupted = row.corrupted;
  if (typeof row?.is_rw === 'boolean') out.is_rw = row.is_rw;
  if (typeof row?.is_charm === 'boolean') out.is_charm = row.is_charm;
  if (typeof row?.is_trophy === 'boolean') out.is_trophy = row.is_trophy;
  if (typeof row?.is_class_charm === 'boolean') out.is_class_charm = row.is_class_charm;
  if (typeof row?.is_upgraded === 'boolean') out.is_upgraded = row.is_upgraded;
  if (typeof row?.has_trophy === 'boolean') out.has_trophy = row.has_trophy;
  if (row?.ilvl != null) out.ilvl = row.ilvl;
  if (row?.quantity != null) out.quantity = row.quantity;
  if (row?.area != null) out.area = String(row.area);
  if (row?.storage != null) out.storage = row.storage;
  if (row?.row != null) out.row = row.row;
  if (row?.col != null) out.col = row.col;
  if (row?.locid != null) out.locid = row.locid;
  if (row?.name_color != null) out.name_color = row.name_color;
  if (row?.description_lines != null) out.description_lines = row.description_lines;
  return out;
}

/**
 * @param {string|null|undefined} text
 * @returns {string}
 */
function normName(text) {
  return String(text || '')
    .trim()
    .toLowerCase();
}

/**
 * @param {unknown} catalog
 * @returns {{
 *   list: object[],
 *   byId: Record<string, object>,
 *   sets: object[],
 *   setsById: Record<string, object>,
 * }}
 */
function catalogIndex(catalog) {
  if (!catalog || typeof catalog !== 'object') {
    return { list: [], byId: {}, sets: [], setsById: {} };
  }
  const rec =
    /** @type {{ catalog?: object[], catalogById?: Record<string, object>, sets?: object[], setsById?: Record<string, object> }} */ (
      catalog
    );
  /** @type {object[]} */
  const list = Array.isArray(rec.catalog)
    ? rec.catalog
    : rec.catalogById && typeof rec.catalogById === 'object' && !Array.isArray(rec.catalogById)
      ? Object.values(rec.catalogById)
      : [];
  /** @type {Record<string, object>} */
  const byId = {};
  for (const def of list) {
    if (def?.id != null && String(def.id)) byId[String(def.id)] = def;
  }
  // Keep catalogById aliases (e.g. u:name:tu -> T4) that are not list ids.
  if (rec.catalogById && typeof rec.catalogById === 'object' && !Array.isArray(rec.catalogById)) {
    for (const [id, def] of Object.entries(rec.catalogById)) {
      if (!id || !def || byId[id] != null) continue;
      byId[id] = def;
    }
  }
  /** @type {object[]} */
  const sets = Array.isArray(rec.sets) ? rec.sets : [];
  /** @type {Record<string, object>} */
  const setsById = {};
  if (rec.setsById && typeof rec.setsById === 'object' && !Array.isArray(rec.setsById)) {
    for (const [id, setDef] of Object.entries(rec.setsById)) {
      if (!id || !setDef) continue;
      setsById[id] = setDef;
    }
  }
  for (const setDef of sets) {
    if (setDef?.id == null || !String(setDef.id)) continue;
    const id = String(setDef.id);
    if (setsById[id] == null) setsById[id] = setDef;
  }
  return { list, byId, sets, setsById };
}

/**
 * @param {object|null|undefined} def
 * @param {{ list: object[], setsById: Record<string, object> }} cat
 * @returns {ReturnType<typeof buildSetDumpSkipContext>}
 */
function setDumpContextForDef(def, cat) {
  if (!isSetItem(def) || !def?.setId) return null;
  const setId = String(def.setId);
  const setDef = cat.setsById[setId] || null;
  /** @type {string[]} */
  const siblingNames = [];
  for (const piece of cat.list) {
    if (!piece || String(piece.setId || '') !== setId) continue;
    if (piece.name != null) siblingNames.push(String(piece.name));
  }
  return buildSetDumpSkipContext(def, { setDef, siblingNames });
}

/**
 * @param {object} row
 * @returns {string}
 */
function qualityBadge(row) {
  return String(row?.display_quality || row?.quality || '')
    .trim()
    .toUpperCase();
}

/**
 * @param {string} badge
 * @returns {boolean}
 */
function isCatalogBadge(badge) {
  return ['SU', 'SSU', 'SSSU', 'TU', 'SET', 'RW', 'CHARM'].includes(badge);
}

/**
 * @param {object} row
 * @returns {boolean}
 */
function looksLikeRelic(row) {
  return /^Relic\s*[:(\s]/i.test(tswItemDisplayName(row));
}

/**
 * @param {object} row
 * @returns {string|null}
 */
function relicSkillHint(row) {
  const name = tswItemDisplayName(row);
  const m = name.match(/^Relic\s*[:(]\s*(.+?)\s*\)?\s*$/i);
  if (!m) return null;
  return String(m[1] || '')
    .replace(/\)\s*$/, '')
    .trim();
}

/**
 * Unique-only boots that keep a mirrored helm's name and stats.
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function isMindflayerMayhemRow(row) {
  const type = normName(row?.type);
  if (type === "mindflayer's mayhem") return true;
  const code = row?.code != null ? String(row.code).trim() : '';
  return code === 'DU1';
}

/**
 * Numeric TU tier from a TSW `type` label (`Leather Armor (2)`, optional `[eth]`).
 * Bare `u:name:tu` catalog aliases point at T4 — callers must prefer `:tu:N`.
 * @param {object} row
 * @returns {number|null}
 */
export function tswTierFromRow(row) {
  const type = String(row?.type || '')
    .replace(/\s*\[eth\]\s*$/i, '')
    .trim();
  const m = /\(([1-4])\)\s*$/.exec(type);
  return m ? Number(m[1]) : null;
}

/**
 * @param {object} row
 * @returns {string[]}
 */
function uniqueIdCandidates(row) {
  const name = tswItemDisplayName(row);
  const slug = slugify(name);
  if (!slug) return [];
  const badge = slugify(qualityBadge(row));
  /** @type {string[]} */
  const ids = [];
  const push = (id) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  if (row?.is_rw || badge === 'rw') {
    push(`rw:${slug}`);
  }
  if (badge === 'set' || badge === 'sacred-set') {
    push(`s:${slug}:sacred-set`);
    push(`s:${slug}:set`);
  }
  if (badge === 'tu') {
    const tier = tswTierFromRow(row);
    if (tier != null) push(`u:${slug}:tu:${tier}`);
    // Only fall back to bare `:tu` (T4 alias) when the export has no tier marker.
    else push(`u:${slug}:tu`);
  } else if (badge) {
    push(`u:${slug}:${badge}`);
  }
  if (badge === 'ssu' || badge === 'sssu') push(`u:${slug}:su`);
  if (badge === 'unique') {
    push(`u:${slug}:su`);
    push(`u:${slug}:ssu`);
  }
  return ids;
}

/**
 * @param {object} row
 * @returns {string|null}
 */
function dimensionalKeyVariant(row) {
  const name = normName(tswItemDisplayName(row));
  if (DIMENSIONAL_KEY_IDS[name]) return name;
  const stripped = name.replace(/^dimensional key\s*-+\s*/, '');
  if (DIMENSIONAL_KEY_IDS[stripped]) return stripped;
  const lines = Array.isArray(row?.description_lines) ? row.description_lines : [];
  let sawKey = /dimensional key/.test(name);
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    const text = line
      .map((seg) => (Array.isArray(seg) ? String(seg[0] || '') : ''))
      .join('')
      .toLowerCase();
    if (/dimensional key/.test(text)) sawKey = true;
  }
  if (sawKey && DIMENSIONAL_KEY_IDS[name]) return name;
  if (sawKey) return name;
  return DIMENSIONAL_KEY_IDS[name] ? name : null;
}

/**
 * @param {object} def
 * @param {object} row
 * @returns {boolean}
 */
function defMatchesRow(def, row) {
  if (!def) return false;
  const want = normName(tswItemDisplayName(row));
  if (!want) return false;
  const have = normName(def.name);
  if (have === want) return true;
  if (isDimensionalKeyCharm(def) && have.endsWith(want)) return true;
  if (isRelicItem(def)) {
    const hint = relicSkillHint(row);
    if (hint && have === `relic (${normName(hint)})`) return true;
  }
  return false;
}

/**
 * Runeword template + grey base → `rw:name:baseId` (merged at snapshot load).
 * Remnant / superior Full Plate Mail uses the same sacred base as other greys.
 * @param {object} row
 * @param {{ list: object[], byId: Record<string, object> }} cat
 * @returns {string|null}
 */
export function resolveTswRunewordDefId(row, cat) {
  const name = tswItemDisplayName(row);
  const slug = slugify(name);
  if (!slug) return null;

  let templateId = resolveRunewordTemplateId(`rw:${slug}`);
  if (!cat.byId[templateId]) {
    const want = normName(name);
    const hits = cat.list.filter((def) => isRunewordTemplate(def) && normName(def.name) === want);
    if (hits.length !== 1 || hits[0]?.id == null) return null;
    templateId = resolveRunewordTemplateId(String(hits[0].id));
  }
  if (!cat.byId[templateId] || !isRunewordTemplate(cat.byId[templateId])) return null;

  const baseId = resolveCustomBaseDefId(row, cat, null);
  if (!baseId || !cat.byId[baseId]) return null;
  return mergedRunewordId(templateId, baseId);
}

/**
 * @param {object} row
 * @param {{ list: object[], byId: Record<string, object> }} cat
 * @returns {string|null}
 */
export function resolveTswItemDefId(row, cat) {
  if (row?.is_rw || qualityBadge(row) === 'RW') {
    return resolveTswRunewordDefId(row, cat);
  }

  if (isMindflayerMayhemRow(row) && cat.byId['u:mindflayers-mayhem:su']) {
    return 'u:mindflayers-mayhem:su';
  }

  const code = row?.code != null ? String(row.code).trim() : '';
  const codeDef = code ? cat.byId[code] : null;
  // Unique gear codes collide with base item ids (e.g. Lacuni Cowl `@17`). Only trust
  // `code` for charms/relics, whose catalog ids are the TSW codes.
  if (codeDef && (isCharmItem(codeDef) || isRelicItem(codeDef) || row?.is_charm || looksLikeRelic(row))) {
    return code;
  }

  const dim = dimensionalKeyVariant(row);
  if (dim && DIMENSIONAL_KEY_IDS[dim] && cat.byId[DIMENSIONAL_KEY_IDS[dim]]) {
    return DIMENSIONAL_KEY_IDS[dim];
  }

  const relicHint = relicSkillHint(row);
  if (relicHint) {
    const relicId = `relic:${slugify(relicHint)}`;
    if (cat.byId[relicId]) return relicId;
  }

  for (const id of uniqueIdCandidates(row)) {
    if (cat.byId[id]) return id;
  }

  const hits = cat.list.filter((def) => defMatchesRow(def, row));
  if (hits.length === 1) return String(hits[0].id);
  if (hits.length > 1) {
    const badge = qualityBadge(row);
    const kind =
      badge === 'SU'
        ? 'su'
        : badge === 'SSU'
          ? 'ssu'
          : badge === 'SSSU'
            ? 'sssu'
            : badge === 'TU'
              ? 'tiered'
              : null;
    if (kind === 'tiered') {
      const tier = tswTierFromRow(row);
      if (tier != null) {
        const byTier = hits.find(
          (d) => d.uniqueKind === 'tiered' && Number(d.tier) === tier
        );
        if (byTier?.id) return String(byTier.id);
      }
    }
    const byKind = kind ? hits.find((d) => d.uniqueKind === kind) : null;
    if (byKind?.id) return String(byKind.id);
    if (row?.is_charm) {
      const charmHit = hits.find((d) => isCharmItem(d));
      if (charmHit?.id) return String(charmHit.id);
    }
    if (looksLikeRelic(row)) {
      const relicHit = hits.find((d) => isRelicItem(d));
      if (relicHit?.id) return String(relicHit.id);
    }
    return hits[0]?.id != null ? String(hits[0].id) : null;
  }
  return null;
}

/**
 * @param {object} row
 * @param {object|null} def
 * @returns {boolean}
 */
function isCatalogBacked(row, def) {
  if (def && (isCharmItem(def) || isRelicItem(def))) return true;
  if (row?.is_charm || looksLikeRelic(row) || row?.is_rw) return true;
  return isCatalogBadge(qualityBadge(row));
}

/**
 * @param {object} entry
 * @param {object} row
 * @param {object|null|undefined} def
 * @param {ReturnType<typeof buildSetDumpSkipContext>} [setDumpCtx]
 * @returns {void}
 */
function attachTswInstanceExtras(entry, row, def, setDumpCtx = null) {
  const meta = tswInstanceExtras(row, def, setDumpCtx);
  if (meta.extras?.length) entry.extras = meta.extras;
  if (meta.mysticOrbs?.length) entry.mysticOrbs = meta.mysticOrbs;
  if (meta.ethereal) entry.ethereal = true;
}

/**
 * @param {object} row
 * @param {string} defId
 * @param {object|null} def
 * @param {string|null|undefined} className
 * @param {ReturnType<typeof buildSetDumpSkipContext>} [setDumpCtx]
 * @returns {{
 *   defId: string,
 *   rolls?: Record<string, number>,
 *   icon?: string,
 *   extras?: string[],
 *   mysticOrbs?: Array<[number, string]>,
 *   ethereal?: boolean,
 *   name?: string,
 * }}
 */
function snapshotWithRolls(row, defId, def, className, setDumpCtx = null) {
  /**
   * @type {{
   *   defId: string,
   *   rolls?: Record<string, number>,
   *   icon?: string,
   *   extras?: string[],
   *   mysticOrbs?: Array<[number, string]>,
   *   ethereal?: boolean,
   *   name?: string,
    }} */
  const entry = { defId };
  const rolls = rollsFromTswItem(row, def, className);
  if (rolls && Object.keys(rolls).length) entry.rolls = rolls;
  const icon = row?.image != null ? String(row.image).trim() : '';
  if (icon) entry.icon = icon;
  attachTswInstanceExtras(entry, row, def, setDumpCtx);
  if (isMindflayerMayhemRow(row)) {
    const name = tswItemDisplayName(row);
    if (name && name !== def?.name) entry.name = name;
    delete entry.mysticOrbs;
  }
  return entry;
}

/**
 * Map a TSW items dump onto `{ weaponSet, equipment, charms, relics }`.
 * @param {unknown} rows
 * @param {object} catalog
 * @param {string|null|undefined} [className]
 * @returns {{ snapshot: { weaponSet: 0, equipment: Record<string, { defId: string, custom?: object, icon?: string, rolls?: Record<string, number> }|null>, charms: Array<{ defId: string, rolls?: Record<string, number> }>, relics: Array<{ defId: string, rolls?: Record<string, number> }> }, skipped: Array<ReturnType<typeof skippedTswItem>> }}
 */
export function mapTswItemsToSnapshot(rows, catalog, className = null) {
  const cat = catalogIndex(catalog);
  /** @type {Record<string, { defId: string, custom?: object, icon?: string }|null>} */
  const equipment = {};
  for (const slot of EQUIPMENT_SLOTS) equipment[slot] = null;
  /** @type {Array<{ defId: string }>} */
  const charms = [];
  /** @type {Array<{ defId: string }>} */
  const relics = [];
  /** @type {Set<string>} */
  const seenCharms = new Set();
  /** @type {Set<string>} */
  const seenRelics = new Set();
  /** @type {Array<ReturnType<typeof skippedTswItem>>} */
  const skipped = [];

  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const location = String(row.location || '').trim();
    if (location !== 'Gear' && location !== 'Inventory') {
      skipped.push(skippedTswItem(row, 'stash'));
      continue;
    }

    const customQuality = tswCustomQuality(row);
    if (customQuality) {
      if (location !== 'Gear') {
        skipped.push(skippedTswItem(row, 'uncatalogued'));
        continue;
      }
      const slotKey = TSW_SLOT_TO_EQUIPMENT[String(row.slot || '')];
      if (!slotKey) {
        skipped.push(skippedTswItem(row, 'unknown-slot'));
        continue;
      }
      const defId = resolveCustomBaseDefId(row, cat, customQuality);
      const def = defId ? cat.byId[defId] : null;
      if (!defId || !def) {
        skipped.push(skippedTswItem(row, 'uncatalogued'));
        continue;
      }
      const customEntry = tswCustomSnapshotEntry(row, defId, customQuality);
      const mysticOrbs = parseTswMysticOrbs(row.mystic_orbs);
      if (mysticOrbs.length) customEntry.mysticOrbs = mysticOrbs;
      equipment[slotKey] = customEntry;
      continue;
    }

    if (row?.is_rw || qualityBadge(row) === 'RW') {
      if (location !== 'Gear') {
        skipped.push(skippedTswItem(row, 'uncatalogued'));
        continue;
      }
      const slotKey = TSW_SLOT_TO_EQUIPMENT[String(row.slot || '')];
      if (!slotKey) {
        skipped.push(skippedTswItem(row, 'unknown-slot'));
        continue;
      }
      const defId = resolveTswRunewordDefId(row, cat);
      if (!defId) {
        skipped.push(skippedTswItem(row, 'uncatalogued'));
        continue;
      }
      const templateId = String(defId).split(':').slice(0, 2).join(':');
      const rwDef = cat.byId[defId] || cat.byId[templateId] || null;
      /**
       * @type {{
       *   defId: string,
       *   icon?: string,
       *   extras?: string[],
       *   mysticOrbs?: Array<[number, string]>,
       *   ethereal?: boolean,
        }} */
      const entry = { defId };
      const icon = row?.image != null ? String(row.image).trim() : '';
      if (icon) entry.icon = icon;
      attachTswInstanceExtras(entry, row, rwDef);
      equipment[slotKey] = entry;
      continue;
    }

    const defId = resolveTswItemDefId(row, cat);
    const def = defId ? cat.byId[defId] : null;
    if (!defId || !def || !isCatalogBacked(row, def)) {
      skipped.push(skippedTswItem(row, 'uncatalogued'));
      continue;
    }

    if (location === 'Gear') {
      const slotKey = TSW_SLOT_TO_EQUIPMENT[String(row.slot || '')];
      if (!slotKey) {
        skipped.push(skippedTswItem(row, 'unknown-slot'));
        continue;
      }
      if (isCharmItem(def) || isRelicItem(def)) {
        skipped.push(skippedTswItem(row, 'uncatalogued'));
        continue;
      }
      equipment[slotKey] = snapshotWithRolls(
        row,
        defId,
        def,
        className,
        setDumpContextForDef(def, cat)
      );
      continue;
    }

    if (isRelicItem(def) || looksLikeRelic(row)) {
      if (seenRelics.has(defId) || relics.length >= MAX_RELICS) {
        skipped.push(skippedTswItem(row, 'relic-cap'));
        continue;
      }
      seenRelics.add(defId);
      relics.push(snapshotWithRolls(row, defId, def, className));
      continue;
    }

    if (isCharmItem(def) || row.is_charm) {
      if (seenCharms.has(defId)) continue;
      seenCharms.add(defId);
      charms.push(snapshotWithRolls(row, defId, def, className));
      continue;
    }

    skipped.push(skippedTswItem(row, 'uncatalogued'));
  }

  return {
    snapshot: { weaponSet: 0, equipment, charms, relics },
    skipped,
  };
}

/**
 * @param {unknown} payload
 * @returns {Record<string, number>}
 */
function oskillImportPayloadToMap(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return /** @type {Record<string, number>} */ (payload);
  }
  /** @type {Record<string, number>} */
  const map = {};
  if (!Array.isArray(payload)) return map;
  for (const row of payload) {
    const id = row?.skillName != null ? String(row.skillName).trim() : '';
    if (!id) continue;
    map[id] = (map[id] || 0) + Character.clampOSkillPoints(row.points ?? 0);
  }
  return map;
}

/**
 * After item-granted oSkills are synced, add leftover TSW totals as hard points.
 * @param {unknown} tswOSkills
 * @returns {{ skipped: Array<{ key: string, wantedLevel: number }> }}
 */
export function applyTswOSkillLeftovers(tswOSkills) {
  const character = getCharacterInstance();
  const { payload, skipped } = normalizeBuildOSkillsForImport(tswOSkills);
  if (!character) return { skipped };
  const map = oskillImportPayloadToMap(payload);
  for (const [id, wantedRaw] of Object.entries(map)) {
    const wanted = Character.clampOSkillPoints(wantedRaw);
    const itemPts = Character.clampOSkillPoints(character.getOSkillItemPoints(id));
    const leftover = Math.max(0, wanted - itemPts);
    let row = character.oSkills.find((s) => s.skillName === id);
    if (!row) {
      if (leftover <= 0) continue;
      const cat = resolveCatalogRowBySkillRef(id);
      character.oSkills.push({
        skillName: id,
        displayName: cat?.displayName ?? id,
        image: cat?.image,
        className: cat?.class,
        points: leftover,
        itemPoints: 0,
        hasDetails: true,
        slotId: Character.newOSkillSlotId(),
      });
      continue;
    }
    const maxManual = Math.max(0, Character.OSKILL_MAX_POINTS - itemPts);
    row.points = Math.min(maxManual, leftover);
  }
  return { skipped };
}
