<script setup>
import { computed, ref } from 'vue';
import {
  affixSlotCaps,
  clampItemLevel,
  craftedAffixOddsLabel,
  DEFAULT_ITEM_AFFIX_ILVL,
  isJewelAffixBase,
  listAffixesForItem,
  lookupItemAffix,
  parsePickedAffixes,
} from '@/items/item-affixes.js';
import { syncCustomPickedAffixes } from '@/items/custom-items.js';

const props = defineProps({
  custom: { type: Object, default: () => ({ quality: 'rare', modifiers: [] }) },
  def: { type: Object, default: null },
  editable: { type: Boolean, default: false },
  listPicked: { type: Boolean, default: true },
});

const emit = defineEmits(['update:custom']);

const query = ref('');
const openKind = ref(/** @type {'prefix'|'suffix'|null} */ (null));

const quality = computed(() => String(props.custom?.quality || 'rare'));
const picked = computed(() => parsePickedAffixes(props.custom?.pickedAffixes));
const ilvl = computed(() => clampItemLevel(props.custom?.ilvl ?? DEFAULT_ITEM_AFFIX_ILVL));
const isJewel = computed(() => isJewelAffixBase(props.def));
const showIlvl = computed(() => isJewel.value || quality.value === 'crafted');
const caps = computed(() => affixSlotCaps(quality.value, props.def, ilvl.value));
const affixOdds = computed(() => {
  if (quality.value === 'crafted') return craftedAffixOddsLabel(ilvl.value);
  if (quality.value === 'rare' && isJewel.value) return 'Equal chance of 3 or 4 affixes';
  if (quality.value === 'rare') return '3-6 affixes, equal chance';
  return '';
});

const prefixRows = computed(() =>
  picked.value.prefixes.map((pick) => ({
    ...pick,
    properties: pick.properties || lookupItemAffix(pick.id)?.properties || pick.id,
  }))
);
const suffixRows = computed(() =>
  picked.value.suffixes.map((pick) => ({
    ...pick,
    properties: pick.properties || lookupItemAffix(pick.id)?.properties || pick.id,
  }))
);
const affixTotal = computed(() => prefixRows.value.length + suffixRows.value.length);

const canAddPrefix = computed(() => {
  if (prefixRows.value.length >= caps.value.maxPrefix) return false;
  return prefixRows.value.length + suffixRows.value.length < caps.value.maxTotal;
});
const canAddSuffix = computed(() => {
  if (suffixRows.value.length >= caps.value.maxSuffix) return false;
  return prefixRows.value.length + suffixRows.value.length < caps.value.maxTotal;
});

const candidates = computed(() => {
  if (!openKind.value) return [];
  return listAffixesForItem(props.def, {
    quality: quality.value,
    ilvl: ilvl.value,
    picked: picked.value,
    kind: openKind.value,
    query: query.value,
  }).slice(0, 80);
});

/**
 * @param {Record<string, unknown>} patch
 */
function emitCustom(patch) {
  const next = syncCustomPickedAffixes({ ...props.custom, ...patch }, props.def);
  emit('update:custom', next || { ...props.custom, ...patch });
}

/**
 * @param {import('@/items/item-affixes.js').ItemAffixDef} row
 */
function addAffix(row) {
  if (!row?.id || (row.kind !== 'prefix' && row.kind !== 'suffix')) return;
  const next = parsePickedAffixes(picked.value);
  const bucket = row.kind === 'suffix' ? next.suffixes : next.prefixes;
  bucket.push({ id: row.id, properties: row.properties });
  emitCustom({ pickedAffixes: next });
  query.value = '';
  openKind.value = null;
}

/**
 * @param {'prefix'|'suffix'} kind
 * @param {number} index
 */
function removeAffix(kind, index) {
  const next = parsePickedAffixes(picked.value);
  const bucket = kind === 'suffix' ? next.suffixes : next.prefixes;
  bucket.splice(index, 1);
  emitCustom({ pickedAffixes: next });
}

