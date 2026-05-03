<script setup>
import { onMounted, ref } from 'vue';
import {
  plannerMenuNewBuild,
  plannerMenuOpenLoadSection,
  plannerMenuImportBuild,
  plannerMenuOpenHelp,
} from '../../../tree/tree-core.js';
const knownIssuesLines = ref(/** @type {string[]} */ ([]));
const knownIssuesLoadError = ref('');
const knownIssuesFetched = ref(false);

onMounted(async () => {
  try {
    const url = new URL('known_issues.txt', window.location.origin + import.meta.env.BASE_URL).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    knownIssuesLines.value = text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    knownIssuesLoadError.value = 'Could not load known issues.';
  } finally {
    knownIssuesFetched.value = true;
  }
});
</script>

<template>
  <section id="menu-section">
    <div class="container" style="max-width: 600px; margin-top: 10vh">
      <div class="buttons is-flex is-flex-direction-column">
        <button id="menuNewBuildBtn" class="button is-large is-fullwidth" type="button" @click="plannerMenuNewBuild">
          <span class="icon-text">
            <span>New Build</span>
          </span>
        </button>

        <button
          id="menuImportBuildBtn"
          class="button is-large is-fullwidth"
          type="button"
          @click="plannerMenuImportBuild"
        >
          <span class="icon-text">
            <span>Import Build</span>
          </span>
        </button>

        <button
          id="menuLoadBuildBtn"
          class="button is-large is-fullwidth"
          type="button"
          @click="plannerMenuOpenLoadSection"
        >
          <span class="icon-text">
            <span>Load build</span>
          </span>
        </button>

        <button
          id="menuHelpBtn"
          class="button is-large is-fullwidth is-inverted is-info"
          type="button"
          @click="plannerMenuOpenHelp"
        >
          <span class="icon-text">
            <span>Help</span>
          </span>
        </button>
      </div>

      <div class="notification mt-4">
        <div class="has-text-danger has-text-weight-bold">Work in Progress Warning</div>
        <div class="has-text-danger mt-2">
          This skill planner is currently under development. Saved builds might not load properly or may be lost during updates. Please use with caution.
        </div>
      </div>

      <div class="notification mt-4">
        <div v-if="knownIssuesLoadError" class="has-text-danger">{{ knownIssuesLoadError }}</div>
        <div v-else-if="!knownIssuesFetched" class="has-text-grey">Loading known issues</div>
        <div v-else class="content has-text-danger mt-2">
          <div class="has-text-weight-bold mb-2">Known issues</div>
          <ul v-if="knownIssuesLines.length">
            <li v-for="(line, i) in knownIssuesLines" :key="i">{{ line }}</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
