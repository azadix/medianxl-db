<script setup>
import { computed, ref } from 'vue';
import {
  getOilBonusLines,
  listOilsForItem,
  lookupOil,
  oilIcon,
  oilKindLabel,
  oilSearchText,
} from '@/items/oils.js';
import { getItemIconUrl } from '@/shared/utils.js';

const props = defineProps({
  def: { type: Object, default: null },
  equipSlot: { type: String, default: '' },
  oil: { type: String, default: '' },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:oil']);

const open = ref(false);
const query = ref('');

const applied = computed(() => lookupOil(props.oil));
const options = computed(() => {
  const q = query.value.trim().toLowerCase();
  return listOilsForItem(props.def, props.equipSlot).filter((row) => {
    if (!q) return true;
    return oilSearchText(row).includes(q);
  });
});

const groupedOptions = computed(() => {
  /** @type {Record<string, ReturnType<typeof listOilsForItem>>} */
  const groups = {
    'Oil of Luck': [],
    'Oil of Conjuration': [],
    'Lottery bonus': [],
    'Failed oil': [],
    Other: [],
  };
  for (const row of options.value) {
    const key = oilKindLabel(row);
    (groups[key] || groups.Other).push(row);
  }
  return groups;
});

const lines = computed(() => getOilBonusLines(props.oil));

/**
 * @param {string|object|null|undefined} oil
 */
function iconUrl(oil) {
  return getItemIconUrl(oilIcon(oil));
}

function select(id) {
  emit('update:oil', id);
  open.value = false;
}

function clear() {
  emit('update:oil', '');
}
</script>

<template>
  <div class="item-upgrade-section" aria-label="Oil">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">Oil</p>
    <div v-if="applied" class="item-upgrade-section__item">
      <div class="item-mo-editor__row">
        <img v-if="iconUrl(applied)" class="item-sockets-editor__icon" :src="iconUrl(applied)" alt="" />
        <span class="item-mo-editor__name">{{ applied.label }}</span>
        <button v-if="editable" type="button" class="button is-small is-danger is-outlined" @click="clear">
          Remove
        </button>
      </div>
      <div v-if="lines.length" class="item-upgrade-section__mods">
        <div v-for="(line, i) in lines" :key="i" class="item-upgrade-section__mod">{{ line }}</div>
      </div>
    </div>
    <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey">No oil applied.</p>
    <div v-if="editable" class="item-sockets-editor__picker mt-2">
      <button type="button" class="item-sockets-editor__trigger" @click="open = !open">
        {{ open ? 'Hide oil list' : 'Browse oils' }}
      </button>
      <div v-if="open" class="item-sockets-editor__menu">
        <input v-model="query" class="input is-small mb-2" type="search" placeholder="Search oils..." />
        <template v-for="(groupRows, label) in groupedOptions" :key="label">
          <template v-if="groupRows.length">
            <div class="item-sockets-editor__group">{{ label }}</div>
            <button
              v-for="row in groupRows"
              :key="row.id"
              type="button"
              class="item-sockets-editor__option"
              :aria-selected="row.id === oil"
              @click="select(row.id)"
            >
              <img v-if="iconUrl(row)" class="item-sockets-editor__icon" :src="iconUrl(row)" alt="" />
              <span class="item-sockets-editor__option-text">
                <span>{{ row.label }}</span>
              </span>
            </button>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>