function toggleKind(kind) {
  openKind.value = openKind.value === kind ? null : kind;
  query.value = '';
}

/**
 * @param {string|number} raw
 */
function setIlvl(raw) {
  emitCustom({ ilvl: clampItemLevel(raw) });
}
</script>

<template>
  <div class="item-upgrade-section" aria-label="Rare affixes">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">Rare affixes</p>
    <label v-if="showIlvl && editable" class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">
      Item level
      <input
        class="input is-small mt-1"
        type="number"
        min="1"
        max="99"
        :value="ilvl"
        @change="setIlvl($event.target.value)"
      />
    </label>
    <p v-if="affixOdds" class="is-size-7 has-text-grey mb-2">{{ affixOdds }}</p>
    <p class="is-size-7 has-text-grey mb-2">
      Affixes {{ affixTotal }}/{{ caps.maxTotal }} · prefixes {{ prefixRows.length }}/{{
        caps.maxPrefix
      }}
      · suffixes {{ suffixRows.length }}/{{ caps.maxSuffix }}
    </p>

    <template v-if="listPicked">
      <p class="is-size-7 has-text-grey mb-1">Prefixes</p>
      <ul v-if="prefixRows.length" class="item-upgrade-section__list mb-2">
        <li v-for="(row, idx) in prefixRows" :key="'p-' + row.id + '-' + idx" class="item-upgrade-section__item">
          <div class="item-mo-editor__row">
            <span class="item-mo-editor__name">{{ row.properties }}</span>
            <button
              v-if="editable"
              type="button"
              class="item-picker-modal__roll-remove"
              aria-label="Remove prefix"
              @click="removeAffix('prefix', idx)"
            >
              ×
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey mb-2">No prefixes.</p>

      <p class="is-size-7 has-text-grey mb-1">Suffixes</p>
      <ul v-if="suffixRows.length" class="item-upgrade-section__list mb-2">
        <li v-for="(row, idx) in suffixRows" :key="'s-' + row.id + '-' + idx" class="item-upgrade-section__item">
          <div class="item-mo-editor__row">
            <span class="item-mo-editor__name">{{ row.properties }}</span>
            <button
              v-if="editable"
              type="button"
              class="item-picker-modal__roll-remove"
              aria-label="Remove suffix"
              @click="removeAffix('suffix', idx)"
            >
              ×
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey mb-2">No suffixes.</p>
    </template>

    <div v-if="editable" class="mt-2">
      <div class="item-affix-picker__actions">
        <button
          type="button"
          class="item-sockets-editor__trigger"
          :disabled="!canAddPrefix"
          @click="toggleKind('prefix')"
        >
          {{ openKind === 'prefix' ? 'Hide prefixes' : 'Add prefix' }}
        </button>
        <button
          type="button"
          class="item-sockets-editor__trigger"
          :disabled="!canAddSuffix"
          @click="toggleKind('suffix')"
        >
          {{ openKind === 'suffix' ? 'Hide suffixes' : 'Add suffix' }}
        </button>
      </div>
      <div v-if="openKind" class="item-sockets-editor__menu item-sockets-editor__menu--flow">
        <input
          v-model="query"
          class="input is-small mb-2"
          type="search"
          :placeholder="openKind === 'suffix' ? 'Search suffixes...' : 'Search prefixes...'"
        />
        <p v-if="!candidates.length" class="is-size-7 has-text-grey px-2">No matching affixes.</p>
        <button
          v-for="row in candidates"
          :key="row.id"
          type="button"
          class="item-sockets-editor__option"
          @click.stop="addAffix(row)"
        >
          <span class="item-sockets-editor__option-text">
            {{ row.properties }}
            <span class="item-sockets-editor__option-bonus">
              alvl {{ row.minAlvl }}-{{ row.maxAlvl }}
            </span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
