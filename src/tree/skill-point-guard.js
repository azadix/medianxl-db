/**
 * DOM-free skill point guard shared by the tree renderer and the skill card.
 * @param {boolean} canAllocate
 * @param {number} currentPoints
 * @param {number} maxPoints
 * @param {number} [pointsRemaining]
 * @returns {boolean}
 */
export function canAddPoints(canAllocate, currentPoints, maxPoints, pointsRemaining = Infinity) {
  return canAllocate && currentPoints < maxPoints && pointsRemaining > 0;
}
