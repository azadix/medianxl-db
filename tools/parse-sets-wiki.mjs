/**
 * Parse docs.median-xl.com set raw HTML into set-item and set-bonus entries.
 */

import { htmlToLines, joinSplitStatLines } from './parse-tiered-uniques-wiki.mjs';

/**
 * @typedef {{
 *   name: string,
 *   quality: 'Set'|'Sacred Set',
 *   stats: string,
 *   setName?: string,
 *   type?: string,
 * }} SetEntry
 */

export const SETS_WIKI_URL = 'https://docs.median-xl.com/doc/items/sets';

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
 * @param {string[]} lines
 * @returns {string}
 */
function formatSetBonuses(lines) {
  /** @type {string[]} */
  const formatted = [];
  for (const line of lines) {
    if (/^Set Bonus\b/i.test(line) && formatted.length) formatted.push('');
    formatted.push(line);
  }
  return formatted.join('\n');
}

/**
 * @param {string} html
 * @returns {SetEntry[]}
 */
export function parseSetsWiki(html) {
  const page = String(html || '');
  /** @type {SetEntry[]} */
  const entries = [];
  const setClasses = new Map();
  const tableRe = /<table class="sets">([\s\S]*?)(?:<\/table>|$)/gi;
  let match;

  while ((match = tableRe.exec(page))) {
    const cells = tableCells(match[1]);
    const summary = cells.find((cell) => !/<img\b/i.test(cell));
    if (!summary) continue;

    const summaryLines = htmlToLines(summary);
    const setName = summaryLines[0];
    const bonusIndex = summaryLines.findIndex((line) => /^Set Bonus\b/i.test(line));
    if (!setName || bonusIndex < 0) continue;
    const setClass = /\b(Amazon|Assassin|Barbarian|Druid|Necromancer|Paladin|Sorceress)\b/i.exec(
      summaryLines[1] || ''
    )?.[1];
    if (setClass) {
      setClasses.set(setName, setClass[0].toUpperCase() + setClass.slice(1).toLowerCase());
    }

    entries.push({
      name: setName,
      quality: 'Set',
      stats: formatSetBonuses(summaryLines.slice(bonusIndex)),
    });

    for (const cell of cells) {
      if (!/<img\b/i.test(cell)) continue;
      const lines = joinSplitStatLines(htmlToLines(cell));
      if (lines.length < 3) continue;
      const [name, type, ...statLines] = lines;
      entries.push({
        name,
        quality: 'Sacred Set',
        stats: statLines.join('\n'),
        setName,
        type,
      });
    }
  }

  const itemNameCounts = new Map();
  for (const entry of entries) {
    if (entry.quality !== 'Sacred Set') continue;
    itemNameCounts.set(entry.name, (itemNameCounts.get(entry.name) || 0) + 1);
  }
  return entries.map((entry) => {
    if (entry.quality !== 'Sacred Set' || itemNameCounts.get(entry.name) === 1) return entry;
    const className = setClasses.get(entry.setName);
    return className ? { ...entry, name: `${entry.name} (${className})` } : entry;
  });
}
