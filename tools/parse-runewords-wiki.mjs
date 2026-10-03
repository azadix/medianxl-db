/**
 * Parse docs.median-xl.com runewords raw HTML into catalog templates.
 * Keeps <br>-split stat lines (do not convert the page to markdown).
 */

import { parseItemStats, slugify } from '../src/items/unique-stats-catalog.js';
import {
  formatColoredStatLines,
  htmlToColoredLines,
  htmlToLines,
  joinSplitColoredStatLines,
} from './parse-tiered-uniques-wiki.mjs';

export const RUNEWORDS_WIKI_URL = 'https://docs.median-xl.com/doc/items/runewords';

/** Wiki page is the current patch only. */
export const WIKI_RUNEWORD_VERSION_FOLDERS = new Set(['2_14']);

/** Wiki type names used to classify `(except …)` as a type vs a base name. */
export const KNOWN_WIKI_TYPES = Object.freeze([
  'Weapons',
  'Helms',
  'Shields',
  'Gloves',
  'Boots',
  'Circlets',
  'Amazon Bows',
  'Amazon Helms',
  'Amazon Javelins',
  'Amazon Shields',
  'Amazon Spears',
  'Assassin Claws',
  'Assassin Naginatas',
  'Assassin Shields',
  'Barbarian Helms',
  'Barbarian One-Handed Axes',
  'Barbarian Shields',
  'Barbarian Swords',
  'Barbarian Two-Handed Axes',
  'Belts',
  'Body Armors',
  'Bows',
  'Crossbows',
  'Crystal Swords',
  'Daggers',
  'Druid Bows',
  'Druid Helms',
  'Druid Staves',
  'Hammers',
  'Javelins',
  'Maces',
  'Necromancer Crossbows',
  'Necromancer Daggers',
  'Necromancer Scythes',
  'Necromancer Shields',
  'Necromancer Staves',
  'Necromancer Wands',
  'One-Handed Axes',
  'One-Handed Swords',
  'Paladin Clubs',
  'Paladin Hammers',
  'Paladin Helms',
  'Paladin Maces',
  'Paladin Shields',
  'Paladin Spears',
  'Scepters',
  'Scythes',
  'Sorceress Body Armors',
  'Sorceress Crystal Swords',
  'Sorceress Orbs',
  'Spears',
  'Special Helms',
  'Special Shields',
  'Staves',
  'Throwing Axes',
  'Throwing Knives',
  'Two-Handed Axes',
  'Two-Handed Swords',
]);

const KNOWN_TYPE_SET = new Set(KNOWN_WIKI_TYPES.map((name) => name.toLowerCase()));

const ELEMENT_RUNE_ALIASES = Object.freeze({
  fire: 'Ign',
  ice: 'Gla',
  poison: 'Ven',
  stone: 'Sil',
  light: 'Ful',
  arcane: 'Arc',
});

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   runeCode: string,
 *   runes: string[],
 *   reqLevel: number,
 *   allowedTypes: string[],
 *   excludedTypes: string[],
 *   excludedNames: string[],
 *   classRestriction?: string,
 *   modifiers: string[],
 * }} RunewordTemplate
 */

/**
 * @param {string} html
 * @returns {string[]}
 */
function tableCells(rowHtml) {
  return [...String(rowHtml || '').matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
    (m) => m[1]
  );
}

/**
 * @param {string} html
 * @returns {boolean}
 */
function isIconOrEmptyCell(html) {
  const lines = htmlToLines(html);
  if (!lines.length) return true;
  if (!/<img\b/i.test(html)) return false;
  return lines.every((line) => !/rune/i.test(line) && !/^\d+$/.test(line));
}

/**
 * @param {string} html
 * @returns {{ name: string, runeCode: string }|null}
 */
export function parseRunewordNameCell(html) {
  const text = htmlToLines(html).join(' ').replace(/\s+/g, ' ').trim();
  const match = /^(.+?)\s+'([A-Za-z]+)'\s*$/.exec(text);
  if (!match) return null;
  const name = match[1].trim();
  const runeCode = match[2];
  if (!name || !runeCode) return null;
  return { name, runeCode };
}

/**
 * Split a compact rune code (`BerBerIst`) into rune names.
 * @param {string} runeCode
 * @returns {string[]}
 */
export function splitRuneCode(runeCode) {
  return String(runeCode || '').match(/[A-Z][a-z]*/g) || [];
}

/**
 * @param {string} namesText
 * @returns {string[]}
 */
