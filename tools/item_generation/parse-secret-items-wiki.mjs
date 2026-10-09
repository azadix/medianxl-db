/**
 * Parse wiki.median-xl.com Secret Items HTML into unique-stats entries.
 */

import {
  formatColoredStatLines,
  htmlToColoredLines,
  htmlToLines,
} from './parse-tiered-uniques-wiki.mjs';

/** @typedef {{
 *   name: string,
 *   quality: string,
 *   stats: string,
 *   type?: string,
 *   tier?: number,
 *   variant?: string,
 *   source?: string,
 * }} UniqueStatsEntry */

export const SECRET_ITEMS_WIKI_URL = 'https://wiki.median-xl.com/Secret_Items';

const SKIP_NAMES = new Set(['Locked Samael item', 'Staff of Herding', 'Soulstone of the Hallows']);
const SKIP_SECTIONS = new Set(['Disabled_items', 'Summary', 'Version_history', 'mw-toc-heading']);
const RELIC_SECTIONS = new Set(['Relics_and_special_items', 'Time-Lost_Relics', 'Blood_of_Creation']);
const RELIC_NAMES = new Set(["Bonehexer's Puzzlebox", 'Time-Lost Relic', 'Blood of Creation']);

/**
 * @param {string} html
 * @returns {string}
 */
function fieldText(html) {
  return htmlToLines(html).join(' ').trim();
}

/**
 * @param {string} html
 * @param {string} cls
 * @returns {string}
 */
function innerByClass(html, cls) {
  const re = new RegExp(`<div\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</div>`, 'i');
  return re.exec(html)?.[1] || '';
}

/**
 * @param {string} type
 * @returns {{ quality: 'TU'|'SU', tier?: number }}
 */
function qualityFromType(type) {
  const tier = /\((\d)\)\s*$/.exec(type);
  if (tier) return { quality: 'TU', tier: Number(tier[1]) };
  return { quality: 'SU' };
}

/**
 * @param {string} html
 * @param {number} index
 * @returns {string}
 */
function sectionIdBefore(html, index) {
  const before = html.slice(0, index);
  const matches = [
    ...before.matchAll(/<h[23]\b[^>]*>[\s\S]*?<span\b[^>]*class="[^"]*\bmw-headline\b[^"]*"[^>]*id="([^"]+)"/gi),
  ];
  return matches.at(-1)?.[1] || '';
}

/**
 * @param {string} name
 * @param {string} type
 * @param {string} stats
 * @param {string} section
 * @returns {'Relic'|'Charm'|'gear'}
 */
function classifyKind(name, type, stats, section) {
  const relicish =
    /^Relic$/i.test(type) ||
    RELIC_NAMES.has(name) ||
    /^\s*Relic\b/im.test(stats);
  if (relicish) return 'Relic';
  if (RELIC_SECTIONS.has(section)) return 'Charm';
  return 'gear';
}

/**
 * @param {string} name
 * @param {string} type
 * @returns {string}
 */
function inferType(name, type) {
  if (type) return type;
  if (/ring/i.test(name)) return 'Ring';
  if (/amulet/i.test(name)) return 'Amulet';
  return type;
}

/**
 * @param {string} statsHtml
 * @returns {string}
 */
function statsFromHtml(statsHtml) {
  const lines = htmlToColoredLines(statsHtml).filter((line) => !/^Relic$/i.test(line.text));
  return formatColoredStatLines(lines);
}

/**
 * Parse Secret Items wiki HTML into unique-stats entries.
 * Skips Staff of Herding, Soulstone of the Hallows, locked Samael placeholder,
 * disabled Time-Lost outcomes, and the Disabled items section.
 *
 * @param {string} html
 * @returns {UniqueStatsEntry[]}
 */
export function parseSecretItemsWiki(html) {
  const page = String(html || '');
  /** @type {UniqueStatsEntry[]} */
  const entries = [];
  const tooltipRe =
    /<div class="mxl-tooltip">([\s\S]*?)<div class="mxl-tt-stats">([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;

  while ((match = tooltipRe.exec(page))) {
    const section = sectionIdBefore(page, match.index);
    if (SKIP_SECTIONS.has(section)) continue;

    const body = match[1];
    const name = fieldText(innerByClass(body, 'mxl-tt-name'));
    if (!name || SKIP_NAMES.has(name)) continue;

    const label = fieldText(innerByClass(body, 'mxl-tt-label'));
    if (/^disabled$/i.test(label)) continue;

    const type = inferType(name, fieldText(innerByClass(body, 'mxl-tt-base')));
    const stats = statsFromHtml(match[2]);
    const kind = classifyKind(name, type, stats, section);

    /** @type {UniqueStatsEntry} */
    const entry = { name, quality: 'SU', stats, source: 'secret' };
    if (label) entry.variant = label;

    if (kind === 'Relic') {
      entry.quality = 'Relic';
      entry.type = 'Relic';
    } else if (kind === 'Charm') {
      entry.quality = 'Charm';
    } else {
      const { quality, tier } = qualityFromType(type);
      entry.quality = quality;
      if (tier != null) entry.tier = tier;
      if (type) entry.type = type;
    }

    entries.push(entry);
  }

  return entries;
}
