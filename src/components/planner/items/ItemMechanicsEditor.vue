<script setup>
import { computed } from 'vue';
import {
  getMechanicBonusLines,
  restoreMechanicForDef,
  restorePercent,
} from '@/items/item-mechanics.js';

const props = defineProps({
  def: { type: Object, default: null },
  mechanics: { type: Object, default: () => ({}) },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:mechanics']);

const restore = computed(() => restoreMechanicForDef(props.def));
const applications = computed(() => Math.floor(Number(props.mechanics?.restore) || 0));
const percent = computed(() => (restore.value ? restorePercent(restore.value, applications.value) : 0));
const lines = computed(() => getMechanicBonusLines(props.def, props.mechanics));

function setRestore(raw) {
  if (!restore.value) return;
  let n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) n = 0;
  n = Math.max(0, Math.min(restore.value.maxApplications, n));
  emit('update:mechanics', { ...props.mechanics, restore: n });
}
</script>

<template>
  <div class="item-upgrade-section" aria-label="Item mechanics">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">
      {{ restore?.label || 'Mechanics' }}
    </p>
    <div v-if="restore" class="item-mo-editor__row mb-2">
      <span class="item-mo-editor__name">Restore +{{ percent }}%</span>
      <input
        v-if="editable"
        class="input item-picker-modal__roll-input"
        type="number"
        min="0"
        :max="restore.maxApplications"
        :value="applications"
        @change="setRestore($event.target.value)"
      />
    </div>
    <p v-if="restore?.hint" class="is-size-7 has-text-grey mb-2">{{ restore.hint }}</p>
    <div class="item-upgrade-section__mods">
      <div v-for="(line, i) in lines" :key="i" class="item-upgrade-section__mod">{{ line }}</div>
    </div>
    <p v-if="!restore" class="item-upgrade-section__empty is-size-7 has-text-grey">No mechanics on this item.</p>
  </div>
</template>
