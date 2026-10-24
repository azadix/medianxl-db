<script setup>
/**
 * One rollable stat row: colored variable text + slider + number input.
 */
import { computed } from 'vue';
import { modifierColorCssClass } from '@/items/item-modifier-line.js';
import { wrapNestedSkillTooltipHtml } from '@/shared/tooltip-html.js';
import { escapeHtmlText, SCALING_DISPLAY_HTML_CLASSES } from '@/shared/utils.js';

const props = defineProps({
  /** @type {{ key: string, display: string, displayParts?: { kind: string, text: string, skillId?: string, skillLevel?: number|null }[], min: number, max: number, color?: string }} */
  stat: { type: Object, required: true },
  value: { type: Number, required: true },
  removable: { type: Boolean, default: false },
});

const emit = defineEmits(['update', 'remove']);

const colorClass = computed(() => modifierColorCssClass(props.stat?.color));

/**
 * @param {{ text?: string, skillId?: string, skillLevel?: number|null, skillAsProc?: boolean }} part
 * @returns {string}
 */
function skillPartHtml(part) {
  return wrapNestedSkillTooltipHtml(
    part?.skillId,
    escapeHtmlText(part?.text),
    SCALING_DISPLAY_HTML_CLASSES.skill,
    part?.skillLevel,
    part?.skillAsProc === true
  );
}

/**
 * @param {string|number} raw
 */
function onChange(raw) {
  emit('update', raw);
}
</script>

<template>
  <div
    class="item-picker-modal__roll-row"
    :class="[colorClass, { 'item-picker-modal__roll-row--removable': removable }]"
  >
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
        <!-- eslint-disable-next-line vue/no-v-html -- escaped nested skill markup -->
        <span v-else-if="part.kind === 'skill'" v-html="skillPartHtml(part)"></span>
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
    <button
      v-if="removable"
      type="button"
      class="item-picker-modal__roll-remove"
      aria-label="Remove affix"
      @click="emit('remove')"
    >
      ×
    </button>
  </div>
</template>
