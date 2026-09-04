/**
 * Parse docs.median-xl.com sacred-unique raw HTML into unique-stats entries.
 */

import {
  WIKI_SECTION_TO_TYPE,
  htmlToLines,
  joinSplitStatLines,
} from './parse-tiered-uniques-wiki.mjs';

/** @typedef {{ name: string, quality: 'SU', stats: string, type?: string }} SacredUniqueEntry */

export const SACRED_UNIQUES_WIKI_URL =
  'https://docs.median-xl.com/doc/items/sacreduniques';

/**
 * @param {string} html
 * @returns {string[]}
 */
function tableCells(html) {
  return [...String(html || '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
    (match) => match[1]
  );
}

/**
 * @param {string} tableHtml
 * @param {string} section
 * @returns {string|null}
 */
function tableType(tableHtml, section) {
  const header = /<th\b[^>]*>([\s\S]*?)<\/th>/i.exec(tableHtml);
  if (header) {
    const base = htmlToLines(header[1]).join(' ');
    if (base) return /\(Sacred\)$/i.test(base) ? base : `${base} (Sacred)`;
  }
  return WIKI_SECTION_TO_TYPE[section] || null;
}

/**
 * @param {string} html
 * @returns {SacredUniqueEntry[]}
 */
export function parseSacredUniquesWiki(html) {
  const page = String(html || '');
  /** @type {SacredUniqueEntry[]} */
  const entries = [];
  const tableRe = /<table class="uniques">([\s\S]*?)(?:<\/table>|$)/gi;
  let match;

  while ((match = tableRe.exec(page))) {
    const beforeTable = page.slice(0, match.index);
    const sections = [
      ...beforeTable.matchAll(
        /<p\b[^>]*class="[^"]*\bgenbig\b[^"]*"[^>]*>[\s\S]*?<b[^>]*>\s*([\s\S]*?)\s*<\/b>[\s\S]*?<\/p>/gi
      ),
    ];
    const section = sections.length ? htmlToLines(sections.at(-1)[1]).join(' ') : '';
    const type = tableType(match[1], section);

    for (const cell of tableCells(match[1])) {
      const nameMatch =
        /<span\b[^>]*class="[^"]*\bitem-unique\b[^"]*\bmargin_bottom\b[^"]*"[^>]*>[\s\S]*?<b[^>]*>\s*([\s\S]*?)<\/b>/i.exec(
          cell
        );
      if (!nameMatch) continue;

      const name = htmlToLines(nameMatch[1]).join(' ');
      if (!name) continue;
      const lines = joinSplitStatLines(htmlToLines(cell));
      const nameIndex = lines.indexOf(name);
      const stats = lines.slice(nameIndex >= 0 ? nameIndex + 1 : 0).join('\n');
      const entry = { name, quality: 'SU', stats };
      if (type) entry.type = type;
      entries.push(entry);
    }
  }

  return entries;
}
