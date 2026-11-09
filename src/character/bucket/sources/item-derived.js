/**
 * @file Item stat conversions that are a share of another stat
 * (`X% of <source> added as <target>`).
 *
 * Runs after items + derived pools so the source stat (resistance, defense, life) is
 * already computed, and before skills so caster damage sees the result. Source stats
 * are read from the committed snapshot; one pass is enough because none of the
 * supported rules feed their own source.
 *
 * @module character/bucket/sources/item-derived
 */

import { createContribution, createSource } from '@/character/bucket/contributions.js';

/**
 * @typedef {object} DerivedItemRule
 * @property {string} key Target stat key.
 * @property {string} sourceKey Stat the bonus is a share of.
 * @property {number} ratio Share of the source stat (0.2 = 20%).
 * @property {string} [text] Original modifier line.
 * @property {string} [sourceId] Owning item / set source id.
 * @property {string} [label] Owning item / set label.
 */

/**
 * @param {object} bucket
 * @param {{ rules?: DerivedItemRule[] }} input
 * @returns {{ contributions: number, applied: number }}
 */
export function applyItemDerivedSources(bucket, input) {
  if (!bucket) throw new Error('applyItemDerivedSources requires a bucket');
  const rules = Array.isArray(input?.rules) ? input.rules : [];
  if (rules.length === 0) return { contributions: 0, applied: 0 };

  const values = bucket.getSnapshot().values || {};
  /** @type {Map<string, { source: object, contributions: object[] }>} */
  const bySource = new Map();
  let applied = 0;

  for (const rule of rules) {
    const ratio = Number(rule?.ratio);
    const sourceValue = Number(values[String(rule?.sourceKey || '')]);
    if (!Number.isFinite(ratio) || ratio === 0) continue;
    if (!Number.isFinite(sourceValue) || sourceValue === 0) continue;
    const amount = sourceValue * ratio;
    if (!Number.isFinite(amount) || amount === 0) continue;

    const ownerId = String(rule.sourceId || 'item');
    const ownerLabel = String(rule.label || ownerId);
    const sourceId = `derived:${ownerId}`;
    if (!bySource.has(sourceId)) {
      bySource.set(sourceId, {
        source: createSource({ kind: 'derived', id: sourceId, label: `${ownerLabel} (derived)` }),
        contributions: [],
      });
    }
    const entry = bySource.get(sourceId);
    const lineSource = createSource({
      kind: 'derived',
      id: sourceId,
      label: `${ownerLabel} (derived)`,
      ...(rule.text ? { line: String(rule.text) } : {}),
    });
    entry.contributions.push(
      createContribution({
        id: `${sourceId}:${rule.key}:${rule.sourceKey}`,
        stat: rule.key,
        op: 'base',
        stage: 'pre',
        value: amount,
        source: lineSource,
      })
    );
    applied += 1;
  }

  for (const [sourceId, entry] of bySource) {
    bucket.setSource('items', sourceId, {
      contributions: entry.contributions,
      reports: [],
    });
  }
  return { contributions: applied, applied };
}
