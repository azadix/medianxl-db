<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  getItemSocketCount,
  getSocketableBonusLines,
  socketableHasRandomElementChoice,
  listJewelSocketablesFromItems,
  listSocketablesCatalog,
  normalizeCustomJewelRarity,
  normalizeSocketables,
  resolveSocketableIcon,
  socketableFromCatalogRow,
  socketableLibraryGroup,
  socketableNameCssClass,
} from '@/items/socketables.js';
import { useItemsStore } from '@/stores/items.js';
import { getItemIconUrl } from '@/shared/utils.js';
import { hideItemTooltip } from '@/items/item-tooltip-runtime.js';
import { hidePlannerSkillTooltip } from '@/tree/tree-tooltip.js';
import CustomJewelBuilder from './CustomJewelBuilder.vue';
import RandomElementPicker from './RandomElementPicker.vue';
import { normalizeRandomElement } from '@/items/random-element.js';

const props = defineProps({
  def: { type: /** @type {import('vue').PropType<object|null>} */ (Object), default: null },
  rolls: { type: /** @type {import('vue').PropType<Record<string, number>>} */ (Object), default: () => ({}) },
  socketables: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:socketables', 'set-roll']);

const itemsStore = useItemsStore();
const openIndex = ref(-1);
const chip = ref('all');
const showJewelBuilder = ref(false);

const SOCKET_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'Gem', label: 'Gems' },
  { id: 'Rune', label: 'Runes' },
  { id: 'Enhanced', label: 'Enhanced Runes' },
  { id: 'Elemental', label: 'Elemental Runes' },
  { id: 'Jewel', label: 'Jewels' },
];

const catalogGroups = computed(() => {
  /** @type {Record<string, import('@/items/socketables.js').SocketableCatalogRow[]>} */
  const groups = { Rune: [], Gem: [], Enhanced: [], Elemental: [], Jewel: [] };
  const jewelNames = new Set();
  for (const row of listSocketablesCatalog()) {
    const key = socketableLibraryGroup(row);
    groups[key].push(row);
    if (key === 'Jewel') jewelNames.add(String(row.name || '').toLowerCase());
  }
  for (const row of listJewelSocketablesFromItems(itemsStore.catalog)) {
    const name = String(row.name || '').toLowerCase();
    if (jewelNames.has(name)) continue;
    groups.Jewel.push(row);
    jewelNames.add(name);
  }
  for (const jewel of itemsStore.customJewels) {
    const rarity = normalizeCustomJewelRarity(jewel.rarity);
    groups.Jewel.push({
      name: jewel.name,
      type: 'Jewel',
      quality: rarity.charAt(0).toUpperCase() + rarity.slice(1),
      code: jewel.id,
      icon: 'jewl',
      modifiers: jewel.modifiers,
    });
  }
  groups.Jewel.sort((a, b) => a.name.localeCompare(b.name));
  if (chip.value === 'all') return groups;
  return { [chip.value]: groups[chip.value] || [] };
});

const filled = computed(() => normalizeSocketables(props.socketables));

const capacity = computed(() => Math.max(0, Math.floor(Number(props.def?.sockets) || 0)));

const slotCount = computed(() => getItemSocketCount(props.def, props.rolls));

const slots = computed(() => {
  const list = filled.value;
  return Array.from({ length: slotCount.value }, (_, i) => list[i] || null);
});

/**
 * @param {object|null|undefined} sock
 */
function catalogKey(sock) {
  if (!sock) return '';
  return [sock.type || '', sock.name || '', sock.quality || '', sock.code || ''].join('|');
}

/**
 * @param {import('@/items/socketables.js').SocketableCatalogRow} row
 */
function rowKey(row) {
  return [row.type || '', row.name || '', row.quality || '', row.code || ''].join('|');
}

/**
 * @param {{ name?: string, quality?: string }|null|undefined} entry
 */
function optionLabel(entry) {
  if (!entry?.name) return 'Empty';
  return entry.name;
}

/**
 * @param {object|null|undefined} entry
 */
function optionIconUrl(entry) {
  if (!entry) return '';
  return getItemIconUrl(resolveSocketableIcon(entry));
}

/**
 * @param {Array<object|null>} nextSlots
 */
function persist(nextSlots) {
  const next = nextSlots
    .filter(Boolean)
    .map((entry, i) => ({ ...entry, slot: i + 1 }));
  emit('update:socketables', next);
  const cap = capacity.value;
  if (cap > 0 && next.length > getItemSocketCount(props.def, props.rolls)) {
    emit('set-roll', 'sockets', 0, cap, next.length);
  }
}

/**
 * @param {number} index
 * @param {string} key
 */
function onSelect(index, key) {
  const next = slots.value.slice();
  if (!key) {
    next[index] = null;
    persist(next);
    openIndex.value = -1;
    return;
  }
  const row = Object.values(catalogGroups.value)
    .flat()
    .find((r) => rowKey(r) === key);
  next[index] = row ? socketableFromCatalogRow(row, index + 1) : null;
  persist(next);
  openIndex.value = -1;
}

/**
 * @param {number} index
 */
function dismissHoverTooltips() {
  hideItemTooltip(true);
  hidePlannerSkillTooltip(true);
}

function toggleOpen(index) {
  if (!props.editable) return;
  dismissHoverTooltips();
  openIndex.value = openIndex.value === index ? -1 : index;
}

