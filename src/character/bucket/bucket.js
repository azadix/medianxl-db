/**
 * @file Character bucket: stores contributions by compartment and evaluates snapshots.
 * @module character/bucket
 */

import { createStatRegistry, getRegistryDependencies, fallbackStatDef } from './registry.js';
import { evaluateStat } from './evaluator.js';
import { buildDependencyGraph } from './dependencies.js';
import { createCharacterSnapshot } from './snapshot.js';
import { createSource } from './contributions.js';
import { expandContributionAliases } from './aliases.js';

/** Compartments in precedence/display order. */
export const COMPARTMENTS = Object.freeze([
  'base',
  'items',
  'skills',
  'debuffs',
  'overrides',
]);

/** @type {Readonly<Record<string, string>>} */
const COMPARTMENT_SOURCE_KIND = Object.freeze({
  base: 'class',
  items: 'item',
  skills: 'skill',
  debuffs: 'condition',
  overrides: 'import',
});

/**
 * @param {string} compartment
 * @returns {string}
 */
function requireCompartment(compartment) {
  const key = String(compartment ?? '').trim().toLowerCase();
  if (!COMPARTMENTS.includes(key)) {
    throw new Error(`Unknown bucket compartment: ${compartment}`);
  }
  return key;
}

/**
 * @param {object} input
 * @returns {object}
 */
function normalizePayload(input) {
  if (Array.isArray(input)) return { contributions: input, reports: [] };
  if (!input || typeof input !== 'object') return { contributions: [], reports: [] };
  return {
    contributions: Array.isArray(input.contributions) ? input.contributions : [],
    reports: Array.isArray(input.reports) ? input.reports : [],
  };
}

/**
 * @param {string} compartment
 * @param {string} sourceId
 * @param {object} report
 * @returns {object}
 */
function normalizeReport(compartment, sourceId, report) {
  const source =
    report?.source && report.source.kind
      ? report.source
      : createSource({
          kind: COMPARTMENT_SOURCE_KIND[compartment] || 'manual',
          id: sourceId,
          label: sourceId,
        });
  return { ...report, source };
}

/**
 * @typedef {object} CharacterBucket
 * @property {(compartment: string, sourceId: string, payload: object|object[]) => void} setSource Replace one source's contributions and reports.
 * @property {(compartment: string, sourceId: string) => void} removeSource Drop one source.
 * @property {(itemId: string, reports: object[]) => void} setUniqueMods Replace an item's unique-modifier reports.
 * @property {(itemId: string) => void} removeUniqueMods Drop an item's unique-modifier reports.
 * @property {(compartment: string) => void} clearCompartment Remove every source in a compartment.
 * @property {() => void} clearUniqueMods Remove every unique-modifier report.
 * @property {(keys: Iterable<string>) => void} setConditions Replace the selected condition set.
 * @property {() => object} getSnapshot Evaluate if needed and return the snapshot.
 * @property {() => object} commit Evaluate and notify subscribers.
 * @property {(stat: string) => number} getStat Read one evaluated value.
 * @property {(stat: string) => object|undefined} getBreakdown Read one breakdown.
 * @property {() => object[]} getUnsupported List unsupported reports.
 * @property {(listener: (snapshot: object) => void) => () => void} subscribe Listen for commits.
 * @property {() => void} clear Remove all sources and reset the revision.
 * @property {number} revision Current revision.
 */

/**
 * @param {{ registry?: import('./registry.js').StatRegistry, expandAliases?: boolean }} [options]
 * @returns {CharacterBucket}
 */
