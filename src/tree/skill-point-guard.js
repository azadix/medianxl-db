/**
 * DOM-free skill point guard shared by the tree renderer and the skill card.
 * @param {boolean} canAllocate
 * @param {number} currentPoints
 * @param {number} maxPoints
 * @returns {boolean}
 */
export function canAddPoints(canAllocate, currentPoints, maxPoints) {
  return canAllocate && currentPoints < maxPoints;
}
