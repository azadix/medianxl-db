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
 *   icon?: string,
 * }} UniqueStatsEntry */

export const SECRET_ITEMS_WIKI_URL = 'https://wiki.median-xl.com/Secret_Items';

const SKIP_NAMES = new Set([
  'Locked Samael item',
  'Staff of Herding',
  'Soulstone of the Hallows',
  'Essence of Time',
]);
const SKIP_SECTIONS = new Set(['Disabled_items', 'Summary', 'Version_history', 'mw-toc-heading']);
const RELIC_SECTIONS = new Set(['Relics_and_special_items', 'Time-Lost_Relics', 'Blood_of_Creation']);
const RELIC_NAMES = new Set(["Bonehexer's Puzzlebox", 'Time-Lost Relic', 'Blood of Creation']);

/** uniqueitems.txt RemnantDarkness / pr260 class ids (1=Amazon … 7=Assassin). */
const BLOOD_OF_CREATION_CLASS_BY_VERSION = {
  'Version 1': 'Amazon Only',
  'Version 2': 'Paladin Only',
  'Version 3': 'Sorceress Only',
  'Version 4': 'Barbarian Only',
  'Version 5': 'Necromancer Only',
  'Version 6': 'Assassin Only',
  'Version 7': 'Druid Only',
};

const BLOOD_OF_CREATION_ICON = 'darkremnant';

/**
 * Class restriction, red-bottle art, and Version 1 duplicate skill line.
 * @param {UniqueStatsEntry} entry
 * @returns {UniqueStatsEntry}
 */
function applyBloodOfCreationFixes(entry) {
  if (entry.name !== 'Blood of Creation') return entry;
  entry.icon = BLOOD_OF_CREATION_ICON;
  const classOnly = BLOOD_OF_CREATION_CLASS_BY_VERSION[entry.variant || ''];
  if (classOnly) {
    const lines = String(entry.stats || '').split('\n');
    if (!lines.some((line) => /^\([^)]+Only\)$/i.test(line.trim()))) {
      const reqIdx = lines.findIndex((line) => /^Required Level:/i.test(line));
      const insertAt = reqIdx >= 0 ? reqIdx + 1 : 0;
      lines.splice(insertAt, 0, `(${classOnly})`);
      entry.stats = lines.join('\n');
    }
  }
  if (entry.variant === 'Version 1') {
    let seenCrystalline = false;
    entry.stats = String(entry.stats || '')
      .split('\n')
      .filter((line) => {
        const text = line.replace(/^\{(orange|grey)\}/, '').trim();
        if (/^\+1 to Crystalline Arsenal$/i.test(text)) {
          if (seenCrystalline) return false;
          seenCrystalline = true;
        }
        return true;
      })
      .join('\n');
  }
  return entry;
}

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
 * Skips Staff of Herding, Soulstone of the Hallows, Essence of Time (charms.json),
 * locked Samael placeholder, disabled Time-Lost outcomes, and the Disabled items section.
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

    entries.push(applyBloodOfCreationFixes(entry));
  }

  return entries;
}
