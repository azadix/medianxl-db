/**
 * @file Planner item tooltip show/hide/position (mirrors skill tooltip UX).
 * @module items/item-tooltip-runtime
 */

import { buildItemTooltipHtml } from '@/items/item-tooltip.js';

const TOOLTIP_OFFSET = 15;
const TOOLTIP_VIEWPORT_MARGIN = 12;

/** @type {HTMLElement|null} */
let tooltipElement = null;
let positionRafId = 0;
let pendingClientX = 0;
let pendingClientY = 0;

/**
 * Bind to `#item-tooltip-portal` (call from ItemTooltipHost onMounted).
 */
export function initItemTooltip() {
  tooltipElement = document.getElementById('item-tooltip-portal');
}

export function destroyItemTooltip() {
  hideItemTooltip();
  tooltipElement = null;
}

function isShowing() {
  return Boolean(tooltipElement && tooltipElement.style.display !== 'none');
}

/**
 * @param {HTMLElement} node
 * @param {number} clientX
 * @param {number} clientY
 */
function applyPosition(node, clientX, clientY) {
  const baseLeft = clientX + TOOLTIP_OFFSET;
  const baseTop = clientY + TOOLTIP_OFFSET;
  const rect = node.getBoundingClientRect();
  let nextLeft = baseLeft;
  let nextTop = baseTop;
  const maxLeft = window.innerWidth - rect.width - TOOLTIP_VIEWPORT_MARGIN;
  const maxTop = window.innerHeight - rect.height - TOOLTIP_VIEWPORT_MARGIN;
  if (nextLeft > maxLeft) nextLeft = Math.max(TOOLTIP_VIEWPORT_MARGIN, maxLeft);
  if (nextTop > maxTop) nextTop = Math.max(TOOLTIP_VIEWPORT_MARGIN, maxTop);
  node.style.left = `${nextLeft}px`;
  node.style.top = `${nextTop}px`;
}

/**
 * @param {number} clientX
 * @param {number} clientY
 */
export function moveItemTooltip(clientX, clientY) {
  pendingClientX = clientX;
  pendingClientY = clientY;
  if (positionRafId) return;
  positionRafId = requestAnimationFrame(() => {
    positionRafId = 0;
    const node = tooltipElement;
    if (!node || !isShowing()) return;
    applyPosition(node, pendingClientX, pendingClientY);
  });
}

export function hideItemTooltip() {
  if (positionRafId) {
    cancelAnimationFrame(positionRafId);
    positionRafId = 0;
  }
  const node = tooltipElement;
  if (node) {
    node.style.display = 'none';
    node.innerHTML = '';
  }
}

/**
 * @param {object|null|undefined} def
 * @param {string|null|undefined} iconKey
 * @param {number} clientX
 * @param {number} clientY
 * @param {Record<string, number>|null|undefined} [rolls]
 * @param {{ characterLevel?: number|null, charmInInventory?: boolean }} [options]
 */
export function showItemTooltip(def, iconKey, clientX, clientY, rolls = null, options = {}) {
  const node = tooltipElement;
  if (!node || !def) {
    hideItemTooltip();
    return;
  }
  const html = buildItemTooltipHtml(def, iconKey, rolls, options);
  if (!html) {
    hideItemTooltip();
    return;
  }
  node.innerHTML = html;
  node.style.display = 'block';
  moveItemTooltip(clientX, clientY);
}
