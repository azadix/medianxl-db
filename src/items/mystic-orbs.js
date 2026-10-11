/**
 * @file Mystic orb display helpers for tooltips and item inspector.
 * @module items/mystic-orbs
 */

/**
 * @typedef {[number, string]} MysticOrbEntry
 */

/**
 * @param {unknown} raw
 * @returns {MysticOrbEntry[]}
 */
export function normalizeMysticOrbs(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {MysticOrbEntry[]} */
  const out = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const count = Math.floor(Number(entry[0]));
    const name = String(entry[1] ?? '').trim();
    if (!Number.isFinite(count) || count < 1 || !name) continue;
    out.push([count, name]);
  }
  return out;
}

/**
 * @param {number} count
 * @param {string} name
 * @returns {string}
 */
export function formatMysticOrbLine(count, name) {
  const n = Math.floor(Number(count));
  const label = String(name || '').trim();
  if (!label) return '';
  if (!Number.isFinite(n) || n < 1) return label;
  if (n === 1) return label;
  return `${n}x ${label}`;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function formatMysticOrbLines(raw) {
  return normalizeMysticOrbs(raw)
    .map(([count, name]) => formatMysticOrbLine(count, name))
    .filter(Boolean);
}
