<script setup>
import { computed, ref } from 'vue';
import {
  formatAffixLabel,
  listAffixCategories,
  listAffixTemplates,
} from '@/items/affix-templates.js';

const props = defineProps({
  modifiers: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modifiers']);

const query = ref('');
const category = ref('all');
const open = ref(true);

const categories = computed(() => listAffixCategories());
const templates = computed(() => {
  const q = query.value.trim().toLowerCase();
  return listAffixTemplates().filter((row) => {
    if (category.value !== 'all' && row.category !== category.value) return false;
    if (!q) return true;
    return `${row.label} ${row.id}`.toLowerCase().includes(q);
  });
});

/**
 * @param {string} line
 * @returns {{ text: string, value: number|null }}
 */
function parseLine(line) {
  const text = String(line || '');
  const m = text.match(/-?\d+(?:\.\d+)?/);
  return { text, value: m ? Number(m[0]) : null };
}

function addTemplate(row) {
  const line = formatAffixLabel(row.label, row.type === 'special' ? null : 1);
  emit('update:modifiers', [...props.modifiers, line]);
}

function removeAt(index) {
  emit(
    'update:modifiers',
    props.modifiers.filter((_, i) => i !== index)
  );
}

function setValue(index, raw) {
  const current = parseLine(props.modifiers[index]);
  const n = Number(raw);
  if (!Number.isFinite(n) || current.value == null) return;
  const next = current.text.replace(/-?\d+(?:\.\d+)?/, String(n));
  const copy = props.modifiers.slice();
  copy[index] = next;
  emit('update:modifiers', copy);
}
</script>

<template>
  <div class="item-upgrade-section" aria-label="Affixes">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">Item properties</p>
    <ul v-if="modifiers.length" class="item-upgrade-section__list">
      <li v-for="(line, idx) in modifiers" :key="idx" class="item-upgrade-section__item">
        <div class="item-mo-editor__row">
          <input
            v-if="editable && parseLine(line).value != null"
            class="input item-picker-modal__roll-input"
            type="number"
            :value="parseLine(line).value"
            @change="setValue(idx, $event.target.value)"
          />
          <span class="item-mo-editor__name">{{ line }}</span>
          <button v-if="editable" type="button" class="button is-small is-danger is-outlined" @click="removeAt(idx)">
            Remove
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="item-upgrade-section__empty is-size-7 has-text-grey">No affixes yet.</p>
    <div v-if="editable" class="mt-2">
      <button type="button" class="item-sockets-editor__trigger" @click="open = !open">
        {{ open ? 'Hide affix list' : 'Add affix' }}
      </button>
      <div v-if="open" class="item-sockets-editor__menu">
        <input v-model="query" class="input is-small mb-2" type="search" placeholder="Search affixes..." />
        <button
          type="button"
          class="button is-small mr-1 mb-1"
          :class="{ 'is-link': category === 'all' }"
          @click="category = 'all'"
        >
          All
        </button>
        <button
          v-for="cat in categories"
          :key="cat"
          type="button"
          class="button is-small mr-1 mb-1"
          :class="{ 'is-link': category === cat }"
          @click="category = cat"
        >
          {{ cat }}
        </button>
        <button
          v-for="row in templates"
          :key="row.id"
          type="button"
          class="item-sockets-editor__option"
          @click="addTemplate(row)"
        >
          {{ row.label }}
        </button>
      </div>
    </div>
  </div>
</template>
