/**
 * HTML for skill scaling placeholders (tooltips / description expansion).
 * Matches Bulma classes used in {@link utils.js} expandPlaceholdersWithScaling.
 */

import { SCALING_DISPLAY_HTML_CLASSES } from '../utils.js';

/**
 * Render {{stat}} line from merged scaling values (value0–3, formula/constant flags).
 * Does not handle mana_cost numeric merge (callers pass statKey === 'mana_cost' to get ??? only).
 *
 * @param {object|null|undefined} scaling
 * @param {string} [statKeyLower] lowercase stat key for mana_cost guard
 * @returns {string} HTML fragment
 */
export function formatScalingValuesToDescriptionHtml(scaling, statKeyLower = '') {
  const UNKNOWN_STYLE = SCALING_DISPLAY_HTML_CLASSES.unknown;
  const FORMULA_STYLE = SCALING_DISPLAY_HTML_CLASSES.formula;
  const DEFAULT_STYLE = SCALING_DISPLAY_HTML_CLASSES.default;
  const CONSTANTS_STYLE = SCALING_DISPLAY_HTML_CLASSES.constants;

  if (!scaling) {
    return `<span class="${UNKNOWN_STYLE}">???</span>`;
  }
  if (String(statKeyLower).toLowerCase() === 'mana_cost') {
    return `<span class="${UNKNOWN_STYLE}">???</span>`;
  }

  const name = scaling.statName || statKeyLower;
  const format = scaling.format || '{name}: {value}';
  const v0 = scaling.value0 ?? '';
  const v1 = scaling.value1 ?? '';
  const v2 = scaling.value2 ?? '';
  const v3 = scaling.value3 ?? '';

  const getValueClass = (valueIndex) => {
    const isFormula = scaling[`value${valueIndex}_formula`];
    const isConstant = scaling[`value${valueIndex}_constant`];
    if (isFormula) return FORMULA_STYLE;
    if (isConstant) return CONSTANTS_STYLE;
    return DEFAULT_STYLE;
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
      return `<span class="${UNKNOWN_STYLE}">???</span>`;
    }
    return `<span class="${getValueClass(valueIndex)}">${defaultValue || ''}</span>`;
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
