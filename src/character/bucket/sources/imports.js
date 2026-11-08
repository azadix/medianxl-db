/**
 * @file Imported-stat source: TSW/d2s `{{stat}}=value` blobs.
 *
 * `mode: 'totals'` (TSW) treats values as final in-game totals: non-attribute stats
 * become visible overrides; the four attributes are base values and replace the
 * class/allocation attribute sources.
 *
 * `mode: 'base'` (d2s) treats values as base values: they become BASE contributions
 * and pool stats replace the class pool / derived-attribute contribution.
 *
 * @module character/bucket/sources/imports
 */

import { createContribution, createSource } from '@/character/bucket/contributions.js';

const ATTRIBUTE_KEYS = Object.freeze(['strength', 'dexterity', 'vitality', 'energy']);

/**
 * @param {string|null|undefined} text
 * @returns {Array<{ key: string, value: number }>}
 */
export function parseImportedStatsText(text) {
  /** @type {Map<string, number>} */
  const byKey = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^\s*\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}\s*=\s*(-?\d+(?:\.\d+)?)\s*$/.exec(
      line
    );
    if (!match) continue;
    const key = String(match[1]).trim().toLowerCase();
    const value = Number(match[2]);
    if (!key || !Number.isFinite(value)) continue;
    byKey.set(key, value);
  }
  return [...byKey].map(([key, value]) => ({ key, value }));
}

/**
 * @param {object} bucket
 * @param {{
 *   text?: string|null,
 *   mode?: 'totals'|'base',
 *   attributeKeys?: string[],
 * }} [input]
 * @returns {{ mode: string, stats: number, overrides: number, attributes: number, base: number }}
 */
export function applyImportedStats(bucket, input = {}) {
  if (!bucket) throw new Error('applyImportedStats requires a bucket');
  const mode = input.mode === 'base' ? 'base' : 'totals';
  const attributeKeys = new Set(input.attributeKeys || ATTRIBUTE_KEYS);

  bucket.removeSource('base', 'import:attributes');
  bucket.removeSource('base', 'import:overrides');
  bucket.removeSource('base', 'import:base');

  const entries = parseImportedStatsText(input.text);
  bucket.setImportedStats(entries);
  if (entries.length === 0) {
    return { mode, stats: 0, overrides: 0, attributes: 0, base: 0 };
  }

  const source = createSource({ kind: 'import', id: 'game', label: 'Imported from game' });
  /** @type {object[]} */
  const attributeContributions = [];

  for (const { key, value } of entries) {
    if (key === 'current_life' || key === 'current_mana') continue;
    if (!attributeKeys.has(key)) continue;
    attributeContributions.push(
      createContribution({
        id: `import:attr:${key}`,
        stat: key,
        op: 'base',
        stage: 'pre',
        value,
        source,
      })
    );
  }

  if (attributeContributions.length) {
    // Imported attributes are base totals, not additions on top of the class baseline.
    bucket.removeSource('base', 'class:attributes');
    bucket.removeSource('base', 'allocation');
    bucket.setSource('base', 'import:attributes', {
      contributions: attributeContributions,
    });
  }

  return {
    mode,
    stats: entries.length,
    overrides: 0,
    attributes: attributeContributions.length,
    base: 0,
  };
}
