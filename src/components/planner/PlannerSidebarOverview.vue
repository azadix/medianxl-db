<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { usePlannerRevisionRefresh } from '../../composables/usePlannerRevisionRefresh.js';
import { setupPlannerMinLevelSkillPoolTooltips } from '@/character/planner-stats-panel.js';
import {
  getEffectivePlannerLevel,
  getSpentSkillPoints,
  getTotalQuestSkillPoints,
} from '@/character/character-state.js';
import Character from '@/character/Character.js';

const spentPoints = ref(0);
const effectiveLevel = ref(1);
const availablePoints = ref(0);

function refreshSummary() {
  spentPoints.value = getSpentSkillPoints();
  effectiveLevel.value = getEffectivePlannerLevel();
  availablePoints.value =
    Character.getBaseSkillPoints(effectiveLevel.value) + getTotalQuestSkillPoints(effectiveLevel.value);
}

function onRefresh() {
  nextTick(refreshSummary);
}

onMounted(() => {
  nextTick(() => {
    setupPlannerMinLevelSkillPoolTooltips();
    refreshSummary();
  });
});

usePlannerRevisionRefresh(onRefresh);
</script>

<template>
  <div id="sidebarPaneOther">
    <section class="planner-card planner-character-card">
      <div class="planner-character-card__body">
        <span class="planner-card__eyebrow">Character</span>
        <div class="select is-fullwidth">
          <select id="classSelect"></select>
        </div>
        <p class="planner-character-card__meta">
          <span>Level {{ effectiveLevel }}</span>
          <span>{{ spentPoints }} / {{ availablePoints }} points</span>
        </p>
      </div>
    </section>

    <section class="planner-card">
      <div class="planner-card-row">
        <div>
          <span class="planner-card__eyebrow">Skill bonuses</span>
          <label class="label mb-0" for="allSkillsBonus">+# to All Skills</label>
        </div>
        <input id="allSkillsBonus" type="number" class="input planner-compact-number" min="0" value="0" placeholder="0" />
      </div>
    </section>

    <section id="oskillPanel" class="planner-card planner-inline-card" style="display: none">
      <div class="planner-card-row">
        <div>
          <span class="planner-card__eyebrow">oSkills</span>
          <label class="label mb-0" for="oskill-hidden">Add an oSkill</label>
        </div>
        <div class="planner-card-control planner-oskill-control">
          <div id="oskill-dropdown" class="oskill-dropdown-wrapper"></div>
          <input id="oskill-hidden" type="hidden" />
        </div>
      </div>
    </section>

    <div id="devotionField" class="planner-card planner-inline-card" style="display: none">
      <div class="planner-card-row">
        <div>
          <span class="planner-card__eyebrow">Devotion</span>
          <label class="label mb-0">Current devotion</label>
        </div>
        <p id="devotionDisplay" class="planner-devotion-pill">None</p>
      </div>
    </div>
  </div>
</template>
