<script setup>
/** @typedef {'overview'|'stats'|'config'} SidebarPane */

const props = defineProps({
  modelValue: { type: String, default: 'overview' },
});

const emit = defineEmits(['update:modelValue']);

/** @param {SidebarPane} pane */
function selectPane(pane) {
  emit('update:modelValue', pane);
}
</script>

<template>
  <div class="tabs is-toggle is-fullwidth mb-3 sidebar-view-tabs">
    <ul>
      <li id="sidebarTabOverviewLi" :class="{ 'is-active': props.modelValue === 'overview' }">
        <a id="sidebarTabOverview" href="#" @click.prevent="selectPane('overview')">
          <span>Overview</span>
        </a>
      </li>
      <li id="sidebarTabStatsLi" :class="{ 'is-active': props.modelValue === 'stats' }">
        <a id="sidebarTabStats" href="#" @click.prevent="selectPane('stats')">
          <span>Stats</span>
        </a>
      </li>
      <li id="sidebarTabConfigLi" :class="{ 'is-active': props.modelValue === 'config' }">
        <a id="sidebarTabConfig" href="#" @click.prevent="selectPane('config')">
          <span>Config</span>
        </a>
      </li>
    </ul>
  </div>
</template>
