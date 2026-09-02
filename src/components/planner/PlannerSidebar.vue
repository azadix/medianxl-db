<script setup>
import PlannerSidebarOverview from './PlannerSidebarOverview.vue';

/** @typedef {'tree'|'items'|'other'} WorkspaceMode */

const props = defineProps({
  mode: { type: String, required: true },
});

const emit = defineEmits(['update:mode']);

const modes = [
  { id: 'tree', label: 'Tree', icon: 'fa-sitemap' },
  { id: 'items', label: 'Items', icon: 'fa-box' },
  { id: 'other', label: 'Character', icon: 'fa-sliders' },
];

/** @param {WorkspaceMode} mode */
function selectMode(mode) {
  emit('update:mode', mode);
}
</script>

<template>
  <div class="column sidebar-column">
    <div class="sidebar-column-inner">
      <div class="tabs is-toggle is-fullwidth mb-3 planner-workspace-tabs">
        <ul>
          <li
            v-for="m in modes"
            :key="m.id"
            :class="{ 'is-active': props.mode === m.id }"
          >
            <a href="#" @click.prevent="selectMode(m.id)">
              <span class="icon is-small"><i class="fa-solid" :class="m.icon"></i></span>
              <span>{{ m.label }}</span>
            </a>
          </li>
        </ul>
      </div>
      <div class="sidebar-pane-scroll pr-2">
        <PlannerSidebarOverview />
      </div>
    </div>
  </div>
</template>
