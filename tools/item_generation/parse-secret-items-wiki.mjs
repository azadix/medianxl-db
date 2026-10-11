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
const RELIC_NAMES = new Set([
  "Bonehexer's Puzzlebox",
  "Skinrender's Ear",
  'Time-Lost Relic',
  'Blood of Creation',
]);

/** Outcome labels from Time-Lost Relic stats (base cube item is dropped). */
const TIME_LOST_RELIC_VARIANTS = [
  { test: /Cone of Cold/i, variant: 'Cone of Cold' },
  { test: /Lightning Enchanted/i, variant: 'Lightning Enchanted' },
  { test: /Fire Cannonade/i, variant: 'Fire Cannonade' },
  { test: /Judgement Day/i, variant: 'Judgement Day' },
  { test: /Body of the Savior/i, variant: 'Body of the Savior' },
];

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
const SECRET_ITEM_ICONS = {
  'Blood of Creation': BLOOD_OF_CREATION_ICON,
  "Bonehexer's Puzzlebox": 'relicbone',
  "Skinrender's Ear": 'relicskin',
  'Time-Lost Relic': 'invtimerelic',
  'Celestial Sigil': 'sigilx',
  "Assur's Bane": 'ring08',
  'Ring of Pride': 'invrinquest',
  'Ring of Virtue': 'invrinquest',
};

/** Base Assur's Bane (scroll upgrades omitted). Not listed on Secret Items wiki. */
export const ASSUR_BANE_ENTRY = {
  name: "Assur's Bane",
  quality: 'SU',
  type: 'Ring',
  source: 'secret',
  icon: 'ring08',
  stats: [
    'Required Level: 100',
    'Item Level: 1',
    '+1 to All Skills',
    'Adds 7-13 Damage',
    '+30% Damage to Undead',
    '+1 to Purify',
    'Maximum Life +3%',
    'Maximum Mana +10%',
    '+2 to Light Radius',
    "{orange}Assur's Curse",
    '{grey}If two of these rings are equipped:',
    '{orange}Maximum Elemental Resists -10%',
  ].join('\n'),
};

/**
 * Drop the inert base Time-Lost Relic; name outcomes by their granted effect.
 * @param {UniqueStatsEntry} entry
 * @returns {UniqueStatsEntry|null}
 */
function applyTimeLostRelicFixes(entry) {
  if (entry.name !== 'Time-Lost Relic') return entry;
  const stats = String(entry.stats || '');
  if (/Cube with Essence of Time/i.test(stats)) return null;
  for (const { test, variant } of TIME_LOST_RELIC_VARIANTS) {
    if (test.test(stats)) {
      entry.variant = variant;
      return entry;
    }
  }
  return null;
}

/**
 * Class restriction, red-bottle art, and Version 1 duplicate skill line.
 * @param {UniqueStatsEntry} entry
 * @returns {UniqueStatsEntry|null}
 */
function applySecretItemFixes(entry) {
  const secretIcon = SECRET_ITEM_ICONS[entry.name];
  if (secretIcon) entry.icon = secretIcon;
  const timed = applyTimeLostRelicFixes(entry);
  if (!timed) return null;
  if (timed.name !== 'Blood of Creation') return timed;
  const classOnly = BLOOD_OF_CREATION_CLASS_BY_VERSION[timed.variant || ''];
  if (classOnly) {
    const lines = String(timed.stats || '').split('\n');
    if (!lines.some((line) => /^\([^)]+Only\)$/i.test(line.trim()))) {
      const reqIdx = lines.findIndex((line) => /^Required Level:/i.test(line));
      const insertAt = reqIdx >= 0 ? reqIdx + 1 : 0;
      lines.splice(insertAt, 0, `(${classOnly})`);
      timed.stats = lines.join('\n');
    }
  }
  if (timed.variant === 'Version 1') {
    let seenCrystalline = false;
    timed.stats = String(timed.stats || '')
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
  return timed;
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

    const fixed = applySecretItemFixes(entry);
    if (fixed) entries.push(fixed);
  }

  if (!entries.some((e) => e.name === "Assur's Bane")) {
    entries.push({ ...ASSUR_BANE_ENTRY });
  }

  return entries;
}
