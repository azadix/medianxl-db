<script setup>
import { computed } from 'vue';
import CustomAffixAdder from './CustomAffixAdder.vue';
import CustomItemAffixPicker from './CustomItemAffixPicker.vue';

const props = defineProps({
  custom: { type: Object, default: () => ({ quality: 'crafted', modifiers: [] }) },
  def: { type: Object, default: null },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:custom']);

const quality = computed(() => String(props.custom?.quality || 'crafted'));
const qualityLabel = computed(() => quality.value.charAt(0).toUpperCase() + quality.value.slice(1));
const usesRareAffixes = computed(() => {
  const q = quality.value;
  return q === 'magic' || q === 'rare' || q === 'crafted';
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
    <CustomItemAffixPicker
      v-if="usesRareAffixes"
      :custom="custom"
      :def="def"
      :editable="editable"
      :list-picked="false"
      @update:custom="emit('update:custom', $event)"
    />
    <CustomAffixAdder
      v-else
      :modifiers="modifiers"
      :editable="editable"
      @update:modifiers="patchCustom({ modifiers: $event })"
    />
  </div>
</template>
