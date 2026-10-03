<script setup>
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import {
  ITEM_CATEGORIES,
  canEquipForClass,
  canEquipInSlot,
  equipBlockedReason,
  isRunewordPickerItem,
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
import {
  formatRunewordRecipe,
  isRunewordTemplate,
  listEligibleRunewordBases,
  mergeRunewordWithBase,
} from '@/items/runeword-items.js';
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
const baseSearch = ref('');
/** @type {import('vue').Ref<string|null>} */
const selectedBaseId = ref(null);

watch(isPickerOpen, async (open) => {
  if (open) {
    search.value = '';
    category.value = 'all';
    previewId.value = null;
    rolls.value = {};
    baseSearch.value = '';
    selectedBaseId.value = null;
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
  if (cat === 'runewords') return isRunewordPickerItem(item);
  // Hide unique/set/runeword overlays from base weapon/armor/jewelry lists
  if (cat === 'weapons' || cat === 'armor' || cat === 'jewelry') {
    if (item.rarity === 'unique' || item.rarity === 'set' || item.rarity === 'runeword') {
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

const previewTemplate = computed(() => {
  if (!previewId.value) return null;
  return itemsStore.catalogById[previewId.value] ?? null;
});

const className = computed(() => itemsStore.viewerClassName ?? getCharacterInstance()?.className ?? null);

const otherHandDef = computed(() => {
  const sel = selectedSlot.value;
  if (sel?.location !== 'equipment') return null;
  return itemsStore.otherHandDefForEquip(String(sel.slot));
});

/**
 * @param {object} def
 * @param {string} slot
 * @param {string|null|undefined} [cls]
 * @returns {boolean}
 */
function fitsEquipSlot(def, slot, cls) {
  return canEquipInSlot(def, slot, cls, {
    otherHandDef: otherHandDef.value,
    className: className.value,
  });
}

/**
 * @param {object|null|undefined} item
 * @returns {boolean}
 */
function canSelectPickerItem(item) {
  return canEquipForClass(item, className.value);
}

const eligibleBases = computed(() => {
  const template = previewTemplate.value;
  if (!isRunewordTemplate(template)) return [];
  const sel = selectedSlot.value;
  const equipSlot = sel?.location === 'equipment' ? String(sel.slot) : '';
  return listEligibleRunewordBases(template, itemsStore.catalog, {
    equipSlot: equipSlot || null,
    className: className.value,
    canEquipInSlot: equipSlot ? fitsEquipSlot : undefined,
  });
});

const filteredBases = computed(() => {
  const q = baseSearch.value.trim().toLowerCase();
  if (!q) return eligibleBases.value;
  return eligibleBases.value.filter((base) =>
    String(base.name || '')
      .toLowerCase()
      .includes(q)
  );
});

const previewDef = computed(() => {
  const template = previewTemplate.value;
  if (!template) return null;
  if (isRunewordTemplate(template) && selectedBaseId.value) {
    const base = itemsStore.catalogById[selectedBaseId.value];
    return mergeRunewordWithBase(template, base) || template;
  }
  return template;
});

const canEquipPreview = computed(() => {
  const def = previewDef.value;
  const sel = selectedSlot.value;
  if (!def || !sel) return false;
  if (isRelicItem(def) || isCharmItem(def)) return false;
  if (!canSelectPickerItem(previewTemplate.value)) return false;
  if (isRunewordTemplate(previewTemplate.value) && !selectedBaseId.value) return false;
  if (sel.location === 'equipment') {
    return fitsEquipSlot(def, String(sel.slot), className.value);
  }
  return sel.location === 'inventory';
});

const addBlockedReason = computed(() => {
  if (canEquipPreview.value) return '';
  const template = previewTemplate.value;
  const def = previewDef.value;
  const sel = selectedSlot.value;
  if (!def || !sel) return '';
  if (!canSelectPickerItem(template)) {
    return String(template.classRestriction || 'Not usable by this class.');
  }
  if (isRunewordTemplate(template) && !selectedBaseId.value) {
    return eligibleBases.value.length === 0
      ? 'No compatible bases for this class.'
      : 'Select a base item.';
  }
  if (sel.location === 'equipment') {
    return (
      equipBlockedReason(def, String(sel.slot), className.value, {
        otherHandDef: otherHandDef.value,
      }) || ''
    );
  }
  return '';
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
    selectedBaseId.value = null;
    baseSearch.value = '';
  }
});


watch([previewId, eligibleBases], () => {
  const template = previewTemplate.value;
  if (!isRunewordTemplate(template)) {
    selectedBaseId.value = null;
    baseSearch.value = '';
    return;
  }
  const bases = eligibleBases.value;
  if (!selectedBaseId.value || !bases.some((b) => b.id === selectedBaseId.value)) {
    selectedBaseId.value = bases[0]?.id ?? null;
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
  if (isRunewordTemplate(item)) {
    const recipe = formatRunewordRecipe(item);
    if (recipe) parts.push(recipe);
  } else {
    if (item.baseName) parts.push(item.baseName);
    const badge = formatOverlayBadge(item.uniqueKind, item.tier);
    if (badge) parts.push(badge);
    if (item.setName) parts.push(item.setName);
  }
  if (item.classRestriction) parts.push(item.classRestriction);
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
  const pickedId = typeof defId === 'string' ? defId : previewId.value;
  if (!pickedId) return;
  const picked = itemsStore.catalogById[pickedId];
  if (!picked) return;
  let id = pickedId;
  if (isRunewordTemplate(picked)) {
    const sel = selectedSlot.value;
    const equipSlot = sel?.location === 'equipment' ? String(sel.slot) : '';
    const bases = listEligibleRunewordBases(picked, itemsStore.catalog, {
      equipSlot: equipSlot || null,
      className: className.value,
      canEquipInSlot: equipSlot ? fitsEquipSlot : undefined,
    });
    const baseId =
      pickedId === previewId.value && selectedBaseId.value
        ? selectedBaseId.value
        : bases[0]?.id;
    if (!baseId) return;
    const mergedId = itemsStore.ensureRunewordDef(pickedId, baseId);
    if (!mergedId) return;
    id = mergedId;
  }
  const def = itemsStore.catalogById[id];
  if (!def) return;
  if (!canSelectPickerItem(picked) || !canEquipForClass(def, className.value)) return;
  const sel = selectedSlot.value;
  if (sel?.location === 'equipment' && !fitsEquipSlot(def, String(sel.slot), className.value)) {
    return;
  }
  const nextRolls = mergeRollsForDef(
    def,
    previewId.value === pickedId ? rolls.value : null,
    rollOptions.value
  );
  previewId.value = pickedId;
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
                  {
                    'is-selected': previewId === item.id,
                    'is-disabled': !canSelectPickerItem(item),
                  },
                ]"
                role="option"
                :aria-selected="previewId === item.id"
                :aria-disabled="!canSelectPickerItem(item)"
                :title="canSelectPickerItem(item) ? undefined : item.classRestriction || 'Not usable by this class'"
                tabindex="0"
                @click="onSelect(item.id)"
                @keydown.enter.prevent="onSelect(item.id)"
                @dblclick.prevent="canSelectPickerItem(item) && onEquip(item.id)"
              >
                <span class="item-picker-modal__row-name">{{ item.name }}</span>
                <span v-if="rowSubtitle(item)" class="item-picker-modal__row-meta">{{
                  rowSubtitle(item)
                }}</span>
              </li>
            </ul>
          </div>

          <aside class="item-picker-modal__detail" aria-label="Item stats">
            <div
              v-if="isRunewordTemplate(previewTemplate)"
              class="item-picker-modal__base-picker"
            >
              <label class="item-picker-modal__base-picker-label" for="runewordBaseSearch">
                Base item
              </label>
              <input
                id="runewordBaseSearch"
                v-model="baseSearch"
                class="input is-small"
                type="search"
                placeholder="Filter bases..."
                autocomplete="off"
                spellcheck="false"
              />
              <select
                v-model="selectedBaseId"
                class="item-picker-modal__base-select"
                aria-label="Runeword base"
              >
                <option v-if="filteredBases.length === 0" :value="null" disabled>
                  No compatible bases
                </option>
                <option v-for="base in filteredBases" :key="base.id" :value="base.id">
                  {{ base.name }} ({{ base.sockets || 0 }} sock)
                </option>
              </select>
            </div>
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
          <p v-if="addBlockedReason" class="item-picker-modal__add-reason" role="status">
            {{ addBlockedReason }}
          </p>
          <div class="item-picker-modal__foot-actions">
            <button type="button" class="button" @click="onClose">Cancel</button>
            <button
              type="button"
              class="button is-link"
              :disabled="!previewDef || !canEquipPreview"
              :title="addBlockedReason || undefined"
              @click="onEquip()"
            >
              Add item
            </button>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>
