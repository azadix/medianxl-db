/**
 * Parse Median XL item affix wiki HTML (or a markdown table dump) into catalog rows.
 */

export const AFFIXES_WIKI_URL = 'https://docs.median-xl.com/doc/wiki/affixes';
export const AFFIXES_WIKI_FALLBACK_URL = 'https://wiki.median-xl.com/Item_Affixes';
export const WIKI_AFFIX_VERSION_FOLDERS = new Set(['2_14']);

/**
 * @param {string} html
 * @returns {string}
 */
function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
function cleanCell(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function splitTypeList(text) {
  return String(text || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * @param {string} key
 * @returns {string}
 */
function fnv1aHex(key) {
  let h = 2166136261;
  const s = String(key || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * @param {string} kind
 * @param {object} row
 * @returns {string}
 */
export function affixRowId(kind, row) {
  const key = [
    kind,
    row.group,
    row.properties,
    (row.foundOn || []).join(','),
    (row.exceptOn || []).join(','),
    row.minAlvl,
    row.maxAlvl,
    row.reqLevel,
  ].join('|');
  return `${kind === 'prefix' ? 'p' : 's'}-${row.group}-${fnv1aHex(key)}`;
}

/**
 * @param {string} value
 * @returns {number|null}
 */
function parseIntCell(value) {
  const n = Number(String(value || '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function parseFlagCell(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return !/^(no|n|false|0|-)$/i.test(text);
}

/**
 * @param {string[]} cells
 * @returns {object|null}
 */
function rowFromCells(cells) {
  if (!cells || cells.length < 8) return null;
  const kindRaw = cleanCell(cells[0]).toLowerCase();
  const kind = kindRaw === 'prefix' ? 'prefix' : kindRaw === 'suffix' ? 'suffix' : null;
  if (!kind) return null;
  const properties = cleanCell(cells[1]).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!properties) return null;
  const minAlvl = parseIntCell(cells[2]);
  const maxAlvl = parseIntCell(cells[3]);
  const reqLevel = parseIntCell(cells[4]);
  const group = parseIntCell(cells[5]);
  if (minAlvl == null || maxAlvl == null || reqLevel == null || group == null) return null;
  const foundOn = splitTypeList(cleanCell(cells[6]));
  const exceptOn = splitTypeList(cleanCell(cells[7]));
  const oskill = parseFlagCell(cells[8]);
  const proc = parseFlagCell(cells[9]);
  const row = {
    kind,
    properties,
    minAlvl,
    maxAlvl,
    reqLevel,
    group,
    foundOn,
    exceptOn,
  };
  if (oskill) row.oskill = true;
  if (proc) row.proc = true;
  row.id = affixRowId(kind, row);
  return row;
}

/**
 * @param {string} html
 * @returns {string[][]}
 */
function htmlTableRows(html) {
  const rows = [];
  for (const match of String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      stripTags(cell[1])
    );
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/**
 * @param {string} text
 * @returns {string[][]}
 */
function markdownTableRows(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[\s:|-]+\|$/.test(trimmed.replace(/[A-Za-z0-9]/g, ''))) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cleanCell(cell));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/**
 * @param {string[][]} rows
 * @returns {object[]}
 */
function entriesFromRows(rows) {
  /** @type {object[]} */
  const entries = [];
  const seen = new Set();
  for (const cells of rows) {
    const header = cells.map((c) => c.toLowerCase()).join(' ');
    if (header.includes('properties') && header.includes('found on')) continue;
    const row = rowFromCells(cells);
    if (!row) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    entries.push(row);
  }
  return entries;
}

/**
 * @param {string} source
 * @returns {object[]}
 */
export function parseAffixesWiki(source) {
  const htmlRows = htmlTableRows(source);
  const fromHtml = entriesFromRows(htmlRows);
  if (fromHtml.length) return fromHtml;
  return entriesFromRows(markdownTableRows(source));
}
