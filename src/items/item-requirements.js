/**
 * @file Effective item level/stat requirements (catalog + Requirements -% + socketables).
 * @module items/item-requirements
 */

import { isModifierLineActive, modifierLineText } from '@/items/item-modifier-line.js';
import { stripDisplayedRollRanges } from '@/items/affix-rolls.js';
import { getOverlayStatLines, isOverlayItem } from '@/items/item-overlays.js';
import {
  getWormholeCycleReqLevelBonus,
  isCorruptedWormhole,
} from '@/items/wormhole-cycles.js';
import {
  getMysticOrbBonusLines,
  lookupMysticOrb,
  mysticOrbReqLevelPerStack,
  mysticOrbsRequiredLevelBonus,
  mysticOrbsRequiredLevelParts,
  normalizeMysticOrbs,
} from '@/items/mystic-orbs.js';
import { corruptionRequiredLevelBonus, successfulCorruptionCount } from '@/items/corruptions.js';
import {
  itemForbidsSocketsAndEnhancements,
  uniqueCorruptionReqLevelPerSuccess,
} from '@/items/item-unique-rules.js';
import { getItemUpgradeFlags } from '@/items/item-upgrades.js';

/** Ethereal items subtract this from base str/dex before Requirements +/-%. */
export const ETHEREAL_BASE_REQ_FLAT = 10;

/**
 * @typedef {{
 *   reqLevel?: number,
 *   reqStr?: number,
 *   reqDex?: number,
 *   reductionPct?: number,
 *   modifiers?: Array<string|{ oneOf: string[] }>,
 * }} ItemRequirementSource
 *
 * @typedef {{
 *   reqLevel: number,
 *   reqStr: number,
 *   reqDex: number,
 *   reductionPct: number,
 * }} ItemRequirements
 */

const REQ_REDUCED_BY_RE = /^Requirements\s+Reduced\s+by\s+(\d+(?:\.\d+)?)\s*%$/i;
const REQ_FLAT_RE = /^Requirements\s*([+-]?\d+(?:\.\d+)?)\s*%$/i;
const REQ_RANGE_RE =
  /^Requirements\s*-\(\s*(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\s*\)\s*%$/i;
const REQ_LEVEL_BONUS_RE = /^\+?\s*(-?\d+)\s+Required Level$/i;

/**
 * Percent reduction from a single modifier line (`Requirements -20%`).
 * `Requirements +N%` returns a negative value (requirement increase).
 * @param {string|null|undefined} text
 * @returns {number}
 */
export function parseRequirementsReductionPct(text) {
  if (!isModifierLineActive(text)) return 0;
  const s = stripDisplayedRollRanges(modifierLineText(text)).replace(/\s+/g, ' ').trim();
  if (!s) return 0;
  const reducedBy = REQ_REDUCED_BY_RE.exec(s);
  if (reducedBy) return Math.abs(Number(reducedBy[1])) || 0;
  const range = REQ_RANGE_RE.exec(s);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.abs((a + b) / 2);
  }
  const flat = REQ_FLAT_RE.exec(s);
  if (flat) {
    const n = Number(flat[1]);
    if (!Number.isFinite(n) || n === 0) return 0;
    // Negative game text (`Requirements -20%`) reduces; positive increases.
    return n < 0 ? Math.abs(n) : -n;
  }
  return 0;
}

/**
 * True for any `Requirements +/-N%` line, including `Requirements +0%` leftovers.
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isRequirementsPercentLine(text) {
  if (!isModifierLineActive(text)) return false;
  const s = stripDisplayedRollRanges(modifierLineText(text)).replace(/\s+/g, ' ').trim();
  if (!s) return false;
  return REQ_REDUCED_BY_RE.test(s) || REQ_RANGE_RE.test(s) || REQ_FLAT_RE.test(s);
}

/**
 * Flat required-level bonus from mystic orbs (`+40 Required Level`).
 * @param {string|null|undefined} text
 * @returns {number}
 */
