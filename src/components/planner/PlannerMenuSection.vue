<script setup>
import {
  plannerMenuNewBuild,
  plannerMenuOpenLoadSection,
  plannerMenuImportBuild,
  plannerMenuOpenHelp,
} from '../../../tree/tree-core.js';
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
        <div class="has-text-danger mt-2">
          <div class="has-text-danger has-text-weight-bold">Known issues:</div>
          <ul>
            <li>- Many skills are missing descriptions</li>
            <li>- Skill damage and most of mana cost formulas are not implemented</li>
            <li>- War Spirit synergies based on devotion are not filled in</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
