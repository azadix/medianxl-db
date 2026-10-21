<script setup>
import { computed, ref } from 'vue';
import { getOilBonusLines, listOilsForItem, lookupOil, oilIcon } from '@/items/oils.js';
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
    return `${row.label} ${row.id}`.toLowerCase().includes(q);
  });
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
        <button
          v-for="row in options"
          :key="row.id"
          type="button"
          class="item-sockets-editor__option"
          :aria-selected="row.id === oil"
          @click="select(row.id)"
        >
          <img v-if="iconUrl(row)" class="item-sockets-editor__icon" :src="iconUrl(row)" alt="" />
          <span class="item-sockets-editor__option-text">
            <span>{{ row.label }}</span>
            <span v-if="row.oilKind === 'lottery' || row.requiresUnique" class="item-sockets-editor__option-bonus">Lottery</span>
            <span v-else-if="row.oilKind === 'luck'" class="item-sockets-editor__option-bonus">Luck</span>
            <span v-else-if="row.oilKind === 'conjuration'" class="item-sockets-editor__option-bonus">Conjuration</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
