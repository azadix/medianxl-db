/**
 * Build 2.14 item affix catalog from Median XL docs/wiki HTML.
 *
 * Usage:
 *   node tools/item_generation/generate-affixes-from-wiki.mjs [2.14] [--check]
 *   node tools/item_generation/generate-affixes-from-wiki.mjs 2.14 --from-html path/to/page.html
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AFFIXES_WIKI_FALLBACK_URL,
  AFFIXES_WIKI_URL,
  WIKI_AFFIX_VERSION_FOLDERS,
  parseAffixesWiki,
} from './parse-affixes-wiki.mjs';

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
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
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
 * @param {object[]} entries
 */
function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 900) {
    throw new Error(`Parsed too few affixes: ${entries?.length || 0}`);
  }
  let prefixes = 0;
  let suffixes = 0;
  const seen = new Set();
  for (const entry of entries) {
    if (!entry?.id || !entry?.kind || !entry?.properties) {
      throw new Error(`Incomplete affix: ${entry?.id || entry?.properties}`);
    }
    if (seen.has(entry.id)) throw new Error(`Duplicate affix id: ${entry.id}`);
    seen.add(entry.id);
    if (entry.kind === 'prefix') prefixes += 1;
    else if (entry.kind === 'suffix') suffixes += 1;
    else throw new Error(`Unknown affix kind: ${entry.kind}`);
    if (!Array.isArray(entry.foundOn) || !entry.foundOn.length) {
      throw new Error(`Affix missing foundOn: ${entry.id}`);
    }
  }
  if (prefixes < 500 || suffixes < 300) {
    throw new Error(`Unexpected affix split: ${prefixes} prefixes, ${suffixes} suffixes`);
  }
}

/**
 * @param {object[]} previous
 * @param {object[]} next
 */
function printDiffSummary(previous, next) {
  const before = new Set(previous.map((entry) => entry.id));
  const after = new Set(next.map((entry) => entry.id));
  const added = [...after].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !after.has(id));
  console.log(`Changes: ${added.length} added, ${removed.length} removed.`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = argv;
  const flags = new Set(args.filter((arg) => arg.startsWith('--') && arg !== '--from-html'));
  const fromHtmlIdx = args.indexOf('--from-html');
  const fromHtml = fromHtmlIdx >= 0 ? args[fromHtmlIdx + 1] : '';
  const version =
    args.find((arg, idx) => !arg.startsWith('--') && idx !== fromHtmlIdx + 1) || DEFAULT_VERSION;
  const folder = versionToFolder(version);
  if (folder !== SUPPORTED_FOLDER || !WIKI_AFFIX_VERSION_FOLDERS.has(folder)) {
    throw new Error(`Only 2.14 wiki item data is available; received ${version}.`);
  }

  const outputPath = path.join(ROOT, 'public', 'items', folder, 'item-affixes.json');
  const existing = loadExisting(outputPath);
  let html;
  if (fromHtml) {
    html = readFileSync(path.resolve(fromHtml), 'utf8');
    console.log(`Reading affixes HTML from ${fromHtml}`);
  } else {
    console.log('Fetching affixes from Median XL docs...');
    try {
      html = await fetchHtml(AFFIXES_WIKI_URL);
    } catch (error) {
      console.warn(String(error));
      console.log('Fetching affixes from wiki.median-xl.com...');
      html = await fetchHtml(AFFIXES_WIKI_FALLBACK_URL);
    }
  }

  const entries = parseAffixesWiki(html);
  validateEntries(entries);
  const prefixes = entries.filter((row) => row.kind === 'prefix').length;
  const suffixes = entries.filter((row) => row.kind === 'suffix').length;
  console.log(`Parsed ${entries.length} affixes (${prefixes} prefixes, ${suffixes} suffixes).`);
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
  console.log(`Wrote ${entries.length} affixes -> ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
