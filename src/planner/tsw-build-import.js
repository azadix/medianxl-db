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
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import { slugify } from '@/items/unique-stats-catalog.js';
import {
  resolveCustomBaseDefId,
  tswCustomQuality,
  tswCustomSnapshotEntry,
} from '@/items/custom-items.js';

/** @type {Readonly<Record<string, string>>} */
export const TSW_SLOT_TO_EQUIPMENT = Object.freeze({
  Head: 'head',
  Neck: 'neck',
  Torso: 'tors',
  Hands: 'glov',
  Feet: 'feet',
  Waist: 'belt',
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
  return {
    build: { ...rec.build, __tswEnvelope: true },
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
 * @returns {{ list: object[], byId: Record<string, object> }}
 */
function catalogIndex(catalog) {
  if (!catalog || typeof catalog !== 'object') return { list: [], byId: {} };
  const rec = /** @type {{ catalog?: object[], catalogById?: Record<string, object> }} */ (catalog);
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
  return { list, byId };
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
  if (badge) push(`u:${slug}:${badge}`);
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
 * @param {object} row
 * @param {{ list: object[], byId: Record<string, object> }} cat
 * @returns {string|null}
 */
export function resolveTswItemDefId(row, cat) {
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
 * Map a TSW items dump onto `{ weaponSet, equipment, charms, relics }`.
 * @param {unknown} rows
 * @param {object} catalog
 * @returns {{ snapshot: { weaponSet: 0, equipment: Record<string, { defId: string, custom?: object, icon?: string }|null>, charms: Array<{ defId: string }>, relics: Array<{ defId: string }> }, skipped: Array<{ name: string, reason: string }> }}
 */
export function mapTswItemsToSnapshot(rows, catalog) {
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
  /** @type {Array<{ name: string, reason: string }>} */
  const skipped = [];

  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const name = tswItemDisplayName(row) || '(unnamed)';
    const location = String(row.location || '').trim();
    if (location !== 'Gear' && location !== 'Inventory') {
      skipped.push({ name, reason: 'stash' });
      continue;
    }

    const customQuality = tswCustomQuality(row);
    if (customQuality) {
      if (location !== 'Gear') {
        skipped.push({ name, reason: 'uncatalogued' });
        continue;
      }
      const slotKey = TSW_SLOT_TO_EQUIPMENT[String(row.slot || '')];
      if (!slotKey) {
        skipped.push({ name, reason: 'unknown-slot' });
        continue;
      }
      const defId = resolveCustomBaseDefId(row, cat, customQuality);
      const def = defId ? cat.byId[defId] : null;
      if (!defId || !def) {
        skipped.push({ name, reason: 'uncatalogued' });
        continue;
      }
      equipment[slotKey] = tswCustomSnapshotEntry(row, defId, customQuality);
      continue;
    }

    const defId = resolveTswItemDefId(row, cat);
    const def = defId ? cat.byId[defId] : null;
    if (!defId || !def || !isCatalogBacked(row, def)) {
      skipped.push({ name, reason: 'uncatalogued' });
      continue;
    }

    if (location === 'Gear') {
      const slotKey = TSW_SLOT_TO_EQUIPMENT[String(row.slot || '')];
      if (!slotKey) {
        skipped.push({ name, reason: 'unknown-slot' });
        continue;
      }
      if (isCharmItem(def) || isRelicItem(def)) {
        skipped.push({ name, reason: 'uncatalogued' });
        continue;
      }
      equipment[slotKey] = { defId };
      continue;
    }

    if (isRelicItem(def) || looksLikeRelic(row)) {
      if (seenRelics.has(defId) || relics.length >= MAX_RELICS) {
        skipped.push({ name, reason: 'relic-cap' });
        continue;
      }
      seenRelics.add(defId);
      relics.push({ defId });
      continue;
    }

    if (isCharmItem(def) || row.is_charm) {
      if (seenCharms.has(defId)) continue;
      seenCharms.add(defId);
      charms.push({ defId });
      continue;
    }

    skipped.push({ name, reason: 'uncatalogued' });
  }

  return {
    snapshot: { weaponSet: 0, equipment, charms, relics },
    skipped,
  };
}

/**
 * After item-granted oSkills are synced, add leftover TSW totals as hard points.
 * @param {unknown} tswOSkills
 * @returns {{ skipped: Array<{ key: string, wantedLevel: number }> }}
 */
export function applyTswOSkillLeftovers(tswOSkills) {
  const character = getCharacterInstance();
  const { map, skipped } = normalizeBuildOSkillsForImport(tswOSkills);
  if (!character) return { skipped };
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
