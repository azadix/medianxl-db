<script setup>
import { onMounted, nextTick } from 'vue';
import { setupPlannerMinLevelSkillPoolTooltips } from '../../../character/planner-stats-panel.js';

onMounted(() => {
  nextTick(() => {
    setupPlannerMinLevelSkillPoolTooltips();
  });
});
</script>

<template>
  <div id="sidebarPaneOther">
    <h3 class="title is-5 mb-3">Character Info</h3>

    <div id="minLevelField" class="field">
      <p class="mb-1">
        <span id="minLevelDisplay" class="has-text-warning has-text-weight-bold is-size-5">Level 1</span>
      </p>
      <p id="minLevelHelp" class="help is-size-6 mb-0">
        <span id="minLevelSpentPart">0 spent</span>
        <span class="has-text-grey"> / </span>
        <span
          id="minLevelAvailPart"
          class="planner-skill-pool-tooltip-target has-text-grey"
          data-pool-base="0"
          data-pool-quest="0"
          data-pool-level="1"
          >0 available</span>
      </p>
      <hr class="my-1" />
    </div>

    <div class="field is-horizontal">
      <div class="field-label is-normal">
        <label class="label">Class</label>
      </div>
      <div class="field-body">
        <div class="field">
          <div class="control">
            <div class="select is-fullwidth">
              <select id="classSelect"></select>
            </div>
          </div>
        </div>
      </div>
      <hr class="my-1" />
    </div>

    <div class="field is-horizontal">
      <div class="field-label is-normal">
        <label class="label">+# to All Skills</label>
      </div>
      <div class="field-body">
        <div class="field">
          <div class="control">
            <input id="allSkillsBonus" type="number" class="input" min="0" value="0" placeholder="0" />
          </div>
        </div>
      </div>
    </div>

    <div id="oskillPanel" class="field is-horizontal" style="display: none">
      <div class="field-label is-normal">
        <label class="label">Add an oSkill</label>
      </div>
      <div class="field-body">
        <div class="field">
          <div id="oskill-dropdown" class="oskill-dropdown-wrapper"></div>
          <input id="oskill-hidden" type="hidden" />
        </div>
      </div>
    </div>

    <div id="devotionField" class="field is-horizontal" style="display: none">
      <div class="field-label is-normal">
        <label class="label">Devotion</label>
      </div>
      <div class="field-body">
        <div class="field">
          <div class="box has-background-dark p-2">
            <p id="devotionDisplay" class="has-text-centered has-text-weight-bold">None</p>
          </div>
        </div>
      </div>
    </div>
    <p class="is-size-7 has-text-grey mb-0">
      Skill points, class, and oSkills are edited here. Open <strong>Stats</strong> for the attribute sheet or
      <strong>Config</strong> for quest completion.
    </p>
  </div>
</template>
