/**
 * @file Versioned item/set/rune/MO lookup for patch-note `[[Name]]` markers.
 * Does not use the Pinia items store or global mystic-orb / socketable catalogs.
 * @module items/patch-item-catalog
 */

import { getAssetUrl } from '@/shared/utils.js';
import { resolveSetBonuses } from '@/items/item-overlays.js';
import { runewordEntryToItemDef } from '@/items/runeword-items.js';
import { buildCatalogFromUniqueStats } from '@/items/unique-stats-catalog.js';

/** @type {Map<string, object|null>} */
const catalogsByFolder = new Map();
/** @type {Map<string, Promise<object|null>>} */
const inflightByFolder = new Map();

/**
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function normalizePatchItemName(value) {
  return String(value || '').trim();
}

/**
 * @param {Response|null|undefined} res
 * @returns {Promise<unknown>}
 */
async function readJsonIfOk(res) {
  if (!res?.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * @param {string} url
 * @returns {Promise<Response|null>}
 */
async function fetchCatalogFile(url) {
  try {
    return await fetch(url);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} data
 * @returns {unknown[]}
 */
function asArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray(data.entries)) return data.entries;
  return [];
}

/**
 * @param {object|null|undefined} def
 * @returns {number}
 */
function itemPreferenceScore(def) {
  if (!def || typeof def !== 'object') return 0;
  const rarity = String(def.rarity || '');
  const uniqueKind = String(def.uniqueKind || '');
  const category = String(def.category || '');
  const type = String(def.type || '');
  if (rarity === 'unique' && uniqueKind === 'su') return 1000;
  if (rarity === 'set') return 900;
  if (rarity === 'unique' && uniqueKind === 'tiered') return 800 + (Number(def.tier) || 0);
  if (rarity === 'unique') return 700;
  if (rarity === 'runeword') return 600;
  if (rarity === 'relic' || category === 'relics') return 500;
  if (category === 'charms' || type === 'charm') return 400;
  return 100;
}

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
export function mysticOrbHighlightClass(row) {
  const kind = String(row?.kind || '');
  if (kind === 'smo') return 'item-tooltip-sock__name--rare';
  if (kind === 'umo' || kind === 'effigy') return 'item-tooltip-sock__name--unique';
  if (kind === 'mo') return 'item-tooltip-sock__name--magic';
  const label = String(row?.name || '').trim();
  if (/^rare\s+mo\b/i.test(label)) return 'item-tooltip-sock__name--rare';
  if (/^mo\s*-/i.test(label)) return 'item-tooltip-sock__name--magic';
  return 'item-tooltip-sock__name--unique';
}

/**
 * @param {object} def
 * @returns {object}
 */
function normalizeCharmDef(def) {
  return {
    ...def,
    type: def.type || 'charm',
    category: def.category || 'charms',
    keepInInventory: true,
    slot: def.slot ?? null,
    invWidth: def.invWidth || 1,
    invHeight: def.invHeight || 1,
    reqStr: def.reqStr ?? 0,
    reqDex: def.reqDex ?? 0,
  };
}

/**
 * @param {object} def
 * @returns {object}
 */
function normalizeRelicDef(def) {
  return {
    ...def,
    type: def.type || 'jewl',
    category: def.category || 'relics',
    rarity: def.rarity || 'relic',
    keepInInventory: true,
    slot: def.slot ?? null,
    invWidth: def.invWidth || 1,
    invHeight: def.invHeight || 1,
    reqStr: def.reqStr ?? 0,
    reqDex: def.reqDex ?? 0,
  };
}

/**
 * @param {object} catalog
 * @param {string} name
 * @param {object} record
 * @param {number} score
 */
function putRecord(catalog, name, record, score) {
  const lowered = normalizePatchItemName(name).toLowerCase();
  if (!lowered) return;
  const prev = catalog.recordsByLowered.get(lowered);
  if (prev && prev.score >= score) return;
  catalog.recordsByLowered.set(lowered, { ...record, score, loweredName: lowered });
}

/**
 * Build an in-memory patch-note item catalog from already-parsed JSON.
 * @param {{
 *   folderKey?: string,
 *   bases?: unknown,
 *   charms?: unknown,
 *   other?: unknown,
 *   relics?: unknown,
 *   uniqueStats?: unknown,
 *   runewords?: unknown,
 *   socketables?: unknown,
 *   mysticOrbs?: unknown,
 * }} data
 * @returns {object}
 */
export function buildPatchItemCatalogFromData(data = {}) {
  const folderKey = String(data.folderKey || '');
  const bases = asArray(data.bases).filter((row) => row && typeof row === 'object');
  const other = asArray(data.other).filter((row) => row && typeof row === 'object');
  const charms = asArray(data.charms)
    .filter((row) => row && typeof row === 'object')
    .map(normalizeCharmDef);
  const relics = asArray(data.relics)
    .filter((row) => row && typeof row === 'object')
    .map(normalizeRelicDef);
  const basesForMatch = [...bases, ...other];

  let overlays;
  let sets;
  try {
    const built = buildCatalogFromUniqueStats(data.uniqueStats, basesForMatch);
    overlays = Array.isArray(built.items) ? built.items : [];
    sets = Array.isArray(built.sets) ? built.sets : [];
  } catch {
    overlays = [];
    sets = [];
  }

  const runewords = asArray(data.runewords)
    .map((entry) => runewordEntryToItemDef(entry))
    .filter(Boolean);

  const items = [...bases, ...charms, ...other, ...overlays, ...relics, ...runewords];
  const setsById = new Map(sets.map((setDef) => [setDef.id, setDef]));
  const piecesBySetId = new Map();
  for (const def of items) {
    if (!def?.setId) continue;
    const list = piecesBySetId.get(def.setId) || [];
    list.push(def);
    piecesBySetId.set(def.setId, list);
  }

  /** @type {{ folderKey: string, recordsByLowered: Map<string, object>, setsByLowered: Map<string, object> }} */
  const catalog = {
    folderKey,
    recordsByLowered: new Map(),
    setsByLowered: new Map(),
  };

  for (const setDef of sets) {
    const displayName = normalizePatchItemName(setDef.name);
    if (!displayName) continue;
    const pieces = (piecesBySetId.get(setDef.id) || []).slice().sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''))
    );
    catalog.setsByLowered.set(displayName.toLowerCase(), {
      kind: 'set',
      folderKey,
      displayName,
      rarity: 'set',
      setDef,
      pieces,
    });
  }

  for (const def of items) {
    const displayName = normalizePatchItemName(def.name);
    if (!displayName) continue;
    const setDef = def.setId ? setsById.get(def.setId) || null : null;
    const pieces = def.setId ? piecesBySetId.get(def.setId) || [] : [];
    const record = {
      kind: 'item',
      folderKey,
      displayName,
      rarity: def.rarity || 'normal',
      def,
      setDef,
      pieceCount: pieces.length,
    };
    const score = itemPreferenceScore(def);
    putRecord(catalog, displayName, record, score);
    const relicInner = /^Relic \((.+)\)$/i.exec(displayName);
    if (relicInner) {
      putRecord(catalog, relicInner[1], { ...record, displayName: relicInner[1] }, score - 1);
    }
  }

  for (const row of asArray(data.socketables)) {
    if (!row || typeof row !== 'object') continue;
    if (String(row.type || '').toLowerCase() !== 'rune') continue;
    const displayName = normalizePatchItemName(row.name);
    if (!displayName) continue;
    putRecord(
      catalog,
      displayName,
      {
        kind: 'rune',
        folderKey,
        displayName,
        rarity: 'rune',
        row,
      },
      50
    );
  }

  for (const row of asArray(data.mysticOrbs)) {
    if (!row || typeof row !== 'object') continue;
    const displayName = normalizePatchItemName(row.name);
    if (!displayName) continue;
    const record = {
      kind: 'mo',
      folderKey,
      displayName,
      rarity: 'mo',
      row,
    };
    putRecord(catalog, displayName, record, 40);
    for (const alias of Array.isArray(row.aliases) ? row.aliases : []) {
      putRecord(catalog, alias, { ...record, displayName: normalizePatchItemName(alias) || displayName }, 40);
    }
  }

  return catalog;
}

