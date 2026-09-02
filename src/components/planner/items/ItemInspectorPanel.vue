<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  getItemDetailStatRows,
  mergeRollsForDef,
  clampRoll,
  ITEM_CATEGORY_LABEL,
} from '@/items/item-stats.js';
import { EQUIPMENT_SLOT_LABELS } from '@/items/item-types.js';
import { MAX_RELICS, isRelicItem } from '@/items/relic-items.js';
import { isCharmItem } from '@/items/charm-items.js';
import ItemDetailPanel from './ItemDetailPanel.vue';
import { getEffectivePlannerLevel, getCharacterInstance, runPlannerSkillStatRecompute, syncItemGrantedOSkills } from '@/character/planner-core.js';
import { refreshCurrentTooltip } from '@/tree/tree-tooltip.js';

function afterItemSkillSourcesChanged() {
  syncItemGrantedOSkills();
  refreshCurrentTooltip();
  runPlannerSkillStatRecompute();
}

const itemsStore = useItemsStore();
const { selectedSlot, editingInstanceId, isPickerOpen, enabledRelicCount } =
  storeToRefs(itemsStore);

/** @type {import('vue').Ref<Record<string, number>>} */
const rolls = ref({});

const instanceId = computed(() => editingInstanceId.value);

const isEnableListSlot = computed(() => {
  const loc = selectedSlot.value?.location;
  return loc === 'charms' || loc === 'relics';
});

const enableListKind = computed(() => {
  const loc = selectedSlot.value?.location;
  return loc === 'charms' || loc === 'relics' ? loc : null;
});

const selectedDefId = computed(() => {
  if (!isEnableListSlot.value || !selectedSlot.value) return null;
  const id = String(selectedSlot.value.slot || '');
  return id || null;
});

const isListItemEnabled = computed(() => {
  const kind = enableListKind.value;
  const defId = selectedDefId.value;
  if (!kind || !defId) return false;
  return itemsStore.isEnabled(kind, defId);
});

const canEnableListItem = computed(() => {
  if (isListItemEnabled.value) return true;
  if (enableListKind.value !== 'relics') return true;
  return enabledRelicCount.value < MAX_RELICS;
});

const itemDef = computed(() => {
  const id = instanceId.value;
  if (id != null) return itemsStore.getDefForInstance(id);
  // Preview catalog row when a disabled charm/relic is highlighted.
  if (isEnableListSlot.value) {
    const defId = selectedDefId.value;
    return defId ? (itemsStore.catalogById[defId] ?? null) : null;
  }
  return null;
});

const itemIcon = computed(() => {
  const id = instanceId.value;
  if (id != null) return itemsStore.getIconForInstance(id);
  return itemDef.value?.icon || '';
});

const className = computed(() => getCharacterInstance()?.className ?? null);

const rollOptions = computed(() => ({ className: className.value }));

const showActions = computed(() => itemDef.value != null);

const effectiveRolls = computed(() => {
  const def = itemDef.value;
  if (!def) return rolls.value;
  return mergeRollsForDef(def, rolls.value, rollOptions.value);
});

const detailStatRows = computed(() => {
  const def = itemDef.value;
  if (!def) return [];
  return getItemDetailStatRows(def, effectiveRolls.value, {
    characterLevel: getEffectivePlannerLevel(),
    charmInInventory: true,
    className: className.value,
  });
});

const slotLabel = computed(() => {
  const sel = selectedSlot.value;
  if (!sel) return '';
  if (sel.location === 'equipment') {
    return EQUIPMENT_SLOT_LABELS[String(sel.slot)] || String(sel.slot);
  }
  if (sel.location === 'charms') return 'Charms';
  if (sel.location === 'relics') return 'Relics';
  return 'Inventory';
});

const categoryLabel = computed(() => {
  const def = itemDef.value;
  if (!def) return slotLabel.value;
  return ITEM_CATEGORY_LABEL[def.category] || def.category || slotLabel.value;
});

const emptyText = computed(() => {
  if (isEnableListSlot.value) {
    return 'Select a charm or relic to view and edit rolls.';
  }
  return 'Select an equipped item to edit rolls.';
});

function loadRolls() {
  const id = instanceId.value;
  if (id != null) {
    const def = itemsStore.getDefForInstance(id);
    rolls.value = def
      ? mergeRollsForDef(def, itemsStore.getRollsForInstance(id), rollOptions.value)
      : {};
    return;
  }
  const def = itemDef.value;
  rolls.value = def ? mergeRollsForDef(def, null, rollOptions.value) : {};
}

