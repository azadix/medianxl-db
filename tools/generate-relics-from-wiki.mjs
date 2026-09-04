/**
 * Refresh relics.json from the raw Median XL relic wiki HTML.
 *
 * The wiki omits relic names from the rendered item cells, so cells are
 * matched to the existing catalog by their granted skill line. Stable ids and
 * names are preserved while requirements, icons, restrictions, and modifiers
 * are refreshed.
 *
 * Usage:
 *   node tools/generate-relics-from-wiki.mjs [version] [--check]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const RELICS_WIKI_URL = 'https://docs.median-xl.com/doc/wiki/relics';

const DEFAULT_VERSION = '2.14';
const SUPPORTED_FOLDER = '2_14';
const WIKI_IDENTITY_ALIASES = Object.freeze({
  'Relic (Blood Fury)': {
    id: 'relic:blood-fury',
    name: 'Relic (Overcharged)',
  },
  'Relic (Divine Judgment)': {
    id: 'relic:divine-judgement',
    name: 'Relic (Divine Judgement)',
  },
});

/**
 * @param {string} version
 * @returns {string}
 */
function versionToFolder(version) {
  const [major = '0', minor = '0'] = String(version).trim().split('.');
  return `${major}_${minor}`;
}

/**
 * @param {string} html
 * @returns {string}
 */
