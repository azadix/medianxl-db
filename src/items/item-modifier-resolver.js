/**
 * @file Resolve rendered item lines into bucket contributions, reports and unique mods.
 *
 * Phase 2 step 1 keeps the existing line renderer/classifier as the source of truth but
 * gives every line a stable id, a source, a support status and a cache key. The parser
 * can then be replaced family-by-family without changing the bucket contract.
 *
 * @module items/item-modifier-resolver
 */

import { getItemStatLines } from '@/items/item-stats.js';
import {
  createContribution,
  createSource,
  flavorReport,
  ignoredReport,
  supportedReport,
  unsupportedReport,
} from '@/character/bucket/contributions.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import {
  getItemDefinitionTemplate,
  getItemModifierTemplate,
  isFlavorItemLine,
} from '@/items/item-modifier-template.js';
import { stripProcLinePrefix } from '@/items/item-procs.js';
import {
  decodeModifierLine,
  MODIFIER_COLOR_GREY,
  MODIFIER_COLOR_ORANGE,
} from '@/items/item-modifier-line.js';

export { isFlavorItemLine };

const MAX_CACHE_ENTRIES = 2000;

/** @type {Map<string, { contributions: object[], reports: object[], uniqueMods: object[], lines: string[] }>} */
const _resolvedCache = new Map();

/**
 * Deterministic serialization for cache keys.
 * @param {unknown} value
 * @param {Set<object>} [seen]
 * @returns {string}
 */
