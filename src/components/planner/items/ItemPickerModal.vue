<script setup>
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  ITEM_CATEGORIES,
  canEquipInSlot,
  isUniquePickerItem,
  matchesItemPickerSearch,
} from '@/items/item-types.js';
import { isCharmItem } from '@/items/charm-items.js';
import { isRelicItem } from '@/items/relic-items.js';
import {
  getItemDetailStatRows,
  mergeRollsForDef,
  clampRoll,
} from '@/items/item-stats.js';
import { formatOverlayBadge } from '@/items/item-overlays.js';
import ItemDetailPanel from './ItemDetailPanel.vue';
import { getEffectivePlannerLevel, getCharacterInstance } from '@/character/planner-core.js';

const itemsStore = useItemsStore();
const { selectedSlot, isPickerOpen } = storeToRefs(itemsStore);

const search = ref('');
const category = ref('all');
/** @type {import('vue').Ref<HTMLInputElement|null>} */
const searchInput = ref(null);
/** @type {import('vue').Ref<string|null>} */
const previewId = ref(null);
/** @type {import('vue').Ref<Record<string, number>>} */
const rolls = ref({});

watch(isPickerOpen, async (open) => {
  if (open) {
    search.value = '';
    category.value = 'all';
    previewId.value = null;
    rolls.value = {};
    await nextTick();
    searchInput.value?.focus();
  }
});

/**
 * @param {object} item
 * @returns {boolean}
 */
function matchesCategory(item, cat) {
  if (cat === 'all') return !isCharmItem(item) && !isRelicItem(item);
  // Gear uniques only — charms/relics use dedicated enable lists
  if (cat === 'uniques') return isUniquePickerItem(item);
  if (cat === 'sets') return item.rarity === 'set';
  // Hide unique/set overlays from base weapon/armor/jewelry lists
  if (cat === 'weapons' || cat === 'armor' || cat === 'jewelry') {
    if (item.rarity === 'unique' || item.rarity === 'set') {
      return false;
    }
    if (isRelicItem(item) || isCharmItem(item)) return false;
    return item.category === cat;
  }
  return item.category === cat;
}

const filteredItems = computed(() => {
  let list = itemsStore.pickerCatalog.filter((d) => !isCharmItem(d) && !isRelicItem(d));
  if (category.value !== 'all') {
    list = list.filter((d) => matchesCategory(d, category.value));
  }
  const q = search.value.trim();
  if (q) {
    list = list.filter((d) => matchesItemPickerSearch(d, q));
  }
  return list;
});

const previewDef = computed(() => {
  if (!previewId.value) return null;
  return itemsStore.catalogById[previewId.value] ?? null;
});

const className = computed(() => getCharacterInstance()?.className ?? null);

const canEquipPreview = computed(() => {
  const def = previewDef.value;
  const sel = selectedSlot.value;
  if (!def || !sel) return false;
  if (isRelicItem(def) || isCharmItem(def)) return false;
  if (sel.location === 'equipment') {
    return canEquipInSlot(def, String(sel.slot), className.value);
  }
  return sel.location === 'inventory';
});

const rollOptions = computed(() => ({ className: className.value }));

const effectiveRolls = computed(() => {
  const def = previewDef.value;
  if (!def) return rolls.value;
  return mergeRollsForDef(def, rolls.value, rollOptions.value);
});

const detailStatRows = computed(() => {
  const def = previewDef.value;
  if (!def) return [];
  return getItemDetailStatRows(def, effectiveRolls.value, {
    characterLevel: getEffectivePlannerLevel(),
    charmInInventory: true,
    className: className.value,
  });
});

watch(filteredItems, (list) => {
  if (!previewId.value) return;
  if (!list.some((d) => d.id === previewId.value)) {
    previewId.value = null;
    rolls.value = {};
  }
});

watch(previewDef, (def) => {
  rolls.value = def ? mergeRollsForDef(def, null, rollOptions.value) : {};
});

const slotTitle = computed(() => {
  const sel = selectedSlot.value;
  if (!sel) return 'Select item';
  if (sel.location === 'equipment') return `Select item — ${sel.slot}`;
  return `Select item — inventory`;
});

/**
 * @param {object} item
 * @returns {string}
 */
function rowSubtitle(item) {
  const parts = [];
  if (item.baseName) parts.push(item.baseName);
  const badge = formatOverlayBadge(item.uniqueKind, item.tier);
  if (badge) parts.push(badge);
  if (item.setName) parts.push(item.setName);
  return parts.join(' · ');
}

/**
 * @param {string} defId
 */
function onSelect(defId) {
  previewId.value = defId;
}

/**
 * @param {string} key
 * @param {number} min
 * @param {number} max
 * @param {string|number} raw
 */