// Only reload when the selected item changes — not on every def object touch.
// Keep local rolls when enabling/disabling the same charm/relic in place.
watch(
  [instanceId, () => itemDef.value?.id ?? null],
  (curr, prev) => {
    const [newId, newDefId] = curr;
    const prevId = prev?.[0] ?? null;
    const prevDefId = prev?.[1] ?? null;
    const sameDef = newDefId != null && newDefId === prevDefId;
    if (sameDef && prevId == null && newId != null && Object.keys(rolls.value).length) {
      const def = itemsStore.getDefForInstance(newId) || itemDef.value;
      const merged = def ? mergeRollsForDef(def, rolls.value, rollOptions.value) : rolls.value;
      rolls.value = merged;
      itemsStore.updateInstanceRolls(newId, { ...merged });
      if (def && (isRelicItem(def) || isCharmItem(def))) {
        afterItemSkillSourcesChanged();
      }
      return;
    }
    if (sameDef && prevId != null && newId == null) {
      // Disabled while still selected — keep current roll preview.
      return;
    }
    loadRolls();
  },
  { immediate: true }
);

/**
 * Update local rolls; persist only when an enabled instance exists.
 * @param {Record<string, number>} nextRolls
 */
function persistRolls(nextRolls) {
  const def = itemDef.value;
  const merged = def ? mergeRollsForDef(def, nextRolls, rollOptions.value) : nextRolls;
  rolls.value = merged;
  const id = instanceId.value;
  if (id == null) return;
  itemsStore.updateInstanceRolls(id, { ...merged });
  if (def && (isRelicItem(def) || isCharmItem(def))) {
    afterItemSkillSourcesChanged();
  }
}

/**
 * @param {string} key
 * @param {number} min
 * @param {number} max
 * @param {string|number} raw
 */
function setRoll(key, min, max, raw) {
  const nextVal = clampRoll(Number(raw), min, max);
  persistRolls({ ...rolls.value, [key]: nextVal });
}

/**
 * @param {Record<string, number>} next
 */
function onRollsUpdate(next) {
  persistRolls(next);
}

function onChangeItem() {
  if (isEnableListSlot.value) return;
  itemsStore.openPicker();
}

function onRemove() {
  if (selectedSlot.value) {
    itemsStore.removeItem(selectedSlot.value);
    itemsStore.clearSelection();
  }
}

function onToggleEnableListItem() {
  const kind = enableListKind.value;
  const defId = selectedDefId.value;
  if (!kind || !defId) return;
  if (isListItemEnabled.value) {
    if (kind === 'charms') itemsStore.toggleCharm(defId, false);
    else itemsStore.toggleRelic(defId, false);
  } else {
    if (!canEnableListItem.value) return;
    const seed = { ...rolls.value };
    if (kind === 'charms') itemsStore.toggleCharm(defId, true, seed);
    else itemsStore.toggleRelic(defId, true, seed);
  }
  if (kind === 'charms' || kind === 'relics') {
    afterItemSkillSourcesChanged();
  }
}

function onKeydown(e) {
  if (e.key !== 'Escape') return;
  if (isPickerOpen.value) return;
  if (instanceId.value != null || isEnableListSlot.value) {
    itemsStore.clearSelection();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <section class="planner-item-inspector" aria-labelledby="planner-item-inspector-title">
    <div class="planner-item-inspector__top">
      <h3 id="planner-item-inspector-title" class="planner-items-section-title">
        {{ itemDef ? categoryLabel : 'Item' }}
      </h3>
      <div v-if="showActions" class="planner-item-inspector__actions">
        <button
          v-if="!isEnableListSlot"
          type="button"
          class="button is-small"
          @click="onChangeItem"
        >
          Change
        </button>
        <button
          v-if="isEnableListSlot"
          type="button"
          class="button is-small"
          :class="isListItemEnabled ? 'is-danger is-outlined' : 'is-success is-outlined'"
          :disabled="!isListItemEnabled && !canEnableListItem"
          @click="onToggleEnableListItem"
        >
          {{ isListItemEnabled ? 'Disable' : 'Enable' }}
        </button>
        <button
          v-else
          type="button"
          class="button is-small is-danger is-outlined"
          @click="onRemove"
        >
          Remove
        </button>
      </div>
    </div>

    <ItemDetailPanel
      :def="itemDef"
      :icon="itemIcon"
      :rolls="rolls"
      :effective-rolls="effectiveRolls"
      :detail-stat-rows="detailStatRows"
      :empty-text="emptyText"
      @update:rolls="onRollsUpdate"
      @set-roll="setRoll"
    />
  </section>
</template>
