<script setup>
import { computed, ref } from 'vue';
import { useItemsStore } from '@/stores/items.js';
import CustomItemAffixPicker from './CustomItemAffixPicker.vue';
import ItemRollRow from './ItemRollRow.vue';
import {
  CUSTOM_JEWEL_RARITIES,
  normalizeCustomJewelRarity,
  socketableNameCssClass,
} from '@/items/socketables.js';
import {
  DEFAULT_ITEM_AFFIX_ILVL,
  JEWEL_AFFIX_BASE,
  parsePickedAffixes,
} from '@/items/item-affixes.js';
import { clampRoll } from '@/items/item-stats.js';
import {
  defaultJewelcraftRolls,
  jewelcraftOptionLabel,
  listJewelcraftPresets,
  listJewelcraftRollableStats,
  lookupJewelcraft,
  parseJewelcraftRolls,
} from '@/items/jewelcrafting.js';

const itemsStore = useItemsStore();
const name = ref('Custom Jewel');
const rarity = ref(/** @type {'magic'|'rare'|'crafted'} */ ('rare'));
const modifiers = ref(/** @type {string[]} */ ([]));
const ilvl = ref(DEFAULT_ITEM_AFFIX_ILVL);
const pickedAffixes = ref({ prefixes: [], suffixes: [] });
const jewelcraft = ref('');
const jewelcraftRolls = ref(/** @type {Record<string, number>} */ ({}));
const craftOpen = ref(false);
const editingId = ref('');
const craftPresets = listJewelcraftPresets();
const craftRow = computed(() => lookupJewelcraft(jewelcraft.value));
const craftStats = computed(() => listJewelcraftRollableStats(jewelcraft.value, jewelcraftRolls.value));

const jewels = computed(() => itemsStore.customJewels);

const jewelCustom = computed(() => ({
  quality: rarity.value,
  name: name.value,
  modifiers: modifiers.value,
  ilvl: ilvl.value,
  pickedAffixes: pickedAffixes.value,
}));

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

/**
 * @param {Record<string, unknown>} next
 */
function onCustomUpdate(next) {
  rarity.value = normalizeCustomJewelRarity(next?.quality);
  if (next?.name != null) name.value = String(next.name);
  modifiers.value = Array.isArray(next?.modifiers) ? next.modifiers.map(String) : [];
  ilvl.value = Number(next?.ilvl) || DEFAULT_ITEM_AFFIX_ILVL;
  pickedAffixes.value = parsePickedAffixes(next?.pickedAffixes);
}

function save() {
  const payload = {
    name: name.value,
    rarity: normalizeCustomJewelRarity(rarity.value),
    modifiers: modifiers.value,
    ilvl: ilvl.value,
    pickedAffixes: pickedAffixes.value,
    jewelcraft: rarity.value === 'crafted' ? jewelcraft.value : '',
    jewelcraftRolls: rarity.value === 'crafted' ? { ...jewelcraftRolls.value } : {},
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
  ilvl.value = DEFAULT_ITEM_AFFIX_ILVL;
  pickedAffixes.value = { prefixes: [], suffixes: [] };
  jewelcraft.value = '';
  jewelcraftRolls.value = {};
  craftOpen.value = false;
}

function edit(row) {
  editingId.value = row.id;
  name.value = row.name;
  rarity.value = normalizeCustomJewelRarity(row.rarity);
  modifiers.value = Array.isArray(row.modifiers) ? [...row.modifiers] : [];
  ilvl.value = Number(row.ilvl) || DEFAULT_ITEM_AFFIX_ILVL;
  pickedAffixes.value = parsePickedAffixes(row.pickedAffixes);
  jewelcraft.value = rarity.value === 'crafted' ? String(row.jewelcraft || '') : '';
  jewelcraftRolls.value =
    rarity.value === 'crafted'
      ? { ...defaultJewelcraftRolls(jewelcraft.value), ...parseJewelcraftRolls(row.jewelcraftRolls) }
      : {};
}

/**
 * @param {'magic'|'rare'|'crafted'} next
 */
function setRarity(next) {
  rarity.value = normalizeCustomJewelRarity(next);
  if (rarity.value !== 'crafted') {
    jewelcraft.value = '';
    jewelcraftRolls.value = {};
    craftOpen.value = false;
  }
}

/**
 * @param {string} id
 */
function selectCraft(id) {
  jewelcraft.value = id;
  jewelcraftRolls.value = defaultJewelcraftRolls(id);
  craftOpen.value = false;
}

function clearCraft() {
  jewelcraft.value = '';
  jewelcraftRolls.value = {};
}

/**
 * @param {{ key: string, min: number, max: number }} stat
 * @param {string|number} raw
 */
function setCraftRoll(stat, raw) {
  jewelcraftRolls.value = {
    ...jewelcraftRolls.value,
    [stat.key]: clampRoll(raw, stat.min, stat.max),
  };
  if (editingId.value) save();
}

/**
 * @param {{ key: string, min: number, max: number }} stat
 */
function craftRollValue(stat) {
  const n = Number(jewelcraftRolls.value[stat.key]);
  if (Number.isFinite(n)) return n;
  return clampRoll((stat.min + stat.max) / 2, stat.min, stat.max);
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
        @click="setRarity(row)"
      >
        {{ row.charAt(0).toUpperCase() + row.slice(1) }}
      </button>
    </div>
    <div v-if="rarity === 'crafted'" class="item-upgrade-section mb-2" aria-label="Jewelcrafting">
      <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">Jewelcrafting</p>
      <p class="item-upgrade-section__note is-size-7 has-text-grey mb-2">
        Catalyst of Jewelcrafting preset. Crafted jewels also roll random rare affixes below.
      </p>
      <div v-if="craftRow" class="item-upgrade-section__item">
        <div class="item-mo-editor__row">
          <span class="item-mo-editor__name">{{ jewelcraftOptionLabel(craftRow) }}</span>
          <button type="button" class="button is-small is-danger is-outlined" @click="clearCraft">
            Remove
          </button>
        </div>
        <div class="item-upgrade-section__mods">
          <ItemRollRow
            v-for="stat in craftStats"
            :key="stat.key"
            :stat="stat"
            :value="craftRollValue(stat)"
            @update="setCraftRoll(stat, $event)"
          />
        </div>
      </div>
      <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey">No catalyst preset selected.</p>
      <div class="item-sockets-editor__picker mt-2">
        <button type="button" class="item-sockets-editor__trigger" @click="craftOpen = !craftOpen">
          {{ craftOpen ? 'Hide list' : 'Browse presets' }}
        </button>
        <div v-if="craftOpen" class="item-sockets-editor__menu">
          <button
            v-for="row in craftPresets"
            :key="row.id"
            type="button"
            class="item-sockets-editor__option"
            @click="selectCraft(row.id)"
          >
            {{ jewelcraftOptionLabel(row) }}
          </button>
        </div>
      </div>
    </div>
    <CustomItemAffixPicker
      :custom="jewelCustom"
      :def="JEWEL_AFFIX_BASE"
      editable
      @update:custom="onCustomUpdate"
    />
    <div class="mt-2">
      <button type="button" class="button is-small is-link" @click="save">Save jewel</button>
      <button type="button" class="button is-small ml-1" @click="startNew">New jewel</button>
    </div>
  </div>
</template>