function setRoll(key, min, max, raw) {
  const next = clampRoll(Number(raw), min, max);
  rolls.value = { ...rolls.value, [key]: next };
}

/**
 * @param {string} [defId]
 */
function onEquip(defId) {
  const id = typeof defId === 'string' ? defId : previewId.value;
  if (!id) return;
  const def = itemsStore.catalogById[id];
  if (!def) return;
  const sel = selectedSlot.value;
  if (sel?.location === 'equipment' && !canEquipInSlot(def, String(sel.slot), className.value)) {
    return;
  }
  const nextRolls =
    previewId.value === id && Object.keys(rolls.value).length
      ? mergeRollsForDef(def, rolls.value, rollOptions.value)
      : mergeRollsForDef(def, null, rollOptions.value);
  previewId.value = id;
  rolls.value = nextRolls;
  itemsStore.equipFromPicker(id, nextRolls);
}

function onClear() {
  if (selectedSlot.value) {
    itemsStore.removeItem(selectedSlot.value);
    itemsStore.clearSelection();
  }
}

function onClose() {
  itemsStore.clearSelection();
}

function onKeydown(e) {
  if (e.key === 'Escape' && isPickerOpen.value) {
    onClose();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div
    v-if="isPickerOpen"
    id="itemPickerModal"
    class="modal is-active planner-export-modal item-picker-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="itemPickerModalTitle"
  >
    <div class="modal-background" @click="onClose"></div>
    <div class="modal-card item-picker-modal__card">
      <header class="modal-card-head planner-export-modal__head p-4">
        <span class="icon planner-export-modal__icon">
          <i class="fa-solid fa-box-open"></i>
        </span>
        <div class="planner-export-modal__title">
          <p id="itemPickerModalTitle" class="modal-card-title mb-0">{{ slotTitle }}</p>
          <p class="is-size-7 has-text-grey-light mb-0">
            Select an item, adjust rolls, then add it.
          </p>
        </div>
        <button type="button" class="delete" aria-label="Close" @click="onClose"></button>
      </header>

      <section class="modal-card-body item-picker-modal__body p-0">
        <div class="item-picker-modal__layout">
          <aside class="item-picker-modal__cats" aria-label="Categories">
            <button
              v-for="cat in ITEM_CATEGORIES"
              :key="cat.id"
              type="button"
              class="item-picker-modal__cat"
              :class="{ 'is-active': category === cat.id }"
              @click="category = cat.id"
            >
              {{ cat.name }}
            </button>
          </aside>

          <div class="item-picker-modal__main">
            <div class="item-picker-modal__search field mb-0">
              <div class="control has-icons-left">
                <input
                  ref="searchInput"
                  v-model="search"
                  class="input"
                  type="search"
                  placeholder="Search..."
                  autocomplete="off"
                  spellcheck="false"
                />
                <span class="icon is-left"><i class="fa-solid fa-magnifying-glass"></i></span>
              </div>
            </div>

            <ul class="item-picker-modal__list" role="listbox" aria-label="Items">
              <li v-if="filteredItems.length === 0" class="item-picker-modal__empty">
                No matching items
              </li>
              <li
                v-for="item in filteredItems"
                :key="item.id"
                class="item-picker-modal__row"
                :class="[
                  'item-picker-modal__row--' + (item.rarity || 'normal'),
                  { 'is-selected': previewId === item.id },
                ]"
                role="option"
                :aria-selected="previewId === item.id"
                tabindex="0"
                @click="onSelect(item.id)"
                @keydown.enter.prevent="onSelect(item.id)"
                @dblclick.prevent="onEquip(item.id)"
              >
                <span class="item-picker-modal__row-name">{{ item.name }}</span>
                <span v-if="rowSubtitle(item)" class="item-picker-modal__row-meta">{{
                  rowSubtitle(item)
                }}</span>
              </li>
            </ul>
          </div>

          <aside class="item-picker-modal__detail" aria-label="Item stats">
            <ItemDetailPanel
              :def="previewDef"
              :rolls="rolls"
              :effective-rolls="effectiveRolls"
              :detail-stat-rows="detailStatRows"
              @update:rolls="rolls = $event"
              @set-roll="setRoll"
            />
          </aside>
        </div>
      </section>

      <footer class="modal-card-foot planner-export-modal__foot p-4">
        <button type="button" class="button is-danger is-outlined" @click="onClear">
          Clear slot
        </button>
        <div class="item-picker-modal__foot-right">
          <button type="button" class="button" @click="onClose">Cancel</button>
          <button
            type="button"
            class="button is-link"
            :disabled="!previewDef || !canEquipPreview"
            @click="onEquip()"
          >
            Add item
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>