export function parseRuneNamesCell(namesText) {
  /** @type {string[]} */
  const runes = [];
  const re = /(?:(\d+)\s*x\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+Rune/gi;
  let match;
  while ((match = re.exec(String(namesText || '')))) {
    const count = Math.max(1, Number(match[1] || 1));
    const raw = match[2].trim();
    const alias = ELEMENT_RUNE_ALIASES[raw.toLowerCase()];
    const name = alias || raw.replace(/\s+Rune$/i, '').trim();
    for (let i = 0; i < count; i++) runes.push(name);
  }
  return runes;
}

/**
 * @param {string} runeCode
 * @param {string} namesText
 * @returns {string[]}
 */
export function resolveRunes(runeCode, namesText) {
  const fromCode = splitRuneCode(runeCode);
  if (fromCode.length) return fromCode;
  return parseRuneNamesCell(namesText);
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function uniqueStrings(values) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/**
 * @param {string} html
 * @returns {{ allowedTypes: string[], excludedTypes: string[], excludedNames: string[] }}
 */
export function parseAllowedTypesCell(html) {
  const text = htmlToLines(html).join(' ').replace(/\s+/g, ' ').trim();
  /** @type {string[]} */
  const excepts = [];
  const rest = text
    .replace(/\(\s*except\s+([^)]+)\)/gi, (_, inner) => {
      excepts.push(String(inner || '').trim());
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  const allowedTypes = uniqueStrings(rest.split(','));
  /** @type {string[]} */
  const excludedTypes = [];
  /** @type {string[]} */
  const excludedNames = [];
  for (const except of uniqueStrings(excepts)) {
    if (KNOWN_TYPE_SET.has(except.toLowerCase())) excludedTypes.push(except);
    else excludedNames.push(except);
  }
  return { allowedTypes, excludedTypes, excludedNames };
}

/**
 * @param {string} html
 * @param {number} reqLevel
 * @returns {{ modifiers: string[], classRestriction?: string }}
 */
export function parseRunewordStatsCell(html, reqLevel) {
  const joined = formatColoredStatLines(joinSplitColoredStatLines(htmlToColoredLines(html)));
  const parsed = parseItemStats(joined);
  /** @type {{ modifiers: string[], classRestriction?: string }} */
  const out = {
    modifiers: Array.isArray(parsed.modifiers) ? parsed.modifiers.map(String) : [],
  };
  if (parsed.classRestriction) out.classRestriction = parsed.classRestriction;
  void reqLevel;
  return out;
}

/**
 * @param {string[]} cells
 * @returns {{ nameHtml: string, levelHtml: string, runesHtml: string, typesHtml: string, statsHtml: string }|null}
 */
function assignRowCells(cells) {
  if (cells.length >= 6 && isIconOrEmptyCell(cells[2])) {
    return {
      nameHtml: cells[0],
      levelHtml: cells[1],
      runesHtml: cells[3],
      typesHtml: cells[4],
      statsHtml: cells[5],
    };
  }
  if (cells.length >= 5) {
    return {
      nameHtml: cells[0],
      levelHtml: cells[1],
      runesHtml: cells[2],
      typesHtml: cells[3],
      statsHtml: cells[4],
    };
  }
  return null;
}

/**
 * @param {RunewordTemplate} a
 * @param {RunewordTemplate} b
 * @returns {RunewordTemplate}
 */
function mergeDuplicateTemplates(a, b) {
  /** @type {RunewordTemplate} */
  const merged = {
    ...a,
    allowedTypes: uniqueStrings([...a.allowedTypes, ...b.allowedTypes]),
    excludedTypes: uniqueStrings([...a.excludedTypes, ...b.excludedTypes]),
    excludedNames: uniqueStrings([...a.excludedNames, ...b.excludedNames]),
  };
  if (!merged.classRestriction && b.classRestriction) {
    merged.classRestriction = b.classRestriction;
  }
  if ((!merged.modifiers || !merged.modifiers.length) && b.modifiers?.length) {
    merged.modifiers = b.modifiers;
  }
  return merged;
}

/**
 * @param {string} html
 * @returns {RunewordTemplate[]}
 */
export function parseRunewordsWiki(html) {
  const page = String(html || '');
  /** @type {RunewordTemplate[]} */
  const parsed = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(page))) {
    const tableHtml = tableMatch[1];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(tableHtml))) {
      const rowHtml = rowMatch[1];
      if (/<th\b/i.test(rowHtml)) continue;
      const cells = tableCells(rowHtml);
      const assigned = assignRowCells(cells);
      if (!assigned) continue;
      const named = parseRunewordNameCell(assigned.nameHtml);
      if (!named) continue;
      const levelText = htmlToLines(assigned.levelHtml).join(' ').trim();
      const reqLevel = Number(/^(\d+)/.exec(levelText)?.[1]);
      if (!Number.isFinite(reqLevel)) continue;
      const runesText = htmlToLines(assigned.runesHtml).join(' ');
      const runes = resolveRunes(named.runeCode, runesText);
      if (!runes.length) continue;
      const types = parseAllowedTypesCell(assigned.typesHtml);
      const stats = parseRunewordStatsCell(assigned.statsHtml, reqLevel);
      parsed.push({
        id: `rw:${slugify(named.name)}`,
        name: named.name,
        runeCode: named.runeCode,
        runes,
        reqLevel,
        allowedTypes: types.allowedTypes,
        excludedTypes: types.excludedTypes,
        excludedNames: types.excludedNames,
        ...(stats.classRestriction ? { classRestriction: stats.classRestriction } : {}),
        modifiers: stats.modifiers,
      });
    }
  }

  /** @type {Map<string, RunewordTemplate>} */
  const byKey = new Map();
  for (const entry of parsed) {
    const key = `${entry.name.toLowerCase()}\0${entry.runeCode.toLowerCase()}`;
    const prev = byKey.get(key);
    byKey.set(key, prev ? mergeDuplicateTemplates(prev, entry) : entry);
  }

  /** @type {RunewordTemplate[]} */
  const out = [];
  const usedIds = new Set();
  for (const entry of byKey.values()) {
    let id = entry.id;
    if (usedIds.has(id)) id = `rw:${slugify(entry.name)}-${slugify(entry.runeCode)}`;
    usedIds.add(id);
    out.push({ ...entry, id });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.runeCode.localeCompare(b.runeCode, 'en'));
  return out;
}
