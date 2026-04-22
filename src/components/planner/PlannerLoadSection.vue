<script setup>
import { plannerBackToMenuFromLoad } from '../../../tree/tree-core.js';
import PlannerSavedBuildsList from './PlannerSavedBuildsList.vue';
</script>

<template>
  <section id="load-section">
    <div class="container" style="margin-top: 5vh">
      <div class="field mb-4">
        <button
          id="backToMenuFromLoadBtn"
          class="button is-light is-outlined"
          type="button"
          @click="plannerBackToMenuFromLoad"
        >
          ← Back to Menu
        </button>
      </div>

      <h2 class="title is-3">Load Build</h2>

      <PlannerSavedBuildsList />
    </div>
  </section>
</template>