/**
 * @param {string} folderKey
 * @returns {Promise<object|null>}
 */
export async function loadPatchItemCatalogForFolder(folderKey) {
  const key = String(folderKey || '');
  if (!key) return null;
  if (catalogsByFolder.has(key)) return catalogsByFolder.get(key) || null;
  if (inflightByFolder.has(key)) return inflightByFolder.get(key);

  const promise = (async () => {
    const prefix = `items/${key}`;
    const requiredNames = ['baseitems.json', 'charms.json', 'other.json'];
    const optionalNames = [
      'relics.json',
      'unique-stats-db.json',
      'runewords.json',
      'socketables.json',
      'mystic-orbs.json',
    ];
    try {
      const requiredRes = await Promise.all(
        requiredNames.map((file) => fetch(getAssetUrl(`${prefix}/${file}`)))
      );
      if (requiredRes.some((res) => !res?.ok)) {
        catalogsByFolder.set(key, null);
        return null;
      }
      const [bases, charms, other] = await Promise.all(requiredRes.map((res) => res.json()));
      const optionalRes = await Promise.all(
        optionalNames.map((file) => fetchCatalogFile(getAssetUrl(`${prefix}/${file}`)))
      );
      const [relics, uniqueStats, runewords, socketables, mysticOrbs] = await Promise.all(
        optionalRes.map((res) => readJsonIfOk(res))
      );
      const catalog = buildPatchItemCatalogFromData({
        folderKey: key,
        bases,
        charms,
        other,
        relics,
        uniqueStats,
        runewords,
        socketables,
        mysticOrbs,
      });
      catalogsByFolder.set(key, catalog);
      return catalog;
    } catch {
      catalogsByFolder.set(key, null);
      return null;
    } finally {
      inflightByFolder.delete(key);
    }
  })();

  inflightByFolder.set(key, promise);
  return promise;
}