function stableStringify(value, seen = new Set()) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'string') return JSON.stringify(value);
  if (type !== 'object') return JSON.stringify(String(value));
  if (seen.has(/** @type {object} */ (value))) return '"[circular]"';
  seen.add(/** @type {object} */ (value));
  let out;
  if (Array.isArray(value)) {
    out = `[${value.map((entry) => stableStringify(entry, seen)).join(',')}]`;
  } else {
    const keys = Object.keys(/** @type {object} */ (value)).sort();
    const record = /** @type {Record<string, unknown>} */ (value);
    out = `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key], seen)}`)
      .join(',')}}`;
  }
  seen.delete(/** @type {object} */ (value));
  return out;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {object} options
 * @param {{ sourceKind?: string, sourceId?: string, label?: string, slot?: string }} [context]
 * @returns {string}
 */
export function itemModifierSignature(def, rolls, options = {}, context = {}) {
  const defKey = getItemDefinitionTemplate(def).signature;
  return [
    defKey,
    stableStringify(rolls ?? null),
    stableStringify(options ?? {}),
    context.sourceKind || 'item',
    context.sourceId || '',
    context.label || '',
    context.slot || '',
  ].join('|');
}

/**
 * Whether the skill data store is loaded; without it the legacy classifier cannot
 * resolve stat patterns, so tooltips should not label every line unsupported.
 * @returns {boolean}
 */
function classifierReady() {
  return Boolean(getFileSkillStore());
}

/**
 * @param {string} text
 * @returns {string}
 */
function supportKey(text) {
  return String(text || '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^\s*\+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Support metadata for item tooltip lines: normalized text -> reason/unique.
 * @param {object} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {object} options
 * @returns {{ byText: Map<string, { reason: string, unique: boolean }> }}
 */
export function getItemLineSupport(def, rolls, options = {}) {
  /** @type {Map<string, { reason: string, unique: boolean }>} */
  const byText = new Map();
  if (!def || !classifierReady()) return { byText };
  const resolved = resolveItemModifiers(def, rolls, options, {
    sourceId: 'tooltip',
    label: String(def.name || def.id || 'Item'),
    characterLevel: options.characterLevel ?? null,
  });
  for (const report of resolved.reports) {
    if (report.status !== 'unsupported') continue;
    byText.set(supportKey(report.text), {
      reason: report.reason || 'unsupported',
      unique: report.unique === true,
    });
  }
  for (const report of resolved.uniqueMods) {
    byText.set(supportKey(report.text), {
      reason: report.reason || 'unique-mechanic',
      unique: true,
    });
  }
  return { byText };
}

/**
 * @param {string[]} lines
 * @param {{
 *   sourceKind?: 'item'|'set',
 *   sourceId: string,
 *   label: string,
 *   slot?: string,
 *   characterLevel?: number|null,
 * }} context
 * @returns {{ contributions: object[], reports: object[], uniqueMods: object[] }}
 */
export function resolveModifierLines(lines, context) {
  /** @type {object[]} */
  const contributions = [];
  /** @type {object[]} */
  const reports = [];
  /** @type {object[]} */
  const uniqueMods = [];
  let insideUnique = false;

  const list = Array.isArray(lines) ? lines : [];
  for (let index = 0; index < list.length; index++) {
    const line = list[index];
    const decoded = decodeModifierLine(line);
    const text = decoded.text || String(line ?? '');
    if (!text.trim()) continue;
    const source = createSource({
      kind: context.sourceKind === 'set' ? 'set' : 'item',
      id: context.sourceId,
      label: context.label,
      slot: context.slot,
      line: text,
    });
    const lineId = `${context.sourceKind || 'item'}:${context.sourceId}:${index}`;
    const conditions = decoded.showCondition;
    const plainText = stripProcLinePrefix(text).replace(/^\[[^\]]+\]\s*/, '');
    const template = getItemModifierTemplate(plainText, {
      characterLevel: context.characterLevel ?? null,
    });

    // Flavor wins over the orange/grey unique styling: prose inside a unique item is
    // still display-only and must never get a Not supported badge.
    if (template.flavor) {
      reports.push(
        flavorReport({
          id: `${lineId}:flavor`,
          text,
          source,
          conditions,
        })
      );
      insideUnique = false;
      continue;
    }
    // Ethereal is a supported item state flag, not an unknown stat.
    if (/^ethereal$/i.test(plainText)) {
      reports.push(
        supportedReport({
          id: `${lineId}:ethereal`,
          text,
          source,
          reason: 'item-state-flag',
          conditions,
        })
      );
      insideUnique = false;
      continue;
    }

    if (decoded.color === MODIFIER_COLOR_ORANGE) {
      insideUnique = true;
      uniqueMods.push(
        unsupportedReport({
          id: `${lineId}:unique`,
          text,
          source,
          reason: 'unique-mechanic',
          conditions,
          unique: true,
        })
      );
      continue;
    }
    if (decoded.color === MODIFIER_COLOR_GREY) {
      const report = unsupportedReport({
        id: `${lineId}:grey`,
        text,
        source,
        reason: insideUnique ? 'unique-mechanic' : 'conditional-not-modelled',
        conditions,
        unique: insideUnique,
      });
      if (insideUnique) uniqueMods.push(report);
      else reports.push(report);
      continue;
    }
    insideUnique = false;

    const classified = template.classified;
    if (classified.kind === 'parsed' && classified.bonuses.length > 0) {
      for (const bonus of classified.bonuses) {
        contributions.push(
          createContribution({
            id: `${lineId}:${bonus.key}`,
            stat: bonus.key,
            op: 'base',
            stage: 'pre',
            value: bonus.amount,
            source,
            conditions,
          })
        );
      }
      continue;
    }
    if (classified.kind === 'parsed') {
      reports.push(
        ignoredReport({
          id: `${lineId}:empty`,
          text,
          source,
          reason: 'no-amount',
          conditions,
        })
      );
      continue;
    }
    if (classified.kind === 'unknown') {
      reports.push(
        unsupportedReport({
          id: `${lineId}:unknown`,
          text,
          source,
          reason: 'unknown-stat',
          conditions,
        })
      );
      continue;
    }
    if (classified.kind === 'inactive') {
      reports.push(
        unsupportedReport({
          id: `${lineId}:inactive`,
          text,
          source,
          reason: 'conditional-inactive',
          conditions,
        })
      );
      continue;
    }
    if (classified.kind === 'skill') {
      reports.push(
        ignoredReport({
          id: `${lineId}:skill`,
          text,
          source,
          reason: 'handled-by-skill-grants',
          conditions,
        })
      );
      continue;
    }
    reports.push(
      ignoredReport({
        id: `${lineId}:ignored`,
        text,
        source,
        reason: 'non-stat',
        conditions,
      })
    );
  }
  return { contributions, reports, uniqueMods };
}

/**
 * Resolve one item instance (catalog def + rolls/options) into bucket data.
 * @param {object} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {object} options
 * @param {{ sourceKind?: 'item'|'set', sourceId: string, label: string, slot?: string, characterLevel?: number|null }} context
 * @returns {{ contributions: object[], reports: object[], uniqueMods: object[], lines: string[], signature: string }}
 */
export function resolveItemModifiers(def, rolls, options, context) {
  const signature = itemModifierSignature(def, rolls, options, context);
  const hit = _resolvedCache.get(signature);
  if (hit) return { ...hit, signature };
  const lines = getItemStatLines(def, rolls, {
    characterLevel: context.characterLevel ?? null,
    ...options,
  });
  const resolved = resolveModifierLines(lines, context);
  const entry = { ...resolved, lines };
  if (_resolvedCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = _resolvedCache.keys().next().value;
    if (oldest != null) _resolvedCache.delete(oldest);
  }
  _resolvedCache.set(signature, entry);
  return { ...entry, signature };
}

/** Clear the resolver cache (catalog/version changes, tests). */
export function clearItemModifierCache() {
  _resolvedCache.clear();
}

/**
 * @returns {{ size: number }} Cache stats for tests/dev tools.
 */
export function getItemModifierCacheStats() {
  return { size: _resolvedCache.size };
}
