<script setup>
/**
 * Upgrade section tabs for the item inspector.
 */

/** @typedef {'base'|'sockets'|'mysticOrbs'|'oils'|'corruptions'|'effigies'} InspectorTabId */

/** @type {ReadonlyArray<{ id: InspectorTabId, label: string }>} */
const INSPECTOR_TABS = Object.freeze([
  { id: 'base', label: 'Base' },
  { id: 'sockets', label: 'Sockets' },
  { id: 'mysticOrbs', label: 'Orbs' },
  { id: 'oils', label: 'Oils' },
  { id: 'corruptions', label: 'Corrupt' },
  { id: 'effigies', label: 'Effigies' },
]);

const props = defineProps({
  modelValue: {
    type: String,
    default: 'base',
  },
});

const emit = defineEmits(['update:modelValue']);

/**
 * @param {InspectorTabId} id
 */
function selectTab(id) {
  if (id === props.modelValue) return;
  emit('update:modelValue', id);
}
</script>

<template>
  <div
    class="planner-item-inspector-tabs"
    role="tablist"
    aria-label="Item upgrade sections"
  >
    <button
      v-for="tab in INSPECTOR_TABS"
      :key="tab.id"
      type="button"
      role="tab"
      class="planner-item-inspector-tabs__tab"
      :class="{ 'is-active': modelValue === tab.id }"
      :aria-selected="modelValue === tab.id"
      @click="selectTab(tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
