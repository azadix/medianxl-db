/**
 * @file Map TSW description lines onto planner affix roll keys.
 * @module planner/tsw-item-rolls
 */

import { parseAffixRanges } from '@/items/affix-rolls.js';
import {
  CHARM_ROLL_KEYS,
  charmAffixRollKey,
  charmPoolHighRollKey,
  charmPoolOptionSourceKey,
  charmPoolOptionTexts,
  getCharmModifierPools,
  getCharmTrophyEntry,
  getCharmTrophyOptions,
  getCharmUpgradeEntries,
  getParagonHammerConfig,
  hasCharmExtraAwakening,
  isCharmItem,
  isModifierPool,
} from '@/items/charm-items.js';
import {
  stripTswBaseLabel,
  tswDescriptionTexts,
  tswRowIsEthereal,
} from '@/items/custom-items.js';
import {
  collectOverlayAffixSources,
  getOverlayOptionalModifiers,
  isOptionalModifier,
  isOverlayItem,
  overlayAffixRollKey,
} from '@/items/item-overlays.js';
import { decodeModifierLine } from '@/items/item-modifier-line.js';
import { parseSkillBonusFromModifierLine } from '@/items/skill-bonus-from-modifiers.js';
import {
  isRelicItem,
  relicAffixRollKey,
  collectRelicAffixSources,
} from '@/items/relic-items.js';

/** Boilerplate / flags that are not planner modifier lines. */
const TSW_EXTRA_SKIP_RE =
  /^(Defense:|One-Hand Damage|Two-Hand Damage|Throw Damage|Required |Durability|Item Level|Quality Level|Prefixes:|Suffixes:|Socketed \(|Can be Inserted|Ethereal|Corrupted|Already Upgraded|Quantity|Chance to Block|\(.*\)$)/i;

const STOP = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'from',
  'in',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'when',
  'with',
  'your',
]);

/**
 * @param {string} text
 * @returns {string}
 */
