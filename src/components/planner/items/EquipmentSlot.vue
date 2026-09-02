<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useItemsStore } from '@/stores/items.js';
import { canEquipInSlot, EQUIPMENT_SLOT_CELLS } from '@/items/item-types.js';
import { formatItemRarityBadge } from '@/items/item-stats.js';
import { getCharacterInstance } from '@/character/planner-core.js';
import {
  showItemTooltip,
  moveItemTooltip,
  hideItemTooltip,
} from '@/items/item-tooltip-runtime.js';
import ItemIcon from './ItemIcon.vue';

const props = defineProps({
  /** Slot display name used for aria-label. */
  label: { type: String, default: '' },
  /** Store equipment slot key (head, tors, rarm, …). */
  slotKey: { type: String, required: true },
});

const itemsStore = useItemsStore();

const cells = computed(() => EQUIPMENT_SLOT_CELLS[props.slotKey] || { w: 2, h: 2 });

const slotStyle = computed(() => ({
  '--equip-cells-w': String(cells.value.w),
  '--equip-cells-h': String(cells.value.h),
}));

const instanceId = computed(() => itemsStore.equipment[props.slotKey] ?? null);
const def = computed(() => itemsStore.getEquipmentDef(props.slotKey));

const itemVisualStyle = computed(() => {
  const d = def.value;
  if (!d) return {};
  const itemW = d.invWidth || 1;
  const itemH = d.invHeight || 1;
  const slotW = cells.value.w;
  const slotH = cells.value.h;
  const displayW = Math.min(itemW, slotW);
  const displayH = Math.min(itemH, slotH);
  return {
    width: `calc(var(--planner-inv-cell) * ${displayW})`,
    height: `calc(var(--planner-inv-cell) * ${displayH})`,
  };
});

const isActive = computed(() => {
  const sel = itemsStore.selectedSlot;
  return sel?.location === 'equipment' && sel.slot === props.slotKey;
});

const isTiny = computed(() => cells.value.w * cells.value.h <= 1);
const isCompact = computed(() => isTiny.value || cells.value.h <= 1);

const rarityBadge = computed(() => formatItemRarityBadge(def.value));

const socketCount = computed(() => {
  const d = def.value;
  if (!d) return 0;
  const id = instanceId.value;
  const rolls = id != null ? itemsStore.getRollsForInstance(id) : null;
  if (rolls && Number.isFinite(rolls.sockets)) return Math.max(0, rolls.sockets);
  return Number(d.sockets) > 0 ? Number(d.sockets) : 0;
});

const dropState = ref(/** @type {''|'accept'|'reject'} */ (''));
const nameEl = ref(null);
const nameScale = ref(1);
let nameResizeObserver = null;

function fitName() {
  const el = nameEl.value;
  if (!el) {
    nameScale.value = 1;
    return;
  }
  const available = el.parentElement?.clientWidth ?? 0;
  if (available <= 0) return;
  const natural = el.scrollWidth;
  nameScale.value = natural > 0 ? Math.min(1, available / natural) : 1;
}

function observeName() {
  nameResizeObserver?.disconnect();
  const wrap = nameEl.value?.parentElement;
  if (!wrap) return;
  nameResizeObserver = new ResizeObserver(() => fitName());
  nameResizeObserver.observe(wrap);
}

watch(
  () => def.value?.name,
  () => {
    nextTick(() => {
      fitName();
      observeName();
    });
  },
  { flush: 'post' }
);

onBeforeUnmount(() => {
  nameResizeObserver?.disconnect();
});

function onClick() {
  itemsStore.selectSlot({ location: 'equipment', slot: props.slotKey });
}

function onItemMouseEnter(e) {
  if (!def.value || instanceId.value == null) return;
  showItemTooltip(
    def.value,
    itemsStore.getIconForInstance(instanceId.value),
    e.clientX,
    e.clientY,
    itemsStore.getRollsForInstance(instanceId.value),
    itemsStore.getTooltipOptionsForDef(def.value)
  );
}

function onItemMouseMove(e) {
  if (!def.value) return;
  moveItemTooltip(e.clientX, e.clientY);
}

