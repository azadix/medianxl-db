/**
 * Build 2.14 unique and set stat templates from raw Median XL docs HTML.
 *
 * Usage:
 *   node tools/generate-unique-stats-db.mjs [2.14] [--check]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SACRED_UNIQUES_WIKI_URL,
  parseSacredUniquesWiki,
} from './parse-sacred-uniques-wiki.mjs';
import { SETS_WIKI_URL, parseSetsWiki } from './parse-sets-wiki.mjs';
import {
  TIERED_UNIQUES_WIKI_URL,
  parseTieredUniquesWiki,
} from './parse-tiered-uniques-wiki.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_VERSION = '2.14';
const SUPPORTED_FOLDER = '2_14';
const QUALITY_ORDER = new Map([
  ['Sacred Set', 0],
  ['Set', 1],
  ['SU', 2],
  ['TU', 3],
]);

/**
 * @typedef {{
 *   name: string,
 *   quality: string,
 *   stats: string,
 *   type?: string,
 *   setName?: string,
 *   tier?: number,
 * }} UniqueStatsEntry
 */

/**
 * @param {string} version
 * @returns {string}
 */
function versionToFolder(version) {
  const [major = '0', minor = '0'] = String(version).trim().split('.');
  return `${major}_${minor}`;
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchHtml(url) {
  const response = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

/**
 * @param {string} filePath
 * @returns {UniqueStatsEntry[]}
 */
function loadExisting(filePath) {
  if (!existsSync(filePath)) return [];
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  return Array.isArray(data) ? data : data.entries || [];
}

/**
 * @param {string} value
 * @returns {Set<string>}
 */
function comparableTokens(value) {
  return new Set(
    String(value || '')
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length > 2) || []
  );
}

/**
 * @param {UniqueStatsEntry} candidate
 * @param {UniqueStatsEntry|undefined} previous
 * @returns {number}
 */
function variantScore(candidate, previous) {
  if (!previous) return 0;
  let score = candidate.type === previous.type ? 100_000 : 0;
  const current = comparableTokens(candidate.stats);
  for (const token of comparableTokens(previous.stats)) {
    if (current.has(token)) score += 1;
  }
  return score;
}

/**
 * The wiki has a few same-name alternate variants. Keep the previously
 * selected base/stat variant so generated item ids remain stable.
 *
 * @param {UniqueStatsEntry[]} entries
 * @param {UniqueStatsEntry[]} existing
 * @returns {UniqueStatsEntry[]}
 */
function selectStableVariants(entries, existing) {
  const previousByKey = new Map(
    existing.map((entry) => [`${entry.quality}\0${entry.name}`, entry])
  );
  /** @type {Map<string, UniqueStatsEntry[]>} */
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.quality}\0${entry.name}`;
    const group = groups.get(key) || [];
    group.push(entry);
    groups.set(key, group);
  }

  /** @type {UniqueStatsEntry[]} */
  const selected = [];
  for (const [key, group] of groups) {
    if (group.length === 1) {
      selected.push(group[0]);
      continue;
    }
    const previous = previousByKey.get(key);
    group.sort(
      (a, b) =>
        variantScore(b, previous) - variantScore(a, previous) ||
        String(a.type || '').localeCompare(String(b.type || ''), 'en') ||
        a.stats.localeCompare(b.stats, 'en')
    );
    selected.push(group[0]);
    console.log(
      `  selected ${group[0].name} (${group[0].type || 'no type'}) from ${group.length} variants`
    );
  }
  return selected;
}

/**
 * @param {UniqueStatsEntry} entry
 * @returns {string}
 */
function entryKey(entry) {
  return `${entry.quality}\0${entry.name}\0${entry.tier ?? ''}`;
}

/**
 * @param {UniqueStatsEntry[]} entries
 * @returns {Record<string, number>}
 */
function qualityCounts(entries) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const entry of entries) counts[entry.quality] = (counts[entry.quality] || 0) + 1;
  return counts;
}

/**
 * @param {UniqueStatsEntry[]} entries
 */
function validateEntries(entries) {
  const counts = qualityCounts(entries);
  if ((counts.TU || 0) < 800) throw new Error(`Parsed too few tiered uniques: ${counts.TU || 0}`);
  if ((counts.SU || 0) < 400) throw new Error(`Parsed too few sacred uniques: ${counts.SU || 0}`);
  if ((counts.Set || 0) < 45) throw new Error(`Parsed too few set bonuses: ${counts.Set || 0}`);
  if ((counts['Sacred Set'] || 0) < 170) {
    throw new Error(`Parsed too few set items: ${counts['Sacred Set'] || 0}`);
  }

  const seen = new Set();
  for (const entry of entries) {
    const key = entryKey(entry);
    if (seen.has(key)) throw new Error(`Duplicate wiki entry: ${key.replaceAll('\0', ' / ')}`);
    seen.add(key);
    if (!entry.name || !entry.stats) throw new Error(`Incomplete wiki entry: ${key}`);
  }
}

/**
 * @param {UniqueStatsEntry[]} previous
 * @param {UniqueStatsEntry[]} next
 */
function printDiffSummary(previous, next) {
  const before = new Map(previous.map((entry) => [entryKey(entry), entry]));
  const after = new Map(next.map((entry) => [entryKey(entry), entry]));
  const added = [...after.keys()].filter((key) => !before.has(key));
  const removed = [...before.keys()].filter((key) => !after.has(key));
  const changed = [...after].filter(
    ([key, entry]) => before.has(key) && JSON.stringify(entry) !== JSON.stringify(before.get(key))
  );
  console.log(`Changes: ${added.length} added, ${removed.length} removed, ${changed.length} updated.`);
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith('--')));
  const version = args.find((arg) => !arg.startsWith('--')) || DEFAULT_VERSION;
  const folder = versionToFolder(version);
  if (folder !== SUPPORTED_FOLDER) {
    throw new Error(`Only 2.14 wiki item data is available; received ${version}.`);
  }

  const outputPath = path.join(ROOT, 'public', 'items', folder, 'unique-stats-db.json');
  const existing = loadExisting(outputPath);
  console.log('Fetching tiered uniques, sacred uniques, and sets from Median XL docs...');
  const [tieredHtml, sacredHtml, setsHtml] = await Promise.all([
    fetchHtml(TIERED_UNIQUES_WIKI_URL),
    fetchHtml(SACRED_UNIQUES_WIKI_URL),
    fetchHtml(SETS_WIKI_URL),
  ]);

  const tiered = parseTieredUniquesWiki(tieredHtml);
  const sacred = selectStableVariants(parseSacredUniquesWiki(sacredHtml), existing);
  const sets = parseSetsWiki(setsHtml);
  const entries = [...sets, ...sacred, ...tiered].sort(
    (a, b) =>
      (QUALITY_ORDER.get(a.quality) ?? 99) - (QUALITY_ORDER.get(b.quality) ?? 99) ||
      a.name.localeCompare(b.name, 'en') ||
      (a.tier ?? 0) - (b.tier ?? 0)
  );

  validateEntries(entries);
  const counts = qualityCounts(entries);
  console.log(`Parsed ${entries.length} entries: ${JSON.stringify(counts)}`);
  printDiffSummary(existing, entries);

  if (flags.has('--check')) {
    console.log('Check only; no files written.');
    return;
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2)}\n`,
    'utf8'
  );
  console.log(`Wrote ${entries.length} entries -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
