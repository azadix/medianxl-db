<script setup>
import { computed, ref } from 'vue';
import { useItemsStore } from '@/stores/items.js';
import CustomAffixAdder from './CustomAffixAdder.vue';
import {
  CUSTOM_JEWEL_RARITIES,
  normalizeCustomJewelRarity,
  socketableNameCssClass,
} from '@/items/socketables.js';

const itemsStore = useItemsStore();
const name = ref('Custom Jewel');
const rarity = ref(/** @type {'magic'|'rare'|'crafted'} */ ('rare'));
const modifiers = ref(/** @type {string[]} */ ([]));
const editingId = ref('');

const jewels = computed(() => itemsStore.customJewels);

/**
 * @param {{ name?: string, rarity?: string }} row
 */
function nameClass(row) {
  const quality = normalizeCustomJewelRarity(row?.rarity);
  return socketableNameCssClass({ type: 'Jewel', quality });
}

/**
 * @param {string} quality
 * @returns {string}
 */
function rarityColor(quality) {
  const key = normalizeCustomJewelRarity(quality);
  if (key === 'magic') return 'var(--item-rarity-magic)';
  if (key === 'crafted') return 'var(--item-rarity-crafted)';
  return 'var(--item-rarity-rare)';
}

function save() {
  const payload = {
    name: name.value,
    rarity: normalizeCustomJewelRarity(rarity.value),
    modifiers: modifiers.value,
  };
  if (editingId.value) {
    itemsStore.updateCustomJewel(editingId.value, payload);
    return;
  }
  editingId.value = itemsStore.addCustomJewel(payload);
}

function startNew() {
  editingId.value = '';
  name.value = 'Custom Jewel';
  rarity.value = 'rare';
  modifiers.value = [];
}

function edit(row) {
  editingId.value = row.id;
  name.value = row.name;
  rarity.value = normalizeCustomJewelRarity(row.rarity);
  modifiers.value = [...row.modifiers];
}

function remove(id) {
  itemsStore.removeCustomJewel(id);
  if (editingId.value === id) startNew();
}
</script>

<template>
  <div class="item-upgrade-section" aria-label="Custom jewels">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">Custom jewels</p>
    <ul v-if="jewels.length" class="item-upgrade-section__list mb-2">
      <li v-for="row in jewels" :key="row.id" class="item-upgrade-section__item">
        <div class="item-mo-editor__row">
          <span class="item-mo-editor__name" :class="nameClass(row)">{{ row.name }}</span>
          <button type="button" class="button is-small" @click="edit(row)">Edit</button>
          <button type="button" class="button is-small is-danger is-outlined" @click="remove(row.id)">
            Remove
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey mb-2">No custom jewels yet.</p>
    <input v-model="name" class="input is-small mb-2" type="text" placeholder="Jewel name" />
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-1">Rarity</p>
    <div class="buttons are-small mb-2" role="group" aria-label="Jewel rarity">
      <button
        v-for="row in CUSTOM_JEWEL_RARITIES"
        :key="row"
        type="button"
        class="button"
        :class="[{ 'is-link': rarity === row }, nameClass({ rarity: row })]"
        :style="{ color: rarityColor(row) }"
        @click="rarity = row"
      >
        {{ row.charAt(0).toUpperCase() + row.slice(1) }}
      </button>
    </div>
    <CustomAffixAdder v-model:modifiers="modifiers" editable />
    <div class="mt-2">
      <button type="button" class="button is-small is-link" @click="save">Save jewel</button>
      <button type="button" class="button is-small ml-1" @click="startNew">New jewel</button>
    </div>
  </div>
</template>