function onItemMouseLeave() {
  hideItemTooltip();
}

function onContextMenu(e) {
  e.preventDefault();
}

function onDragStart(e) {
  if (instanceId.value == null) {
    e.preventDefault();
    return;
  }
  hideItemTooltip();
  e.dataTransfer.effectAllowed = 'move';
  const payload = {
    instanceId: instanceId.value,
    from: { location: /** @type {'equipment'} */ ('equipment'), slot: props.slotKey },
  };
  itemsStore.setDragPayload(payload);
  e.dataTransfer.setData('application/x-planner-item', JSON.stringify(payload));
  e.dataTransfer.setData('text/plain', String(instanceId.value));
}

function onDragEnd() {
  itemsStore.clearDragPayload();
}

function parseDrag(e) {
  try {
    const raw = e.dataTransfer.getData('application/x-planner-item');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return itemsStore.dragPayload;
}

function canAcceptDrag(payload) {
  if (!payload?.from) return false;
  const defFor = itemsStore.getDefForInstance(payload.instanceId);
  if (!defFor) return false;
  return canEquipInSlot(defFor, props.slotKey, getCharacterInstance()?.className ?? null);
}

function onDragOver(e) {
  const types = e.dataTransfer.types;
  if (
    ![...types].includes('application/x-planner-item') &&
    ![...types].includes('text/plain') &&
    !itemsStore.dragPayload
  ) {
    return;
  }
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const payload = itemsStore.dragPayload;
  if (payload && canAcceptDrag(payload)) {
    dropState.value = 'accept';
  } else if (payload) {
    dropState.value = 'reject';
  } else {
    dropState.value = 'accept';
  }
}

function onDragLeave() {
  dropState.value = '';
}

function onDrop(e) {
  e.preventDefault();
  dropState.value = '';
  const payload = parseDrag(e);
  itemsStore.clearDragPayload();
  if (!payload?.from) return;
  if (!canAcceptDrag(payload)) {
    dropState.value = 'reject';
    setTimeout(() => {
      dropState.value = '';
    }, 200);
    return;
  }
  itemsStore.moveItem(payload.from, { location: 'equipment', slot: props.slotKey });
}
</script>

<template>
  <div
    class="planner-slot planner-slot--equipment"
    :class="{
      'planner-slot--active': isActive,
      'planner-slot--drop-accept': dropState === 'accept',
      'planner-slot--drop-reject': dropState === 'reject',
      'planner-slot--filled': !!def,
      'planner-slot--tiny': isTiny,
      'planner-slot--compact': isCompact,
    }"
    :style="slotStyle"
    :aria-label="def ? label + ': ' + def.name : label || undefined"
    role="button"
    tabindex="0"
    :draggable="instanceId != null"
    @click="onClick"
    @keydown.enter.prevent="onClick"
    @contextmenu="onContextMenu"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @mouseenter="onItemMouseEnter"
    @mousemove="onItemMouseMove"
    @mouseleave="onItemMouseLeave"
  >
    <span v-if="!def" class="planner-slot__empty-label">{{ label }}</span>
    <div v-if="def" class="planner-slot__item-visual" :style="itemVisualStyle">
      <ItemIcon
        :def="def"
        :icon="instanceId != null ? itemsStore.getIconForInstance(instanceId) : ''"
        fill
      />
    </div>
    <span v-if="def && rarityBadge" class="planner-slot__badge">{{ rarityBadge }}</span>
    <div
      v-if="def"
      class="planner-slot__meta"
      :class="'item-picker-modal__row--' + (def.rarity || 'normal')"
    >
      <span class="planner-slot__name-wrap">
        <span
          ref="nameEl"
          class="planner-slot__name item-picker-modal__row-name"
          :style="nameScale < 1 ? { transform: `scale(${nameScale})` } : undefined"
        >{{ def.name }}</span>
      </span>
      <span v-if="socketCount > 0" class="planner-slot__sockets" :aria-label="socketCount + ' sockets'">
        <span
          v-for="n in socketCount"
          :key="n"
          class="planner-slot__socket"
        ></span>
      </span>
    </div>
  </div>
</template>