export function parseRequiredLevelBonus(text) {
  if (!isModifierLineActive(text)) return 0;
  const s = stripDisplayedRollRanges(modifierLineText(text)).replace(/\s+/g, ' ').trim();
  const match = REQ_LEVEL_BONUS_RE.exec(s);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n !== 0 ? n : 0;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function nonNeg(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Median: `base + trunc(base * signedPct / 100)` (64-bit integer div toward 0).
 * @param {number} base
 * @param {number} signedPct
 * @returns {number}
 */
function applyItemReqPercent(base, signedPct) {
  const n = Number(base);
  const pct = Number(signedPct);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(pct) || pct === 0) return n;
  return Math.max(0, n + Math.trunc((n * pct) / 100));
}

/**
 * @param {ItemRequirementSource|null|undefined} source
 * @param {string[]} texts
 * @returns {void}
 */
function pushSourceModifierTexts(source, texts) {
  if (!source || !Array.isArray(source.modifiers)) return;
  for (const mod of source.modifiers) {
    if (typeof mod === 'string' && mod.trim()) texts.push(mod);
  }
}

/**
 * Unique/set overlay (or plain modifier) lines used for Requirements -%.
 * Overlay items use rolled affix lines so `Requirements -(40 to 50)%` resolves.
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {string[]}
 */
function collectOverlayRequirementModifierTexts(def, rolls) {
  /** @type {string[]} */
  const texts = [];
  if (def && isOverlayItem(def)) {
    texts.push(...getOverlayStatLines(def, rolls, { hideRollableRanges: false }));
  } else if (Array.isArray(def?.modifiers)) {
    pushSourceModifierTexts(def, texts);
  }
  return texts;
}

/**
 * Sigil of Absolution (and similar) cannot apply when the host is below min required level.
 * @param {object|null|undefined} def
 * @param {{
 *   rolls?: Record<string, number>|null,
 *   socketables?: ItemRequirementSource[]|null,
 *   extras?: string[]|null,
 *   mysticOrbs?: unknown,
 *   corruptions?: string[]|null,
 * }} [options]
 * @param {string|null|undefined} name
 * @param {number} nextCount
 * @returns {boolean}
 */
export function itemAllowsMysticOrbReqLevel(def, options = {}, name, nextCount) {
  const min = Number(lookupMysticOrb(name)?.minHostReqLevel);
  if (!Number.isFinite(min) || min <= 0) return true;
  const without = normalizeMysticOrbs(options.mysticOrbs).filter(([, orbName]) => orbName !== name);
  let req = resolveItemRequirements(def, { ...options, mysticOrbs: without }).reqLevel;
  const delta = mysticOrbReqLevelPerStack(name);
  const stacks = Math.max(0, Math.floor(Number(nextCount) || 0));
  for (let i = 0; i < stacks; i += 1) {
    if (req < min) return false;
    req += delta;
  }
  return true;
}

/**
 * Keep a displayed `+N Required Level` line (TSW extras / item mods). If none is
 * present, synthesize one from applied mystic orb stacks.
 * @param {string[]|null|undefined} extras
 * @param {unknown} mysticOrbs
 * @param {string[]|null|undefined} [hostLines]
 * @returns {string[]}
 */
export function extrasWithMysticOrbRequiredLevel(extras, mysticOrbs, hostLines = null) {
  const list = Array.isArray(extras)
    ? extras.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  const hosts = Array.isArray(hostLines) ? hostLines : [];
  if ([...list, ...hosts].some((line) => parseRequiredLevelBonus(line) !== 0)) return list;
  const bonus = mysticOrbsRequiredLevelBonus(mysticOrbs);
  if (bonus > 0) return [...list, `+${bonus} Required Level`];
  if (bonus < 0) return [...list, `${bonus} Required Level`];
  return list;
}

/**
 * TSW leftover `+N Required Level` is the net orb bonus (Sigil of Absolution is
 * often missing from `mystic_orbs` but already subtracted there). Trust that
 * leftover when it disagrees with catalog stacks. If leftover matches the
 * positive stack total, apply listed negative effigies. If there is no leftover,
 * use mystic orb stacks.
 * @param {number} textBonus
 * @param {number} [positiveBonus]
 * @param {number} [negativeBonus]
 * @returns {number}
 */
export function combinedRequiredLevelBonus(textBonus, positiveBonus = 0, negativeBonus = 0) {
  const text = Number.isFinite(Number(textBonus)) ? Number(textBonus) : 0;
  const positive = Number.isFinite(Number(positiveBonus)) ? Number(positiveBonus) : 0;
  const negative = Number.isFinite(Number(negativeBonus)) ? Number(negativeBonus) : 0;
  if (text === 0) return positive + negative;
  if (text === positive) return text + negative;
  return text;
}

/**
 * Catalog reqs, raised by socketable reqs, then `+N Required Level` (MOs / effigies)
 * applied after that post-socket value. Str/dex use base reqs, then Requirements -%.
 * A TSW leftover `Requirements +/-%` is the net unique+jewel+MO total.
 * Ethereal subtracts 10 from base str/dex before %.
 * @param {object|null|undefined} def
 * @param {{
 *   rolls?: Record<string, number>|null,
 *   socketables?: ItemRequirementSource[]|null,
 *   extras?: string[]|null,
 *   mysticOrbs?: unknown,
 *   corruptions?: string[]|null,
 *   ethereal?: boolean,
 * }} [options]
 * @returns {ItemRequirements}
 */
export function resolveItemRequirements(def, options = {}) {
  const socketables = Array.isArray(options.socketables) ? options.socketables : [];
  const extras = Array.isArray(options.extras)
    ? options.extras.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  let reqLevel = nonNeg(def?.reqLevel);
  const ethereal =
    options.ethereal === true ||
    def?.ethereal === true ||
    getItemUpgradeFlags({
      corruptions: options.corruptions,
      mysticOrbs: options.mysticOrbs,
    }).etherealForced;
  const ethFlat = ethereal ? ETHEREAL_BASE_REQ_FLAT : 0;
  const baseStr = nonNeg(def?.baseReqStr ?? def?.reqStr);
  const baseDex = nonNeg(def?.baseReqDex ?? def?.reqDex);
  let reqStr = def?.reqStrFinal
    ? nonNeg(def?.reqStr)
    : Math.max(0, baseStr - (baseStr > 0 ? ethFlat : 0));
  let reqDex = def?.reqDexFinal
    ? nonNeg(def?.reqDex)
    : Math.max(0, baseDex - (baseDex > 0 ? ethFlat : 0));
  let reductionPct = 0;
  const extrasHaveReqPct = extras.some((text) => isRequirementsPercentLine(text));

  if (itemForbidsSocketsAndEnhancements(def)) {
    return { reqLevel, reqStr, reqDex, reductionPct: 0 };
  }

  if (isCorruptedWormhole(def)) {
    reqLevel += getWormholeCycleReqLevelBonus(options.rolls ?? null);
  }

  let socketReqBonus = 0;
  for (const sock of socketables) {
    if (!sock || typeof sock !== 'object') continue;
    reqStr = Math.max(reqStr, nonNeg(sock.reqStr));
    reqDex = Math.max(reqDex, nonNeg(sock.reqDex));
    let sockReqBonus = 0;
    if (Array.isArray(sock.modifiers)) {
      for (const text of sock.modifiers) {
        if (typeof text !== 'string' || !text.trim()) continue;
        if (!extrasHaveReqPct) reductionPct += parseRequirementsReductionPct(text);
        sockReqBonus += parseRequiredLevelBonus(text);
      }
    }
    if (!extrasHaveReqPct && Number.isFinite(Number(sock.reductionPct))) {
      reductionPct += Math.abs(Number(sock.reductionPct)) || 0;
    }
    // Jewels with `+N Required Level` raise the host via that affix, not Required Level:.
    if (sockReqBonus === 0) reqLevel = Math.max(reqLevel, nonNeg(sock.reqLevel));
    socketReqBonus += sockReqBonus;
  }

  let hostReqBonus = 0;
  const overlayTexts = collectOverlayRequirementModifierTexts(def, options.rolls ?? null);
  for (const text of overlayTexts) {
    hostReqBonus += parseRequiredLevelBonus(text);
    if (!extrasHaveReqPct) reductionPct += parseRequirementsReductionPct(text);
  }
  for (const text of extras) {
    hostReqBonus += parseRequiredLevelBonus(text);
    reductionPct += parseRequirementsReductionPct(text);
  }
  // TSW leftover already includes socket `+Required Level` (e.g. Suicide Note).
  const textReqBonus = hostReqBonus !== 0 ? hostReqBonus : socketReqBonus;

  if (!extrasHaveReqPct) {
    for (const [count, name] of normalizeMysticOrbs(options.mysticOrbs)) {
      for (const line of getMysticOrbBonusLines(name, count)) {
        reductionPct += parseRequirementsReductionPct(line);
      }
    }
  }

  const uniquePer = uniqueCorruptionReqLevelPerSuccess(def);
  const uniqueFromIds = uniquePer > 0 ? uniquePer * successfulCorruptionCount(options.corruptions) : 0;
  const moReq = mysticOrbsRequiredLevelParts(options.mysticOrbs);
  if (uniquePer > 0 && hostReqBonus !== 0) {
    // TSW leftover is this unique's extra req (corruptions, net of orbs/effigies).
    reqLevel += hostReqBonus;
  } else {
    if (uniquePer > 0) reqLevel += uniqueFromIds;
    else reqLevel += corruptionRequiredLevelBonus(options.corruptions);
    reqLevel += combinedRequiredLevelBonus(textReqBonus, moReq.positive, moReq.negative);
  }

  if (reductionPct !== 0) {
    const signedPct = -reductionPct;
    if (!def?.reqStrFinal) reqStr = applyItemReqPercent(reqStr, signedPct);
    if (!def?.reqDexFinal) reqDex = applyItemReqPercent(reqDex, signedPct);
  }

  return { reqLevel: Math.max(0, reqLevel), reqStr, reqDex, reductionPct };
}

/**
 * Whether a resolved required level is above the planner character level.
 * Missing/invalid character level does not block.
 * @param {number} reqLevel
 * @param {number|null|undefined} characterLevel
 * @returns {boolean}
 */
export function requiredLevelExceedsCharacter(reqLevel, characterLevel) {
  const req = Number(reqLevel);
  const cap = Number(characterLevel);
  if (!Number.isFinite(req) || req <= 0) return false;
  if (!Number.isFinite(cap) || cap <= 0) return false;
  return req > cap;
}

/**
 * Whether applying these rolls/orbs/sockets would push the item above character level.
 * @param {object|null|undefined} def
 * @param {{
 *   rolls?: Record<string, number>|null,
 *   socketables?: ItemRequirementSource[]|null,
 *   extras?: string[]|null,
 *   mysticOrbs?: unknown,
 * }} [options]
 * @param {number|null|undefined} characterLevel
 * @returns {boolean}
 */
export function itemRequirementsExceedCharacterLevel(def, options = {}, characterLevel) {
  if (!def) return false;
  return requiredLevelExceedsCharacter(
    resolveItemRequirements(def, options).reqLevel,
    characterLevel
  );
}

/**
 * Whether character level/str/dex satisfy resolved item requirements.
 * Missing character values fail any positive corresponding requirement.
 * @param {ItemRequirements|null|undefined} reqs
 * @param {{
 *   level?: number|null,
 *   strength?: number|null,
 *   dexterity?: number|null,
 * }} [character]
 * @returns {boolean}
 */
export function characterMeetsItemRequirements(reqs, character = {}) {
  if (!reqs) return true;
  const level = Number(character.level);
  const strength = Number(character.strength);
  const dexterity = Number(character.dexterity);
  if (reqs.reqLevel > 0 && (!Number.isFinite(level) || level < reqs.reqLevel)) return false;
  if (reqs.reqStr > 0 && (!Number.isFinite(strength) || strength < reqs.reqStr)) return false;
  if (reqs.reqDex > 0 && (!Number.isFinite(dexterity) || dexterity < reqs.reqDex)) return false;
  return true;
}

/**
 * Single footer line: `Requires: Level 90, 368 Strength, 95 Dexterity`.
 * @param {ItemRequirements|null|undefined} reqs
 * @returns {string}
 */
export function formatItemRequirementsLine(reqs) {
  if (!reqs) return '';
  /** @type {string[]} */
  const parts = [];
  if (reqs.reqLevel > 0) parts.push(`Level ${reqs.reqLevel}`);
  if (reqs.reqStr > 0) parts.push(`${reqs.reqStr} Strength`);
  if (reqs.reqDex > 0) parts.push(`${reqs.reqDex} Dexterity`);
  if (!parts.length) return '';
  return `Requires: ${parts.join(', ')}`;
}
