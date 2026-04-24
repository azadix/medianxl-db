<script setup>
import {
  plannerBackToMenuFromTree,
  plannerResetBuildClick,
  plannerSaveBuildClick,
  plannerSaveAsBuildClick,
  plannerExportBuildClick,
} from '../../../tree/tree-core.js';
</script>

<template>
  <div class="field mb-3">
    <div class="buttons has-addons is-fullwidth planner-toolbar-save-row">
      <button
        id="backToMenuBtn"
        class="button is-light is-outlined"
        type="button"
        @click="plannerBackToMenuFromTree"
      >
        ← Menu
      </button>
      <button
        id="saveBuildBtn"
        class="button is-success is-outlined"
        type="button"
        @click="plannerSaveBuildClick"
      >
        Save
      </button>
      <button
        id="saveAsBuildBtn"
        class="button is-success is-outlined"
        type="button"
        @click="plannerSaveAsBuildClick"
      >
        Save As
      </button>
      <button
        id="exportBuildBtn"
        class="button is-link is-outlined"
        type="button"
        @click="plannerExportBuildClick"
      >
        Export
      </button>
      <button
        id="resetBuildBtn"
        class="button is-danger is-outlined"
        type="button"
        @click="plannerResetBuildClick"
      >
        Reset
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Keep all six controls on one row in the narrow sidebar */
.planner-toolbar-save-row.buttons {
  flex-wrap: nowrap;
}
.planner-toolbar-save-row .button {
  flex: 1 1 0;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
