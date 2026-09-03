/**
 * Parse docs.median-xl.com tiered-uniques raw HTML into unique-stats entries.
 * Keeps <br>-split label/value lines (do not convert the page to markdown).
 */

/** @typedef {{ name: string, quality: string, stats: string, type?: string, tier?: number }} UniqueStatsEntry */

export const TIERED_UNIQUES_WIKI_URL = 'https://docs.median-xl.com/doc/items/tiereduniques';

/** Wiki page is the current patch only. */
export const WIKI_TU_VERSION_FOLDERS = new Set(['2_14']);

/** @type {Readonly<Record<string, string>>} */
export const WIKI_SECTION_TO_TYPE = Object.freeze({
  Amulets: 'Amulet',
  Rings: 'Ring',
  Jewels: 'Jewel',
  'Arrow Quivers': 'Arrow Quiver',
  'Crossbow Quivers': 'Bolt Quiver',
});

/**
 * @param {string} html
 * @returns {string}
 */
function decodeEntities(html) {
  return String(html || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function htmlToLines(html) {
  const withBreaks = String(html || '').replace(/<br\s*\/?>/gi, '\n');
  const noTags = withBreaks.replace(/<[^>]+>/g, '');
  return decodeEntities(noTags)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Wiki splits "Class %" across sibling spans ("Class" then "%").
 * @param {string[]} lines
 * @returns {string[]}
 */
export function joinSplitStatLines(lines) {
  const src = Array.isArray(lines) ? lines : [];
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    const block = /^Chance to Block:\s*(.*)$/i.exec(line);
    if (!block) {
      out.push(line);
      continue;
    }
    const parts = [String(block[1] || '').trim()].filter(Boolean);
    while (i + 1 < src.length) {
      const next = src[i + 1];
      if (
        /^Class$/i.test(next) ||
        /^%$/i.test(next) ||
        /^Class\s*%$/i.test(next) ||
        /^\+\s*Class\s*%$/i.test(next)
      ) {
        parts.push(next);
        i += 1;
        continue;
      }
      break;
    }
    const value = parts.join(' ').replace(/\s+/g, ' ').trim();
    out.push(value ? `Chance to Block: ${value}` : 'Chance to Block:');
  }
  return out;
}

/**
 * @param {string} header
 * @returns {{ name: string, base: string|null }}
 */
export function parseUniqueHeader(header) {
  const text = String(header || '').trim();
  const m = /^(.+?)\s+\(([^)]+)\)\s*$/.exec(text);
  if (m) return { name: m[1].trim(), base: m[2].trim() };
  return { name: text, base: null };
}

/**
 * @param {string} tdHtml
 * @returns {boolean}
 */
function isIconCell(tdHtml) {
  return /<img\b/i.test(tdHtml) && !/Tier\s*[1-4]/i.test(tdHtml) && !/item-unique/i.test(tdHtml);
}

/**
 * @param {string} tableHtml
 * @returns {string[]}
 */
function tableCells(tableHtml) {
  return [...String(tableHtml || '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
}

/**
 * @param {string} tableHtml
 * @returns {UniqueStatsEntry[]}
 */
function parseTieredTable(tableHtml) {
  const th = /<th\b[^>]*class="item-unique"[^>]*>([\s\S]*?)<\/th>/i.exec(tableHtml);
  if (!th) return [];
  const { name, base } = parseUniqueHeader(htmlToLines(th[1]).join(' '));
  if (!name) return [];

  /** @type {UniqueStatsEntry[]} */
  const entries = [];
  for (const td of tableCells(tableHtml)) {
    if (isIconCell(td)) continue;
    const lines = joinSplitStatLines(htmlToLines(td));
    const tierHit = lines.find((line) => /^Tier\s*([1-4])$/i.test(line));
    if (!tierHit) continue;
    const tier = Number(/^Tier\s*([1-4])$/i.exec(tierHit)?.[1]);
    const stats = lines.filter((line) => !/^Tier\s*[1-4]$/i.test(line)).join('\n');
    /** @type {UniqueStatsEntry} */
    const entry = { name, quality: 'TU', stats, tier };
    if (base) entry.type = `${base} (${tier})`;
    entries.push(entry);
  }
  return entries;
}

/**
 * @param {string} tableHtml
 * @param {string} section
 * @returns {UniqueStatsEntry[]}
 */
function parseJewelryTable(tableHtml, section) {
  const type = WIKI_SECTION_TO_TYPE[section] || null;
  /** @type {UniqueStatsEntry[]} */
  const entries = [];
  for (const td of tableCells(tableHtml)) {
    const nameMatch =
      /<span\b[^>]*class="[^"]*\bitem-unique\b[^"]*"[^>]*>[\s\S]*?<b>\s*([\s\S]*?)<\/b>/i.exec(
        td
      );
    if (!nameMatch) continue;
    const name = htmlToLines(nameMatch[1]).join(' ');
    if (!name) continue;
    const lines = joinSplitStatLines(htmlToLines(td));
    const stats = (lines[0] === name ? lines.slice(1) : lines).join('\n');
    /** @type {UniqueStatsEntry} */
    const entry = { name, quality: 'TU', stats };
    if (type) entry.type = type;
    entries.push(entry);
  }
  return entries;
}

/**
 * @param {string} html
 * @returns {UniqueStatsEntry[]}
 */
export function parseTieredUniquesWiki(html) {
  const page = String(html || '');
  /** @type {UniqueStatsEntry[]} */
  const entries = [];
  let section = '';
  const tableRe = /<table class="uniques">([\s\S]*?)(?:<\/table>|$)/gi;
  let match;
  while ((match = tableRe.exec(page))) {
    // Derive the latest mapped section from the HTML before this table.
    // This also handles slices where one genbig <p> wraps multiple tables.
    const beforeTable = page.slice(0, match.index);
    const sectionMatches = [
      ...beforeTable.matchAll(
        /<b[^>]*>\s*(Amulets|Rings|Jewels|Arrow Quivers|Crossbow Quivers)\s*<\/b>/gi
      ),
    ];
    if (sectionMatches.length) section = sectionMatches.at(-1)[1];
    const tableHtml = match[1];
    if (/<th\b[^>]*class="item-unique"/i.test(tableHtml)) {
      entries.push(...parseTieredTable(tableHtml));
    } else {
      entries.push(...parseJewelryTable(tableHtml, section));
    }
  }
  return entries;
}

/**
 * Replace TSW TU rows with wiki entries; keep unmatched TSW TUs as fallback.
 * @param {UniqueStatsEntry[]} existing
 * @param {UniqueStatsEntry[]} wikiEntries
 * @returns {UniqueStatsEntry[]}
 */
export function mergeWikiTuEntries(existing, wikiEntries) {
  const wikiNames = new Set((wikiEntries || []).map((e) => e.name));
  const nonTu = (existing || []).filter((e) => e.quality !== 'TU');
  const leftoverTu = (existing || []).filter(
    (e) => e.quality === 'TU' && e.name && !wikiNames.has(e.name)
  );
  return [...nonTu, ...(wikiEntries || []), ...leftoverTu];
}

/**
 * @param {UniqueStatsEntry} entry
 * @returns {string}
 */
export function tuEntryKey(entry) {
  const name = String(entry?.name || '');
  if (entry?.tier != null) return `${name}::${entry.tier}`;
  return `${name}::tu`;
}
