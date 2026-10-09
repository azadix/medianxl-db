/**
 * Encode/decode wiki item-mod colors on catalog modifier strings.
 * Orange unique text uses `{orange}`; grey effect lines under it use `{grey}`.
 * @module items/item-modifier-line
 */

export const MODIFIER_COLOR_MAGIC = 'magic';
export const MODIFIER_COLOR_ORANGE = 'orange';
export const MODIFIER_COLOR_GREY = 'grey';

const PREFIX_RE = /^\{(orange|grey)\}/;

/**
 * @param {string|null|undefined} className
 * @returns {string}
 */
export function modifierColorFromWikiClass(className) {
  const names = String(className || '')
    .toLowerCase()
    .split(/\s+/);
  if (names.includes('item-orange') || names.includes('mxl-orange') || names.includes('mxl-unique')) {
    return MODIFIER_COLOR_ORANGE;
  }
  if (names.includes('item-runeword') || names.includes('mxl-grey')) return MODIFIER_COLOR_GREY;
  if (names.includes('item-magic') || names.includes('mxl-magic')) return MODIFIER_COLOR_MAGIC;
  if (names.includes('item-basic') || names.includes('mxl-basic')) return 'basic';
  if (names.includes('mxl-tan')) return MODIFIER_COLOR_ORANGE;
  if (names.includes('item-red') || names.includes('mxl-red')) return 'red';
  if (names.includes('item-set') || names.includes('mxl-set')) return 'set';
  if (names.includes('item-darkgreen') || names.includes('mxl-darkgreen')) return 'darkgreen';
  return '';
}

/**
 * @param {string|null|undefined} text
 * @param {string|null|undefined} color
 * @returns {string}
 */
export function encodeModifierLine(text, color) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (color === MODIFIER_COLOR_ORANGE) return `{orange}${value}`;
  if (color === MODIFIER_COLOR_GREY) return `{grey}${value}`;
  return value;
}

/**
 * @param {string|null|undefined} line
 * @returns {{ text: string, color: string }}
 */
export function decodeModifierLine(line) {
  const raw = String(line ?? '');
  const match = PREFIX_RE.exec(raw);
  if (!match) return { text: raw.trim(), color: MODIFIER_COLOR_MAGIC };
  return {
    text: raw.slice(match[0].length).trim(),
    color: match[1],
  };
}

/**
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function modifierLineText(line) {
  return decodeModifierLine(line).text;
}

/**
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function modifierLineColor(line) {
  return decodeModifierLine(line).color;
}

/**
 * Grey lines under orange text are conditional effects, not always-on affixes.
 * @param {string|null|undefined} line
 * @returns {boolean}
 */
export function isConditionalModifierLine(line) {
  return decodeModifierLine(line).color === MODIFIER_COLOR_GREY;
}

/**
 * @param {string|null|undefined} color
 * @returns {string}
 */
export function modifierColorCssClass(color) {
  if (color === MODIFIER_COLOR_ORANGE) return 'item-mod--orange';
  if (color === MODIFIER_COLOR_GREY) return 'item-mod--grey';
  return '';
}