/**
 * @param {MouseEvent} e
 */
function onDocClick(e) {
  const t = e.target;
  if (t instanceof Element && t.closest('.item-sockets-editor__picker')) return;
  openIndex.value = -1;
}

/**
 * @param {KeyboardEvent} e
 */
function onDocKey(e) {
  if (e.key === 'Escape') openIndex.value = -1;
}

onMounted(() => {
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onDocKey, true);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true);
  document.removeEventListener('keydown', onDocKey, true);
});

/**
 * @param {object|null|undefined} sock
 */
function sockMods(sock) {
  return sock ? getSocketableBonusLines(sock, props.def) : [];
}

/**
 * @param {object|null|undefined} sock
 */
function sockNeedsElement(sock) {
  return socketableHasRandomElementChoice(sock);
}

/**
 * @param {object|null|undefined} sock
 * @returns {string}
 */
function sockElement(sock) {
  return normalizeRandomElement(sock?.randomElement) || 'fire';
}

/**
 * @param {number} index
 * @param {string} element
 */
function setSockElement(index, element) {
  const next = slots.value.slice();
  const sock = next[index];
  if (!sock) return;
  next[index] = { ...sock, randomElement: normalizeRandomElement(element) || 'fire' };
  persist(next);
}
</script>

<template>
  <div class="item-upgrade-section" aria-label="Sockets">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">Sockets</p>
    <div v-if="editable && slotCount > 0" class="mb-2">
      <button
        v-for="row in SOCKET_CHIPS"
        :key="row.id"
        type="button"
        class="button is-small mr-1 mb-1"
        :class="{ 'is-link': chip === row.id }"
        @click="chip = row.id"
      >
        {{ row.label }}
      </button>
      <button type="button" class="button is-small mb-1" @click="showJewelBuilder = !showJewelBuilder">
        Manage custom jewels
      </button>
    </div>
    <CustomJewelBuilder v-if="showJewelBuilder && editable" class="mb-2" />
    <p v-if="slotCount < 1" class="item-upgrade-section__empty is-size-7 has-text-grey">
      This item has no sockets.
    </p>
    <ul v-else class="item-upgrade-section__list">
      <li v-for="(sock, idx) in slots" :key="'sock-slot-' + idx" class="item-sockets-editor__row">
        <div class="item-sockets-editor__controls">
          <span class="item-sockets-editor__index">{{ idx + 1 }}</span>
          <div class="item-sockets-editor__picker" @mousedown="dismissHoverTooltips">
            <button
              type="button"
              class="item-sockets-editor__trigger"
              :disabled="!editable"
              :aria-expanded="openIndex === idx"
              aria-haspopup="listbox"
              @click.stop="toggleOpen(idx)"
            >
              <img
                v-if="optionIconUrl(sock)"
                class="item-sockets-editor__icon"
                :src="optionIconUrl(sock)"
                alt=""
              />
              <span
                v-else
                class="item-sockets-editor__icon item-sockets-editor__icon--empty"
                aria-hidden="true"
              ></span>
              <span :class="sock ? socketableNameCssClass(sock) : 'item-sockets-editor__empty-label'">
                {{ optionLabel(sock) }}
              </span>
            </button>
            <div v-if="openIndex === idx" class="item-sockets-editor__menu" role="listbox">
              <button
                type="button"
                class="item-sockets-editor__option"
                role="option"
                :aria-selected="!sock"
                @click.stop="onSelect(idx, '')"
              >
                <span class="item-sockets-editor__icon item-sockets-editor__icon--empty" aria-hidden="true"></span>
                <span class="item-sockets-editor__empty-label">Empty</span>
              </button>
              <template v-for="(rows, label) in catalogGroups" :key="label">
                <template v-if="rows.length">
                  <div class="item-sockets-editor__group">{{ label }}</div>
                  <button
                    v-for="row in rows"
                    :key="rowKey(row)"
                    type="button"
                    class="item-sockets-editor__option"
                    role="option"
                    :aria-selected="catalogKey(sock) === rowKey(row)"
                    @click.stop="onSelect(idx, rowKey(row))"
                  >
                    <img
                      v-if="optionIconUrl(row)"
                      class="item-sockets-editor__icon"
                      :src="optionIconUrl(row)"
                      alt=""
                    />
                    <span
                      v-else
                      class="item-sockets-editor__icon item-sockets-editor__icon--empty"
                      aria-hidden="true"
                    ></span>
                    <span class="item-sockets-editor__option-text">
                      <span :class="socketableNameCssClass(row)">{{ optionLabel(row) }}</span>
                      <span
                        v-for="(mod, midx) in sockMods(row)"
                        :key="rowKey(row) + '-mod-' + midx"
                        class="item-sockets-editor__option-bonus"
                      >
                        {{ mod }}
                      </span>
                    </span>
                  </button>
                </template>
              </template>
            </div>
          </div>
        </div>
        <RandomElementPicker
          v-if="sock && sockNeedsElement(sock)"
          class="mt-2"
          :model-value="sockElement(sock)"
          :disabled="!editable"
          @update:model-value="setSockElement(idx, $event)"
        />
        <div v-if="sock && sockMods(sock).length" class="item-upgrade-section__mods">
          <div
            v-for="(mod, midx) in sockMods(sock)"
            :key="'sock-mod-' + idx + '-' + midx"
            class="item-upgrade-section__mod"
          >
            {{ mod }}
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
