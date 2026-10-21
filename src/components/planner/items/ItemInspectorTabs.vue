<script setup>
/**
 * Upgrade section tabs for the item inspector.
 */

/** @typedef {'base'|'sockets'|'mysticOrbs'|'oils'|'corruptions'|'effigies'|'blessing'|'shrine'|'mechanics'} InspectorTabId */

const props = defineProps({
  modelValue: {
    type: String,
    default: 'base',
  },
  tabs: {
    type: Array,
    default: () => [
      { id: 'base', label: 'Base' },
      { id: 'sockets', label: 'Sockets' },
      { id: 'mysticOrbs', label: 'Orbs' },
    ],
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
      v-for="tab in tabs"
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