export function createCharacterBucket(options = {}) {
  const registry = options.registry || createStatRegistry([]);
  const expandAliases = options.expandAliases !== false;
  /** @type {Map<string, { compartment: string, sourceId: string, contributions: object[], reports: object[] }>} */
  const sources = new Map();
  /** @type {Map<string, object[]>} */
  const uniqueMods = new Map();
  /** @type {Set<string>} */
  let conditions = new Set();
  /** @type {Map<string, number>} Imported game totals used for comparison only. */
  let importedStats = new Map();
  /** @type {import('./snapshot.js').CharacterSnapshot|null} */
  let snapshot = null;
  let dirty = true;
  let needsNotify = false;
  let revision = 0;
  /** @type {Set<(snapshot: object) => void>} */
  const listeners = new Set();

  function markDirty() {
    dirty = true;
    needsNotify = true;
  }

  /**
   * @param {string} compartment
   * @param {string} sourceId
   * @param {object|object[]} payload
   */
  function setSource(compartment, sourceId, payload) {
    const comp = requireCompartment(compartment);
    const id = String(sourceId ?? '').trim();
    if (!id) throw new Error('Bucket source id is required');
    const normalized = normalizePayload(payload);
    const key = `${comp}\u0000${id}`;
    if (normalized.contributions.length === 0 && normalized.reports.length === 0) {
      sources.delete(key);
    } else {
      sources.set(key, {
        compartment: comp,
        sourceId: id,
        contributions: normalized.contributions,
        reports: normalized.reports.map((report) => normalizeReport(comp, id, report)),
      });
    }
    markDirty();
  }

  /**
   * @param {string} compartment
   * @param {string} sourceId
   */
  function removeSource(compartment, sourceId) {
    const comp = requireCompartment(compartment);
    sources.delete(`${comp}\u0000${String(sourceId ?? '').trim()}`);
    markDirty();
  }

  /**
   * @param {string} itemId
   * @param {object[]} reports
   */
  function setUniqueMods(itemId, reports) {
    const id = String(itemId ?? '').trim();
    if (!id) throw new Error('Unique modifier item id is required');
    if (!Array.isArray(reports) || reports.length === 0) uniqueMods.delete(id);
    else uniqueMods.set(id, reports.slice());
    markDirty();
  }

  /** @param {string} itemId */
  function removeUniqueMods(itemId) {
    uniqueMods.delete(String(itemId ?? '').trim());
    markDirty();
  }

  /** @param {string} compartment */
  function clearCompartment(compartment) {
    const comp = requireCompartment(compartment);
    for (const [key, source] of sources) {
      if (source.compartment === comp) sources.delete(key);
    }
    markDirty();
  }

  function clearUniqueMods() {
    uniqueMods.clear();
    markDirty();
  }

  /** @param {Iterable<string>} keys */
  function setConditions(keys) {
    conditions = new Set(
      [...(keys || [])].map((key) => String(key).trim().toLowerCase()).filter(Boolean)
    );
    markDirty();
  }

  /**
   * @returns {{ byStat: Map<string, object[]>, unsupported: object[], ignored: object[], unique: object[], allStats: string[] }}
   */
  function collect() {
    /** @type {Map<string, object[]>} */
    const byStat = new Map();
    /** @type {object[]} */
    const unsupported = [];
    /** @type {object[]} */
    const ignored = [];
    /** @type {object[]} */
    const flavor = [];
    /** @type {object[]} */
    const unique = [];
    /** @type {Set<string>} */
    const stats = new Set();

    for (const source of sources.values()) {
      for (const contribution of source.contributions) {
        const expandedList = expandAliases
          ? expandContributionAliases(contribution)
          : [contribution];
        for (const expanded of expandedList) {
          const stat = String(expanded.stat ?? '').trim().toLowerCase();
          if (!stat) continue;
          stats.add(stat);
          if (!byStat.has(stat)) byStat.set(stat, []);
          byStat.get(stat).push(expanded);
        }
      }
      for (const report of source.reports) {
        if (report.status === 'unsupported') unsupported.push(report);
        else if (report.status === 'ignored') ignored.push(report);
        else if (report.status === 'flavor') flavor.push(report);
      }
    }
    for (const [itemId, reports] of uniqueMods) {
      for (const report of reports) {
        const entry = normalizeReport('items', itemId, { ...report, unique: true });
        unique.push(entry);
        if (entry.status !== 'supported') unsupported.push(entry);
      }
    }
    for (const key of registry.keys()) stats.add(key);
    return { byStat, unsupported, ignored, flavor, unique, allStats: [...stats] };
  }

  function evaluate() {
    const collected = collect();
    const graph = buildDependencyGraph(
      collected.allStats,
      getRegistryDependencies(registry)
    );
    /** @type {Map<string, { value: number, breakdown: object }>} */
    const stats = new Map();
    for (const stat of graph.order) {
      const def = registry.get(stat) || fallbackStatDef(stat);
      const breakdown = evaluateStat({
        registry,
        stat,
        contributions: collected.byStat.get(stat) || [],
        selectedConditions: conditions,
      });
      breakdown.def = def;
      stats.set(stat, { value: breakdown.value, breakdown });
    }
    revision += 1;
    snapshot = createCharacterSnapshot({
      revision,
      stats,
      unsupported: collected.unsupported,
      ignored: collected.ignored,
      flavor: collected.flavor,
      uniqueMods: collected.unique,
      imported: Object.fromEntries(importedStats),
      conditions: [...conditions].sort(),
      cycles: graph.cycles,
    });
    dirty = false;
    return snapshot;
  }

  function getSnapshot() {
    if (!snapshot || dirty) evaluate();
    return /** @type {object} */ (snapshot);
  }

  function commit() {
    const shouldNotify = needsNotify;
    const next = getSnapshot();
    if (shouldNotify) {
      needsNotify = false;
      for (const listener of listeners) {
        try {
          listener(next);
        } catch {
          // A UI subscriber must not break the commit.
        }
      }
    }
    return next;
  }

  function getStat(stat) {
    return getSnapshot().getValue(stat);
  }

  function getBreakdown(stat) {
    return getSnapshot().getBreakdown(stat);
  }

  function getUnsupported() {
    return [...getSnapshot().unsupported];
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('Bucket listener must be a function');
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function clear() {
    sources.clear();
    uniqueMods.clear();
    conditions = new Set();
    importedStats = new Map();
    snapshot = null;
    revision = 0;
    dirty = true;
    needsNotify = false;
  }

  return {
    setSource,
    removeSource,
    setUniqueMods,
    removeUniqueMods,
    clearCompartment,
    clearUniqueMods,
    setConditions,
    setImportedStats(entries) {
      importedStats = new Map();
      for (const entry of entries || []) {
        const key = String(entry?.key || '').trim().toLowerCase();
        const value = Number(entry?.value);
        if (key && Number.isFinite(value)) importedStats.set(key, value);
      }
      markDirty();
    },
    getSnapshot,
    commit,
    getStat,
    getBreakdown,
    getUnsupported,
    subscribe,
    clear,
    get revision() {
      return revision;
    },
  };
}
