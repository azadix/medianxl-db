/**
 * @file Immutable character snapshot consumed by the UI.
 * @module character/bucket/snapshot
 */

/**
 * @typedef {object} CharacterSnapshot
 * @property {number} revision Monotonic evaluation revision.
 * @property {(stat: string) => number} getValue Numeric lookup with a 0 fallback.
 * @property {(stat: string) => object|undefined} getBreakdown Breakdown data lookup.
 * @property {(stat: string) => object|undefined} getStat Value + breakdown lookup.
 * @property {Record<string, number>} values All evaluated numeric values.
 * @property {object[]} unsupported Unsupported modifier reports.
 * @property {object[]} ignored Known non-stat reports.
 * @property {object[]} flavor Lore/instruction lines kept for display only.
 * @property {object[]} uniqueMods Orange/unique modifier reports.
 * @property {Record<string, number>} imported Imported game totals for comparison only.
 * @property {string[]} conditions Selected condition keys.
 * @property {string[][]} cycles Detected dependency cycles.
 */

/**
 * @param {{
 *   revision: number,
 *   stats: Map<string, { value: number, breakdown: object }>,
 *   unsupported?: object[],
 *   ignored?: object[],
 *   flavor?: object[],
 *   uniqueMods?: object[],
 *   imported?: Record<string, number>,
 *   conditions?: string[],
 *   cycles?: string[][],
 * }} input
 * @returns {CharacterSnapshot}
 */
export function createCharacterSnapshot(input) {
  const stats = input.stats instanceof Map ? input.stats : new Map();
  /** @type {Record<string, number>} */
  const values = {};
  for (const [key, entry] of stats) values[key] = entry.value;
  Object.freeze(values);
  const unsupported = Object.freeze([...(input.unsupported || [])]);
  const ignored = Object.freeze([...(input.ignored || [])]);
  const flavor = Object.freeze([...(input.flavor || [])]);
  const uniqueMods = Object.freeze([...(input.uniqueMods || [])]);
  const imported = Object.freeze({ ...(input.imported || {}) });
  const conditions = Object.freeze([...(input.conditions || [])]);
  const cycles = Object.freeze((input.cycles || []).map((cycle) => Object.freeze([...cycle])));

  return Object.freeze({
    revision: Number(input.revision) || 0,
    values,
    unsupported,
    ignored,
    flavor,
    uniqueMods,
    imported,
    conditions,
    cycles,
    getValue(stat) {
      const key = String(stat ?? '').trim().toLowerCase();
      return stats.get(key)?.value ?? 0;
    },
    getStat(stat) {
      const key = String(stat ?? '').trim().toLowerCase();
      return stats.get(key);
    },
    getBreakdown(stat) {
      const key = String(stat ?? '').trim().toLowerCase();
      return stats.get(key)?.breakdown;
    },
    get size() {
      return stats.size;
    },
  });
}
