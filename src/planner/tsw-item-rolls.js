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
  tswDescriptionColoredTexts,
  tswDescriptionTexts,
  tswRowIsCorrupted,
  tswRowIsEthereal,
} from '@/items/custom-items.js';
import {
  collectOverlayAffixSources,
  getOverlayOptionalModifiers,
  isOptionalModifier,
  isOverlayItem,
  isSetItem,
  overlayAffixRollKey,
  overlayFixedBoostRollKey,
} from '@/items/item-overlays.js';
import { decodeModifierLine, encodeModifierLine } from '@/items/item-modifier-line.js';
import { parseSkillBonusFromModifierLine } from '@/items/skill-bonus-from-modifiers.js';
import {
  isRelicItem,
  relicAffixRollKey,
  collectRelicAffixSources,
} from '@/items/relic-items.js';
import { parseTswSocketables } from '@/items/socketables.js';
import {
  parseRequiredLevelBonus,
  parseRequirementsReductionPct,
} from '@/items/item-requirements.js';

/** Boilerplate / flags that are not planner modifier lines. */
const TSW_EXTRA_SKIP_RE =
  /^(Defense:|One-Hand Damage|Two-Hand Damage|Throw Damage|Required |Durability|Item Level|Quality Level|Prefixes:|Suffixes:|Socketed \(|Can be Inserted|Ethereal|Corrupted|Quantity|Chance to Block|Innate \w+ Damage:|\(.*\)$)/i;

/** In-game set-tooltip headers that TSW appends after item mods. */
const SET_BONUS_HEADER_RE = /^Set Bonus with (complete set|\d+ or more set items):?$/i;

/** TSW dumps socketed runes as a no-space concat (e.g. FelFelFelFalFal). */
const TSW_SOCKETED_RUNE_DUMP_RE = /^[A-Z][a-z]*(?:[A-Z][a-z]*)+$/;

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isTswSocketedRuneDump(text) {
  return TSW_SOCKETED_RUNE_DUMP_RE.test(String(text || '').trim());
}

/**
 * Concatenated short names of socketed runes (Fel + Fal -> FelFal), if any.
 * @param {object|null|undefined} row
 * @returns {string}
 */
function tswSocketedRuneDump(row) {
  const socks = Array.isArray(row?.socketables) ? row.socketables : [];
  /** @type {string[]} */
  const names = [];
  for (const sock of socks) {
    const raw = String(sock?.name || '').trim();
    const m = raw.match(/^([A-Za-z]+)\s+Rune\b/i);
    if (!m) continue;
    names.push(m[1]);
  }
  return names.join('');
}

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
    // Keep `%` so "15% to Dexterity" does not claim "+50 to Dexterity".
    .replace(/[^a-z#%]+/g, '')
    // Collapse so "Innate Lightning Damage: 719 (62.0% of Dexterity)" matches
    // catalog "Innate Lightning Damage: (62.0% of Dexterity)".
    .replace(/#+/g, '#');
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function affixHasPercent(text) {
  return /%/.test(plain(text));
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
 * Extract numbers from affix text. A hyphen between digits (`43-61`) is a range
 * separator, not a negative sign — otherwise "Adds 43-61 Damage" becomes [43, -61].
 * @param {string} text
 * @returns {number[]}
 */
function numbers(text) {
  return [...plain(text).matchAll(/(?<!\d)[+-]?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
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
  if (affixHasPercent(tmpl) !== affixHasPercent(act)) return null;
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
        // Keep values outside [min, max] — TSW merges base roll + socket bonuses.
        if (!Number.isFinite(n)) return range.min;
        return n;
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
 * @returns {number|null}
 */
function firstNumber(text) {
  const ns = numbers(text);
  return ns.length ? ns[0] : null;
}

/**
 * @param {string} template
 * @param {string[]} lines
 * @returns {string|null}
 */
function findLineTextBySignature(template, lines) {
  const sig = signature(template);
  if (!sig) return null;
  for (const line of lines) {
    if (signature(line) === sig) return plain(line);
  }
  return null;
}

/**
 * @param {object|null|undefined} def
 * @returns {string[]}
 */
function charmBaseModifierTexts(def) {
  /** @type {string[]} */
  const out = [];
  for (const mod of Array.isArray(def?.modifiers) ? def.modifiers : []) {
    if (typeof mod === 'string') {
      const text = plain(mod);
      if (text) out.push(text);
    }
  }
  return out;
}

/**
 * How many identical fixed-number upgrade steps are implied by a stacked TSW line.
 * @param {string} stepText
 * @param {string[]} baseTexts
 * @param {string[]} lines
 * @returns {number}
 */
function stackedUpgradeCount(stepText, baseTexts, lines) {
  if (parseAffixRanges(stepText).length) return 0;
  const step = firstNumber(stepText);
  const sig = signature(stepText);
  if (step == null || !sig || !step) return 0;
  const actualLine = findLineTextBySignature(stepText, lines);
  if (!actualLine) return 0;
  const actual = firstNumber(actualLine);
  if (actual == null) return 0;
  let base = 0;
  for (const text of baseTexts) {
    if (signature(text) !== sig) continue;
    const n = firstNumber(text);
    if (n != null) base += n;
  }
  const delta = Math.abs(actual) - Math.abs(base);
  if (delta <= 0) return 0;
  const count = Math.round(delta / Math.abs(step));
  return count > 0 ? count : 0;
}

/**
 * Mark charm upgrade roll keys from TSW description lines (labels, exact affixes, stacks).
 * @param {object} def
 * @param {ReturnType<typeof getCharmUpgradeEntries>} upgrades
 * @param {string[]} lines
 * @param {Record<string, number>} rolls
 * @param {boolean} upgradedFlag
 */
function applyCharmUpgradeRolls(def, upgrades, lines, rolls, upgradedFlag) {
  if (!upgrades.length) return;
  const baseTexts = charmBaseModifierTexts(def);
  /** @type {Set<number>} */
  const marked = new Set();

  for (const entry of upgrades) {
    const customLabel =
      entry.label && !/^Upgrade\s+\d+$/i.test(entry.label) ? entry.label : '';
    if (customLabel && labelInLines(customLabel, lines)) {
      rolls[entry.key] = 1;
      marked.add(entry.index);
    } else if (entry.affixes.some((text) => findLine(text, lines))) {
      rolls[entry.key] = 1;
      marked.add(entry.index);
    } else if (
      // Multi-affix bundles: any stacked component means the whole upgrade is present.
      // Single-affix repeats are allocated by count in stackGroups below.
      entry.affixes.length > 1 &&
      entry.affixes.some((text) => stackedUpgradeCount(text, baseTexts, lines) >= 1)
    ) {
      rolls[entry.key] = 1;
      marked.add(entry.index);
    }
    entry.affixes.forEach((text, affixIndex) => {
      applyRanged(text, `upgrade:${entry.index}:${affixIndex}`, charmAffixRollKey, lines, rolls);
    });
  }

  /** @type {Map<string, { stepText: string, entries: typeof upgrades }>} */
  const stackGroups = new Map();
  for (const entry of upgrades) {
    if (entry.affixes.length !== 1) continue;
    const stepText = entry.affixes[0];
    if (parseAffixRanges(stepText).length) continue;
    const sig = signature(stepText);
    if (!sig || firstNumber(stepText) == null) continue;
    const group = stackGroups.get(sig) || { stepText, entries: [] };
    group.entries.push(entry);
    stackGroups.set(sig, group);
  }
  for (const group of stackGroups.values()) {
    const count = stackedUpgradeCount(group.stepText, baseTexts, lines);
    if (count < 1) continue;
    let remaining = Math.min(count, group.entries.length);
    for (const entry of group.entries) {
      if (remaining <= 0) break;
      rolls[entry.key] = 1;
      marked.add(entry.index);
      remaining -= 1;
    }
  }

  if (upgradedFlag && upgrades.length === 1 && !marked.has(upgrades[0].index)) {
    rolls[upgrades[0].key] = 1;
  }
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
    // Do not clamp to catalog range — socketables can push the shown total past max.
    rolls[keyFn(sourceKey, i)] = Number.isFinite(n) ? n : range.min;
  });
}

/**
 * Find a TSW line by signature only (allows different fixed numbers).
 * @param {string} template
 * @param {string[]} lines
 * @returns {{ line: string, values: number[] }|null}
 */
function findLineBySignature(template, lines) {
  const sig = signature(template);
  if (!sig) return null;
  for (const line of lines) {
    if (signature(line) !== sig) continue;
    return { line: plain(line), values: numbers(line) };
  }
  return null;
}

/**
 * Store fixed-number overrides when TSW shows different values than the catalog template
 * (e.g. +1 to All Skills → +2; Adds 7-13 Damage → Adds 43-61 Damage).
 * @param {string} text
 * @param {string} sourceKey
 * @param {string[]} lines
 * @param {Record<string, number>} rolls
 */
function applyFixedBoost(text, sourceKey, lines, rolls) {
  if (parseAffixRanges(text).length) return;
  const tmplNums = numbers(text);
  if (!tmplNums.length) return;
  const hit = findLineBySignature(text, lines);
  if (!hit?.values?.length) return;
  if (tmplNums.length !== hit.values.length) return;
  if (tmplNums.every((n, i) => n === hit.values[i])) return;
  hit.values.forEach((value, i) => {
    rolls[overlayFixedBoostRollKey(sourceKey, i)] = value;
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
  if (affixHasPercent(template) !== affixHasPercent(actual)) return false;
  if (matchAffixTemplate(template, actual)) return true;
  const sigT = signature(template);
  const sigA = signature(actual);
  // Claim by signature so BCL formulas / stacked fixed mods are not duplicated as extras.
  return Boolean(sigT && sigA && sigT === sigA);
}

/**
 * Flavor / section headers in set-bonus text (e.g. "Medals of Honor"), not affixes.
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeSetFlavorHeader(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[0-9%]/.test(t) || /^[+-]/.test(t)) return false;
  return /^[A-Za-z]/.test(t) && t.split(/\s+/).length >= 2;
}

/**
 * @typedef {{
 *   dumpLines: Set<string>,
 *   structuralLines: Set<string>,
 * }} SetDumpSkipContext
 */

/**
 * Build skip context so TSW's trailing in-game set dump is not kept as extras.
 * @param {object|null|undefined} def
 * @param {{
 *   setDef?: { bonuses?: Array<{ modifiers?: string[] }> }|null,
 *   siblingNames?: string[]|null,
 * }|null|undefined} [options]
 * @returns {SetDumpSkipContext|null}
 */
export function buildSetDumpSkipContext(def, options = null) {
  if (!isSetItem(def)) return null;
  /** @type {Set<string>} */
  const dumpLines = new Set();
  /** @type {Set<string>} */
  const structuralLines = new Set();
  /**
   * @param {string|null|undefined} raw
   * @param {boolean} [structural]
   */
  const add = (raw, structural = false) => {
    const lower = plain(raw).toLowerCase();
    if (!lower) return;
    dumpLines.add(lower);
    if (structural) structuralLines.add(lower);
  };

  const setName = def?.setName != null ? String(def.setName).trim() : '';
  if (setName) add(setName, true);

  const ownName = def?.name != null ? String(def.name).trim().toLowerCase() : '';
  for (const sibling of Array.isArray(options?.siblingNames) ? options.siblingNames : []) {
    const name = String(sibling || '').trim();
    if (!name || name.toLowerCase() === ownName) continue;
    add(name, true);
  }

  const bonuses = Array.isArray(options?.setDef?.bonuses) ? options.setDef.bonuses : [];
  for (const bonus of bonuses) {
    for (const mod of Array.isArray(bonus?.modifiers) ? bonus.modifiers : []) {
      const text = plain(mod);
      if (!text) continue;
      add(text, looksLikeSetFlavorHeader(text));
    }
  }

  if (!dumpLines.size && !structuralLines.size) return null;
  return { dumpLines, structuralLines };
}

/**
 * Drop a trailing run of set-dump lines when a structural marker is present.
 * Keeps MO/jewel leftovers that merely share a set-bonus affix string.
 * @param {string[]} extras
 * @param {SetDumpSkipContext|null|undefined} ctx
 * @returns {string[]}
 */
export function stripTrailingSetDumpExtras(extras, ctx) {
  if (!ctx || !Array.isArray(extras) || !extras.length) return extras || [];
  let end = extras.length;
  let sawStructural = false;
  while (end > 0) {
    const text = plain(extras[end - 1]);
    if (!text) {
      end -= 1;
      continue;
    }
    const lower = text.toLowerCase();
    const isHeader = SET_BONUS_HEADER_RE.test(text);
    const isDump = isHeader || ctx.dumpLines.has(lower);
    if (!isDump) break;
    if (isHeader || ctx.structuralLines.has(lower)) sawStructural = true;
    end -= 1;
  }
  if (!sawStructural || end === extras.length) return extras;
  return extras.slice(0, end);
}

/**
 * Non-boilerplate TSW description lines not claimed by catalog affixes (MOs, jewels, etc.).
 * @param {object|null|undefined} row
 * @param {object|null|undefined} def
 * @param {SetDumpSkipContext|null|undefined} [setDumpCtx]
 * @returns {string[]}
 */
export function extrasFromTswItem(row, def, setDumpCtx = null) {
  if (!row || typeof row !== 'object') return [];
  const name = tswRowName(row);
  const type = row?.type != null ? String(row.type).trim() : '';
  const base = stripTswBaseLabel(type || name);
  const defBaseName = def?.baseName != null ? String(def.baseName).trim() : '';
  const runeDump = tswSocketedRuneDump(row);
  /** @type {Set<string>} */
  const skip = new Set(
    [
      name,
      type,
      base,
      stripTswBaseLabel(name),
      defBaseName,
      stripTswBaseLabel(defBaseName),
      def?.name != null ? String(def.name) : '',
      runeDump,
    ]
      .map((s) => String(s || '')
        .trim()
        .toLowerCase())
      .filter(Boolean)
  );
  /** @type {Set<string>} */
  const skipStrippedBases = new Set(
    [base, stripTswBaseLabel(name), stripTswBaseLabel(type), stripTswBaseLabel(defBaseName)]
      .map((s) => String(s || '')
        .trim()
        .toLowerCase())
      .filter(Boolean)
  );
  const templates = catalogModifierTemplates(def);
  /** @type {string[]} */
  const out = [];
  for (const line of tswDescriptionColoredTexts(row.description_lines)) {
    const text = plain(line.text);
    if (!text) continue;
    const lower = text.toLowerCase();
    if (skip.has(lower)) continue;
    // "Wrist Blade (Sacred)" must not become an extra when type is "Wrist Blade (SSU)".
    if (skipStrippedBases.has(stripTswBaseLabel(text).toLowerCase())) continue;
    if (TSW_EXTRA_SKIP_RE.test(text)) continue;
    // Socketed rune name dump (FelFelFelFalFal), even if socketables were omitted.
    if (isTswSocketedRuneDump(text)) continue;
    // Leftover `+N Required Level` / `Requirements +/-%` is the net TSW total.
    if (parseRequiredLevelBonus(text) !== 0 || parseRequirementsReductionPct(text) !== 0) {
      out.push(encodeModifierLine(text, line.color) || text);
      continue;
    }
    if (templates.some((tmpl) => lineMatchesCatalogTemplate(tmpl, text))) continue;
    out.push(encodeModifierLine(text, line.color) || text);
  }
  return stripTrailingSetDumpExtras(out, setDumpCtx);
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
 * @param {SetDumpSkipContext|null|undefined} [setDumpCtx]
 * @returns {{
 *   extras?: string[],
 *   mysticOrbs?: Array<[number, string]>,
 *   socketables?: import('@/items/socketables.js').SocketableEntry[],
 *   ethereal?: boolean,
 *   corrupted?: boolean,
 * }}
 */
export function tswInstanceExtras(row, def, setDumpCtx = null) {
  /** @type {{
   *   extras?: string[],
   *   mysticOrbs?: Array<[number, string]>,
   *   socketables?: import('@/items/socketables.js').SocketableEntry[],
   *   ethereal?: boolean,
   *   corrupted?: boolean,
   * }} */
  const out = {};
  const extras = extrasFromTswItem(row, def, setDumpCtx);
  if (extras.length) out.extras = extras;
  const mysticOrbs = parseTswMysticOrbs(row?.mystic_orbs);
  if (mysticOrbs.length) out.mysticOrbs = mysticOrbs;
  const socketables = parseTswSocketables(row);
  if (socketables.length) out.socketables = socketables;
  if (tswRowIsEthereal(row)) out.ethereal = true;
  if (tswRowIsCorrupted(row)) out.corrupted = true;
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
    applyCharmUpgradeRolls(def, upgrades, lines, rolls, upgraded);

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
      applyFixedBoost(source.text, source.sourceKey, lines, rolls);
    }
  }

  return rolls;
}
