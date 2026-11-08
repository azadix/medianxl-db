/**
 * Apply manual post-generation corrections to item catalogs.
 *
 * Generators intentionally download and write upstream data as-is. Any known
 * upstream mistakes or locally added catalog entries belong in
 * `manual-overrides.json`; this module applies them after generation so a
 * refresh does not silently discard those fixes.
 *
 * Usage: imported by `generate.mjs`, or run directly:
 *   node tools/item_generation/apply-manual-overrides.mjs [version]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '../..');
const OVERRIDES_PATH = path.join(SCRIPT_DIR, 'manual-overrides.json');
const DEFAULT_VERSION = '2.14';

/**
 * @param {string} version
 * @returns {string}
 */
function versionToFolder(version) {
  const [major = '0', minor = '0'] = String(version).trim().split('.');
  return `${major}_${minor}`;
}

/**
 * @param {string} file
 * @returns {object}
 */
function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * @param {string} file
 * @param {unknown} data
 */
function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/**
 * @returns {object}
 */
export function loadManualOverrides() {
  return readJson(OVERRIDES_PATH);
}

/**
 * @param {string} version
 * @returns {string}
 */
export function itemsDirForVersion(version = DEFAULT_VERSION) {
  return path.join(ROOT, 'public', 'items', versionToFolder(version));
}

/**
 * Apply stat corrections, added items and icon overrides to unique entries.
 *
 * @param {object[]} entries
 * @param {object} overrides
 * @returns {{ corrections: number, added: number, icons: number }}
 */
export function applyUniqueOverrides(entries, overrides = loadManualOverrides()) {
  const result = { corrections: 0, added: 0, icons: 0 };

  for (const correction of overrides.stat_corrections || []) {
    if (correction.catalog !== 'unique-stats-db') continue;
    for (const entry of entries) {
      if (entry.name !== correction.name) continue;
      const value = entry[correction.field];
      if (typeof value !== 'string' || !value.includes(correction.find)) continue;
      entry[correction.field] = value.split(correction.find).join(correction.replace);
      result.corrections += 1;
    }
  }

  for (const addition of overrides.added_items || []) {
    if (addition.catalog !== 'unique-stats-db') continue;
    const entry = addition.entry;
    const exists = entries.some(
      (row) =>
        row.name === entry.name &&
        row.type === entry.type &&
        row.quality === entry.quality &&
        row.tier === entry.tier
    );
    if (!exists) {
      entries.push(entry);
      result.added += 1;
    }
  }

  for (const override of overrides.icon_overrides || []) {
    const byName = entries.filter((row) => row.name === override.name);
    const entry =
      byName.find(
        (row) =>
          row.quality === override.quality &&
          row.type === override.type &&
          row.tier === override.tier
      ) ||
      byName.find((row) => row.quality === override.quality && row.tier === override.tier) ||
      byName.find((row) => row.quality === override.quality) ||
      byName[0];
    if (!entry) continue;
    entry.icon = override.icon;
    result.icons += 1;
  }

  return result;
}

/**
 * @param {{ entries?: object[] }|object[]} runewords
 * @param {object} overrides
 * @returns {number}
 */
export function applyRunewordOverrides(runewords, overrides = loadManualOverrides()) {
  const entries = Array.isArray(runewords) ? runewords : runewords.entries;
  let changed = 0;
  for (const correction of overrides.runeword_corrections || []) {
    const entry = (entries || []).find((row) => row.name === correction.name);
    if (!entry) continue;
    entry.modifiers = (entry.modifiers || []).map((line) =>
      line.includes(correction.find) ? line.split(correction.find).join(correction.replace) : line
    );
    changed += 1;
  }
  return changed;
}

/**
 * @param {object[]} mysticOrbs
 * @param {object} overrides
 * @returns {number}
 */
export function applyMysticOrbOverrides(mysticOrbs, overrides = loadManualOverrides()) {
  let changed = 0;
  for (const override of overrides.mystic_orbs || []) {
    const orb = mysticOrbs.find((row) => row.name === override.name);
    if (!orb) continue;
    Object.assign(orb, override.set || {});
    changed += 1;
  }
  return changed;
}

/**
 * Apply all entries in the manual overrides file to the catalog on disk.
 *
 * @param {{ version?: string, log?: (message: string) => void }} [options]
 * @returns {{ corrections: number, added: number, runewords: number, mysticOrbs: number, icons: number }}
 */
export function applyManualOverrides(options = {}) {
  const version = options.version || DEFAULT_VERSION;
  const log = options.log || (() => {});
  const overrides = loadManualOverrides();
  const itemsDir = itemsDirForVersion(version);

  const uniquePath = path.join(itemsDir, 'unique-stats-db.json');
  const unique = readJson(uniquePath);
  const entries = Array.isArray(unique) ? unique : unique.entries;
  if (!Array.isArray(entries)) throw new Error('unique-stats-db.json has no entries array');
  const uniqueResult = applyUniqueOverrides(entries, overrides);
  writeJson(uniquePath, unique);

  const runewordsPath = path.join(itemsDir, 'runewords.json');
  const runewords = readJson(runewordsPath);
  const runewordCount = applyRunewordOverrides(runewords, overrides);
  writeJson(runewordsPath, runewords);

  const mysticPath = path.join(itemsDir, 'mystic-orbs.json');
  const mysticOrbs = readJson(mysticPath);
  const mysticOrbCount = applyMysticOrbOverrides(mysticOrbs, overrides);
  writeJson(mysticPath, mysticOrbs);

  const result = {
    corrections: uniqueResult.corrections,
    added: uniqueResult.added,
    runewords: runewordCount,
    mysticOrbs: mysticOrbCount,
    icons: uniqueResult.icons,
  };
  log(
    `manual overrides: ${result.corrections} corrections, ` +
      `${result.added} added items, ${result.runewords} runeword corrections, ` +
      `${result.icons} icon overrides, ${result.mysticOrbs} mystic orbs`
  );
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyManualOverrides({
    version: process.argv[2] || DEFAULT_VERSION,
    log: (message) => console.log(message),
  });
}
