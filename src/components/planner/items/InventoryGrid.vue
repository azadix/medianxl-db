<script setup>
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import { INV_COLUMNS, INV_ROWS, INV_CELL_PX } from '@/items/item-types.js';
import {
  clientToSlot,
  resolveOccupiedCell,
  canPlace,
  slotToCoords,
  coordsToSlot,
} from '@/items/inventory-placement.js';
import ItemIcon from './ItemIcon.vue';
import {
  showItemTooltip,
  moveItemTooltip,
  hideItemTooltip,
} from '@/items/item-tooltip-runtime.js';
import { getEffectivePlannerLevel } from '@/character/planner-core.js';

const itemsStore = useItemsStore();
const { placedInventoryItems, selectedSlot, dragPayload } = storeToRefs(itemsStore);

const gridRef = ref(/** @type {HTMLElement|null} */ (null));
const dropState = ref(/** @type {''|'accept'|'reject'} */ (''));
const dropPreview = ref(/** @type {{ col: number, row: number, w: number, h: number }|null} */ (null));

const gridStyle = computed(() => ({
  '--planner-inv-cols': String(INV_COLUMNS),
  '--planner-inv-rows': String(INV_ROWS),
}));

const cells = Array.from({ length: INV_COLUMNS * INV_ROWS }, (_, i) => i);

const activeAnchor = computed(() => {
  const sel = selectedSlot.value;
  if (sel?.location !== 'inventory') return -1;
  const click = Number(sel.slot);
  const anchor = resolveOccupiedCell(itemsStore.inventory, click, itemsStore.getInstanceSize);
  return anchor >= 0 ? anchor : click;
});

function slotFromEvent(e) {
  const el = gridRef.value;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const cellPx = rect.width / INV_COLUMNS || INV_CELL_PX;
  return clientToSlot(rect, e.clientX, e.clientY, cellPx);
}

/**
 * Top-left anchor for preview, clamped so the item stays on the grid.
 * @param {number} cursorSlot
 * @param {number} invWidth
 * @param {number} invHeight
 */
function previewAnchor(cursorSlot, invWidth, invHeight) {
  const { col: cCol, row: cRow } = slotToCoords(cursorSlot);
  let col = Math.round(cCol - (invWidth - 1) / 2);
  let row = Math.round(cRow - (invHeight - 1) / 2);
  col = Math.max(0, Math.min(INV_COLUMNS - invWidth, col));
  row = Math.max(0, Math.min(INV_ROWS - invHeight, row));
  return { col, row, slot: coordsToSlot(col, row) };
}

/**
 * Absolute box snapped to inventory cell units.
 * @param {{ col: number, row: number, invWidth?: number, invHeight?: number, w?: number, h?: number }} box
 */
function overlayStyle(box) {
  const w = box.invWidth ?? box.w ?? 1;
  const h = box.invHeight ?? box.h ?? 1;
  return {
    left: `calc(var(--planner-inv-cell) * ${box.col})`,
    top: `calc(var(--planner-inv-cell) * ${box.row})`,
    width: `calc(var(--planner-inv-cell) * ${w})`,
    height: `calc(var(--planner-inv-cell) * ${h})`,
  };
}

/**
 * @param {number} slot
 */
function onCellClick(slot) {
  itemsStore.selectSlot({ location: 'inventory', slot });
}

function onItemClick(e, anchor) {
  e.stopPropagation();
  itemsStore.selectSlot({ location: 'inventory', slot: anchor });
}

function onItemTooltipEnter(e, instanceId) {
  const def = itemsStore.getDefForInstance(instanceId);
  if (!def) return;
  showItemTooltip(
    def,
    itemsStore.getIconForInstance(instanceId),
    e.clientX,
    e.clientY,
    itemsStore.getRollsForInstance(instanceId),
    {
      characterLevel: getEffectivePlannerLevel(),
      charmInInventory: true,
      ...itemsStore.getTooltipOptionsForDef(def),
    }
  );
}

function onItemTooltipMove(e) {
  moveItemTooltip(e.clientX, e.clientY);
}

function onItemTooltipLeave() {
  hideItemTooltip();
}

function onItemContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
}

function onDragStart(e, anchor, instanceId) {
  hideItemTooltip();
  e.dataTransfer.effectAllowed = 'move';
  const payload = {
    instanceId,
    from: { location: /** @type {'inventory'} */ ('inventory'), slot: anchor },
  };
  itemsStore.setDragPayload(payload);
  e.dataTransfer.setData('application/x-planner-item', JSON.stringify(payload));
  e.dataTransfer.setData('text/plain', String(instanceId));
}

