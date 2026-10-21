<script setup>
import { computed } from 'vue';
import CustomAffixAdder from './CustomAffixAdder.vue';

const props = defineProps({
  custom: { type: Object, default: () => ({ quality: 'crafted', modifiers: [] }) },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:custom']);

const qualityLabel = computed(() => {
  const q = String(props.custom?.quality || 'crafted');
  return q.charAt(0).toUpperCase() + q.slice(1);
});

const modifiers = computed(() =>
  Array.isArray(props.custom?.modifiers) ? props.custom.modifiers : []
);

/**
 * @param {Record<string, unknown>} patch
 */
function patchCustom(patch) {
  emit('update:custom', { ...props.custom, ...patch });
}
</script>

<template>
  <div class="item-upgrade-section" aria-label="Custom item">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-2">{{ qualityLabel }} item</p>
    <input
      class="input is-small mb-2"
      type="text"
      :value="custom.name || ''"
      :disabled="!editable"
      placeholder="Item name"
      @change="patchCustom({ name: $event.target.value })"
    />
    <label class="is-size-7 has-text-grey">Required Level (base)</label>
    <input
      class="input is-small mb-2"
      type="number"
      min="0"
      :value="custom.reqLevel ?? ''"
      :disabled="!editable"
      placeholder="Catalog default"
      @change="patchCustom({ reqLevel: Number($event.target.value) || 0 })"
    />
    <CustomAffixAdder
      :modifiers="modifiers"
      :editable="editable"
      @update:modifiers="patchCustom({ modifiers: $event })"
    />
  </div>
</template>
