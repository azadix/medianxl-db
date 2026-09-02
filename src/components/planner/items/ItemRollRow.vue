<script setup>
/**
 * One rollable stat row: colored variable text + slider + number input.
 */
defineProps({
  /** @type {{ key: string, display: string, displayParts?: { kind: string, text: string }[], min: number, max: number }} */
  stat: { type: Object, required: true },
  value: { type: Number, required: true },
});

const emit = defineEmits(['update']);

/**
 * @param {string|number} raw
 */
function onChange(raw) {
  emit('update', raw);
}
</script>

<template>
  <div class="item-picker-modal__roll-row">
    <span class="item-picker-modal__roll-display">
      <template
        v-for="(part, i) in stat.displayParts?.length
          ? stat.displayParts
          : [{ kind: 'text', text: stat.display }]"
        :key="i"
      >
        <span v-if="part.kind === 'value'" class="item-picker-modal__roll-value">{{
          part.text
        }}</span>
        <span v-else-if="part.kind === 'skill'" class="has-text-success">{{ part.text }}</span>
        <template v-else>{{ part.text }}</template>
      </template>
    </span>
    <div class="item-picker-modal__roll-controls">
      <input
        class="item-picker-modal__roll-slider"
        type="range"
        :min="stat.min"
        :max="stat.max"
        :step="Number.isInteger(stat.min) && Number.isInteger(stat.max) ? 1 : 0.1"
        :value="value"
        @input="onChange($event.target.value)"
      />
      <input
        class="input item-picker-modal__roll-input"
        type="number"
        :min="stat.min"
        :max="stat.max"
        :step="Number.isInteger(stat.min) && Number.isInteger(stat.max) ? 1 : 0.1"
        :value="value"
        @change="onChange($event.target.value)"
      />
    </div>
  </div>
</template>
