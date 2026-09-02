/**
 * HTML for skill scaling placeholders (tooltips / description expansion).
 * Matches Bulma classes used in {@link utils.js} expandPlaceholdersWithScaling.
 */

import { SCALING_DISPLAY_HTML_CLASSES } from '@/shared/utils.js';

/**
 * Whether value slot `valueIndex` should show an explicit sign.
 * stats.json `signed`: `true` (all slots) or `[0, 1, ...]` (specific slots).
 *
 * @param {boolean|number[]|null|undefined} signed
 * @param {number} valueIndex
 * @returns {boolean}
 */
export function isValueSlotSigned(signed, valueIndex) {
  if (signed === true) return true;
  if (Array.isArray(signed)) {
    return signed.some((n) => Number(n) === Number(valueIndex));
  }
  return false;
}

/**
 * Prefix `+` for non-negative pure numbers when signed display is on.
 * Leaves negatives, formulas, and non-numeric text unchanged.
 *
 * @param {string|number|null|undefined} displayValue
 * @param {boolean} signed
 * @returns {string}
 */
export function applyStatValueSign(displayValue, signed) {
  if (!signed) return displayValue == null ? '' : String(displayValue);
  const s = String(displayValue ?? '').trim();
  if (!s) return '';
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (s.startsWith('-') || s.startsWith('+')) return s;
  return `+${s}`;
}

/**
 * Render {{stat}} line from merged scaling values (value0–3, formula/constant flags).
 * Does not handle mana_cost / minion_mana_cost (those use dedicated calculators in utils.js).
 * (callers pass those statKeys to get ??? only).
 *
 * @param {object|null|undefined} scaling
 * @param {string} [statKeyLower] lowercase stat key for mana_cost / minion_mana_cost guard
 * @returns {string} HTML fragment
 */
export function formatScalingValuesToDescriptionHtml(scaling, statKeyLower = '') {

  if (!scaling) {
    return `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
  }
  const sk = String(statKeyLower).toLowerCase();
  if (sk === 'mana_cost' || sk === 'minion_mana_cost') {
    return `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
  }

  const name = scaling.statName || statKeyLower;
  const format = scaling.format || '{name}: {value}';
  const v0 = scaling.value0 ?? '';
  const v1 = scaling.value1 ?? '';
  const v2 = scaling.value2 ?? '';
  const v3 = scaling.value3 ?? '';
  const signed = scaling.signed;

  const getValueClass = (valueIndex) => {
    const isFormula = scaling[`value${valueIndex}_formula`];
    const isConstant = scaling[`value${valueIndex}_constant`];
    if (isFormula) return SCALING_DISPLAY_HTML_CLASSES.formula;
    if (isConstant) return SCALING_DISPLAY_HTML_CLASSES.constants;
    return SCALING_DISPLAY_HTML_CLASSES.default;
  };

  const hasAnyConstants = Boolean(
    scaling.value0_constant ||
      scaling.value1_constant ||
      scaling.value2_constant ||
      scaling.value3_constant
  );

  const getDisplayHtml = (valueIndex, defaultValue) => {
    const isEmpty = defaultValue === '' || defaultValue == null;
    const isFormula = scaling[`value${valueIndex}_formula`];
    const isConstant = scaling[`value${valueIndex}_constant`];
    if (isEmpty && (isFormula || isConstant || hasAnyConstants)) {
      return `<span class="${SCALING_DISPLAY_HTML_CLASSES.unknown}">???</span>`;
    }
    const shown = applyStatValueSign(defaultValue || '', isValueSlotSigned(signed, valueIndex));
    return `<span class="${getValueClass(valueIndex)}">${shown}</span>`;
  };

  const w0 = getDisplayHtml(0, v0);
  const w1 = getDisplayHtml(1, v1);
  const w2 = getDisplayHtml(2, v2);
  const w3 = getDisplayHtml(3, v3);

  return (format || '{name}: {value}')
    .replace('{name}', name)
    .replace('{value0}', w0)
    .replace('{value1}', w1)
    .replace('{value2}', w2)
    .replace('{value3}', w3);
}