function onDragEnd() {
  itemsStore.clearDragPayload();
  dropPreview.value = null;
  dropState.value = '';
}

function parseDrag(e) {
  try {
    const raw = e.dataTransfer.getData('application/x-planner-item');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return dragPayload.value;
}

function updateDropPreview(e) {
  const payload = dragPayload.value;
  const cursorSlot = slotFromEvent(e);
  if (!payload) {
    const { col, row } = slotToCoords(cursorSlot);
    dropPreview.value = { col, row, w: 1, h: 1 };
    dropState.value = 'accept';
    return;
  }
  const size = itemsStore.getInstanceSize(payload.instanceId) || { invWidth: 1, invHeight: 1 };
  const { col, row, slot } = previewAnchor(cursorSlot, size.invWidth, size.invHeight);
  dropPreview.value = { col, row, w: size.invWidth, h: size.invHeight };

  const ignoreAnchor =
    payload.from.location === 'inventory' ? Number(payload.from.slot) : -1;
  const ok = canPlace(
    itemsStore.inventory,
    slot,
    size.invWidth,
    size.invHeight,
    itemsStore.getInstanceSize,
    ignoreAnchor
  );
  dropState.value = ok ? 'accept' : 'reject';
}

function onDragOver(e) {
  const types = [...e.dataTransfer.types];
  if (!types.includes('application/x-planner-item') && !types.includes('text/plain') && !dragPayload.value) {
    return;
  }
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  updateDropPreview(e);
}

function onDragLeave(e) {
  if (gridRef.value && !gridRef.value.contains(/** @type {Node|null} */ (e.relatedTarget))) {
    dropState.value = '';
    dropPreview.value = null;
  }
}

function onDrop(e) {
  e.preventDefault();
  const payload = parseDrag(e);
  const preview = dropPreview.value;
  dropState.value = '';
  dropPreview.value = null;
  itemsStore.clearDragPayload();
  if (!payload?.from) return;

  let slot = slotFromEvent(e);
  if (preview) {
    slot = coordsToSlot(preview.col, preview.row);
  }
  const ok = itemsStore.moveItem(payload.from, { location: 'inventory', slot });
  if (!ok) {
    dropState.value = 'reject';
    setTimeout(() => {
      dropState.value = '';
    }, 200);
  }
}
</script>

<template>
  <div
    ref="gridRef"
    class="planner-inventory-grid"
    :class="{
      'planner-inventory-grid--drop-accept': dropState === 'accept',
      'planner-inventory-grid--drop-reject': dropState === 'reject',
    }"
    :style="gridStyle"
    role="grid"
    :aria-colcount="INV_COLUMNS"
    :aria-rowcount="INV_ROWS"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="planner-inventory-grid__cells">
      <div
        v-for="index in cells"
        :key="'cell-' + index"
        class="planner-slot planner-slot--inventory"
        role="gridcell"
        :aria-label="'Inventory ' + (index + 1)"
        @click="onCellClick(index)"
      />
    </div>

    <div class="planner-inventory-grid__overlay" aria-hidden="true">
      <div
        v-for="item in placedInventoryItems"
        :key="'item-' + item.instanceId"
        class="planner-inventory-item"
        :class="{ 'planner-inventory-item--active': activeAnchor === item.anchor }"
        :style="overlayStyle(item)"
        draggable="true"
        @click="onItemClick($event, item.anchor)"
        @contextmenu="onItemContextMenu($event)"
        @dragstart="onDragStart($event, item.anchor, item.instanceId)"
        @dragend="onDragEnd"
        @mouseenter="onItemTooltipEnter($event, item.instanceId)"
        @mousemove="onItemTooltipMove"
        @mouseleave="onItemTooltipLeave"
      >
        <ItemIcon
          :def="itemsStore.getDefForInstance(item.instanceId)"
          :icon="itemsStore.getIconForInstance(item.instanceId)"
          fill
        />
      </div>

      <div
        v-if="dropPreview"
        class="planner-inventory-drop-preview"
        :class="{
          'planner-inventory-drop-preview--reject': dropState === 'reject',
        }"
        :style="overlayStyle(dropPreview)"
      />
    </div>
  </div>
</template>
