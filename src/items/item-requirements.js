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
const REQ_LEVEL_BONUS_RE = /^\+?\s*(\d+)\s+Required Level$/i;

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
  return Number.isFinite(n) && n > 0 ? n : 0;
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
 * Modifier texts used to parse Requirements -%.
 * Overlay items use rolled affix lines so `Requirements -(40 to 50)%` resolves.
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {ItemRequirementSource[]} socketables
 * @param {string[]} extras
 * @returns {string[]}
 */
function collectRequirementModifierTexts(def, rolls, socketables, extras) {
  /** @type {string[]} */
  const texts = [];
  if (def && isOverlayItem(def)) {
    texts.push(...getOverlayStatLines(def, rolls, { hideRollableRanges: false }));
  } else if (Array.isArray(def?.modifiers)) {
    pushSourceModifierTexts(def, texts);
  }
  for (const sock of socketables) pushSourceModifierTexts(sock, texts);
  for (const line of extras) {
    if (typeof line === 'string' && line.trim()) texts.push(line);
  }
  return texts;
}

/**
 * Catalog reqs, raised by socketable reqs, then str/dex reduced by Requirements -%.
 * @param {object|null|undefined} def
 * @param {{
 *   rolls?: Record<string, number>|null,
 *   socketables?: ItemRequirementSource[]|null,
 *   extras?: string[]|null,
 * }} [options]
 * @returns {ItemRequirements}
 */
export function resolveItemRequirements(def, options = {}) {
  const socketables = Array.isArray(options.socketables) ? options.socketables : [];
  const extras = Array.isArray(options.extras) ? options.extras : [];
  let reqLevel = nonNeg(def?.reqLevel);
  let reqStr = nonNeg(def?.reqStr);
  let reqDex = nonNeg(def?.reqDex);
  let reductionPct = 0;

  if (isCorruptedWormhole(def)) {
    reqLevel += getWormholeCycleReqLevelBonus(options.rolls ?? null);
  }

  for (const sock of socketables) {
    if (!sock || typeof sock !== 'object') continue;
    reqLevel = Math.max(reqLevel, nonNeg(sock.reqLevel));
    reqStr = Math.max(reqStr, nonNeg(sock.reqStr));
    reqDex = Math.max(reqDex, nonNeg(sock.reqDex));
    if (Number.isFinite(Number(sock.reductionPct))) {
      reductionPct += Math.abs(Number(sock.reductionPct)) || 0;
    }
  }

  for (const text of collectRequirementModifierTexts(
    def,
    options.rolls ?? null,
    socketables,
    extras
  )) {
    reductionPct += parseRequirementsReductionPct(text);
    reqLevel += parseRequiredLevelBonus(text);
  }

  if (reductionPct !== 0) {
    const factor = Math.max(0, 1 - reductionPct / 100);
    if (!def?.reqStrFinal) reqStr = Math.floor(reqStr * factor);
    if (!def?.reqDexFinal) reqDex = Math.floor(reqDex * factor);
  }

  return { reqLevel, reqStr, reqDex, reductionPct };
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