function decodeEntities(html) {
  return String(html || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function relicHtmlToLines(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * @typedef {{
 *   icon: string,
 *   reqLevel: number,
 *   classRestriction?: string,
 *   modifiers: string[],
 * }} RelicWikiCell
 */

/**
 * @param {string} html
 * @returns {RelicWikiCell[]}
 */
export function parseRelicWikiCells(html) {
  /** @type {RelicWikiCell[]} */
  const cells = [];
  const cellMatches = String(html || '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi);

  for (const match of cellMatches) {
    const cellHtml = match[1];
    const iconMatch = /images\/baseitems\/(relic\d+)\.(?:jpe?g|png|webp)/i.exec(cellHtml);
    if (!iconMatch) continue;

    const lines = relicHtmlToLines(cellHtml);
    if (!lines.some((line) => /^Relic$/i.test(line))) continue;

    let reqLevel = 75;
    /** @type {string|undefined} */
    let classRestriction;
    /** @type {string[]} */
    const modifiers = [];

    for (const line of lines) {
      if (/^Relic$/i.test(line)) continue;
      const req = /^Required Level:\s*(\d+)$/i.exec(line);
      if (req) {
        reqLevel = Number(req[1]);
        continue;
      }
      const only = /^\(([^)]+ Only)\)$/i.exec(line);
      if (only) {
        classRestriction = only[1];
        continue;
      }
      modifiers.push(line);
    }

    const cell = {
      icon: iconMatch[1].toLowerCase(),
      reqLevel,
      modifiers,
    };
    if (classRestriction) cell.classRestriction = classRestriction;
    cells.push(cell);
  }

  return cells;
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} relicName
 * @returns {string}
 */
function relicSkillName(relicName) {
  return /^Relic\s*\((.*)\)\s*$/i.exec(String(relicName || '').trim())?.[1]?.trim() || '';
}

/**
 * @param {RelicWikiCell} cell
 * @param {string} skillName
 * @returns {number}
 */
function matchScore(cell, skillName) {
  const skill = normalizeForMatch(skillName);
  if (!skill) return 0;

  let score = 0;
  for (const modifier of cell.modifiers) {
    const line = normalizeForMatch(modifier);
    const padded = ` ${line} `;
    const directGrant =
      /^\+\(?\d+\s+to\s+\d+\)?\s+to\s+(.+)$/i.exec(modifier) ||
      /^\+\d+\s+to\s+(.+)$/i.exec(modifier);
    const directTarget = normalizeForMatch(directGrant?.[1]);
    if (
      directTarget === skill ||
      directTarget.startsWith(`${skill} `) ||
      directTarget.endsWith(` ${skill}`)
    ) {
      score = Math.max(score, 20_000 + skill.length);
    } else if (padded.includes(` to ${skill} `) || padded.endsWith(` to ${skill} `)) {
      score = Math.max(score, 10_000 + skill.length);
    } else if (line.startsWith(`${skill} `) || line === skill) {
      score = Math.max(score, 7_000 + skill.length);
    } else if (padded.includes(` ${skill} `)) {
      score = Math.max(score, 1_000 + skill.length);
    }
  }
  return score;
}

/**
 * @param {RelicWikiCell[]} cells
 * @param {object[]} existing
 * @returns {{ cell: RelicWikiCell, previous: object }[]}
 */
export function matchRelicWikiCells(cells, existing) {
  const candidates = existing.map((entry) => ({
    entry,
    skillName: relicSkillName(entry.name),
  }));

  const matches = cells.map((cell, index) => {
    const scored = candidates
      .map((candidate) => ({
        ...candidate,
        score: matchScore(cell, candidate.skillName),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.skillName.length - a.skillName.length ||
          a.skillName.localeCompare(b.skillName)
      );

    if (!scored.length) {
      throw new Error(
        `Could not identify wiki relic cell ${index + 1}: ${cell.modifiers.join(' | ')}`
      );
    }

    return { cell, previous: scored[0].entry };
  });

  const used = new Map();
  for (const match of matches) {
    const name = String(match.previous.name);
    used.set(name, (used.get(name) || 0) + 1);
  }
  const duplicates = [...used].filter(([, count]) => count > 1);
  const missing = existing.filter((entry) => !used.has(String(entry.name)));
  if (duplicates.length || missing.length) {
    const duplicateNames = duplicates.map(([name, count]) => `${name} (${count} cells)`);
    const missingNames = missing.map((entry) => String(entry.name));
    throw new Error(
      [
        duplicateNames.length ? `Duplicate matches: ${duplicateNames.join(', ')}` : '',
        missingNames.length ? `Unmatched catalog entries: ${missingNames.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return matches;
}

/**
 * @param {string} filePath
 * @returns {object[]}
 */
function loadCatalog(filePath) {
  if (!existsSync(filePath)) throw new Error(`Missing relic catalog: ${filePath}`);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!Array.isArray(data) || !data.length) {
    throw new Error(`Expected a non-empty relic array in ${filePath}`);
  }
  return data.map((entry) => ({
    ...entry,
    ...(WIKI_IDENTITY_ALIASES[entry.name] || {}),
  }));
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
 * @param {object[]} previous
 * @param {{ cell: RelicWikiCell, previous: object }[]} matches
 * @returns {object[]}
 */
function buildCatalog(previous, matches) {
  const byName = new Map(matches.map((match) => [match.previous.name, match.cell]));
  return previous
    .map((entry) => {
      const cell = byName.get(entry.name);
      const next = {
        ...entry,
        keepInInventory: true,
        rarity: 'relic',
        icon: cell.icon,
        reqLevel: cell.reqLevel,
        modifiers: cell.modifiers,
      };
      if (cell.classRestriction) next.classRestriction = cell.classRestriction;
      else delete next.classRestriction;
      return next;
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'en'));
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith('--')));
  const version = args.find((arg) => !arg.startsWith('--')) || DEFAULT_VERSION;
  const folder = versionToFolder(version);
  if (folder !== SUPPORTED_FOLDER) {
    throw new Error(`Only 2.14 wiki item data is available; received ${version}.`);
  }
  const outputPath = path.join(ROOT, 'public', 'items', folder, 'relics.json');
  const previous = loadCatalog(outputPath);

  console.log(`Fetching raw relic wiki HTML: ${RELICS_WIKI_URL}`);
  const html = await fetchHtml(RELICS_WIKI_URL);
  const cells = parseRelicWikiCells(html);
  console.log(`Parsed ${cells.length} relic cells; catalog has ${previous.length} entries.`);
  if (cells.length !== previous.length) {
    throw new Error(`Wiki/catalog count mismatch: ${cells.length} cells vs ${previous.length} entries`);
  }

  const matches = matchRelicWikiCells(cells, previous);
  const catalog = buildCatalog(previous, matches);
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  const changed = catalog.filter(
    (entry) => JSON.stringify(entry) !== JSON.stringify(previousById.get(entry.id))
  ).length;
  console.log(`Matched all ${matches.length} wiki cells (${changed} entries changed).`);

  if (flags.has('--check')) {
    console.log('Check only; no files written.');
    return;
  }

  const payload = `${JSON.stringify(catalog, null, 2)}\n`;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, payload, 'utf8');
  console.log(`Wrote ${catalog.length} relics -> ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
