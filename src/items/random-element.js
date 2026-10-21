/**
 * [Random Element] / [Random Elemental] rolls (Fire, Cold, Lightning, Poison).
 * @module items/random-element
 */

import { decodeModifierLine, encodeModifierLine } from '@/items/item-modifier-line.js';

/** @typedef {'fire'|'cold'|'lightning'|'poison'} RandomElement */

export const RANDOM_ELEMENTS = Object.freeze(['fire', 'cold', 'lightning', 'poison']);

export const RANDOM_ELEMENT_LABELS = Object.freeze({
  fire: 'Fire',
  cold: 'Cold',
  lightning: 'Lightning',
  poison: 'Poison',
});

const PLACEHOLDER_RE = /\[Random Elements?(?:al)?\]/i;
const AFFIX_RE = /Random Elemental Resist/i;
const INFER_MAX_RE = /Maximum (Fire|Cold|Lightning|Poison) Resist/i;

/**
 * @param {unknown} value
 * @returns {RandomElement|null}
 */
export function normalizeRandomElement(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  if (key === 'fire' || key === 'cold' || key === 'lightning' || key === 'poison') return key;
  return null;
}

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function textHasRandomElementChoice(text) {
  const body = decodeModifierLine(text).text;
  if (!body) return false;
  return PLACEHOLDER_RE.test(body) || AFFIX_RE.test(body);
}

/**
 * @param {unknown} lines
 * @returns {boolean}
 */
export function linesHaveRandomElementChoice(lines) {
  if (!Array.isArray(lines)) return false;
  return lines.some((line) => textHasRandomElementChoice(line));
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function defHasRandomElementChoice(def) {
  if (!def || typeof def !== 'object') return false;
  return linesHaveRandomElementChoice(def.modifiers);
}

/**
 * @param {string|null|undefined} text
 * @returns {RandomElement|null}
 */
export function inferRandomElementFromText(text) {
  const m = INFER_MAX_RE.exec(decodeModifierLine(text).text);
  return m ? normalizeRandomElement(m[1]) : null;
}

/**
 * @param {unknown} lines
 * @returns {RandomElement|null}
 */
export function inferRandomElementFromLines(lines) {
  if (!Array.isArray(lines)) return null;
  for (const line of lines) {
    const hit = inferRandomElementFromText(line);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {string|null|undefined} text
 * @param {unknown} element
 * @param {{ rewriteResolvedMax?: boolean }} [options]
 * @returns {string}
 */
export function resolveRandomElementInText(text, element, options = {}) {
  const raw = String(text ?? '');
  if (!raw) return '';
  const el = normalizeRandomElement(element);
  if (!el) return raw;
  const label = RANDOM_ELEMENT_LABELS[el];
  const decoded = decodeModifierLine(raw);
  let body = decoded.text;
  const hadPlaceholder = PLACEHOLDER_RE.test(body) || AFFIX_RE.test(body);
  body = body.replace(/\[Random Elements?(?:al)?\]/gi, label);
  body = body.replace(/Random Elemental Resist/gi, `${label} Resist`);
  if (options.rewriteResolvedMax === true || hadPlaceholder) {
    body = body.replace(/Maximum (Fire|Cold|Lightning|Poison) Resist/gi, `Maximum ${label} Resist`);
  }
  if (body === decoded.text) return raw;
  return encodeModifierLine(body, decoded.color, decoded.showCondition);
}

/**
 * @param {unknown} lines
 * @param {unknown} element
 * @param {{ rewriteResolvedMax?: boolean }} [options]
 * @returns {string[]}
 */
export function resolveRandomElementInLines(lines, element, options = {}) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => resolveRandomElementInText(String(line ?? ''), element, options));
}
