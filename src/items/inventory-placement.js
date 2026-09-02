/**
 * @file Multi-cell inventory placement helpers (D2-style).
 * @module items/inventory-placement
 */

import { INV_COLUMNS, INV_ROWS, INV_CELL_COUNT } from './item-types.js';

/**
 * @param {number} slot
 * @returns {{ col: number, row: number }}
 */
export function slotToCoords(slot) {
  return {
    col: slot % INV_COLUMNS,
    row: Math.floor(slot / INV_COLUMNS),
  };
}

/**
 * @param {number} col
 * @param {number} row
 * @returns {number}
 */
export function coordsToSlot(col, row) {
  return row * INV_COLUMNS + col;
}

/**
 * Resolve which inventory anchor occupies a clicked cell (if any).
 * @param {(number|null|undefined)[]} inventory
 * @param {number} clickSlot
 * @param {(id: number) => { invWidth: number, invHeight: number }|null} getSize
 * @returns {number} Anchor slot index, or -1
 */
export function resolveOccupiedCell(inventory, clickSlot, getSize) {
  if (clickSlot < 0 || clickSlot >= INV_CELL_COUNT) return -1;
  const { col: clickCol, row: clickRow } = slotToCoords(clickSlot);
  for (let i = 0; i < inventory.length; i++) {
    const id = inventory[i];
    if (id == null) continue;
    const size = getSize(id);
    if (!size) continue;
    const { col, row } = slotToCoords(i);
    if (
      clickCol >= col &&
      clickRow >= row &&
      clickCol < col + size.invWidth &&
      clickRow < row + size.invHeight
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Check if item of given size can sit at anchor without leaving the grid,
 * ignoring `ignoreAnchor` (for move-in-place).
 * @param {(number|null|undefined)[]} inventory
 * @param {number} anchor
 * @param {number} invWidth
 * @param {number} invHeight
 * @param {(id: number) => { invWidth: number, invHeight: number }|null} getSize
 * @param {number} [ignoreAnchor=-1]
 * @returns {boolean}
 */
export function canPlace(inventory, anchor, invWidth, invHeight, getSize, ignoreAnchor = -1) {
  if (anchor < 0 || anchor >= INV_CELL_COUNT) return false;
  const { col, row } = slotToCoords(anchor);
  if (col + invWidth > INV_COLUMNS || row + invHeight > INV_ROWS) return false;

  for (let r = row; r < row + invHeight; r++) {
    for (let c = col; c < col + invWidth; c++) {
      const cell = coordsToSlot(c, r);
      const occ = resolveOccupiedCell(inventory, cell, getSize);
      if (occ >= 0 && occ !== ignoreAnchor) return false;
    }
  }
  return true;
}

/**
 * Place item id at anchor; removes any overlapping items' anchors.
 * Returns a new inventory array (does not mutate).
 * @param {(number|null|undefined)[]} inventory
 * @param {number} anchor
 * @param {number|null} instanceId - null clears the cell
 * @param {(id: number) => { invWidth: number, invHeight: number }|null} getSize
 * @returns {(number|null)[]}
 */
export function placeAt(inventory, anchor, instanceId, getSize) {
  /** @type {(number|null)[]} */
  const next = inventory.map((v) => (v == null ? null : v));

  if (instanceId == null) {
    if (next[anchor] != null) next[anchor] = null;
    return next;
  }

  const size = getSize(instanceId);
  if (!size) return next;
  const { invWidth, invHeight } = size;
  const { col, row } = slotToCoords(anchor);
  if (col + invWidth > INV_COLUMNS || row + invHeight > INV_ROWS) return next;

  // Collect overlapping anchors to clear
  /** @type {Set<number>} */
  const toClear = new Set();
  for (let r = row; r < row + invHeight; r++) {
    for (let c = col; c < col + invWidth; c++) {
      const occ = resolveOccupiedCell(next, coordsToSlot(c, r), getSize);
      if (occ >= 0) toClear.add(occ);
    }
  }
  for (const a of toClear) next[a] = null;
  next[anchor] = instanceId;
  return next;
}

/**
 * Find nearest valid anchor for placing an item near preferredSlot.
 * Searches expanding diamond from preferred cell (simplified from D2Planner dEe).
 * @param {(number|null|undefined)[]} inventory
 * @param {number} preferredSlot
 * @param {number} invWidth
 * @param {number} invHeight
 * @param {(id: number) => { invWidth: number, invHeight: number }|null} getSize
 * @param {number} [ignoreAnchor=-1]
 * @returns {number} Anchor slot or -1
 */
export function findAnchorForClick(
  inventory,
  preferredSlot,
  invWidth,
  invHeight,
  getSize,
  ignoreAnchor = -1
) {
  if (canPlace(inventory, preferredSlot, invWidth, invHeight, getSize, ignoreAnchor)) {
    return preferredSlot;
  }

  const { col: pc, row: pr } = slotToCoords(preferredSlot);
  const maxDist = INV_COLUMNS + INV_ROWS;
  for (let dist = 1; dist <= maxDist; dist++) {
    for (let dr = -dist; dr <= dist; dr++) {
      const dc = dist - Math.abs(dr);
      for (const sign of dc === 0 ? [0] : [-1, 1]) {
        const c = pc + sign * dc;
        const r = pr + dr;
        if (c < 0 || r < 0 || c >= INV_COLUMNS || r >= INV_ROWS) continue;
        const anchor = coordsToSlot(c, r);
        if (canPlace(inventory, anchor, invWidth, invHeight, getSize, ignoreAnchor)) {
          return anchor;
        }
      }
    }
  }
  return -1;
}

/**
 * Client coords -> inventory slot index.
 * @param {DOMRect} gridRect
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} cellPx
 * @returns {number}
 */
export function clientToSlot(gridRect, clientX, clientY, cellPx) {
  const col = Math.floor((clientX - gridRect.left) / cellPx);
  const row = Math.floor((clientY - gridRect.top) / cellPx);
  const c = Math.max(0, Math.min(INV_COLUMNS - 1, col));
  const r = Math.max(0, Math.min(INV_ROWS - 1, row));
  return coordsToSlot(c, r);
}

/**
 * List of placed items with position for rendering overlays.
 * @param {(number|null|undefined)[]} inventory
 * @param {(id: number) => { invWidth: number, invHeight: number }|null} getSize
 * @returns {Array<{ instanceId: number, anchor: number, col: number, row: number, invWidth: number, invHeight: number }>}
 */
export function listPlacedItems(inventory, getSize) {
  /** @type {Array<{ instanceId: number, anchor: number, col: number, row: number, invWidth: number, invHeight: number }>} */
  const out = [];
  for (let i = 0; i < inventory.length; i++) {
    const id = inventory[i];
    if (id == null) continue;
    const size = getSize(id);
    if (!size) continue;
    const { col, row } = slotToCoords(i);
    out.push({
      instanceId: id,
      anchor: i,
      col,
      row,
      invWidth: size.invWidth,
      invHeight: size.invHeight,
    });
  }
  return out;
}
