<script setup>
import { computed } from 'vue';
import { getOverlayOptionalModifiers, hasOverlayExtras } from '@/items/item-overlays.js';

const props = defineProps({
  def: { type: /** @type {import('vue').PropType<object|null>} */ (Object), default: null },
  rolls: { type: /** @type {import('vue').PropType<Record<string, number>>} */ (Object), required: true },
});

const emit = defineEmits(['update:rolls']);

const showPanel = computed(() => hasOverlayExtras(props.def));
const optionals = computed(() => getOverlayOptionalModifiers(props.def));

/**
 * @param {Record<string, number>} patch
 */
function patchRolls(patch) {
  emit('update:rolls', { ...props.rolls, ...patch });
}

/**
 * @param {string} key
 * @param {boolean} checked
 */
function setChecked(key, checked) {
  patchRolls({ [key]: checked ? 1 : 0 });
}
</script>

<template>
  <div v-if="showPanel" class="overlay-extras-controls">
    <p class="overlay-extras-controls__heading is-size-7 has-text-grey mb-2">Item options</p>
    <div
      v-for="entry in optionals"
      :key="entry.key"
      class="overlay-extras-controls__group"
    >
      <label class="checkbox overlay-extras-controls__check">
        <input
          type="checkbox"
          :checked="Boolean(rolls[entry.key])"
          @change="setChecked(entry.key, $event.target.checked)"
        />
        {{ entry.text }}
      </label>
      <p class="overlay-extras-controls__hint is-size-7 has-text-grey">1/2 chance to appear</p>
    </div>
  </div>
</template>

<style scoped>
.overlay-extras-controls {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.overlay-extras-controls__heading {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.overlay-extras-controls__check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.overlay-extras-controls__hint {
  margin: 0.25rem 0 0 1.5rem;
}
</style>
