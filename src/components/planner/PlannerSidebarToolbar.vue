<script setup>
import {
  plannerBackToMenuFromTree,
  plannerResetBuildClick,
  plannerSaveBuildClick,
  plannerSaveAsBuildClick,
} from '../../../tree/tree-core.js';
</script>

<template>
  <div class="field mb-3">
    <div class="buttons has-addons is-fullwidth">
      <button
        id="backToMenuBtn"
        class="button is-light is-outlined"
        type="button"
        style="flex: 1"
        @click="plannerBackToMenuFromTree"
      >
        ← Menu
      </button>
      <button
        id="saveBuildBtn"
        class="button is-success is-outlined"
        type="button"
        style="flex: 1; display: none"
        @click="plannerSaveBuildClick"
      >
        Save
      </button>
      <button
        id="saveAsBuildBtn"
        class="button is-success is-outlined"
        type="button"
        style="flex: 1"
        @click="plannerSaveAsBuildClick"
      >
        Save As
      </button>
      <button
        id="resetBuildBtn"
        class="button is-danger is-outlined"
        type="button"
        style="flex: 1"
        @click="plannerResetBuildClick"
      >
        Reset
      </button>
    </div>
  </div>
</template>
