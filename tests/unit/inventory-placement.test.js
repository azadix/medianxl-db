import { describe, it, expect } from 'vitest';
import {
  canPlace,
  placeAt,
  resolveOccupiedCell,
  findAnchorForClick,
  listPlacedItems,
} from '@/items/inventory-placement.js';
import { INV_CELL_COUNT, INV_COLUMNS } from '@/items/item-types.js';

function sizes(map) {
  return (id) => map[id] ?? null;
}

function emptyInv() {
  return Array(INV_CELL_COUNT).fill(null);
}

describe('inventory-placement', () => {
  it('places a 1x2 charm and resolves occupied cells', () => {
    const inv = emptyInv();
    const getSize = sizes({ 1: { invWidth: 1, invHeight: 2 } });
    const next = placeAt(inv, 0, 1, getSize);
    expect(next[0]).toBe(1);
    expect(resolveOccupiedCell(next, 0, getSize)).toBe(0);
    expect(resolveOccupiedCell(next, INV_COLUMNS, getSize)).toBe(0);
    expect(resolveOccupiedCell(next, 1, getSize)).toBe(-1);
    expect(canPlace(next, 0, 1, 1, getSize)).toBe(false);
    expect(canPlace(next, 1, 1, 1, getSize)).toBe(true);
  });

  it('rejects placement that leaves the grid', () => {
    const inv = emptyInv();
    const getSize = sizes({ 1: { invWidth: 1, invHeight: 3 } });
    expect(canPlace(inv, INV_CELL_COUNT - INV_COLUMNS + 5, 1, 3, getSize)).toBe(false);
    expect(canPlace(inv, 70, 1, 3, getSize)).toBe(true);
  });

  it('finds nearest free anchor', () => {
    const inv = emptyInv();
    const getSize = sizes({
      1: { invWidth: 1, invHeight: 1 },
      2: { invWidth: 1, invHeight: 1 },
    });
    let next = placeAt(inv, 0, 1, getSize);
    const anchor = findAnchorForClick(next, 0, 1, 1, getSize);
    expect(anchor).toBe(1);
    next = placeAt(next, anchor, 2, getSize);
    expect(listPlacedItems(next, getSize)).toHaveLength(2);
  });
});
