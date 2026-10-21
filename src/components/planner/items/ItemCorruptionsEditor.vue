<script setup>
import { computed, ref } from 'vue';
import {
  corruptionRestrictionNote,
  corruptionSlotCount,
  getCorruptionBonusLines,
  listCorruptionCategories,
  listCorruptionsForItem,
  lookupCorruption,
  normalizeCorruptions,
  corruptionIcon,
} from '@/items/corruptions.js';
import { getItemIconUrl } from '@/shared/utils.js';

const props = defineProps({
  def: { type: Object, default: null },
  equipSlot: { type: String, default: '' },
  corruptions: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:corruptions']);

const open = ref(false);
const target = ref(0);
const category = ref('all');
const query = ref('');

const slots = computed(() => Math.max(1, corruptionSlotCount(props.def)));
const applied = computed(() => {
  const ids = normalizeCorruptions(props.corruptions);
  return Array.from({ length: slots.value }, (_, i) => ids[i] || '');
});

const categories = computed(() => listCorruptionCategories());
const crystalIconUrl = computed(() => getItemIconUrl(corruptionIcon()));
const options = computed(() => {
  const q = query.value.trim().toLowerCase();
  return listCorruptionsForItem(props.def, props.equipSlot, category.value).filter((row) => {
    if (!q) return true;
    return `${row.label} ${row.id}`.toLowerCase().includes(q);
  });
});

function setSlot(index, id) {
  const next = applied.value.slice();
  next[index] = id;
  emit('update:corruptions', next.filter(Boolean));
  open.value = false;
}

function clear(index) {
  const next = applied.value.slice();
  next[index] = '';
  emit('update:corruptions', next.filter(Boolean));
}
</script>

<template>
  <div class="item-upgrade-section" aria-label="Corruptions">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">Corruption</p>
    <div v-if="slots > 1 && editable" class="item-upgrade-section__mods mb-2">
      <button
        v-for="(_, idx) in applied"
        :key="'tgt-' + idx"
        type="button"
        class="button is-small mr-1"
        :class="{ 'is-link': target === idx }"
        @click="target = idx"
      >
        Corruption {{ idx + 1 }}
      </button>
    </div>
    <div v-for="(id, idx) in applied" :key="'corr-' + idx" class="item-upgrade-section__item">
      <template v-if="lookupCorruption(id)">
        <div class="item-mo-editor__row">
          <img v-if="crystalIconUrl" class="item-sockets-editor__icon" :src="crystalIconUrl" alt="" />
          <span class="item-mo-editor__name">{{ lookupCorruption(id).label }}</span>
          <button v-if="editable" type="button" class="button is-small is-danger is-outlined" @click="clear(idx)">
            Remove
          </button>
        </div>
        <div class="item-upgrade-section__mods">
          <div
            v-for="(line, i) in getCorruptionBonusLines(id)"
            :key="i"
            class="item-upgrade-section__mod"
          >
            {{ line }}
          </div>
        </div>
      </template>
      <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey">
        No corruption{{ slots > 1 ? ' ' + (idx + 1) : '' }}.
      </p>
    </div>
    <div v-if="editable" class="item-sockets-editor__picker mt-2">
      <button type="button" class="item-sockets-editor__trigger" @click="open = !open">
        {{ open ? 'Hide corruption list' : 'Browse corruptions' }}
      </button>
      <div v-if="open" class="item-sockets-editor__menu">
        <input v-model="query" class="input is-small mb-2" type="search" placeholder="Search corruptions..." />
        <div class="mb-2">
          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            class="button is-small mr-1 mb-1"
            :class="{ 'is-link': category === cat.id }"
            @click="category = cat.id"
          >
            {{ cat.label }}
          </button>
        </div>
        <button
          v-for="row in options"
          :key="row.id"
          type="button"
          class="item-sockets-editor__option"
          @click="setSlot(target, row.id)"
        >
          <img v-if="crystalIconUrl" class="item-sockets-editor__icon" :src="crystalIconUrl" alt="" />
          <span class="item-sockets-editor__option-text">
            <span>{{ row.label }}</span>
            <span v-if="row.restriction" class="item-sockets-editor__option-bonus">
              {{ corruptionRestrictionNote(row.restriction) }}
            </span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