function plain(text) {
  return decodeModifierLine(text).text || String(text || '').trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
function signature(text) {
  return plain(text)
    .toLowerCase()
    .replace(/\+\((-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\)/g, '#')
    .replace(/\((-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\)/g, '#')
    .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/[^a-z#]+/g, '');
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokens(text) {
  return plain(text)
    .toLowerCase()
    .replace(/[+-]?\d+(?:\.\d+)?/g, ' ')
    .split(/[^a-z]+/)
    .map((w) => w.replace(/(?:ing|ed|es|s)$/, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * @param {string} text
 * @returns {number[]}
 */
function numbers(text) {
  return [...plain(text).matchAll(/[+-]?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} template
 * @param {string} actual
 * @returns {number[]|null}
 */
export function matchAffixTemplate(template, actual) {
  const tmpl = plain(template);
  const act = plain(actual);
  if (!tmpl || !act) return null;
  const ranges = parseAffixRanges(tmpl);
  if (ranges.length) {
    let pattern = '';
    let last = 0;
    for (const range of ranges) {
      pattern += escapeRe(tmpl.slice(last, range.start));
      pattern += '\\+?([+-]?\\d+(?:\\.\\d+)?)';
      last = range.end;
    }
    pattern += escapeRe(tmpl.slice(last));
    const re = new RegExp(`^${pattern}$`, 'i');
    const m = re.exec(act);
    if (m) {
      const values = ranges.map((range, i) => {
        const n = Number(m[i + 1]);
        if (!Number.isFinite(n)) return range.min;
        return Math.min(range.max, Math.max(range.min, n));
      });
      return values;
    }
  }
  if (signature(tmpl) === signature(act)) {
    if (!ranges.length && !sameAbsoluteNumbers(tmpl, act)) return null;
    return ranges.length ? numbers(act).slice(0, ranges.length) : [];
  }
  const ta = tokens(tmpl);
  const tb = tokens(act);
  if (!ta.length || !tb.length) return null;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const hit = small.filter((w) => large.includes(w)).length;
  if (hit < Math.min(2, small.length) || hit / small.length < 0.7) return null;
  if (!sameAbsoluteNumbers(tmpl, act)) return null;
  return ranges.length ? numbers(act).slice(0, ranges.length) : [];
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameAbsoluteNumbers(a, b) {
  const na = numbers(a)
    .map((n) => Math.abs(n))
    .sort((x, y) => x - y);
  const nb = numbers(b)
    .map((n) => Math.abs(n))
    .sort((x, y) => x - y);
  if (!na.length && !nb.length) return true;
  if (!na.length || !nb.length) return true;
  return na.length === nb.length && na.every((n, i) => n === nb[i]);
}

/**
 * @param {string} label
 * @param {string[]} lines
 * @returns {boolean}
 */
function labelInLines(label, lines) {
  const want = plain(label)
    .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
    .toLowerCase();
  if (!want) return false;
  return lines.some((line) => {
    const have = plain(line)
      .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
      .toLowerCase();
    return have === want || have.includes(want);
  });
}

/**
 * @param {{ label: string, affixes: string[] }[]} options
 * @param {string[]} lines
 * @returns {Array<{ index: number, score: number }>}
 */
function rankTrophyOptions(options, lines) {
  /** @type {Array<{ index: number, score: number }>} */
  const ranked = [];
  options.forEach((opt, index) => {
    let score = 0;
    for (const text of opt.affixes) {
      if (findLine(text, lines)) score += 1;
    }
    if (labelInLines(opt.label, lines)) score += opt.affixes.length || 1;
    if (score > 0) ranked.push({ index, score });
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked;
}

/**
 * @param {string} template
 * @param {string[]} lines
 * @returns {{ line: string, values: number[] }|null}
 */
function findLine(template, lines) {
  for (const line of lines) {
    const values = matchAffixTemplate(template, line);
    if (values) return { line, values };
  }
  return null;
}

/**
 * @param {string} text
 * @param {string} sourceKey
 * @param {(sourceKey: string, rangeIndex: number) => string} keyFn
 * @param {string[]} lines
 * @param {Record<string, number>} rolls
 */
function applyRanged(text, sourceKey, keyFn, lines, rolls) {
  const ranges = parseAffixRanges(text);
  if (!ranges.length) return;
  const hit = findLine(text, lines);
  if (!hit) return;
  ranges.forEach((range, i) => {
    const n = Number(hit.values[i]);
    rolls[keyFn(sourceKey, i)] = Number.isFinite(n)
      ? Math.min(range.max, Math.max(range.min, n))
      : range.min;
  });
}

/**
 * @param {unknown} rows
 * @param {string} className
 * @returns {number}
 */
export function inferTswClassSkillsBonus(rows, className) {
  const want = String(className || '').trim().toLowerCase();
  if (!want) return 0;
  let total = 0;
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const location = String(row.location || '').trim();
    if (location !== 'Gear' && location !== 'Inventory') continue;
    for (const text of tswDescriptionTexts(row.description_lines)) {
      const parsed = parseSkillBonusFromModifierLine(text);
      if (parsed?.kind !== 'class') continue;
      if (String(parsed.className || '').trim().toLowerCase() !== want) continue;
      const n = Number(parsed.amount);
      if (Number.isFinite(n)) total += n;
    }
  }
  return Math.max(0, Math.floor(total));
}

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
function tswRowName(row) {
  const display = row?.display_name != null ? String(row.display_name).trim() : '';
  if (display) return display;
  return row?.item != null ? String(row.item).trim() : '';
}

/**
 * Catalog / overlay modifier templates used to claim TSW description lines.
 * @param {object|null|undefined} def
 * @returns {string[]}
 */
export function catalogModifierTemplates(def) {
  /** @type {string[]} */
  const out = [];
  if (!def || typeof def !== 'object') return out;
  const push = (raw) => {
    const text = plain(raw);
    if (text) out.push(text);
  };
  for (const mod of Array.isArray(def.modifiers) ? def.modifiers : []) {
    if (isOptionalModifier(mod)) {
      push(mod.text);
      continue;
    }
    if (typeof mod === 'string') push(mod);
  }
  for (const optional of getOverlayOptionalModifiers(def)) {
    push(optional.text);
  }
  if (def.adds != null) push(def.adds);
  if (def.innate != null) {
    for (const line of String(def.innate).split(/\r?\n/)) push(line);
  }
  return out;
}

/**
 * @param {string} template
 * @param {string} actual
 * @returns {boolean}
 */
function lineMatchesCatalogTemplate(template, actual) {
  if (matchAffixTemplate(template, actual)) return true;
  const sigT = signature(template);
  const sigA = signature(actual);
  // Claim by signature so BCL formulas / stacked fixed mods are not duplicated as extras.
  return Boolean(sigT && sigA && sigT === sigA);
}

/**
 * Non-boilerplate TSW description lines not claimed by catalog affixes (MOs, jewels, etc.).
 * @param {object|null|undefined} row
 * @param {object|null|undefined} def
 * @returns {string[]}
 */
export function extrasFromTswItem(row, def) {
  if (!row || typeof row !== 'object') return [];
  const name = tswRowName(row);
  const type = row?.type != null ? String(row.type).trim() : '';
  const base = stripTswBaseLabel(type || name);
  /** @type {Set<string>} */
  const skip = new Set(
    [name, type, base, stripTswBaseLabel(name), def?.name != null ? String(def.name) : '']
      .map((s) => String(s || '')
        .trim()
        .toLowerCase())
      .filter(Boolean)
  );
  const templates = catalogModifierTemplates(def);
  /** @type {string[]} */
  const out = [];
  for (const line of tswDescriptionTexts(row.description_lines)) {
    const text = plain(line);
    if (!text) continue;
    if (skip.has(text.toLowerCase())) continue;
    if (TSW_EXTRA_SKIP_RE.test(text)) continue;
    if (templates.some((tmpl) => lineMatchesCatalogTemplate(tmpl, text))) continue;
    out.push(text);
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {Array<[number, string]>}
 */
export function parseTswMysticOrbs(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Array<[number, string]>} */
  const out = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const count = Math.floor(Number(entry[0]));
    const name = String(entry[1] ?? '').trim();
    if (!Number.isFinite(count) || count < 1 || !name) continue;
    out.push([count, name]);
  }
  return out;
}

/**
 * Snapshot fields for catalog / runeword TSW gear beyond defId + rolls.
 * @param {object|null|undefined} row
 * @param {object|null|undefined} def
 * @returns {{ extras?: string[], mysticOrbs?: Array<[number, string]>, ethereal?: boolean }}
 */
export function tswInstanceExtras(row, def) {
  /** @type {{ extras?: string[], mysticOrbs?: Array<[number, string]>, ethereal?: boolean }} */
  const out = {};
  const extras = extrasFromTswItem(row, def);
  if (extras.length) out.extras = extras;
  const mysticOrbs = parseTswMysticOrbs(row?.mystic_orbs);
  if (mysticOrbs.length) out.mysticOrbs = mysticOrbs;
  if (tswRowIsEthereal(row)) out.ethereal = true;
  return out;
}

/**
 * @param {object} row
 * @param {object|null|undefined} def
 * @param {string|null|undefined} [className]
 * @returns {Record<string, number>}
 */
export function rollsFromTswItem(row, def, className = null) {
  /** @type {Record<string, number>} */
  const rolls = {};
  if (!row || !def) return rolls;
  const lines = tswDescriptionTexts(row.description_lines);

  if (isCharmItem(def)) {
    let modIndex = 0;
    let poolIndex = 0;
    for (const mod of Array.isArray(def.modifiers) ? def.modifiers : []) {
      if (isModifierPool(mod)) {
        const pooled = getCharmModifierPools(def).find((p) => p.poolIndex === poolIndex);
        const opts = pooled ? pooled.options : [];
        let selected = -1;
        let high = 0;
        opts.forEach((option, optionIndex) => {
          for (const text of charmPoolOptionTexts(option)) {
            if (!findLine(text, lines)) continue;
            selected = optionIndex;
            if (option.high && findLine(option.high, lines)) high = 1;
            applyRanged(text, charmPoolOptionSourceKey(poolIndex, optionIndex), charmAffixRollKey, lines, rolls);
          }
        });
        if (selected >= 0) {
          rolls[`${CHARM_ROLL_KEYS.poolPrefix}${poolIndex}`] = selected;
          if (high) rolls[charmPoolHighRollKey(poolIndex)] = 1;
        }
        poolIndex += 1;
        continue;
      }
      if (typeof mod === 'string') {
        applyRanged(mod, `base:m${modIndex}`, charmAffixRollKey, lines, rolls);
        modIndex += 1;
      }
    }

    const upgraded = Boolean(row.is_upgraded);
    const hasTrophy = Boolean(row.has_trophy);
    const upgrades = getCharmUpgradeEntries(def, className);
    if (upgraded) {
      for (const entry of upgrades) {
        const matched = entry.affixes.filter((text) => findLine(text, lines));
        if (matched.length || upgrades.length === 1) {
          rolls[entry.key] = 1;
        }
        entry.affixes.forEach((text, affixIndex) => {
          applyRanged(text, `upgrade:${entry.index}:${affixIndex}`, charmAffixRollKey, lines, rolls);
        });
      }
    }

    const trophy = getCharmTrophyEntry(def);
    if (hasTrophy && trophy) {
      rolls[CHARM_ROLL_KEYS.trophy] = 1;
      trophy.affixes.forEach((text, affixIndex) => {
        applyRanged(text, `trophy:${affixIndex}`, charmAffixRollKey, lines, rolls);
      });
    }

    const trophyOptions = getCharmTrophyOptions(def);
    if (hasTrophy && trophyOptions.length) {
      const ranked = rankTrophyOptions(trophyOptions, lines);
      if (ranked.length) {
        const primary = ranked[0];
        rolls[CHARM_ROLL_KEYS.trophyIndex] = primary.index + 1;
        trophyOptions[primary.index].affixes.forEach((text, affixIndex) => {
          applyRanged(text, `trophyOpt:${primary.index + 1}:${affixIndex}`, charmAffixRollKey, lines, rolls);
        });
        const awakened =
          upgraded || lines.some((line) => /\bawakened\b/i.test(plain(line)));
        if (hasCharmExtraAwakening(def) && awakened && ranked.length > 1) {
          const secondary = ranked.find((entry) => entry.index !== primary.index);
          if (secondary) {
            rolls[CHARM_ROLL_KEYS.awakening] = 1;
            rolls[CHARM_ROLL_KEYS.trophyIndex2] = secondary.index + 1;
            trophyOptions[secondary.index].affixes.forEach((text, affixIndex) => {
              applyRanged(
                text,
                `trophyOpt2:${secondary.index + 1}:${affixIndex}`,
                charmAffixRollKey,
                lines,
                rolls
              );
            });
          }
        }
      }
    }

    const paragon = getParagonHammerConfig(def);
    if (paragon) {
      const regulars = Array.isArray(paragon.regularUpgrades) ? paragon.regularUpgrades : [];
      regulars.forEach((step, index) => {
        const affixes = Array.isArray(step?.affixes) ? step.affixes : [];
        if (affixes.some((text) => findLine(String(text), lines))) {
          rolls[`${CHARM_ROLL_KEYS.paragonRegularPrefix}${index}`] = 1;
        }
        affixes.forEach((text, affixIndex) => {
          applyRanged(String(text), `paragonRegular:${index}:${affixIndex}`, charmAffixRollKey, lines, rolls);
        });
      });
      const paths = Array.isArray(paragon.paragonPaths) ? paragon.paragonPaths : [];
      paths.forEach((path, i) => {
        const affixes = Array.isArray(path?.affixes) ? path.affixes : [];
        if (affixes.some((text) => findLine(String(text), lines))) {
          rolls[CHARM_ROLL_KEYS.paragonPath] = i + 1;
        }
      });
      if (paragon.justicar) {
        const affixes = Array.isArray(paragon.justicar.affixes) ? paragon.justicar.affixes : [];
        if (affixes.some((text) => findLine(String(text), lines))) {
          rolls[CHARM_ROLL_KEYS.paragonJusticar] = 1;
        }
      }
    }
  }

  if (isRelicItem(def)) {
    for (const source of collectRelicAffixSources(def)) {
      applyRanged(source.text, source.sourceKey, relicAffixRollKey, lines, rolls);
    }
  }

  if (isOverlayItem(def)) {
    for (const optional of getOverlayOptionalModifiers(def)) {
      if (findLine(optional.text, lines)) rolls[optional.key] = 1;
    }
    for (const source of collectOverlayAffixSources(def, rolls)) {
      applyRanged(source.text, source.sourceKey, overlayAffixRollKey, lines, rolls);
    }
  }

  return rolls;
}
