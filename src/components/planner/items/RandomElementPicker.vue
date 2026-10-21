<script setup>
import {
  RANDOM_ELEMENT_LABELS,
  RANDOM_ELEMENTS,
  normalizeRandomElement,
} from '@/items/random-element.js';

const props = defineProps({
  modelValue: { type: String, default: 'fire' },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);

const selected = () => normalizeRandomElement(props.modelValue) || 'fire';
</script>

<template>
  <div class="item-upgrade-section" aria-label="Random element">
    <p class="item-upgrade-section__heading is-size-7 has-text-grey mb-1">Random element</p>
    <div class="buttons are-small mb-0" role="group" aria-label="Random element">
      <button
        v-for="row in RANDOM_ELEMENTS"
        :key="row"
        type="button"
        class="button"
        :class="{ 'is-link': selected() === row }"
        :disabled="disabled"
        @click="emit('update:modelValue', row)"
      >
        {{ RANDOM_ELEMENT_LABELS[row] }}
      </button>
    </div>
  </div>
</template>
