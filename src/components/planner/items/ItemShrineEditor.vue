<script setup>
import { computed, ref } from 'vue';
import { getShrineBonusLines, listShrinesForItem, lookupShrine } from '@/items/blessings.js';

const props = defineProps({
  def: { type: Object, default: null },
  shrine: { type: String, default: '' },
  honorific: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:shrine']);

const open = ref(false);
const query = ref('');
const title = computed(() => (props.honorific ? 'Blessing' : 'Shrine'));
const applied = computed(() => lookupShrine(props.shrine));
const options = computed(() => {
  const q = query.value.trim().toLowerCase();
  return listShrinesForItem(props.def).filter((row) => !q || row.name.toLowerCase().includes(q));
});
const lines = computed(() => getShrineBonusLines(props.shrine, props.def, props.honorific));

function select(id) {
  emit('update:shrine', id);
  open.value = false;
}
</script>

<template>
  <div class="item-upgrade-section" :aria-label="title">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">{{ title }}</p>
    <div v-if="applied" class="item-upgrade-section__item">
      <div class="item-mo-editor__row">
        <span class="item-mo-editor__name">{{ applied.name }}</span>
        <button
          v-if="editable"
          type="button"
          class="button is-small is-danger is-outlined"
          @click="emit('update:shrine', '')"
        >
          Remove
        </button>
      </div>
      <div class="item-upgrade-section__mods">
        <div v-for="(line, i) in lines" :key="i" class="item-upgrade-section__mod">{{ line }}</div>
      </div>
    </div>
    <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey">No {{ title.toLowerCase() }} selected.</p>
    <div v-if="editable" class="item-sockets-editor__picker mt-2">
      <button type="button" class="item-sockets-editor__trigger" @click="open = !open">
        {{ open ? 'Hide list' : 'Browse ' + title.toLowerCase() + 's' }}
      </button>
      <div v-if="open" class="item-sockets-editor__menu">
        <input v-model="query" class="input is-small mb-2" type="search" :placeholder="'Search ' + title.toLowerCase() + 's...'" />
        <button
          v-for="row in options"
          :key="row.id"
          type="button"
          class="item-sockets-editor__option"
          @click="select(row.id)"
        >
          {{ row.name }}
        </button>
      </div>
    </div>
  </div>
</template>
