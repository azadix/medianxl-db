/**
 * Planner showCondition checks for skill / scalingConstant rows.
 * @module skills/domain/show-conditions
 */

import { isConditionSelected } from '@/stores/planner-config-store.js';

/**
 * Whether a scalingConstants row should apply under current planner conditions.
 * Prefer the row's own `showCondition`; fall back to skill-level `showCondition`.
 * @param {object|null|undefined} catRow
 * @param {object|null|undefined} scRow
 * @returns {boolean}
 */
export function isScalingConstantRowActive(catRow, scRow) {
  const rowKeys = Array.isArray(scRow?.showCondition)
    ? scRow.showCondition.filter((k) => k != null && String(k).trim() !== '')
    : [];
  if (rowKeys.length > 0) {
    return rowKeys.some((k) => isConditionSelected(k));
  }
  const skillKeys = Array.isArray(catRow?.showCondition)
    ? catRow.showCondition.filter((k) => k != null && String(k).trim() !== '')
    : [];
  if (skillKeys.length > 0) {
    return skillKeys.some((k) => isConditionSelected(k));
  }
  return true;
}
