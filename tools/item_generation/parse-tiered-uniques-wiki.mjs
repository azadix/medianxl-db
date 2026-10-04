/**
 * Parse docs.median-xl.com tiered-uniques raw HTML into unique-stats entries.
 * Keeps <br>-split label/value lines (do not convert the page to markdown).
 */

import { encodeModifierLine, modifierColorFromWikiClass } from '../../src/items/item-modifier-line.js';

/** @typedef {{ name: string, quality: string, stats: string, type?: string, tier?: number }} UniqueStatsEntry */
/** @typedef {{ text: string, color: string }} ColoredStatLine */

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
 * @param {string} attrs
 * @returns {string}
 */
function classFromAttrs(attrs) {
  const match = /\bclass\s*=\s*"([^"]*)"/i.exec(attrs) || /\bclass\s*=\s*'([^']*)'/i.exec(attrs);
  return match ? match[1] : '';
}

/**
 * @param {string} attrs
 * @returns {string}
 */
function titleFromAttrs(attrs) {
  const match = /\btitle\s*=\s*"([^"]*)"/i.exec(attrs) || /\btitle\s*=\s*'([^']*)'/i.exec(attrs);
  return match ? decodeEntities(match[1]) : '';
}

/**
 * @param {Array<{ color: string }>} stack
 * @returns {string}
 */
function stackColor(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].color) return stack[i].color;
  }
  return 'magic';
}

/**
 * @param {string} title
 * @returns {string}
 */
function cleanWikiTitle(title) {
  return String(title || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wiki stat lines with item-* colors. Orange unique text and grey
 * (`item-runeword`) effect lines are preserved; dotted-orange titles become grey.
 * @param {string} html
 * @returns {ColoredStatLine[]}
 */
export function htmlToColoredLines(html) {
  const src = String(html || '').replace(/<br\s*\/?>/gi, '\n');
  /** @type {Array<{ color: string, title: string }>} */
  const stack = [];
  /** @type {ColoredStatLine[]} */
  const lines = [];
  let buf = '';

  function flushLine() {
    const text = decodeEntities(buf).replace(/\s+/g, ' ').trim();
    buf = '';
    if (text) lines.push({ text, color: stackColor(stack) });
  }

  const tokenRe = /<\/?([a-zA-Z][\w:-]*)([^>]*)>|([^<]+)/g;
  let match;
  while ((match = tokenRe.exec(src))) {
    if (match[3] != null) {
      const parts = match[3].split('\n');
      for (let i = 0; i < parts.length; i++) {
        buf += parts[i];
        if (i < parts.length - 1) flushLine();
      }
      continue;
    }
    const tag = match[1].toLowerCase();
    if (tag !== 'span') continue;
    if (match[0].startsWith('</')) {
      const entry = stack[stack.length - 1];
      if (entry?.title && entry.color === 'orange') {
        flushLine();
        const title = cleanWikiTitle(entry.title);
        if (title) lines.push({ text: title, color: 'grey' });
      }
      stack.pop();
      continue;
    }
    stack.push({
      color: modifierColorFromWikiClass(classFromAttrs(match[2])),
      title: titleFromAttrs(match[2]),
    });
  }
  flushLine();
  return lines;
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function htmlToLines(html) {
  return htmlToColoredLines(html).map((line) => line.text);
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isBlockValuePart(line) {
  const value = String(line || '').trim();
  return (
    /^[+-]?\(?\d+(?:\.\d+)?(?:\s+to\s+[+-]?\d+(?:\.\d+)?)?\)?%\s*\+?$/i.test(value) ||
    /^Class$/i.test(value) ||
    /^%$/i.test(value) ||
    /^Class\s*%$/i.test(value) ||
    /^\+\s*Class\s*%$/i.test(value)
  );
}

/**
 * @param {unknown} line
 * @returns {ColoredStatLine}
 */
function asColoredLine(line) {
  if (line && typeof line === 'object' && 'text' in line) {
    return {
      text: String(/** @type {{ text?: unknown }} */ (line).text || ''),
      color: String(/** @type {{ color?: unknown }} */ (line).color || 'magic'),
    };
  }
  return { text: String(line || ''), color: 'magic' };
}

/**
 * Join stat labels and values split across sibling wiki spans.
 * @param {Array<string|ColoredStatLine>} lines
 * @returns {ColoredStatLine[]}
 */
export function joinSplitColoredStatLines(lines) {
  const src = (Array.isArray(lines) ? lines : []).map(asColoredLine);
  /** @type {ColoredStatLine[]} */
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    if (
      /^Innate .+ Damage:\s*$/i.test(line.text) &&
      /^\([^)]*% of [^)]+\)$/i.test(src[i + 1]?.text || '')
    ) {
      out.push({
        text: `${line.text.trim()} ${src[i + 1].text.trim()}`,
        color: line.color,
      });
      i += 1;
      continue;
    }
    const block = /^Chance to Block:\s*(.*)$/i.exec(line.text);
    if (!block) {
      out.push(line);
      continue;
    }
    const parts = [String(block[1] || '').trim()].filter(Boolean);
    while (i + 1 < src.length) {
      const next = src[i + 1];
      if (isBlockValuePart(next.text)) {
        parts.push(next.text);
        i += 1;
        continue;
      }
      break;
    }
    const value = parts.join(' ').replace(/\s+/g, ' ').trim();
    out.push({
      text: value ? `Chance to Block: ${value}` : 'Chance to Block:',
      color: line.color,
    });
  }
  return out;
}

/**
 * Join stat labels and values split across sibling wiki spans.
 * @param {Array<string|ColoredStatLine>} lines
 * @returns {string[]}
 */
export function joinSplitStatLines(lines) {
  return joinSplitColoredStatLines(lines).map((line) => line.text);
}

/**
 * @param {Array<string|ColoredStatLine>} lines
 * @returns {string}
 */
export function formatColoredStatLines(lines) {
  return joinSplitColoredStatLines(lines)
    .map((line) => encodeModifierLine(line.text, line.color))
    .filter(Boolean)
    .join('\n');
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
    const lines = joinSplitColoredStatLines(htmlToColoredLines(td));
    const tierHit = lines.find((line) => /^Tier\s*([1-4])$/i.test(line.text));
    if (!tierHit) continue;
    const tier = Number(/^Tier\s*([1-4])$/i.exec(tierHit.text)?.[1]);
    const stats = formatColoredStatLines(lines.filter((line) => !/^Tier\s*[1-4]$/i.test(line.text)));
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
    const lines = joinSplitColoredStatLines(htmlToColoredLines(td));
    const stats = formatColoredStatLines(lines[0]?.text === name ? lines.slice(1) : lines);
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