/**
 * @param {string} folderKey
 * @returns {boolean}
 */
export function hasPatchItemCatalog(folderKey) {
  const catalog = catalogsByFolder.get(String(folderKey || ''));
  if (!catalog) return false;
  return catalog.setsByLowered.size > 0 || catalog.recordsByLowered.size > 0;
}

export function getPatchItemRecordByLoweredName(folderKey, loweredName) {
  const catalog = catalogsByFolder.get(String(folderKey || ''));
  if (!catalog) return null;
  const key = normalizePatchItemName(loweredName).toLowerCase();
  if (!key) return null;
  return catalog.setsByLowered.get(key) || catalog.recordsByLowered.get(key) || null;
}

/**
 * Lookup against a catalog object (tests / wrapping).
 * @param {object|null|undefined} catalog
 * @param {string} name
 * @returns {object|null}
 */
export function lookupPatchItemRecord(catalog, name) {
  if (!catalog) return null;
  const key = normalizePatchItemName(name).toLowerCase();
  if (!key) return null;
  return catalog.setsByLowered.get(key) || catalog.recordsByLowered.get(key) || null;
}

/**
 * @param {HTMLElement|null|undefined} target
 * @returns {object|null}
 */
export function getPatchItemRecordFromElement(target) {
  if (!target) return null;
  const folderKey = target.dataset.itemFolder || '';
  const loweredName = normalizePatchItemName(target.dataset.itemLoweredName).toLowerCase();
  const record = getPatchItemRecordByLoweredName(folderKey, loweredName);
  if (!record) return null;
  return { ...record, folderKey: record.folderKey || folderKey };
}

/**
 * @param {object} record
 * @returns {{ setName?: string, setBonuses?: ReturnType<typeof resolveSetBonuses> }}
 */
export function patchItemTooltipOptions(record) {
  if (!record || record.kind !== 'item' || !record.setDef) return {};
  return {
    setName: record.setDef.name || record.def?.setName,
    setBonuses: resolveSetBonuses(record.setDef, 0, record.pieceCount || 0),
  };
}

/**
 * @param {string} folderKey
 */
export function resetPatchItemCatalogCache(folderKey) {
  if (folderKey) {
    catalogsByFolder.delete(String(folderKey));
    inflightByFolder.delete(String(folderKey));
    return;
  }
  catalogsByFolder.clear();
  inflightByFolder.clear();
}

/**
 * Seed the folder cache (tests).
 * @param {string} folderKey
 * @param {object|null} catalog
 */
export function setPatchItemCatalogForFolder(folderKey, catalog) {
  catalogsByFolder.set(String(folderKey), catalog);
}
