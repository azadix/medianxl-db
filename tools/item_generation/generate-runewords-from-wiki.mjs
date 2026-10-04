/**
 * Build 2.14 runeword templates from raw Median XL docs HTML.
 *
 * Usage:
 *   node tools/item_generation/generate-runewords-from-wiki.mjs [2.14] [--check]
 *   node tools/item_generation/generate-runewords-from-wiki.mjs 2.14 --from-html path/to/page.html
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RUNEWORDS_WIKI_URL,
  WIKI_RUNEWORD_VERSION_FOLDERS,
  parseRunewordsWiki,
} from './parse-runewords-wiki.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_VERSION = '2.14';
const SUPPORTED_FOLDER = '2_14';

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
 * @returns {object[]}
 */
function loadExisting(filePath) {
  if (!existsSync(filePath)) return [];
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  return Array.isArray(data) ? data : data.entries || [];
}

/**
 * @param {object} entry
 * @returns {string}
 */
function entryKey(entry) {
  return `${entry?.id || ''}\0${entry?.name || ''}\0${entry?.runeCode || ''}`;
}

/**
 * @param {object[]} entries
 */
function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 100) {
    throw new Error(`Parsed too few runewords: ${entries?.length || 0}`);
  }
  const seen = new Set();
  for (const entry of entries) {
    const key = entryKey(entry);
    if (seen.has(key)) throw new Error(`Duplicate runeword: ${entry?.id || key}`);
    seen.add(key);
    if (!entry?.id || !entry?.name || !entry?.runeCode) {
      throw new Error(`Incomplete runeword: ${key.replaceAll('\0', ' / ')}`);
    }
    if (!Array.isArray(entry.runes) || !entry.runes.length) {
      throw new Error(`Runeword missing runes: ${entry.id}`);
    }
    if (!Array.isArray(entry.allowedTypes) || !entry.allowedTypes.length) {
      throw new Error(`Runeword missing allowed types: ${entry.id}`);
    }
    if (!Array.isArray(entry.modifiers) || !entry.modifiers.length) {
      throw new Error(`Runeword missing modifiers: ${entry.id}`);
    }
    if (!Number.isFinite(Number(entry.reqLevel))) {
      throw new Error(`Runeword missing req level: ${entry.id}`);
    }
  }
}

/**
 * @param {object[]} previous
 * @param {object[]} next
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

export async function main(argv = process.argv.slice(2)) {
  const args = argv;
  const flags = new Set(args.filter((arg) => arg.startsWith('--') && arg !== '--from-html'));
  const fromHtmlIdx = args.indexOf('--from-html');
  const fromHtml = fromHtmlIdx >= 0 ? args[fromHtmlIdx + 1] : '';
  const version =
    args.find((arg, idx) => !arg.startsWith('--') && idx !== fromHtmlIdx + 1) || DEFAULT_VERSION;
  const folder = versionToFolder(version);
  if (folder !== SUPPORTED_FOLDER || !WIKI_RUNEWORD_VERSION_FOLDERS.has(folder)) {
    throw new Error(`Only 2.14 wiki item data is available; received ${version}.`);
  }

  const outputPath = path.join(ROOT, 'public', 'items', folder, 'runewords.json');
  const existing = loadExisting(outputPath);
  let html;
  if (fromHtml) {
    html = readFileSync(path.resolve(fromHtml), 'utf8');
    console.log(`Reading runewords HTML from ${fromHtml}`);
  } else {
    console.log('Fetching runewords from Median XL docs...');
    html = await fetchHtml(RUNEWORDS_WIKI_URL);
  }

  const entries = parseRunewordsWiki(html);
  validateEntries(entries);
  console.log(`Parsed ${entries.length} runewords.`);
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
  console.log(`Wrote ${entries.length} runewords -> ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
