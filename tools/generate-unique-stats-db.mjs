/**
 * Builds unique/set item stat templates (with roll ranges) by crawling the
 * public MXL item API (https://tsw.vn.cz/stats/api_item.php).
 *
 * Adapted from D2MXLUtils scripts/generate-unique-stats-db.mjs.
 * Run locally only — the API can 403 CI runner IPs.
 *
 * Usage:
 *   node tools/generate-unique-stats-db.mjs [version] [--resume]
 *
 * Defaults to 2.14 → public/items/2_14/unique-stats-db.json
 * --resume skips names already present in an existing output file.
 * Existing setName values are preserved onto matching names when rewriting.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const API_URL = 'https://tsw.vn.cz/stats/api_item.php';
const RELEVANT_QUALITIES = new Set(['TU', 'SU', 'Set', 'Sacred Set']);
const REQUEST_DELAY_MS = 1000;
const DEFAULT_VERSION = '2.14';

/**
 * @param {string} version
 * @returns {string}
 */
function versionToFolder(version) {
  const parts = String(version).trim().split('.');
  const major = parts[0] || '0';
  const minor = parts[1] || '0';
  return `${major}_${minor}`;
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  return {
    version: positional[0] || DEFAULT_VERSION,
    resume: flags.has('--resume'),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} url
 */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * @typedef {{
 *   name: string,
 *   quality: string,
 *   stats: string,
 *   class?: string,
 *   type?: string,
 *   nameDisplay?: string,
 *   setName?: string,
 * }} UniqueStatsEntry
 */

/**
 * @param {string} outputPath
 * @returns {Map<string, UniqueStatsEntry>}
 */
function loadExistingEntries(outputPath) {
  /** @type {Map<string, UniqueStatsEntry>} */
  const map = new Map();
  if (!existsSync(outputPath)) return map;
  try {
    const data = JSON.parse(readFileSync(outputPath, 'utf8'));
    for (const entry of data.entries ?? []) {
      if (entry?.name) map.set(entry.name, entry);
    }
  } catch (err) {
    console.warn(`Could not read existing file for resume: ${err.message}`);
  }
  return map;
}

/**
 * @param {object} match
 * @param {string} [setName]
 * @returns {UniqueStatsEntry}
 */
function entryFromMatch(match, setName) {
  /** @type {UniqueStatsEntry} */
  const entry = {
    name: match.name,
    quality: match.quality,
    stats: match.stats ?? '',
  };
  if (match.class) entry.class = match.class;
  if (match.type) entry.type = match.type;
  if (match.name_display) entry.nameDisplay = match.name_display;
  if (setName) entry.setName = setName;
  return entry;
}

/**
 * @param {string} name
 * @param {string} quality
 * @returns {Promise<object|null>}
 */
async function fetchExactItem(name, quality) {
  const tryQueries = [name, `${name} (${quality})`];
  for (let i = 0; i < tryQueries.length; i++) {
    const q = tryQueries[i];
    const url = `${API_URL}?q=${encodeURIComponent(q)}`;
    const result = await fetchJson(url);
    if (i < tryQueries.length - 1) await sleep(REQUEST_DELAY_MS);

    const items = result.items ?? [];
    const exact = items.find((it) => it.name === name && it.quality === quality);
    if (exact) return exact;
    const byName = items.find((it) => it.name === name);
    if (byName) return byName;

    // Truncated: matches only — try qualified next
    if (result.truncated && Array.isArray(result.matches)) {
      const hit = result.matches.find(
        (m) => m.name === name && (!quality || m.quality === quality)
      );
      if (hit && i === 0) continue;
    }
  }
  return null;
}

async function main() {
  const { version, resume } = parseArgs(process.argv.slice(2));
  const folder = versionToFolder(version);
  const outputPath = path.join(ROOT, 'public', 'items', folder, 'unique-stats-db.json');

  console.log(`Version ${version} → ${outputPath}`);
  console.log('Fetching item index...');
  const index = await fetchJson(`${API_URL}?mode=index`);
  const indexItems = (index.items ?? []).filter((item) =>
    RELEVANT_QUALITIES.has(item.quality)
  );
  console.log(
    `${indexItems.length} unique/set entries to crawl (of ${(index.items ?? []).length} total).`
  );

  // Always load existing for setName preservation; resume also skips re-fetch
  const existing = loadExistingEntries(outputPath);
  if (resume && existing.size) {
    console.log(`Resume: ${existing.size} entries already on disk.`);
  }

  /** @type {UniqueStatsEntry[]} */
  const entries = [];
  let done = 0;
  let skipped = 0;
  let fetched = 0;

  for (const indexItem of indexItems) {
    const name = indexItem.name;
    const quality = indexItem.quality;
    const prev = existing.get(name);
    const preservedSetName = prev?.setName;

    if (resume && prev && prev.stats) {
      const kept = { ...prev };
      if (preservedSetName) kept.setName = preservedSetName;
      // Fill class/type from index when older dump lacked them
      if (!kept.class && indexItem.class) kept.class = indexItem.class;
      if (!kept.type && indexItem.type) kept.type = indexItem.type;
      entries.push(kept);
      skipped++;
      done++;
      if (done % 25 === 0 || done === indexItems.length) {
        console.log(`  ${done}/${indexItems.length} (${fetched} fetched, ${skipped} resumed)`);
      }
      continue;
    }

    try {
      const match = await fetchExactItem(name, quality);
      if (match) {
        entries.push(entryFromMatch(match, preservedSetName));
        fetched++;
      } else {
        console.warn(`  no exact match returned for "${name}" (${quality})`);
        // Keep index stub so we don't lose the name; class/type from index
        entries.push(
          entryFromMatch(
            {
              name,
              quality,
              class: indexItem.class,
              type: indexItem.type,
              stats: '',
            },
            preservedSetName
          )
        );
      }
    } catch (err) {
      console.warn(`  failed "${name}": ${err.message}`);
    }

    done++;
    if (done % 25 === 0 || done === indexItems.length) {
      console.log(`  ${done}/${indexItems.length} (${fetched} fetched, ${skipped} resumed)`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const db = {
    generatedAt: new Date().toISOString(),
    entries,
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(db, null, 2));
  console.log(`Wrote ${entries.length} entries to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
